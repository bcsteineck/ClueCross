import { addMonths, startOfDay, toDateKey } from '../core/archiveCalendar'
import type { PuzzleDefinition } from '../core/types'
import { dogsPuzzleLayout } from '../layout/dogsPuzzleLayout'
import { spacePuzzleLayout } from '../layout/spacePuzzleLayout'
import type { LayoutDefinition } from '../layout/types'
import { dogsPuzzle } from './dogsPuzzle'
import { spacePuzzle } from './spacePuzzle'

export interface ArchiveEntry {
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
}

const PUZZLES = {
  dogs: { puzzle: dogsPuzzle, layout: dogsPuzzleLayout },
  space: { puzzle: spacePuzzle, layout: spacePuzzleLayout },
} satisfies Record<string, ArchiveEntry>

// Explicit date schedule: each puzzle is assigned to exactly one day, as an
// offset from "today" so fixtures stay relative to whenever the app is run
// rather than going stale on a fixed calendar date.
//
// Convention for adding a new puzzle: give it offsetDays: 0 (today) and
// bump every existing row's offsetDays up by one. The newest puzzle is
// always the current day's; older puzzles archive progressively further
// back in the order they were added. (Dogs/Space below predate this
// convention and were left on their original schedule — Dogs today,
// Space yesterday — rather than retroactively reordered.)
const SCHEDULE: { offsetDays: number; puzzleId: keyof typeof PUZZLES }[] = [
  { offsetDays: 0, puzzleId: 'dogs' }, // today
  { offsetDays: 1, puzzleId: 'space' }, // yesterday
]

function buildFixtures(): Record<string, ArchiveEntry> {
  const today = startOfDay(new Date())
  const entries: Record<string, ArchiveEntry> = {}
  for (const { offsetDays, puzzleId } of SCHEDULE) {
    const date = new Date(today)
    date.setDate(date.getDate() - offsetDays)
    entries[toDateKey(date)] = PUZZLES[puzzleId]
  }
  return entries
}

const ARCHIVE_ENTRIES = buildFixtures()

export function getToday(): Date {
  return startOfDay(new Date())
}

export function getArchiveEntryForDate(date: Date): ArchiveEntry | undefined {
  return ARCHIVE_ENTRIES[toDateKey(date)]
}

export function isDateAvailable(date: Date): boolean {
  const today = getToday()
  if (startOfDay(date).getTime() > today.getTime()) return false
  return getArchiveEntryForDate(date) !== undefined
}

// Earliest month worth letting the selector navigate back to, so the picker
// doesn't wander into empty history: one month before the oldest scheduled date.
export function getEarliestArchiveMonth(): Date {
  const today = getToday()
  const maxOffset = Math.max(...SCHEDULE.map((entry) => entry.offsetDays))
  const oldest = new Date(today)
  oldest.setDate(oldest.getDate() - maxOffset)
  return addMonths(oldest, -1)
}
