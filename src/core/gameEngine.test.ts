import { describe, expect, it } from 'vitest'
import {
  createInitialGameState,
  getLockedCellIds,
  isCellLocked,
  isPuzzleComplete,
  revealLetter,
  setCellValue,
} from './gameEngine'
import { getLetterCost } from './letterCosts'
import type { PuzzleDefinition } from './types'

// 'X' deliberately appears in two non-adjacent cells (a, c) to exercise
// board-wide reveal; 'b' and 'd' each hold a unique letter. Fixed costs:
// X=40, Y=60, Z=30 (from the real LETTER_COSTS table) — the default
// starting score of 200 comfortably covers any single reveal used below.
const COST_X = getLetterCost('X')

function makeFixturePuzzle(unlockBudget = 200): PuzzleDefinition {
  return {
    id: 'fixture-puzzle',
    clue: 'Test',
    unlockBudget,
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

function fillCorrectly(state: ReturnType<typeof createInitialGameState>) {
  let next = state
  next = setCellValue(next, 'a', 'X')
  next = setCellValue(next, 'b', 'Y')
  next = setCellValue(next, 'c', 'X')
  next = setCellValue(next, 'd', 'Z')
  return next
}

describe('createInitialGameState', () => {
  it('starts with empty values, the starting score, and no revealed letters', () => {
    const state = createInitialGameState(makeFixturePuzzle(500))
    expect(state.values).toEqual({ a: '', b: '', c: '', d: '' })
    expect(state.revealedLetters).toEqual({})
    expect(state.score).toBe(500)
  })
})

describe('setCellValue', () => {
  it('sets a manually entered letter on an editable cell', () => {
    const state = createInitialGameState(makeFixturePuzzle())
    const next = setCellValue(state, 'b', 'Y')
    expect(next.values.b).toBe('Y')
  })

  it('does not change the score', () => {
    const state = createInitialGameState(makeFixturePuzzle())
    const next = setCellValue(state, 'b', 'Y')
    expect(next.score).toBe(state.score)
  })

  it('is a no-op when the cell\'s letter has been revealed', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle()), 'X')
    const attempted = setCellValue(state, 'a', 'Q')
    expect(attempted).toBe(state)
    expect(attempted.values.a).toBe('X')
  })

  it('is a no-op on every cell once the puzzle is complete', () => {
    const state = fillCorrectly(createInitialGameState(makeFixturePuzzle()))
    expect(isPuzzleComplete(state)).toBe(true)
    const attempted = setCellValue(state, 'b', 'Q')
    expect(attempted).toBe(state)
  })
})

