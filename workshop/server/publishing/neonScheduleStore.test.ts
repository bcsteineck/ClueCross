// Real-database tests for the scheduled-queue removal on the Neon store:
// the delete + ascending backfill against the actual non-deferrable
// UNIQUE (publish_date) constraint, the release guards, rollback, and
// genuine concurrency. Like neonPublicationStore.test.ts they clear
// published_puzzles, so they run ONLY on the Neon `test` branch (marker
// table required) and hold the shared advisory lock.

import { Client } from '@neondatabase/serverless'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createNeonPublicationStore } from './neonPublicationStore'
import { PublicationContentionError } from './publicationStore'
import { publishFinalPuzzle } from './publishPuzzle'
import { previewRemoval, readSchedule, removeScheduledPuzzle } from './scheduleManagement'
import { TEST_BRANCH_MARKER_TABLE, TEST_DATABASE_LOCK_KEY, assertTestBranchMarker, decideTestDatabase } from './testDatabaseGuard'
import { catsRequest } from './testFixtures'

const env = { ...loadEnv('test', process.cwd(), 'PUBLISHING_'), ...process.env }
const decision = decideTestDatabase({ testUrl: env.PUBLISHING_TEST_DATABASE_URL, workshopUrl: env.PUBLISHING_DATABASE_URL })
const testUrl = decision.run ? decision.url : ''

let admin: Client

const fingerprint = (n: number) => n.toString(16).padStart(64, '0')

// Released history (2020) and a far-future scheduled queue (2031).
const RELEASED = [
  { id: 'oldone', date: '2020-01-01' },
  { id: 'oldtwo', date: '2020-01-02' },
]
const queue = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `queued${i + 1}`, date: `2031-01-${String(i + 1).padStart(2, '0')}` }))

