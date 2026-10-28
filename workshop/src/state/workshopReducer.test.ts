import { beforeAll, describe, expect, it } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../../tools/generator/src/pool/dogsCandidatePool.js'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { savedEntry, savedIdOf } from '../../server/draft/testDrafts'
import { candidateFingerprint } from '../candidateFingerprint'
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
  selectApprovedFingerprint,
  selectPersistableDraft,
  selectPublished,
  workshopReducer,
} from './workshopReducer'
import type { WorkshopAction, WorkshopState } from './workshopReducer'

const fp = (candidate: PoolCandidate) => candidateFingerprint(candidate)
const save = (candidate: PoolCandidate, number: number, batch?: WorkshopBatch): WorkshopAction => ({
  type: 'SAVE_CANDIDATE',
  saved: savedEntry(candidate, number, batch),
})
const sid = (candidate: PoolCandidate) => savedIdOf(candidate)
const approve = (candidate: PoolCandidate): WorkshopAction => ({ type: 'APPROVE_SAVED_CANDIDATE', id: sid(candidate) })

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
const PUBLISHED_INPUTS = { id: 'dogs1', clue: 'Dogs' }

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
        savedCandidates: [],
        finalPuzzle: null,
      },
      session: {
        batch: null,
        candidateTab: 'batch',
        selectedId: null,
        savedSelectedId: null,
        generationErrors: [],
        priorityLimitReached: false,
        publicationCheck: null,
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
      { type: 'SET_CLUE', clue: 'Dogs' },
      { type: 'GENERATION_SUCCEEDED', batch: batch1 },
      { type: 'SELECT_CANDIDATE', id: fp(batch1.candidates[0]) },
      save(batch1.candidates[0], 1, batch1),
      approve(batch1.candidates[0]),
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
      savedId: sid(batch1.candidates[0]),
      inputs: PUBLISHED_INPUTS,
      published: PUBLISHED,
    })
    const state = workshopReducer(published, { type: 'GENERATION_FAILED', errors: ['Enter a clue.'] })
    expect(state.draft).toBe(published.draft)
    expect(state.session).toEqual({ ...published.session, generationErrors: ['Enter a clue.'] })
  })

  it('a new batch replaces the batch and opens Current Batch, keeping Saved Candidates, the Final Puzzle, and its publication', () => {
    const published = run(
      [
        { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(batch1.candidates[0]), inputs: PUBLISHED_INPUTS, published: PUBLISHED },
        { type: 'SET_CANDIDATE_TAB', tab: 'saved' },
      ],
      approvedState(),
    )
    const state = workshopReducer(published, { type: 'GENERATION_SUCCEEDED', batch: batch2 })
    expect(state.draft.generationCount).toBe(2)
    expect(state.session.batch).toBe(batch2)
    expect(state.session.candidateTab).toBe('batch')
    expect(state.session.selectedId).toBeNull()
    expect(state.draft.savedCandidates).toBe(published.draft.savedCandidates)
    expect(state.draft.finalPuzzle).toBe(published.draft.finalPuzzle)
    expect(selectPublished(state)).toBe(PUBLISHED)
  })

  it('approving a saved candidate makes it the Final Puzzle with an ID suggested from the current clue', () => {
    const state = approvedState()
    expect(state.draft.finalPuzzle).toEqual({
      savedId: sid(batch1.candidates[0]),
      candidate: batch1.candidates[0],
      number: 1,
      inputs: { id: 'dogs', clue: 'Dogs' },
      publication: null,
    })
    expect(selectApprovedFingerprint(state.draft)).toBe(fp(batch1.candidates[0]))
  })

  it('re-opening the approved candidate keeps the author’s inputs and its publication', () => {
    const savedId = sid(batch1.candidates[0])
    const edited = run(
      [
        { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: { id: 'dogs7', clue: 'Good dogs' } },
        { type: 'FINAL_PUZZLE_PUBLISHED', savedId, inputs: PUBLISHED_INPUTS, published: PUBLISHED },
      ],
      approvedState(),
    )
    // Re-approving the current Final Puzzle changes nothing (no new draft, so nothing to save).
    expect(workshopReducer(edited, approve(batch1.candidates[0]))).toBe(edited)
    expect(edited.draft.finalPuzzle?.inputs).toEqual({ id: 'dogs7', clue: 'Good dogs' })
    expect(selectPublished(edited)).toBe(PUBLISHED)
  })

  it('approving a different candidate replaces the Final Puzzle and drops the publication', () => {
    const state = run(
      [
        { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(batch1.candidates[0]), inputs: PUBLISHED_INPUTS, published: PUBLISHED },
        save(batch1.candidates[1], 2, batch1),
        approve(batch1.candidates[1]),
      ],
      approvedState(),
    )
    expect(state.draft.finalPuzzle).toMatchObject({ candidate: batch1.candidates[1], number: 2, inputs: { id: 'dogs' } })
    // The previously approved candidate stays saved, in its place.
    expect(state.draft.savedCandidates.map((saved) => saved.fingerprint)).toEqual([fp(batch1.candidates[0]), fp(batch1.candidates[1])])
    expect(state.draft.finalPuzzle?.publication).toBeNull()
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
      savedId: sid(batch1.candidates[1]),
      inputs: PUBLISHED_INPUTS,
      published: PUBLISHED,
    })
    expect(stale).toBe(state)
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
    save(batch1.candidates[0], 1, batch1),
    approve(batch1.candidates[0]),
    { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(batch1.candidates[0]), inputs: PUBLISHED_INPUTS, published: PUBLISHED },
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
      ['clue', 'finalPuzzle', 'generationCount', 'poolSource', 'poolText', 'priorityWords', 'savedCandidates', 'sourcing'].sort(),
    )
    const json = JSON.stringify(draft)
    expect(json).not.toContain('"batch"')
    expect(json).not.toContain('generationErrors')
    // The server-confirmed dev publication is part of the Final Puzzle, so a restored one stays locked.
    expect(draft.finalPuzzle?.publication).toBe(PUBLISHED)
    expect(JSON.parse(json)).toEqual(draft)
  })

})

