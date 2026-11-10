import { describe, expect, it } from 'vitest'
import { computeFingerprintV1 } from '../../../src/publishing/fingerprint'
import type { PublishedPuzzle } from '../../../src/publishing/types'
import { MemoryPublicationStore } from './memoryPublicationStore'
import { PublicationContentionError } from './publicationStore'
import { backfillFinalPuzzle, previewBackfill, previewPublication, publishFinalPuzzle } from './publishPuzzle'
import { batsRequest, catsRequest, construct, publicationFor } from './testFixtures'

// The November 2026 calendar: Nov 1–7 released, Nov 8 missed (its puzzle
// went out just after the 10 PM cutoff and landed on Nov 9), Nov 10 and 11
// scheduled. "Now" is noon EST on November 9.
const NOON_NOV_9 = new Date('2026-11-09T17:00:00.000Z')
const BEFORE_CUTOFF_NOV_7 = new Date('2026-11-08T02:59:59.999Z') // Nov 7, 9:59:59.999 PM EST
const AT_CUTOFF_NOV_7 = new Date('2026-11-08T03:00:00.000Z') // Nov 7, 10:00 PM EST: the Nov 8 release

const other = (id: string, date: string) => publicationFor(batsRequest({ id, clue: `Clue ${id}` }), date)

async function november(): Promise<PublishedPuzzle[]> {
  const records: PublishedPuzzle[] = []
  for (let day = 1; day <= 7; day++) records.push(await other(`nov${day}`, `2026-11-0${day}`))
  records.push(await other('nov9', '2026-11-09'), await other('nov10', '2026-11-10'), await other('nov11', '2026-11-11'))
  return records
}

async function storeAt(now = NOON_NOV_9, records?: PublishedPuzzle[]) {
  return new MemoryPublicationStore({ now, records: records ?? (await november()) })
}

const fingerprintOf = async (request = catsRequest()) => (await publicationFor(request, '2026-11-08')).contentFingerprint

