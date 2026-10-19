import { beforeAll, describe, expect, it } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../../tools/generator/src/pool/dogsCandidatePool.js'
import { generateBatch } from '../generateBatch'
import type { WorkshopBatch } from '../generateBatch'
import { parsePool } from '../parsePool'
import type { PublishedState } from '../PublishSection'
import { createSourcingRequest } from '../sourcing/contract'
import { FIXTURE_SOURCING_RESPONSE } from '../sourcing/fixtureSource'
import { parseSourcingResponse } from '../sourcing/parseResponse'
import { buildReviewCandidates } from '../sourcing/reviewPool'
import type { SourcedPool } from '../sourcing/sourceCandidates'
import {
  analyzeActivePool,
  createInitialWorkshopState,
  selectActivePriorityWords,
  selectApprovedId,
  selectPersistableDraft,
  selectPublished,
  workshopReducer,
} from './workshopReducer'
import type { WorkshopAction, WorkshopState } from './workshopReducer'

function run(actions: WorkshopAction[], state: WorkshopState = createInitialWorkshopState()): WorkshopState {
  return actions.reduce(workshopReducer, state)
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

// The fixture's well-formed candidates, parsed the way sourcing parses them.
function fixtureCandidates() {
  const parsed = parseSourcingResponse(FIXTURE_SOURCING_RESPONSE)
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.candidates
}

function sourcedPool(candidates = fixtureCandidates()): SourcedPool {
  const request = createSourcingRequest({ clue: 'Dogs' })
  if (!request.ok) throw new Error(request.error)
  return { request: request.request, candidates: buildReviewCandidates(candidates), issues: [] }
}

const PUBLISHED: PublishedState = {
  kind: 'created',
  publication: {
    puzzleId: 'dogs1',
    publishDate: '2026-10-21',
    releaseInstant: '2026-10-21T02:00:00.000Z',
    contentFingerprint: 'f'.repeat(64),
    fingerprintVersion: 1,
  },
}

let batch1: WorkshopBatch
let batch2: WorkshopBatch

beforeAll(() => {
  const pool = parsePool(DOGS_CANDIDATE_POOL.join('\n'))
  const first = generateBatch('Dogs', pool, 1)
  const second = generateBatch('Dogs', pool, 2)
  if (!first.ok || !second.ok) throw new Error('fixture batches failed')
  batch1 = first.batch
  batch2 = second.batch
})

describe('workshopReducer: initial state', () => {
  it('starts with an empty manual draft and a fresh session', () => {
    expect(createInitialWorkshopState()).toEqual({
      draft: {
        clue: '',
        poolSource: 'manual',
        poolText: '',
        sourcing: { context: '', properNouns: 'exclude', abbreviations: 'exclude', sourceKind: 'live', pool: null },
        priorityWords: { manual: [], sourced: [] },
        generationCount: 0,
        finalPuzzle: null,
      },
      session: {
        batch: null,
        selectedId: null,
        generationErrors: [],
        stage: 'review',
        priorityLimitReached: false,
        published: null,
      },
    })
  })

  it('returns a new, independent state each time', () => {
    const a = createInitialWorkshopState()
    const b = createInitialWorkshopState()
    expect(a).not.toBe(b)
    expect(a.draft.priorityWords).not.toBe(b.draft.priorityWords)
  })
})

describe('workshopReducer: authoring inputs', () => {
  it('updates each input without touching anything else', () => {
    const initial = deepFreeze(createInitialWorkshopState())
    const state = run(
      [
        { type: 'SET_CLUE', clue: 'Dogs' },
        { type: 'SET_POOL_TEXT', poolText: 'BEAGLE\nPOODLE' },
        { type: 'SET_SOURCING_CONTEXT', context: 'Pets' },
        { type: 'SET_PROPER_NOUNS', properNouns: 'allow' },
        { type: 'SET_ABBREVIATIONS', abbreviations: 'allow' },
        { type: 'SET_SOURCE_KIND', sourceKind: 'fixture' },
      ],
      initial,
    )
    expect(state.draft).toMatchObject({
      clue: 'Dogs',
      poolText: 'BEAGLE\nPOODLE',
      sourcing: { context: 'Pets', properNouns: 'allow', abbreviations: 'allow', sourceKind: 'fixture', pool: null },
    })
    expect(state.session).toBe(initial.session)
    expect(state.draft.priorityWords).toBe(initial.draft.priorityWords)
  })

  it('switching modes keeps both modes’ inputs and Priority Words, and clears the limit notice', () => {
    const pool = sourcedPool()
    const state = run([
      { type: 'SET_POOL_TEXT', poolText: DOGS_CANDIDATE_POOL.join('\n') },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
      { type: 'SET_POOL_SOURCE', poolSource: 'sourced' },
      { type: 'SOURCED_POOL_RECEIVED', pool },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'POODLE' },
    ])
    expect(state.draft.priorityWords).toEqual({ manual: ['BEAGLE'], sourced: ['POODLE'] })
    expect(selectActivePriorityWords(state.draft)).toEqual(['POODLE'])

    const limited = { ...state, session: { ...state.session, priorityLimitReached: true } }
    const back = workshopReducer(limited, { type: 'SET_POOL_SOURCE', poolSource: 'manual' })
    expect(selectActivePriorityWords(back.draft)).toEqual(['BEAGLE'])
    expect(back.draft.poolText).toBe(DOGS_CANDIDATE_POOL.join('\n'))
    expect(back.draft.sourcing.pool).toBe(pool)
    expect(back.session.priorityLimitReached).toBe(false)
  })

  it('analyzes only the active mode’s pool', () => {
    const pool = sourcedPool()
    expect(analyzeActivePool('manual', DOGS_CANDIDATE_POOL.join('\n'), pool).usableAnswers).toEqual(DOGS_CANDIDATE_POOL)
    const sourced = analyzeActivePool('sourced', DOGS_CANDIDATE_POOL.join('\n'), pool).usableAnswers
    expect(sourced).toContain('GREATDANE')
    expect(sourced).not.toContain('COLLIE') // manual-only
    expect(analyzeActivePool('sourced', '', null).usableAnswers).toEqual([])
  })
})

