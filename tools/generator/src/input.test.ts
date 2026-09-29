import { describe, expect, it } from 'vitest'
import { normalizeAnswer, normalizeAnswers } from './input'

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

  it('rejects answers containing non-letter characters other than separators', () => {
    const result = normalizeAnswers(['CAT', 'DOG2', 'St. Bernard', 'Café'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      '"DOG2" contains characters outside A-Z.',
      '"St. Bernard" contains characters outside A-Z.',
      '"Café" contains characters outside A-Z.',
    ])
  })

  it('normalizes multi-word answers to construction form by removing spaces, hyphens, and apostrophes', () => {
    expect(normalizeAnswer('Great Dane')).toEqual({ ok: true, answer: 'GREATDANE' })
    expect(normalizeAnswer('great-dane')).toEqual({ ok: true, answer: 'GREATDANE' })
    expect(normalizeAnswer('  Border\tCollie ')).toEqual({ ok: true, answer: 'BORDERCOLLIE' })
    expect(normalizeAnswer('Dog’s Bed')).toEqual({ ok: true, answer: 'DOGSBED' })
    expect(normalizeAnswer("Dog's Bed")).toEqual({ ok: true, answer: 'DOGSBED' })
  })

  it('applies the 3-letter minimum after separators are removed', () => {
    expect(normalizeAnswer('O X')).toEqual({ ok: false, error: '"O X" is too short (minimum 3 letters).' })
  })

  it('accepts 3 to 12 construction letters and rejects 13 or more, without truncating', () => {
    expect(normalizeAnswer('DOG')).toEqual({ ok: true, answer: 'DOG' })
    expect(normalizeAnswer('ABCDEFGHIJKL')).toEqual({ ok: true, answer: 'ABCDEFGHIJKL' })
    expect(normalizeAnswer('ABCDEFGHIJKLM')).toEqual({ ok: false, error: '"ABCDEFGHIJKLM" is too long (maximum 12 letters).' })
  })

  it('measures multi-word answers by construction letters only (separators do not count)', () => {
    expect(normalizeAnswer('Border Collie')).toEqual({ ok: true, answer: 'BORDERCOLLIE' })
    // 13 characters as written, 12 construction letters: the space doesn't count.
    expect(normalizeAnswer('Saint Bernard')).toEqual({ ok: true, answer: 'SAINTBERNARD' })
    expect(normalizeAnswer('Great Pyrenees')).toEqual({ ok: false, error: '"Great Pyrenees" is too long (maximum 12 letters).' })
    expect(normalizeAnswer('Central Processing Unit')).toEqual({
      ok: false,
      error: '"Central Processing Unit" is too long (maximum 12 letters).',
    })
  })

  it('treats answers that differ only by separators as duplicates', () => {
    const result = normalizeAnswers(['Great Dane', 'GREAT-DANE'])
    expect(result).toEqual({ ok: false, errors: ['"GREATDANE" is a duplicate answer.'] })
  })

  it('rejects answers shorter than 3 letters', () => {
    const result = normalizeAnswers(['CAT', 'A', 'OX'])
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(['"A" is too short (minimum 3 letters).', '"OX" is too short (minimum 3 letters).'])
  })

  it('accepts a 3-letter answer', () => {
    expect(normalizeAnswers(['CAT', 'PUG'])).toEqual({ ok: true, answers: ['CAT', 'PUG'] })
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
