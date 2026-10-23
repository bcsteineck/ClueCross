// Working-draft fixtures for tests: real drafts built through the reducer
// from real generator output and the sourcing fixture, never hand-written
// JSON, so they always match what the Workshop actually saves.

import { DOGS_CANDIDATE_POOL } from '../../../tools/generator/src/pool/dogsCandidatePool.js'
import { generateBatch } from '../../src/generateBatch'
import type { WorkshopBatch } from '../../src/generateBatch'
import { parsePool } from '../../src/parsePool'
import type { PublishedState } from '../../src/publishing/contract'
import { createSourcingRequest } from '../../src/sourcing/contract'
import { FIXTURE_SOURCING_RESPONSE } from '../../src/sourcing/fixtureSource'
import { parseSourcingResponse } from '../../src/sourcing/parseResponse'
import { buildReviewCandidates } from '../../src/sourcing/reviewPool'
import type { SourcedPool } from '../../src/sourcing/sourceCandidates'
import { createInitialWorkshopState, workshopReducer } from '../../src/state/workshopReducer'
import type { WorkshopAction, WorkshopDraft } from '../../src/state/workshopReducer'
import { DRAFT_SCHEMA_VERSION } from '../../src/draft/draftSchema'
import type { DraftEnvelope } from '../../src/draft/draftSchema'
import { candidateFingerprint } from '../../src/candidateFingerprint'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { SavedCandidate } from '../../src/state/workshopReducer'

export function fixtureSourcedPool(): SourcedPool {
  const parsed = parseSourcingResponse(FIXTURE_SOURCING_RESPONSE)
  const request = createSourcingRequest({ clue: 'Dogs', context: 'Pets' })
  if (!parsed.ok || !request.ok) throw new Error('fixture sourcing failed')
  return { request: request.request, candidates: buildReviewCandidates(parsed.candidates), issues: parsed.issues }
}

let cachedBatch: WorkshopBatch | undefined

/** Batch 1 of the Dogs pool (generated once per test file). */
export function dogsBatch(): WorkshopBatch {
  if (!cachedBatch) {
    const result = generateBatch('Dogs', parsePool(DOGS_CANDIDATE_POOL.join('\n')), 1)
    if (!result.ok) throw new Error(result.errors.join(' '))
    cachedBatch = result.batch
  }
  return cachedBatch
}

export const DEV_PUBLICATION: PublishedState = {
  kind: 'created',
  publication: {
    puzzleId: 'dogs7',
    publishDate: '2026-10-21',
    releaseInstant: '2026-10-21T02:00:00.000Z',
    contentFingerprint: 'a'.repeat(64),
    fingerprintVersion: 1,
  },
}

/** A Saved Candidates entry for a batch's candidate, as Save Candidate makes it. */
export function savedEntry(candidate: PoolCandidate, number: number, batch: WorkshopBatch = dogsBatch()): SavedCandidate {
  return {
    fingerprint: candidateFingerprint(candidate),
    candidate,
    origin: { batchSeed: batch.seed, number, clue: batch.clue },
    savedAt: '2026-10-19T11:00:00.000Z',
    publication: null,
  }
}

/**
 * A draft using every durable field: sourced mode active, the manual list
 * kept, Priority Words in both modes, an excluded Pool Review candidate,
 * three generations, two Saved Candidates, and the second approved as the
 * Final Puzzle with edited inputs (optionally recorded as published to the
 * dev calendar).
 */
export function fullDraft({ published = false }: { published?: boolean } = {}): WorkshopDraft {
  const batch = dogsBatch()
  const pool = fixtureSourcedPool()
  const beagle = pool.candidates.find((candidate) => candidate.sourceAnswer === 'Beagle')!
  const actions: WorkshopAction[] = [
    { type: 'SET_CLUE', clue: 'Dogs' },
    { type: 'SET_POOL_TEXT', poolText: DOGS_CANDIDATE_POOL.join('\n') },
    { type: 'TOGGLE_PRIORITY_WORD', word: 'KENNEL' },
    { type: 'SET_POOL_SOURCE', poolSource: 'sourced' },
    { type: 'SET_SOURCING_CONTEXT', context: 'Pets' },
    { type: 'SET_PROPER_NOUNS', properNouns: 'allow' },
    { type: 'SET_SOURCE_KIND', sourceKind: 'fixture' },
    { type: 'SOURCED_POOL_RECEIVED', pool },
    { type: 'SET_CANDIDATE_INCLUDED', id: beagle.id, included: false },
    { type: 'TOGGLE_PRIORITY_WORD', word: 'POODLE' },
    { type: 'GENERATION_SUCCEEDED', batch: { ...batch, generationNumber: 3 } },
    { type: 'SAVE_CANDIDATE', saved: savedEntry(batch.candidates[0], 1) },
    { type: 'SAVE_CANDIDATE', saved: savedEntry(batch.candidates[1], 2) },
    { type: 'APPROVE_SAVED_CANDIDATE', fingerprint: candidateFingerprint(batch.candidates[1]) },
    { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: { id: 'dogs7', clue: 'Good dogs' } },
  ]
  if (published) {
    actions.push({
      type: 'FINAL_PUZZLE_PUBLISHED',
      signature: candidateFingerprint(batch.candidates[1]),
      inputs: { id: 'dogs7', clue: 'Good dogs' },
      published: DEV_PUBLICATION,
    })
  }
  return actions.reduce(workshopReducer, createInitialWorkshopState()).draft
}

export function envelopeOf(draft: WorkshopDraft, revision = 1): DraftEnvelope {
  return { schemaVersion: DRAFT_SCHEMA_VERSION, revision, savedAt: '2026-10-19T12:00:00.000Z', draft }
}

/** The same draft as a schema version 1 file (before Saved Candidates), as JSON data. */
export function legacyEnvelopeOf(draft: WorkshopDraft, revision = 1): unknown {
  const { savedCandidates: _notInVersion1, ...rest } = draft
  return JSON.parse(JSON.stringify({ schemaVersion: 1, revision, savedAt: '2026-10-19T12:00:00.000Z', draft: rest }))
}
