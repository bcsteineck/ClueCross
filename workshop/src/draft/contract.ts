// Working-draft wire contract between the Workshop browser and its local
// draft endpoint (served by the Workshop's own Vite server — see
// workshop/server/draft). One fixed path; the file location is chosen by
// the server, never by a request.

import type { DraftEnvelope } from './draftSchema'
import type { WorkshopDraft } from '../state/workshopReducer'

export const DRAFT_PATH = '/api/draft'

export type DraftLoadBody =
  /** No draft has been saved yet. */
  | { status: 'empty' }
  | { status: 'ok'; envelope: DraftEnvelope }
  /** A file exists but can't be restored. It is left untouched. */
  | { status: 'invalid'; message: string }
  | { status: 'unavailable'; message: string }

export interface DraftSaveRequest {
  /** The revision this draft was based on: the last one loaded or saved, 0 when none exists. */
  baseRevision: number
  draft: WorkshopDraft
  /**
   * Explicit recovery only: replace an unreadable saved file, which is first
   * moved aside (never deleted). Ignored when the saved file is valid.
   */
  replaceInvalid?: boolean
}

export type DraftSaveBody =
  | { status: 'saved'; revision: number; savedAt: string }
  /** The saved draft has moved on (another Workshop window or mode wrote it). Nothing was written. */
  | { status: 'conflict'; revision: number }
  /** The saved file can't be read, so it isn't overwritten without replaceInvalid. */
  | { status: 'invalid-existing'; message: string }
  | { status: 'bad-request'; message: string }
  | { status: 'unavailable'; message: string }
