import { describe, expect, it } from 'vitest'
import {
  createCompletedGameState,
  createInitialGameState,
  getLockedCellIds,
  isCellLocked,
  isPuzzleComplete,
  revealLetter,
  setCellValue,
} from './gameEngine'
import { FREE_REVEALS_PER_PUZZLE, getLetterCost } from './letterCosts'
import type { GameState } from './gameEngine'
import type { PuzzleDefinition } from './types'

// 'X' deliberately appears in two non-adjacent cells (a, c) to exercise
// board-wide reveal; 'b' and 'd' each hold a unique letter. Fixed costs:
// X=40, Y=60, Z=30 (from the real LETTER_COSTS table) — the default
// starting score of 200 comfortably covers any single reveal used below.
const COST_X = getLetterCost('X')

// Reveals FREE_REVEALS_PER_PUZZLE letters absent from the fixture (which
// only uses X, Y, and Z), so a subsequent reveal exercises paid-cost
// behavior without touching board state.
function burnFreeReveals(state: GameState): GameState {
  const fillerLetters = ['M', 'N', 'O', 'P', 'Q']
  let next = state
  for (let i = 0; i < FREE_REVEALS_PER_PUZZLE; i++) {
    next = revealLetter(next, fillerLetters[i])
  }
  return next
}

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
    expect(state.freeRevealsRemaining).toBe(FREE_REVEALS_PER_PUZZLE)
    expect(state.revealHistory).toEqual([])
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

  it('deducts exactly the fixed cost regardless of how many cells matched, once free reveals are exhausted', () => {
    // 'X' fills two cells (a and c) but must still cost a single COST_X,
    // never COST_X multiplied by the number of occurrences.
    const burned = burnFreeReveals(createInitialGameState(makeFixturePuzzle(100 + COST_X)))
    const state = revealLetter(burned, 'X')
    expect(state.score).toBe(100)
  })

  it('deducts the fixed cost even when the letter appears nowhere in the puzzle, once free reveals are exhausted', () => {
    const costQ = getLetterCost('Q')
    const burned = burnFreeReveals(createInitialGameState(makeFixturePuzzle(100 + costQ)))
    const state = revealLetter(burned, 'Q')
    expect(state.score).toBe(100)
    expect(state.revealedLetters.Q).toBe(true)
    expect(state.values).toEqual({ a: '', b: '', c: '', d: '' })
  })

  it('is a no-op if the letter has already been revealed, and does not charge twice', () => {
    const burned = burnFreeReveals(createInitialGameState(makeFixturePuzzle(200)))
    const state = revealLetter(burned, 'X')
    const again = revealLetter(state, 'X')
    expect(again).toBe(state)
    expect(again.score).toBe(200 - COST_X)
  })

  it('is allowed even when the score is less than the letter\'s cost', () => {
    const state = burnFreeReveals(createInitialGameState(makeFixturePuzzle(COST_X - 1)))
    const next = revealLetter(state, 'X')
    expect(next).not.toBe(state)
    expect(next.values.a).toBe('X')
    expect(next.revealedLetters).toEqual({ X: true, M: true, N: true, O: true })
  })

  it('can take the score below zero', () => {
    const state = burnFreeReveals(createInitialGameState(makeFixturePuzzle(COST_X - 1)))
    const next = revealLetter(state, 'X')
    expect(next.score).toBe(COST_X - 1 - COST_X)
    expect(next.score).toBeLessThan(0)
  })

  it('allows further reveals after the score has gone negative', () => {
    let state = burnFreeReveals(createInitialGameState(makeFixturePuzzle(COST_X - 1)))
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

describe('revealLetter — free reveals', () => {
  it('costs 0 and does not touch score while free reveals remain', () => {
    const state = createInitialGameState(makeFixturePuzzle(100))
    const next = revealLetter(state, 'X')
    expect(next.score).toBe(100)
  })

  it('consumes one free reveal per reveal, regardless of letter or cell count', () => {
    const state = createInitialGameState(makeFixturePuzzle(100))
    const next = revealLetter(state, 'X')
    expect(next.freeRevealsRemaining).toBe(FREE_REVEALS_PER_PUZZLE - 1)
  })

  it('consumes a free reveal even for a letter absent from the puzzle', () => {
    const state = createInitialGameState(makeFixturePuzzle(100))
    const next = revealLetter(state, 'Q')
    expect(next.score).toBe(100)
    expect(next.freeRevealsRemaining).toBe(FREE_REVEALS_PER_PUZZLE - 1)
  })

  it('resumes normal fixed costs once free reveals are exhausted', () => {
    let state = createInitialGameState(makeFixturePuzzle(1000))
    state = revealLetter(state, 'M')
    state = revealLetter(state, 'N')
    state = revealLetter(state, 'O')
    expect(state.freeRevealsRemaining).toBe(0)
    expect(state.score).toBe(1000)

    const next = revealLetter(state, 'X')
    expect(next.score).toBe(1000 - COST_X)
    expect(next.freeRevealsRemaining).toBe(0)
  })

  it('can go all the way to 3 free reveals used and still reach 2000/2000 with a full star rating', () => {
    let state = createInitialGameState(makeFixturePuzzle(2000))
    state = revealLetter(state, 'M')
    state = revealLetter(state, 'N')
    state = revealLetter(state, 'O')
    expect(state.score).toBe(2000)
  })
})

describe('revealLetter — reveal history', () => {
  it('records a history entry for every reveal, newest first', () => {
    let state = createInitialGameState(makeFixturePuzzle(1000))
    state = revealLetter(state, 'X')
    state = revealLetter(state, 'Z')
    expect(state.revealHistory).toEqual([
      { letter: 'Z', cost: 'Free', cellsRevealed: 1 },
      { letter: 'X', cost: 'Free', cellsRevealed: 2 },
    ])
  })

  it('records "Free" as the cost while a free reveal was used', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle(1000)), 'X')
    expect(state.revealHistory[0]).toEqual({ letter: 'X', cost: 'Free', cellsRevealed: 2 })
  })

  it('records the numeric cost once free reveals are exhausted', () => {
    const burned = burnFreeReveals(createInitialGameState(makeFixturePuzzle(1000)))
    const state = revealLetter(burned, 'X')
    expect(state.revealHistory[0]).toEqual({ letter: 'X', cost: COST_X, cellsRevealed: 2 })
  })

  it('records 0 cells revealed for a letter absent from the puzzle', () => {
    const state = revealLetter(createInitialGameState(makeFixturePuzzle(1000)), 'Q')
    expect(state.revealHistory[0]).toEqual({ letter: 'Q', cost: 'Free', cellsRevealed: 0 })
  })

  it('never rewrites an earlier entry\'s recorded cost after free reveals are later exhausted', () => {
    let state = createInitialGameState(makeFixturePuzzle(1000))
    state = revealLetter(state, 'X') // free
    state = revealLetter(state, 'M') // free
    state = revealLetter(state, 'N') // free, exhausts free reveals
    state = revealLetter(state, 'Z') // now paid
    const xEntry = state.revealHistory.find((entry) => entry.letter === 'X')
    expect(xEntry?.cost).toBe('Free')
  })

  it('counts every matching cell, not just previously empty ones', () => {
    // 'a' and 'c' both already hold the correct 'X' via manual entry.
    let state = createInitialGameState(makeFixturePuzzle(1000))
    state = setCellValue(state, 'a', 'X')
    state = setCellValue(state, 'c', 'X')
    state = revealLetter(state, 'X')
    expect(state.revealHistory[0]).toEqual({ letter: 'X', cost: 'Free', cellsRevealed: 2 })
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
    let state = burnFreeReveals(createInitialGameState(makeFixturePuzzle(1)))
    state = revealLetter(state, 'X') // score goes negative, fills a and c
    state = revealLetter(state, 'Y') // score goes further negative, fills b
    state = setCellValue(state, 'd', 'Z')
    expect(state.score).toBeLessThan(0)
    expect(isPuzzleComplete(state)).toBe(true)
  })
})

