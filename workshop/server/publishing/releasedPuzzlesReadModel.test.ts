// Real-database contract and security tests for the player read model
// (db/migrations/0002): the release-gated released_puzzles view and the
// cluecross_reader role. Destructive, so guarded exactly like the store
// tests: only the Neon `test` branch (marker table present), plus a reader
// credential for that same branch in PUBLISHING_TEST_READER_DATABASE_URL.

import { Client } from '@neondatabase/serverless'
import { loadEnv } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addDays } from '../../../src/publishing/dateKey'
import { earliestPublishDate, publicationStatus, releaseInstant } from '../../../src/publishing/releaseSchedule'
import type { PublishedPuzzle } from '../../../src/publishing/types'
import {
  TEST_BRANCH_MARKER_TABLE,
  TEST_DATABASE_LOCK_KEY,
  assertTestBranchMarker,
  decideTestDatabase,
} from './testDatabaseGuard'
import { batsRequest, publicationFor } from './testFixtures'
import { createNeonReleasedPuzzleReader } from '../../../server/puzzles/neonReleasedPuzzleReader'
import { handleCalendarRequest, handlePuzzleRequest } from '../../../server/puzzles/puzzleApi'

const env = { ...loadEnv('test', process.cwd(), 'PUBLISHING_'), ...process.env }
const decision = decideTestDatabase({ testUrl: env.PUBLISHING_TEST_DATABASE_URL, workshopUrl: env.PUBLISHING_DATABASE_URL })
const ownerUrl = decision.run ? decision.url : ''
const readerUrl = env.PUBLISHING_TEST_READER_DATABASE_URL?.trim() ?? ''
const runnable = decision.run && readerUrl !== ''
if (runnable && new URL(readerUrl).hostname !== new URL(ownerUrl).hostname) {
  throw new Error('Refusing: PUBLISHING_TEST_READER_DATABASE_URL must point at the same (test) branch as PUBLISHING_TEST_DATABASE_URL.')
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`

let owner: Client
let reader: Client

async function insertAsOwner(record: PublishedPuzzle) {
  await owner.query(
    `INSERT INTO published_puzzles (puzzle_id, publish_date, content_fingerprint, fingerprint_version, puzzle, layout)
     VALUES ($1, $2::date, $3, $4, $5::jsonb, $6::jsonb)`,
    [
      record.puzzleId,
      record.publishDate,
      record.contentFingerprint,
      record.fingerprintVersion,
      JSON.stringify(record.puzzle),
      JSON.stringify(record.layout),
    ],
  )
}

async function readerError(sql: string, params: unknown[] = []): Promise<string | undefined> {
  try {
    await reader.query(sql, params)
  } catch (error) {
    return (error as { code?: string }).code
  }
  return undefined
}

// A puzzle row with a chosen id, date, and clue (real fingerprint, valid ids).
const row = (id: string, date: string, clue: string) => publicationFor(batsRequest({ id, clue }), date)

describe.skipIf(!runnable)('released_puzzles read model (test branch only)', () => {
  beforeAll(async () => {
    owner = new Client(ownerUrl)
    await owner.connect()
    const marker = await owner.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    assertTestBranchMarker(marker.rows[0].present === true)
    // Serializes with the other destructive test file on this branch.
    await owner.query('SELECT pg_advisory_lock($1)', [TEST_DATABASE_LOCK_KEY])
    await owner.query('DELETE FROM published_puzzles')
    reader = new Client(readerUrl)
    await reader.connect()
  }, 60_000)

  afterAll(async () => {
    await reader?.end()
    if (!owner) return
    const marker = await owner.query('SELECT to_regclass($1) IS NOT NULL AS present', [TEST_BRANCH_MARKER_TABLE])
    if (marker.rows[0].present === true) await owner.query('DELETE FROM published_puzzles')
    await owner.query('SELECT pg_advisory_unlock($1)', [TEST_DATABASE_LOCK_KEY])
    await owner.end()
  }, 60_000)

  describe('release rule parity with src/publishing', () => {
    // Standard time, both 2026 DST transitions, and month/year/leap rollovers.
    const dates = ['2026-01-15', '2026-03-08', '2026-03-09', '2026-07-04', '2026-11-01', '2026-11-02', '2027-01-01', '2028-02-29', '2028-03-01']

    it('computes the same release instant as releaseInstant()', async () => {
      for (const date of dates) {
        const result = await reader.query(
          `SELECT to_char(published_puzzle_release_instant($1::date) AT TIME ZONE 'UTC', ${ISO}) AS instant`,
          [date],
        )
        expect(result.rows[0].instant, date).toBe(releaseInstant(date).toISOString())
      }
    })

    it('is eligible exactly at the boundary, matching publicationStatus()', async () => {
      for (const date of dates) {
        const release = releaseInstant(date).getTime()
        for (const at of [release - 1, release, release + 1]) {
          const result = await reader.query('SELECT published_puzzle_release_instant($1::date) <= $2::timestamptz AS released', [
            date,
            new Date(at).toISOString(),
          ])
          const expected = publicationStatus(date, new Date(at)) === 'published'
          expect(result.rows[0].released, `${date} @ ${new Date(at).toISOString()}`).toBe(expected)
        }
      }
    })
  })

  describe('release gating by database time', () => {
    it('shows released rows and hides unreleased ones, judged by the database clock', async () => {
      await owner.query('DELETE FROM published_puzzles')
      const dbNow = new Date((await owner.query(`SELECT to_char(now() AT TIME ZONE 'UTC', ${ISO}) AS now`)).rows[0].now)
      const next = earliestPublishDate(dbNow) // first date not yet released
      const current = addDays(next, -1) // the latest released date
      const records = [
        await row('longago', '2020-01-01', 'Long ago'),
        await row('currentone', current, 'Current'),
        await row('nextone', next, 'Next'),
        await row('farfuture', '2099-01-01', 'Far future'),
      ]
      for (const record of records) await insertAsOwner(record)

      const result = await reader.query(
        `SELECT array_agg(publish_date ORDER BY publish_date) AS dates, to_char(now() AT TIME ZONE 'UTC', ${ISO}) AS now
         FROM released_puzzles`,
      )
      // Expectation from the TypeScript rule at the same database instant the query used.
      const queryNow = new Date(result.rows[0].now)
      const expected = records
        .map((record) => record.publishDate)
        .filter((date) => publicationStatus(date, queryNow) === 'published')
        .sort()
      expect(result.rows[0].dates).toEqual(expected)
      expect(expected).toContain('2020-01-01')
      expect(expected).not.toContain('2099-01-01')
      expect(expected).toContain(current)
    })
  })

  describe('cluecross_reader security', () => {
    beforeAll(async () => {
      await owner.query('DELETE FROM published_puzzles')
      await insertAsOwner(await row('released', '2020-01-01', '1'))
      await insertAsOwner(await row('futuresecret', '2099-01-01', 'Future secret clue'))
    })

    it('can read the view, and only released rows', async () => {
      const result = await reader.query('SELECT puzzle_id FROM released_puzzles ORDER BY publish_date')
      expect(result.rows).toEqual([{ puzzle_id: 'released' }])
      expect((await reader.query("SELECT * FROM released_puzzles WHERE puzzle_id = 'futuresecret'")).rows).toEqual([])
      expect((await reader.query("SELECT * FROM released_puzzles WHERE publish_date = '2099-01-01'")).rows).toEqual([])
    })

    it('cannot read or change the base table', async () => {
      expect(await readerError('SELECT * FROM published_puzzles')).toBe('42501')
      expect(await readerError("SELECT puzzle_id FROM published_puzzles WHERE puzzle_id = 'futuresecret'")).toBe('42501')
      // Even with a read-write transaction, privileges alone refuse every write.
      for (const sql of [
        "INSERT INTO published_puzzles (puzzle_id, publish_date, content_fingerprint, fingerprint_version, puzzle, layout) VALUES ('x', '2030-01-01', repeat('a', 64), 1, '{}', '{}')",
        "UPDATE published_puzzles SET publish_date = '2030-01-02'",
        'DELETE FROM published_puzzles',
        "UPDATE released_puzzles SET puzzle_id = 'renamed'",
        'DELETE FROM released_puzzles',
      ]) {
        await reader.query('BEGIN READ WRITE')
        expect(await readerError(sql), sql).toBe('42501')
        await reader.query('ROLLBACK')
      }
      // And by default every reader session is read-only.
      expect(await readerError('DELETE FROM released_puzzles')).toMatch(/^(25006|42501)$/)
      expect((await owner.query('SELECT count(*)::int AS n FROM published_puzzles')).rows[0].n).toBe(2)
    })

    it('cannot create temporary objects or read anything else', async () => {
      await reader.query('BEGIN READ WRITE')
      expect(await readerError('CREATE TEMP TABLE probe (x int)')).toBe('42501')
      await reader.query('ROLLBACK')
      expect(await readerError(`SELECT * FROM ${TEST_BRANCH_MARKER_TABLE}`)).toBe('42501')
      const membership = await reader.query(
        "SELECT pg_has_role('cluecross_reader', 'neon_superuser', 'MEMBER') AS superuser_member, current_setting('default_transaction_read_only') AS read_only",
      )
      expect(membership.rows[0]).toEqual({ superuser_member: false, read_only: 'on' })
    })

    it('cannot make the view evaluate a caller condition against an unreleased row', async () => {
      // Without the security barrier, the cast could be evaluated against the
      // unreleased row first and fail with its clue text in the error.
      const result = await reader.query("SELECT count(*)::int AS n FROM released_puzzles WHERE (puzzle->>'clue')::int > 0")
      expect(result.rows[0].n).toBe(1)
    })
  })

  describe('data contract', () => {
    it('exposes exactly the columns the player API needs, with publish_date as text', async () => {
      await owner.query('DELETE FROM published_puzzles')
      const record = await row('contract', '2020-02-29', 'Contract')
      await insertAsOwner(record)

      const result = await reader.query('SELECT * FROM released_puzzles')
      expect(result.fields.map((field) => field.name)).toEqual([
        'puzzle_id',
        'publish_date',
        'content_fingerprint',
        'fingerprint_version',
        'puzzle',
        'layout',
      ])
      expect(result.rows[0]).toEqual({
        puzzle_id: 'contract',
        publish_date: '2020-02-29',
        content_fingerprint: record.contentFingerprint,
        fingerprint_version: 1,
        puzzle: record.puzzle,
        layout: record.layout,
      })
      const clock = await reader.query(`SELECT to_char(statement_timestamp() AT TIME ZONE 'UTC', ${ISO}) AS now`)
      expect(Math.abs(new Date(clock.rows[0].now).getTime() - Date.now())).toBeLessThan(5 * 60_000)
    })
  })

  describe('player API read path (server/puzzles) through the real reader', () => {
    it('serves the released calendar and puzzles, and 404s gaps and unreleased dates identically', async () => {
      await owner.query('DELETE FROM published_puzzles')
      const dbNow = new Date((await owner.query(`SELECT to_char(now() AT TIME ZONE 'UTC', ${ISO}) AS now`)).rows[0].now)
      const next = earliestPublishDate(dbNow)
      const current = addDays(next, -1)
      const older = addDays(current, -3) // leaves a two-day gap before current
      for (const record of [
        await row('olderone', older, 'Older'),
        await row('currentone', current, 'Current'),
        await row('nextone', next, 'Next'),
      ]) {
        await insertAsOwner(record)
      }
      const deps = { reader: createNeonReleasedPuzzleReader(readerUrl) }

      const calendar = await handleCalendarRequest({ method: 'GET', url: '/api/calendar' }, deps)
      expect(calendar.status).toBe(200)
      const body = calendar.body as { current: { publishDate: string; puzzleId: string }; dates: unknown[] }
      expect(body.dates).toEqual([
        { publishDate: older, puzzleId: 'olderone' },
        { publishDate: current, puzzleId: 'currentone' },
      ])
      expect(body.current).toMatchObject({ publishDate: current, puzzleId: 'currentone' })
      expect(calendar.headers['Vercel-CDN-Cache-Control']).toMatch(/^public, s-maxage=\d+$/)

      const released = await handlePuzzleRequest({ method: 'GET', url: `/api/puzzle?date=${current}` }, deps)
      expect(released.status).toBe(200)
      expect(released.body).toMatchObject({ publishDate: current, puzzle: { id: 'currentone', clue: 'Current' } })

      const unreleased = await handlePuzzleRequest({ method: 'GET', url: `/api/puzzle?date=${next}` }, deps)
      const gap = await handlePuzzleRequest({ method: 'GET', url: `/api/puzzle?date=${addDays(current, -1)}` }, deps)
      expect(unreleased.status).toBe(404)
      expect(unreleased.body).toEqual(gap.body)
      expect(JSON.stringify(unreleased)).not.toMatch(/nextone|Next/)
    })
  })
})
