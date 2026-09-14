import { describe, expect, it } from 'vitest'
import { createInitialGameState, revealLetter, setCellValue } from './gameEngine'
import { getProgress } from './progress'
import type { PuzzleDefinition } from './types'

function makeFixturePuzzle(): PuzzleDefinition {
  return {
    id: 'fixture-puzzle',
    clue: 'Test',
    unlockBudget: 200,
    cells: {
      a: { id: 'a', correctLetter: 'X' },
      b: { id: 'b', correctLetter: 'Y' },
      c: { id: 'c', correctLetter: 'X' },
      d: { id: 'd', correctLetter: 'Z' },
    },
    entries: [
      { id: 'word-1', cellIds: ['a', 'b'] },
      { id: 'word-2', cellIds: ['c', 'd'] },
    ],
  }
}

describe('getProgress', () => {
  it('is 0/total filled when nothing has been entered', () => {
    const state = createInitialGameState(makeFixturePuzzle())
    expect(getProgress(state)).toEqual({ filled: 0, total: 4, percent: 0 })
  })

  it('counts manually entered cells as filled regardless of correctness', () => {
    const state = setCellValue(createInitialGameState(makeFixturePuzzle()), 'a', 'WRONG')
    expect(getProgress(state)).toEqual({ filled: 1, total: 4, percent: 25 })
  })

  it('counts revealed cells as filled', () => {
    // Reveals 'X', which fills two cells (a and c) at once.
    const state = revealLetter(createInitialGameState(makeFixturePuzzle()), 'X')
    expect(getProgress(state)).toEqual({ filled: 2, total: 4, percent: 50 })
  })

  it('is 100% filled once every cell has a value, even if incorrect', () => {
    let state = createInitialGameState(makeFixturePuzzle())
    state = setCellValue(state, 'a', 'WRONG')
    state = setCellValue(state, 'b', 'WRONG')
    state = setCellValue(state, 'c', 'WRONG')
    state = setCellValue(state, 'd', 'WRONG')
    expect(getProgress(state)).toEqual({ filled: 4, total: 4, percent: 100 })
  })

  it('rounds the percentage', () => {
    // 1/3 filled cells should round to a whole percent, not truncate/inflate.
    const puzzle: PuzzleDefinition = {
      id: 'three-cell-fixture',
      clue: 'Test',
      unlockBudget: 200,
      cells: {
        a: { id: 'a', correctLetter: 'X' },
        b: { id: 'b', correctLetter: 'Y' },
        c: { id: 'c', correctLetter: 'Z' },
      },
      entries: [{ id: 'word-1', cellIds: ['a', 'b', 'c'] }],
    }
    const state = setCellValue(createInitialGameState(puzzle), 'a', 'X')
    expect(getProgress(state)).toEqual({ filled: 1, total: 3, percent: 33 })
  })
})
