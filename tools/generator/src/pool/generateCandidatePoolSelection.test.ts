import { describe, expect, it } from 'vitest'
import { generateCandidatePoolSelection } from './generateCandidatePoolSelection'
import { compareCandidatesStructurally } from './compare'
import { DOGS_CANDIDATE_POOL } from './dogsCandidatePool'
import { buildPuzzle } from '../assemble/buildPuzzle'
import { matchDerivedEntriesToAuthored } from '../derive/derivePlayableEntries'
import { validatePuzzleDefinition } from '../../../../src/core/validatePuzzleDefinition'

// Empirically verified (against this exact implementation) golden
// fixture: these five short, richly-overlapping words, with tight
// minAnswers/maxAnswers=2/3 bounds, deterministically produce 59/60
// viable trials (60/60 before the no-incidental-entry correction) with a rich mix of duplicate and distinct
// selected-set/geometry identities — used across several tests below
// rather than re-deriving new fixtures per test.
const RICH_FIXTURE = {
  mode: 'candidate-pool' as const,
  candidatePool: ['CAT', 'TIE', 'EAR', 'ART', 'RAT'],
  maxWidth: 6,
  maxHeight: 6,
  seed: 'dedup-search',
  minAnswers: 2,
  maxAnswers: 3,
  maxSubsetTrials: 60,
}

describe('generateCandidatePoolSelection: configuration/input validation', () => {
  it('normalizes candidatePool using Phase 1 rules (case, whitespace)', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: [' cat ', 'Tie', 'ear'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 1,
      minAnswers: 2,
      maxAnswers: 3,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.normalizedPool).toEqual(['CAT', 'TIE', 'EAR'])
  })

  it('rejects duplicate words in candidatePool rather than silently removing them', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'cat', 'TIE'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 1,
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/duplicate/i)
  })

  it('rejects invalid characters in candidatePool', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'DOG2'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 1,
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/invalid input/i)
  })

  it('rejects a non-positive minAnswers', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'TIE'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 1,
      minAnswers: 0,
      maxAnswers: 2,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/minAnswers must be a positive integer/i)
  })

  it('rejects maxAnswers smaller than minAnswers', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'TIE', 'EAR'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 1,
      minAnswers: 3,
      maxAnswers: 2,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/maxAnswers.*must be >= minAnswers/i)
  })

  it('fails clearly when minAnswers exceeds the normalized pool size (impossible bounds)', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'TIE'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 1,
      minAnswers: 5,
      maxAnswers: 5,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/exceeds the normalized candidate pool size/i)
  })
})

describe('generateCandidatePoolSelection: subset exploration', () => {
  it('produces a viable candidate using only a subset of the supplied pool', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates.length).toBeGreaterThan(0)
    for (const candidate of result.candidates) {
      expect(candidate.selectedAnswers.length).toBeLessThan(RICH_FIXTURE.candidatePool.length)
    }
  })

  it('does not permanently reject a word after it fails in one trial', () => {
    // Verified fixture: trial 3 ("ARM,TIE") fails to connect, but ARM
    // succeeds in several later trials (e.g. trial 0, "CAT,ARM") —
    // proving ARM's earlier failure did not exclude it from later trials.
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'TIE', 'EAR', 'ARM'],
      maxWidth: 6,
      maxHeight: 6,
      seed: 'temp-unplaceable-demo',
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 20,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const armFailedSomewhere = result.subsetTrials.some((t) => !t.ok && t.attemptedSubset.includes('ARM'))
    const armSucceededSomewhere = result.candidates.some((c) => c.selectedAnswers.includes('ARM'))
    expect(armFailedSomewhere).toBe(true)
    expect(armSucceededSomewhere).toBe(true)
  })

  it('different seeds can produce different viable selected-answer sets', () => {
    const a = generateCandidatePoolSelection({ ...RICH_FIXTURE, seed: 'seed-a', maxSubsetTrials: 10 })
    const b = generateCandidatePoolSelection({ ...RICH_FIXTURE, seed: 'seed-b', maxSubsetTrials: 10 })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    const setsA = a.candidates.map((c) => c.selectedAnswers.join(','))
    const setsB = b.candidates.map((c) => c.selectedAnswers.join(','))
    expect(setsA).not.toEqual(setsB)
  })

  it('reproduces identical results for the same seed and configuration', () => {
    const first = generateCandidatePoolSelection(RICH_FIXTURE)
    const second = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(first).toEqual(second)
  })

  it('places every selected answer exactly once in the construction', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      const placedWords = candidate.construction.placedAnswers.map((a) => a.word).sort()
      expect(placedWords).toEqual(candidate.selectedAnswers)
      expect(new Set(placedWords).size).toBe(placedWords.length)
    }
  })

  it('selected and unselected answers exactly partition the normalized pool', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      const combined = [...candidate.selectedAnswers, ...candidate.unselectedAnswers].sort()
      expect(combined).toEqual(result.normalizedPool.slice().sort())
      const overlap = candidate.selectedAnswers.filter((w) => candidate.unselectedAnswers.includes(w))
      expect(overlap).toEqual([])
    }
  })

  it('always keeps answer counts within [minAnswers, maxAnswers]', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      expect(candidate.answerCount).toBeGreaterThanOrEqual(RICH_FIXTURE.minAnswers)
      expect(candidate.answerCount).toBeLessThanOrEqual(RICH_FIXTURE.maxAnswers)
    }
  })
})

