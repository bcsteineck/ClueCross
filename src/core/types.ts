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