describe('workshopReducer: sourcing and Pool Review', () => {
  it('replaces the sourced pool, keeping Priority Words it no longer contains', () => {
    const withoutBeagle = sourcedPool(fixtureCandidates().filter((c) => c.answer !== 'Beagle'))
    const state = run([
      { type: 'SET_POOL_SOURCE', poolSource: 'sourced' },
      { type: 'SOURCED_POOL_RECEIVED', pool: sourcedPool() },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
      { type: 'SOURCED_POOL_RECEIVED', pool: withoutBeagle },
    ])
    expect(state.draft.sourcing.pool).toBe(withoutBeagle)
    expect(state.draft.priorityWords.sourced).toEqual(['BEAGLE'])
  })

  it('changes one candidate’s include choice and ignores it when there is no pool', () => {
    const state = run([{ type: 'SOURCED_POOL_RECEIVED', pool: sourcedPool() }])
    const beagle = state.draft.sourcing.pool!.candidates.find((c) => c.sourceAnswer === 'Beagle')!
    const excluded = workshopReducer(state, { type: 'SET_CANDIDATE_INCLUDED', id: beagle.id, included: false })
    expect(excluded.draft.sourcing.pool!.candidates.find((c) => c.id === beagle.id)!.included).toBe(false)
    expect(state.draft.sourcing.pool!.candidates.find((c) => c.id === beagle.id)!.included).toBe(true)

    const empty = createInitialWorkshopState()
    expect(workshopReducer(empty, { type: 'SET_CANDIDATE_INCLUDED', id: 'c1', included: false })).toBe(empty)
  })
})

