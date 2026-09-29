// Candidate-pool / subset-selection mode: given a larger, already
// editorially-approved thematic word pool, find multiple structurally
// viable ClueCross candidates by selecting different workable subsets and
// arranging each with the existing fixed-answer constructor. This models
// the historical manual ClueCross authoring workflow's geometric half —
// "which words work together" — not the editorial half ("which words fit
// the theme"), which this module assumes is already decided.
//
// Architecture: every subset "trial" is a fully independent call to
// Phase 1's own constructFixedAnswerPuzzle (unmodified — see the Phase 5
// checkpoint report for why this, rather than a new incremental search,
// is the right level of reuse). A trial either succeeds (every word in
// its attempted subset got placed — fixed-answer mode has no partial
// success) or fails, and the NEXT trial tries a differently-shuffled,
// differently-sized subset. Because each trial starts fresh from the
// full normalized pool, a word left out of one trial is never
// "permanently rejected" — it's simply not part of THAT trial's
// attempted subset, and remains eligible for every later trial.
//
// A successfully-placed subset is not automatically treated as viable:
// each trial explicitly re-verifies authored-answer recoverability
// (Phase 2's own assignEntryIds, reused unchanged) before being accepted,
// rather than assuming a successful construction automatically qualifies.
//
// This check earned its keep once already: the first real Dogs-pool
// experiment run under this architecture surfaced a genuine Phase 1
// placement-legality gap (validateCandidate's original same-direction-
// only adjacency rule missed a perpendicular case — a down answer's end
// cell landing immediately next to an unrelated across answer's start
// cell, which derivePlayableEntries would still merge into one run
// regardless of which direction placed each cell). That gap has since
// been fixed directly in validateCandidate (see backtrack.ts's authored-
// run-extension checks and the corresponding checkpoint report), so a
// correctly-behaving Phase 1 should never produce an unrecoverable
// construction now. This recoverability check is kept anyway, as
// deliberate defense in depth against any future placement-legality
// regression — not as a workaround for a known, still-open gap.

import { assignEntryIds, derivePlayableEntries } from '../derive/derivePlayableEntries.js'
import { canonicalSignature } from './canonicalize.js'
import type { Candidate } from './generateCandidatePool.js'
import { normalizeAnswers } from '../input.js'
import { computeMetrics } from '../metrics/metrics.js'
import { constructFixedAnswerPuzzle } from '../placement/backtrack.js'
import { createRng, shuffle } from '../rng.js'
import type { ConstructionSuccess } from '../types.js'

const DEFAULT_MAX_SUBSET_TRIALS = 100

export interface CandidatePoolSelectionConfig {
  mode: 'candidate-pool'
  candidatePool: string[]
  maxWidth: number
  maxHeight: number
  seed: number | string
  /** Phase 1's own per-construction placement-attempt budget, reused unchanged and passed through to every trial's constructFixedAnswerPuzzle call. Defaults to Phase 1's own default (10000) when omitted. */
  maxAttempts?: number
  /** How many distinct subset trials this call will attempt in total — bounds the OUTER loop, separate from maxAttempts (which bounds placement work WITHIN one trial). Defaults to 100. */
  maxSubsetTrials?: number
  /** Hard floor: a trial is never attempted with fewer than this many words. */
  minAnswers: number
  /** Hard ceiling: a trial is never attempted with more than this many words (clamped to the normalized pool size if larger). */
  maxAnswers: number
}

// targetAnswers was considered and deliberately left out: the trial
// generator already cycles through every size in [minAnswers, maxAnswers]
// across trials (see below), which explores the full range neutrally
// without needing a "preferred" size to bias toward. Adding targetAnswers
// would mean deciding how a preference interacts with that cycle (search
// the preferred size first? weight trials toward it?) for no clear
// benefit — and Part "Content amount" of this phase explicitly says more
// content is not automatically better, so biasing the search toward one
// preferred size isn't obviously desirable anyway. Left out; can be
// reconsidered if real use reveals a need.

export interface SubsetTrialSuccess {
  trialIndex: number
  seed: string
  /** The exact words this trial attempted to place — always fully placed on success (fixed-answer mode has no partial success). */
  attemptedSubset: string[]
  ok: true
  attemptsUsed: number
  construction: ConstructionSuccess
}

export interface SubsetTrialFailure {
  trialIndex: number
  seed: string
  attemptedSubset: string[]
  ok: false
  attemptsUsed: number
  reason: string
}

export type SubsetTrial = SubsetTrialSuccess | SubsetTrialFailure

