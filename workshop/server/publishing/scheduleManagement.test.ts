import { describe, expect, it } from 'vitest'
import type { PublishedPuzzle } from '../../../src/publishing/types'
import { MemoryPublicationStore } from './memoryPublicationStore'
import { PublicationContentionError } from './publicationStore'
import { MAX_PUBLISH_ATTEMPTS, publishFinalPuzzle } from './publishPuzzle'
import { buildSchedule, previewRemoval, readSchedule, removeScheduledPuzzle } from './scheduleManagement'
import type { RemovalRequest } from './scheduleManagement'
import { catsRequest, publicationFor } from './testFixtures'

// Oct 6, 2026, noon EDT: Oct 5 and Oct 6 have released (Oct 6 is current);
// Oct 7 releases tonight at 10 PM.
const NOON_OCT_6 = new Date('2026-10-06T16:00:00.000Z')
const BEFORE_10PM_OCT_6 = new Date('2026-10-07T01:59:59.999Z')
const AT_10PM_OCT_6 = new Date('2026-10-07T02:00:00.000Z')

const QUEUE: [string, string, string][] = [
  ['colors', 'Colors', '2026-10-05'],
  ['outerspace', 'Outer Space', '2026-10-06'],
  ['animals', 'Animals', '2026-10-07'],
  ['movies', 'Movies', '2026-10-08'],
  ['weather', 'Weather', '2026-10-09'],
]

async function records(entries = QUEUE): Promise<PublishedPuzzle[]> {
  return Promise.all(entries.map(([id, clue, date]) => publicationFor(catsRequest({ id, clue }), date)))
}

async function storeAt(now = NOON_OCT_6, entries = QUEUE) {
  return new MemoryPublicationStore({ now, records: await records(entries) })
}

const dates = (store: MemoryPublicationStore) => store.records().map((r) => `${r.publishDate} ${r.puzzleId}`)

async function removalOf(store: MemoryPublicationStore, puzzleId: string): Promise<RemovalRequest> {
  const record = store.records().find((r) => r.puzzleId === puzzleId)!
  return { puzzleId, expectedPublishDate: record.publishDate, expectedFingerprint: record.contentFingerprint }
}

describe('schedule', () => {
  it('lists every publication oldest first, with derived statuses and release instants', async () => {
    const store = await storeAt()
    const schedule = await readSchedule(store.reader())
    expect(schedule.asOf).toBe(NOON_OCT_6.toISOString())
    expect(schedule.entries.map((e) => [e.publishDate, e.puzzleId, e.clue, e.status, e.removable])).toEqual([
      ['2026-10-05', 'colors', 'Colors', 'released', false],
      ['2026-10-06', 'outerspace', 'Outer Space', 'current', false],
      ['2026-10-07', 'animals', 'Animals', 'scheduled', true],
      ['2026-10-08', 'movies', 'Movies', 'scheduled', true],
      ['2026-10-09', 'weather', 'Weather', 'scheduled', true],
    ])
    expect(schedule.entries[2].releaseInstant).toBe('2026-10-07T02:00:00.000Z')
    expect(schedule.summary).toEqual({
      currentDate: '2026-10-06',
      lastScheduledDate: '2026-10-09',
      scheduledCount: 3,
      filledThrough: '2026-10-09',
      daysAhead: 3,
      gaps: [],
    })
  })

  it('carries metadata only, never puzzle or layout content', async () => {
    const [entry] = (await readSchedule((await storeAt()).reader())).entries
    expect(Object.keys(entry).sort()).toEqual(
      ['clue', 'contentFingerprint', 'publishDate', 'puzzleId', 'releaseInstant', 'removable', 'status'].sort(),
    )
  })

  it('shows gaps, and counts days ahead only through the unbroken run', async () => {
    const records_ = await records([
      ['colors', 'Colors', '2026-10-03'],
      ['outerspace', 'Outer Space', '2026-10-06'],
      ['animals', 'Animals', '2026-10-07'],
      ['weather', 'Weather', '2026-10-09'],
    ])
    const schedule = buildSchedule(records_.map((r) => ({ ...r, clue: r.puzzle.clue })), NOON_OCT_6)
    expect(schedule.summary.gaps).toEqual(['2026-10-04', '2026-10-05', '2026-10-08'])
    expect(schedule.summary.filledThrough).toBe('2026-10-07')
    expect(schedule.summary.daysAhead).toBe(1)
    expect(schedule.summary.lastScheduledDate).toBe('2026-10-09')
  })

  it('handles an empty future and an empty calendar', async () => {
    const released = await readSchedule((await storeAt(NOON_OCT_6, QUEUE.slice(0, 2))).reader())
    expect(released.summary).toEqual({
      currentDate: '2026-10-06',
      lastScheduledDate: null,
      scheduledCount: 0,
      filledThrough: '2026-10-06',
      daysAhead: 0,
      gaps: [],
    })
    const empty = buildSchedule([], NOON_OCT_6)
    expect(empty.entries).toEqual([])
    expect(empty.summary).toEqual({ currentDate: null, lastScheduledDate: null, scheduledCount: 0, filledThrough: null, daysAhead: 0, gaps: [] })
  })

  it('flips the next puzzle to current exactly at 10 PM Eastern', async () => {
    const before = await readSchedule((await storeAt(BEFORE_10PM_OCT_6)).reader())
    expect(before.entries.find((e) => e.puzzleId === 'animals')?.status).toBe('scheduled')
    const at = await readSchedule((await storeAt(AT_10PM_OCT_6)).reader())
    expect(at.entries.find((e) => e.puzzleId === 'animals')).toMatchObject({ status: 'current', removable: false })
    expect(at.entries.find((e) => e.puzzleId === 'outerspace')?.status).toBe('released')
  })

  it('follows America/New_York across the end of DST (EDT 02:00Z, then EST 03:00Z)', async () => {
    const entries: [string, string, string][] = [
      ['nov1', 'Nov 1', '2026-11-01'],
      ['nov2', 'Nov 2', '2026-11-02'],
    ]
    const nov1At10pm = (await readSchedule((await storeAt(new Date('2026-11-01T02:00:00.000Z'), entries)).reader())).entries
    expect(nov1At10pm.map((e) => [e.puzzleId, e.status, e.releaseInstant])).toEqual([
      ['nov1', 'current', '2026-11-01T02:00:00.000Z'],
      ['nov2', 'scheduled', '2026-11-02T03:00:00.000Z'],
    ])
    const justBefore = await readSchedule((await storeAt(new Date('2026-11-02T02:59:59.999Z'), entries)).reader())
    expect(justBefore.entries[1].status).toBe('scheduled')
    const atEst10pm = await readSchedule((await storeAt(new Date('2026-11-02T03:00:00.000Z'), entries)).reader())
    expect(atEst10pm.entries[1].status).toBe('current')
  })
})

