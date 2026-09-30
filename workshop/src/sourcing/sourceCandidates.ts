// One sourcing run: request → provider → structural validation → review
// candidates. Never starts generation; the result goes to Pool Review.

import { CandidateSourcingError } from './contract'
import type { CandidateSource, CandidateSourcingRequest, SourcingErrorCategory } from './contract'
import { parseSourcingResponse } from './parseResponse'
import type { SourcingIssue } from './parseResponse'
import { buildReviewCandidates } from './reviewPool'
import type { ReviewCandidate } from './reviewPool'

export interface SourcedPool {
  request: CandidateSourcingRequest
  candidates: ReviewCandidate[]
  /** Malformed candidates the provider returned, dropped before review. */
  issues: SourcingIssue[]
}

export type SourcingResult =
  | { ok: true; pool: SourcedPool }
  | { ok: false; category: SourcingErrorCategory; error: string }

export async function sourceCandidates(source: CandidateSource, request: CandidateSourcingRequest): Promise<SourcingResult> {
  let raw: unknown
  try {
    raw = await source.generate(request)
  } catch (error) {
    if (error instanceof CandidateSourcingError) return { ok: false, category: error.category, error: error.message }
    return { ok: false, category: 'provider', error: 'Candidate sourcing failed.' }
  }
  const parsed = parseSourcingResponse(raw)
  if (!parsed.ok) return { ok: false, category: 'response', error: parsed.error }
  return { ok: true, pool: { request, candidates: buildReviewCandidates(parsed.candidates), issues: parsed.issues } }
}
