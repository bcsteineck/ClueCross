import { describe, expect, it } from 'vitest'
import { DEFAULT_REVEAL_BUDGET, getLetterCost, LETTER_COSTS } from './letterCosts'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

describe('LETTER_COSTS', () => {
  it('defines a positive cost for every letter A-Z', () => {
    for (const letter of ALPHABET) {
      const cost = LETTER_COSTS[letter as keyof typeof LETTER_COSTS]
      expect(cost).toBeGreaterThan(0)
    }
  })

  it('matches the exact fixed price table', () => {
    expect(LETTER_COSTS).toEqual({
      A: 160,
      B: 70,
      C: 110,
      D: 100,
      E: 170,
      F: 70,
      G: 80,
      H: 80,
      I: 150,
      J: 30,
      K: 50,
      L: 120,
      M: 90,
      N: 130,
      O: 140,
      P: 90,
      Q: 30,
      R: 150,
      S: 130,
      T: 140,
      U: 110,
      V: 50,
      W: 60,
      X: 40,
      Y: 60,
      Z: 30,
    })
  })
})

describe('DEFAULT_REVEAL_BUDGET', () => {
  it('is 2000', () => {
    expect(DEFAULT_REVEAL_BUDGET).toBe(2000)
  })
})

describe('getLetterCost', () => {
  it('looks up the fixed cost for a letter', () => {
    expect(getLetterCost('A')).toBe(160)
    expect(getLetterCost('Z')).toBe(30)
  })

  it('normalizes lowercase input', () => {
    expect(getLetterCost('a')).toBe(160)
  })

  it('throws for input that is not a single A-Z letter', () => {
    expect(() => getLetterCost('1')).toThrow()
    expect(() => getLetterCost('AB')).toThrow()
    expect(() => getLetterCost('')).toThrow()
  })
})