describe('removal preview', () => {
  it('lists the target and every later puzzle moving forward one day, without writing', async () => {
    const store = await storeAt()
    const plan = await previewRemoval(store.reader(), 'animals')
    expect(plan).toMatchObject({
      kind: 'removable',
      target: { puzzleId: 'animals', clue: 'Animals', publishDate: '2026-10-07' },
      moves: [
        { puzzleId: 'movies', clue: 'Movies', from: '2026-10-08', to: '2026-10-07' },
        { puzzleId: 'weather', clue: 'Weather', from: '2026-10-09', to: '2026-10-08' },
      ],
    })
    expect(store.transactionCount).toBe(0)
    expect(dates(store)).toHaveLength(5)
  })

  it('reports released puzzles and unknown ids as not removable', async () => {
    const store = await storeAt()
    expect((await previewRemoval(store.reader(), 'outerspace')).kind).toBe('released')
    expect((await previewRemoval(store.reader(), 'colors')).kind).toBe('released')
    expect(await previewRemoval(store.reader(), 'nope')).toEqual({ kind: 'not-found' })
  })
})

describe('removing a scheduled puzzle', () => {
  it('removes the first scheduled puzzle and moves every later one forward a day, in order', async () => {
    const store = await storeAt()
    const releasedBefore = store.records().slice(0, 2)
    const outcome = await removeScheduledPuzzle(await removalOf(store, 'animals'), store)
    expect(outcome).toMatchObject({
      kind: 'removed',
      removed: { puzzleId: 'animals', publishDate: '2026-10-07' },
      moves: [
        { puzzleId: 'movies', from: '2026-10-08', to: '2026-10-07' },
        { puzzleId: 'weather', from: '2026-10-09', to: '2026-10-08' },
      ],
    })
    expect(dates(store)).toEqual([
      '2026-10-05 colors',
      '2026-10-06 outerspace',
      '2026-10-07 movies',
      '2026-10-08 weather',
    ])
    expect(store.records().slice(0, 2)).toEqual(releasedBefore) // released rows exactly unchanged
    // Moved rows keep their content and fingerprint; only the date changes.
    const movies = store.records().find((r) => r.puzzleId === 'movies')!
    expect(movies.contentFingerprint).toBe((await publicationFor(catsRequest({ id: 'movies', clue: 'Movies' }), 'x')).contentFingerprint)
  })

  it('removes a middle puzzle', async () => {
    const store = await storeAt()
    expect((await removeScheduledPuzzle(await removalOf(store, 'movies'), store)).kind).toBe('removed')
    expect(dates(store).slice(2)).toEqual(['2026-10-07 animals', '2026-10-08 weather'])
  })

  it('removes the final puzzle with nothing to move', async () => {
    const store = await storeAt()
    const outcome = await removeScheduledPuzzle(await removalOf(store, 'weather'), store)
    expect(outcome).toMatchObject({ kind: 'removed', moves: [] })
    expect(dates(store).slice(2)).toEqual(['2026-10-07 animals', '2026-10-08 movies'])
  })

  it('removes the only scheduled puzzle', async () => {
    const store = await storeAt(NOON_OCT_6, QUEUE.slice(0, 3))
    expect((await removeScheduledPuzzle(await removalOf(store, 'animals'), store)).kind).toBe('removed')
    expect(dates(store)).toEqual(['2026-10-05 colors', '2026-10-06 outerspace'])
  })

  it('moves many later puzzles, each exactly one day', async () => {
    const entries: [string, string, string][] = [['outerspace', 'Outer Space', '2026-10-06']]
    for (let i = 7; i <= 20; i++) entries.push([`p${i}`, `P${i}`, `2026-10-${String(i).padStart(2, '0')}`])
    const store = await storeAt(NOON_OCT_6, entries)
    expect((await removeScheduledPuzzle(await removalOf(store, 'p7'), store)).kind).toBe('removed')
    expect(dates(store)).toEqual([
      '2026-10-06 outerspace',
      ...Array.from({ length: 13 }, (_, k) => `2026-10-${String(k + 7).padStart(2, '0')} p${k + 8}`),
    ])
  })

  it('never removes the current or a historical released puzzle', async () => {
    const store = await storeAt()
    const before = store.records()
    expect((await removeScheduledPuzzle(await removalOf(store, 'outerspace'), store)).kind).toBe('released')
    expect((await removeScheduledPuzzle(await removalOf(store, 'colors'), store)).kind).toBe('released')
    expect(store.records()).toEqual(before)
  })

  it('refuses a stale expected date or fingerprint without changing anything', async () => {
    const store = await storeAt()
    const before = store.records()
    const request = await removalOf(store, 'movies')
    const wrongDate = await removeScheduledPuzzle({ ...request, expectedPublishDate: '2026-10-07' }, store)
    expect(wrongDate).toMatchObject({ kind: 'stale', current: { puzzleId: 'movies', publishDate: '2026-10-08' } })
    const wrongContent = await removeScheduledPuzzle({ ...request, expectedFingerprint: 'f'.repeat(64) }, store)
    expect(wrongContent.kind).toBe('stale')
    expect(store.records()).toEqual(before)
  })

  it('reports an unknown id, and a repeated removal never touches the puzzle that moved into its date', async () => {
    const store = await storeAt()
    expect(await removeScheduledPuzzle({ puzzleId: 'nope', expectedPublishDate: '2026-10-07', expectedFingerprint: 'a'.repeat(64) }, store)).toEqual({ kind: 'not-found' })
    const request = await removalOf(store, 'animals')
    expect((await removeScheduledPuzzle(request, store)).kind).toBe('removed')
    const afterFirst = store.records()
    expect(await removeScheduledPuzzle(request, store)).toEqual({ kind: 'not-found' })
    expect(store.records()).toEqual(afterFirst) // movies, now on Oct 7, untouched
  })

  it('refuses when 10 PM passes between preview and confirmation', async () => {
    const store = await storeAt(new Date('2026-10-07T01:00:00.000Z')) // 9 PM ET
    expect((await previewRemoval(store.reader(), 'animals')).kind).toBe('removable')
    const request = await removalOf(store, 'animals')
    store.setNow(AT_10PM_OCT_6)
    const before = store.records()
    expect((await removeScheduledPuzzle(request, store)).kind).toBe('released')
    expect(store.records()).toEqual(before)
  })

  it('rolls back and re-checks if 10 PM passes inside the transaction', async () => {
    const store = await storeAt(BEFORE_10PM_OCT_6)
    const before = store.records()
    store.interceptNextScheduleChange(({ store: s }) => s.setNow(AT_10PM_OCT_6)) // just before the delete
    const outcome = await removeScheduledPuzzle(await removalOf(store, 'animals'), store)
    expect(outcome.kind).toBe('released')
    expect(store.records()).toEqual(before)
  })

  it('refuses a stale preview after another removal moved the target', async () => {
    const store = await storeAt()
    const staleMovies = await removalOf(store, 'movies') // previewed at Oct 8
    expect((await removeScheduledPuzzle(await removalOf(store, 'animals'), store)).kind).toBe('removed')
    const outcome = await removeScheduledPuzzle(staleMovies, store)
    expect(outcome).toMatchObject({ kind: 'stale', current: { puzzleId: 'movies', publishDate: '2026-10-07' } })
    expect(dates(store).slice(2)).toEqual(['2026-10-07 movies', '2026-10-08 weather'])
  })

  it('rolls back everything if a backfill step fails', async () => {
    const store = await storeAt()
    const before = store.records()
    store.interceptNextScheduleChange(() => {}) // delete
    store.interceptNextScheduleChange(() => {}) // first move
    store.interceptNextScheduleChange(() => {
      throw new Error('statement failed') // second move
    })
    expect((await removeScheduledPuzzle(await removalOf(store, 'animals'), store)).kind).toBe('unavailable')
    expect(store.records()).toEqual(before)
  })

  it('retries from fresh state when a publication commits concurrently', async () => {
    const store = await storeAt()
    const competing = await publicationFor(catsRequest({ id: 'sports', clue: 'Sports' }), '2026-10-10')
    store.interceptNextScheduleChange(({ store: s }) => s.commitDirectly(competing))
    expect((await removeScheduledPuzzle(await removalOf(store, 'animals'), store)).kind).toBe('removed')
    expect(dates(store).slice(2)).toEqual(['2026-10-07 movies', '2026-10-08 weather', '2026-10-09 sports'])
  })

  it('retries from fresh state when another removal commits concurrently', async () => {
    const store = await storeAt()
    const withoutWeather = store.records().filter((r) => r.puzzleId !== 'weather')
    store.interceptNextScheduleChange(({ store: s }) => s.replaceCommittedDirectly(withoutWeather))
    const outcome = await removeScheduledPuzzle(await removalOf(store, 'animals'), store)
    expect(outcome).toMatchObject({ kind: 'removed', moves: [{ puzzleId: 'movies', from: '2026-10-08', to: '2026-10-07' }] })
    expect(dates(store).slice(2)).toEqual(['2026-10-07 movies'])
  })

  it('gives up as busy after the retry limit, leaving the schedule unchanged', async () => {
    const store = await storeAt()
    for (let i = 0; i < MAX_PUBLISH_ATTEMPTS; i++) {
      store.interceptNextScheduleChange(() => {
        throw new PublicationContentionError('serialization')
      })
    }
    const before = store.records()
    expect((await removeScheduledPuzzle(await removalOf(store, 'animals'), store)).kind).toBe('busy')
    expect(store.records()).toEqual(before)
  })

  it('a later publication appends after the compacted queue', async () => {
    const store = await storeAt()
    await removeScheduledPuzzle(await removalOf(store, 'animals'), store)
    const outcome = await publishFinalPuzzle(catsRequest({ id: 'sports', clue: 'Sports' }), store)
    expect(outcome).toMatchObject({ kind: 'created', publication: { puzzleId: 'sports', publishDate: '2026-10-09' } })
  })
})

