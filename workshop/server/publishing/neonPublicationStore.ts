// PublicationStore on Neon Postgres (db/migrations/0001). Server-only: the
// Workshop's local Node server creates it from PUBLISHING_DATABASE_URL, a
// DIRECT (unpooled) connection string; nothing here reaches a browser.
//
//   - transaction(): one fresh WebSocket Client per attempt, BEGIN ISOLATION
//     LEVEL SERIALIZABLE, COMMIT on success, ROLLBACK on failure, and the
//     Client always closed in finally. Node's global WebSocket is used (no
//     `ws` dependency).
//   - reader(): one-shot HTTP queries for preview, no transaction.
//   - Dates never pass through JavaScript Date parsing: publish_date is
//     selected as text, and timestamps as UTC ISO text.
//   - Postgres errors map onto the store contract (publicationStore.ts):
//     40001 serialization failures (observed at INSERT or COMMIT) and 23505
//     unique violations become PublicationContentionError; anything else
//     propagates as an infrastructure failure.
//   - insert() carries the database-side release guard: it inserts nothing
//     unless the date's 10 PM Eastern release is still after
//     statement_timestamp(), which is reported as 'release-slot-passed'.
//     deleteScheduled() and moveScheduled() carry the same guard, so the
//     scheduled-queue compaction can never touch a released row.
//
// Date assignment stays in the domain (publishPuzzle.ts); SQL only guards.

import { Client, neon } from '@neondatabase/serverless'
import { PUBLICATION_TIME_ZONE } from '../../../src/publishing/easternTime'
import { RELEASE_HOUR } from '../../../src/publishing/releaseSchedule'
import type { DateKey, PublishedPuzzle } from '../../../src/publishing/types'
import { PublicationContentionError } from './publicationStore'
import type {
  CalendarRecord,
  NewPublication,
  PublicationReader,
  PublicationStore,
  PublicationTransaction,
} from './publicationStore'

type Row = Record<string, unknown>

/** The subset of the Neon Client the store uses (injectable for tests). */
export interface SqlClient {
  connect(): Promise<unknown>
  query(text: string, params?: unknown[]): Promise<{ rows: Row[] }>
  end(): Promise<void>
}

export interface NeonPublicationStoreOptions {
  createClient?: (connectionString: string) => SqlClient
  /** One-shot query function for reader(); defaults to Neon's HTTP driver. */
  createReaderQuery?: (connectionString: string) => (text: string, params?: unknown[]) => Promise<Row[]>
}

