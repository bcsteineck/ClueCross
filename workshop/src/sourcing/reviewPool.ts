// Pool Review data model: every sourced candidate keeps its provider
// metadata (human-readable answer, rationale, category) alongside the
// deterministic results (construction form, validity, duplicate status,
// review flags) and the author's include decision.
//
// Order of processing:
//   1. structurally valid sourced candidates (see parseSourcingResponse)
//   2. construction normalization + validity via the generator's rules
//   3. exact deduplication by construction form, valid candidates only
//      (first occurrence is canonical; copies never become usable)
//   4. conservative variant flags among valid unique candidates
//   5. Pool Diagnostics over the included pool (poolReviewEntries)
// Flags never exclude anything; only the author does.

import { normalizeAnswer } from '../../../tools/generator/src/input.js'
import type { SourcedCandidate } from './contract'
import { findVariantPairs, lexicalWords } from './variants'

// The deterministic detectors only emit the first two; the rest exist for
// future review tooling and are never populated by heuristics here.
export type CandidateFlag =
  | { type: 'singular-plural-conflict'; relatedCandidateIds: string[] }
  | { type: 'possible-morphological-variant'; relatedCandidateIds: string[] }
  | { type: 'possible-synonym'; relatedCandidateIds: string[] }
  | { type: 'possible-proper-noun' }
  | { type: 'possible-abbreviation' }
  | { type: 'questionable-relevance' }

export interface ReviewCandidate {
  id: string
  // Provider data, preserved as received.
  sourceAnswer: string
  rationale: string
  category: string
  // Deterministically derived (valid candidates only).
  normalizedAnswer?: string
  length?: number
  lexicalWords?: string[]
  validity: 'valid' | 'invalid'
  /** The generator's reason, for invalid candidates. */
  invalidReason?: string
  /** Set on a later exact duplicate: the id of the first (canonical) occurrence. */
  duplicateOf?: string
  /** Author decision. Only valid canonical candidates can be included; they start included. */
  included: boolean
  flags: CandidateFlag[]
}

export function isIncludable(candidate: ReviewCandidate): boolean {
  return candidate.validity === 'valid' && candidate.duplicateOf === undefined
}

export function buildReviewCandidates(sourced: SourcedCandidate[]): ReviewCandidate[] {
  const firstIdByAnswer = new Map<string, string>()
  const candidates: ReviewCandidate[] = sourced.map((item, index) => {
    const id = `c${index + 1}`
    const base = { id, sourceAnswer: item.answer, rationale: item.rationale, category: item.category, flags: [] }
    const result = normalizeAnswer(item.answer)
    if (!result.ok) {
      return { ...base, validity: 'invalid', invalidReason: result.error, included: false }
    }
    const duplicateOf = firstIdByAnswer.get(result.answer)
    if (duplicateOf === undefined) firstIdByAnswer.set(result.answer, id)
    return {
      ...base,
      normalizedAnswer: result.answer,
      length: result.answer.length,
      lexicalWords: lexicalWords(item.answer),
      validity: 'valid',
      ...(duplicateOf ? { duplicateOf } : {}),
      included: duplicateOf === undefined,
    }
  })

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const unique = candidates.filter(isIncludable)
  for (const pair of findVariantPairs(unique.map((c) => ({ id: c.id, lexicalWords: c.lexicalWords ?? [] })))) {
    const [a, b] = pair.ids
    addRelation(byId.get(a)!, pair.type, b)
    addRelation(byId.get(b)!, pair.type, a)
  }
  return candidates
}

function addRelation(
  candidate: ReviewCandidate,
  type: 'singular-plural-conflict' | 'possible-morphological-variant',
  relatedId: string,
): void {
  const existing = candidate.flags.find((flag) => flag.type === type)
  if (existing && 'relatedCandidateIds' in existing) {
    if (!existing.relatedCandidateIds.includes(relatedId)) existing.relatedCandidateIds.push(relatedId)
  } else {
    candidate.flags.push({ type, relatedCandidateIds: [relatedId] })
  }
}

/** Returns a new list with one includable candidate's include state changed; others are untouched. */
export function setCandidateIncluded(candidates: ReviewCandidate[], id: string, included: boolean): ReviewCandidate[] {
  return candidates.map((candidate) =>
    candidate.id === id && isIncludable(candidate) ? { ...candidate, included } : candidate,
  )
}

/**
 * Raw entries for the existing Pool Diagnostics (analyzeCandidatePool),
 * in sourced order, so its duplicate/invalid semantics stay authoritative
 * and its notes still report them: invalid entries, included canonical
 * candidates, and duplicate copies of included candidates (after their
 * canonical, so the canonical wins). Author-excluded candidates — and
 * copies of them — are left out entirely, so the resulting usableAnswers
 * are exactly the included candidates' construction forms.
 */
export function poolReviewEntries(candidates: ReviewCandidate[]): string[] {
  const includedIds = new Set(candidates.filter((c) => isIncludable(c) && c.included).map((c) => c.id))
  return candidates
    .filter((c) =>
      c.validity === 'invalid' ||
      (c.duplicateOf === undefined ? includedIds.has(c.id) : includedIds.has(c.duplicateOf)),
    )
    .map((c) => c.sourceAnswer)
}
