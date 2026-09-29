import { describe, expect, it } from 'vitest'
import { parseSourcingResponse } from './parseResponse'

describe('parseSourcingResponse', () => {
  it('accepts a valid structured response, trimming fields and ignoring extra ones', () => {
    const result = parseSourcingResponse({
      candidates: [{ answer: ' Great Dane ', rationale: 'A giant breed. ', category: 'Breeds', normalizedAnswer: 'X', score: 9 }],
    })
    expect(result).toEqual({
      ok: true,
      candidates: [{ answer: 'Great Dane', rationale: 'A giant breed.', category: 'Breeds' }],
      issues: [],
    })
  })

  it('fails the whole run when the response itself is malformed', () => {
    expect(parseSourcingResponse(null)).toEqual({ ok: false, error: 'Sourcing response is not an object.' })
    expect(parseSourcingResponse([])).toEqual({ ok: false, error: 'Sourcing response is not an object.' })
    expect(parseSourcingResponse({ candidates: 'Beagle' })).toEqual({
      ok: false,
      error: 'Sourcing response has no candidates array.',
    })
  })

  it('drops malformed candidates as sourcing issues, never fabricating metadata', () => {
    const result = parseSourcingResponse({
      candidates: [
        { answer: 'Beagle', rationale: 'A breed.', category: 'Breeds' },
        'Poodle',
        { answer: 'Harness', category: 'Equipment' },
        { answer: 42, rationale: 'x', category: 'y' },
        { answer: 'Leash', rationale: '  ', category: 'Equipment' },
      ],
    })
    expect(result).toEqual({
      ok: true,
      candidates: [{ answer: 'Beagle', rationale: 'A breed.', category: 'Breeds' }],
      issues: [
        { index: 1, reason: 'Candidate is not an object.' },
        { index: 2, reason: 'Candidate "Harness": rationale is not a string.' },
        { index: 3, reason: 'Candidate: answer is not a string.' },
        { index: 4, reason: 'Candidate "Leash": rationale is blank.' },
      ],
    })
  })

  it('keeps schema problems separate from answer validity: "OX" is structurally valid', () => {
    const result = parseSourcingResponse({ candidates: [{ answer: 'OX', rationale: 'Draft animal.', category: 'Animals' }] })
    expect(result).toEqual({
      ok: true,
      candidates: [{ answer: 'OX', rationale: 'Draft animal.', category: 'Animals' }],
      issues: [],
    })
  })
})
