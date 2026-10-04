// Pure handlers for the player's read-only puzzle API:
//
//   GET /api/calendar            -> { current, dates }
//   GET /api/puzzle?date=D       -> { publishDate, puzzle, layout }
//
// Framework-free: a minimal request ({ method, url }) in, { status, headers,
// body } out, with the ReleasedPuzzleReader injected. The api/ files adapt
// these to Vercel unchanged.
//
// The released_puzzles view is the security boundary. As defense in depth,
// every row is re-checked here against the TypeScript release rule at the
// database time it was read; any disagreement, malformed row, or read
// failure is a sanitized 503 — never a partial or suspect response.

import { isDateKey } from '../../src/publishing/dateKey.js'
import { publicationStatus } from '../../src/publishing/releaseSchedule.js'
import type { DateKey } from '../../src/publishing/types'
import type { CacheHeaders } from './cacheHeaders'
import { NO_STORE, calendarCacheHeaders, notFoundCacheHeaders, releasedPuzzleCacheHeaders } from './cacheHeaders.js'
import type { ReleasedPuzzleReader } from './releasedPuzzleReader'
import { parseCalendarEntry, parseReleasedPuzzle } from './validateReleasedPuzzle.js'
import type { CalendarEntry, ReleasedPuzzle } from './validateReleasedPuzzle'

export interface ApiRequest {
  method: string
  /** Absolute or path-relative URL, including the query string. */
  url: string
}

export interface ApiResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

export interface PuzzleApiDeps {
  /** Undefined when PUZZLES_READ_DATABASE_URL isn't configured. */
  reader: ReleasedPuzzleReader | undefined
}

/** Public JSON: published content only — no fingerprints, versions, or timestamps. */
export interface PublicPuzzle {
  publishDate: DateKey
  puzzleId: string
  puzzle: ReleasedPuzzle['puzzle']
  layout: ReleasedPuzzle['layout']
}

export interface CalendarBody {
  current: PublicPuzzle | null
  /** Ascending by publishDate (oldest first). */
  dates: CalendarEntry[]
}

export interface PuzzleBody {
  publishDate: DateKey
  puzzle: ReleasedPuzzle['puzzle']
  layout: ReleasedPuzzle['layout']
}

const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' }

function respond(status: number, body: unknown, cache: CacheHeaders, extra: Record<string, string> = {}): ApiResponse {
  return { status, headers: { ...JSON_TYPE, ...cache, ...extra }, body }
}

const methodNotAllowed = () =>
  respond(405, { error: 'method-not-allowed', message: 'Use GET.' }, NO_STORE, { Allow: 'GET' })
const unavailable = () =>
  respond(503, { error: 'unavailable', message: 'Puzzles are temporarily unavailable. Try again shortly.' }, NO_STORE)

class BoundaryViolation extends Error {}

function released(entry: CalendarEntry, now: Date): boolean {
  return publicationStatus(entry.publishDate, now) === 'published'
}

function toPublicPuzzle(puzzle: ReleasedPuzzle): PublicPuzzle {
  return { publishDate: puzzle.publishDate, puzzleId: puzzle.puzzleId, puzzle: puzzle.puzzle, layout: puzzle.layout }
}

export async function handleCalendarRequest(request: ApiRequest, deps: PuzzleApiDeps): Promise<ApiResponse> {
  if (request.method !== 'GET') return methodNotAllowed()
  if (!deps.reader) return unavailable()
  try {
    const read = await deps.reader.readCalendar()
    const dates = read.dates.map((raw) => {
      const entry = parseCalendarEntry(raw)
      if (!entry || !released(entry, read.now)) throw new BoundaryViolation()
      return entry
    })
    for (let i = 1; i < dates.length; i++) {
      if (dates[i - 1].publishDate >= dates[i].publishDate) throw new BoundaryViolation()
    }

    let current: PublicPuzzle | null = null
    if (read.current !== null) {
      const puzzle = parseReleasedPuzzle(read.current)
      if (!puzzle || !released(puzzle, read.now)) throw new BoundaryViolation()
      // The current puzzle must be the newest entry of the same index.
      const newest = dates.at(-1)
      if (!newest || newest.publishDate !== puzzle.publishDate || newest.puzzleId !== puzzle.puzzleId) {
        throw new BoundaryViolation()
      }
      current = toPublicPuzzle(puzzle)
    } else if (dates.length > 0) {
      throw new BoundaryViolation()
    }

    const body: CalendarBody = { current, dates }
    return respond(200, body, calendarCacheHeaders(read.now))
  } catch {
    return unavailable()
  }
}

export async function handlePuzzleRequest(request: ApiRequest, deps: PuzzleApiDeps): Promise<ApiResponse> {
  if (request.method !== 'GET') return methodNotAllowed()
  const date = new URL(request.url, 'http://localhost').searchParams.get('date')
  if (date === null || !isDateKey(date)) {
    return respond(400, { error: 'invalid-date', message: 'Use ?date=YYYY-MM-DD with a real calendar date.' }, NO_STORE)
  }
  if (!deps.reader) return unavailable()
  try {
    const read = await deps.reader.readPuzzle(date)
    if (read.puzzle === null) {
      // Gaps and not-yet-released dates are indistinguishable by design.
      return respond(404, { error: 'not-found', message: 'No puzzle is available for that date.' }, notFoundCacheHeaders(read.now))
    }
    const puzzle = parseReleasedPuzzle(read.puzzle)
    if (!puzzle || puzzle.publishDate !== date || !released(puzzle, read.now)) throw new BoundaryViolation()
    const body: PuzzleBody = { publishDate: puzzle.publishDate, puzzle: puzzle.puzzle, layout: puzzle.layout }
    return respond(200, body, releasedPuzzleCacheHeaders())
  } catch {
    return unavailable()
  }
}
