import { addMonths, startOfDay, toDateKey } from '../core/archiveCalendar'
import type { PuzzleDefinition } from '../core/types'
import { dogsPuzzleLayout } from '../layout/dogsPuzzleLayout'
import { flowerPuzzleLayout } from '../layout/flowerPuzzleLayout'
import { fruitPuzzleLayout } from '../layout/fruitPuzzleLayout'
import { magicPuzzleLayout } from '../layout/magicPuzzleLayout'
import { spacePuzzleLayout } from '../layout/spacePuzzleLayout'
import type { LayoutDefinition } from '../layout/types'
import { dogsPuzzle } from './dogsPuzzle'
import { flowerPuzzle } from './flowerPuzzle'
import { fruitPuzzle } from './fruitPuzzle'
import { magicPuzzle } from './magicPuzzle'
import { spacePuzzle } from './spacePuzzle'

export interface ArchiveEntry {
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
}

const PUZZLES = {
  dogs: { puzzle: dogsPuzzle, layout: dogsPuzzleLayout },
  space: { puzzle: spacePuzzle, layout: spacePuzzleLayout },
  fruit: { puzzle: fruitPuzzle, layout: fruitPuzzleLayout },
  magic: { puzzle: magicPuzzle, layout: magicPuzzleLayout },
  flower: { puzzle: flowerPuzzle, layout: flowerPuzzleLayout },
} satisfies Record<string, ArchiveEntry>

// Explicit date schedule: each puzzle is assigned to exactly one day, as an
// offset from "today" so fixtures stay relative to whenever the app is run
// rather than going stale on a fixed calendar date.
//
// Convention for adding a new puzzle: give it offsetDays: 0 (today) and
// bump every existing row's offsetDays up by one. The newest puzzle is
// always the current day's; older puzzles archive progressively further
// back in the order they were added.
const SCHEDULE: { offsetDays: number; puzzleId: keyof typeof PUZZLES }[] = [
  { offsetDays: 0, puzzleId: 'flower' }, // today
  { offsetDays: 1, puzzleId: 'magic' }, // yesterday
  { offsetDays: 2, puzzleId: 'fruit' },
  { offsetDays: 3, puzzleId: 'dogs' },
  { offsetDays: 4, puzzleId: 'space' },
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
