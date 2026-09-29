// High-answer-count experiment: how feasibility and geometry change as the
// authored-answer count rises from 10 to 16 inside the fixed 12x12
// envelope. Measurement only — generation is the unchanged Phase 5
// candidate-pool selection (round-robin subset sizes, deterministic
// per-trial seeds), with maxAttempts passed explicitly so a future default
// change can't silently alter this experiment.
//
// Per-trial runtime isn't exposed by pool selection, so each trial is
// replayed once through constructFixedAnswerPuzzle with the identical
// subset/seed/config and timed; the replay's outcome is checked against
// the original, so the timing provably belongs to the same work.

import { matchDerivedEntriesToAuthored } from '../derive/derivePlayableEntries.js'
import { constructFixedAnswerPuzzle } from '../placement/backtrack.js'
import { generateCandidatePoolSelection } from '../pool/generateCandidatePoolSelection.js'
import type { PoolCandidate, SubsetTrial } from '../pool/generateCandidatePoolSelection.js'
import { mobileCellSizePx } from './renderHtml.js'
import { failureKind } from './budgetExperiment.js'
import type { FailureKind } from './budgetExperiment.js'
import { summarize } from './summarize.js'

export interface HighAnswerConfig {
  candidatePool: string[]
  seed: string
  maxWidth: number
  maxHeight: number
  minAnswers: number
  maxAnswers: number
  maxSubsetTrials: number
  maxAttempts: number
}

export interface TrialTiming {
  trialIndex: number
  ms: number
}

export interface HighAnswerRun {
  config: HighAnswerConfig
  normalizedPool: string[]
  subsetTrials: SubsetTrial[]
  candidates: PoolCandidate[]
  /** Wall-clock time of the full pool-selection call. */
  totalMs: number
  /** Per-trial replay timings (same order as subsetTrials). */
  trialTimings: TrialTiming[]
  /** Replays whose outcome differed from the original trial. Must be empty. */
  replayMismatches: string[]
}

function outcome(result: ReturnType<typeof constructFixedAnswerPuzzle>): string {
  return result.ok ? JSON.stringify(result) : `fail:${result.reason}`
}

export function runHighAnswerExperiment(config: HighAnswerConfig): HighAnswerRun {
  const start = performance.now()
  const result = generateCandidatePoolSelection({ mode: 'candidate-pool', ...config })
  const totalMs = performance.now() - start
  if (!result.ok) throw new Error(`High-answer experiment: invalid configuration: ${result.reason}`)

  const trialTimings: TrialTiming[] = []
  const replayMismatches: string[] = []
  for (const trial of result.subsetTrials) {
    const t0 = performance.now()
    const replay = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: trial.attemptedSubset,
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      seed: trial.seed,
      maxAttempts: config.maxAttempts,
    })
    trialTimings.push({ trialIndex: trial.trialIndex, ms: performance.now() - t0 })
    const original = trial.ok ? JSON.stringify(trial.construction) : `fail:${trial.reason}`
    if (outcome(replay) !== original) replayMismatches.push(`trial ${trial.trialIndex}`)
  }

  return {
    config,
    normalizedPool: result.normalizedPool,
    subsetTrials: result.subsetTrials,
    candidates: result.candidates,
    totalMs,
    trialTimings,
    replayMismatches,
  }
}

// ---- Verification -------------------------------------------------------

/** Every problem that would invalidate the data. Empty = valid. */
export function verifyRun(run: HighAnswerRun): string[] {
  const problems = [...run.replayMismatches.map((t) => `replay outcome differs: ${t}`)]
  for (const trial of run.subsetTrials) {
    const size = trial.attemptedSubset.length
    if (size < run.config.minAnswers || size > run.config.maxAnswers) {
      problems.push(`trial ${trial.trialIndex}: subset size ${size} outside bounds`)
    }
    if (!trial.ok) continue
    const { placedAnswers, positions } = trial.construction
    if (placedAnswers.length !== size) problems.push(`trial ${trial.trialIndex}: placed ${placedAnswers.length} of ${size}`)
    if (!matchDerivedEntriesToAuthored(placedAnswers, positions).ok) {
      problems.push(`trial ${trial.trialIndex}: geometry invariant fails`)
    }
  }
  for (const c of run.candidates) {
    const { incidentalEntryCount, derivedEntryCount } = c.metrics.derivedEntries
    if (incidentalEntryCount !== 0 || derivedEntryCount !== c.answerCount) {
      problems.push(`candidate (trial ${c.representativeTrialIndex}): ${incidentalEntryCount} incidental, ${derivedEntryCount} derived`)
    }
  }
  return problems
}

// ---- Per-answer-count aggregation ---------------------------------------

export function cellSizeAt360(candidate: PoolCandidate): number {
  const { boundingWidth, boundingHeight } = candidate.metrics.geometry
  return mobileCellSizePx(boundingWidth, boundingHeight, 360)
}

const medianOf = (values: number[]) => summarize(values)?.median ?? null

export interface AnswerCountGroup {
  answerCount: number
  attempted: number
  viable: number
  successRate: number
  unique: number
  duplicates: number
  failures: Record<FailureKind, number>
  /** Sum of per-trial replay times for trials of this requested size. */
  runtimeMs: number
  meanMsPerTrial: number
  meanMsPerSuccess: number | null
  /** Medians over this count's unique candidates; null when none. */
  geometry: {
    occupiedCells: number | null
    boundingWidth: number | null
    boundingHeight: number | null
    boundingArea: number | null
    density: number | null
    meanIntersectionsPerAnswer: number | null
    totalIntersections: number | null
    lowIntersectionAnswers: number | null
    distinctLetters: number | null
    maxLetterShare: number | null
    cellSizeAt360: number | null
  }
}