async function insertRows(rows: { id: string; date: string }[]) {
  for (const [index, row] of rows.entries()) {
    await admin.query(
      `INSERT INTO published_puzzles (puzzle_id, publish_date, content_fingerprint, fingerprint_version, puzzle, layout)
       VALUES ($1, $2::date, $3, 1, $4::jsonb, $5::jsonb)`,
      [
        row.id,
        row.date,
        fingerprint(index + 1 + row.date.length * 1000),
        JSON.stringify({ id: row.id, clue: `Clue ${row.id}` }),
        JSON.stringify({ id: `${row.id}-grid`, puzzleId: row.id }),
      ],
    )
  }
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

describe.skipIf(!decision.run)('Neon scheduled-queue removal (test branch only)', () => {
  const store = () => createNeonPublicationStore(testUrl)

  async function removalOf(puzzleId: string) {
    const row = (await snapshot()).find((r) => r.puzzle_id === puzzleId)!
    return { puzzleId, expectedPublishDate: row.publish_date, expectedFingerprint: row.content_fingerprint }
  }

  beforeAll(async () => {
    admin = new Client(testUrl)
    await admin.connect()
    const marker = await admin.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    assertTestBranchMarker(marker.rows[0].present === true) // before anything destructive
    await admin.query('SELECT pg_advisory_lock($1)', [TEST_DATABASE_LOCK_KEY])
  }, 60_000)

  beforeEach(async () => {
    await admin.query('DELETE FROM published_puzzles')
    await insertRows([...RELEASED, ...queue(6)])
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    const marker = await admin.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    if (marker.rows[0].present === true) await admin.query('DELETE FROM published_puzzles')
    await admin.query('SELECT pg_advisory_unlock($1)', [TEST_DATABASE_LOCK_KEY])
    await admin.end()
  }, 60_000)

  it('lists the schedule as metadata, statuses from database time', async () => {
    const schedule = await readSchedule(store().reader())
    expect(schedule.entries.map((e) => [e.publishDate, e.puzzleId, e.clue, e.status])).toEqual([
      ['2020-01-01', 'oldone', 'Clue oldone', 'released'],
      ['2020-01-02', 'oldtwo', 'Clue oldtwo', 'current'],
      ...queue(6).map((q) => [q.date, q.id, `Clue ${q.id}`, 'scheduled']),
    ])
    expect(schedule.summary.gaps.length).toBeGreaterThan(0) // 2020 → 2031: a visible historical gap
  }, 30_000)

  it('removes a scheduled puzzle and backfills every later one under the real UNIQUE constraint', async () => {
    const released = (await snapshot()).slice(0, 2)
    const plan = await previewRemoval(store().reader(), 'queued2')
    expect(plan.kind).toBe('removable')
    const outcome = await removeScheduledPuzzle(await removalOf('queued2'), store())
    expect(outcome).toMatchObject({ kind: 'removed', moves: [{ puzzleId: 'queued3', from: '2031-01-03', to: '2031-01-02' }, {}, {}, {}] })
    expect(await dates()).toEqual([
      '2020-01-01 oldone',
      '2020-01-02 oldtwo',
      '2031-01-01 queued1',
      '2031-01-02 queued3',
      '2031-01-03 queued4',
      '2031-01-04 queued5',
      '2031-01-05 queued6',
    ])
    expect((await snapshot()).slice(0, 2)).toEqual(released) // released rows byte-for-byte unchanged
  }, 30_000)

  it('removes the first and the last scheduled puzzle', async () => {
    expect((await removeScheduledPuzzle(await removalOf('queued1'), store())).kind).toBe('removed')
    expect((await removeScheduledPuzzle(await removalOf('queued6'), store())).kind).toBe('removed')
    expect((await dates()).slice(2)).toEqual(['2031-01-01 queued2', '2031-01-02 queued3', '2031-01-03 queued4', '2031-01-04 queued5'])
  }, 30_000)

  it('never removes a released or current puzzle', async () => {
    const before = await snapshot()
    expect((await removeScheduledPuzzle(await removalOf('oldtwo'), store())).kind).toBe('released')
    expect((await removeScheduledPuzzle(await removalOf('oldone'), store())).kind).toBe('released')
    expect(await snapshot()).toEqual(before)
  }, 30_000)

  it('refuses a stale expectation and reports a repeated removal as not found', async () => {
    const before = await snapshot()
    const request = await removalOf('queued3')
    expect((await removeScheduledPuzzle({ ...request, expectedPublishDate: '2031-01-02' }, store())).kind).toBe('stale')
    expect((await removeScheduledPuzzle({ ...request, expectedFingerprint: 'f'.repeat(64) }, store())).kind).toBe('stale')
    expect(await snapshot()).toEqual(before)
    expect((await removeScheduledPuzzle(request, store())).kind).toBe('removed')
    const after = await snapshot()
    expect(await removeScheduledPuzzle(request, store())).toEqual({ kind: 'not-found' })
    expect(await snapshot()).toEqual(after)
  }, 30_000)

  it('store guards: released rows never change, a taken date is contention, and failures roll back', async () => {
    const before = await snapshot()
    await store().transaction(async (tx) => {
      expect(await tx.deleteScheduled('oldtwo', '2020-01-02')).toBe(false)
      expect(await tx.moveScheduled('queued1', '2031-01-01', '2020-01-03')).toBe(false) // onto a released date
    })
    // Out of order, the non-deferrable UNIQUE constraint fires (which is why
    // the backfill moves rows in ascending order).
    await expect(
      store().transaction((tx) => tx.moveScheduled('queued3', '2031-01-03', '2031-01-02')),
    ).rejects.toThrow(PublicationContentionError)
    // A delete followed by a failure rolls back completely.
    await expect(
      store().transaction(async (tx) => {
        expect(await tx.deleteScheduled('queued1', '2031-01-01')).toBe(true)
        throw new Error('later step failed')
      }),
    ).rejects.toThrow('later step failed')
    expect(await snapshot()).toEqual(before)
  }, 30_000)

  it('concurrent removals both apply exactly once, leaving a unique, ordered queue', async () => {
    const [a, b] = await Promise.all([
      removeScheduledPuzzle(await removalOf('queued2'), store()),
      removeScheduledPuzzle(await removalOf('queued5'), store()),
    ])
    expect([a.kind, b.kind]).toEqual(['removed', 'removed'])
    expect((await dates()).slice(2)).toEqual(['2031-01-01 queued1', '2031-01-02 queued3', '2031-01-03 queued4', '2031-01-04 queued6'])
  }, 60_000)

  it('a concurrent publication and removal both succeed; the new puzzle lands after the compacted queue', async () => {
    const [removed, published] = await Promise.all([
      removeScheduledPuzzle(await removalOf('queued1'), store()),
      publishFinalPuzzle(catsRequest(), store()),
    ])
    expect(removed.kind).toBe('removed')
    expect(published.kind).toBe('created')
    const final = await dates()
    expect(final.slice(2)).toEqual([
      '2031-01-01 queued2',
      '2031-01-02 queued3',
      '2031-01-03 queued4',
      '2031-01-04 queued5',
      '2031-01-05 queued6',
      '2031-01-06 cats',
    ])
  }, 60_000)
})
