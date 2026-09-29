// Grid-size experiment: runs candidate-pool selection (Phase 5, unmodified)
// under several maxWidth/maxHeight envelopes using the SAME candidate
// pool and search settings, so the only variable across sizes is the
// configured grid envelope itself. This module only orchestrates and
// aggregates — no search/placement/derivation/assembly logic lives here.
//
// This is an experiment, not a benchmark contest: nothing here computes a
// cross-size score, ranking, or "best size". Every aggregate is a raw
// distribution over each size's own UNIQUE candidates (see summarize.ts),
// and Phase 4's structural comparator is only ever invoked within one
// size's same-selected-set candidates (see selectRepresentatives.ts) —
// never across sizes or across different selected-answer sets, exactly
// preserving its existing same-config boundary.

import { matchDerivedEntriesToAuthored } from '../derive/derivePlayableEntries.js'
import { generateCandidatePoolSelection } from '../pool/generateCandidatePoolSelection.js'
import type { PoolCandidate } from '../pool/generateCandidatePoolSelection.js'
import type { AnswerCountSummary, FailureKind } from './budgetExperiment.js'
import { failureKind, summarizeAnswerCounts } from './budgetExperiment.js'
import type { RepresentativeCandidate } from './selectRepresentatives.js'
import { selectRepresentatives } from './selectRepresentatives.js'
import type { NumericSummary } from './summarize.js'
import { summarize } from './summarize.js'

export interface GridSize {
  maxWidth: number
  maxHeight: number
}

// The four candidate ClueCross grid envelopes under comparison.
export const GRID_SIZES: readonly GridSize[] = [
  { maxWidth: 9, maxHeight: 9 },
  { maxWidth: 12, maxHeight: 12 },
  { maxWidth: 16, maxHeight: 16 },
  { maxWidth: 20, maxHeight: 20 },
]

export interface SizeExperimentConfig {
  candidatePool: string[]
  seed: number | string
  minAnswers: number
  maxAnswers: number
  maxSubsetTrials: number
  maxAttempts?: number
  sizes: readonly GridSize[]
}

export interface SizeDistributions {
  selectedAnswerCount: NumericSummary | null
  occupiedCellCount: NumericSummary | null
  boundingWidth: NumericSummary | null
  boundingHeight: NumericSummary | null
  boundingArea: NumericSummary | null
  density: NumericSummary | null
  envelopeUtilization: NumericSummary | null
  totalAuthoredIntersections: NumericSummary | null
  meanIntersectionsPerAuthoredAnswer: NumericSummary | null
  zeroOrSingleIntersectionAuthoredAnswerCount: NumericSummary | null
  derivedEntryCount: NumericSummary | null
  incidentalEntryCount: NumericSummary | null
  distinctLetterCount: NumericSummary | null
  maxLetterShare: NumericSummary | null
}

export interface SizeExperimentSizeResult {
  maxWidth: number
  maxHeight: number
  subsetTrialsAttempted: number
  viableSubsetTrialCount: number
  failedSubsetTrialCount: number
  uniqueSelectedAnswerSetCount: number
  rawSuccessfulLayoutCount: number
  uniqueCandidateCount: number
  duplicateCandidateCount: number
  /**
   * Subset trials that succeeded at placement but failed Phase 2
   * authored-answer recovery. Expected to be 0 for a correctly-behaving
   * Phase 1 (this is now defense-in-depth only — see the Phase 5
   * checkpoint report and the authored-run-extension fix).
   */
  authoredRecoveryFailureCount: number
  /** Failed trials by reason. Budget exhaustion is NOT proof no arrangement exists. */
  failureReasons: Record<FailureKind, number>
  /** 6–12 distribution and 8–12 / 10–12 / 11–12 shares over unique candidates. */
  answerCounts: AnswerCountSummary
  /**
   * Geometry-invariant violations among successful trials/candidates:
   * derived entries must equal authored answers (zero incidental entries).
   * Must be empty for the experiment's data to be valid.
   */
  geometryViolations: string[]
  /** Each trial's subset and seed, so cross-size plan identity can be verified. */
  trialPlan: { trialIndex: number; seed: string; attemptedSubset: string[] }[]
  elapsedMs: number
  distributions: SizeDistributions
  representatives: RepresentativeCandidate[]
  /** Every unique candidate for this size, not just the representatives. */
  candidates: PoolCandidate[]
}

export interface SizeExperimentResult {
  config: SizeExperimentConfig
  sizes: SizeExperimentSizeResult[]
}

function extractDistributions(candidates: PoolCandidate[]): SizeDistributions {
  return {
    selectedAnswerCount: summarize(candidates.map((c) => c.answerCount)),
    occupiedCellCount: summarize(candidates.map((c) => c.metrics.geometry.occupiedCellCount)),
    boundingWidth: summarize(candidates.map((c) => c.metrics.geometry.boundingWidth)),
    boundingHeight: summarize(candidates.map((c) => c.metrics.geometry.boundingHeight)),
    boundingArea: summarize(candidates.map((c) => c.metrics.geometry.boundingArea)),
    density: summarize(candidates.map((c) => c.metrics.geometry.density)),
    envelopeUtilization: summarize(candidates.map((c) => c.metrics.geometry.envelopeUtilization)),
    totalAuthoredIntersections: summarize(
      candidates.map((c) => c.metrics.authoredIntersections.totalAuthoredIntersections),
    ),
    meanIntersectionsPerAuthoredAnswer: summarize(
      candidates.map((c) => c.metrics.authoredIntersections.meanIntersectionsPerAuthoredAnswer),
    ),
    zeroOrSingleIntersectionAuthoredAnswerCount: summarize(
      candidates.map((c) => c.metrics.authoredIntersections.zeroOrSingleIntersectionAuthoredAnswerCount),
    ),
    derivedEntryCount: summarize(candidates.map((c) => c.metrics.derivedEntries.derivedEntryCount)),
    incidentalEntryCount: summarize(candidates.map((c) => c.metrics.derivedEntries.incidentalEntryCount)),
    distinctLetterCount: summarize(candidates.map((c) => c.metrics.letters.distinctLetterCount)),
    maxLetterShare: summarize(candidates.map((c) => c.metrics.letters.maxLetterShare)),
  }
}

