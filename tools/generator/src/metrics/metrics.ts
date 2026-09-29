// Raw, deterministic measurements of a generated ClueCross puzzle.
//
// This module observes; it does not judge. No field here is a quality
// score, a difficulty rating, or an overall ranking number — that's
// explicitly deferred to a later phase, once these raw facts have been
// looked at across enough generated puzzles to know which of them
// actually matter. See VISUAL_COMPLEXITY_PROXY_FIELDS and
// DIFFICULTY_PROXY_FIELDS below for how "fields that might matter later"
// are represented without smuggling in a score.
//
// Every metric is grouped by which population it describes, so a caller
// (or a future renderer) never has to guess whether a number reflects
// intentional authored content or incidental derived structure:
//   1. content              — authored answers only (PlacedAnswer[])
//   2. geometry              — occupied-cell geometry vs. the configured envelope
//   3. authoredIntersections — authored-to-authored crossings only
//   4. derivedEntries        — the full playable Entry[] structure, split
//                              into authored-matched vs. incidental
//   5. letters                — per-letter occupied-cell counts (ClueCross's
//                              reveal mechanic is letter-global, not
//                              per-entry — see letters.revealFootprint)
//
// Numeric values are returned raw (no rounding) — display formatting is a
// renderer's job, not this layer's. Object-keyed output (letter
// frequency/reveal footprint, the length histogram) is built with keys in
// a fixed deterministic order so repeated runs and future snapshot tests
// stay stable regardless of input insertion order.

import {
  answerCellIds,
  assignEntryIds,
  buildCellAt,
  derivePlayableEntries,
  runSignature,
} from '../derive/derivePlayableEntries.js'
import type { DerivedRun } from '../derive/derivePlayableEntries.js'
import type { CellId, ConstructionSuccess, Direction, GeneratorConfig, PlacedAnswer, Position } from '../types.js'

export interface ContentMetrics {
  authoredAnswerCount: number
  /** One entry per authored answer, in the same order as placedAnswers. */
  authoredAnswerLengths: number[]
  minAuthoredAnswerLength: number
  maxAuthoredAnswerLength: number
  meanAuthoredAnswerLength: number
  /** length -> count of authored answers with that length. */
  authoredAnswerLengthHistogram: Record<number, number>
}

export interface GeometryMetrics {
  occupiedCellCount: number
  boundingWidth: number
  boundingHeight: number
  boundingArea: number
  configuredMaxWidth: number
  configuredMaxHeight: number
  configuredMaxArea: number
  /** occupiedCellCount / boundingArea — how full the actual bounding box is. */
  density: number
  /** boundingArea / configuredMaxArea — how much of the configured envelope was used. Distinct from density. */
  envelopeUtilization: number
  /** boundingWidth / boundingHeight, raw — not an evaluative "shape score". */
  aspectRatio: number
}

export interface AuthoredIntersectionMetrics {
  /**
   * A crossing at one shared cell between two different authored answers
   * counts once here and +1 for each of the two answers below — never +2
   * to this total. E.g. CAT crossing DOG at one cell: total = 1,
   * intersectionsPerAuthoredAnswer[CAT] += 1, [DOG] += 1.
   */
  totalAuthoredIntersections: number
  /** One entry per authored answer, in the same order as placedAnswers. */
  intersectionsPerAuthoredAnswer: number[]
  minIntersectionsPerAuthoredAnswer: number
  maxIntersectionsPerAuthoredAnswer: number
  meanIntersectionsPerAuthoredAnswer: number
  zeroIntersectionAuthoredAnswerCount: number
  singleIntersectionAuthoredAnswerCount: number
  zeroOrSingleIntersectionAuthoredAnswerCount: number
}

export interface DerivedEntryMetrics {
  derivedEntryCount: number
  /** Derived entries with no exact-span match to any authored answer. */
  incidentalEntryCount: number
  /** Derived entries whose span exactly matches one authored answer. */
  authoredMatchedEntryCount: number
  derivedEntryLengths: number[]
  minDerivedEntryLength: number
  maxDerivedEntryLength: number
  meanDerivedEntryLength: number
}