// A Phase 5 candidate IS a Phase 4 Candidate (so Phase 4's own
// compareCandidatesStructurally / orderCandidatesStructurally work on it
// completely unmodified for same-subset comparisons — see the checkpoint
// report), plus the pool-specific bookkeeping Phase 4 has no notion of.
// `canonicalSignature` (inherited) stays pure geometry, exactly as Phase
// 4 defines it; `identitySignature` is Phase 5's broader dedup key (see
// below).
export interface PoolCandidate extends Candidate {
  /** Normalized, alphabetically sorted. */
  selectedAnswers: string[]
  /** Normalized pool minus selectedAnswers, alphabetically sorted. */
  unselectedAnswers: string[]
  answerCount: number
  /**
   * The real Phase 5 deduplication identity: selected-answer SET +
   * canonical geometry combined. Two candidates only collapse into one
   * if they agree on BOTH — the same geometry with a different selected
   * set is a different candidate, and vice versa (see the checkpoint
   * report's identity/dedup section).
   */
  identitySignature: string
  representativeTrialIndex: number
  sourceTrialIndices: number[]
}

export interface PoolSelectionDiversityStats {
  subsetTrialsAttempted: number
  viableSubsetTrialCount: number
  failedSubsetTrialCount: number
  /** Distinct selected-answer SETS among viable trials, ignoring geometry. */
  uniqueSelectedAnswerSetCount: number
  /** Layouts produced before dedup — always equal to viableSubsetTrialCount, since every viable trial produces exactly one layout (see Phase 4's identical rationale for keeping this a separate field). */
  rawSuccessfulLayoutCount: number
  /** After BOTH selected-set and geometry dedup. */
  uniqueCandidateCount: number
  duplicateCandidateCount: number
}

export interface CandidatePoolSelectionSuccess {
  ok: true
  config: CandidatePoolSelectionConfig
  normalizedPool: string[]
  subsetTrials: SubsetTrial[]
  candidates: PoolCandidate[]
  diversity: PoolSelectionDiversityStats
  /** word -> number of UNIQUE candidates (post-dedup) that selected it. Every pool word has an entry, including 0. Raw frequency only — not a quality signal. */
  wordSelectionFrequency: Record<string, number>
}

export interface CandidatePoolSelectionFailure {
  ok: false
  reason: string
}

export type CandidatePoolSelectionResult = CandidatePoolSelectionSuccess | CandidatePoolSelectionFailure

interface ConfigValidationSuccess {
  ok: true
  normalizedPool: string[]
}
interface ConfigValidationFailure {
  ok: false
  reason: string
}

function validateConfig(
  config: CandidatePoolSelectionConfig,
): ConfigValidationSuccess | ConfigValidationFailure {
  const normalized = normalizeAnswers(config.candidatePool)
  if (!normalized.ok) {
    return { ok: false, reason: `Invalid input: ${normalized.errors.join(' ')}` }
  }
  if (!Number.isInteger(config.minAnswers) || config.minAnswers < 1) {
    return { ok: false, reason: `minAnswers must be a positive integer, got ${config.minAnswers}.` }
  }
  if (!Number.isInteger(config.maxAnswers) || config.maxAnswers < 1) {
    return { ok: false, reason: `maxAnswers must be a positive integer, got ${config.maxAnswers}.` }
  }
  if (config.maxAnswers < config.minAnswers) {
    return {
      ok: false,
      reason: `maxAnswers (${config.maxAnswers}) must be >= minAnswers (${config.minAnswers}).`,
    }
  }
  if (config.minAnswers > normalized.answers.length) {
    return {
      ok: false,
      reason:
        `minAnswers (${config.minAnswers}) exceeds the normalized candidate pool size ` +
        `(${normalized.answers.length}); these bounds can never be satisfied.`,
    }
  }
  return { ok: true, normalizedPool: normalized.answers }
}

function sortedWords(words: string[]): string[] {
  return words.slice().sort()
}

function sortedRecord(values: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {}
  for (const key of Object.keys(values).sort()) {
    sorted[key] = values[key]
  }
  return sorted
}

function isSuccess(trial: SubsetTrial): trial is SubsetTrialSuccess {
  return trial.ok
}

