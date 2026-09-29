// One sourcing run: request → provider → structural validation → review
// candidates. Never starts generation; the result goes to Pool Review.

import type { CandidateSource, CandidateSourcingRequest } from './contract'
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

export type SourcingResult = { ok: true; pool: SourcedPool } | { ok: false; error: string }

export async function sourceCandidates(source: CandidateSource, request: CandidateSourcingRequest): Promise<SourcingResult> {
  const parsed = parseSourcingResponse(await source.generate(request))
  if (!parsed.ok) return { ok: false, error: parsed.error }
  return { ok: true, pool: { request, candidates: buildReviewCandidates(parsed.candidates), issues: parsed.issues } }
}
