// Generator-only ASCII rendering of a construction's occupied geometry —
// debugging/reporting output only, not a terminal UI. One character per
// occupied cell, a placeholder for empty space, cells space-separated for
// monospace readability, rows in normalized row-major order (y ascending,
// then x ascending) so output is deterministic for a given construction.

import type { ConstructionSuccess } from '../types.js'

export interface RenderAsciiOptions {
  showLetters: boolean
  /** Character for an unoccupied cell. Defaults to '·'. */
  emptyChar?: string
  /** Character standing in for an occupied cell when showLetters is false. Defaults to '█'. */
  blockChar?: string
}

export function renderAscii(construction: ConstructionSuccess, options: RenderAsciiOptions): string {
  const emptyChar = options.emptyChar ?? '·'
  const blockChar = options.blockChar ?? '█'

  const grid: string[][] = []
  for (let y = 0; y < construction.height; y++) {
    grid.push(new Array<string>(construction.width).fill(emptyChar))
  }

  for (const [cellId, letter] of Object.entries(construction.cells)) {
    const position = construction.positions[cellId]
    grid[position.y][position.x] = options.showLetters ? letter : blockChar
  }

  return grid.map((row) => row.join(' ')).join('\n')
}
