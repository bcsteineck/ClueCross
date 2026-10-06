// Browser client for the Workshop's local Production-operations endpoints.
// It holds no credentials: it POSTs to fixed same-origin paths and returns
// the server's outcome. A transport failure (no response, or one that isn't
// the contract) is reported separately, because for Publish or Remove it
// says nothing about whether the change happened.

import type { PublishRequest } from '../publishing/contract'
import { PRODUCTION_PATHS } from './contract'
import type {
  ProductionPublishBody,
  ProductionPublishPreviewBody,
  ProductionPublishRequest,
  ProductionRemoveBody,
  ProductionRemovePreviewBody,
  ProductionRemoveRequest,
  ProductionScheduleBody,
} from './contract'

export type ProductionResult<Body> = { ok: true; body: Body } | { ok: false }

export interface ProductionClient {
  schedule(): Promise<ProductionResult<ProductionScheduleBody>>
  previewPublish(request: PublishRequest): Promise<ProductionResult<ProductionPublishPreviewBody>>
  publish(body: ProductionPublishRequest): Promise<ProductionResult<ProductionPublishBody>>
  previewRemoval(puzzleId: string): Promise<ProductionResult<ProductionRemovePreviewBody>>
  remove(body: ProductionRemoveRequest): Promise<ProductionResult<ProductionRemoveBody>>
}

// Each operation starts a short-lived child and fetches the Production
// environment, so allow more than the server's own 120 s child timeout.
const REQUEST_TIMEOUT_MS = 150_000

export function createProductionClient(fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)): ProductionClient {
  async function post<Body>(path: string, body: unknown): Promise<ProductionResult<Body>> {
    try {
      const response = await fetchImpl(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const json: unknown = await response.json()
      const isBody = typeof json === 'object' && json !== null && typeof (json as { status?: unknown }).status === 'string'
      return isBody ? { ok: true, body: json as Body } : { ok: false }
    } catch {
      return { ok: false }
    }
  }

  return {
    schedule: () => post(PRODUCTION_PATHS.schedule, {}),
    previewPublish: (request) => post(PRODUCTION_PATHS.publishPreview, { request }),
    publish: (body) => post(PRODUCTION_PATHS.publish, body),
    previewRemoval: (puzzleId) => post(PRODUCTION_PATHS.removePreview, { puzzleId }),
    remove: (body) => post(PRODUCTION_PATHS.remove, body),
  }
}
