import type { CellId, Entry, PuzzleDefinition } from './types'

export function getEntriesForCell(puzzle: PuzzleDefinition, cellId: CellId): Entry[] {
  return puzzle.entries.filter((entry) => entry.cellIds.includes(cellId))
}
