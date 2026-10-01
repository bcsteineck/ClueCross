// Real-database contract and concurrency tests for the Neon store. They
// clear published_puzzles, so they run ONLY against the Neon `test` branch:
// skipped without PUBLISHING_TEST_DATABASE_URL, refused if it equals
// PUBLISHING_DATABASE_URL, and refused unless the connected database has
// the cluecross_test_branch marker table (present only on `test`).

import { Client } from '@neondatabase/serverless'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assignPublishDate, earliestPublishDate } from '../../../src/publishing/releaseSchedule'
import { createNeonPublicationStore } from './neonPublicationStore'
import { PublicationContentionError } from './publicationStore'
import { previewPublication, publishFinalPuzzle } from './publishPuzzle'
import { TEST_BRANCH_MARKER_TABLE, assertTestBranchMarker, decideTestDatabase } from './testDatabaseGuard'
import { batsRequest, catsRequest, publicationFor } from './testFixtures'

const env = { ...loadEnv('test', process.cwd(), 'PUBLISHING_'), ...process.env }
const decision = decideTestDatabase({ testUrl: env.PUBLISHING_TEST_DATABASE_URL, workshopUrl: env.PUBLISHING_DATABASE_URL })
const testUrl = decision.run ? decision.url : ''

let admin: Client

async function rowCount(): Promise<number> {
  return (await admin.query('SELECT count(*)::int AS n FROM published_puzzles')).rows[0].n
}

