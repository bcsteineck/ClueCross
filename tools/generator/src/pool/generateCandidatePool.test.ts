import { describe, expect, it } from 'vitest'
import { generateCandidatePool } from './generateCandidatePool'

// Every seed in this file is numeric, but the type is `number | string`
// (seeds may be strings elsewhere) — this narrows for sort/Math.min
// comparators without an unsafe cast.
function asNumber(seed: number | string): number {
  return typeof seed === 'number' ? seed : Number(seed)
}

// CAT/TIE/EAR under this envelope, across seeds 1-20, is an empirically
// verified fixture (against this exact implementation): 20 successes
// collapsing into exactly 3 unique canonical layouts, with these precise
// seed groupings. Used as a golden fixture across several tests below
// rather than re-deriving it per test.
// Two genuinely different legal layouts (a C-shape and an S-shape):
//   T A R      C A T . .
//   . . A      . . A . .
//   C A T      . . R A T
// This fixture used to be CAT/TIE/EAR with three layouts, but two of those
// only existed by packing words into 2x2 blocks with incidental runs,
// which placement now correctly rejects.
const TWO_UNIQUE_CONFIG = {
  answers: ['CAT', 'TAR', 'RAT'],
  maxWidth: 6,
  maxHeight: 6,
  seeds: Array.from({ length: 20 }, (_, i) => i + 1),
}

describe('generateCandidatePool: multi-seed orchestration', () => {
  it('attempts every requested seed exactly once, in order', () => {
    const result = generateCandidatePool({
      answers: ['CAT', 'TIE'],
      maxWidth: 5,
      maxHeight: 5,
      seeds: [10, 20, 30],
    })
    expect(result.seedAttempts.map((a) => a.seed)).toEqual([10, 20, 30])
  })

  it('records success with attemptsUsed and the construction', () => {
    const result = generateCandidatePool({
      answers: ['CAT', 'TIE'],
      maxWidth: 5,
      maxHeight: 5,
      seeds: [1],
    })
    const [attempt] = result.seedAttempts
    expect(attempt.ok).toBe(true)
    if (!attempt.ok) return
    expect(attempt.attemptsUsed).toBeGreaterThan(0)
    expect(attempt.construction.placedAnswers).toHaveLength(2)
  })

  it('records failure with a reason and attemptsUsed, not disguised as something else', () => {
    const result = generateCandidatePool({
      answers: ['CAT', 'DOG'], // disconnected: no shared letters
      maxWidth: 5,
      maxHeight: 5,
      seeds: [1, 2, 3],
    })
    expect(result.seedAttempts.every((a) => !a.ok)).toBe(true)
    for (const attempt of result.seedAttempts) {
      if (attempt.ok) continue
      expect(attempt.reason).toMatch(/no legal connected arrangement/i)
      expect(attempt.attemptsUsed).toBeGreaterThan(0)
    }
  })

  it('passes through Phase 1 input-validation failures verbatim rather than reporting "all seeds failed"', () => {
    const result = generateCandidatePool({
      answers: ['CAT', 'DOG2'], // invalid character, rejected before search runs
      maxWidth: 5,
      maxHeight: 5,
      seeds: [1, 2],
    })
    for (const attempt of result.seedAttempts) {
      expect(attempt.ok).toBe(false)
      if (attempt.ok) continue
      expect(attempt.reason).toMatch(/invalid input/i)
    }
  })

  it('produces identical results for the same pool configuration run twice', () => {
    const config = { answers: ['CAT', 'TIE', 'EAR'], maxWidth: 6, maxHeight: 6, seeds: [1, 2, 3, 4, 5] }
    const first = generateCandidatePool(config)
    const second = generateCandidatePool(config)
    expect(first).toEqual(second)
  })
})