export interface LetterMetrics {
  distinctLetterCount: number
  /** letter -> number of occupied cells with that correctLetter. Keys sorted A-Z. */
  letterFrequency: Record<string, number>
  minPresentLetterFrequency: number
  maxPresentLetterFrequency: number
  meanPresentLetterFrequency: number
  /**
   * Reveal Letter reveals/locks every occupied cell sharing the chosen
   * letter, puzzle-wide (see src/core/gameEngine.ts's revealLetter) — not
   * per playable entry. So a letter's reveal footprint is, by definition,
   * exactly its occupied-cell frequency: this is letterFrequency again,
   * not a separately-computed value. Kept as its own named field because
   * it answers a different question ("what does revealing L do?") even
   * though the numbers are identical today.
   */
  revealFootprint: Record<string, number>
  /** The single most frequent present letter's share of all occupied cells. */
  maxLetterShare: number
}

// Field-path labels only — see the module comment. These are NOT
// duplicated values; each path points at a field already present
// elsewhere in this same MetricsResult.
export const VISUAL_COMPLEXITY_PROXY_FIELDS = [
  'content.authoredAnswerCount',
  'content.maxAuthoredAnswerLength',
  'geometry.occupiedCellCount',
  'geometry.boundingWidth',
  'geometry.boundingHeight',
  'geometry.boundingArea',
  'derivedEntries.derivedEntryCount',
  'derivedEntries.incidentalEntryCount',
] as const

export const DIFFICULTY_PROXY_FIELDS = [
  'content.authoredAnswerCount',
  'content.meanAuthoredAnswerLength',
  'content.maxAuthoredAnswerLength',
  'geometry.occupiedCellCount',
  'geometry.boundingWidth',
  'geometry.boundingHeight',
  'geometry.boundingArea',
  'geometry.density',
  'authoredIntersections.intersectionsPerAuthoredAnswer',
  'authoredIntersections.meanIntersectionsPerAuthoredAnswer',
  'authoredIntersections.zeroIntersectionAuthoredAnswerCount',
  'authoredIntersections.singleIntersectionAuthoredAnswerCount',
  'authoredIntersections.zeroOrSingleIntersectionAuthoredAnswerCount',
  'derivedEntries.incidentalEntryCount',
  'letters.distinctLetterCount',
  'letters.revealFootprint',
  'letters.maxLetterShare',
] as const

export interface MetricsResult {
  content: ContentMetrics
  geometry: GeometryMetrics
  authoredIntersections: AuthoredIntersectionMetrics
  derivedEntries: DerivedEntryMetrics
  letters: LetterMetrics
  /** See VISUAL_COMPLEXITY_PROXY_FIELDS — field-path labels, not values. */
  visualComplexityProxyFields: readonly string[]
  /** See DIFFICULTY_PROXY_FIELDS — field-path labels, not values. */
  difficultyProxyFields: readonly string[]
}

function sum(values: number[]): number {
  let total = 0
  for (const value of values) total += value
  return total
}

function sortedRecord(values: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {}
  for (const key of Object.keys(values).sort()) {
    sorted[key] = values[key]
  }
  return sorted
}

export function computeContentMetrics(placedAnswers: PlacedAnswer[]): ContentMetrics {
  const authoredAnswerLengths = placedAnswers.map((answer) => answer.word.length)
  const authoredAnswerLengthHistogram: Record<number, number> = {}
  for (const length of authoredAnswerLengths) {
    authoredAnswerLengthHistogram[length] = (authoredAnswerLengthHistogram[length] ?? 0) + 1
  }

  return {
    authoredAnswerCount: placedAnswers.length,
    authoredAnswerLengths,
    minAuthoredAnswerLength: Math.min(...authoredAnswerLengths),
    maxAuthoredAnswerLength: Math.max(...authoredAnswerLengths),
    meanAuthoredAnswerLength: sum(authoredAnswerLengths) / authoredAnswerLengths.length,
    // Record's own integer-key iteration order is ascending numeric order
    // in JS, so this is already deterministic without an extra sort step.
    authoredAnswerLengthHistogram,
  }
}