export function generateCandidatePoolSelection(
  config: CandidatePoolSelectionConfig,
): CandidatePoolSelectionResult {
  const validated = validateConfig(config)
  if (!validated.ok) {
    return { ok: false, reason: validated.reason }
  }
  const normalizedPool = validated.normalizedPool

  const maxAnswers = Math.min(config.maxAnswers, normalizedPool.length)
  const minAnswers = config.minAnswers
  const maxSubsetTrials = config.maxSubsetTrials ?? DEFAULT_MAX_SUBSET_TRIALS

  // Cycled through round-robin across trials (trial i uses sizes[i %
  // sizes.length]) so the search explores the whole configured size
  // range roughly evenly, rather than defaulting toward "as much content
  // as possible" — deliberately, since more content isn't automatically
  // better (see the checkpoint report's "content amount" section).
  const sizes: number[] = []
  for (let size = minAnswers; size <= maxAnswers; size++) sizes.push(size)

  const subsetTrials: SubsetTrial[] = []
  for (let trialIndex = 0; trialIndex < maxSubsetTrials; trialIndex++) {
    const trialSeedBase = `${String(config.seed)}-trial-${trialIndex}`
    const subsetRng = createRng(`${trialSeedBase}-subset`)
    const constructionSeed = `${trialSeedBase}-construct`

    const targetSize = sizes[trialIndex % sizes.length]
    const attemptedSubset = shuffle(normalizedPool, subsetRng).slice(0, targetSize)

    const result = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: attemptedSubset,
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      seed: constructionSeed,
      maxAttempts: config.maxAttempts,
    })

    if (result.ok) {
      // Re-verify authored-answer recoverability explicitly (see the
      // module comment) rather than assuming a successful construction
      // is automatically viable.
      const runs = derivePlayableEntries(result.positions)
      const assignment = assignEntryIds(runs, result.placedAnswers, result.positions)
      if (assignment.ok) {
        subsetTrials.push({
          trialIndex,
          seed: constructionSeed,
          attemptedSubset,
          ok: true,
          attemptsUsed: result.attemptsUsed,
          construction: result,
        })
      } else {
        const words = assignment.unrecoverableAnswers.map((answer) => answer.word).join(', ')
        subsetTrials.push({
          trialIndex,
          seed: constructionSeed,
          attemptedSubset,
          ok: false,
          attemptsUsed: result.attemptsUsed,
          reason:
            `Construction succeeded but authored answer(s) could not be recovered as an exact ` +
            `derived playable entry: ${words}. This should not happen after Phase 1's authored-` +
            `run-extension fix — this check is defense in depth (see the module comment above).`,
        })
      }
    } else {
      subsetTrials.push({
        trialIndex,
        seed: constructionSeed,
        attemptedSubset,
        ok: false,
        attemptsUsed: result.attemptsUsed,
        reason: result.reason,
      })
    }
  }

  // Viability reduces to "the trial succeeded": fixed-answer mode already
  // guarantees every attempted word was placed (no partial success),
  // Phase 1's own connectivity/legality invariants are unchanged, and the
  // attempted size was always drawn from [minAnswers, maxAnswers] before
  // the trial ran — so a successful trial automatically satisfies every
  // viability condition in the Phase 5 spec without a separate check.
  const viableTrials = subsetTrials.filter(isSuccess)

  const groups = new Map<string, SubsetTrialSuccess[]>()
  for (const trial of viableTrials) {
    const selected = sortedWords(trial.construction.placedAnswers.map((answer) => answer.word))
    const geometry = canonicalSignature(trial.construction.placedAnswers, trial.construction.positions)
    const identity = `${selected.join(',')}||${geometry}`
    const group = groups.get(identity)
    if (group) group.push(trial)
    else groups.set(identity, [trial])
  }

  const metricsConfig = { maxWidth: config.maxWidth, maxHeight: config.maxHeight }
  const candidates: PoolCandidate[] = [...groups.entries()].map(([identity, group]) => {
    const representative = group[0]
    const selectedAnswers = sortedWords(representative.construction.placedAnswers.map((a) => a.word))
    const selectedSet = new Set(selectedAnswers)
    const unselectedAnswers = sortedWords(normalizedPool.filter((word) => !selectedSet.has(word)))
    const geometry = canonicalSignature(representative.construction.placedAnswers, representative.construction.positions)

    return {
      construction: representative.construction,
      metrics: computeMetrics(representative.construction, metricsConfig),
      canonicalSignature: geometry,
      representativeSeed: representative.seed,
      sourceSeeds: group.map((t) => t.seed),
      duplicateCount: group.length - 1,
      selectedAnswers,
      unselectedAnswers,
      answerCount: selectedAnswers.length,
      identitySignature: identity,
      representativeTrialIndex: representative.trialIndex,
      sourceTrialIndices: group.map((t) => t.trialIndex),
    }
  })

  const uniqueSelectedAnswerSetCount = new Set(
    viableTrials.map((trial) => sortedWords(trial.construction.placedAnswers.map((a) => a.word)).join(',')),
  ).size

  const diversity: PoolSelectionDiversityStats = {
    subsetTrialsAttempted: subsetTrials.length,
    viableSubsetTrialCount: viableTrials.length,
    failedSubsetTrialCount: subsetTrials.length - viableTrials.length,
    uniqueSelectedAnswerSetCount,
    rawSuccessfulLayoutCount: viableTrials.length,
    uniqueCandidateCount: candidates.length,
    duplicateCandidateCount: viableTrials.length - candidates.length,
  }

  const wordSelectionFrequency: Record<string, number> = {}
  for (const word of normalizedPool) wordSelectionFrequency[word] = 0
  for (const candidate of candidates) {
    for (const word of candidate.selectedAnswers) {
      wordSelectionFrequency[word] += 1
    }
  }

  return {
    ok: true,
    config,
    normalizedPool,
    subsetTrials,
    candidates,
    diversity,
    wordSelectionFrequency: sortedRecord(wordSelectionFrequency),
  }
}
