// Structural validation of untrusted provider output — a sourcing-response
// concern, kept separate from answer validity:
//   - a malformed response (not an object, no candidates array) fails the
//     whole sourcing run;
//   - a malformed candidate (not an object, or answer/rationale/category
//     not a string, or a blank rationale/category) is dropped and reported
//     as a sourcing issue — its metadata is never fabricated;
//   - answer CONTENT is not judged here: "OX" is a structurally valid
//     candidate that the generator's 3-letter rule rejects later.
// Fields beyond answer/rationale/category are ignored, not trusted.

import type { SourcedCandidate } from './contract'

export interface SourcingIssue {
  /** Position in the provider's candidates array. */
  index: number
  reason: string
}

export type ParsedSourcingResponse =
  | { ok: true; candidates: SourcedCandidate[]; issues: SourcingIssue[] }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseSourcingResponse(raw: unknown): ParsedSourcingResponse {
  if (!isRecord(raw)) return { ok: false, error: 'Sourcing response is not an object.' }
  if (!Array.isArray(raw.candidates)) return { ok: false, error: 'Sourcing response has no candidates array.' }

  const candidates: SourcedCandidate[] = []
  const issues: SourcingIssue[] = []
  raw.candidates.forEach((item: unknown, index: number) => {
    if (!isRecord(item)) {
      issues.push({ index, reason: 'Candidate is not an object.' })
      return
    }
    const problems: string[] = []
    for (const field of ['answer', 'rationale', 'category'] as const) {
      if (typeof item[field] !== 'string') problems.push(`${field} is not a string`)
      else if (field !== 'answer' && (item[field] as string).trim() === '') problems.push(`${field} is blank`)
    }
    if (problems.length > 0) {
      const answer = typeof item.answer === 'string' ? ` "${item.answer}"` : ''
      issues.push({ index, reason: `Candidate${answer}: ${problems.join(', ')}.` })
      return
    }
    candidates.push({
      answer: (item.answer as string).trim(),
      rationale: (item.rationale as string).trim(),
      category: (item.category as string).trim(),
    })
  })
  return { ok: true, candidates, issues }
}
