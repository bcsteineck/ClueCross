// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDateCompleted, markDateCompleted } from './completionTracking'

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

describe('completionTracking', () => {
  it('is false for a date/puzzle pair that has never been marked', () => {
    expect(isDateCompleted('2026-08-07', 'dogs')).toBe(false)
  })

  it('is true for a date/puzzle pair once marked', () => {
    markDateCompleted('2026-08-07', 'dogs')
    expect(isDateCompleted('2026-08-07', 'dogs')).toBe(true)
  })

  // The bug this guards against: a date is marked complete under one
  // puzzle, then a different puzzle later takes over that same date (e.g.
  // a new daily puzzle becomes "today"). The new puzzle must not inherit
  // the old puzzle's completion for that date.
  it('does not leak completion to a different puzzle on the same date', () => {
    markDateCompleted('2026-08-07', 'dogs')
    expect(isDateCompleted('2026-08-07', 'magic')).toBe(false)
  })

  it('does not leak completion to the same puzzle on a different date', () => {
    markDateCompleted('2026-08-07', 'dogs')
    expect(isDateCompleted('2026-08-06', 'dogs')).toBe(false)
  })
})