export function computeGeometryMetrics(
  construction: ConstructionSuccess,
  config: Pick<GeneratorConfig, 'maxWidth' | 'maxHeight'>,
): GeometryMetrics {
  const occupiedCellCount = Object.keys(construction.cells).length
  const boundingWidth = construction.width
  const boundingHeight = construction.height
  const boundingArea = boundingWidth * boundingHeight
  const configuredMaxArea = config.maxWidth * config.maxHeight

  return {
    occupiedCellCount,
    boundingWidth,
    boundingHeight,
    boundingArea,
    configuredMaxWidth: config.maxWidth,
    configuredMaxHeight: config.maxHeight,
    configuredMaxArea,
    density: occupiedCellCount / boundingArea,
    envelopeUtilization: boundingArea / configuredMaxArea,
    aspectRatio: boundingWidth / boundingHeight,
  }
}

export function computeAuthoredIntersectionMetrics(
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
): AuthoredIntersectionMetrics {
  const cellAt = buildCellAt(positions)
  const answerSpans = placedAnswers.map((answer) => answerCellIds(answer, cellAt))

  // cellId -> indices of the authored answers occupying it (0, 1, or 2 in
  // legitimate Phase 1 output — a cell has at most one across owner and
  // one down owner — but counted generally rather than assumed).
  const occupants = new Map<CellId, number[]>()
  answerSpans.forEach((span, answerIndex) => {
    for (const cellId of span) {
      const list = occupants.get(cellId)
      if (list) list.push(answerIndex)
      else occupants.set(cellId, [answerIndex])
    }
  })

  const intersectionsPerAuthoredAnswer = new Array<number>(placedAnswers.length).fill(0)
  let totalAuthoredIntersections = 0

  for (const answerIndices of occupants.values()) {
    for (let i = 0; i < answerIndices.length; i++) {
      for (let j = i + 1; j < answerIndices.length; j++) {
        totalAuthoredIntersections += 1
        intersectionsPerAuthoredAnswer[answerIndices[i]] += 1
        intersectionsPerAuthoredAnswer[answerIndices[j]] += 1
      }
    }
  }

  const zeroIntersectionAuthoredAnswerCount = intersectionsPerAuthoredAnswer.filter((n) => n === 0).length
  const singleIntersectionAuthoredAnswerCount = intersectionsPerAuthoredAnswer.filter((n) => n === 1).length

  return {
    totalAuthoredIntersections,
    intersectionsPerAuthoredAnswer,
    minIntersectionsPerAuthoredAnswer: Math.min(...intersectionsPerAuthoredAnswer),
    maxIntersectionsPerAuthoredAnswer: Math.max(...intersectionsPerAuthoredAnswer),
    meanIntersectionsPerAuthoredAnswer:
      sum(intersectionsPerAuthoredAnswer) / intersectionsPerAuthoredAnswer.length,
    zeroIntersectionAuthoredAnswerCount,
    singleIntersectionAuthoredAnswerCount,
    zeroOrSingleIntersectionAuthoredAnswerCount:
      zeroIntersectionAuthoredAnswerCount + singleIntersectionAuthoredAnswerCount,
  }
}

export function computeDerivedEntryMetrics(
  entries: { direction: Direction; cellIds: CellId[] }[],
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
): DerivedEntryMetrics {
  const cellAt = buildCellAt(positions)
  const authoredSignatures = new Set(
    placedAnswers.map((answer) => runSignature(answer.direction, answerCellIds(answer, cellAt))),
  )

  let authoredMatchedEntryCount = 0
  let incidentalEntryCount = 0
  for (const entry of entries) {
    if (authoredSignatures.has(runSignature(entry.direction, entry.cellIds))) {
      authoredMatchedEntryCount += 1
    } else {
      incidentalEntryCount += 1
    }
  }

  const derivedEntryLengths = entries.map((entry) => entry.cellIds.length)

  return {
    derivedEntryCount: entries.length,
    incidentalEntryCount,
    authoredMatchedEntryCount,
    derivedEntryLengths,
    minDerivedEntryLength: Math.min(...derivedEntryLengths),
    maxDerivedEntryLength: Math.max(...derivedEntryLengths),
    meanDerivedEntryLength: sum(derivedEntryLengths) / derivedEntryLengths.length,
  }
}

