// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasCompletedOnboarding, markOnboardingCompleted } from './onboardingCompletion'

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

describe('onboardingCompletion', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is false before onboarding has ever been marked complete', () => {
    expect(hasCompletedOnboarding()).toBe(false)
  })

  it('is true once marked complete', () => {
    markOnboardingCompleted()
    expect(hasCompletedOnboarding()).toBe(true)
  })

  it('persists across separate reads', () => {
    markOnboardingCompleted()
    expect(hasCompletedOnboarding()).toBe(true)
    expect(hasCompletedOnboarding()).toBe(true)
  })

  // The fallback this guards against: when storage genuinely can't be
  // read (private browsing, disabled, quota) — simulated here by leaving
  // localStorage unstubbed, since jsdom's default test origin throws —
  // onboarding is treated as already seen rather than forcing an
  // unskippable-feeling modal on every load.
  it('defaults to true when storage is unavailable', () => {
    vi.unstubAllGlobals()
    expect(hasCompletedOnboarding()).toBe(true)
  })
})
