import { describe, expect, it } from 'vitest'
import {
  analyzeRecovery,
  marginal,
  runBudget,
  summarizeAnswerCounts,
  summarizeBudget,
  verifyGeometry,
  verifyMonotonic,
  verifyTrialPlanIdentity,
} from './budgetExperiment'
import type { BudgetExperimentConfig, BudgetSummary } from './budgetExperiment'
import { DOGS_CANDIDATE_POOL } from '../pool/dogsCandidatePool'

// Same Dogs pool and envelope as the real experiment, with a short plan
// and small budgets so recoveries actually occur within test time.
const CONFIG: BudgetExperimentConfig = {
  candidatePool: DOGS_CANDIDATE_POOL,
  seed: 'budget-harness-test',
  maxWidth: 12,
  maxHeight: 12,
  minAnswers: 6,
  maxAnswers: 12,
  maxSubsetTrials: 21,
  budgets: [500, 2000, 8000],
}
const runs = CONFIG.budgets.map((budget) => runBudget(CONFIG, budget))

describe('budget experiment harness: controlled replay', () => {
  it('replays the identical trial plan (subset, size, seed) at every budget', () => {
    expect(verifyTrialPlanIdentity(runs)).toEqual([])
    for (let i = 0; i < CONFIG.maxSubsetTrials; i++) {
      const [a, ...rest] = runs.map((run) => run.result.subsetTrials[i])
      for (const trial of rest) {
        expect(trial.attemptedSubset).toEqual(a.attemptedSubset)
        expect(trial.seed).toBe(a.seed)
      }
    }
  })

  it('detects a plan mismatch when one exists', () => {
    const other = runBudget({ ...CONFIG, seed: 'a-different-seed' }, 500)
    expect(verifyTrialPlanIdentity([runs[0], other]).length).toBeGreaterThan(0)
  })

  it('lower-budget successes stay successes with the identical construction at higher budgets', () => {
    expect(verifyMonotonic(runs)).toEqual([])
    // The fixture must actually exercise both cases to mean anything.
    const okAtLowest = runs[0].result.subsetTrials.filter((t) => t.ok).length
    const okAtHighest = runs[2].result.subsetTrials.filter((t) => t.ok).length
    expect(okAtLowest).toBeGreaterThan(0)
    expect(okAtHighest).toBeGreaterThan(okAtLowest)
  })

  it('every successful candidate has zero incidental entries and derived = authored', () => {
    for (const run of runs) {
      expect(verifyGeometry(run)).toEqual([])
      for (const candidate of run.result.candidates) {
        expect(candidate.metrics.derivedEntries.incidentalEntryCount).toBe(0)
        expect(candidate.metrics.derivedEntries.derivedEntryCount).toBe(candidate.answerCount)
      }
    }
  })

  it('a first-N snapshot equals a real run with maxSubsetTrials = N', () => {
    const prefix = summarizeBudget(runs[1], 7)
    const direct = summarizeBudget(runBudget({ ...CONFIG, maxSubsetTrials: 7 }, 2000))
    expect({ ...prefix, elapsedMs: 0 }).toEqual({ ...direct, elapsedMs: 0 })
  })

  it('records the first budget at which each trial succeeds', () => {
    const recovery = analyzeRecovery(runs)
    recovery.firstSuccessBudget.forEach((budget, i) => {
      const firstOk = runs.find((run) => run.result.subsetTrials[i].ok)
      expect(budget).toBe(firstOk ? firstOk.maxAttempts : null)
    })
    const total = Object.values(recovery.bySubsetSize)
      .flatMap((row) => Object.values(row))
      .reduce((a, b) => a + b, 0)
    expect(total).toBe(CONFIG.maxSubsetTrials)
  })
})

describe('budget experiment harness: calculations', () => {
  it('summarizes an answer-count distribution', () => {
    const s = summarizeAnswerCounts([6, 7, 8, 8, 10, 11, 12, 12])
    expect(s.distribution).toEqual({ 6: 1, 7: 1, 8: 2, 9: 0, 10: 1, 11: 1, 12: 2 })
    expect(s.median).toBe(9)
    expect([s.count8to12, s.count10to12, s.count11to12]).toEqual([6, 4, 3])
    expect([s.share8to12, s.share10to12, s.share11to12]).toEqual([6 / 8, 4 / 8, 3 / 8])
  })

  it('reports null shares and median for an empty distribution', () => {
    const s = summarizeAnswerCounts([])
    expect([s.median, s.share8to12, s.share10to12, s.share11to12]).toEqual([null, null, null, null])
  })

  it('computes marginal differences between two budgets', () => {
    const summary = (maxAttempts: number, unique: number, answers: number[], elapsedMs: number) =>
      ({ maxAttempts, uniqueCandidates: unique, answers: summarizeAnswerCounts(answers), elapsedMs }) as BudgetSummary
    const m = marginal(summary(5000, 4, [6, 7, 8, 10], 1000), summary(10000, 6, [6, 7, 8, 10, 11, 12], 3000))
    expect(m).toEqual({
      from: 5000,
      to: 10000,
      additionalViable: 2,
      viableIncrease: 0.5,
      additional8to12: 2,
      additional10to12: 2,
      additional11to12: 2,
      additionalMs: 2000,
      runtimeIncrease: 2,
      viablePerAdditionalSecond: 1,
    })
  })
})
