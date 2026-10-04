// ReleasedPuzzleReader over Neon's HTTP driver: one-shot queries, no
// connection lifecycle or transaction. It connects with
// PUZZLES_READ_DATABASE_URL only — a cluecross_reader credential — and never
// falls back to any other database variable. Each read is one statement, so
// the view's release filter and the returned `now` are the same instant.
// Dates stay YYYY-MM-DD text; timestamps come back as UTC ISO text.

import { neon } from '@neondatabase/serverless'
import type { CalendarRead, PuzzleRead, RawCalendarEntry, RawReleasedPuzzle, ReleasedPuzzleReader } from './releasedPuzzleReader'

export const READER_DATABASE_URL_VARIABLE = 'PUZZLES_READ_DATABASE_URL'

type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>

const NOW = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
const PUZZLE_JSON = `json_build_object('publishDate', publish_date, 'puzzleId', puzzle_id, 'puzzle', puzzle, 'layout', layout)`

// One round trip: the date index (small), plus the full content of the
// current puzzle only.
const CALENDAR_SQL = `
  SELECT ${NOW} AS now,
    (SELECT coalesce(json_agg(json_build_object('publishDate', publish_date, 'puzzleId', puzzle_id) ORDER BY publish_date), '[]'::json)
       FROM released_puzzles) AS dates,
    (SELECT ${PUZZLE_JSON} FROM released_puzzles ORDER BY publish_date DESC LIMIT 1) AS current`

const PUZZLE_SQL = `
  SELECT ${NOW} AS now,
    (SELECT ${PUZZLE_JSON} FROM released_puzzles WHERE publish_date = $1) AS puzzle`

function parseNow(value: unknown): Date {
  const now = new Date(String(value))
  if (Number.isNaN(now.getTime())) throw new Error('The database returned no usable time.')
  return now
}

function parseDates(value: unknown): RawCalendarEntry[] {
  if (!Array.isArray(value)) throw new Error('The database returned a malformed date index.')
  return value as RawCalendarEntry[]
}

export function createNeonReleasedPuzzleReader(connectionString: string, query?: Query): ReleasedPuzzleReader {
  const run: Query =
    query ??
    ((sql) => (text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>)(neon(connectionString))

  return {
    async readCalendar(): Promise<CalendarRead> {
      const [row] = await run(CALENDAR_SQL)
      return {
        now: parseNow(row?.now),
        dates: parseDates(row?.dates),
        current: (row?.current ?? null) as RawReleasedPuzzle | null,
      }
    },
    async readPuzzle(publishDate: string): Promise<PuzzleRead> {
      const [row] = await run(PUZZLE_SQL, [publishDate])
      return { now: parseNow(row?.now), puzzle: (row?.puzzle ?? null) as RawReleasedPuzzle | null }
    },
  }
}

/** The reader for this environment, or undefined when PUZZLES_READ_DATABASE_URL is unset. Never any other variable. */
export function readerFromEnvironment(env: Record<string, string | undefined>): ReleasedPuzzleReader | undefined {
  const url = env[READER_DATABASE_URL_VARIABLE]?.trim()
  return url ? createNeonReleasedPuzzleReader(url) : undefined
}
