// @vitest-environment jsdom
import { cleanup, act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { isPuzzleComplete } from '../core/gameEngine'
import { FREE_REVEALS_PER_PUZZLE, getLetterCost } from '../core/letterCosts'
import type { PuzzleDefinition } from '../core/types'
import { usePuzzleGame } from './usePuzzleGame'

afterEach(cleanup)

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

// Reveals FREE_REVEALS_PER_PUZZLE letters absent from the fixture (which
// only uses X and Y), so a subsequent reveal exercises paid-cost behavior.
function burnFreeReveals(revealLetter: (letter: string) => void) {
  const fillerLetters = ['M', 'N', 'O', 'P', 'Q']
  for (let i = 0; i < FREE_REVEALS_PER_PUZZLE; i++) {
    revealLetter(fillerLetters[i])
  }
}

describe('usePuzzleGame', () => {
  it('initializes state from the supplied puzzle', () => {
    const { result } = renderHook(() => usePuzzleGame(makeFixturePuzzle(500)))
    expect(result.current.state.values).toEqual({ a: '', b: '' })
    expect(result.current.state.score).toBe(500)
    expect(result.current.state.revealedLetters).toEqual({})
    expect(result.current.state.freeRevealsRemaining).toBe(FREE_REVEALS_PER_PUZZLE)
    expect(result.current.state.revealHistory).toEqual([])
  })

  it('setCellValue updates the corresponding cell', () => {
    const { result } = renderHook(() => usePuzzleGame(makeFixturePuzzle()))
    act(() => {
      result.current.setCellValue('a', 'X')
    })
    expect(result.current.state.values.a).toBe('X')
  })

  it('revealLetter fills every matching cell for free while free reveals remain', () => {
    const { result } = renderHook(() => usePuzzleGame(makeFixturePuzzle(COST_X)))
    act(() => {
      result.current.revealLetter('X')
    })
    expect(result.current.state.values.a).toBe('X')
    expect(result.current.state.revealedLetters).toEqual({ X: true })
    expect(result.current.state.score).toBe(COST_X)
    expect(result.current.state.freeRevealsRemaining).toBe(FREE_REVEALS_PER_PUZZLE - 1)
  })

  it('revealLetter spends its fixed cost once free reveals are exhausted', () => {
    const { result } = renderHook(() => usePuzzleGame(makeFixturePuzzle(COST_X)))
    act(() => {
      burnFreeReveals(result.current.revealLetter)
      result.current.revealLetter('X')
    })
    expect(result.current.state.values.a).toBe('X')
    expect(result.current.state.freeRevealsRemaining).toBe(0)
    expect(result.current.state.score).toBe(0)
  })

  it('revealLetter is allowed even when it takes the score negative', () => {
    const { result } = renderHook(() => usePuzzleGame(makeFixturePuzzle(COST_X - 1)))
    act(() => {
      burnFreeReveals(result.current.revealLetter)
      result.current.revealLetter('X')
    })
    expect(result.current.state.values.a).toBe('X')
    expect(result.current.state.score).toBe(-1)
  })

  it('completes automatically once every cell is correct, with no submit step', () => {
    const { result } = renderHook(() => usePuzzleGame(makeFixturePuzzle()))
    act(() => {
      result.current.setCellValue('a', 'X')
      result.current.setCellValue('b', 'Y')
    })
    expect(isPuzzleComplete(result.current.state)).toBe(true)
  })

  it('keeps action function identities stable across re-renders', () => {
    const { result, rerender } = renderHook(() => usePuzzleGame(makeFixturePuzzle()))
    const firstActions = {
      setCellValue: result.current.setCellValue,
      revealLetter: result.current.revealLetter,
    }
    rerender()
    expect(result.current.setCellValue).toBe(firstActions.setCellValue)
    expect(result.current.revealLetter).toBe(firstActions.revealLetter)
  })
})
