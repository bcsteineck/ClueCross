import { describe, expect, it } from 'vitest'
import { createInitialGameState, isPuzzleComplete } from '../core/gameEngine'
import { getLetterCost } from '../core/letterCosts'
import type { PuzzleDefinition } from '../core/types'
import { gameReducer } from './gameReducer'

const COST_X = getLetterCost('X')

function makeFixturePuzzle(unlockBudget = 200): PuzzleDefinition {
  return {
    id: 'fixture-puzzle',
    clue: 'Test',
    unlockBudget,
    cells: {
      a: { id: 'a', correctLetter: 'X' },
      b: { id: 'b', correctLetter: 'Y' },
    },
    entries: [{ id: 'word-1', cellIds: ['a', 'b'] }],
  }
}

describe('gameReducer', () => {
  it('dispatches SET_CELL_VALUE to setCellValue', () => {
    const state = createInitialGameState(makeFixturePuzzle())
    const next = gameReducer(state, { type: 'SET_CELL_VALUE', cellId: 'a', value: 'X' })
    expect(next.values.a).toBe('X')
  })

  it('dispatches REVEAL_LETTER to revealLetter', () => {
    const state = createInitialGameState(makeFixturePuzzle(100))
    const next = gameReducer(state, { type: 'REVEAL_LETTER', letter: 'X' })
    expect(next.values.a).toBe('X')
    expect(next.revealedLetters).toEqual({ X: true })
    expect(next.score).toBe(100 - COST_X)
  })

  it('runs a full play sequence through dispatched actions and completes automatically', () => {
    const puzzle = makeFixturePuzzle(COST_X)
    let state = createInitialGameState(puzzle)
    state = gameReducer(state, { type: 'REVEAL_LETTER', letter: 'X' })
    state = gameReducer(state, { type: 'SET_CELL_VALUE', cellId: 'b', value: 'Y' })
    expect(isPuzzleComplete(state)).toBe(true)
  })
})
