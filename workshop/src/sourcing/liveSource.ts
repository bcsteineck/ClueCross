// Live candidate source for the Workshop browser. It never calls an AI
// provider directly and holds no credentials: it POSTs the existing
// CandidateSourcingRequest to the Workshop's own server endpoint
// (workshop/server), which owns the provider, model and key, and returns
// the provider's payload untouched for the existing parseSourcingResponse.

import { CandidateSourcingError } from './contract'
import type { CandidateSource, SourcingErrorCategory } from './contract'

export const SOURCING_ENDPOINT = '/api/sourcing'
// Slightly longer than the server's own provider timeout, so the server's
// categorized error normally arrives first.
const REQUEST_TIMEOUT_MS = 150_000
const CATEGORIES = new Set<SourcingErrorCategory>(['configuration', 'provider', 'response', 'request'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createLiveCandidateSource(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): CandidateSource {
  return {
    async generate(request) {
      let response: Response
      try {
        response = await fetchImpl(SOURCING_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (error) {
        const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
        throw new CandidateSourcingError(
          'provider',
          timedOut
            ? 'The sourcing request timed out.'
            : 'Could not reach the Workshop sourcing endpoint. Is the Workshop server running (npm run workshop)?',
        )
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        throw new CandidateSourcingError(
          response.ok ? 'response' : 'provider',
          `The sourcing endpoint returned an unreadable response (HTTP ${response.status}).`,
        )
      }

      if (!response.ok) {
        const error = isRecord(body) && isRecord(body.error) ? body.error : null
        const category = CATEGORIES.has(error?.category as SourcingErrorCategory)
          ? (error?.category as SourcingErrorCategory)
          : 'provider'
        const message = typeof error?.message === 'string' ? error.message : `Candidate sourcing failed (HTTP ${response.status}).`
        throw new CandidateSourcingError(category, message)
      }
      if (!isRecord(body) || !('payload' in body)) {
        throw new CandidateSourcingError('response', 'The sourcing endpoint response had no payload.')
      }
      return body.payload
    },
  }
}
