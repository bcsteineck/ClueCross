import { describe, expect, it } from 'vitest'
import { analyzeCandidatePool } from '../poolDiagnostics'
import { createSourcingRequest } from './contract'
import type { CandidateSourcingRequest } from './contract'
import { fixtureCandidateSource } from './fixtureSource'
import { buildReviewCandidates, poolReviewEntries, setCandidateIncluded } from './reviewPool'
import { sourceCandidates } from './sourceCandidates'

const sourced = (...answers: string[]) =>
  answers.map((answer, i) => ({ answer, rationale: `why ${i}`, category: `cat ${i}` }))

function dogsRequest(): CandidateSourcingRequest {
  const result = createSourcingRequest({ clue: 'Dogs' })
  if (!result.ok) throw new Error(result.error)
  return result.request
}

describe('buildReviewCandidates: normalization', () => {
  it('keeps the human-readable answer and metadata, deriving the construction form via the generator rules', () => {
    const [dane] = buildReviewCandidates([{ answer: 'Great Dane', rationale: 'A giant breed.', category: 'Breeds' }])
    expect(dane).toEqual({
      id: 'c1',
      sourceAnswer: 'Great Dane',
      rationale: 'A giant breed.',
      category: 'Breeds',
      normalizedAnswer: 'GREATDANE',
      length: 9,
      lexicalWords: ['GREAT', 'DANE'],
      validity: 'valid',
      included: true,
      flags: [],
    })
  })

  it('marks mechanically invalid answers (e.g. the 3-letter rule) and never includes them', () => {
    const [ox, bernard] = buildReviewCandidates(sourced('OX', 'St. Bernard'))
    expect(ox).toMatchObject({
      sourceAnswer: 'OX',
      validity: 'invalid',
      invalidReason: '"OX" is too short (minimum 3 letters).',
      included: false,
    })
    expect(ox.normalizedAnswer).toBeUndefined()
    expect(bernard).toMatchObject({ validity: 'invalid', invalidReason: '"St. Bernard" contains characters outside A-Z.' })
  })
})

describe('buildReviewCandidates: exact duplicates', () => {
  it('collapses construction-form duplicates, keeping the first occurrence', () => {
    const [a, b, c] = buildReviewCandidates(sourced('Great Dane', 'GREAT DANE', 'great-dane'))
    expect(a).toMatchObject({ included: true })
    expect(a.duplicateOf).toBeUndefined()
    expect(b).toMatchObject({ duplicateOf: 'c1', included: false, sourceAnswer: 'GREAT DANE' })
    expect(c).toMatchObject({ duplicateOf: 'c1', included: false, sourceAnswer: 'great-dane' })
  })

  it('does not let invalid candidates take part in duplicate detection', () => {
    const [bad, good, copy] = buildReviewCandidates(sourced('Dog2', 'Dog', 'dog'))
    expect(bad.validity).toBe('invalid')
    expect(bad.duplicateOf).toBeUndefined()
    expect(good.duplicateOf).toBeUndefined()
    expect(copy.duplicateOf).toBe('c2')
  })

  it('does not treat synonyms or different words as duplicates', () => {
    expect(buildReviewCandidates(sourced('Pup', 'Puppy')).every((c) => c.duplicateOf === undefined)).toBe(true)
  })
})

describe('review flags and inclusion', () => {
  it('flags variants but keeps both candidates included', () => {
    const candidates = buildReviewCandidates(sourced('Puppy', 'Puppies'))
    expect(candidates.map((c) => [c.included, c.flags])).toEqual([
      [true, [{ type: 'singular-plural-conflict', relatedCandidateIds: ['c2'] }]],
      [true, [{ type: 'singular-plural-conflict', relatedCandidateIds: ['c1'] }]],
    ])
  })

  it('ignores variants of duplicate copies (flags are computed on unique candidates only)', () => {
    const candidates = buildReviewCandidates(sourced('Dog', 'dog', 'Dogs'))
    expect(candidates[1].flags).toEqual([])
    expect(candidates[0].flags).toEqual([{ type: 'singular-plural-conflict', relatedCandidateIds: ['c3'] }])
  })

  it('lets the author exclude and re-include only valid canonical candidates', () => {
    const candidates = buildReviewCandidates(sourced('Beagle', 'OX', 'beagle'))
    const excluded = setCandidateIncluded(candidates, 'c1', false)
    expect(excluded[0].included).toBe(false)
    expect(setCandidateIncluded(excluded, 'c1', true)[0].included).toBe(true)
    expect(setCandidateIncluded(candidates, 'c2', true)[1].included).toBe(false)
    expect(setCandidateIncluded(candidates, 'c3', true)[2].included).toBe(false)
  })
})