describe('backfillFinalPuzzle', () => {
  it('publishes to the chosen missed date, released at once, touching no other record', async () => {
    const store = await storeAt()
    const before = store.records()
    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)

    expect(outcome).toMatchObject({
      kind: 'created',
      publication: { puzzleId: 'cats', publishDate: '2026-11-08', releaseInstant: '2026-11-08T03:00:00.000Z' },
    })
    const after = store.records()
    expect(after.filter((r) => r.puzzleId !== 'cats')).toEqual(before) // every other row unchanged, no date shifted
    expect(after.map((r) => r.publishDate)).toEqual([...before.map((r) => r.publishDate), '2026-11-08'].sort())
    expect(store.attemptedDates).toEqual(['2026-11-08'])
  })

  it('stores the same server-assembled content and fingerprint as normal publishing', async () => {
    const store = await storeAt()
    await backfillFinalPuzzle(catsRequest({ id: ' cats ', clue: '  Cats  ' }), '2026-11-08', store)
    const stored = store.records().find((r) => r.puzzleId === 'cats')!
    const expected = await publicationFor(catsRequest(), '2026-11-08')
    expect(stored.puzzle).toEqual(expected.puzzle)
    expect(stored.layout).toEqual(expected.layout)
    expect(stored.contentFingerprint).toBe(await computeFingerprintV1(stored.puzzle, stored.layout))
  })

  it('fills a missed current date right after its cutoff, and refuses it one millisecond before', async () => {
    const records = (await november()).slice(0, 7) // through Nov 7; nothing for Nov 8 yet
    const early = await storeAt(BEFORE_CUTOFF_NOV_7, records)
    expect(await backfillFinalPuzzle(catsRequest(), '2026-11-08', early)).toEqual({
      kind: 'ineligible',
      publishDate: '2026-11-08',
      reason: 'not-released',
    })
    expect(early.records()).toHaveLength(7)

    const atCutoff = await storeAt(AT_CUTOFF_NOV_7, records)
    expect((await backfillFinalPuzzle(catsRequest(), '2026-11-08', atCutoff)).kind).toBe('created')
  })

  it.each([
    ['2026-10-31', 'before-first'],
    ['2026-11-07', 'occupied'], // a released puzzle is never overwritten
    ['2026-11-09', 'occupied'], // nor the late one now holding Nov 9
  ] as const)('refuses %s (%s) and writes nothing', async (date, reason) => {
    const store = await storeAt()
    const before = store.records()
    expect(await backfillFinalPuzzle(catsRequest(), date, store)).toEqual({ kind: 'ineligible', publishDate: date, reason })
    expect(store.records()).toEqual(before)
    expect(store.attemptedDates).toEqual([])
  })

  it('refuses a future date — scheduled or open — as not yet released, never moving it to another date', async () => {
    const store = await storeAt()
    for (const date of ['2026-11-10', '2026-11-12']) {
      expect(await backfillFinalPuzzle(catsRequest(), date, store)).toEqual({ kind: 'ineligible', publishDate: date, reason: 'not-released' })
    }
    expect(store.attemptedDates).toEqual([])
    expect(store.records()).toHaveLength(10)
  })

  it('refuses everything with an empty publication history', async () => {
    const store = await storeAt(NOON_NOV_9, [])
    expect(await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)).toEqual({
      kind: 'ineligible',
      publishDate: '2026-11-08',
      reason: 'no-history',
    })
    expect(store.records()).toEqual([])
  })

  it('returns the existing publication for the same id and content on another date, writing nothing', async () => {
    // The late Nov 9 puzzle itself: it must be removed from Nov 9 before it can go to Nov 8.
    const records = await november()
    const late = await publicationFor(catsRequest(), '2026-11-12')
    const store = await storeAt(NOON_NOV_9, [...records, late])
    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)
    expect(outcome).toMatchObject({ kind: 'existing', publication: { puzzleId: 'cats', publishDate: '2026-11-12' } })
    expect(store.records()).toHaveLength(11)
    expect(store.records().some((r) => r.publishDate === '2026-11-08')).toBe(false)
  })

  it('rejects a duplicate puzzle id with different content as a conflict', async () => {
    const store = await storeAt()
    const outcome = await backfillFinalPuzzle(batsRequest({ id: 'nov3', clue: 'Something else' }), '2026-11-08', store)
    expect(outcome).toMatchObject({ kind: 'conflict', existing: { puzzleId: 'nov3', publishDate: '2026-11-03' } })
    expect(store.records().some((r) => r.publishDate === '2026-11-08')).toBe(false)
  })

  it('validates exactly like normal publishing and never touches the store when invalid', async () => {
    const store = await storeAt()
    const single = construct([{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }])
    const outcome = await backfillFinalPuzzle({ construction: single, id: 'onecat', clue: 'Cat' }, '2026-11-08', store)
    expect(outcome.kind).toBe('invalid')
    expect(store.transactionCount).toBe(0)
  })

  it('refuses content that changed since the previewed fingerprint', async () => {
    const store = await storeAt()
    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store, { expectedFingerprint: '0'.repeat(64) })
    expect(outcome).toEqual({ kind: 'content-changed', contentFingerprint: await fingerprintOf() })
    expect(store.transactionCount).toBe(0)
  })

  it('publishes with the matching previewed fingerprint', async () => {
    const store = await storeAt()
    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store, { expectedFingerprint: await fingerprintOf() })
    expect(outcome.kind).toBe('created')
  })
})

describe('backfillFinalPuzzle: concurrency', () => {
  it('a competing backfill of the same date wins: the retry re-checks and reports it occupied, never another date', async () => {
    const store = await storeAt()
    const rival = await other('rival', '2026-11-08')
    store.interceptNextInsert(({ store }) => store.commitDirectly(rival))

    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)
    expect(outcome).toEqual({ kind: 'ineligible', publishDate: '2026-11-08', reason: 'occupied' })
    expect(store.attemptedDates).toEqual(['2026-11-08']) // the retry inserted nothing
    expect(store.transactionCount).toBe(2)
    expect(store.records().filter((r) => r.publishDate === '2026-11-08')).toEqual([rival])
  })

  it('a same-id race with identical content resolves to the existing publication, not a duplicate', async () => {
    const store = await storeAt()
    const twin = await publicationFor(catsRequest(), '2026-11-08')
    store.interceptNextInsert(({ store }) => store.commitDirectly(twin))

    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)
    expect(outcome).toMatchObject({ kind: 'existing', publication: { puzzleId: 'cats', publishDate: '2026-11-08' } })
    expect(store.records().filter((r) => r.puzzleId === 'cats')).toHaveLength(1)
  })

  it('a concurrent normal publish elsewhere forces a fresh attempt that still uses the chosen date', async () => {
    const store = await storeAt()
    const appended = await other('nov12', '2026-11-12')
    store.interceptNextInsert(({ store }) => store.commitDirectly(appended))

    const outcome = await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-11-08')
    expect(store.attemptedDates).toEqual(['2026-11-08', '2026-11-08'])
  })

  it('retries a refused store guard with a fresh attempt that re-checks eligibility', async () => {
    const store = await storeAt()
    store.interceptNextInsert(() => {
      throw new PublicationContentionError('backfill-slot-refused')
    })
    expect((await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)).kind).toBe('created')
    expect(store.transactionCount).toBe(2)
  })

  it('returns busy after 3 retryable failures, leaving the store unchanged', async () => {
    const store = await storeAt()
    const before = store.records()
    for (let i = 0; i < 3; i++) {
      store.interceptNextInsert(() => {
        throw new PublicationContentionError('serialization')
      })
    }
    expect((await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)).kind).toBe('busy')
    expect(store.records()).toEqual(before)
  })

  it('reports infrastructure failures as unavailable without retrying or writing', async () => {
    const store = await storeAt()
    store.failNextTransaction(new Error('connection refused'))
    expect((await backfillFinalPuzzle(catsRequest(), '2026-11-08', store)).kind).toBe('unavailable')
    expect(store.transactionCount).toBe(1)
    expect(store.records()).toHaveLength(10)
  })
})

