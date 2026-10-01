import { describe, expect, it } from 'vitest'
import { buildPuzzle } from '../../../tools/generator/src/assemble/buildPuzzle.js'
import { DEFAULT_REVEAL_BUDGET } from '../../../src/core/letterCosts'
import { computeFingerprintV1 } from '../../../src/publishing/fingerprint'
import { releaseInstant } from '../../../src/publishing/releaseSchedule'
import { MemoryPublicationStore } from './memoryPublicationStore'
import { PublicationContentionError } from './publicationStore'
import { previewPublication, publishFinalPuzzle } from './publishPuzzle'
import {
  AT_CUTOFF_SEPT_30,
  BEFORE_CUTOFF_SEPT_30,
  NOON_SEPT_30,
  batsRequest,
  catsRequest,
  construct,
  publicationFor,
} from './testFixtures'

const competitor = (id: string, date: string) =>
  publicationFor(batsRequest({ id, clue: `Competitor ${id}` }), date)

describe('publishFinalPuzzle: validation', () => {
  it('rejects an invalid Final Puzzle with grouped errors and never touches the store', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const stacked = construct([
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'CAR', direction: 'across', start: { x: 0, y: 1 } },
    ])
    const outcome = await publishFinalPuzzle({ construction: stacked, id: 'dogs', clue: ' ' }, store)

    expect(outcome.kind).toBe('invalid')
    if (outcome.kind !== 'invalid') return
    expect(outcome.errors.metadata.map((issue) => issue.field)).toEqual(['id', 'clue'])
    expect(outcome.errors.production).toEqual([])
    expect(outcome.errors.export[0]).toMatch(/^Geometry invariant violated/) // zero incidental entries
    expect(store.transactionCount).toBe(0)
    expect(store.records()).toEqual([])
  })

  it('stores the server-assembled pair, built from the construction and trimmed inputs', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const request = catsRequest({ id: ' cats ', clue: '  Cats  ' })
    await publishFinalPuzzle(request, store)

    const built = buildPuzzle({ construction: request.construction, id: 'cats', clue: 'Cats', unlockBudget: DEFAULT_REVEAL_BUDGET })
    if (!built.ok) throw new Error(built.reason)
    const [record] = store.records()
    expect(record.puzzle).toEqual(built.puzzle)
    expect(record.layout).toEqual(built.layout)
    expect(record.contentFingerprint).toBe(await computeFingerprintV1(built.puzzle, built.layout))
    expect(record.contentFingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('publishFinalPuzzle: creation', () => {
  it('assigns the earliest date on an empty store and persists exactly one publication', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const outcome = await publishFinalPuzzle(catsRequest(), store)

    expect(outcome).toEqual({
      kind: 'created',
      publication: {
        puzzleId: 'cats',
        publishDate: '2026-10-01',
        releaseInstant: '2026-10-01T02:00:00.000Z', // Sept 30, 10 PM ET
        contentFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        fingerprintVersion: 1,
      },
    })
    const records = store.records()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ puzzleId: 'cats', publishDate: '2026-10-01', createdAt: NOON_SEPT_30.toISOString() })
  })

  it('never backfills when the queue is behind', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30, records: [await competitor('old', '2026-09-20')] })
    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-10-01')
  })

  it('appends after the latest date when the queue is ahead', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30, records: [await competitor('ahead', '2026-10-10')] })
    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-10-11')
  })

  it('uses the store clock: at 10 PM exactly the earliest date moves a day', async () => {
    const before = new MemoryPublicationStore({ now: BEFORE_CUTOFF_SEPT_30 })
    const at = new MemoryPublicationStore({ now: AT_CUTOFF_SEPT_30 })
    const first = await publishFinalPuzzle(catsRequest(), before)
    const second = await publishFinalPuzzle(catsRequest(), at)
    expect(first.kind === 'created' && first.publication.publishDate).toBe('2026-10-01')
    expect(second.kind === 'created' && second.publication.publishDate).toBe('2026-10-02')
  })
})