export function computeLetterMetrics(cells: Record<CellId, string>): LetterMetrics {
  const frequency: Record<string, number> = {}
  for (const letter of Object.values(cells)) {
    frequency[letter] = (frequency[letter] ?? 0) + 1
  }

  const letterFrequency = sortedRecord(frequency)
  const presentFrequencies = Object.values(letterFrequency)
  const occupiedCellCount = Object.keys(cells).length
  const maxFrequency = Math.max(...presentFrequencies)

  return {
    distinctLetterCount: presentFrequencies.length,
    letterFrequency,
    minPresentLetterFrequency: Math.min(...presentFrequencies),
    maxPresentLetterFrequency: maxFrequency,
    meanPresentLetterFrequency: sum(presentFrequencies) / presentFrequencies.length,
    // Identical to letterFrequency today — see the field's own doc comment
    // above for why that's expected, not a shortcut.
    revealFootprint: { ...letterFrequency },
    maxLetterShare: maxFrequency / occupiedCellCount,
  }
}

function deriveEntriesOrThrow(
  runs: DerivedRun[],
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
): { direction: Direction; cellIds: CellId[] }[] {
  const assignment = assignEntryIds(runs, placedAnswers, positions)
  if (!assignment.ok) {
    const words = assignment.unrecoverableAnswers.map((answer) => answer.word).join(', ')
    throw new Error(
      `Cannot compute metrics: authored answer(s) could not be recovered as an exact ` +
        `derived playable entry: ${words}. This construction is not valid Phase 1/2 output.`,
    )
  }
  return assignment.entries
}

// Computes every group above from one construction + the config it was
// generated under. Throws (rather than returning a failure result) for
// input that's internally inconsistent — a mismatched config, an empty
// construction, or authored answers that can't be recovered as exact
// derived entries — since none of those can arise from a genuine,
// correctly-used Phase 1/2 result; they indicate caller misuse, the same
// category of error Phase 1/2 already throw on elsewhere (e.g.
// buildPuzzle's duplicate-entry-id guard).
export function computeMetrics(
  construction: ConstructionSuccess,
  config: Pick<GeneratorConfig, 'maxWidth' | 'maxHeight'>,
): MetricsResult {
  if (config.maxWidth <= 0 || config.maxHeight <= 0) {
    throw new Error(
      `Cannot compute metrics: config.maxWidth and config.maxHeight must be positive ` +
        `(got ${config.maxWidth}x${config.maxHeight}).`,
    )
  }
  if (construction.placedAnswers.length === 0) {
    throw new Error('Cannot compute metrics: construction has no placed answers.')
  }
  if (Object.keys(construction.cells).length === 0) {
    throw new Error('Cannot compute metrics: construction has no occupied cells.')
  }
  if (construction.width > config.maxWidth || construction.height > config.maxHeight) {
    throw new Error(
      `Cannot compute metrics: construction (${construction.width}x${construction.height}) ` +
        `exceeds the given config's envelope (${config.maxWidth}x${config.maxHeight}); ` +
        `this construction was not generated under this config.`,
    )
  }

  const runs = derivePlayableEntries(construction.positions)
  const entries = deriveEntriesOrThrow(runs, construction.placedAnswers, construction.positions)

  return {
    content: computeContentMetrics(construction.placedAnswers),
    geometry: computeGeometryMetrics(construction, config),
    authoredIntersections: computeAuthoredIntersectionMetrics(
      construction.placedAnswers,
      construction.positions,
    ),
    derivedEntries: computeDerivedEntryMetrics(entries, construction.placedAnswers, construction.positions),
    letters: computeLetterMetrics(construction.cells),
    visualComplexityProxyFields: VISUAL_COMPLEXITY_PROXY_FIELDS,
    difficultyProxyFields: DIFFICULTY_PROXY_FIELDS,
  }
}