describe('generateCandidatePool: symmetry deduplication', () => {
  it('collapses all successes into one candidate when every seed converges on the same canonical layout', () => {
    // CAT/TIE (only one shared letter, minimal placement freedom) is
    // empirically verified to converge on a single canonical layout
    // across these 10 seeds.
    const result = generateCandidatePool({
      answers: ['CAT', 'TIE'],
      maxWidth: 5,
      maxHeight: 5,
      seeds: Array.from({ length: 10 }, (_, i) => i + 1),
    })
    expect(result.diversity.rawSuccessfulLayoutCount).toBe(10)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].sourceSeeds).toEqual(result.seedAttempts.map((a) => a.seed))
    expect(result.candidates[0].duplicateCount).toBe(9)
  })

  it('keeps genuinely different layouts as separate candidates, with correct provenance for each', () => {
    const result = generateCandidatePool(TWO_UNIQUE_CONFIG)
    expect(result.candidates).toHaveLength(2)

    const bySeeds = result.candidates.map((c) => c.sourceSeeds).sort((a, b) => asNumber(a[0]) - asNumber(b[0]))
    expect(bySeeds).toEqual([
      [1, 3, 5, 6, 7, 11, 14, 15, 16, 18, 19],
      [2, 4, 8, 9, 10, 12, 13, 17, 20],
    ])

    // Every candidate's canonicalSignature must be unique (they're
    // genuinely different layouts, not accidentally re-merged).
    const signatures = result.candidates.map((c) => c.canonicalSignature)
    expect(new Set(signatures).size).toBe(2)

    // No seed is lost or duplicated across candidates' provenance.
    const allSourceSeeds = result.candidates.flatMap((c) => c.sourceSeeds).sort((a, b) => asNumber(a) - asNumber(b))
    expect(allSourceSeeds).toEqual(TWO_UNIQUE_CONFIG.seeds.slice().sort((a, b) => asNumber(a) - asNumber(b)))
  })

  it('chooses the first attempted seed for a layout as its deterministic representative', () => {
    const result = generateCandidatePool(TWO_UNIQUE_CONFIG)
    const representativeSeeds = result.candidates
      .map((c) => c.representativeSeed)
      .sort((a, b) => asNumber(a) - asNumber(b))
    expect(representativeSeeds).toEqual([1, 2])
    for (const candidate of result.candidates) {
      expect(asNumber(candidate.representativeSeed)).toBe(Math.min(...candidate.sourceSeeds.map(asNumber)))
      expect(candidate.sourceSeeds[0]).toBe(candidate.representativeSeed)
    }
  })
})

describe('generateCandidatePool: metrics integration', () => {
  it('attaches a full Phase 3 MetricsResult to every unique candidate', () => {
    const result = generateCandidatePool(TWO_UNIQUE_CONFIG)
    for (const candidate of result.candidates) {
      expect(candidate.metrics.content.authoredAnswerCount).toBe(3)
      expect(candidate.metrics.geometry.configuredMaxWidth).toBe(6)
      expect(candidate.metrics.geometry.configuredMaxHeight).toBe(6)
      expect(Number.isFinite(candidate.metrics.geometry.density)).toBe(true)
    }
  })

  it('does not change a candidate\'s construction or metrics as a side effect of deduplication', () => {
    const result = generateCandidatePool({
      answers: ['CAT', 'TIE'],
      maxWidth: 5,
      maxHeight: 5,
      seeds: [1, 2, 3],
    })
    const [candidate] = result.candidates
    const representativeAttempt = result.seedAttempts.find((a) => a.seed === candidate.representativeSeed)
    expect(representativeAttempt?.ok).toBe(true)
    if (!representativeAttempt?.ok) return
    expect(candidate.construction).toEqual(representativeAttempt.construction)
  })
})

describe('generateCandidatePool: diversity statistics', () => {
  it('computes exact counts for a controlled fixture with known duplicates', () => {
    const result = generateCandidatePool(TWO_UNIQUE_CONFIG)
    expect(result.diversity).toEqual({
      attemptedSeedCount: 20,
      successfulSeedCount: 20,
      failedSeedCount: 0,
      rawSuccessfulLayoutCount: 20,
      uniqueLayoutCount: 2,
      duplicateLayoutCount: 18,
      uniquenessRate: 2 / 20,
    })
  })

  it('reports zeroed counts and a null uniquenessRate, not NaN/Infinity, when every seed fails', () => {
    const result = generateCandidatePool({
      answers: ['CAT', 'DOG'],
      maxWidth: 5,
      maxHeight: 5,
      seeds: [1, 2, 3],
    })
    expect(result.diversity).toEqual({
      attemptedSeedCount: 3,
      successfulSeedCount: 0,
      failedSeedCount: 3,
      rawSuccessfulLayoutCount: 0,
      uniqueLayoutCount: 0,
      duplicateLayoutCount: 0,
      uniquenessRate: null,
    })
    expect(result.candidates).toEqual([])
  })
})
