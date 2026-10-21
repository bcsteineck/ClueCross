// The working-draft store interface, kept free of Node APIs so the endpoint
// handlers and the in-memory test store can share it with browser tests.
// The real store is fileDraftStore.ts.

import type { DraftEnvelope } from '../../src/draft/draftSchema'
import type { WorkshopDraft } from '../../src/state/workshopReducer'

export type DraftReadResult =
  | { kind: 'empty' }
  | { kind: 'ok'; envelope: DraftEnvelope }
  | { kind: 'invalid'; message: string }

export type DraftWriteResult =
  | { kind: 'saved'; revision: number; savedAt: string }
  | { kind: 'conflict'; revision: number }
  | { kind: 'invalid-existing'; message: string }

export interface DraftWriteRequest {
  baseRevision: number
  /** Already validated by the caller. */
  draft: WorkshopDraft
  replaceInvalid?: boolean
}

/** Read and write either resolve with an outcome or throw on an I/O failure. */
export interface DraftStore {
  read(): Promise<DraftReadResult>
  write(request: DraftWriteRequest): Promise<DraftWriteResult>
}

/** Another writer held the lock for longer than lockTimeoutMs. */
export class DraftLockTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the working-draft lock.')
    this.name = 'DraftLockTimeoutError'
  }
}
