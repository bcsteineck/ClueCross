import { revealLetter, setCellValue } from '../core/gameEngine'
import type { GameState } from '../core/gameEngine'
import type { CellId } from '../core/types'

export type GameAction =
  | { type: 'SET_CELL_VALUE'; cellId: CellId; value: string }
  | { type: 'REVEAL_LETTER'; letter: string }

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SET_CELL_VALUE':
      return setCellValue(state, action.cellId, action.value)
    case 'REVEAL_LETTER':
      return revealLetter(state, action.letter)
    default:
      return state
  }
}
