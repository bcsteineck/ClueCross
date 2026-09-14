import { getEntriesForCell } from '../core/puzzleQueries'
import type { CellId, Entry, PuzzleDefinition } from '../core/types'
import { deriveEntryDirection } from './entryDirection'
import type { Direction } from './entryDirection'
import type { LayoutDefinition } from './types'

// Entry.cellIds isn't guaranteed to already be listed start-to-end, so the
// entry's cells are ordered by their actual layout position (left-to-right
// for across, top-to-bottom for down) rather than trusting array order.
function orderedEntryCellIds(entry: Entry, layout: LayoutDefinition, direction: Direction): CellId[] {
  const axis = direction === 'across' ? 'x' : 'y'
  return [...entry.cellIds].sort(
    (a, b) => layout.cellPositions[a][axis] - layout.cellPositions[b][axis],
  )
}

function getEntryForDirection(
  puzzle: PuzzleDefinition,
  layout: LayoutDefinition,
  cellId: CellId,
  direction: Direction,
): Entry | undefined {
  return getEntriesForCell(puzzle, cellId).find(
    (entry) => deriveEntryDirection(entry, layout) === direction,
  )
}

// Walks forward from cellId within its own contiguous entry (in the given
// direction), skipping locked cells, and stopping — returning null — at the
// entry's end rather than spilling into a different, unrelated entry that
// happens to share a row/column.
export function getNextCellInEntry(
  puzzle: PuzzleDefinition,
  layout: LayoutDefinition,
  cellId: CellId,
  direction: Direction,
  lockedCellIds: Record<CellId, true>,
): CellId | null {
  const entry = getEntryForDirection(puzzle, layout, cellId, direction)
  if (!entry) return null
  const ordered = orderedEntryCellIds(entry, layout, direction)
  const index = ordered.indexOf(cellId)
  if (index === -1) return null
  for (let i = index + 1; i < ordered.length; i++) {
    if (!lockedCellIds[ordered[i]]) return ordered[i]
  }
  return null
}

// Same as getNextCellInEntry, but walking backward — used for backspace.
export function getPreviousCellInEntry(
  puzzle: PuzzleDefinition,
  layout: LayoutDefinition,
  cellId: CellId,
  direction: Direction,
  lockedCellIds: Record<CellId, true>,
): CellId | null {
  const entry = getEntryForDirection(puzzle, layout, cellId, direction)
  if (!entry) return null
  const ordered = orderedEntryCellIds(entry, layout, direction)
  const index = ordered.indexOf(cellId)
  if (index === -1) return null
  for (let i = index - 1; i >= 0; i--) {
    if (!lockedCellIds[ordered[i]]) return ordered[i]
  }
  return null
}
