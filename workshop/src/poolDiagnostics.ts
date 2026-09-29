// Candidate Pool Diagnostics (v1): analyzes raw Workshop candidate entries
// before generation — normalizes, excludes invalid entries, removes
// duplicate valid entries, computes length statistics, and emits
// deterministic diagnostics that decide whether Generate is allowed.
//
// It does NOT generate, rank, score pool "quality", add or replace
// answers, detect semantic duplicates, or change generator validation:
// validity comes from the generator's own normalizeAnswers, applied per
// entry. Only an error-severity diagnostic blocks generation.

import { normalizeAnswers } from '../../tools/generator/src/input.js'

export const MIN_USABLE_ANSWERS = 10
export const RECOMMENDED_POOL_SIZE = 30

const SHORT_MIN_LENGTH = 3
const SHORT_MAX_LENGTH = 5
const MEDIUM_MIN_LENGTH = 6
const MEDIUM_MAX_LENGTH = 8
const LONG_MIN_LENGTH = 9

const MIN_SHORT_RATIO = 0.2 // warn below 20%
const MAX_LONG_RATIO = 0.4 // warn above 40%
const MAX_MEAN_LENGTH = 7.0 // warn above 7.0

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type DiagnosticCode =
  | 'not-enough-answers'
  | 'small-pool'
  | 'few-short-answers'
  | 'many-long-answers'
  | 'high-average-length'
  | 'duplicates-removed'
  | 'invalid-entries-excluded'

export interface PoolDiagnostic {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  message: string
  /** Supporting entries for expandable details (duplicates removed / invalid entries). */
  entries?: string[]
}

export interface PoolStats {
  usableCount: number
  shortCount: number
  mediumCount: number
  longCount: number
  shortRatio: number | null
  mediumRatio: number | null
  longRatio: number | null
  meanLength: number | null
  duplicateCount: number
  invalidCount: number
}

export interface CandidatePoolAnalysis {
  usableAnswers: string[]
  duplicatesRemoved: string[]
  invalidEntries: string[]
  stats: PoolStats
  diagnostics: PoolDiagnostic[]
  canGenerate: boolean
}

export function analyzeCandidatePool(rawEntries: string[]): CandidatePoolAnalysis {
  // Blank entries are ignored entirely: not invalid, not duplicates.
  const nonBlank = rawEntries.map((entry) => entry.trim()).filter((entry) => entry.length > 0)

  const valid: string[] = []
  const invalidEntries: string[] = []
  for (const entry of nonBlank) {
    const result = normalizeAnswers([entry])
    if (result.ok) valid.push(result.answers[0])
    else invalidEntries.push(entry)
  }

  // Only valid entries take part in duplicate detection. Each removed
  // entry counts, not each duplicate group.
  const seen = new Set<string>()
  const usableAnswers: string[] = []
  const duplicatesRemoved: string[] = []
  for (const word of valid) {
    if (seen.has(word)) {
      duplicatesRemoved.push(word)
      continue
    }
    seen.add(word)
    usableAnswers.push(word)
  }

  const stats = calculatePoolStats(usableAnswers, duplicatesRemoved.length, invalidEntries.length)
  const diagnostics = buildDiagnostics(stats, duplicatesRemoved, invalidEntries)

  return {
    usableAnswers,
    duplicatesRemoved,
    invalidEntries,
    stats,
    diagnostics,
    canGenerate: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
  }
}

export function calculatePoolStats(usableAnswers: string[], duplicateCount: number, invalidCount: number): PoolStats {
  const usableCount = usableAnswers.length
  let shortCount = 0
  let mediumCount = 0
  let longCount = 0
  let totalLetters = 0

  for (const answer of usableAnswers) {
    // Usable answers are already normalized to A–Z, so string length is
    // the playable letter count. The generator's 3-letter minimum means
    // every answer lands in exactly one band.
    const length = answer.length
    totalLetters += length
    if (length >= SHORT_MIN_LENGTH && length <= SHORT_MAX_LENGTH) shortCount += 1
    else if (length >= MEDIUM_MIN_LENGTH && length <= MEDIUM_MAX_LENGTH) mediumCount += 1
    else if (length >= LONG_MIN_LENGTH) longCount += 1
  }

  if (usableCount === 0) {
    return {
      usableCount: 0,
      shortCount: 0,
      mediumCount: 0,
      longCount: 0,
      shortRatio: null,
      mediumRatio: null,
      longRatio: null,
      meanLength: null,
      duplicateCount,
      invalidCount,
    }
  }

  return {
    usableCount,
    shortCount,
    mediumCount,
    longCount,
    shortRatio: shortCount / usableCount,
    mediumRatio: mediumCount / usableCount,
    longRatio: longCount / usableCount,
    meanLength: totalLetters / usableCount,
    duplicateCount,
    invalidCount,
  }
}