describe('workshopReducer: Priority Words', () => {
  it('toggles in the active mode only', () => {
    const state = run([
      { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'KENNEL' },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
    ])
    expect(state.draft.priorityWords).toEqual({ manual: ['KENNEL'], sourced: [] })
  })

  it('refuses an eleventh word, keeping the ten and setting the notice; the next change clears it', () => {
    const ten = DOGS_CANDIDATE_POOL.slice(0, 10)
    const atLimit = run(ten.map((word) => ({ type: 'TOGGLE_PRIORITY_WORD', word }) as const))
    const refused = workshopReducer(atLimit, { type: 'TOGGLE_PRIORITY_WORD', word: DOGS_CANDIDATE_POOL[10] })
    expect(refused.draft).toBe(atLimit.draft)
    expect(refused.session.priorityLimitReached).toBe(true)

    const deselected = workshopReducer(refused, { type: 'TOGGLE_PRIORITY_WORD', word: ten[0] })
    expect(deselected.draft.priorityWords.manual).toEqual(ten.slice(1))
    expect(deselected.session.priorityLimitReached).toBe(false)
  })

  it('keeps a stale selection until it is removed explicitly', () => {
    const state = run([
      { type: 'SET_POOL_TEXT', poolText: DOGS_CANDIDATE_POOL.join('\n') },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
      { type: 'SET_POOL_TEXT', poolText: DOGS_CANDIDATE_POOL.slice(1).join('\n') },
    ])
    expect(state.draft.priorityWords.manual).toEqual(['BEAGLE'])
    const removed = workshopReducer(state, { type: 'REMOVE_PRIORITY_WORD', word: 'BEAGLE' })
    expect(removed.draft.priorityWords.manual).toEqual([])
  })
})

describe('workshopReducer: generation, selection, and Final Puzzle', () => {
  function approvedState() {
    return run([
      { type: 'GENERATION_SUCCEEDED', batch: batch1 },
      { type: 'SELECT_CANDIDATE', id: batch1.candidates[0].identitySignature },
      { type: 'APPROVE_CANDIDATE', candidate: batch1.candidates[0], number: 1 },
    ])
  }

  it('a successful batch records its number, replaces the batch, and clears errors', () => {
    const failed = run([{ type: 'GENERATION_FAILED', errors: ['Enter a clue.'] }])
    expect(failed.session.generationErrors).toEqual(['Enter a clue.'])
    const state = workshopReducer(failed, { type: 'GENERATION_SUCCEEDED', batch: batch1 })
    expect(state.draft.generationCount).toBe(1)
    expect(state.session.batch).toBe(batch1)
    expect(state.session.generationErrors).toEqual([])
  })

  it('a refused Generate keeps the previous batch, selection, Final Puzzle, and publication', () => {
    const published = workshopReducer(approvedState(), {
      type: 'FINAL_PUZZLE_PUBLISHED',
      signature: batch1.candidates[0].identitySignature,
      published: PUBLISHED,
    })
    const state = workshopReducer(published, { type: 'GENERATION_FAILED', errors: ['Enter a clue.'] })
    expect(state.draft).toBe(published.draft)
    expect(state.session).toEqual({ ...published.session, generationErrors: ['Enter a clue.'] })
  })

  it('a new batch clears the selection, the Final Puzzle, and its publication (current behavior)', () => {
    const published = workshopReducer(approvedState(), {
      type: 'FINAL_PUZZLE_PUBLISHED',
      signature: batch1.candidates[0].identitySignature,
      published: PUBLISHED,
    })
    const state = workshopReducer(published, { type: 'GENERATION_SUCCEEDED', batch: batch2 })
    expect(state.draft.generationCount).toBe(2)
    expect(state.draft.finalPuzzle).toBeNull()
    expect(state.session.selectedId).toBeNull()
    expect(state.session.published).toBeNull()
    // The stage is left alone; WorkshopApp only shows Final Puzzle when one exists.
    expect(state.session.stage).toBe('final')
  })

  it('approving opens Final Puzzle with an ID suggested from the batch clue', () => {
    const state = approvedState()
    expect(state.session.stage).toBe('final')
    expect(state.draft.finalPuzzle).toEqual({
      candidate: batch1.candidates[0],
      number: 1,
      inputs: { id: 'dogs', clue: 'Dogs' },
    })
    expect(selectApprovedId(state.draft)).toBe(batch1.candidates[0].identitySignature)
  })

  it('re-opening the approved candidate keeps the author’s inputs and its publication', () => {
    const signature = batch1.candidates[0].identitySignature
    const edited = run(
      [
        { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: { id: 'dogs7', clue: 'Good dogs' } },
        { type: 'FINAL_PUZZLE_PUBLISHED', signature, published: PUBLISHED },
        { type: 'RETURN_TO_REVIEW' },
        { type: 'APPROVE_CANDIDATE', candidate: batch1.candidates[0], number: 1 },
      ],
      approvedState(),
    )
    expect(edited.session.stage).toBe('final')
    expect(edited.draft.finalPuzzle?.inputs).toEqual({ id: 'dogs7', clue: 'Good dogs' })
    expect(selectPublished(edited)).toBe(PUBLISHED)
  })

  it('approving a different candidate replaces the Final Puzzle and drops the publication', () => {
    const state = run(
      [
        { type: 'FINAL_PUZZLE_PUBLISHED', signature: batch1.candidates[0].identitySignature, published: PUBLISHED },
        { type: 'RETURN_TO_REVIEW' },
        { type: 'APPROVE_CANDIDATE', candidate: batch1.candidates[1], number: 2 },
      ],
      approvedState(),
    )
    expect(state.draft.finalPuzzle).toMatchObject({ candidate: batch1.candidates[1], number: 2, inputs: { id: 'dogs' } })
    expect(state.session.published).toBeNull()
    expect(selectPublished(state)).toBeNull()
  })

  it('editing inputs keeps the same candidate object (publish previews key on it) and is a no-op without a Final Puzzle', () => {
    const state = approvedState()
    const edited = workshopReducer(state, { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: { id: 'x', clue: 'y' } })
    expect(edited.draft.finalPuzzle?.candidate).toBe(state.draft.finalPuzzle?.candidate)
    const empty = createInitialWorkshopState()
    expect(workshopReducer(empty, { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: { id: 'x', clue: 'y' } })).toBe(empty)
  })

  it('ignores a publication for a Final Puzzle that is no longer current', () => {
    const state = approvedState()
    const stale = workshopReducer(state, {
      type: 'FINAL_PUZZLE_PUBLISHED',
      signature: batch1.candidates[1].identitySignature,
      published: PUBLISHED,
    })
    expect(stale).toBe(state)
  })

  it('Back returns to review without changing the draft', () => {
    const state = approvedState()
    const back = workshopReducer(state, { type: 'RETURN_TO_REVIEW' })
    expect(back.session.stage).toBe('review')
    expect(back.draft).toBe(state.draft)
  })
})