describe('generateCandidatePoolSelection: connectivity, legality, and assembly', () => {
  it('assembles every candidate through Phase 2 buildPuzzle and passes validatePuzzleDefinition unmodified', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      const assembled = buildPuzzle({
        construction: candidate.construction,
        id: 'phase5-test',
        clue: 'Test',
        unlockBudget: 100,
      })
      expect(assembled.ok).toBe(true)
      if (!assembled.ok) continue
      expect(validatePuzzleDefinition(assembled.puzzle, assembled.layout)).toEqual({
        valid: true,
        errors: [],
      })
    }
  })

  it('computes finite metrics for every candidate', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      expect(Number.isFinite(candidate.metrics.geometry.density)).toBe(true)
      expect(Number.isFinite(candidate.metrics.authoredIntersections.meanIntersectionsPerAuthoredAnswer)).toBe(
        true,
      )
    }
  })
})

describe('generateCandidatePoolSelection: identity and deduplication', () => {
  it('collapses trials sharing the same selected set and equivalent geometry, preserving provenance', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verified: trials 8, 52, and 58 all select {ART, CAT} with the same geometry.
    const artCatCandidates = result.candidates.filter(
      (c) => c.selectedAnswers.join(',') === 'ART,CAT' && c.sourceTrialIndices.includes(8),
    )
    expect(artCatCandidates).toHaveLength(1)
    expect(artCatCandidates[0].sourceTrialIndices).toEqual([8, 52, 58])
    expect(artCatCandidates[0].duplicateCount).toBe(2)
    expect(artCatCandidates[0].representativeTrialIndex).toBe(8)
  })

  it('keeps the same selected set as separate candidates when their geometry differs', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verified: {ART, CAT} appears with two distinct geometries across
    // this fixture's trials (trials 0/2 vs. trials 8/52/58).
    const artCatCandidates = result.candidates.filter((c) => c.selectedAnswers.join(',') === 'ART,CAT')
    expect(artCatCandidates.length).toBeGreaterThanOrEqual(2)
    const signatures = new Set(artCatCandidates.map((c) => c.identitySignature))
    expect(signatures.size).toBe(artCatCandidates.length)
  })

  it('never merges two candidates with different selected-answer sets, by construction', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const bySignature = new Map(result.candidates.map((c) => [c.identitySignature, c.selectedAnswers.join(',')]))
    // Every identitySignature maps to exactly one selected-answer set —
    // guaranteed by construction (identitySignature is prefixed with the
    // sorted selected-word list), verified here as a direct invariant.
    expect(bySignature.size).toBe(result.candidates.length)
  })
})

describe('generateCandidatePoolSelection: Phase 4 comparator boundary', () => {
  it('Phase 4 compareCandidatesStructurally works directly on two candidates sharing a selected set', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sameSet = result.candidates.filter((c) => c.selectedAnswers.join(',') === 'ART,CAT')
    expect(sameSet.length).toBeGreaterThanOrEqual(2)
    expect(() => compareCandidatesStructurally(sameSet[0], sameSet[1])).not.toThrow()
    expect([-1, 0, 1]).toContain(compareCandidatesStructurally(sameSet[0], sameSet[1]))
  })

  it('Phase 4 compareCandidatesStructurally refuses two candidates with different selected sets', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [a] = result.candidates
    const b = result.candidates.find((c) => c.selectedAnswers.join(',') !== a.selectedAnswers.join(','))
    expect(b).toBeDefined()
    if (!b) return
    expect(() => compareCandidatesStructurally(a, b)).toThrow(/different authored-answer sets/i)
  })

  it('exposes no cross-subset numeric quality score anywhere on the result', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      expect(candidate).not.toHaveProperty('score')
      expect(candidate).not.toHaveProperty('rank')
      expect(candidate).not.toHaveProperty('quality')
    }
    expect(result).not.toHaveProperty('score')
    expect(result).not.toHaveProperty('ranking')
  })
})