describe('workshopReducer: restore, New Puzzle, and publication checks', () => {
  function publishedDraft() {
    return run([
      { type: 'GENERATION_SUCCEEDED', batch: batch1 },
      save(batch1.candidates[0], 1, batch1),
      approve(batch1.candidates[0]),
      { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(batch1.candidates[0]), inputs: PUBLISHED_INPUTS, published: PUBLISHED },
    ]).draft
  }

  it('DRAFT_RESTORED replaces the draft and starts a fresh session', () => {
    const busy = run([
      { type: 'GENERATION_SUCCEEDED', batch: batch1 },
      { type: 'SELECT_CANDIDATE', id: fp(batch1.candidates[0]) },
      { type: 'GENERATION_FAILED', errors: ['x'] },
    ])
    const saved = { ...createInitialWorkshopState().draft, clue: 'Pirates', generationCount: 7 }
    const restored = workshopReducer(busy, { type: 'DRAFT_RESTORED', draft: saved })
    expect(restored.draft).toBe(saved)
    expect(restored.session).toEqual(createInitialWorkshopState().session)
  })

  it('a restored publication record starts a check; other restores do not', () => {
    const draft = publishedDraft()
    expect(workshopReducer(createInitialWorkshopState(), { type: 'DRAFT_RESTORED', draft }).session.publicationCheck).toBe(
      'checking',
    )
    const unpublished = { ...draft, finalPuzzle: { ...draft.finalPuzzle!, publication: null } }
    expect(
      workshopReducer(createInitialWorkshopState(), { type: 'DRAFT_RESTORED', draft: unpublished }).session.publicationCheck,
    ).toBeNull()
  })

  it('a confirmed or unconfirmed check keeps the record; not-found clears it', () => {
    const restored = workshopReducer(createInitialWorkshopState(), { type: 'DRAFT_RESTORED', draft: publishedDraft() })
    const savedId = sid(batch1.candidates[0])
    for (const outcome of ['confirmed', 'unconfirmed'] as const) {
      const checked = workshopReducer(restored, { type: 'PUBLICATION_CHECKED', savedId, outcome })
      expect(checked.session.publicationCheck).toBe(outcome)
      expect(selectPublished(checked)).toBe(PUBLISHED)
    }
    const notFound = workshopReducer(restored, { type: 'PUBLICATION_CHECKED', savedId, outcome: 'not-found' })
    expect(notFound.session.publicationCheck).toBe('not-found')
    expect(selectPublished(notFound)).toBeNull()
    // A check for another candidate, or one that isn't pending, is ignored.
    expect(workshopReducer(restored, { type: 'PUBLICATION_CHECKED', savedId: 'other', outcome: 'not-found' })).toBe(restored)
    expect(workshopReducer(notFound, { type: 'PUBLICATION_CHECKED', savedId, outcome: 'confirmed' })).toBe(notFound)
  })

  it('NEW_PUZZLE replaces everything with the given empty draft and a fresh session', () => {
    const fresh = createInitialWorkshopState().draft
    const state = run([
      { type: 'SET_CLUE', clue: 'Dogs' },
      { type: 'TOGGLE_PRIORITY_WORD', word: 'BEAGLE' },
      { type: 'GENERATION_SUCCEEDED', batch: batch1 },
      save(batch1.candidates[0], 1, batch1),
      approve(batch1.candidates[0]),
      { type: 'SET_CANDIDATE_TAB', tab: 'saved' },
      { type: 'NEW_PUZZLE', draft: fresh },
    ])
    expect(state.draft).toBe(fresh)
    expect(state.draft.savedCandidates).toEqual([])
    expect(state.draft.generationCount).toBe(0)
    expect(state.session).toEqual(createInitialWorkshopState().session)
  })
})