describe('memory store scheduled-queue guards', () => {
  it('refuses to delete or move onto a released date, and treats a taken date as contention', async () => {
    const store = await storeAt()
    await store.transaction(async (tx) => {
      expect(await tx.deleteScheduled('outerspace', '2026-10-06')).toBe(false)
      expect(await tx.deleteScheduled('animals', '2026-10-08')).toBe(false) // not at that date
      expect(await tx.moveScheduled('animals', '2026-10-07', '2026-10-06')).toBe(false) // released date
    })
    await expect(
      store.transaction((tx) => tx.moveScheduled('movies', '2026-10-08', '2026-10-07')),
    ).rejects.toThrow(PublicationContentionError)
    expect(dates(store)).toHaveLength(5)
  })
})

describe('publishing with an expected fingerprint', () => {
  it('publishes when the fingerprint matches the preview', async () => {
    const store = await storeAt(NOON_OCT_6, QUEUE.slice(0, 2))
    const expected = (await publicationFor(catsRequest({ id: 'animals', clue: 'Animals' }), 'x')).contentFingerprint
    const outcome = await publishFinalPuzzle(catsRequest({ id: 'animals', clue: 'Animals' }), store, { expectedFingerprint: expected })
    expect(outcome).toMatchObject({ kind: 'created', publication: { publishDate: '2026-10-07', contentFingerprint: expected } })
  })

  it('refuses changed content before touching the store', async () => {
    const store = await storeAt(NOON_OCT_6, QUEUE.slice(0, 2))
    const previewed = (await publicationFor(catsRequest({ id: 'animals', clue: 'Animals' }), 'x')).contentFingerprint
    const outcome = await publishFinalPuzzle(catsRequest({ id: 'animals', clue: 'Wild Animals' }), store, {
      expectedFingerprint: previewed,
    })
    expect(outcome.kind).toBe('content-changed')
    expect(store.transactionCount).toBe(0)
    expect(store.records()).toHaveLength(2)
  })
})
