import { describe, expect, it } from 'vitest'
import { summarize } from './summarize'

describe('summarize', () => {
  it('returns null for an empty list rather than NaN/Infinity', () => {
    expect(summarize([])).toBeNull()
  })

  it('computes min/max/mean and the middle value as median for an odd count', () => {
    const result = summarize([5, 1, 3])
    expect(result).toEqual({ min: 1, max: 5, mean: 3, median: 3, count: 3 })
  })

  it('computes the arithmetic mean of the two middle values as median for an even count', () => {
    const result = summarize([1, 2, 3, 4])
    expect(result).toEqual({ min: 1, max: 4, mean: 2.5, median: 2.5, count: 4 })
  })

  it('handles a single value', () => {
    expect(summarize([7])).toEqual({ min: 7, max: 7, mean: 7, median: 7, count: 1 })
  })

  it('does not mutate the input array', () => {
    const values = [3, 1, 2]
    const copy = [...values]
    summarize(values)
    expect(values).toEqual(copy)
  })

  it('handles an unsorted list with duplicates correctly', () => {
    const result = summarize([4, 4, 1, 9, 2])
    // sorted: [1, 2, 4, 4, 9] -> median = 4 (middle), mean = 20/5 = 4
    expect(result).toEqual({ min: 1, max: 9, mean: 4, median: 4, count: 5 })
  })

  it('never produces NaN or Infinity for finite input', () => {
    const result = summarize([0, -5, 10.5, 3.25])
    expect(result).not.toBeNull()
    if (!result) return
    for (const value of Object.values(result)) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })
})
