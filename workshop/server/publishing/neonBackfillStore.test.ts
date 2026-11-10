// Real-database tests for backfilling a missed past date on the Neon store:
// the reverse release guard and first-date bound in INSERT_MISSED_PUBLICATION,
// the real UNIQUE constraints, rollback, genuine concurrency, and that a
// backfilled row is public through the released_puzzles view and the player
// API at once. Like the other Neon store tests they clear published_puzzles,
// so they run ONLY on the Neon `test` branch (marker table required) and
// hold the shared advisory lock.

import { Client } from '@neondatabase/serverless'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createNeonReleasedPuzzleReader } from '../../../server/puzzles/neonReleasedPuzzleReader'
import { handleCalendarRequest, handlePuzzleRequest } from '../../../server/puzzles/puzzleApi'
import type { PublishedPuzzle } from '../../../src/publishing/types'
import { createNeonPublicationStore } from './neonPublicationStore'
import { PublicationContentionError } from './publicationStore'
import { backfillFinalPuzzle, previewBackfill } from './publishPuzzle'
import { removeScheduledPuzzle } from './scheduleManagement'
import { TEST_BRANCH_MARKER_TABLE, TEST_DATABASE_LOCK_KEY, assertTestBranchMarker, decideTestDatabase } from './testDatabaseGuard'
import { batsRequest, catsRequest, publicationFor } from './testFixtures'

const env = { ...loadEnv('test', process.cwd(), 'PUBLISHING_'), ...process.env }
const decision = decideTestDatabase({ testUrl: env.PUBLISHING_TEST_DATABASE_URL, workshopUrl: env.PUBLISHING_DATABASE_URL })
const testUrl = decision.run ? decision.url : ''
const readerUrl = env.PUBLISHING_TEST_READER_DATABASE_URL?.trim() ?? ''
if (decision.run && readerUrl !== '' && new URL(readerUrl).hostname !== new URL(testUrl).hostname) {
  throw new Error('Refusing: PUBLISHING_TEST_READER_DATABASE_URL must point at the same (test) branch as PUBLISHING_TEST_DATABASE_URL.')
}

let admin: Client

// Released history in 2020 with January 2 missed, and a far-future queue in 2031.
const ROWS = [
  { id: 'oldone', date: '2020-01-01' },
  { id: 'oldthree', date: '2020-01-03' },
  { id: 'queued1', date: '2031-01-01' },
  { id: 'queued2', date: '2031-01-02' },
  { id: 'queued3', date: '2031-01-03' },
]

async function insertRows(rows: { id: string; date: string }[]) {
  for (const row of rows) {
    const record = await publicationFor(batsRequest({ id: row.id, clue: `Clue ${row.id}` }), row.date)
    await insertRecord(record)
  }
}

async function insertRecord(record: PublishedPuzzle) {
  await admin.query(
    `INSERT INTO published_puzzles (puzzle_id, publish_date, content_fingerprint, fingerprint_version, puzzle, layout)
     VALUES ($1, $2::date, $3, $4, $5::jsonb, $6::jsonb)`,
    [record.puzzleId, record.publishDate, record.contentFingerprint, record.fingerprintVersion, JSON.stringify(record.puzzle), JSON.stringify(record.layout)],
  )
}

async function snapshot() {
  return (
    await admin.query(
      `SELECT puzzle_id, publish_date::text AS publish_date, content_fingerprint, puzzle, layout, created_at::text AS created_at
       FROM published_puzzles ORDER BY publish_date`,
    )
  ).rows
}

const dates = async () => (await snapshot()).map((row) => `${row.publish_date} ${row.puzzle_id}`)

