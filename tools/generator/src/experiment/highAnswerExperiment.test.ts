import { describe, expect, it } from 'vitest'
import harnessSource from './highAnswerExperiment.ts?raw'
import {
  groupByAnswerCount,
  isLetterConnected,
  runHighAnswerExperiment,
  selectHighAnswerRepresentatives,
  verifyRun,
} from './highAnswerExperiment'
import type { HighAnswerConfig } from './highAnswerExperiment'
import { matchDerivedEntriesToAuthored } from '../derive/derivePlayableEntries'
import { DOGS_BREEDS_CANDIDATE_POOL } from '../pool/dogsBreedsCandidatePool'
import { DOGS_CANDIDATE_POOL } from '../pool/dogsCandidatePool'
import { generateCandidatePoolSelection } from '../pool/generateCandidatePoolSelection'

// The real experiment's pool, envelope, bounds and budget with a short,
// test-only plan: successes are rare at 10–16 answers, so the seed is one
// whose first 14 trials include a known success (trial 8, 11 answers).
const CONFIG: HighAnswerConfig = {
  candidatePool: DOGS_BREEDS_CANDIDATE_POOL,
  seed: 'high-answer-harness-3',
  maxWidth: 12,
  maxHeight: 12,
  minAnswers: 10,
  maxAnswers: 16,
  maxSubsetTrials: 14,
  maxAttempts: 10000,
}
const run = runHighAnswerExperiment(CONFIG)

// Representative selection needs several candidates with DIFFERENT answer
// sets; the short-word 18-word pool produces those quickly.
const mixedSetCandidates = (() => {
  const result = generateCandidatePoolSelection({
    mode: 'candidate-pool',
    candidatePool: DOGS_CANDIDATE_POOL,
    seed: 'rep-selection-fixture',
    maxWidth: 12,
    maxHeight: 12,
    minAnswers: 6,
    maxAnswers: 8,
    maxSubsetTrials: 12,
  })
  if (!result.ok) throw new Error(result.reason)
  return result.candidates
})()

describe('high-answer experiment harness', () => {
  it('requests only 10–16-answer subsets, round-robin by trial index', () => {
    expect(run.subsetTrials.map((t) => t.attemptedSubset.length)).toEqual(
      Array.from({ length: 14 }, (_, i) => 10 + (i % 7)),
    )
  })

  it('has a deterministic trial plan and reproduces identical candidates', () => {
    const again = runHighAnswerExperiment(CONFIG)
    expect(again.subsetTrials.map((t) => [t.seed, t.attemptedSubset])).toEqual(
      run.subsetTrials.map((t) => [t.seed, t.attemptedSubset]),
    )
    expect(again.candidates).toEqual(run.candidates)
    expect(run.replayMismatches).toEqual([])
  })

  it('successes place exactly the requested count, with zero incidental entries and a passing invariant', () => {
    expect(verifyRun(run)).toEqual([])
    const successes = run.subsetTrials.filter((t) => t.ok)
    expect(successes.map((t) => t.trialIndex)).toEqual([8])
    for (const trial of successes) {
      if (!trial.ok) continue
      expect(trial.construction.placedAnswers).toHaveLength(trial.attemptedSubset.length)
      expect(matchDerivedEntriesToAuthored(trial.construction.placedAnswers, trial.construction.positions)).toEqual({ ok: true })
    }
    for (const c of run.candidates) {
      expect(c.metrics.derivedEntries.incidentalEntryCount).toBe(0)
      expect(c.metrics.derivedEntries.derivedEntryCount).toBe(c.answerCount)
    }
  })

  it('aggregates trials and candidates per answer count', () => {
    const groups = groupByAnswerCount(run)
    expect(groups.map((g) => g.answerCount)).toEqual([10, 11, 12, 13, 14, 15, 16])
    for (const g of groups) {
      const trials = run.subsetTrials.filter((t) => t.attemptedSubset.length === g.answerCount)
      expect(g.attempted).toBe(trials.length)
      expect(g.viable).toBe(trials.filter((t) => t.ok).length)
      expect(g.failures['budget-exhausted'] + g.failures['no-legal-arrangement'] + g.failures.other).toBe(g.attempted - g.viable)
      expect(g.unique).toBe(run.candidates.filter((c) => c.answerCount === g.answerCount).length)
      if (g.unique === 0) expect(g.geometry.density).toBeNull()
    }
    const total = groups.reduce((sum, g) => sum + g.runtimeMs, 0)
    expect(total).toBeCloseTo(run.trialTimings.reduce((sum, t) => sum + t.ms, 0), 6)
  })

  it('selects representatives deterministically, independent of input order', () => {
    const a = selectHighAnswerRepresentatives(mixedSetCandidates)
    const b = selectHighAnswerRepresentatives([...mixedSetCandidates].reverse())
    const ids = (reps: typeof a) => reps.map((r) => [r.labels, r.candidate.identitySignature])
    expect(ids(b)).toEqual(ids(a))
    // Every rule is accounted for, merged when rules coincide.
    expect(a.flatMap((r) => r.labels)).toHaveLength(3)
  })

  it('never uses the Phase 4 structural comparator (candidates span different answer sets)', () => {
    // compareCandidatesStructurally throws on different answer sets, so
    // succeeding here shows it isn't being used across them.
    expect(new Set(mixedSetCandidates.map((c) => c.selectedAnswers.join(','))).size).toBeGreaterThan(1)
    expect(() => selectHighAnswerRepresentatives(mixedSetCandidates)).not.toThrow()
    expect(harnessSource).not.toMatch(/pool\/compare|compareCandidatesStructurally/)
  })

  it('reports letter-sharing connectivity', () => {
    expect(isLetterConnected(['CAT', 'TIE', 'EAR'])).toBe(true)
    expect(isLetterConnected(['CAT', 'DOG'])).toBe(false)
  })
})
