import { describe, expect, it } from 'vitest'
import { MemoryPublicationStore } from '../publishing/memoryPublicationStore'
import { catsRequest, publicationFor } from '../publishing/testFixtures'
import { parseProductionOperation, runProductionOperation } from './productionOperations'
import type { ProductionOperation } from './productionOperations'

const NOON_OCT_6 = new Date('2026-10-06T16:00:00.000Z') // EDT
const BEFORE_10PM_OCT_6 = new Date('2026-10-07T01:59:59.999Z')
const AT_10PM_OCT_6 = new Date('2026-10-07T02:00:00.000Z')

async function productionLikeStore(now = NOON_OCT_6) {
  return new MemoryPublicationStore({
    now,
    records: [
      await publicationFor(catsRequest({ id: 'colors', clue: 'Colors' }), '2026-10-05'),
      await publicationFor(catsRequest({ id: 'outerspace', clue: 'Outer Space' }), '2026-10-06'),
    ],
  })
}

function parse(value: unknown): ProductionOperation {
  const result = parseProductionOperation(value)
  if (!result.ok) throw new Error(result.message)
  return result.operation
}

const animals = () => catsRequest({ id: 'animals', clue: 'Animals' })

describe('parseProductionOperation', () => {
  it('accepts each operation and rebuilds a clean copy', () => {
    expect(parse({ operation: 'schedule', extra: 'ignored' })).toEqual({ operation: 'schedule' })
    expect(parse({ operation: 'remove-preview', puzzleId: 'animals' })).toEqual({ operation: 'remove-preview', puzzleId: 'animals' })
    const publish = parse({ operation: 'publish', request: { ...animals(), puzzle: { injected: true } }, expectedFingerprint: 'a'.repeat(64), confirmPuzzleId: 'animals' })
    expect(publish.operation === 'publish' && Object.keys(publish.request).sort()).toEqual(['clue', 'construction', 'id'])
  })

  it('requires the typed confirmation to match the puzzle ID exactly', () => {
    const base = { request: animals(), expectedFingerprint: 'a'.repeat(64) }
    expect(parseProductionOperation({ operation: 'publish', ...base, confirmPuzzleId: 'Animals' })).toMatchObject({ ok: false })
    expect(parseProductionOperation({ operation: 'publish', ...base })).toMatchObject({ ok: false })
    const removal = { puzzleId: 'animals', expectedPublishDate: '2026-10-07', expectedFingerprint: 'a'.repeat(64) }
    expect(parseProductionOperation({ operation: 'remove', ...removal, confirmPuzzleId: 'movies' })).toMatchObject({ ok: false })
    expect(parseProductionOperation({ operation: 'remove', ...removal, confirmPuzzleId: 'animals' })).toMatchObject({ ok: true })
  })

  it('rejects unknown operations and malformed fields', () => {
    const removal = { operation: 'remove', puzzleId: 'animals', expectedPublishDate: '2026-10-07', expectedFingerprint: 'a'.repeat(64), confirmPuzzleId: 'animals' }
    for (const bad of [
      null,
      [],
      { operation: 'drop' },
      { operation: 'publish-preview' },
      { operation: 'remove-preview', puzzleId: 'Not An Id' },
      { ...removal, expectedPublishDate: '2026-02-30' },
      { ...removal, expectedFingerprint: 'xyz' },
      { operation: 'publish', request: animals(), expectedFingerprint: 'A'.repeat(64), confirmPuzzleId: 'animals' },
    ]) {
      expect(parseProductionOperation(bad), JSON.stringify(bad)).toMatchObject({ ok: false })
    }
  })
})