// Timestamps as UTC ISO 8601 text, parsed explicitly (never via the driver's type parsers).
const isoText = (expression: string) => `to_char(${expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

const SELECT_PUBLICATION = `
  SELECT puzzle_id, publish_date::text AS publish_date, content_fingerprint, fingerprint_version,
         puzzle, layout, ${isoText('created_at')} AS created_at
  FROM published_puzzles WHERE puzzle_id = $1`
const SELECT_LATEST = 'SELECT max(publish_date)::text AS latest FROM published_puzzles'
const SELECT_NOW = `SELECT ${isoText('statement_timestamp()')} AS now`
// The release guard: ((D − 1) + 22:00) as wall time in America/New_York,
// converted to an instant by Postgres's own zone rules.
const INSERT_PUBLICATION = `
  INSERT INTO published_puzzles
    (puzzle_id, publish_date, content_fingerprint, fingerprint_version, puzzle, layout)
  SELECT $1, $2::date, $3, $4, $5::jsonb, $6::jsonb
  WHERE ((($2::date - 1) + make_time($7, 0, 0)) AT TIME ZONE $8) > statement_timestamp()
  RETURNING ${isoText('created_at')} AS created_at`
// Metadata only: the clue is read out of the stored puzzle, nothing else.
const SELECT_CALENDAR = `
  SELECT puzzle_id, publish_date::text AS publish_date, puzzle->>'clue' AS clue, content_fingerprint, fingerprint_version
  FROM published_puzzles ORDER BY publish_date`
// Scheduled-queue changes carry the same release guard as INSERT: a row is
// deleted, or moved onto a date, only while that date's release is still
// after statement_timestamp(). Released rows therefore never change.
const DELETE_SCHEDULED = `
  DELETE FROM published_puzzles
  WHERE puzzle_id = $1 AND publish_date = $2::date
    AND ((($2::date - 1) + make_time($3, 0, 0)) AT TIME ZONE $4) > statement_timestamp()
  RETURNING puzzle_id`
const MOVE_SCHEDULED = `
  UPDATE published_puzzles SET publish_date = $3::date
  WHERE puzzle_id = $1 AND publish_date = $2::date
    AND ((($3::date - 1) + make_time($4, 0, 0)) AT TIME ZONE $5) > statement_timestamp()
  RETURNING puzzle_id`

function toPublication(row: Row): PublishedPuzzle {
  return {
    puzzleId: String(row.puzzle_id),
    publishDate: String(row.publish_date),
    contentFingerprint: String(row.content_fingerprint),
    fingerprintVersion: Number(row.fingerprint_version) as PublishedPuzzle['fingerprintVersion'],
    puzzle: row.puzzle as PublishedPuzzle['puzzle'],
    layout: row.layout as PublishedPuzzle['layout'],
    createdAt: String(row.created_at),
  }
}

function errorField(error: unknown, field: 'code' | 'constraint'): string | undefined {
  if (typeof error !== 'object' || error === null || !(field in error)) return undefined
  const value = (error as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : undefined
}

/** Maps a Postgres error onto the store contract; other errors pass through unchanged. */
export function classifyDatabaseError(error: unknown): unknown {
  if (error instanceof PublicationContentionError) return error
  const code = errorField(error, 'code')
  if (code === '40001') return new PublicationContentionError('serialization')
  if (code === '23505') {
    const constraint = errorField(error, 'constraint')
    if (constraint === 'published_puzzles_pkey') return new PublicationContentionError('puzzle-id-taken')
    if (constraint === 'published_puzzles_publish_date_key') return new PublicationContentionError('publish-date-taken')
  }
  return error
}

function readerFor(query: (text: string, params?: unknown[]) => Promise<Row[]>): PublicationReader {
  return {
    async now() {
      const [row] = await query(SELECT_NOW)
      return new Date(String(row.now))
    },
    async findById(puzzleId) {
      const [row] = await query(SELECT_PUBLICATION, [puzzleId])
      return row ? toPublication(row) : null
    },
    async latestPublishDate(): Promise<DateKey | null> {
      const [row] = await query(SELECT_LATEST)
      return row?.latest === null || row?.latest === undefined ? null : String(row.latest)
    },
    async listCalendar(): Promise<CalendarRecord[]> {
      return (await query(SELECT_CALENDAR)).map((row) => ({
        puzzleId: String(row.puzzle_id),
        publishDate: String(row.publish_date),
        clue: String(row.clue ?? ''),
        contentFingerprint: String(row.content_fingerprint),
        fingerprintVersion: Number(row.fingerprint_version) as CalendarRecord['fingerprintVersion'],
      }))
    },
  }
}

export function createNeonPublicationStore(
  connectionString: string,
  options: NeonPublicationStoreOptions = {},
): PublicationStore {
  const createClient = options.createClient ?? ((url: string) => new Client(url))
  const createReaderQuery =
    options.createReaderQuery ??
    ((url: string) => {
      const sql = neon(url)
      return (text: string, params?: unknown[]) => sql.query(text, params) as Promise<Row[]>
    })
  let readerQuery: ((text: string, params?: unknown[]) => Promise<Row[]>) | undefined

  return {
    reader() {
      readerQuery ??= createReaderQuery(connectionString)
      return readerFor(readerQuery)
    },

    async transaction<T>(fn: (tx: PublicationTransaction) => Promise<T>): Promise<T> {
      const client = createClient(connectionString)
      try {
        await client.connect()
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
        const query = async (text: string, params?: unknown[]) => (await client.query(text, params)).rows
        const tx: PublicationTransaction = {
          ...readerFor(query),
          async insert(record: NewPublication) {
            let rows: Row[]
            try {
              rows = await query(INSERT_PUBLICATION, [
                record.puzzleId,
                record.publishDate,
                record.contentFingerprint,
                record.fingerprintVersion,
                JSON.stringify(record.puzzle),
                JSON.stringify(record.layout),
                RELEASE_HOUR,
                PUBLICATION_TIME_ZONE,
              ])
            } catch (error) {
              throw classifyDatabaseError(error)
            }
            if (rows.length === 0) throw new PublicationContentionError('release-slot-passed')
            return { ...structuredClone(record), createdAt: String(rows[0].created_at) }
          },
          async deleteScheduled(puzzleId: string, publishDate: DateKey) {
            try {
              const rows = await query(DELETE_SCHEDULED, [puzzleId, publishDate, RELEASE_HOUR, PUBLICATION_TIME_ZONE])
              return rows.length === 1
            } catch (error) {
              throw classifyDatabaseError(error)
            }
          },
          async moveScheduled(puzzleId: string, from: DateKey, to: DateKey) {
            try {
              const rows = await query(MOVE_SCHEDULED, [puzzleId, from, to, RELEASE_HOUR, PUBLICATION_TIME_ZONE])
              return rows.length === 1
            } catch (error) {
              throw classifyDatabaseError(error)
            }
          },
        }

        try {
          const result = await fn(tx)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {})
          throw classifyDatabaseError(error)
        }
      } finally {
        await client.end().catch(() => {})
      }
    },
  }
}
