import { useCallback, useReducer } from 'react'
import { createInitialGameState } from '../core/gameEngine'
import type { GameState } from '../core/gameEngine'
import type { CellId, PuzzleDefinition } from '../core/types'
import { gameReducer } from './gameReducer'

export interface UsePuzzleGameResult {
  state: GameState
  setCellValue: (cellId: CellId, value: string) => void
  revealLetter: (letter: string) => void
}

// `initialState`, when supplied, seeds the reducer instead of a fresh
// createInitialGameState(puzzle) — used to resume a previously cached
// session (see PuzzleSessionProvider) rather than always starting over.
// Only consulted on first mount, per useReducer's lazy-init contract.
export function usePuzzleGame(
  puzzle: PuzzleDefinition,
  initialState?: GameState,
): UsePuzzleGameResult {
  const [state, dispatch] = useReducer(
    gameReducer,
    puzzle,
    (p) => initialState ?? createInitialGameState(p),
  )

  const setCellValue = useCallback((cellId: CellId, value: string) => {
    dispatch({ type: 'SET_CELL_VALUE', cellId, value })
  }, [])

  const revealLetter = useCallback((letter: string) => {
    dispatch({ type: 'REVEAL_LETTER', letter })
  }, [])

  return { state, setCellValue, revealLetter }
}