describe('Pool Diagnostics over the reviewed pool', () => {
  it('uses exactly the included candidates as usable answers, while still reporting duplicates and invalid entries', () => {
    const candidates = buildReviewCandidates(sourced('Great Dane', 'great-dane', 'OX', 'Beagle', 'Poodle'))
    const analysis = analyzeCandidatePool(poolReviewEntries(candidates))
    expect(analysis.usableAnswers).toEqual(['GREATDANE', 'BEAGLE', 'POODLE'])
    expect(analysis.duplicatesRemoved).toEqual(['GREATDANE'])
    expect(analysis.invalidEntries).toEqual(['OX'])

    // Excluding a candidate also drops its duplicate copies from diagnostics.
    const withoutDane = analyzeCandidatePool(poolReviewEntries(setCandidateIncluded(candidates, 'c1', false)))
    expect(withoutDane.usableAnswers).toEqual(['BEAGLE', 'POODLE'])
    expect(withoutDane.duplicatesRemoved).toEqual([])
  })

  it('clean and noisy equivalent pools produce the same usable answers', () => {
    const clean = buildReviewCandidates(sourced('Beagle', 'Great Dane', 'Dog Park'))
    const noisy = buildReviewCandidates(sourced('Beagle', 'OX', 'Great Dane', 'BEAGLE', 'great-dane', 'Dog Park', 'St. Bernard'))
    expect(analyzeCandidatePool(poolReviewEntries(noisy)).usableAnswers).toEqual(
      analyzeCandidatePool(poolReviewEntries(clean)).usableAnswers,
    )
  })
})

describe('sourcing pipeline with the fixture source', () => {
  it('flows sourcing → validation → normalization → dedup → flags → Pool Diagnostics', async () => {
    const result = await sourceCandidates(fixtureCandidateSource, dogsRequest())
    if (!result.ok) throw new Error(result.error)
    const { candidates, issues } = result.pool

    expect(issues).toEqual([{ index: 33, reason: 'Candidate "Harness": rationale is not a string.' }])

    const find = (answer: string) => candidates.find((c) => c.sourceAnswer === answer)!
    expect(find('Great Dane')).toMatchObject({ normalizedAnswer: 'GREATDANE', category: 'Breeds', included: true })
    expect(find('great-dane')).toMatchObject({ duplicateOf: find('Great Dane').id, included: false })
    expect(find('St. Bernard')).toMatchObject({ validity: 'invalid', included: false })
    expect(find('Puppies').flags).toEqual([{ type: 'singular-plural-conflict', relatedCandidateIds: [find('Puppy').id] }])
    expect(find('Dog Parks').flags).toEqual([{ type: 'singular-plural-conflict', relatedCandidateIds: [find('Dog Park').id] }])
    expect(find('Walking').flags).toEqual([{ type: 'possible-morphological-variant', relatedCandidateIds: [find('Walk').id] }])
    // Flagged candidates stay included.
    expect([find('Puppies'), find('Dog Parks'), find('Walking')].every((c) => c.included)).toBe(true)

    const analysis = analyzeCandidatePool(poolReviewEntries(candidates))
    expect(analysis.usableAnswers).toHaveLength(33)
    expect(analysis.usableAnswers).not.toContain('STBERNARD')
    expect(analysis.usableAnswers.filter((a) => a === 'GREATDANE')).toHaveLength(1)
    expect(analysis.canGenerate).toBe(true)
  })

  it('reports a malformed provider response as a sourcing failure', async () => {
    const broken = { generate: () => Promise.resolve({ answers: [] }) }
    expect(await sourceCandidates(broken, dogsRequest())).toEqual({ ok: false, error: 'Sourcing response has no candidates array.' })
  })
})
