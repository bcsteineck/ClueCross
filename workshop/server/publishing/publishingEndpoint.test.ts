import { describe, expect, it } from 'vitest'
import { MemoryPublicationStore } from './memoryPublicationStore'
import { parsePublishRequest } from './parsePublishRequest'
import { PublicationContentionError } from './publicationStore'
import { handlePreviewRequest, handlePublishRequest } from './publishingEndpoint'
import { NOON_SEPT_30, batsRequest, catsRequest, publicationFor } from './testFixtures'

const SECRET_LIKE = 'postgres://publisher:s3cret-value@db.internal:5432/cluecross'

// Round-trips through JSON, as the transport will deliver it.
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value))

function expectSanitized(body: unknown) {
  const text = JSON.stringify(body)
  expect(text).not.toMatch(/s3cret|postgres:|db\.internal|ECONNREFUSED|\bstack\b|at .*\.ts:\d+/)
}

describe('parsePublishRequest', () => {
  it('accepts a well-formed request and returns a clean copy', () => {
    const parsed = parsePublishRequest(wire({ ...catsRequest(), extra: true }))
    expect(parsed).toEqual({ ok: true, request: catsRequest() })
  })

  it('rejects malformed shapes with a specific message', () => {
    const valid = wire(catsRequest()) as Record<string, unknown>
    const construction = valid.construction as Record<string, unknown>
    const cases: [unknown, string][] = [
      [null, 'Request body must be an object.'],
      [[], 'Request body must be an object.'],
      ['{}', 'Request body must be an object.'],
      [{ ...valid, construction: undefined }, 'construction must be an object.'],
      [{ ...valid, id: 7 }, 'id must be a string.'],
      [{ ...valid, clue: null }, 'clue must be a string.'],
      [{ ...valid, construction: { ...construction, ok: false } }, 'construction must be a successful construction.'],
      [{ ...valid, construction: { ...construction, placedAnswers: {} } }, 'construction.placedAnswers must be an array.'],
      [
        { ...valid, construction: { ...construction, placedAnswers: [{ word: 'CAT', direction: 'diagonal', start: { x: 0, y: 0 } }] } },
        'construction.placedAnswers[0].direction must be "across" or "down".',
      ],
      [{ ...valid, construction: { ...construction, positions: { r0c0: { x: '0', y: 0 } } } }, 'construction.positions.r0c0.x must be an integer.'],
      [{ ...valid, construction: { ...construction, width: 2.5 } }, 'construction.width must be an integer.'],
      [{ ...valid, construction: { ...construction, cells: { r0c0: 7 } } }, 'construction.cells.r0c0 must be a string.'],
    ]
    for (const [body, message] of cases) {
      expect(parsePublishRequest(body), message).toEqual({ ok: false, message })
    }
  })

  it('rejects prototype-altering keys', () => {
    const body = JSON.parse(
      '{"id":"cats","clue":"Cats","construction":{"ok":true,"placedAnswers":[],"cells":{"__proto__":"X"},"positions":{},"width":1,"height":1,"attemptsUsed":1}}',
    )
    expect(parsePublishRequest(body)).toEqual({ ok: false, message: 'construction.cells has an invalid key.' })
  })
})

