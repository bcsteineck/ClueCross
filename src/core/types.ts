export type CellId = string

export interface Cell {
  id: CellId
  correctLetter: string
}

export interface Entry {
  id: string
  cellIds: CellId[]
}

export interface PuzzleDefinition {
  id: string
  clue: string
  unlockBudget: number
  cells: Record<CellId, Cell>
  entries: Entry[]
}

// A single reveal-letter action, recorded at the moment it happens. `cost`
// is fixed once written — a later reveal exhausting free reveals must never
// retroactively change an earlier "Free" entry's recorded cost.
export interface RevealHistoryEntry {
  letter: string
  cost: number | 'Free'
  cellsRevealed: number
}