describe('publishFinalPuzzle: idempotency', () => {
  it('returns the existing publication for the same id and content, as a no-op', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const created = await publishFinalPuzzle(catsRequest(), store)
    const before = store.records()
    store.setNow(new Date('2026-09-30T18:00:00.000Z'))

    // Trimming makes this the same content.
    const repeat = await publishFinalPuzzle(catsRequest({ clue: ' Cats ' }), store)
    expect(created.kind).toBe('created')
    expect(repeat).toEqual({ kind: 'existing', publication: created.kind === 'created' ? created.publication : null })
    expect(store.records()).toEqual(before) // same date, same createdAt
    expect(store.attemptedDates).toEqual(['2026-10-01']) // no new date calculated or inserted
  })

  it('a retry that crosses the 10 PM cutoff keeps the original date', async () => {
    const store = new MemoryPublicationStore({ now: BEFORE_CUTOFF_SEPT_30 })
    await publishFinalPuzzle(catsRequest(), store)
    store.setNow(AT_CUTOFF_SEPT_30)
    const retry = await publishFinalPuzzle(catsRequest(), store)
    expect(retry.kind === 'existing' && retry.publication.publishDate).toBe('2026-10-01')
    expect(store.records().map((r) => r.publishDate)).toEqual(['2026-10-01'])
  })
})

describe('publishFinalPuzzle: conflict', () => {
  it('rejects the same id with different content and leaves the original untouched', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    await publishFinalPuzzle(catsRequest(), store)
    const before = store.records()

    const outcome = await publishFinalPuzzle(catsRequest({ clue: 'Felines' }), store)
    expect(outcome).toEqual({
      kind: 'conflict',
      existing: { puzzleId: 'cats', publishDate: '2026-10-01', releaseInstant: '2026-10-01T02:00:00.000Z' },
    })
    expect(store.records()).toEqual(before)
  })
})

describe('publishFinalPuzzle: concurrency', () => {
  it('a taken date starts a fresh attempt that re-reads and recalculates, not date + 1', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30, records: [await competitor('a', '2026-10-05')] })
    const competitors = [await competitor('b', '2026-10-06'), await competitor('c', '2026-10-07'), await competitor('d', '2026-10-08')]
    store.interceptNextInsert(({ store }) => competitors.forEach((record) => store.commitDirectly(record)))

    const outcome = await publishFinalPuzzle(catsRequest(), store)
    // Incrementing the stale attempt would have tried 10-07 (also taken).
    expect(store.attemptedDates).toEqual(['2026-10-06', '2026-10-09'])
    expect(store.transactionCount).toBe(2)
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-10-09')
  })

  it('detects a concurrent commit of a later date as a serialization conflict and recalculates', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const later = await competitor('later', '2026-10-20')
    store.interceptNextInsert(({ store }) => store.commitDirectly(later))

    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(store.attemptedDates).toEqual(['2026-10-01', '2026-10-21'])
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-10-21')
  })

  it('a same-id race with identical content resolves to the existing publication', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const twin = await publicationFor(catsRequest(), '2026-10-01', '2026-09-30T16:00:00.500Z')
    store.interceptNextInsert(({ store }) => store.commitDirectly(twin))

    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome).toMatchObject({ kind: 'existing', publication: { puzzleId: 'cats', publishDate: '2026-10-01' } })
    expect(store.records()).toEqual([twin])
    expect(store.transactionCount).toBe(2)
  })

  it('a same-id race with different content resolves to a conflict, never an overwrite', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const rival = await publicationFor(catsRequest({ clue: 'Felines' }), '2026-10-01')
    store.interceptNextInsert(({ store }) => store.commitDirectly(rival))

    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome.kind).toBe('conflict')
    expect(store.records()).toEqual([rival])
  })

  it('retries a serialization-style failure with a fresh attempt', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    store.interceptNextInsert(() => {
      throw new PublicationContentionError('serialization')
    })
    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome.kind).toBe('created')
    expect(store.transactionCount).toBe(2)
  })

  it('recalculates when the release slot passes at 10 PM before the insert', async () => {
    const store = new MemoryPublicationStore({ now: BEFORE_CUTOFF_SEPT_30 })
    store.interceptNextInsert(({ store }) => store.setNow(AT_CUTOFF_SEPT_30))

    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(store.attemptedDates).toEqual(['2026-10-01', '2026-10-02'])
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-10-02')
    expect(releaseInstant('2026-10-02').getTime()).toBeGreaterThan(AT_CUTOFF_SEPT_30.getTime())
  })

  it('returns busy after 3 retryable failures, leaving the store unchanged', async () => {
    const existing = await competitor('a', '2026-10-05')
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30, records: [existing] })
    for (let i = 0; i < 3; i++) {
      store.interceptNextInsert(() => {
        throw new PublicationContentionError('serialization')
      })
    }
    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome).toEqual({ kind: 'busy' })
    expect(store.transactionCount).toBe(3)
    expect(store.records()).toEqual([existing])
  })

  it('succeeds on the third and final attempt', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    for (let i = 0; i < 2; i++) {
      store.interceptNextInsert(() => {
        throw new PublicationContentionError('publish-date-taken')
      })
    }
    expect((await publishFinalPuzzle(catsRequest(), store)).kind).toBe('created')
    expect(store.transactionCount).toBe(3)
  })

  it('reports infrastructure failures as unavailable without retrying or writing', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    store.failNextTransaction(new Error('connect ECONNREFUSED postgres://user:secret@db.example'))
    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(store.transactionCount).toBe(1)
    expect(store.records()).toEqual([])
  })
})

