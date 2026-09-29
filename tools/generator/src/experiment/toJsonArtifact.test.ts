import { describe, expect, it } from 'vitest'
import { toJsonArtifact } from './toJsonArtifact'
import { runGridSizeExperiment } from './gridSizeExperiment'

const SMALL_CONFIG = {
  candidatePool: ['CAT', 'TIE', 'EAR', 'ART', 'RAT'],
  seed: 'json-test-seed',
  minAnswers: 2,
  maxAnswers: 3,
  maxSubsetTrials: 15,
  sizes: [
    { maxWidth: 9, maxHeight: 9 },
    { maxWidth: 12, maxHeight: 12 },
    { maxWidth: 16, maxHeight: 16 },
    { maxWidth: 20, maxHeight: 20 },
  ],
}

function assertNoNaNOrInfinity(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNaNOrInfinity(item, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assertNoNaNOrInfinity(nested, `${path}.${key}`)
    }
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} is not finite (got ${value})`)
    }
  }
}

describe('toJsonArtifact', () => {
  const result = runGridSizeExperiment(SMALL_CONFIG)

  it('contains reproducibility configuration', () => {
    const artifact = toJsonArtifact(result, '2026-01-01T00:00:00.000Z')
    expect(artifact.config).toEqual(SMALL_CONFIG)
    expect(artifact.generatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('contains all four size results', () => {
    const artifact = toJsonArtifact(result, '2026-01-01T00:00:00.000Z')
    expect(artifact.sizes).toHaveLength(4)
    expect(artifact.sizes.map((s) => [s.maxWidth, s.maxHeight])).toEqual([
      [9, 9],
      [12, 12],
      [16, 16],
      [20, 20],
    ])
  })

  it('serializes through JSON.stringify/parse without NaN, Infinity, or unexpected nulls', () => {
    const artifact = toJsonArtifact(result, '2026-01-01T00:00:00.000Z')
    const roundTripped = JSON.parse(JSON.stringify(artifact))
    assertNoNaNOrInfinity(roundTripped)
    // Spot-check: a real numeric distribution field survives as a number, not null.
    const sizeWithCandidates = roundTripped.sizes.find((s: { uniqueCandidateCount: number }) => s.uniqueCandidateCount > 0)
    expect(sizeWithCandidates).toBeDefined()
    expect(typeof sizeWithCandidates.distributions.density.median).toBe('number')
  })

  it('includes full construction data for representatives but trims the full candidate list', () => {
    const artifact = toJsonArtifact(result, '2026-01-01T00:00:00.000Z')
    const sizeWithCandidates = artifact.sizes.find((s) => s.candidates.length > 0)
    expect(sizeWithCandidates).toBeDefined()
    if (!sizeWithCandidates) return

    for (const representative of sizeWithCandidates.representatives) {
      expect(representative.construction.cells).toBeDefined()
      expect(Object.keys(representative.construction.cells).length).toBeGreaterThan(0)
    }
    for (const candidate of sizeWithCandidates.candidates) {
      expect('construction' in candidate).toBe(false)
      expect('metrics' in candidate).toBe(false)
      expect(candidate.selectedAnswers.length).toBeGreaterThan(0)
    }
  })

  it('defaults generatedAt to an ISO timestamp when not supplied', () => {
    const artifact = toJsonArtifact(result)
    expect(() => new Date(artifact.generatedAt)).not.toThrow()
    expect(Number.isNaN(new Date(artifact.generatedAt).getTime())).toBe(false)
  })
})
