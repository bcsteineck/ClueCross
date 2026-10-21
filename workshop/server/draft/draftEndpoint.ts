// Framework-free handlers for the working-draft endpoint: transport checks
// live in draftApiPlugin.ts, draft behavior here. Every write is validated
// with the same schema the browser restores with; I/O failures become a
// generic `unavailable` (details stay in the server, never the response).

import type { DraftLoadBody, DraftSaveBody } from '../../src/draft/contract'
import { parseWorkshopDraft } from '../../src/draft/draftSchema'
import { DraftLockTimeoutError } from './draftStore'
import type { DraftStore } from './draftStore'

export interface DraftResponse<Body> {
  status: number
  body: Body
}

const UNAVAILABLE = 'The working draft could not be read or written on the Workshop server.'

export async function handleDraftLoad(store: DraftStore): Promise<DraftResponse<DraftLoadBody>> {
  try {
    const result = await store.read()
    if (result.kind === 'empty') return { status: 200, body: { status: 'empty' } }
    if (result.kind === 'ok') return { status: 200, body: { status: 'ok', envelope: result.envelope } }
    return { status: 200, body: { status: 'invalid', message: result.message } }
  } catch {
    return { status: 500, body: { status: 'unavailable', message: UNAVAILABLE } }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function handleDraftSave(body: unknown, store: DraftStore): Promise<DraftResponse<DraftSaveBody>> {
  if (!isRecord(body)) return { status: 400, body: { status: 'bad-request', message: 'Request body must be an object.' } }
  const { baseRevision, replaceInvalid } = body
  if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0) {
    return { status: 400, body: { status: 'bad-request', message: 'baseRevision must be a non-negative integer.' } }
  }
  if (replaceInvalid !== undefined && typeof replaceInvalid !== 'boolean') {
    return { status: 400, body: { status: 'bad-request', message: 'replaceInvalid must be true or false.' } }
  }
  const draft = parseWorkshopDraft(body.draft)
  if (!draft.ok) return { status: 400, body: { status: 'bad-request', message: `Invalid working draft: ${draft.message}` } }

  try {
    const result = await store.write({ baseRevision, draft: draft.value, replaceInvalid: replaceInvalid === true })
    if (result.kind === 'saved') return { status: 200, body: { status: 'saved', revision: result.revision, savedAt: result.savedAt } }
    if (result.kind === 'conflict') return { status: 409, body: { status: 'conflict', revision: result.revision } }
    return { status: 409, body: { status: 'invalid-existing', message: result.message } }
  } catch (error) {
    const message =
      error instanceof DraftLockTimeoutError ? 'Another Workshop is saving the working draft. Try again.' : UNAVAILABLE
    return { status: 503, body: { status: 'unavailable', message } }
  }
}