const AUTHORED_RECOVERY_FAILURE_PATTERN = /could not be recovered/i

function runOneSize(config: SizeExperimentConfig, size: GridSize): SizeExperimentSizeResult {
  const start = Date.now()
  const poolResult = generateCandidatePoolSelection({
    mode: 'candidate-pool',
    candidatePool: config.candidatePool,
    maxWidth: size.maxWidth,
    maxHeight: size.maxHeight,
    seed: config.seed,
    minAnswers: config.minAnswers,
    maxAnswers: config.maxAnswers,
    maxSubsetTrials: config.maxSubsetTrials,
    maxAttempts: config.maxAttempts,
  })
  const elapsedMs = Date.now() - start

  if (!poolResult.ok) {
    // Config validation (pool text, minAnswers/maxAnswers bounds) doesn't
    // depend on maxWidth/maxHeight at all, so if one size's config is
    // invalid, every size's is — this should never happen for a config
    // that was ever going to produce a usable experiment.
    throw new Error(
      `Grid-size experiment: invalid candidate-pool configuration for ` +
        `${size.maxWidth}x${size.maxHeight}: ${poolResult.reason}`,
    )
  }

  const authoredRecoveryFailureCount = poolResult.subsetTrials.filter(
    (trial) => !trial.ok && AUTHORED_RECOVERY_FAILURE_PATTERN.test(trial.reason),
  ).length

  const failureReasons: Record<FailureKind, number> = { 'budget-exhausted': 0, 'no-legal-arrangement': 0, other: 0 }
  for (const trial of poolResult.subsetTrials) {
    const kind = failureKind(trial)
    if (kind) failureReasons[kind] += 1
  }

  const geometryViolations: string[] = []
  for (const trial of poolResult.subsetTrials) {
    if (trial.ok && !matchDerivedEntriesToAuthored(trial.construction.placedAnswers, trial.construction.positions).ok) {
      geometryViolations.push(`trial ${trial.trialIndex}: derived entries do not equal authored answers`)
    }
  }
  for (const candidate of poolResult.candidates) {
    const { incidentalEntryCount, derivedEntryCount } = candidate.metrics.derivedEntries
    if (incidentalEntryCount !== 0 || derivedEntryCount !== candidate.answerCount) {
      geometryViolations.push(
        `trial ${candidate.representativeTrialIndex}: ${incidentalEntryCount} incidental, ` +
          `${derivedEntryCount} derived for ${candidate.answerCount} answers`,
      )
    }
  }

  return {
    maxWidth: size.maxWidth,
    maxHeight: size.maxHeight,
    subsetTrialsAttempted: poolResult.diversity.subsetTrialsAttempted,
    viableSubsetTrialCount: poolResult.diversity.viableSubsetTrialCount,
    failedSubsetTrialCount: poolResult.diversity.failedSubsetTrialCount,
    uniqueSelectedAnswerSetCount: poolResult.diversity.uniqueSelectedAnswerSetCount,
    rawSuccessfulLayoutCount: poolResult.diversity.rawSuccessfulLayoutCount,
    uniqueCandidateCount: poolResult.diversity.uniqueCandidateCount,
    duplicateCandidateCount: poolResult.diversity.duplicateCandidateCount,
    authoredRecoveryFailureCount,
    failureReasons,
    answerCounts: summarizeAnswerCounts(poolResult.candidates.map((c) => c.answerCount)),
    geometryViolations,
    trialPlan: poolResult.subsetTrials.map(({ trialIndex, seed, attemptedSubset }) => ({ trialIndex, seed, attemptedSubset })),
    elapsedMs,
    distributions: extractDistributions(poolResult.candidates),
    representatives: selectRepresentatives(poolResult.candidates),
    candidates: poolResult.candidates,
  }
}

// Every size must attempt the identical subset sequence: same subset and
// construction seed for trial N at every envelope. Returns mismatches.
export function verifyTrialPlanAcrossSizes(result: SizeExperimentResult): string[] {
  const [reference, ...others] = result.sizes
  const problems: string[] = []
  for (const size of others) {
    if (size.trialPlan.length !== reference.trialPlan.length) {
      problems.push(`${size.maxWidth}x${size.maxHeight}: ${size.trialPlan.length} trials vs ${reference.trialPlan.length}`)
      continue
    }
    size.trialPlan.forEach((trial, i) => {
      const ref = reference.trialPlan[i]
      if (trial.seed !== ref.seed || trial.attemptedSubset.join(',') !== ref.attemptedSubset.join(',')) {
        problems.push(`${size.maxWidth}x${size.maxHeight}: trial ${i} differs from ${reference.maxWidth}x${reference.maxHeight}`)
      }
    })
  }
  return problems
}

export function runGridSizeExperiment(config: SizeExperimentConfig): SizeExperimentResult {
  const sizes = config.sizes.map((size) => runOneSize(config, size))
  return { config, sizes }
}