describe('runProductionOperation', () => {
  it('schedule returns metadata only', async () => {
    const body = await runProductionOperation({ operation: 'schedule' }, await productionLikeStore())
    expect(body).toMatchObject({ status: 'ok', schedule: { summary: { currentDate: '2026-10-06', scheduledCount: 0 } } })
    expect(JSON.stringify(body)).not.toMatch(/"cells"|"entries":\[\{"id"|correctLetter|cellPositions/)
  })

  it('preview → publish with the previewed fingerprint; a repeat is idempotent', async () => {
    const store = await productionLikeStore()
    const preview = await runProductionOperation({ operation: 'publish-preview', request: animals() }, store)
    expect(preview).toMatchObject({ status: 'estimate', estimate: { publishDate: '2026-10-07', releaseInstant: '2026-10-07T02:00:00.000Z' } })
    const expectedFingerprint = preview.status === 'estimate' ? preview.estimate.contentFingerprint : ''
    expect(store.records()).toHaveLength(2) // preview never writes

    const publish = { operation: 'publish' as const, request: animals(), expectedFingerprint, confirmPuzzleId: 'animals' }
    expect(await runProductionOperation(publish, store)).toMatchObject({
      status: 'created',
      publication: { puzzleId: 'animals', publishDate: '2026-10-07', contentFingerprint: expectedFingerprint },
    })
    expect(await runProductionOperation(publish, store)).toMatchObject({ status: 'existing', publication: { publishDate: '2026-10-07' } })
    expect(store.records()).toHaveLength(3)
  })

  it('refuses content that changed after the preview, before writing', async () => {
    const store = await productionLikeStore()
    const preview = await runProductionOperation({ operation: 'publish-preview', request: animals() }, store)
    const expectedFingerprint = preview.status === 'estimate' ? preview.estimate.contentFingerprint : ''
    const changed = catsRequest({ id: 'animals', clue: 'Wild Animals' })
    const result = await runProductionOperation({ operation: 'publish', request: changed, expectedFingerprint, confirmPuzzleId: 'animals' }, store)
    expect(result).toMatchObject({ status: 'content-changed' })
    expect(store.transactionCount).toBe(0)
  })

  it('keeps ID-conflict behavior: same ID, different content never overwrites', async () => {
    const store = await productionLikeStore()
    const different = catsRequest({ id: 'colors', clue: 'Colours' })
    const preview = await runProductionOperation({ operation: 'publish-preview', request: different }, store)
    expect(preview.status).toBe('conflict')
    const fingerprint = (await publicationFor(different, 'x')).contentFingerprint
    const result = await runProductionOperation({ operation: 'publish', request: different, expectedFingerprint: fingerprint, confirmPuzzleId: 'colors' }, store)
    expect(result).toMatchObject({ status: 'conflict', existing: { puzzleId: 'colors', publishDate: '2026-10-05' } })
    expect(store.records().find((r) => r.puzzleId === 'colors')?.puzzle.clue).toBe('Colors')
  })

  it('assigns the date from the store clock across the 10 PM cutoff', async () => {
    const before = await runProductionOperation({ operation: 'publish-preview', request: animals() }, await productionLikeStore(BEFORE_10PM_OCT_6))
    const at = await runProductionOperation({ operation: 'publish-preview', request: animals() }, await productionLikeStore(AT_10PM_OCT_6))
    expect(before).toMatchObject({ estimate: { publishDate: '2026-10-07' } })
    expect(at).toMatchObject({ estimate: { publishDate: '2026-10-08' } })
  })

  it('removal preview and removal go through the schedule service', async () => {
    const store = await productionLikeStore()
    for (const [id, date] of [['animals', '2026-10-07'], ['movies', '2026-10-08']] as const) {
      store.commitDirectly(await publicationFor(catsRequest({ id, clue: id }), date))
    }
    const preview = await runProductionOperation({ operation: 'remove-preview', puzzleId: 'animals' }, store)
    expect(preview).toMatchObject({ status: 'removable', moves: [{ puzzleId: 'movies', from: '2026-10-08', to: '2026-10-07' }] })
    const target = preview.status === 'removable' ? preview.target : null
    const removal = { operation: 'remove' as const, puzzleId: 'animals', expectedPublishDate: target!.publishDate, expectedFingerprint: target!.contentFingerprint, confirmPuzzleId: 'animals' }
    expect(await runProductionOperation(removal, store)).toMatchObject({ status: 'removed' })
    expect(await runProductionOperation(removal, store)).toEqual({ status: 'not-found' })
    expect(await runProductionOperation({ operation: 'remove-preview', puzzleId: 'outerspace' }, store)).toMatchObject({ status: 'released' })
  })

  it('turns store failures into a fixed message', async () => {
    const store = await productionLikeStore()
    store.failNextRead(new Error('connect ECONNREFUSED postgres://owner:secret@host/db'))
    const body = await runProductionOperation({ operation: 'schedule' }, store)
    expect(body).toMatchObject({ status: 'production-unavailable', reason: 'unavailable' })
    expect(JSON.stringify(body)).not.toMatch(/secret|postgres|ECONNREFUSED/)
  })
})

describe('backfill operations', () => {
  // Oct 4 and Oct 6 released; Oct 5 was missed. Noon EDT on October 6.
  async function storeWithMissedDate() {
    return new MemoryPublicationStore({
      now: NOON_OCT_6,
      records: [
        await publicationFor(catsRequest({ id: 'colors', clue: 'Colors' }), '2026-10-04'),
        await publicationFor(catsRequest({ id: 'outerspace', clue: 'Outer Space' }), '2026-10-06'),
      ],
    })
  }
  const fingerprint = async () => (await publicationFor(animals(), 'x')).contentFingerprint
  const backfillOp = async (overrides: Record<string, unknown> = {}) => ({
    operation: 'backfill',
    request: animals(),
    publishDate: '2026-10-05',
    expectedFingerprint: await fingerprint(),
    confirmPuzzleId: 'animals',
    ...overrides,
  })

  it('parses a backfill with a strict calendar date and the typed confirmation', async () => {
    expect(parse(await backfillOp())).toMatchObject({ operation: 'backfill', publishDate: '2026-10-05', confirmPuzzleId: 'animals' })
    expect(parse({ operation: 'backfill-preview', request: animals() })).toMatchObject({ operation: 'backfill-preview' })
    for (const bad of [
      await backfillOp({ publishDate: '2026-02-30' }),
      await backfillOp({ publishDate: '2026-10-5' }),
      await backfillOp({ publishDate: 20261005 }),
      await backfillOp({ publishDate: undefined }),
      await backfillOp({ confirmPuzzleId: 'Animals' }),
      await backfillOp({ confirmPuzzleId: undefined }),
      await backfillOp({ expectedFingerprint: 'xyz' }),
      { operation: 'backfill-preview' },
    ]) {
      expect(parseProductionOperation(bad), JSON.stringify(bad)).toMatchObject({ ok: false })
    }
  })

  it('preview lists the missed dates without writing; backfill publishes to exactly that date', async () => {
    const store = await storeWithMissedDate()
    const preview = await runProductionOperation({ operation: 'backfill-preview', request: animals() }, store)
    expect(preview).toEqual({
      status: 'missed-dates',
      contentFingerprint: await fingerprint(),
      firstPublishDate: '2026-10-04',
      dates: [{ publishDate: '2026-10-05', releaseInstant: '2026-10-05T02:00:00.000Z' }],
    })
    expect(store.records()).toHaveLength(2)

    const result = await runProductionOperation(parse(await backfillOp()), store)
    expect(result).toMatchObject({ status: 'created', publication: { puzzleId: 'animals', publishDate: '2026-10-05' } })
    expect(store.records().map((r) => `${r.publishDate} ${r.puzzleId}`)).toEqual([
      '2026-10-04 colors',
      '2026-10-05 animals',
      '2026-10-06 outerspace',
    ])
    // A repeat is idempotent, never a second row.
    expect(await runProductionOperation(parse(await backfillOp()), store)).toMatchObject({ status: 'existing' })
    expect(store.records()).toHaveLength(3)
  })

  it('reports an ineligible date with an actionable message and never another date', async () => {
    const store = await storeWithMissedDate()
    const cases = [
      ['2026-10-04', 'occupied', /already has a puzzle/],
      ['2026-10-03', 'before-first', /before the first Production puzzle/],
      ['2026-10-07', 'not-released', /hasn’t reached its release time/],
    ] as const
    for (const [publishDate, reason, message] of cases) {
      const result = await runProductionOperation(parse(await backfillOp({ publishDate })), store)
      expect(result, publishDate).toMatchObject({ status: 'ineligible', publishDate, reason })
      expect(result.status === 'ineligible' && result.message).toMatch(message)
      expect(result.status === 'ineligible' && result.message).toMatch(/Nothing was published/)
    }
    expect(store.records()).toHaveLength(2)
  })

  it('refuses changed content, and keeps ID conflicts', async () => {
    const store = await storeWithMissedDate()
    const changed = catsRequest({ id: 'animals', clue: 'Wild Animals' })
    expect(await runProductionOperation(parse(await backfillOp({ request: changed })), store)).toMatchObject({ status: 'content-changed' })
    const rival = catsRequest({ id: 'colors', clue: 'Colours' })
    const rivalFingerprint = (await publicationFor(rival, 'x')).contentFingerprint
    expect(
      await runProductionOperation(parse(await backfillOp({ request: rival, expectedFingerprint: rivalFingerprint, confirmPuzzleId: 'colors' })), store),
    ).toMatchObject({ status: 'conflict', existing: { puzzleId: 'colors' } })
    expect(store.records()).toHaveLength(2)
  })

  it('keeps unrelated operations working beside it', async () => {
    const store = await storeWithMissedDate()
    const schedule = await runProductionOperation({ operation: 'schedule' }, store)
    expect(schedule).toMatchObject({ status: 'ok', schedule: { summary: { gaps: ['2026-10-05'], missedDates: ['2026-10-05'] } } })
    expect(JSON.stringify(schedule)).not.toMatch(/"cells"|"entries":\[\{"id"|correctLetter|cellPositions/)
    // Normal publishing still appends after the latest date.
    expect(await runProductionOperation({ operation: 'publish-preview', request: animals() }, store)).toMatchObject({
      status: 'estimate',
      estimate: { publishDate: '2026-10-07' },
    })
  })
})
