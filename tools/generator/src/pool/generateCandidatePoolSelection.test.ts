import { describe, expect, it } from 'vitest'
import {
  constructionRestartSeed,
  generateCandidatePoolSelection,
  SELECTED_CONSTRUCTION_RESTARTS,
} from './generateCandidatePoolSelection'
import type { CandidatePoolSelectionConfig } from './generateCandidatePoolSelection'
import { DESSERTS_OBSERVED_11 } from './dessertsCandidatePool'
import { constructFixedAnswerPuzzle } from '../placement/backtrack'
import { computeMetrics } from '../metrics/metrics'
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

describe('generateCandidatePoolSelection: deterministic construction restarts', () => {
  // A single fixed 11-answer subset known to be constructible, so every
  // trial attempts the same words and only the construction seed varies.
  const config = (seed: string, trials: number): CandidatePoolSelectionConfig => ({
    mode: 'candidate-pool',
    candidatePool: DESSERTS_OBSERVED_11,
    seed,
    minAnswers: 11,
    maxAnswers: 11,
    maxSubsetTrials: trials,
    maxWidth: 12,
    maxHeight: 12,
    constructionRestarts: SELECTED_CONSTRUCTION_RESTARTS,
  })
  const run = (seed: string, trials: number) => {
    const result = generateCandidatePoolSelection(config(seed, trials))
    if (!result.ok) throw new Error(result.reason)
    return result
  }
  const single = (answers: string[], seed: string) =>
    constructFixedAnswerPuzzle({ mode: 'fixed-answer', answers, seed, maxWidth: 12, maxHeight: 12, maxAttempts: 2000 })

  it('is the selected 5 × 2,000 strategy (10,000 maximum per subset trial)', () => {
    expect(SELECTED_CONSTRUCTION_RESTARTS).toEqual({ restarts: 5, attemptsPerRestart: 2000 })
  })

  it('keeps restart 0 on the existing construction seed and derives distinct seeds for restarts 1–4', () => {
    expect([0, 1, 2, 3, 4].map((k) => constructionRestartSeed('s-trial-0-construct', k))).toEqual([
      's-trial-0-construct',
      's-trial-0-construct:restart:1',
      's-trial-0-construct:restart:2',
      's-trial-0-construct:restart:3',
      's-trial-0-construct:restart:4',
    ])
  })

  it('stops at the first successful restart: restart 2 succeeds, so restarts 3 and 4 never run', () => {
    const [trial] = run('restart-test-1', 1).subsetTrials
    const base = 'restart-test-1-trial-0-construct'
    expect(trial.ok).toBe(true)
    if (!trial.ok) return
    expect(trial.restarts?.map((r) => [r.restart, r.seed, r.ok])).toEqual([
      [0, base, false],
      [1, `${base}:restart:1`, false],
      [2, `${base}:restart:2`, true],
    ])
    expect(trial.restarts?.slice(0, 2).map((r) => r.attempts)).toEqual([2000, 2000])
    expect(trial.attemptsUsed).toBe(4000 + trial.restarts![2].attempts)
    // Provenance: the recorded seed reproduces the construction directly.
    expect(trial.seed).toBe(`${base}:restart:2`)
    expect(trial.construction).toEqual(single(trial.attemptedSubset, trial.seed))
  })

  it('runs every restart as a fresh search of the same subset with a 2,000-attempt ceiling', () => {
    const [trial] = run('restart-test-1', 1).subsetTrials
    for (const restart of trial.restarts ?? []) {
      // Identical to an independent single search: nothing carries over between restarts.
      const standalone = single(trial.attemptedSubset, restart.seed)
      expect(standalone.ok).toBe(restart.ok)
      expect(Math.min(standalone.attemptsUsed, 2000)).toBe(restart.attempts)
    }
  })

  it('fails a subset only after all five restarts, never exceeding 10,000 attempts, then continues to the next trial', () => {
    const { subsetTrials } = run('restart-test-7', 2)
    const [failed, next] = subsetTrials
    expect(failed.ok).toBe(false)
    if (failed.ok) return
    expect(failed.restarts).toHaveLength(5)
    expect(failed.restarts?.every((r) => !r.ok && r.attempts === 2000)).toBe(true)
    expect(failed.attemptsUsed).toBe(10000)
    expect(failed.reason).toBe(
      'All 5 construction restarts failed (5 × 2000 attempts): 5 search budget exhausted, 0 no legal connected arrangement.',
    )
    expect(new Set(failed.restarts?.map((r) => r.seed)).size).toBe(5)
    expect(next.trialIndex).toBe(1)
    expect(next.ok).toBe(true)
  })

  it('keeps every invariant, deduplicates as before, and is deterministic', () => {
    const result = run('restart-test-7', 6)
    expect(generateCandidatePoolSelection(config('restart-test-7', 6))).toEqual(result)
    expect(result.candidates.length).toBeGreaterThan(0)
    for (const candidate of result.candidates) {
      expect(candidate.construction.placedAnswers.map((a) => a.word).sort()).toEqual([...DESSERTS_OBSERVED_11].sort())
      const metrics = computeMetrics(candidate.construction, { maxWidth: 12, maxHeight: 12 })
      expect(metrics.derivedEntries.incidentalEntryCount).toBe(0)
      expect(metrics.derivedEntries.derivedEntryCount).toBe(metrics.content.authoredAnswerCount)
    }
    expect(new Set(result.candidates.map((c) => c.identitySignature)).size).toBe(result.candidates.length)
    const viable = result.subsetTrials.filter((t) => t.ok).map((t) => t.trialIndex)
    expect(result.candidates.flatMap((c) => c.sourceTrialIndices).sort((a, b) => a - b)).toEqual(viable)
  })

  it('rejects maxAttempts together with constructionRestarts, and leaves single-search trials unchanged', () => {
    expect(generateCandidatePoolSelection({ ...config('x', 1), maxAttempts: 10000 })).toEqual({
      ok: false,
      reason: 'Set either maxAttempts or constructionRestarts, not both.',
    })
    const { constructionRestarts: _unused, ...singleConfig } = config('restart-test-1', 1)
    void _unused
    const plain = generateCandidatePoolSelection({ ...singleConfig, maxAttempts: 10000 })
    if (!plain.ok) throw new Error(plain.reason)
    expect(plain.subsetTrials[0]).not.toHaveProperty('restarts')
    expect(plain.subsetTrials[0].seed).toBe('restart-test-1-trial-0-construct')
  })
})
