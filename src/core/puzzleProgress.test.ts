import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPuzzleProgress, getPuzzleProgress, savePuzzleProgress } from './puzzleProgress'

const KEY = 'cluecross:puzzle-progress'

function memoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

const stored = () => JSON.parse(window.localStorage.getItem(KEY) ?? 'null')

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('puzzleProgress', () => {
  it('saves and reads progress per publishDate + puzzleId as a version-1 record', () => {
    savePuzzleProgress('2026-10-06', 'cats', { values: { r0c0: 'C' }, reveals: ['A', 'Q'] })
    savePuzzleProgress('2026-10-05', 'bats', { values: { r0c1: 'X' }, reveals: [] })
    expect(stored()).toEqual({
      '2026-10-06:cats': { v: 1, values: { r0c0: 'C' }, reveals: ['A', 'Q'] },
      '2026-10-05:bats': { v: 1, values: { r0c1: 'X' }, reveals: [] },
    })
    expect(getPuzzleProgress('2026-10-06', 'cats')).toEqual({ values: { r0c0: 'C' }, reveals: ['A', 'Q'] })
    expect(getPuzzleProgress('2026-10-06', 'bats')).toBeUndefined() // same date, different puzzle
  })

  it('removes the entry for an untouched game, and on clear, leaving others alone', () => {
    savePuzzleProgress('2026-10-06', 'cats', { values: { r0c0: 'C' }, reveals: [] })
    savePuzzleProgress('2026-10-05', 'bats', { values: {}, reveals: ['E'] })
    savePuzzleProgress('2026-10-06', 'cats', { values: {}, reveals: [] })
    expect(Object.keys(stored())).toEqual(['2026-10-05:bats'])
    clearPuzzleProgress('2026-10-05', 'bats')
    expect(stored()).toEqual({})
    clearPuzzleProgress('2026-10-05', 'bats') // already gone: no error
  })

  it.each([
    ['unsupported version', { v: 2, values: {}, reveals: ['A'] }],
    ['missing version', { values: {}, reveals: ['A'] }],
    ['values not an object', { v: 1, values: ['C'], reveals: [] }],
    ['a non-string value', { v: 1, values: { r0c0: 3 }, reveals: [] }],
    ['reveals not an array', { v: 1, values: {}, reveals: 'AQ' }],
    ['a non-string reveal', { v: 1, values: {}, reveals: [1] }],
    ['not an object at all', 'progress'],
  ])('ignores a record with %s', (_label, record) => {
    window.localStorage.setItem(KEY, JSON.stringify({ '2026-10-06:cats': record }))
    expect(getPuzzleProgress('2026-10-06', 'cats')).toBeUndefined()
  })

  it('treats corrupt storage as no progress', () => {
    window.localStorage.setItem(KEY, '{not json')
    expect(getPuzzleProgress('2026-10-06', 'cats')).toBeUndefined()
    window.localStorage.setItem(KEY, '[1,2]')
    expect(getPuzzleProgress('2026-10-06', 'cats')).toBeUndefined()
  })

  it('never throws when storage is unavailable', () => {
    const failing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    vi.stubGlobal('window', { localStorage: failing })
    expect(getPuzzleProgress('2026-10-06', 'cats')).toBeUndefined()
    expect(() => savePuzzleProgress('2026-10-06', 'cats', { values: { r0c0: 'C' }, reveals: [] })).not.toThrow()
    expect(() => clearPuzzleProgress('2026-10-06', 'cats')).not.toThrow()
  })
})
