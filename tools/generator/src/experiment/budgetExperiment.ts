// Search-budget experiment: replays ONE deterministic candidate-pool trial
// plan at several Phase 1 maxAttempts values, so maxAttempts is the only
// variable. Measurement only — no generator behavior changes here.
//
// No separate trial-plan helper is needed: generateCandidatePoolSelection
// draws each trial's subset from its own RNG, seeded by
// `${seed}-trial-${i}-subset`, BEFORE construction runs, so the subset and
// construction seed for trial i never depend on maxAttempts. That's
// asserted rather than assumed (see verifyTrialPlanIdentity), and the
// pipeline — dedup, metrics, recovery checks — is exercised exactly as
// the Workshop uses it.
//
// Likewise, maxAttempts only decides WHEN the search stops; the search
// path up to that point is identical. So a trial that succeeds at a lower
// budget must succeed at every higher budget with the identical
// construction — asserted by verifyMonotonic.

import { matchDerivedEntriesToAuthored } from '../derive/derivePlayableEntries.js'
import { generateCandidatePoolSelection } from '../pool/generateCandidatePoolSelection.js'
import type {
  CandidatePoolSelectionSuccess,
  PoolCandidate,
  SubsetTrial,
} from '../pool/generateCandidatePoolSelection.js'
import { summarize } from './summarize.js'

export interface BudgetExperimentConfig {
  candidatePool: string[]
  seed: string
  maxWidth: number
  maxHeight: number
  minAnswers: number
  maxAnswers: number
  maxSubsetTrials: number
  budgets: number[]
}

export interface BudgetRun {
  maxAttempts: number
  elapsedMs: number
  result: CandidatePoolSelectionSuccess
}

export function runBudget(config: BudgetExperimentConfig, maxAttempts: number): BudgetRun {
  const start = performance.now()
  const result = generateCandidatePoolSelection({
    mode: 'candidate-pool',
    candidatePool: config.candidatePool,
    seed: config.seed,
    maxWidth: config.maxWidth,
    maxHeight: config.maxHeight,
    minAnswers: config.minAnswers,
    maxAnswers: config.maxAnswers,
    maxSubsetTrials: config.maxSubsetTrials,
    maxAttempts,
  })
  const elapsedMs = performance.now() - start
  if (!result.ok) throw new Error(`Budget experiment: invalid configuration: ${result.reason}`)
  return { maxAttempts, elapsedMs, result }
}

// ---- Verification -------------------------------------------------------

/** Mismatches in (subset, size, seed) for any trial index across runs. Empty = identical plan. */
export function verifyTrialPlanIdentity(runs: BudgetRun[]): string[] {
  const problems: string[] = []
  const reference = runs[0].result.subsetTrials
  for (const run of runs.slice(1)) {
    const trials = run.result.subsetTrials
    if (trials.length !== reference.length) {
      problems.push(`${run.maxAttempts}: ${trials.length} trials vs ${reference.length}`)
      continue
    }
    trials.forEach((trial, i) => {
      const ref = reference[i]
      if (
        trial.trialIndex !== ref.trialIndex ||
        trial.seed !== ref.seed ||
        trial.attemptedSubset.join(',') !== ref.attemptedSubset.join(',')
      ) {
        problems.push(`${run.maxAttempts}: trial ${i} differs from ${runs[0].maxAttempts}`)
      }
    })
  }
  return problems
}

/** Any lower-budget success that is not the identical success at a higher budget. Empty = monotonic. */
export function verifyMonotonic(runs: BudgetRun[]): string[] {
  const problems: string[] = []
  for (let r = 0; r < runs.length - 1; r++) {
    const lower = runs[r]
    for (const higher of runs.slice(r + 1)) {
      lower.result.subsetTrials.forEach((trial, i) => {
        if (!trial.ok) return
        const other = higher.result.subsetTrials[i]
        if (!other.ok) {
          problems.push(`trial ${i}: ok at ${lower.maxAttempts}, failed at ${higher.maxAttempts}`)
        } else if (JSON.stringify(other.construction) !== JSON.stringify(trial.construction)) {
          problems.push(`trial ${i}: different construction at ${higher.maxAttempts} than ${lower.maxAttempts}`)
        }
      })
    }
  }
  return problems
}

/** Geometry-invariant violations among every successful trial's construction. Empty = all valid. */
export function verifyGeometry(run: BudgetRun): string[] {
  const problems: string[] = []
  for (const trial of run.result.subsetTrials) {
    if (!trial.ok) continue
    const { placedAnswers, positions } = trial.construction
    if (!matchDerivedEntriesToAuthored(placedAnswers, positions).ok) {
      problems.push(`${run.maxAttempts}: trial ${trial.trialIndex} fails the geometry invariant`)
    }
  }
  for (const candidate of run.result.candidates) {
    const { incidentalEntryCount, derivedEntryCount } = candidate.metrics.derivedEntries
    if (incidentalEntryCount !== 0 || derivedEntryCount !== candidate.answerCount) {
      problems.push(
        `${run.maxAttempts}: candidate from trial ${candidate.representativeTrialIndex} has ` +
          `${incidentalEntryCount} incidental / ${derivedEntryCount} derived for ${candidate.answerCount} answers`,
      )
    }
  }
  return problems
}

// ---- Summaries ----------------------------------------------------------

export const ANSWER_COUNTS = [6, 7, 8, 9, 10, 11, 12] as const

export type FailureKind = 'budget-exhausted' | 'no-legal-arrangement' | 'other'

export function failureKind(trial: SubsetTrial): FailureKind | null {
  if (trial.ok) return null
  if (/Search budget exhausted/.test(trial.reason)) return 'budget-exhausted'
  if (/No legal connected arrangement/.test(trial.reason)) return 'no-legal-arrangement'
  return 'other'
}