describe('workshopReducer: Saved Candidates', () => {
  const generated = () => run([{ type: 'SET_CLUE', clue: 'Dogs' }, { type: 'GENERATION_SUCCEEDED', batch: batch1 }])
  const order = (state: WorkshopState) => state.draft.savedCandidates.map((saved) => saved.fingerprint)

  it('saves in order, oldest first, with no limit, and keeps the batch and selection as they were', () => {
    const before = run([{ type: 'SELECT_CANDIDATE', id: fp(batch1.candidates[4]) }], generated())
    const state = run(
      batch1.candidates.map((candidate, index) => save(candidate, index + 1, batch1)),
      before,
    )
    expect(order(state)).toEqual(batch1.candidates.map(fp))
    expect(state.draft.savedCandidates.length).toBe(batch1.candidates.length)
    expect(state.session).toBe(before.session)
  })

  it('never saves the same layout twice, even from a later batch, and keeps its original place', () => {
    const state = run([save(batch1.candidates[2], 3, batch1), save(batch1.candidates[0], 1, batch1)], generated())
    // The same crossword reached again (another batch, another clue): no change at all.
    const again = savedEntry(batch1.candidates[2], 9, { ...batch1, seed: 'workshop-generation-9', clue: 'Pups' }, 'saved-again')
    expect(workshopReducer(state, { type: 'SAVE_CANDIDATE', saved: again })).toBe(state)
    expect(order(state)).toEqual([fp(batch1.candidates[2]), fp(batch1.candidates[0])])
  })

  it('removes an unapproved candidate, keeping the others in order; never the approved one', () => {
    const state = run(
      [save(batch1.candidates[0], 1, batch1), save(batch1.candidates[1], 2, batch1), save(batch1.candidates[2], 3, batch1), approve(batch1.candidates[2])],
      generated(),
    )
    const removed = workshopReducer(state, { type: 'REMOVE_SAVED_CANDIDATE', id: sid(batch1.candidates[0]) })
    expect(order(removed)).toEqual([fp(batch1.candidates[1]), fp(batch1.candidates[2])])
    expect(workshopReducer(removed, { type: 'REMOVE_SAVED_CANDIDATE', id: sid(batch1.candidates[2]) })).toBe(removed)
    expect(workshopReducer(removed, { type: 'REMOVE_SAVED_CANDIDATE', id: 'unknown' })).toBe(removed)
    // Once saved again it goes to the end.
    expect(order(run([save(batch1.candidates[0], 1, batch1)], removed)).at(-1)).toBe(fp(batch1.candidates[0]))
  })

  it('a failed removal puts the entry back where it was', () => {
    const state = run([save(batch1.candidates[0], 1, batch1), save(batch1.candidates[1], 2, batch1), save(batch1.candidates[2], 3, batch1)], generated())
    const entry = state.draft.savedCandidates[1]
    const removed = workshopReducer(state, { type: 'REMOVE_SAVED_CANDIDATE', id: entry.id })
    const restored = workshopReducer(removed, { type: 'RESTORE_SAVED_CANDIDATE', saved: entry, index: 1 })
    expect(restored.draft.savedCandidates).toEqual(state.draft.savedCandidates)
    expect(workshopReducer(restored, { type: 'RESTORE_SAVED_CANDIDATE', saved: entry, index: 0 })).toBe(restored)
  })

  it('approves only saved candidates, with the Author clue as it is now, leaving the saved snapshot unchanged', () => {
    const saved = run([save(batch1.candidates[3], 4, batch1)], generated())
    expect(workshopReducer(saved, approve(batch1.candidates[0]))).toBe(saved)
    const state = run([{ type: 'SET_CLUE', clue: 'Kitchen Essentials' }, approve(batch1.candidates[3])], saved)
    expect(state.draft.finalPuzzle).toEqual({
      savedId: sid(batch1.candidates[3]),
      candidate: batch1.candidates[3],
      number: 1,
      inputs: { id: 'kitchenessentials', clue: 'Kitchen Essentials' },
      publication: null,
    })
    expect(state.draft.savedCandidates).toBe(saved.draft.savedCandidates)
    expect(state.draft.savedCandidates[0].origin.clue).toBe('Dogs')
  })

  it('an approval of the same layout from another batch matches by fingerprint', () => {
    const state = run([save(batch1.candidates[0], 1, batch1), approve(batch1.candidates[0])], generated())
    // A structurally equal copy (as a later batch or a restored draft would hold).
    const copy = JSON.parse(JSON.stringify(batch1.candidates[0])) as PoolCandidate
    expect(selectApprovedFingerprint(state.draft)).toBe(fp(copy))
  })

  it('clearing the Final Puzzle keeps the candidate saved, and it can then be removed', () => {
    const published = run(
      [
        save(batch1.candidates[0], 1, batch1),
        approve(batch1.candidates[0]),
        { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(batch1.candidates[0]), inputs: PUBLISHED_INPUTS, published: PUBLISHED },
      ],
      generated(),
    )
    const cleared = workshopReducer(published, { type: 'CLEAR_FINAL_PUZZLE' })
    expect(cleared.draft.finalPuzzle).toBeNull()
    // The snapshot is unchanged; the candidate's publication record moves onto its entry.
    expect(cleared.draft.savedCandidates[0].candidate).toBe(published.draft.savedCandidates[0].candidate)
    expect(cleared.draft.savedCandidates[0].publication).toEqual({ inputs: published.draft.finalPuzzle!.inputs, published: PUBLISHED })
    expect(workshopReducer(cleared, { type: 'CLEAR_FINAL_PUZZLE' })).toBe(cleared)
    expect(order(workshopReducer(cleared, { type: 'REMOVE_SAVED_CANDIDATE', id: sid(batch1.candidates[0]) }))).toEqual([])
  })

  it('remembers each tab’s selection separately', () => {
    const state = run(
      [
        { type: 'SELECT_CANDIDATE', id: fp(batch1.candidates[1]) },
        { type: 'SET_CANDIDATE_TAB', tab: 'saved' },
        { type: 'SELECT_SAVED_CANDIDATE', id: fp(batch1.candidates[5]) },
        { type: 'SET_CANDIDATE_TAB', tab: 'batch' },
      ],
      generated(),
    )
    expect(state.session).toMatchObject({ candidateTab: 'batch', selectedId: fp(batch1.candidates[1]), savedSelectedId: fp(batch1.candidates[5]) })
  })
})

