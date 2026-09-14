// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPuzzleResult, getPuzzleResultStarCount, recordPuzzleResult } from './puzzleResults'

// jsdom's default test origin doesn't provide a working localStorage, so
// stub in a simple in-memory implementation to exercise real persistence.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('puzzleResults', () => {
  it('is undefined for a date/puzzle pair with no recorded result', () => {
    expect(getPuzzleResult('2026-08-07', 'dogs')).toBeUndefined()
  })

  it('returns the recorded result once one has been stored', () => {
    recordPuzzleResult('2026-08-07', 'dogs', {
      score: 1500,
      revealHistory: [{ letter: 'A', cost: 'Free', cellsRevealed: 3 }],
    })
    expect(getPuzzleResult('2026-08-07', 'dogs')).toEqual({
      score: 1500,
      revealHistory: [{ letter: 'A', cost: 'Free', cellsRevealed: 3 }],
    })
  })

  it('does not leak a result to a different puzzle on the same date', () => {
    recordPuzzleResult('2026-08-07', 'dogs', { score: 1500, revealHistory: [] })
    expect(getPuzzleResult('2026-08-07', 'magic')).toBeUndefined()
  })

  it('does not leak a result to the same puzzle on a different date', () => {
    recordPuzzleResult('2026-08-07', 'dogs', { score: 1500, revealHistory: [] })
    expect(getPuzzleResult('2026-08-06', 'dogs')).toBeUndefined()
  })

  it('keeps the first recorded result for a date/puzzle pair rather than overwriting it', () => {
    recordPuzzleResult('2026-08-07', 'dogs', { score: 1500, revealHistory: [] })
    recordPuzzleResult('2026-08-07', 'dogs', { score: 0, revealHistory: [] })
    expect(getPuzzleResult('2026-08-07', 'dogs')?.score).toBe(1500)
  })

  it('derives the star count from the recorded score', () => {
    recordPuzzleResult('2026-08-07', 'dogs', { score: 2000, revealHistory: [] })
    expect(getPuzzleResultStarCount('2026-08-07', 'dogs')).toBe(3)
  })

  it('has an undefined star count when no result is recorded', () => {
    expect(getPuzzleResultStarCount('2026-08-07', 'dogs')).toBeUndefined()
  })
})