describe('handlePublishRequest', () => {
  it('maps a malformed body to 400 bad-request, before needing a store', async () => {
    const result = await handlePublishRequest({ id: 'cats' }, { store: undefined })
    expect(result).toEqual({ status: 400, body: { status: 'bad-request', message: 'construction must be an object.' } })
  })

  it('maps a missing store to 503 not-configured', async () => {
    const result = await handlePublishRequest(wire(catsRequest()), { store: undefined })
    expect(result).toEqual({
      status: 503,
      body: { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' },
    })
  })

  it('maps validation failure to 422 invalid with grouped errors, writing nothing', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const result = await handlePublishRequest(wire(catsRequest({ id: 'Cats!' })), { store })
    expect(result.status).toBe(422)
    expect(result.body).toMatchObject({
      status: 'invalid',
      errors: { metadata: [{ field: 'id' }], production: [], export: [] },
    })
    expect(store.records()).toEqual([])
  })

  it('ignores a browser-assembled puzzle/layout and publishes the server assembly', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const forged = {
      ...catsRequest(),
      puzzle: { id: 'cats', clue: 'HACKED', unlockBudget: 999999, cells: {}, entries: [] },
      layout: { id: 'x', puzzleId: 'cats', cellPositions: {}, navigationOrder: [] },
    }
    const result = await handlePublishRequest(wire(forged), { store })
    expect(result.status).toBe(201)
    const [record] = store.records()
    expect(record.puzzle.clue).toBe('Cats')
    expect(record.puzzle.unlockBudget).toBe(2000)
    expect(Object.keys(record.puzzle.cells)).toHaveLength(5)
    expect(record.layout.id).toBe('cats-grid')
  })

  it('maps created → 201, existing → 200, conflict → 409', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const created = await handlePublishRequest(wire(catsRequest()), { store })
    expect(created).toEqual({
      status: 201,
      body: {
        status: 'created',
        publication: {
          puzzleId: 'cats',
          publishDate: '2026-10-01',
          releaseInstant: '2026-10-01T02:00:00.000Z',
          contentFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
          fingerprintVersion: 1,
        },
      },
    })

    const existing = await handlePublishRequest(wire(catsRequest()), { store })
    expect(existing.status).toBe(200)
    expect(existing.body).toEqual({ ...created.body, status: 'existing' })

    const conflict = await handlePublishRequest(wire(catsRequest({ clue: 'Felines' })), { store })
    expect(conflict).toEqual({
      status: 409,
      body: {
        status: 'conflict',
        message:
          'Puzzle ID “cats” is already scheduled for 2026-10-01 with different content. Published puzzles can’t be changed; choose a new ID.',
        existing: { puzzleId: 'cats', publishDate: '2026-10-01', releaseInstant: '2026-10-01T02:00:00.000Z' },
      },
    })
  })

  it('maps busy and unavailable to 503 with sanitized messages', async () => {
    const busyStore = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    for (let i = 0; i < 3; i++) {
      busyStore.interceptNextInsert(() => {
        throw new PublicationContentionError('publish-date-taken')
      })
    }
    const busy = await handlePublishRequest(wire(catsRequest()), { store: busyStore })
    expect(busy).toEqual({
      status: 503,
      body: {
        status: 'busy',
        message: 'Another publication was being scheduled at the same time. Nothing was published; try again.',
      },
    })

    const brokenStore = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const failure = new Error(`connect ECONNREFUSED ${SECRET_LIKE}`)
    brokenStore.failNextTransaction(failure)
    const unavailable = await handlePublishRequest(wire(catsRequest()), { store: brokenStore })
    expect(unavailable).toEqual({
      status: 503,
      body: { status: 'unavailable', message: 'Publishing is unavailable right now. Nothing was published; try again.' },
    })
    expectSanitized(unavailable.body)
  })

  it('maps an unexpected exception to a sanitized 500', async () => {
    const hostile = {
      get construction(): never {
        throw new Error(`boom ${SECRET_LIKE}`)
      },
    }
    const result = await handlePublishRequest(hostile, { store: new MemoryPublicationStore({ now: NOON_SEPT_30 }) })
    expect(result).toEqual({
      status: 500,
      body: { status: 'unavailable', message: 'Publishing is unavailable right now. Nothing was published; try again.' },
    })
    expectSanitized(result.body)
  })
})

describe('handlePreviewRequest', () => {
  it('returns an estimate (200) without writing', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const result = await handlePreviewRequest(wire(catsRequest()), { store })
    expect(result).toEqual({
      status: 200,
      body: {
        status: 'estimate',
        estimate: {
          publishDate: '2026-10-01',
          releaseInstant: '2026-10-01T02:00:00.000Z',
          contentFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    })
    expect(store.records()).toEqual([])
  })

  it('reports existing and conflict as information (200)', async () => {
    const store = new MemoryPublicationStore({
      now: NOON_SEPT_30,
      records: [await publicationFor(catsRequest(), '2026-10-01')],
    })
    expect(await handlePreviewRequest(wire(catsRequest()), { store })).toMatchObject({
      status: 200,
      body: { status: 'existing', publication: { publishDate: '2026-10-01' } },
    })
    expect(await handlePreviewRequest(wire(catsRequest({ clue: 'Felines' })), { store })).toMatchObject({
      status: 200,
      body: { status: 'conflict', existing: { publishDate: '2026-10-01' } },
    })
  })

  it('maps bad-request, invalid, not-configured, and unavailable', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    expect((await handlePreviewRequest('nope', { store })).status).toBe(400)
    expect((await handlePreviewRequest(wire(batsRequest({ clue: '' })), { store })).status).toBe(422)
    expect((await handlePreviewRequest(wire(batsRequest()), { store: undefined })).status).toBe(503)

    store.failNextRead(new Error(`timeout ${SECRET_LIKE}`))
    const unavailable = await handlePreviewRequest(wire(batsRequest()), { store })
    expect(unavailable.status).toBe(503)
    expect(unavailable.body.status).toBe('unavailable')
    expectSanitized(unavailable.body)
  })
})
