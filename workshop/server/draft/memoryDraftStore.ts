// In-memory DraftStore for tests, with the same revision and invalid-file
// semantics as the file store, plus a DraftClient that goes through the
// real endpoint handlers (including their validation) and a JSON round
// trip, the way the browser and server talk. Never used by the Workshop.

import type { DraftClient } from '../../src/draft/draftClient'
import type { DraftLoadBody, DraftSaveBody, DraftSaveRequest } from '../../src/draft/contract'
import { DRAFT_SCHEMA_VERSION } from '../../src/draft/draftSchema'
import type { DraftEnvelope } from '../../src/draft/draftSchema'
import { handleDraftLoad, handleDraftSave } from './draftEndpoint'
import type { DraftReadResult, DraftStore, DraftWriteRequest, DraftWriteResult } from './draftStore'

export interface MemoryDraftStore extends DraftStore {
  /** The current saved state, for assertions. */
  current(): DraftReadResult
  /** Envelopes moved aside by replaceInvalid writes. */
  setAside: string[]
  writes: DraftWriteRequest[]
}

export function createMemoryDraftStore(
  initial: DraftReadResult = { kind: 'empty' },
  now: () => Date = () => new Date('2026-10-19T12:00:00.000Z'),
): MemoryDraftStore {
  let state: DraftReadResult = initial
  const setAside: string[] = []
  const writes: DraftWriteRequest[] = []

  return {
    setAside,
    writes,
    current: () => state,
    async read() {
      return state
    },
    async write(request): Promise<DraftWriteResult> {
      writes.push(request)
      let currentRevision = 0
      if (state.kind === 'invalid') {
        if (!request.replaceInvalid) return { kind: 'invalid-existing', message: state.message }
        setAside.push(state.message)
      } else if (state.kind === 'ok') {
        currentRevision = state.envelope.revision
      }
      if (request.baseRevision !== currentRevision) return { kind: 'conflict', revision: currentRevision }
      const envelope: DraftEnvelope = {
        schemaVersion: DRAFT_SCHEMA_VERSION,
        revision: currentRevision + 1,
        savedAt: now().toISOString(),
        draft: request.draft,
      }
      state = { kind: 'ok', envelope }
      return { kind: 'saved', revision: envelope.revision, savedAt: envelope.savedAt }
    },
  }
}

export interface MemoryDraftClientOptions {
  /** When it returns true, the request fails as if the server were unreachable. */
  offline?: () => boolean
}

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function memoryDraftClient(store: DraftStore, { offline = () => false }: MemoryDraftClientOptions = {}): DraftClient {
  return {
    async load() {
      if (offline()) return { ok: false }
      const { body } = await handleDraftLoad(store)
      return { ok: true, body: wire<DraftLoadBody>(body) }
    },
    async save(request: DraftSaveRequest) {
      if (offline()) return { ok: false }
      const { body } = await handleDraftSave(wire(request), store)
      return { ok: true, body: wire<DraftSaveBody>(body) }
    },
  }
}
