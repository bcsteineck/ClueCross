import type { LayoutDefinition } from './types'

export interface GridDimensions {
  cols: number
  rows: number
}

// Cell positions are 0-indexed, so the grid's extent along each axis is one
// more than the largest coordinate present on that axis.
export function getGridDimensions(layout: LayoutDefinition): GridDimensions {
  const positions = Object.values(layout.cellPositions)
  const cols = Math.max(...positions.map((position) => position.x)) + 1
  const rows = Math.max(...positions.map((position) => position.y)) + 1
  return { cols, rows }
}
