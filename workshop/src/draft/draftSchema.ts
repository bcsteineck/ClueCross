// The working-draft file format and its runtime validation. The Workshop
// server validates every write and every read with this, and the browser
// validates what it loads again before restoring it: a saved file is
// untrusted input, and TypeScript types are not a runtime check.
//
// Validation rebuilds a clean copy (unknown fields dropped), so what gets
// restored or written is exactly a WorkshopDraft. Candidate metrics are
// derived data: they are recomputed from the validated construction rather
// than trusted from the file.

import { normalizeAnswer } from '../../../tools/generator/src/input.js'
import { computeMetrics } from '../../../tools/generator/src/metrics/metrics.js'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { ConstructionSuccess } from '../../../tools/generator/src/types.js'
import { isDateKey } from '../../../src/publishing/dateKey'
import { WORKSHOP_GENERATION_CONFIG } from '../generateBatch'
import type { PublishedState } from '../publishing/contract'
import { MAX_PRIORITY_WORDS } from '../priorityWords'
import { ShapeError, parseConstruction, requireInteger, requireRecord, requireString } from '../publishing/parseConstruction'
import type { CandidateSourcingRequest } from '../sourcing/contract'
import type { SourcingIssue } from '../sourcing/parseResponse'
import type { CandidateFlag, ReviewCandidate } from '../sourcing/reviewPool'
import type { SourcedPool } from '../sourcing/sourceCandidates'
import type { FinalPuzzleDraft, WorkshopDraft } from '../state/workshopReducer'

export const DRAFT_SCHEMA_VERSION = 1

/** The saved file: one versioned envelope around the durable draft. */
export interface DraftEnvelope {
  schemaVersion: typeof DRAFT_SCHEMA_VERSION
  /** Starts at 1 and increases by exactly 1 with every successful write. */
  revision: number
  /** ISO 8601, set by the server on write. Informational. */
  savedAt: string
  draft: WorkshopDraft
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ShapeError(`${path} must be true or false.`)
  return value
}

function requireOneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) {
    throw new ShapeError(`${path} must be one of ${options.map((option) => `"${option}"`).join(', ')}.`)
  }
  return value as T
}

function requireArray<T>(value: unknown, path: string, item: (value: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new ShapeError(`${path} must be an array.`)
  return value.map((entry, index) => item(entry, `${path}[${index}]`))
}

function requireNonNegativeInteger(value: unknown, path: string): number {
  const number = requireInteger(value, path)
  if (number < 0) throw new ShapeError(`${path} must not be negative.`)
  return number
}

function optional<T>(record: Record<string, unknown>, key: string, path: string, parse: (value: unknown, path: string) => T) {
  return record[key] === undefined ? {} : { [key]: parse(record[key], `${path}.${key}`) }
}

const SETTING = ['allow', 'exclude'] as const

function parseSourcingRequest(value: unknown, path: string): CandidateSourcingRequest {
  const record = requireRecord(value, path)
  const options = requireRecord(record.options, `${path}.options`)
  return {
    clue: requireString(record.clue, `${path}.clue`),
    ...optional(record, 'context', path, requireString),
    targetCount: requireNonNegativeInteger(record.targetCount, `${path}.targetCount`),
    options: {
      properNouns: requireOneOf(options.properNouns, SETTING, `${path}.options.properNouns`),
      abbreviations: requireOneOf(options.abbreviations, SETTING, `${path}.options.abbreviations`),
    },
  }
}

const RELATED_FLAGS = ['singular-plural-conflict', 'possible-morphological-variant', 'possible-synonym'] as const
const PLAIN_FLAGS = ['possible-proper-noun', 'possible-abbreviation', 'questionable-relevance'] as const

function parseFlag(value: unknown, path: string): CandidateFlag {
  const record = requireRecord(value, path)
  const type = requireOneOf(record.type, [...RELATED_FLAGS, ...PLAIN_FLAGS], `${path}.type`)
  if ((PLAIN_FLAGS as readonly string[]).includes(type)) return { type } as CandidateFlag
  return {
    type: type as (typeof RELATED_FLAGS)[number],
    relatedCandidateIds: requireArray(record.relatedCandidateIds, `${path}.relatedCandidateIds`, requireString),
  }
}

function parseReviewCandidate(value: unknown, path: string): ReviewCandidate {
  const record = requireRecord(value, path)
  return {
    id: requireString(record.id, `${path}.id`),
    sourceAnswer: requireString(record.sourceAnswer, `${path}.sourceAnswer`),
    rationale: requireString(record.rationale, `${path}.rationale`),
    category: requireString(record.category, `${path}.category`),
    ...optional(record, 'normalizedAnswer', path, requireString),
    ...optional(record, 'length', path, requireNonNegativeInteger),
    ...optional(record, 'lexicalWords', path, (v, p) => requireArray(v, p, requireString)),
    validity: requireOneOf(record.validity, ['valid', 'invalid'] as const, `${path}.validity`),
    ...optional(record, 'invalidReason', path, requireString),
    ...optional(record, 'duplicateOf', path, requireString),
    included: requireBoolean(record.included, `${path}.included`),
    flags: requireArray(record.flags, `${path}.flags`, parseFlag),
  }
}

function parseSourcingIssue(value: unknown, path: string): SourcingIssue {
  const record = requireRecord(value, path)
  return { index: requireNonNegativeInteger(record.index, `${path}.index`), reason: requireString(record.reason, `${path}.reason`) }
}

function parseSourcedPool(value: unknown, path: string): SourcedPool {
  const record = requireRecord(value, path)
  const candidates = requireArray(record.candidates, `${path}.candidates`, parseReviewCandidate)
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new ShapeError(`${path}.candidates has duplicate ids.`)
  }
  return {
    request: parseSourcingRequest(record.request, `${path}.request`),
    candidates,
    issues: requireArray(record.issues, `${path}.issues`, parseSourcingIssue),
  }
}

