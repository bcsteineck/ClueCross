// Browser client for the read-only published-puzzle API. It calls only
// GET /api/calendar and GET /api/puzzle?date=YYYY-MM-DD, validates every
// response with the shared published-content rules, and never decides
// release itself: the server's calendar is authoritative for which puzzles
// exist and which one is current.

import { parseCalendarEntry, parseReleasedPuzzle } from '../publishing/publishedContent'
import type { CalendarEntry, ReleasedPuzzle } from '../publishing/publishedContent'
import { isDateKey, parseDateKey } from '../publishing/dateKey'
import type { DateKey } from '../publishing/types'
import { addMonths, startOfMonth } from '../core/archiveCalendar'

export const CALENDAR_ENDPOINT = '/api/calendar'
export const PUZZLE_ENDPOINT = '/api/puzzle'

export type PublishedPuzzle = ReleasedPuzzle
export type { CalendarEntry }

export interface PuzzleCalendar {
  current: PublishedPuzzle | null
  /** Every released date, oldest first. */
  dates: CalendarEntry[]
}

export type CalendarResult = { ok: true; calendar: PuzzleCalendar } | { ok: false }
export type PuzzleResult = { kind: 'ready'; puzzle: PublishedPuzzle } | { kind: 'unavailable' } | { kind: 'error' }

export interface PuzzleCalendarClient {
  fetchCalendar(): Promise<CalendarResult>
  fetchPuzzle(date: DateKey): Promise<PuzzleResult>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A usable calendar from an /api/calendar body, or null. */
export function parseCalendarBody(body: unknown): PuzzleCalendar | null {
  if (!isRecord(body) || !Array.isArray(body.dates)) return null
  const dates: CalendarEntry[] = []
  for (const raw of body.dates) {
    const entry = isRecord(raw) ? parseCalendarEntry({ publishDate: raw.publishDate, puzzleId: raw.puzzleId }) : null
    if (!entry || (dates.length > 0 && dates[dates.length - 1].publishDate >= entry.publishDate)) return null
    dates.push(entry)
  }
  if (body.current === null) return dates.length === 0 ? { current: null, dates } : null
  const raw = body.current
  if (!isRecord(raw)) return null
  const current = parseReleasedPuzzle({ publishDate: raw.publishDate, puzzleId: raw.puzzleId, puzzle: raw.puzzle, layout: raw.layout })
  const newest = dates[dates.length - 1]
  if (!current || !newest || newest.publishDate !== current.publishDate || newest.puzzleId !== current.puzzleId) return null
  return { current, dates }
}

/** A usable puzzle from an /api/puzzle body for `date`, or null. */
export function parsePuzzleBody(body: unknown, date: DateKey): PublishedPuzzle | null {
  if (!isRecord(body) || !isRecord(body.puzzle)) return null
  const puzzle = parseReleasedPuzzle({
    publishDate: body.publishDate,
    puzzleId: body.puzzle.id,
    puzzle: body.puzzle,
    layout: body.layout,
  })
  return puzzle && puzzle.publishDate === date ? puzzle : null
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<{ status: number; body: unknown } | null> {
  try {
    const response = await fetchImpl(url, { headers: { accept: 'application/json' } })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      // Unreadable body: judged by status alone below.
    }
    return { status: response.status, body }
  } catch {
    return null
  }
}

export function createPuzzleCalendarClient(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): PuzzleCalendarClient {
  return {
    async fetchCalendar() {
      const result = await getJson(fetchImpl, CALENDAR_ENDPOINT)
      const calendar = result?.status === 200 ? parseCalendarBody(result.body) : null
      return calendar ? { ok: true, calendar } : { ok: false }
    },
    async fetchPuzzle(date) {
      if (!isDateKey(date)) return { kind: 'unavailable' }
      const result = await getJson(fetchImpl, `${PUZZLE_ENDPOINT}?date=${date}`)
      if (result?.status === 404) return { kind: 'unavailable' }
      const puzzle = result?.status === 200 ? parsePuzzleBody(result.body, date) : null
      return puzzle ? { kind: 'ready', puzzle } : { kind: 'error' }
    },
  }
}

/** The local-midnight Date the Archive calendar uses for a DateKey. */
export function dateFromKey(key: DateKey): Date {
  const { year, month, day } = parseDateKey(key)
  return new Date(year, month - 1, day)
}

/** Archive month range: one month before the oldest released date through the current publish date's month. */
export function archiveMonthRange(calendar: PuzzleCalendar): { earliestMonth: Date; latestMonth: Date } {
  const latest = calendar.current ? dateFromKey(calendar.current.publishDate) : new Date()
  const oldest = calendar.dates[0] ? dateFromKey(calendar.dates[0].publishDate) : latest
  return { earliestMonth: addMonths(startOfMonth(oldest), -1), latestMonth: startOfMonth(latest) }
}