describe('workshopReducer: purity and the persistence boundary', () => {
  const workflow = (): WorkshopAction[] => [
    { type: 'SET_CLUE', clue: 'Dogs' },
    { type: 'SET_POOL_TEXT', poolText: DOGS_CANDIDATE_POOL.join('\n') },
    { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
    { type: 'SET_POOL_SOURCE', poolSource: 'sourced' },
    { type: 'SOURCED_POOL_RECEIVED', pool: sourcedPool() },
    { type: 'SET_POOL_SOURCE', poolSource: 'manual' },
    { type: 'GENERATION_SUCCEEDED', batch: batch1 },
    { type: 'APPROVE_CANDIDATE', candidate: batch1.candidates[0], number: 1 },
    { type: 'FINAL_PUZZLE_PUBLISHED', signature: batch1.candidates[0].identitySignature, published: PUBLISHED },
  ]

  it('is deterministic and never mutates its input', () => {
    const actions = workflow()
    let state = deepFreeze(createInitialWorkshopState())
    for (const action of actions) state = deepFreeze(workshopReducer(state, action))
    expect(run(workflow())).toEqual(state)
  })

  it('returns the same state for an unknown action', () => {
    const state = createInitialWorkshopState()
    expect(workshopReducer(state, { type: 'UNKNOWN' } as unknown as WorkshopAction)).toBe(state)
  })

  it('the persistable draft excludes all session state and survives a JSON round trip', () => {
    const state = run(workflow())
    const draft = selectPersistableDraft(state)
    expect(Object.keys(draft).sort()).toEqual(
      ['clue', 'finalPuzzle', 'generationCount', 'poolSource', 'poolText', 'priorityWords', 'sourcing'].sort(),
    )
    const json = JSON.stringify(draft)
    expect(json).not.toContain('"batch"')
    expect(json).not.toContain('contentFingerprint')
    expect(JSON.parse(json)).toEqual(draft)
  })
})