async function rawInsert(values: {
  id: string
  date: string
  fingerprint?: string
  version?: number
  puzzleId?: string
  layoutPuzzleId?: string
  layoutId?: string
}) {
  await admin.query(
    `INSERT INTO published_puzzles (puzzle_id, publish_date, content_fingerprint, fingerprint_version, puzzle, layout)
     VALUES ($1, $2::date, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      values.id,
      values.date,
      values.fingerprint ?? 'a'.repeat(64),
      values.version ?? 1,
      JSON.stringify({ id: values.puzzleId ?? values.id }),
      JSON.stringify({ id: values.layoutId ?? `${values.id}-grid`, puzzleId: values.layoutPuzzleId ?? values.id }),
    ],
  )
}

async function errorOf(action: () => Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await action()
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string }
    return { code, constraint }
  }
  throw new Error('expected a database error')
}

describe.skipIf(!decision.run)('Neon publication store (test branch only)', () => {
  const store = () => createNeonPublicationStore(testUrl)

  beforeAll(async () => {
    admin = new Client(testUrl)
    await admin.connect()
    const marker = await admin.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    assertTestBranchMarker(marker.rows[0].present === true) // before anything destructive
    await admin.query('DELETE FROM published_puzzles')
  }, 60_000)

  afterAll(async () => {
    if (!admin) return
    const marker = await admin.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    if (marker.rows[0].present === true) await admin.query('DELETE FROM published_puzzles')
    await admin.end()
  }, 60_000)

  describe('schema and constraints', () => {
    it('has the table with its named constraints', async () => {
      const result = await admin.query(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'published_puzzles'::regclass AND contype IN ('p', 'u', 'c') ORDER BY conname",
      )
      expect(result.rows.map((row) => row.conname).filter((name: string) => !name.endsWith('_not_null'))).toEqual([
        'published_puzzles_fingerprint_format_check',
        'published_puzzles_fingerprint_version_check',
        'published_puzzles_pkey',
        'published_puzzles_publish_date_key',
        'published_puzzles_puzzle_id_format_check',
        'published_puzzles_record_ids_check',
      ])
    })

    it('enforces uniqueness and every check constraint', async () => {
      await admin.query('DELETE FROM published_puzzles')
      await rawInsert({ id: 'alpha', date: '2031-01-01' })
      expect(await errorOf(() => rawInsert({ id: 'alpha', date: '2031-01-02' }))).toEqual({
        code: '23505',
        constraint: 'published_puzzles_pkey',
      })
      expect(await errorOf(() => rawInsert({ id: 'beta', date: '2031-01-01' }))).toEqual({
        code: '23505',
        constraint: 'published_puzzles_publish_date_key',
      })
      const checks: [Parameters<typeof rawInsert>[0], string][] = [
        [{ id: 'gamma', date: '2031-01-03', version: 2 }, 'published_puzzles_fingerprint_version_check'],
        [{ id: 'gamma', date: '2031-01-03', fingerprint: 'A'.repeat(64) }, 'published_puzzles_fingerprint_format_check'],
        [{ id: 'gamma', date: '2031-01-03', fingerprint: 'a'.repeat(63) }, 'published_puzzles_fingerprint_format_check'],
        [{ id: 'Gamma', date: '2031-01-03' }, 'published_puzzles_puzzle_id_format_check'],
        [{ id: 'ice-cream', date: '2031-01-03' }, 'published_puzzles_puzzle_id_format_check'],
        [{ id: 'gamma', date: '2031-01-03', puzzleId: 'other' }, 'published_puzzles_record_ids_check'],
        [{ id: 'gamma', date: '2031-01-03', layoutPuzzleId: 'other' }, 'published_puzzles_record_ids_check'],
        [{ id: 'gamma', date: '2031-01-03', layoutId: 'gamma-layout' }, 'published_puzzles_record_ids_check'],
      ]
      for (const [values, constraint] of checks) {
        expect(await errorOf(() => rawInsert(values)), constraint).toEqual({ code: '23514', constraint })
      }
      expect(await rowCount()).toBe(1)
    })
  })

  describe('store reads and writes', () => {
    it('round-trips DATE as YYYY-MM-DD text and created_at as UTC ISO text', async () => {
      await admin.query('DELETE FROM published_puzzles')
      const record = await publicationFor(catsRequest({ id: 'roundtrip' }), '2031-02-28')
      const created = await store().transaction((tx) => tx.insert(record))
      expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

      const read = await store().reader().findById('roundtrip')
      expect(read).toEqual({ ...record, createdAt: created.createdAt })
      expect(await store().reader().latestPublishDate()).toBe('2031-02-28')
      expect(typeof read?.publishDate).toBe('string')
    })

    it('uses the database clock', async () => {
      const before = Date.now()
      const readerNow = await store().reader().now()
      const txNow = await store().transaction((tx) => tx.now())
      for (const now of [readerNow, txNow]) {
        expect(Number.isNaN(now.getTime())).toBe(false)
        expect(Math.abs(now.getTime() - before)).toBeLessThan(5 * 60_000)
      }
    })

    it('rolls back everything when the transaction fails', async () => {
      await admin.query('DELETE FROM published_puzzles')
      const record = await publicationFor(catsRequest({ id: 'rolledback' }), '2031-03-01')
      await expect(
        store().transaction(async (tx) => {
          await tx.insert(record)
          throw new Error('later failure')
        }),
      ).rejects.toThrow('later failure')
      expect(await rowCount()).toBe(0)
    })

    it('maps unique violations and the release guard to contention errors', async () => {
      await admin.query('DELETE FROM published_puzzles')
      const first = await publicationFor(catsRequest({ id: 'taken' }), '2031-04-01')
      await store().transaction((tx) => tx.insert(first))

      const sameId = await publicationFor(catsRequest({ id: 'taken' }), '2031-04-02')
      await expect(store().transaction((tx) => tx.insert(sameId))).rejects.toMatchObject({ reason: 'puzzle-id-taken' })
      const sameDate = await publicationFor(batsRequest({ id: 'other' }), '2031-04-01')
      await expect(store().transaction((tx) => tx.insert(sameDate))).rejects.toMatchObject({ reason: 'publish-date-taken' })
      const released = await publicationFor(batsRequest({ id: 'released' }), '2020-01-01')
      await expect(store().transaction((tx) => tx.insert(released))).rejects.toMatchObject({ reason: 'release-slot-passed' })
      expect(await rowCount()).toBe(1)
    })

    it('reports a real SERIALIZABLE conflict as retryable contention', async () => {
      await admin.query('DELETE FROM published_puzzles')
      let arrived = 0
      let releaseBoth!: () => void
      const bothRead = new Promise<void>((resolve) => {
        releaseBoth = resolve
      })
      const racer = (id: string, date: string) =>
        store().transaction(async (tx) => {
          await tx.latestPublishDate()
          if (++arrived === 2) releaseBoth()
          await bothRead
          return tx.insert(await publicationFor(batsRequest({ id, clue: id }), date))
        })

      const results = await Promise.allSettled([racer('racea', '2031-05-01'), racer('raceb', '2031-05-02')])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      const [rejected] = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      expect(rejected.reason).toBeInstanceOf(PublicationContentionError)
      expect(rejected.reason.reason).toBe('serialization')
      expect(await rowCount()).toBe(1)
    })
  })

  describe('publishing through the real store', () => {
    it('creates once, is idempotent on repeat, and rejects different content without overwriting', async () => {
      await admin.query('DELETE FROM published_puzzles')
      const neonStore = store()
      const dbNowBefore = await neonStore.reader().now()
      const created = await publishFinalPuzzle(catsRequest({ id: 'realcats' }), neonStore)
      const dbNowAfter = await neonStore.reader().now()

      expect(created.kind).toBe('created')
      if (created.kind !== 'created') return
      // The Phase 1 rule applied to the database clock (either side of the call, in case it straddled 10 PM ET).
      expect([earliestPublishDate(dbNowBefore), earliestPublishDate(dbNowAfter)]).toContain(created.publication.publishDate)
      expect(await rowCount()).toBe(1)

      const repeat = await publishFinalPuzzle(catsRequest({ id: 'realcats' }), neonStore)
      expect(repeat).toEqual({ kind: 'existing', publication: created.publication })
      expect(await rowCount()).toBe(1)

      const conflict = await publishFinalPuzzle(catsRequest({ id: 'realcats', clue: 'Felines' }), neonStore)
      expect(conflict.kind).toBe('conflict')
      const stored = await neonStore.reader().findById('realcats')
      expect(stored?.contentFingerprint).toBe(created.publication.contentFingerprint)
      expect(stored?.puzzle.clue).toBe('Cats')

      expect(await previewPublication(catsRequest({ id: 'realcats' }), neonStore)).toMatchObject({ kind: 'existing' })
      const next = await previewPublication(batsRequest({ id: 'nextbats' }), neonStore)
      expect(next.kind === 'estimate' && next.publishDate).toBe(
        assignPublishDate(created.publication.publishDate, earliestPublishDate(await neonStore.reader().now())),
      )
      expect(await rowCount()).toBe(1)
    }, 60_000)

    it('gives concurrent publishers unique permanent dates, resolving contention by fresh retries', async () => {
      await admin.query('DELETE FROM published_puzzles')
      const requests = [1, 2, 3, 4, 5].map((n) => batsRequest({ id: `concurrent${n}`, clue: `Concurrent ${n}` }))
      const outcomes = await Promise.all(requests.map((request) => publishFinalPuzzle(request, store())))
      expect(outcomes.every((outcome) => outcome.kind === 'created' || outcome.kind === 'busy')).toBe(true)
      expect(outcomes.some((outcome) => outcome.kind === 'created')).toBe(true)

      // Any publisher that ran out of attempts succeeds on a later, uncontended try.
      for (const [index, outcome] of outcomes.entries()) {
        if (outcome.kind === 'busy') expect((await publishFinalPuzzle(requests[index], store())).kind).toBe('created')
      }
      const rows = await admin.query('SELECT puzzle_id, publish_date::text AS d FROM published_puzzles ORDER BY publish_date')
      expect(rows.rows).toHaveLength(5)
      expect(new Set(rows.rows.map((row) => row.puzzle_id)).size).toBe(5)
      const dates: string[] = rows.rows.map((row) => row.d)
      expect(new Set(dates).size).toBe(5)
      // Consecutive days: nothing skipped, nothing doubled.
      for (let i = 1; i < dates.length; i++) {
        const gap = (Date.parse(`${dates[i]}T00:00:00Z`) - Date.parse(`${dates[i - 1]}T00:00:00Z`)) / 86_400_000
        expect(gap).toBe(1)
      }
    }, 120_000)
  })
})
