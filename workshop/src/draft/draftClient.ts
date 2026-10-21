// Browser client for the Workshop's local working-draft endpoint. It knows
// nothing about storage: it GETs or PUTs the one fixed path and returns the
// server's outcome. A transport failure (no response, or one that isn't the
// contract) is reported separately, because for a save it says nothing
// about whether the draft was written.

import { DRAFT_PATH } from './contract'
import type { DraftLoadBody, DraftSaveBody, DraftSaveRequest } from './contract'

export type DraftClientResult<Body> = { ok: true; body: Body } | { ok: false }

export interface DraftClient {
  load(): Promise<DraftClientResult<DraftLoadBody>>
  /** keepalive lets a save started while the page unloads complete in the background. */
  save(request: DraftSaveRequest, options?: { keepalive?: boolean }): Promise<DraftClientResult<DraftSaveBody>>
}

const REQUEST_TIMEOUT_MS = 15_000

function hasStatus<Body>(json: unknown): json is Body {
  return typeof json === 'object' && json !== null && typeof (json as { status?: unknown }).status === 'string'
}

export function createDraftClient(fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args)): DraftClient {
  async function request<Body>(init: RequestInit): Promise<DraftClientResult<Body>> {
    try {
      const response = await fetchImpl(DRAFT_PATH, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      const json: unknown = await response.json()
      return hasStatus<Body>(json) ? { ok: true, body: json } : { ok: false }
    } catch {
      return { ok: false }
    }
  }

  return {
    load: () => request<DraftLoadBody>({ method: 'GET' }),
    save: (body, options = {}) =>
      request<DraftSaveBody>({
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        keepalive: options.keepalive ?? false,
      }),
  }
}