describe('MemoryPublicationStore transactions', () => {
  it('rolls back staged inserts when the transaction fails', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const record = await publicationFor(catsRequest(), '2026-10-01')
    await expect(
      store.transaction(async (tx) => {
        await tx.insert(record)
        throw new Error('later step failed')
      }),
    ).rejects.toThrow('later step failed')
    expect(store.records()).toEqual([])
  })

  it('gives each transaction the state committed when it began', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const late = await competitor('late', '2026-10-03')
    const seen = await store.transaction(async (tx) => {
      store.commitDirectly(late)
      return { latest: await tx.latestPublishDate(), found: await tx.findById('late') }
    })
    expect(seen).toEqual({ latest: null, found: null })
    expect(await store.transaction(async (tx) => tx.latestPublishDate())).toBe('2026-10-03')
  })

  it('enforces unique ids and dates', async () => {
    const record = await publicationFor(catsRequest(), '2026-10-01')
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30, records: [record] })
    expect(() => store.commitDirectly(record)).toThrow('Duplicate puzzleId')
    await expect(
      store.transaction((tx) => tx.insert({ ...record, puzzleId: 'other' })),
    ).rejects.toMatchObject({ reason: 'publish-date-taken' })
  })
})

describe('previewPublication', () => {
  it('estimates the date and release for a new puzzle without writing', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30, records: [await competitor('a', '2026-10-03')] })
    const before = store.records()
    const outcome = await previewPublication(catsRequest(), store)
    expect(outcome).toEqual({
      kind: 'estimate',
      publishDate: '2026-10-04',
      releaseInstant: '2026-10-04T02:00:00.000Z',
      contentFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(store.records()).toEqual(before)
    expect(store.transactionCount).toBe(0)
    expect(store.attemptedDates).toEqual([])
  })

  it('reports an existing publication or a conflict', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    await publishFinalPuzzle(catsRequest(), store)
    expect(await previewPublication(catsRequest(), store)).toMatchObject({
      kind: 'existing',
      publication: { publishDate: '2026-10-01' },
    })
    expect(await previewPublication(catsRequest({ clue: 'Felines' }), store)).toMatchObject({
      kind: 'conflict',
      existing: { publishDate: '2026-10-01' },
    })
  })

  it('validates like publish', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    expect((await previewPublication(catsRequest({ id: 'sample' }), store)).kind).toBe('invalid')
  })

  it('is only an estimate: the clock and other publications can change the real date', async () => {
    const store = new MemoryPublicationStore({ now: BEFORE_CUTOFF_SEPT_30 })
    const preview = await previewPublication(catsRequest(), store)
    expect(preview.kind === 'estimate' && preview.publishDate).toBe('2026-10-01')

    store.setNow(AT_CUTOFF_SEPT_30)
    await publishFinalPuzzle(batsRequest(), store) // takes 10-02
    const actual = await publishFinalPuzzle(catsRequest(), store)
    expect(actual.kind === 'created' && actual.publication.publishDate).toBe('2026-10-03')
  })

  it('reports read failures as unavailable', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    store.failNextRead(new Error('socket hang up'))
    expect(await previewPublication(catsRequest(), store)).toEqual({ kind: 'unavailable' })
  })
})
