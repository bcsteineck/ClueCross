import { describe, expect, it } from 'vitest'
import { GRID_SIZES, runGridSizeExperiment, verifyTrialPlanAcrossSizes } from './gridSizeExperiment'

function expectFinite(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectFinite(item, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      expectFinite(nested, `${path}.${key}`)
    }
    return
  }
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} was not finite (got ${value})`).toBe(true)
  }
}

// A small, richly-overlapping fixture, verified empirically against this
// exact implementation: at both a tiny (6x6) and roomy (20x20) envelope,
// every subset this fixture's search attempts is small enough to fit
// either way, so the two sizes' results are identical — direct evidence
// that the same settings (pool, seed, trial generation) were used for
// each size, not just documented as intended.
const RICH_FIXTURE_CONFIG = {
  candidatePool: ['CAT', 'TIE', 'EAR', 'ART', 'RAT'],
  seed: 'exp-test-seed',
  minAnswers: 2,
  maxAnswers: 3,
  maxSubsetTrials: 30,
}

describe('GRID_SIZES', () => {
  it('defines exactly the four approved envelopes', () => {
    expect(GRID_SIZES).toEqual([
      { maxWidth: 9, maxHeight: 9 },
      { maxWidth: 12, maxHeight: 12 },
      { maxWidth: 16, maxHeight: 16 },
      { maxWidth: 20, maxHeight: 20 },
    ])
  })
})

describe('runGridSizeExperiment: orchestration', () => {
  it('runs every configured size, in the configured order', () => {
    const result = runGridSizeExperiment({ ...RICH_FIXTURE_CONFIG, sizes: GRID_SIZES })
    expect(result.sizes).toHaveLength(4)
    expect(result.sizes.map((s) => [s.maxWidth, s.maxHeight])).toEqual([
      [9, 9],
      [12, 12],
      [16, 16],
      [20, 20],
    ])
  })

  it('passes the same candidate pool and search settings to every size', () => {
    const result = runGridSizeExperiment({
      ...RICH_FIXTURE_CONFIG,
      sizes: [
        { maxWidth: 6, maxHeight: 6 },
        { maxWidth: 20, maxHeight: 20 },
      ],
    })
    const [small, large] = result.sizes
    // Every subset this fixture attempts is small enough to fit both
    // envelopes, so identical trial-level results across sizes are
    // direct evidence the same pool/seed/bounds were used for each.
    // envelopeUtilization is deliberately excluded: it's relative to each
    // size's own configuredMaxArea, so it correctly DIFFERS even when the
    // underlying geometry is identical (36 vs. 400 cell envelope).
    expect(small.subsetTrialsAttempted).toBe(large.subsetTrialsAttempted)
    expect(small.viableSubsetTrialCount).toBe(large.viableSubsetTrialCount)
    expect(small.uniqueSelectedAnswerSetCount).toBe(large.uniqueSelectedAnswerSetCount)
    const { envelopeUtilization: smallUtilization, ...smallRest } = small.distributions
    const { envelopeUtilization: largeUtilization, ...largeRest } = large.distributions
    expect(smallRest).toEqual(largeRest)
    expect(smallUtilization).not.toEqual(largeUtilization)
  })

  it('reproduces identical results for the same configuration run twice (ignoring wall-clock timing)', () => {
    const config = { ...RICH_FIXTURE_CONFIG, sizes: GRID_SIZES }
    const first = runGridSizeExperiment(config)
    const second = runGridSizeExperiment(config)
    // elapsedMs is a wall-clock measurement, not part of the deterministic
    // search/content — excluded from the equality check on purpose.
    const strip = (result: typeof first) => ({
      ...result,
      sizes: result.sizes.map(({ elapsedMs: _elapsedMs, ...rest }) => rest),
    })
    expect(strip(first)).toEqual(strip(second))
  })

  it('handles a size with zero viable candidates safely: null distributions, no representatives, no NaN/Infinity', () => {
    const result = runGridSizeExperiment({
      candidatePool: ['CAT', 'DOG'], // no shared letters, can never connect
      seed: 'zero-check',
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 5,
      sizes: [{ maxWidth: 9, maxHeight: 9 }],
    })
    const [size] = result.sizes
    expect(size.uniqueCandidateCount).toBe(0)
    expect(size.representatives).toEqual([])
    for (const value of Object.values(size.distributions)) {
      expect(value).toBeNull()
    }
    expectFinite(result)
  })

  it('produces no NaN or Infinity anywhere in a real multi-size result', () => {
    const result = runGridSizeExperiment({ ...RICH_FIXTURE_CONFIG, sizes: GRID_SIZES })
    expectFinite(result)
  })

  it('reports zero authored-recovery failures for legitimate Phase 1 output', () => {
    const result = runGridSizeExperiment({ ...RICH_FIXTURE_CONFIG, sizes: GRID_SIZES })
    for (const size of result.sizes) {
      expect(size.authoredRecoveryFailureCount).toBe(0)
    }
  })
})

describe('runGridSizeExperiment: aggregation over unique candidates', () => {
  it('computes exact distribution values for a controlled fixture', () => {
    const result = runGridSizeExperiment({
      ...RICH_FIXTURE_CONFIG,
      sizes: [{ maxWidth: 6, maxHeight: 6 }],
    })
    const [size] = result.sizes
    // Recorded after the no-incidental-entry correction (packed 3-word
    // layouts are now illegal, so fewer unique 3-answer candidates exist).
    expect(size.uniqueCandidateCount).toBe(18)

    const answerCount = size.distributions.selectedAnswerCount
    expect(answerCount).not.toBeNull()
    if (!answerCount) return
    expect({ min: answerCount.min, max: answerCount.max, median: answerCount.median, count: answerCount.count }).toEqual(
      { min: 2, max: 3, median: 2, count: 18 },
    )
    expect(answerCount.mean).toBeCloseTo(2.4444444444444446, 10)

    const occupied = size.distributions.occupiedCellCount
    expect(occupied).not.toBeNull()
    if (!occupied) return
    expect({ min: occupied.min, max: occupied.max, median: occupied.median, count: occupied.count }).toEqual({
      min: 5,
      max: 7,
      median: 5,
      count: 18,
    })
    expect(occupied.mean).toBeCloseTo(5.888888888888889, 10)
  })

  it('aggregates over UNIQUE candidates, not raw (duplicate-inflated) viable trials', () => {
    // CAT/TIE, forced to exactly 2 answers, is empirically known (Phase 4/5)
    // to converge on a single canonical layout across many seeds.
    const result = runGridSizeExperiment({
      candidatePool: ['CAT', 'TIE'],
      seed: 'dup-check',
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 10,
      sizes: [{ maxWidth: 6, maxHeight: 6 }],
    })
    const [size] = result.sizes
    expect(size.viableSubsetTrialCount).toBe(10)
    expect(size.uniqueCandidateCount).toBe(1)
    expect(size.duplicateCandidateCount).toBe(9)
    // The distribution's own sample count must reflect the 1 unique
    // candidate, not the 10 raw viable trials that produced it.
    expect(size.distributions.selectedAnswerCount?.count).toBe(1)
  })
})

describe('runGridSizeExperiment: controlled replay and corrected geometry', () => {
  const result = runGridSizeExperiment({ ...RICH_FIXTURE_CONFIG, sizes: GRID_SIZES })

  it('attempts the identical subset and seed for every trial at every size', () => {
    expect(verifyTrialPlanAcrossSizes(result)).toEqual([])
    const [reference, ...others] = result.sizes
    for (const size of others) {
      expect(size.trialPlan).toEqual(reference.trialPlan)
    }
  })

  it('detects a trial-plan mismatch between sizes', () => {
    const other = runGridSizeExperiment({ ...RICH_FIXTURE_CONFIG, seed: 'other', sizes: [GRID_SIZES[0]] })
    const mixed = { ...result, sizes: [result.sizes[0], other.sizes[0]] }
    expect(verifyTrialPlanAcrossSizes(mixed).length).toBeGreaterThan(0)
  })

  it('reports zero geometry violations and zero incidental entries at every size', () => {
    for (const size of result.sizes) {
      expect(size.geometryViolations).toEqual([])
      expect(size.distributions.incidentalEntryCount?.max ?? 0).toBe(0)
    }
  })

  it('breaks down every failed trial by reason and every unique candidate by answer count', () => {
    for (const size of result.sizes) {
      const { failureReasons, answerCounts } = size
      expect(failureReasons['budget-exhausted'] + failureReasons['no-legal-arrangement'] + failureReasons.other).toBe(
        size.failedSubsetTrialCount,
      )
      expect(answerCounts.count).toBe(size.uniqueCandidateCount)
    }
  })
})