// Pushed in canonical display order, so no sorting step is needed.
function buildDiagnostics(stats: PoolStats, duplicatesRemoved: string[], invalidEntries: string[]): PoolDiagnostic[] {
  const diagnostics: PoolDiagnostic[] = []
  const { usableCount, shortRatio, longRatio, meanLength, duplicateCount, invalidCount } = stats

  if (usableCount < MIN_USABLE_ANSWERS) {
    diagnostics.push({
      code: 'not-enough-answers',
      severity: 'error',
      message:
        `Not enough candidate answers. Add at least ${MIN_USABLE_ANSWERS} valid, unique answers to ` +
        `generate a puzzle. Currently: ${usableCount}.`,
    })
  }

  if (usableCount >= MIN_USABLE_ANSWERS && usableCount < RECOMMENDED_POOL_SIZE) {
    diagnostics.push({
      code: 'small-pool',
      severity: 'warning',
      message:
        `Small candidate pool. ${RECOMMENDED_POOL_SIZE}+ answers are recommended to give the generator ` +
        `more construction options. Currently: ${usableCount}.`,
    })
  }

  // Length diagnostics only exist when there's something to measure.
  if (shortRatio !== null && longRatio !== null && meanLength !== null) {
    if (shortRatio < MIN_SHORT_RATIO) {
      diagnostics.push({
        code: 'few-short-answers',
        severity: 'warning',
        message:
          `Few short answers. Only ${formatThresholdPercentage(shortRatio, MIN_SHORT_RATIO)} of the pool ` +
          `is 3–5 letters. Shorter answers can give the generator more placement options.`,
      })
    }

    const hasManyLongAnswers = longRatio > MAX_LONG_RATIO
    if (hasManyLongAnswers) {
      diagnostics.push({
        code: 'many-long-answers',
        severity: 'warning',
        message:
          `Many long answers. ${formatThresholdPercentage(longRatio, MAX_LONG_RATIO)} of the pool is 9+ ` +
          `letters, which can make 12×12 construction more difficult.`,
      })
    }

    // Suppressed when Many Long already describes the problem.
    if (meanLength > MAX_MEAN_LENGTH && !hasManyLongAnswers) {
      diagnostics.push({
        code: 'high-average-length',
        severity: 'warning',
        message:
          `High average answer length. The average answer is ` +
          `${formatThresholdAverage(meanLength, MAX_MEAN_LENGTH)} letters, which can make 12×12 ` +
          `construction more difficult.`,
      })
    }
  }

  if (duplicateCount > 0) {
    diagnostics.push({
      code: 'duplicates-removed',
      severity: 'info',
      message: duplicateCount === 1 ? '1 duplicate entry removed.' : `${duplicateCount} duplicate entries removed.`,
      entries: duplicatesRemoved,
    })
  }

  // Invalid entries count individually — repeats are not deduplicated.
  if (invalidCount > 0) {
    diagnostics.push({
      code: 'invalid-entries-excluded',
      severity: 'info',
      message: invalidCount === 1 ? '1 invalid entry excluded.' : `${invalidCount} invalid entries excluded.`,
      entries: invalidEntries,
    })
  }

  return diagnostics
}

// ---- Presentation -------------------------------------------------------

/** Conventional half-up rounding (values here are non-negative). */
export function roundHalfUp(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces
  return Math.floor(value * factor + 0.5) / factor
}

/**
 * Whole-number percentage, unless rounding would display exactly the
 * threshold for a value that crossed it (e.g. 19.6% for a "< 20%"
 * trigger) — then one decimal, so the warning never contradicts itself.
 */
export function formatThresholdPercentage(ratio: number, threshold: number): string {
  const percent = ratio * 100
  const thresholdPercent = threshold * 100
  const whole = roundHalfUp(percent, 0)
  if (whole === thresholdPercent && percent !== thresholdPercent) {
    return `${roundHalfUp(percent, 1).toFixed(1)}%`
  }
  return `${whole.toFixed(0)}%`
}

/** One decimal, or two if one decimal would display exactly the threshold that was crossed. */
export function formatThresholdAverage(value: number, threshold: number): string {
  const oneDecimal = roundHalfUp(value, 1)
  if (value > threshold && oneDecimal === threshold) return roundHalfUp(value, 2).toFixed(2)
  return oneDecimal.toFixed(1)
}

export interface PoolSummary {
  headline: string
  short: string
  medium: string
  long: string
  average: string
}

export function buildPoolSummary(stats: PoolStats): PoolSummary {
  return {
    headline: `${stats.usableCount} usable ${stats.usableCount === 1 ? 'answer' : 'answers'}`,
    short: `3–5: ${stats.shortCount}`,
    medium: `6–8: ${stats.mediumCount}`,
    long: `9+: ${stats.longCount}`,
    average: stats.meanLength === null ? 'Average: —' : `Average: ${roundHalfUp(stats.meanLength, 1).toFixed(1)} letters`,
  }
}
