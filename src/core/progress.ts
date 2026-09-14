import type { GameState } from './gameEngine'

export interface ProgressSummary {
  filled: number
  total: number
  percent: number
}

// Filled means "contains a value" — manually entered or revealed — with no
// regard to correctness. A puzzle can be 100% filled and still incorrect.
export function getProgress(state: GameState): ProgressSummary {
  const cells = Object.values(state.puzzle.cells)
  const total = cells.length
  const filled = cells.filter((cell) => state.values[cell.id] !== '').length
  const percent = total === 0 ? 0 : Math.round((filled / total) * 100)
  return { filled, total, percent }
}
