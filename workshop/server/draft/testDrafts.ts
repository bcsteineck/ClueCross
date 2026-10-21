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

/**
 * A draft using every durable field: sourced mode active, the manual list
 * kept, Priority Words in both modes, an excluded Pool Review candidate,
 * three generations, and an approved Final Puzzle with edited inputs
 * (optionally recorded as published to the dev calendar).
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
    { type: 'APPROVE_CANDIDATE', candidate: batch.candidates[1], number: 2 },
    { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: { id: 'dogs7', clue: 'Good dogs' } },
  ]
  if (published) {
    actions.push({ type: 'FINAL_PUZZLE_PUBLISHED', signature: batch.candidates[1].identitySignature, published: DEV_PUBLICATION })
  }
  return actions.reduce(workshopReducer, createInitialWorkshopState()).draft
}

export function envelopeOf(draft: WorkshopDraft, revision = 1): DraftEnvelope {
  return { schemaVersion: DRAFT_SCHEMA_VERSION, revision, savedAt: '2026-10-19T12:00:00.000Z', draft }
}