describe.skipIf(!decision.run)('Neon backfill of a missed past date (test branch only)', () => {
  const store = () => createNeonPublicationStore(testUrl)

  beforeAll(async () => {
    admin = new Client(testUrl)
    await admin.connect()
    const marker = await admin.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    assertTestBranchMarker(marker.rows[0].present === true) // before anything destructive
    await admin.query('SELECT pg_advisory_lock($1)', [TEST_DATABASE_LOCK_KEY])
  }, 60_000)

  beforeEach(async () => {
    await admin.query('DELETE FROM published_puzzles')
    await insertRows(ROWS)
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    const marker = await admin.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    if (marker.rows[0].present === true) await admin.query('DELETE FROM published_puzzles')
    await admin.query('SELECT pg_advisory_unlock($1)', [TEST_DATABASE_LOCK_KEY])
    await admin.end()
  }, 60_000)

  it('backfills the missed date at database time, changing no other row', async () => {
    const before = await snapshot()
    const preview = await previewBackfill(catsRequest(), store())
    expect(preview.kind === 'missed-dates' && preview.dates[0]).toEqual({ publishDate: '2020-01-02', releaseInstant: '2020-01-02T03:00:00.000Z' })

    const outcome = await backfillFinalPuzzle(catsRequest(), '2020-01-02', store())
    expect(outcome).toMatchObject({ kind: 'created', publication: { puzzleId: 'cats', publishDate: '2020-01-02' } })
    const after = await snapshot()
    expect(after.filter((row) => row.puzzle_id !== 'cats')).toEqual(before) // byte-for-byte, no date moved
    expect(await dates()).toEqual([
      '2020-01-01 oldone',
      '2020-01-02 cats',
      '2020-01-03 oldthree',
      '2031-01-01 queued1',
      '2031-01-02 queued2',
      '2031-01-03 queued3',
    ])
  }, 30_000)

  it('refuses an occupied, future, or pre-history date, writing nothing', async () => {
    const before = await snapshot()
    expect(await backfillFinalPuzzle(catsRequest(), '2020-01-03', store())).toMatchObject({ kind: 'ineligible', reason: 'occupied' })
    expect(await backfillFinalPuzzle(catsRequest(), '2031-01-02', store())).toMatchObject({ kind: 'ineligible', reason: 'not-released' })
    expect(await backfillFinalPuzzle(catsRequest(), '2031-01-10', store())).toMatchObject({ kind: 'ineligible', reason: 'not-released' })
    expect(await backfillFinalPuzzle(catsRequest(), '2019-12-31', store())).toMatchObject({ kind: 'ineligible', reason: 'before-first' })
    expect(await snapshot()).toEqual(before)
  }, 60_000)

  it('store guard: the SQL itself refuses an unreleased date, a pre-history date, and an empty calendar', async () => {
    const before = await snapshot()
    for (const date of ['2031-01-10', '2019-12-31']) {
      const record = await publicationFor(catsRequest(), date)
      await expect(store().transaction((tx) => tx.insertMissed(record))).rejects.toMatchObject({ reason: 'backfill-slot-refused' })
    }
    // The UNIQUE (publish_date) constraint is contention, like insert.
    const taken = await publicationFor(catsRequest(), '2020-01-03')
    await expect(store().transaction((tx) => tx.insertMissed(taken))).rejects.toThrow(PublicationContentionError)
    expect(await snapshot()).toEqual(before)

    await admin.query('DELETE FROM published_puzzles')
    const lonely = await publicationFor(catsRequest(), '2020-01-02')
    await expect(store().transaction((tx) => tx.insertMissed(lonely))).rejects.toMatchObject({ reason: 'backfill-slot-refused' })
    expect(await snapshot()).toEqual([])
  }, 60_000)

  it('rolls back a backfill when a later step in the transaction fails', async () => {
    const before = await snapshot()
    const record = await publicationFor(catsRequest(), '2020-01-02')
    await expect(
      store().transaction(async (tx) => {
        await tx.insertMissed(record)
        throw new Error('later step failed')
      }),
    ).rejects.toThrow('later step failed')
    expect(await snapshot()).toEqual(before)
  }, 30_000)

  it('two concurrent backfills of the same date leave exactly one puzzle there', async () => {
    const [a, b] = await Promise.all([
      backfillFinalPuzzle(catsRequest(), '2020-01-02', store()),
      backfillFinalPuzzle(batsRequest(), '2020-01-02', store()),
    ])
    expect([a.kind, b.kind].sort()).toEqual(['created', 'ineligible'])
    const loser = a.kind === 'ineligible' ? a : b
    expect(loser).toMatchObject({ kind: 'ineligible', reason: 'occupied' })
    expect((await dates()).filter((line) => line.startsWith('2020-01-02'))).toHaveLength(1)
  }, 60_000)

  it('a concurrent backfill and scheduled-queue removal both apply, each to its own rows', async () => {
    const queued2 = (await snapshot()).find((row) => row.puzzle_id === 'queued2')!
    const [backfilled, removed] = await Promise.all([
      backfillFinalPuzzle(catsRequest(), '2020-01-02', store()),
      removeScheduledPuzzle(
        { puzzleId: 'queued2', expectedPublishDate: queued2.publish_date, expectedFingerprint: queued2.content_fingerprint },
        store(),
      ),
    ])
    expect(backfilled.kind).toBe('created')
    expect(removed.kind).toBe('removed')
    expect(await dates()).toEqual(['2020-01-01 oldone', '2020-01-02 cats', '2020-01-03 oldthree', '2031-01-01 queued1', '2031-01-02 queued3'])
  }, 60_000)

  it.skipIf(readerUrl === '')('is public through the released view and the player API immediately after commit', async () => {
    const deps = { reader: createNeonReleasedPuzzleReader(readerUrl) }
    const missing = await handlePuzzleRequest({ method: 'GET', url: '/api/puzzle?date=2020-01-02' }, deps)
    expect(missing.status).toBe(404)

    expect((await backfillFinalPuzzle(catsRequest(), '2020-01-02', store())).kind).toBe('created')

    const puzzle = await handlePuzzleRequest({ method: 'GET', url: '/api/puzzle?date=2020-01-02' }, deps)
    expect(puzzle.status).toBe(200)
    expect(puzzle.body).toMatchObject({ publishDate: '2020-01-02', puzzle: { id: 'cats' } })
    const calendar = await handleCalendarRequest({ method: 'GET', url: '/api/calendar' }, deps)
    expect(calendar.status).toBe(200)
    const body = calendar.body as { current: { publishDate: string }; dates: { publishDate: string; puzzleId: string }[] }
    expect(body.dates.map((d) => `${d.publishDate} ${d.puzzleId}`)).toEqual(['2020-01-01 oldone', '2020-01-02 cats', '2020-01-03 oldthree'])
    expect(body.current.publishDate).toBe('2020-01-03') // the scheduled 2031 queue stays hidden
    // Scheduled content is still never public.
    expect((await handlePuzzleRequest({ method: 'GET', url: '/api/puzzle?date=2031-01-01' }, deps)).status).toBe(404)
  }, 60_000)
})
