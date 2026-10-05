// The player API's read interface onto the release-gated calendar. Every
// implementation reads ONLY the released_puzzles view (db/migrations/0002),
// as the read-only cluecross_reader role, and returns the database time the
// read was judged at, so handlers can re-check each row against the
// TypeScript release rule. Rows are returned untrusted (`unknown` JSON):
// the handlers validate them before anything reaches a response.

import type { RawCalendarEntry, RawPublishedPuzzle } from '../../src/publishing/publishedContent'

/** One released puzzle as read from the view, not yet validated. */
export type RawReleasedPuzzle = RawPublishedPuzzle
export type { RawCalendarEntry }

export interface CalendarRead {
  /** Database time the view was filtered at. */
  now: Date
  /** Every released (date, id), ascending by publish date. */
  dates: RawCalendarEntry[]
  /** The released puzzle with the greatest publish date, or null. */
  current: RawReleasedPuzzle | null
}

export interface PuzzleRead {
  now: Date
  puzzle: RawReleasedPuzzle | null
}

export interface ReleasedPuzzleReader {
  readCalendar(): Promise<CalendarRead>
  /** `publishDate` must already be a validated DateKey. */
  readPuzzle(publishDate: string): Promise<PuzzleRead>
}
