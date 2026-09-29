import { describe, expect, it } from 'vitest'
import { createRng, shuffle } from './rng'

describe('createRng', () => {
  it('produces the same sequence for the same numeric seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const sequenceA = [a(), a(), a()]
    const sequenceB = [b(), b(), b()]
    expect(sequenceA).toEqual(sequenceB)
  })

  it('produces the same sequence for the same string seed', () => {
    const a = createRng('dogs-theme')
    const b = createRng('dogs-theme')
    expect([a(), a()]).toEqual([b(), b()])
  })

  it('produces a different sequence for a different seed', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a()).not.toBe(b())
  })

  it('produces values in the [0, 1) range', () => {
    const rng = createRng('range-check')
    for (let i = 0; i < 20; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('is deterministic for the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const a = shuffle(items, createRng('shuffle-seed'))
    const b = shuffle(items, createRng('shuffle-seed'))
    expect(a).toEqual(b)
  })

  it('returns a permutation of the input, not a copy with different elements', () => {
    const items = [1, 2, 3, 4, 5]
    const result = shuffle(items, createRng('permutation-check'))
    expect(result.slice().sort()).toEqual(items.slice().sort())
  })

  it('does not mutate the input array', () => {
    const items = ['x', 'y', 'z']
    const original = [...items]
    shuffle(items, createRng(1))
    expect(items).toEqual(original)
  })
})
