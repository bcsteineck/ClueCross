import type { CellId } from '../core/types'
import type { LayoutDefinition } from './types'

export type ArrowDirection = 'up' | 'down' | 'left' | 'right'

// Cells sharing the current cell's row/column, in the given direction,
// nearest first. Arrow-key navigation takes the nearest regardless of
// lock state, so locked cells are reachable and navigable through the
// same way everywhere on the board; typing-advance and backspace filter
// this for the nearest editable cell.
export function getCellsInDirection(
  layout: LayoutDefinition,
  fromCellId: CellId,
  direction: ArrowDirection,
): CellId[] {
  const from = layout.cellPositions[fromCellId]
  if (!from) return []

  const candidates = Object.entries(layout.cellPositions).filter(([cellId, position]) => {
    if (cellId === fromCellId) return false
    switch (direction) {
      case 'right':
        return position.y === from.y && position.x > from.x
      case 'left':
        return position.y === from.y && position.x < from.x
      case 'down':
        return position.x === from.x && position.y > from.y
      case 'up':
        return position.x === from.x && position.y < from.y
    }
  })

  candidates.sort(([, a], [, b]) => {
    switch (direction) {
      case 'right':
        return a.x - b.x
      case 'left':
        return b.x - a.x
      case 'down':
        return a.y - b.y
      case 'up':
        return b.y - a.y
    }
  })

  return candidates.map(([cellId]) => cellId)
}
