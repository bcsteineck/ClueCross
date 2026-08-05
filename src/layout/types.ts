import type { CellId } from '../core/types'

export interface Position {
  x: number
  y: number
}

export interface LayoutDefinition {
  id: string
  puzzleId: string
  cellPositions: Record<CellId, Position>
  navigationOrder: CellId[]
}