describe('revealLetter', () => {
  it('reveals every cell matching the letter across the whole puzzle', () => {
    const state = createInitialGameState(makeFixturePuzzle(100))
    const next = revealLetter(state, 'X')
    expect(next.values.a).toBe('X')
    expect(next.values.c).toBe('X')
    expect(next.values.b).toBe('')
    expect(next.values.d).toBe('')
    expect(next.revealedLetters).toEqual({ X: true })
    expect(next.score).toBe(100 - COST_X)
  })

  it('overwrites manually entered values in matching cells', () => {
    const state = setCellValue(createInitialGameState(makeFixturePuzzle()), 'a', 'Q')
    const next = revealLetter(state, 'X')
    expect(next.values.a).toBe('X')
  })

  it('locks every revealed cell but leaves others editable', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle()), 'X')
    expect(isCellLocked(state, 'a')).toBe(true)
    expect(isCellLocked(state, 'c')).toBe(true)
    expect(isCellLocked(state, 'b')).toBe(false)
    expect(isCellLocked(state, 'd')).toBe(false)
  })

  it('deducts exactly the fixed cost regardless of how many cells matched', () => {
    // 'X' fills two cells (a and c) but must still cost a single COST_X,
    // never COST_X multiplied by the number of occurrences.
    const state = revealLetter(createInitialGameState(makeFixturePuzzle(100)), 'X')
    expect(state.score).toBe(100 - COST_X)
  })

  it('deducts the fixed cost even when the letter appears nowhere in the puzzle', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle(100)), 'Q')
    const costQ = getLetterCost('Q')
    expect(state.score).toBe(100 - costQ)
    expect(state.revealedLetters).toEqual({ Q: true })
    expect(state.values).toEqual({ a: '', b: '', c: '', d: '' })
  })

  it('is a no-op if the letter has already been revealed, and does not charge twice', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle(200)), 'X')
    const again = revealLetter(state, 'X')
    expect(again).toBe(state)
    expect(again.score).toBe(200 - COST_X)
  })

  it('is allowed even when the score is less than the letter\'s cost', () => {
    const state = createInitialGameState(makeFixturePuzzle(COST_X - 1))
    const next = revealLetter(state, 'X')
    expect(next).not.toBe(state)
    expect(next.values.a).toBe('X')
    expect(next.revealedLetters).toEqual({ X: true })
  })

  it('can take the score below zero', () => {
    const state = createInitialGameState(makeFixturePuzzle(COST_X - 1))
    const next = revealLetter(state, 'X')
    expect(next.score).toBe(COST_X - 1 - COST_X)
    expect(next.score).toBeLessThan(0)
  })

  it('allows further reveals after the score has gone negative', () => {
    let state = createInitialGameState(makeFixturePuzzle(COST_X - 1))
    state = revealLetter(state, 'X') // score now negative
    expect(state.score).toBeLessThan(0)

    const costY = getLetterCost('Y')
    const next = revealLetter(state, 'Y')
    expect(next).not.toBe(state)
    expect(next.values.b).toBe('Y')
    expect(next.score).toBe(state.score - costY)
  })

  it('is a no-op once the puzzle is complete', () => {
    const state = fillCorrectly(createInitialGameState(makeFixturePuzzle(300)))
    expect(isPuzzleComplete(state)).toBe(true)
    const attempted = revealLetter(state, 'Y')
    expect(attempted).toBe(state)
  })
})

describe('isCellLocked / getLockedCellIds', () => {
  it('is false for every cell before anything is revealed', () => {
    const state = createInitialGameState(makeFixturePuzzle())
    expect(isCellLocked(state, 'a')).toBe(false)
    expect(getLockedCellIds(state)).toEqual({})
  })

  it('locks only the cells matching a revealed letter', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle()), 'X')
    expect(getLockedCellIds(state)).toEqual({ a: true, c: true })
  })

  it('locks every cell once the puzzle is complete, regardless of reveal history', () => {
    const state = fillCorrectly(createInitialGameState(makeFixturePuzzle()))
    expect(getLockedCellIds(state)).toEqual({ a: true, b: true, c: true, d: true })
  })
})

describe('isPuzzleComplete', () => {
  it('is false when empty', () => {
    expect(isPuzzleComplete(createInitialGameState(makeFixturePuzzle()))).toBe(false)
  })

  it('is false when partially filled', () => {
    const state = setCellValue(createInitialGameState(makeFixturePuzzle()), 'a', 'X')
    expect(isPuzzleComplete(state)).toBe(false)
  })

  it('is false when fully filled but incorrect', () => {
    let state = createInitialGameState(makeFixturePuzzle())
    state = setCellValue(state, 'a', 'X')
    state = setCellValue(state, 'b', 'WRONG')
    state = setCellValue(state, 'c', 'X')
    state = setCellValue(state, 'd', 'Z')
    expect(isPuzzleComplete(state)).toBe(false)
  })

  it('is true only when every cell exactly matches', () => {
    const state = fillCorrectly(createInitialGameState(makeFixturePuzzle()))
    expect(isPuzzleComplete(state)).toBe(true)
  })

  it('is true when completed via a mix of manual entry and letter reveal', () => {
    let state = createInitialGameState(makeFixturePuzzle(200))
    state = revealLetter(state, 'X') // fills a and c
    state = setCellValue(state, 'b', 'Y')
    state = setCellValue(state, 'd', 'Z')
    expect(isPuzzleComplete(state)).toBe(true)
  })

  it('can still be reached via reveals after the score has gone negative', () => {
    let state = createInitialGameState(makeFixturePuzzle(1))
    state = revealLetter(state, 'X') // score goes negative, fills a and c
    state = revealLetter(state, 'Y') // score goes further negative, fills b
    state = setCellValue(state, 'd', 'Z')
    expect(state.score).toBeLessThan(0)
    expect(isPuzzleComplete(state)).toBe(true)
  })
})
