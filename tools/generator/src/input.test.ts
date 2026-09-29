import { describe, expect, it } from 'vitest'
import { normalizeAnswers } from './input'

describe('normalizeAnswers', () => {
  it('accepts a valid list of answers', () => {
    const result = normalizeAnswers(['CAT', 'DOG'])
    expect(result).toEqual({ ok: true, answers: ['CAT', 'DOG'] })
  })

  it('uppercases lowercase and mixed-case input', () => {
    const result = normalizeAnswers(['cat', 'DoG'])
    expect(result).toEqual({ ok: true, answers: ['CAT', 'DOG'] })
  })

  it('trims surrounding whitespace', () => {
    const result = normalizeAnswers([' cat ', 'dog\t'])
    expect(result).toEqual({ ok: true, answers: ['CAT', 'DOG'] })
  })

  it('rejects an empty answer list', () => {
    const result = normalizeAnswers([])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatch(/at least one answer/i)
  })

  it('rejects answers containing non-letter characters', () => {
    const result = normalizeAnswers(['CAT', 'DOG2', 'RA-T'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.includes('DOG2'))).toBe(true)
    expect(result.errors.some((e) => e.includes('RA-T'))).toBe(true)
  })

  it('rejects answers shorter than 2 letters', () => {
    const result = normalizeAnswers(['CAT', 'A'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.includes('too short'))).toBe(true)
  })

  it('rejects duplicate answers, case-insensitively, rather than silently deduplicating', () => {
    const result = normalizeAnswers(['CAT', 'cat'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true)
  })

  it('reports every invalid answer, not just the first', () => {
    const result = normalizeAnswers(['A', 'DOG2', 'CAT', 'cat'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(3)
  })
})