export function groupByAnswerCount(run: HighAnswerRun): AnswerCountGroup[] {
  const groups: AnswerCountGroup[] = []
  for (let n = run.config.minAnswers; n <= run.config.maxAnswers; n++) {
    const indices = run.subsetTrials.map((t, i) => (t.attemptedSubset.length === n ? i : -1)).filter((i) => i >= 0)
    const trials = indices.map((i) => run.subsetTrials[i])
    const candidates = run.candidates.filter((c) => c.answerCount === n)
    const viable = trials.filter((t) => t.ok).length
    const failures: Record<FailureKind, number> = { 'budget-exhausted': 0, 'no-legal-arrangement': 0, other: 0 }
    for (const trial of trials) {
      const kind = failureKind(trial)
      if (kind) failures[kind] += 1
    }
    const runtimeMs = indices.reduce((sum, i) => sum + run.trialTimings[i].ms, 0)
    const g = (key: (c: PoolCandidate) => number) => medianOf(candidates.map(key))

    groups.push({
      answerCount: n,
      attempted: trials.length,
      viable,
      successRate: trials.length ? viable / trials.length : 0,
      unique: candidates.length,
      duplicates: viable - candidates.length,
      failures,
      runtimeMs,
      meanMsPerTrial: trials.length ? runtimeMs / trials.length : 0,
      meanMsPerSuccess: viable ? runtimeMs / viable : null,
      geometry: {
        occupiedCells: g((c) => c.metrics.geometry.occupiedCellCount),
        boundingWidth: g((c) => c.metrics.geometry.boundingWidth),
        boundingHeight: g((c) => c.metrics.geometry.boundingHeight),
        boundingArea: g((c) => c.metrics.geometry.boundingArea),
        density: g((c) => c.metrics.geometry.density),
        meanIntersectionsPerAnswer: g((c) => c.metrics.authoredIntersections.meanIntersectionsPerAuthoredAnswer),
        totalIntersections: g((c) => c.metrics.authoredIntersections.totalAuthoredIntersections),
        lowIntersectionAnswers: g((c) => c.metrics.authoredIntersections.zeroOrSingleIntersectionAuthoredAnswerCount),
        distinctLetters: g((c) => c.metrics.letters.distinctLetterCount),
        maxLetterShare: g((c) => c.metrics.letters.maxLetterShare),
        cellSizeAt360: g(cellSizeAt360),
      },
    })
  }
  return groups
}

// ---- Representatives ----------------------------------------------------
//
// Descriptive picks within ONE answer count, by transparent single-metric
// rules with a deterministic tie-break (earliest trial). Deliberately no
// Phase 4 structural comparator: candidates here have different
// selected-answer sets, which that comparator refuses to compare.

export interface HighAnswerRepresentative {
  /** Which rule(s) chose this candidate — several labels if rules coincide. */
  labels: string[]
  candidate: PoolCandidate
}

function pick(candidates: PoolCandidate[], compare: (a: PoolCandidate, b: PoolCandidate) => number): PoolCandidate {
  return [...candidates].sort((a, b) => compare(a, b) || a.representativeTrialIndex - b.representativeTrialIndex)[0]
}

export function selectHighAnswerRepresentatives(candidates: PoolCandidate[]): HighAnswerRepresentative[] {
  if (candidates.length === 0) return []
  const medianDensity = medianOf(candidates.map((c) => c.metrics.geometry.density))!
  const picks: [string, PoolCandidate][] = [
    [
      'median density (nearest this count’s median density)',
      pick(candidates, (a, b) => Math.abs(a.metrics.geometry.density - medianDensity) - Math.abs(b.metrics.geometry.density - medianDensity)),
    ],
    [
      'high intersection (highest mean authored intersections per answer)',
      pick(
        candidates,
        (a, b) =>
          b.metrics.authoredIntersections.meanIntersectionsPerAuthoredAnswer -
          a.metrics.authoredIntersections.meanIntersectionsPerAuthoredAnswer,
      ),
    ],
    [
      'compact (smallest bounding area; ties: smaller longer side)',
      pick(
        candidates,
        (a, b) =>
          a.metrics.geometry.boundingArea - b.metrics.geometry.boundingArea ||
          Math.max(a.metrics.geometry.boundingWidth, a.metrics.geometry.boundingHeight) -
            Math.max(b.metrics.geometry.boundingWidth, b.metrics.geometry.boundingHeight),
      ),
    ],
  ]

  const representatives: HighAnswerRepresentative[] = []
  for (const [label, candidate] of picks) {
    const existing = representatives.find((r) => r.candidate.identitySignature === candidate.identitySignature)
    if (existing) existing.labels.push(label)
    else representatives.push({ labels: [label], candidate })
  }
  return representatives
}

// ---- Pool connectivity (descriptive only) -------------------------------

/** True if the subset's "shares at least one letter" graph is connected. */
export function isLetterConnected(words: string[]): boolean {
  if (words.length === 0) return true
  const seen = new Set([words[0]])
  const queue = [words[0]]
  while (queue.length > 0) {
    const word = queue.pop()!
    for (const other of words) {
      if (!seen.has(other) && [...word].some((ch) => other.includes(ch))) {
        seen.add(other)
        queue.push(other)
      }
    }
  }
  return seen.size === words.length
}