describe('workshopReducer: publication is independent of approval', () => {
  const A = () => batch1.candidates[0]
  const B = () => batch1.candidates[1]
  const PUBLISHED_B: PublishedState = {
    kind: 'created',
    publication: { ...PUBLISHED.publication, puzzleId: 'dogs', publishDate: '2026-10-22', contentFingerprint: 'e'.repeat(64) },
  }
  const entry = (state: WorkshopState, candidate: PoolCandidate) =>
    state.draft.savedCandidates.find((saved) => saved.fingerprint === fp(candidate))
  // A and B saved; A approved with an edited ID, then published.
  function publishedA() {
    return run([
      { type: 'SET_CLUE', clue: 'Dogs' },
      { type: 'GENERATION_SUCCEEDED', batch: batch1 },
      save(A(), 1, batch1),
      save(B(), 2, batch1),
      approve(A()),
      { type: 'SET_FINAL_PUZZLE_INPUTS', inputs: PUBLISHED_INPUTS },
      { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(A()), inputs: PUBLISHED_INPUTS, published: PUBLISHED },
    ])
  }

  it('approving B after A was published: B is unpublished, and A keeps its record in Saved Candidates', () => {
    const state = run([{ type: 'SET_CLUE', clue: 'Pups' }, approve(B())], publishedA())
    expect(state.draft.finalPuzzle).toMatchObject({ number: 2, inputs: { id: 'pups', clue: 'Pups' }, publication: null })
    expect(selectPublished(state)).toBe(null)
    expect(state.session.publicationCheck).toBe(null)
    expect(entry(state, A())?.publication).toEqual({ inputs: PUBLISHED_INPUTS, published: PUBLISHED })
    expect(entry(state, B())?.publication).toBe(null)
  })

  it('clearing a published Final Puzzle keeps the candidate saved with its record', () => {
    const state = workshopReducer(publishedA(), { type: 'CLEAR_FINAL_PUZZLE' })
    expect(state.draft.finalPuzzle).toBe(null)
    expect(state.session.publicationCheck).toBe(null)
    expect(entry(state, A())).toMatchObject({ publication: { inputs: PUBLISHED_INPUTS, published: PUBLISHED } })
  })

  it('approving A again restores its published ID, clue, and lock, and re-checks it with the dev calendar', () => {
    for (const away of [approve(B()), { type: 'CLEAR_FINAL_PUZZLE' } as const]) {
      const state = run([away, { type: 'SET_CLUE', clue: 'Pups' }, approve(A())], publishedA())
      expect(state.draft.finalPuzzle).toMatchObject({ number: 1, inputs: PUBLISHED_INPUTS, publication: PUBLISHED })
      expect(state.session.publicationCheck).toBe('checking')
      // One copy only: the Final Puzzle's.
      expect(entry(state, A())?.publication).toBe(null)
      const gone = workshopReducer(state, { type: 'PUBLICATION_CHECKED', savedId: sid(A()), outcome: 'not-found' })
      expect(gone.draft.finalPuzzle?.publication).toBe(null)
    }
  })

  it('publishing B through the normal workflow records it on B only, and A keeps its own', () => {
    const state = run(
      [approve(B()), { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(B()), inputs: { id: 'dogs', clue: 'Dogs' }, published: PUBLISHED_B }],
      publishedA(),
    )
    expect(selectPublished(state)).toBe(PUBLISHED_B)
    expect(entry(state, A())?.publication?.published).toBe(PUBLISHED)
    // Switching back and forth moves each record with its own candidate.
    const back = workshopReducer(state, approve(A()))
    expect(selectPublished(back)).toBe(PUBLISHED)
    expect(entry(back, B())?.publication).toEqual({ inputs: { id: 'dogs', clue: 'Dogs' }, published: PUBLISHED_B })
  })

  it('a publish that completes after the author approved another is recorded on the candidate that published', () => {
    const approvedA = run([{ type: 'SET_CLUE', clue: 'Dogs' }, { type: 'GENERATION_SUCCEEDED', batch: batch1 }, save(A(), 1, batch1), save(B(), 2, batch1), approve(A())])
    const state = run(
      [approve(B()), { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(A()), inputs: PUBLISHED_INPUTS, published: PUBLISHED }],
      approvedA,
    )
    expect(selectPublished(state)).toBe(null)
    expect(entry(state, A())?.publication).toEqual({ inputs: PUBLISHED_INPUTS, published: PUBLISHED })
    // A candidate no longer saved: nothing to record it on.
    const removed = run([approve(B()), { type: 'REMOVE_SAVED_CANDIDATE', id: sid(A()) }], approvedA)
    expect(workshopReducer(removed, { type: 'FINAL_PUZZLE_PUBLISHED', savedId: sid(A()), inputs: PUBLISHED_INPUTS, published: PUBLISHED })).toBe(removed)
  })

  it('a new batch keeps every saved publication record', () => {
    const state = run([approve(B()), { type: 'GENERATION_SUCCEEDED', batch: batch2 }], publishedA())
    expect(entry(state, A())?.publication?.published).toBe(PUBLISHED)
  })
})