describe('createCompletedGameState', () => {
  it('fills every cell with its correct letter', () => {
    const state = createCompletedGameState(makeFixturePuzzle(), {
      score: 150,
      revealHistory: [],
    })
    expect(state.values).toEqual({ a: 'X', b: 'Y', c: 'X', d: 'Z' })
    expect(isPuzzleComplete(state)).toBe(true)
  })

  it('locks every cell, matching a freshly completed puzzle', () => {
    const state = createCompletedGameState(makeFixturePuzzle(), {
      score: 150,
      revealHistory: [],
    })
    expect(getLockedCellIds(state)).toEqual({ a: true, b: true, c: true, d: true })
  })

  it('restores the persisted score and reveal history verbatim', () => {
    const revealHistory = [
      { letter: 'X', cost: 'Free' as const, cellsRevealed: 2 },
      { letter: 'Q', cost: 30, cellsRevealed: 0 },
    ]
    const state = createCompletedGameState(makeFixturePuzzle(), { score: 90, revealHistory })
    expect(state.score).toBe(90)
    expect(state.revealHistory).toEqual(revealHistory)
  })

  it('rebuilds revealedLetters from the persisted history', () => {
    const state = createCompletedGameState(makeFixturePuzzle(), {
      score: 150,
      revealHistory: [{ letter: 'X', cost: 'Free', cellsRevealed: 2 }],
    })
    expect(state.revealedLetters).toEqual({ X: true })
  })

  it('has no free reveals remaining, since the puzzle is already finished', () => {
    const state = createCompletedGameState(makeFixturePuzzle(), {
      score: 150,
      revealHistory: [],
    })
    expect(state.freeRevealsRemaining).toBe(0)
  })
})