/** A selection is stored in construction form, so it must normalize to itself. */
function parsePriorityWords(value: unknown, path: string): string[] {
  const words = requireArray(value, path, (item, itemPath) => {
    const word = requireString(item, itemPath)
    const normalized = normalizeAnswer(word)
    if (!normalized.ok || normalized.answer !== word) throw new ShapeError(`${itemPath} is not a valid Priority Word.`)
    return word
  })
  if (new Set(words).size !== words.length) throw new ShapeError(`${path} has duplicate words.`)
  if (words.length > MAX_PRIORITY_WORDS) throw new ShapeError(`${path} has more than ${MAX_PRIORITY_WORDS} words.`)
  return words
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

// Beyond shape: the construction must be internally coherent enough for
// Final Puzzle preparation to run on it without throwing. Whether it is a
// valid puzzle is still decided by the Final Puzzle validation.
function checkConstructionCoherence(construction: ConstructionSuccess, path: string): void {
  const cellIds = Object.keys(construction.cells)
  const positionIds = Object.keys(construction.positions)
  if (cellIds.length !== positionIds.length || cellIds.some((id) => !(id in construction.positions))) {
    throw new ShapeError(`${path}.cells and ${path}.positions must describe the same cells.`)
  }
  const occupied = new Set(Object.values(construction.positions).map(({ x, y }) => cellKey(x, y)))
  construction.placedAnswers.forEach((answer, index) => {
    if (answer.word.length === 0) throw new ShapeError(`${path}.placedAnswers[${index}].word must not be empty.`)
    for (let i = 0; i < answer.word.length; i++) {
      const x = answer.direction === 'across' ? answer.start.x + i : answer.start.x
      const y = answer.direction === 'across' ? answer.start.y : answer.start.y + i
      if (!occupied.has(cellKey(x, y))) {
        throw new ShapeError(`${path}.placedAnswers[${index}] runs over a cell that isn't in the construction.`)
      }
    }
  })
}

const isStringOrNumber = (value: unknown, path: string): string | number => {
  if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value
  throw new ShapeError(`${path} must be a string or a number.`)
}

function parsePoolCandidate(value: unknown, path: string): PoolCandidate {
  const record = requireRecord(value, path)
  const construction = parseConstruction(record.construction, `${path}.construction`)
  checkConstructionCoherence(construction, `${path}.construction`)
  requireRecord(record.metrics, `${path}.metrics`)

  const selectedAnswers = requireArray(record.selectedAnswers, `${path}.selectedAnswers`, requireString)
  const placed = construction.placedAnswers.map((answer) => answer.word).sort()
  if (selectedAnswers.length !== placed.length || selectedAnswers.some((word, index) => word !== placed[index])) {
    throw new ShapeError(`${path}.selectedAnswers must be the construction's answers, sorted.`)
  }
  const answerCount = requireNonNegativeInteger(record.answerCount, `${path}.answerCount`)
  if (answerCount !== selectedAnswers.length) throw new ShapeError(`${path}.answerCount must match selectedAnswers.`)

  return {
    construction,
    metrics: computeMetrics(construction, {
      maxWidth: WORKSHOP_GENERATION_CONFIG.maxWidth,
      maxHeight: WORKSHOP_GENERATION_CONFIG.maxHeight,
    }),
    canonicalSignature: requireString(record.canonicalSignature, `${path}.canonicalSignature`),
    representativeSeed: isStringOrNumber(record.representativeSeed, `${path}.representativeSeed`),
    sourceSeeds: requireArray(record.sourceSeeds, `${path}.sourceSeeds`, isStringOrNumber),
    duplicateCount: requireNonNegativeInteger(record.duplicateCount, `${path}.duplicateCount`),
    selectedAnswers,
    unselectedAnswers: requireArray(record.unselectedAnswers, `${path}.unselectedAnswers`, requireString),
    answerCount,
    identitySignature: requireString(record.identitySignature, `${path}.identitySignature`),
    representativeTrialIndex: requireNonNegativeInteger(record.representativeTrialIndex, `${path}.representativeTrialIndex`),
    sourceTrialIndices: requireArray(record.sourceTrialIndices, `${path}.sourceTrialIndices`, requireNonNegativeInteger),
  }
}

function parsePublishedState(value: unknown, path: string): PublishedState {
  const record = requireRecord(value, path)
  const publication = requireRecord(record.publication, `${path}.publication`)
  const publishDate = requireString(publication.publishDate, `${path}.publication.publishDate`)
  if (!isDateKey(publishDate)) throw new ShapeError(`${path}.publication.publishDate must be a YYYY-MM-DD date.`)
  if (publication.fingerprintVersion !== 1) throw new ShapeError(`${path}.publication.fingerprintVersion must be 1.`)
  return {
    kind: requireOneOf(record.kind, ['created', 'existing'] as const, `${path}.kind`),
    publication: {
      puzzleId: requireString(publication.puzzleId, `${path}.publication.puzzleId`),
      publishDate,
      releaseInstant: requireString(publication.releaseInstant, `${path}.publication.releaseInstant`),
      contentFingerprint: requireString(publication.contentFingerprint, `${path}.publication.contentFingerprint`),
      fingerprintVersion: 1,
    },
  }
}

function parseFinalPuzzle(value: unknown, path: string): FinalPuzzleDraft {
  const record = requireRecord(value, path)
  const inputs = requireRecord(record.inputs, `${path}.inputs`)
  const number = requireInteger(record.number, `${path}.number`)
  if (number < 1) throw new ShapeError(`${path}.number must be at least 1.`)
  return {
    candidate: parsePoolCandidate(record.candidate, `${path}.candidate`),
    number,
    inputs: { id: requireString(inputs.id, `${path}.inputs.id`), clue: requireString(inputs.clue, `${path}.inputs.clue`) },
    publication: record.publication === null ? null : parsePublishedState(record.publication, `${path}.publication`),
  }
}

function parseDraft(value: unknown, path: string): WorkshopDraft {
  const record = requireRecord(value, path)
  const sourcing = requireRecord(record.sourcing, `${path}.sourcing`)
  const priorityWords = requireRecord(record.priorityWords, `${path}.priorityWords`)
  return {
    clue: requireString(record.clue, `${path}.clue`),
    poolSource: requireOneOf(record.poolSource, ['manual', 'sourced'] as const, `${path}.poolSource`),
    poolText: requireString(record.poolText, `${path}.poolText`),
    sourcing: {
      context: requireString(sourcing.context, `${path}.sourcing.context`),
      properNouns: requireOneOf(sourcing.properNouns, SETTING, `${path}.sourcing.properNouns`),
      abbreviations: requireOneOf(sourcing.abbreviations, SETTING, `${path}.sourcing.abbreviations`),
      sourceKind: requireOneOf(sourcing.sourceKind, ['live', 'fixture'] as const, `${path}.sourcing.sourceKind`),
      pool: sourcing.pool === null ? null : parseSourcedPool(sourcing.pool, `${path}.sourcing.pool`),
    },
    priorityWords: {
      manual: parsePriorityWords(priorityWords.manual, `${path}.priorityWords.manual`),
      sourced: parsePriorityWords(priorityWords.sourced, `${path}.priorityWords.sourced`),
    },
    generationCount: requireNonNegativeInteger(record.generationCount, `${path}.generationCount`),
    finalPuzzle: record.finalPuzzle === null ? null : parseFinalPuzzle(record.finalPuzzle, `${path}.finalPuzzle`),
  }
}

function capture<T>(parse: () => T): ParseResult<T> {
  try {
    return { ok: true, value: parse() }
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, message: error.message }
    throw error
  }
}

/** Validates an untrusted working draft, returning a clean copy. */
export function parseWorkshopDraft(value: unknown): ParseResult<WorkshopDraft> {
  return capture(() => parseDraft(value, 'draft'))
}

/** Validates an untrusted saved envelope, including its schema version and revision. */
export function parseDraftEnvelope(value: unknown): ParseResult<DraftEnvelope> {
  return capture(() => {
    const record = requireRecord(value, 'envelope')
    if (record.schemaVersion !== DRAFT_SCHEMA_VERSION) {
      const found = typeof record.schemaVersion === 'number' ? ` ${record.schemaVersion}` : ''
      throw new ShapeError(`Unsupported working-draft schema version${found}; this Workshop reads version ${DRAFT_SCHEMA_VERSION}.`)
    }
    const revision = requireInteger(record.revision, 'envelope.revision')
    if (revision < 1) throw new ShapeError('envelope.revision must be at least 1.')
    return {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      revision,
      savedAt: requireString(record.savedAt, 'envelope.savedAt'),
      draft: parseDraft(record.draft, 'draft'),
    }
  })
}