export interface AnswerCountSummary {
  count: number
  distribution: Record<number, number>
  median: number | null
  count8to12: number
  count10to12: number
  count11to12: number
  /** Fractions of `count` (0–1); null when count is 0. */
  share8to12: number | null
  share10to12: number | null
  share11to12: number | null
}

export function summarizeAnswerCounts(answerCounts: number[]): AnswerCountSummary {
  const distribution: Record<number, number> = {}
  for (const n of ANSWER_COUNTS) distribution[n] = 0
  for (const n of answerCounts) distribution[n] = (distribution[n] ?? 0) + 1

  const countWhere = (predicate: (n: number) => boolean) => answerCounts.filter(predicate).length
  const count = answerCounts.length
  const share = (part: number) => (count === 0 ? null : part / count)
  const count8to12 = countWhere((n) => n >= 8 && n <= 12)
  const count10to12 = countWhere((n) => n >= 10 && n <= 12)
  const count11to12 = countWhere((n) => n >= 11 && n <= 12)

  return {
    count,
    distribution,
    median: summarize(answerCounts)?.median ?? null,
    count8to12,
    count10to12,
    count11to12,
    share8to12: share(count8to12),
    share10to12: share(count10to12),
    share11to12: share(count11to12),
  }
}

export interface BudgetSummary {
  maxAttempts: number
  trialsAttempted: number
  viableTrials: number
  failedTrials: number
  successRate: number
  uniqueCandidates: number
  duplicateCandidates: number
  failures: Record<FailureKind, number>
  /** Over UNIQUE candidates (post-dedup). */
  answers: AnswerCountSummary
  elapsedMs: number
}

// Restricting to the first `trialLimit` trials of the same plan gives
// exactly what a smaller maxSubsetTrials run would produce (trial i's
// subset/seed don't depend on the total), so the first-100 snapshot is
// what the Workshop's 100-trial batch sees. A unique candidate belongs to
// the prefix iff its representative (= earliest) trial is in it.
export function summarizeBudget(run: BudgetRun, trialLimit?: number): BudgetSummary {
  const limit = trialLimit ?? run.result.subsetTrials.length
  const trials = run.result.subsetTrials.slice(0, limit)
  const candidates: PoolCandidate[] = run.result.candidates.filter((c) => c.representativeTrialIndex < limit)

  const failures: Record<FailureKind, number> = { 'budget-exhausted': 0, 'no-legal-arrangement': 0, other: 0 }
  for (const trial of trials) {
    const kind = failureKind(trial)
    if (kind) failures[kind] += 1
  }
  const viableTrials = trials.filter((t) => t.ok).length

  return {
    maxAttempts: run.maxAttempts,
    trialsAttempted: trials.length,
    viableTrials,
    failedTrials: trials.length - viableTrials,
    successRate: trials.length === 0 ? 0 : viableTrials / trials.length,
    uniqueCandidates: candidates.length,
    duplicateCandidates: viableTrials - candidates.length,
    failures,
    answers: summarizeAnswerCounts(candidates.map((c) => c.answerCount)),
    elapsedMs: run.elapsedMs,
  }
}

export interface MarginalResult {
  from: number
  to: number
  additionalViable: number
  /** Fraction (0.25 = +25%); null if `from` had none. */
  viableIncrease: number | null
  additional8to12: number
  additional10to12: number
  additional11to12: number
  additionalMs: number
  runtimeIncrease: number | null
  /** Descriptive only: additional unique candidates per additional second. */
  viablePerAdditionalSecond: number | null
}

export function marginal(from: BudgetSummary, to: BudgetSummary): MarginalResult {
  const additionalViable = to.uniqueCandidates - from.uniqueCandidates
  const additionalMs = to.elapsedMs - from.elapsedMs
  return {
    from: from.maxAttempts,
    to: to.maxAttempts,
    additionalViable,
    viableIncrease: from.uniqueCandidates === 0 ? null : additionalViable / from.uniqueCandidates,
    additional8to12: to.answers.count8to12 - from.answers.count8to12,
    additional10to12: to.answers.count10to12 - from.answers.count10to12,
    additional11to12: to.answers.count11to12 - from.answers.count11to12,
    additionalMs,
    runtimeIncrease: from.elapsedMs === 0 ? null : additionalMs / from.elapsedMs,
    viablePerAdditionalSecond: additionalMs <= 0 ? null : additionalViable / (additionalMs / 1000),
  }
}

// ---- Per-trial recovery -------------------------------------------------

export interface RecoveryAnalysis {
  /** Budget at which each trial first succeeded (null = never), keyed by trial index. */
  firstSuccessBudget: (number | null)[]
  /** Budget at which a trial first succeeded (or "never") -> attempted subset size -> number of trials. */
  bySubsetSize: Record<string, Record<number, number>>
}

export function analyzeRecovery(runs: BudgetRun[]): RecoveryAnalysis {
  const trialCount = runs[0].result.subsetTrials.length
  const firstSuccessBudget: (number | null)[] = []
  const bySubsetSize: Record<string, Record<number, number>> = {}
  const bump = (key: string, size: number) => {
    bySubsetSize[key] ??= {}
    bySubsetSize[key][size] = (bySubsetSize[key][size] ?? 0) + 1
  }

  for (let i = 0; i < trialCount; i++) {
    const run = runs.find((r) => r.result.subsetTrials[i].ok)
    const budget = run ? run.maxAttempts : null
    firstSuccessBudget.push(budget)
    bump(budget === null ? 'never' : String(budget), runs[0].result.subsetTrials[i].attemptedSubset.length)
  }
  return { firstSuccessBudget, bySubsetSize }
}
