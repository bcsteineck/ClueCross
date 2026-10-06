// Pure handlers for the Workshop's local publishing endpoints: untrusted
// JSON body in, { status, body } out. Transport concerns (method, content
// type, origin, body size) belong to the Vite adapter added in Phase 3,
// which will mount these unchanged. Responses never include stack traces or
// store/driver error details.

import type { PreviewResponseBody, PublishResponseBody } from '../../src/publishing/contract'
import { parsePublishRequest } from './parsePublishRequest'
import { previewPublication, publishFinalPuzzle } from './publishPuzzle'
import type { ExistingPublicationRef } from './publishPuzzle'
import type { PublicationStore } from './publicationStore'

export interface PublishingEndpointDeps {
  /** Undefined when publishing isn't configured on this Workshop server. */
  store: PublicationStore | undefined
}

export interface PublishingEndpointResult<Body> {
  status: number
  body: Body
}

const NOT_CONFIGURED = { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' } as const
const UNAVAILABLE = {
  status: 'unavailable',
  message: 'Publishing is unavailable right now. Nothing was published; try again.',
} as const
const BUSY = {
  status: 'busy',
  message: 'Another publication was being scheduled at the same time. Nothing was published; try again.',
} as const

function conflictBody(existing: ExistingPublicationRef) {
  return {
    status: 'conflict',
    message:
      `Puzzle ID “${existing.puzzleId}” is already scheduled for ${existing.publishDate} with different content. ` +
      `Published puzzles can’t be changed; choose a new ID.`,
    existing,
  } as const
}

export async function handlePublishRequest(
  body: unknown,
  deps: PublishingEndpointDeps,
): Promise<PublishingEndpointResult<PublishResponseBody>> {
  try {
    const parsed = parsePublishRequest(body)
    if (!parsed.ok) return { status: 400, body: { status: 'bad-request', message: parsed.message } }
    if (!deps.store) return { status: 503, body: NOT_CONFIGURED }

    const outcome = await publishFinalPuzzle(parsed.request, deps.store)
    switch (outcome.kind) {
      case 'created':
        return { status: 201, body: { status: 'created', publication: outcome.publication } }
      case 'existing':
        return { status: 200, body: { status: 'existing', publication: outcome.publication } }
      case 'conflict':
        return { status: 409, body: conflictBody(outcome.existing) }
      case 'invalid':
        return { status: 422, body: { status: 'invalid', errors: outcome.errors } }
      case 'busy':
        return { status: 503, body: BUSY }
      case 'unavailable':
        return { status: 503, body: UNAVAILABLE }
      case 'content-changed':
        // Not reachable here (this endpoint sends no expected fingerprint); kept exhaustive.
        return { status: 409, body: { status: 'bad-request', message: 'The puzzle content changed. Nothing was published.' } }
    }
  } catch {
    return { status: 500, body: UNAVAILABLE }
  }
}

// Preview reports existing/conflict as information (200): nothing failed.
export async function handlePreviewRequest(
  body: unknown,
  deps: PublishingEndpointDeps,
): Promise<PublishingEndpointResult<PreviewResponseBody>> {
  try {
    const parsed = parsePublishRequest(body)
    if (!parsed.ok) return { status: 400, body: { status: 'bad-request', message: parsed.message } }
    if (!deps.store) return { status: 503, body: NOT_CONFIGURED }

    const outcome = await previewPublication(parsed.request, deps.store)
    switch (outcome.kind) {
      case 'estimate':
        return {
          status: 200,
          body: {
            status: 'estimate',
            estimate: {
              publishDate: outcome.publishDate,
              releaseInstant: outcome.releaseInstant,
              contentFingerprint: outcome.contentFingerprint,
            },
          },
        }
      case 'existing':
        return { status: 200, body: { status: 'existing', publication: outcome.publication } }
      case 'conflict':
        return { status: 200, body: conflictBody(outcome.existing) }
      case 'invalid':
        return { status: 422, body: { status: 'invalid', errors: outcome.errors } }
      case 'unavailable':
        return { status: 503, body: UNAVAILABLE }
    }
  } catch {
    return { status: 500, body: UNAVAILABLE }
  }
}
