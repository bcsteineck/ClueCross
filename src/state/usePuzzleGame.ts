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

export function usePuzzleGame(puzzle: PuzzleDefinition): UsePuzzleGameResult {
  const [state, dispatch] = useReducer(gameReducer, puzzle, createInitialGameState)

  const setCellValue = useCallback((cellId: CellId, value: string) => {
    dispatch({ type: 'SET_CELL_VALUE', cellId, value })
  }, [])

  const revealLetter = useCallback((letter: string) => {
    dispatch({ type: 'REVEAL_LETTER', letter })
  }, [])

  return { state, setCellValue, revealLetter }
}
