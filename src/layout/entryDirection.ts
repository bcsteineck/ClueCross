import { getEntriesForCell } from '../core/puzzleQueries'
import type { CellId, Entry, PuzzleDefinition } from '../core/types'
import type { LayoutDefinition, Position } from './types'

export type Direction = 'across' | 'down'

// An entry's direction is derived from how its cells are arranged in a
// given layout, not stored as authored data — the same entry could be
// arranged differently by a different layout, and storing direction
// separately would risk drifting out of sync with cellPositions.
export function deriveEntryDirection(entry: Entry, layout: LayoutDefinition): Direction | null {
  const positions: Position[] = []
  for (const cellId of entry.cellIds) {
    const position = layout.cellPositions[cellId]
    if (!position) return null
    positions.push(position)
  }
  if (positions.length < 2) return null

  const sameY = positions.every((p) => p.y === positions[0].y)
  const sameX = positions.every((p) => p.x === positions[0].x)

  if (sameY && !sameX) return 'across'
  if (sameX && !sameY) return 'down'
  return null
}

export function getAvailableDirectionsForCell(
  puzzle: PuzzleDefinition,
  layout: LayoutDefinition,
  cellId: CellId,
): Direction[] {
  const directions = new Set<Direction>()
  for (const entry of getEntriesForCell(puzzle, cellId)) {
    const direction = deriveEntryDirection(entry, layout)
    if (direction) {
      directions.add(direction)
    }
  }
  return [...directions]
}