describe('generateCandidatePoolSelection: diversity and word-selection frequency', () => {
  it('computes exact diversity counts for the rich fixture', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Recorded after the no-incidental-entry correction: packed layouts
    // that used to count as extra unique candidates are now illegal, and
    // one subset that could only be connected by packing now fails.
    expect(result.diversity).toEqual({
      subsetTrialsAttempted: 60,
      viableSubsetTrialCount: 59,
      failedSubsetTrialCount: 1,
      uniqueSelectedAnswerSetCount: 19,
      rawSuccessfulLayoutCount: 59,
      uniqueCandidateCount: 29,
      duplicateCandidateCount: 30,
    })
  })

  it('reports a per-word selection frequency covering every pool word, sorted A-Z', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.wordSelectionFrequency)).toEqual(['ART', 'CAT', 'EAR', 'RAT', 'TIE'])
    for (const count of Object.values(result.wordSelectionFrequency)) {
      expect(Number.isInteger(count)).toBe(true)
      expect(count).toBeGreaterThanOrEqual(0)
    }
    // Deterministic: recomputing gives the exact same frequencies.
    const second = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(second.ok && second.wordSelectionFrequency).toEqual(result.wordSelectionFrequency)
  })

  it('produces safe zeroed diversity and frequency values, no NaN/Infinity, when nothing is viable', () => {
    const result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: ['CAT', 'DOG'], // no shared letters, can never connect
      maxWidth: 6,
      maxHeight: 6,
      seed: 'all-fail',
      minAnswers: 2,
      maxAnswers: 2,
      maxSubsetTrials: 5,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.diversity).toEqual({
      subsetTrialsAttempted: 5,
      viableSubsetTrialCount: 0,
      failedSubsetTrialCount: 5,
      uniqueSelectedAnswerSetCount: 0,
      rawSuccessfulLayoutCount: 0,
      uniqueCandidateCount: 0,
      duplicateCandidateCount: 0,
    })
    expect(result.candidates).toEqual([])
    expect(result.wordSelectionFrequency).toEqual({ CAT: 0, DOG: 0 })
    for (const value of Object.values(result.wordSelectionFrequency)) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })
})

describe('generateCandidatePoolSelection: the controlled Dogs pool', () => {
  const DOGS_CONFIG = {
    mode: 'candidate-pool' as const,
    candidatePool: DOGS_CANDIDATE_POOL,
    maxWidth: 12,
    maxHeight: 12,
    seed: 'dogs-experiment-1',
    minAnswers: 6,
    maxAnswers: 12,
    maxSubsetTrials: 100,
  }

  it('produces at least one viable candidate under a known configuration and budget', () => {
    const result = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  it('keeps every candidate within the configured answer-count bounds', () => {
    const result = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      expect(candidate.answerCount).toBeGreaterThanOrEqual(6)
      expect(candidate.answerCount).toBeLessThanOrEqual(12)
    }
  })

  it('only ever selects words from the Dogs pool, correctly partitioned', () => {
    const result = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const poolSet = new Set(DOGS_CANDIDATE_POOL)
    for (const candidate of result.candidates) {
      for (const word of candidate.selectedAnswers) expect(poolSet.has(word)).toBe(true)
      for (const word of candidate.unselectedAnswers) expect(poolSet.has(word)).toBe(true)
      expect([...candidate.selectedAnswers, ...candidate.unselectedAnswers].sort()).toEqual(
        DOGS_CANDIDATE_POOL.slice().sort(),
      )
    }
  })

  it('computes finite metrics for every Dogs-pool candidate', () => {
    const result = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      expect(Number.isFinite(candidate.metrics.geometry.density)).toBe(true)
      expect(Number.isFinite(candidate.metrics.letters.maxLetterShare)).toBe(true)
    }
  })

  it('reproduces identical results for the same Dogs-pool configuration run twice', () => {
    const first = generateCandidatePoolSelection(DOGS_CONFIG)
    const second = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(first).toEqual(second)
  })

  it('produces zero authored-recovery failures now that the Phase 1 authored-run-extension gap is fixed', () => {
    // This is exactly the configuration that originally surfaced the
    // CORGI/BARK-class bug (see the checkpoint report). Failed trials are
    // still expected (most random subsets simply don't connect), but none
    // of them should be authored-recovery failures — that failure mode
    // is defense-in-depth only now, not something legitimate Phase 1
    // output should ever trigger.
    const result = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const recoveryFailures = result.subsetTrials.filter(
      (trial) => !trial.ok && /could not be recovered/i.test(trial.reason),
    )
    expect(recoveryFailures).toEqual([])
  })

  it('returns only candidates whose derived entries are exactly their authored answers', () => {
    const result = generateCandidatePoolSelection(DOGS_CONFIG)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates.length).toBeGreaterThan(0)
    for (const candidate of result.candidates) {
      const { placedAnswers, positions } = candidate.construction
      expect(matchDerivedEntriesToAuthored(placedAnswers, positions)).toEqual({ ok: true })
      expect(candidate.metrics.derivedEntries.incidentalEntryCount).toBe(0)
      expect(candidate.metrics.derivedEntries.derivedEntryCount).toBe(candidate.answerCount)
    }
    // The final invariant is a backstop, not a filter: placement legality
    // alone should keep every trial clean, so no trial fails on it.
    expect(result.subsetTrials.filter((t) => !t.ok && /Geometry invariant/.test(t.reason))).toEqual([])
  })
})

describe('generateCandidatePoolSelection: no incidental entries (rich fixture)', () => {
  it('every returned candidate has zero incidental entries', () => {
    const result = generateCandidatePoolSelection(RICH_FIXTURE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const candidate of result.candidates) {
      const { placedAnswers, positions } = candidate.construction
      expect(matchDerivedEntriesToAuthored(placedAnswers, positions)).toEqual({ ok: true })
      expect(candidate.metrics.derivedEntries.incidentalEntryCount).toBe(0)
    }
  })
})
