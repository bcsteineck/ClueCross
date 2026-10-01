// Browser client for the Workshop's local publishing endpoints. It holds no
// credentials and knows nothing about storage: it POSTs the Final Puzzle
// inputs (construction, id, clue) to the two fixed paths and returns the
// server's typed outcome. A transport failure — no response, or a response
// that isn't the publishing contract — is reported separately, because it
// says nothing about whether the server published.

import { PUBLISHING_PREVIEW_PATH, PUBLISHING_PUBLISH_PATH } from './contract'
import type { PreviewResponseBody, PublishRequest, PublishResponseBody } from './contract'

export type ClientResult<Body> = { ok: true; body: Body } | { ok: false; failure: 'network' | 'response' }

export interface PublishingClient {
  preview(request: PublishRequest): Promise<ClientResult<PreviewResponseBody>>
  publish(request: PublishRequest): Promise<ClientResult<PublishResponseBody>>
}

const REQUEST_TIMEOUT_MS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isString = (value: unknown): value is string => typeof value === 'string'

function isPublication(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.puzzleId) &&
    isString(value.publishDate) &&
    isString(value.releaseInstant) &&
    isString(value.contentFingerprint) &&
    value.fingerprintVersion === 1
  )
}

function isValidationErrors(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.metadata) &&
    value.metadata.every((issue) => isRecord(issue) && isString(issue.field) && isString(issue.message)) &&
    Array.isArray(value.production) &&
    value.production.every(isString) &&
    Array.isArray(value.export) &&
    value.export.every(isString)
  )
}

// Structural check of a response body against the contract.
export function isPublishingResponseBody(value: unknown, operation: 'preview' | 'publish'): boolean {
  if (!isRecord(value)) return false
  switch (value.status) {
    case 'created':
      return operation === 'publish' && isPublication(value.publication)
    case 'estimate':
      return (
        operation === 'preview' &&
        isRecord(value.estimate) &&
        isString(value.estimate.publishDate) &&
        isString(value.estimate.releaseInstant) &&
        isString(value.estimate.contentFingerprint)
      )
    case 'existing':
      return isPublication(value.publication)
    case 'conflict':
      return (
        isString(value.message) &&
        isRecord(value.existing) &&
        isString(value.existing.puzzleId) &&
        isString(value.existing.publishDate) &&
        isString(value.existing.releaseInstant)
      )
    case 'invalid':
      return isValidationErrors(value.errors)
    case 'busy':
      return operation === 'publish' && isString(value.message)
    case 'bad-request':
    case 'unavailable':
    case 'not-configured':
      return isString(value.message)
    default:
      return false
  }
}

export function createPublishingClient(
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): PublishingClient {
  async function post<Body>(path: string, operation: 'preview' | 'publish', request: PublishRequest): Promise<ClientResult<Body>> {
    let response: Response
    try {
      response = await fetchImpl(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      return { ok: false, failure: 'network' }
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      return { ok: false, failure: 'response' }
    }
    return isPublishingResponseBody(body, operation) ? { ok: true, body: body as Body } : { ok: false, failure: 'response' }
  }

  return {
    preview: (request) => post<PreviewResponseBody>(PUBLISHING_PREVIEW_PATH, 'preview', request),
    publish: (request) => post<PublishResponseBody>(PUBLISHING_PUBLISH_PATH, 'publish', request),
  }
}