describe('MemoryPublicationStore.insertMissed guard', () => {
  const insertMissed = async (store: MemoryPublicationStore, record: PublishedPuzzle) =>
    store.transaction((tx) => tx.insertMissed(record))

  it('refuses a date whose release has not passed, a date before the first, and an empty calendar', async () => {
    const store = await storeAt()
    for (const date of ['2026-11-12', '2026-10-31']) {
      await expect(insertMissed(store, await publicationFor(catsRequest(), date))).rejects.toMatchObject({ reason: 'backfill-slot-refused' })
    }
    const empty = await storeAt(NOON_NOV_9, [])
    await expect(insertMissed(empty, await publicationFor(catsRequest(), '2026-11-08'))).rejects.toMatchObject({
      reason: 'backfill-slot-refused',
    })
  })

  it('enforces the unique date like insert', async () => {
    const store = await storeAt()
    await expect(insertMissed(store, await publicationFor(catsRequest(), '2026-11-07'))).rejects.toMatchObject({
      reason: 'publish-date-taken',
    })
  })
})

describe('previewBackfill', () => {
  it('lists the missed dates with their (passed) release instants and the fingerprint, without writing', async () => {
    const store = await storeAt()
    const preview = await previewBackfill(catsRequest(), store)
    expect(preview).toEqual({
      kind: 'missed-dates',
      contentFingerprint: await fingerprintOf(),
      firstPublishDate: '2026-11-01',
      dates: [{ publishDate: '2026-11-08', releaseInstant: '2026-11-08T03:00:00.000Z' }],
    })
    expect(store.transactionCount).toBe(0)
    expect(store.records()).toHaveLength(10)
  })

  it('reports no history and no missed dates as empty lists', async () => {
    expect(await previewBackfill(catsRequest(), await storeAt(NOON_NOV_9, []))).toMatchObject({
      kind: 'missed-dates',
      firstPublishDate: null,
      dates: [],
    })
    const full = (await november()).slice(0, 7)
    expect(await previewBackfill(catsRequest(), await storeAt(BEFORE_CUTOFF_NOV_7, full))).toMatchObject({
      kind: 'missed-dates',
      firstPublishDate: '2026-11-01',
      dates: [],
    })
  })

  it('reports an existing publication or a conflict, and validates like publish', async () => {
    const store = await storeAt(NOON_NOV_9, [...(await november()), await publicationFor(catsRequest(), '2026-11-12')])
    expect((await previewBackfill(catsRequest(), store)).kind).toBe('existing')
    expect((await previewBackfill(catsRequest({ clue: 'Felines' }), store)).kind).toBe('conflict')
    const single = construct([{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }])
    expect((await previewBackfill({ construction: single, id: 'onecat', clue: 'Cat' }, store)).kind).toBe('invalid')
  })

  it('reports read failures as unavailable', async () => {
    const store = await storeAt()
    store.failNextRead(new Error('timeout'))
    expect(await previewBackfill(catsRequest(), store)).toEqual({ kind: 'unavailable' })
  })
})

describe('normal publishing is unchanged by a missed date', () => {
  it('still appends after the latest date and never fills the gap', async () => {
    const store = await storeAt()
    expect(await previewPublication(catsRequest(), store)).toMatchObject({ kind: 'estimate', publishDate: '2026-11-12' })
    const outcome = await publishFinalPuzzle(catsRequest(), store)
    expect(outcome.kind === 'created' && outcome.publication.publishDate).toBe('2026-11-12')
    expect(store.records().some((r) => r.publishDate === '2026-11-08')).toBe(false)
  })

  it('a backfill never changes the next normal date', async () => {
    const store = await storeAt()
    await backfillFinalPuzzle(batsRequest({ id: 'filler', clue: 'Filler' }), '2026-11-08', store)
    expect(await previewPublication(catsRequest(), store)).toMatchObject({ kind: 'estimate', publishDate: '2026-11-12' })
  })
})
