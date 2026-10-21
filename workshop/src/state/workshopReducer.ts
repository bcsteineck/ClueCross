// Workshop authoring state: one pure reducer over two explicit slices.
//
//   draft   — the author's durable working draft: everything needed to
//             resume the same puzzle. Plain JSON-compatible data only; the
//             Workshop saves it to a local file (see draft/) and restores
//             it on startup (selectPersistableDraft, DRAFT_RESTORED).
//   session — workflow state that changes in the same transitions as the
//             draft but never outlives the session: the unsaved batch, its
//             selection, Generate errors, the Priority Word limit notice,
//             and the result of re-checking a restored publication record.
//             Which workspace is showing is navigation, not state: it lives
//             in the URL (shell/useWorkspaceRoute).
//
// Request state (sourcing in flight, its error), navigation between the
// Authoring and Production Schedule views, and focus bookkeeping stay as
// local hooks in WorkshopApp: they have no transitions shared with the
// draft. Side effects — sourcing requests, generation (timing), publishing
// — run in WorkshopApp, which dispatches their results here.
//
// A new batch still clears the selection, the Final Puzzle, and its
// publication record (a later phase changes this with saved candidates).

import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { suggestPuzzleId } from '../finalPuzzle/finalPuzzle'
import type { FinalPuzzleInputs } from '../finalPuzzle/finalPuzzle'
import type { WorkshopBatch } from '../generateBatch'
import { parsePool } from '../parsePool'
import { analyzeCandidatePool } from '../poolDiagnostics'
import type { CandidatePoolAnalysis } from '../poolDiagnostics'
import type { PublishedState } from '../publishing/contract'
import { togglePriorityWord } from '../priorityWords'
import type { AbbreviationSetting, ProperNounSetting } from '../sourcing/contract'
import { poolReviewEntries, setCandidateIncluded } from '../sourcing/reviewPool'
import type { SourcedPool } from '../sourcing/sourceCandidates'

export type PoolSource = 'manual' | 'sourced'
export type SourceKind = 'live' | 'fixture'

/** The approved candidate being prepared for publishing, with the author's ID and clue. */
export interface FinalPuzzleDraft {
  candidate: PoolCandidate
  /** The candidate's 1-based position in the batch it was approved from. */
  number: number
  inputs: FinalPuzzleInputs
  /**
   * The dev-calendar publication the server confirmed for this Final
   * Puzzle; it locks the ID and clue. Kept in the draft so a restored Final
   * Puzzle stays locked, and re-checked against the server on restore
   * (PUBLICATION_CHECKED) rather than trusted as current.
   */
  publication: PublishedState | null
}

/** Outcome of re-checking a restored publication record with the dev calendar. */
export type PublicationCheck =
  | 'checking'
  /** The dev calendar still has exactly this puzzle under this ID. */
  | 'confirmed'
  /** The dev calendar has no puzzle with this ID any more; the record was cleared. */
  | 'not-found'
  /** The dev calendar couldn't confirm it (unavailable, or different content); the record and lock stay. */
  | 'unconfirmed'

/** The durable working draft. Every value is JSON-compatible. */
export interface WorkshopDraft {
  clue: string
  poolSource: PoolSource
  /** Enter manually: the raw candidate-words text. */
  poolText: string
  /** Source from clue: request settings and the reviewed pool (with include choices). */
  sourcing: {
    context: string
    properNouns: ProperNounSetting
    abbreviations: AbbreviationSetting
    sourceKind: SourceKind
    pool: SourcedPool | null
  }
  /** Each mode's own Priority Words (construction form); only the active mode's apply. */
  priorityWords: Record<PoolSource, string[]>
  /** Successful generations so far; batch N uses seed "workshop-generation-N". */
  generationCount: number
  /** Today this embeds the candidate it was approved from. */
  finalPuzzle: FinalPuzzleDraft | null
}

/** Session-only workflow state. Never part of the draft. */
export interface WorkshopSession {
  /** The current, unsaved generation batch. */
  batch: WorkshopBatch | null
  /** identitySignature of the candidate open in Candidate Review. */
  selectedId: string | null
  /** Errors from the last refused Generate; cleared by the next successful one. */
  generationErrors: string[]
  /** The last Priority Word selection was refused because the limit was reached. */
  priorityLimitReached: boolean
  /** Set only for a Final Puzzle restored with a publication record. */
  publicationCheck: PublicationCheck | null
}

export interface WorkshopState {
  draft: WorkshopDraft
  session: WorkshopSession
}

export type WorkshopAction =
  | { type: 'SET_CLUE'; clue: string }
  | { type: 'SET_POOL_SOURCE'; poolSource: PoolSource }
  | { type: 'SET_POOL_TEXT'; poolText: string }
  | { type: 'SET_SOURCING_CONTEXT'; context: string }
  | { type: 'SET_PROPER_NOUNS'; properNouns: ProperNounSetting }
  | { type: 'SET_ABBREVIATIONS'; abbreviations: AbbreviationSetting }
  | { type: 'SET_SOURCE_KIND'; sourceKind: SourceKind }
  | { type: 'SOURCED_POOL_RECEIVED'; pool: SourcedPool }
  | { type: 'SET_CANDIDATE_INCLUDED'; id: string; included: boolean }
  | { type: 'TOGGLE_PRIORITY_WORD'; word: string }
  | { type: 'REMOVE_PRIORITY_WORD'; word: string }
  | { type: 'GENERATION_FAILED'; errors: string[] }
  | { type: 'GENERATION_SUCCEEDED'; batch: WorkshopBatch }
  | { type: 'SELECT_CANDIDATE'; id: string }
  | { type: 'APPROVE_CANDIDATE'; candidate: PoolCandidate; number: number }
  | { type: 'SET_FINAL_PUZZLE_INPUTS'; inputs: FinalPuzzleInputs }
  | { type: 'FINAL_PUZZLE_PUBLISHED'; signature: string; published: PublishedState }
  /** Replaces the whole draft with a saved one; the session starts fresh. */
  | { type: 'DRAFT_RESTORED'; draft: WorkshopDraft }
  /** Starts over with `draft` (a createInitialDraft() already saved) and a fresh session. */
  | { type: 'NEW_PUZZLE'; draft: WorkshopDraft }
  | { type: 'PUBLICATION_CHECKED'; signature: string; outcome: Exclude<PublicationCheck, 'checking'> }

export function createInitialDraft(): WorkshopDraft {
  return {
    clue: '',
    poolSource: 'manual',
    poolText: '',
    sourcing: { context: '', properNouns: 'exclude', abbreviations: 'exclude', sourceKind: 'live', pool: null },
    priorityWords: { manual: [], sourced: [] },
    generationCount: 0,
    finalPuzzle: null,
  }
}

export function createInitialSession(): WorkshopSession {
  return {
    batch: null,
    selectedId: null,
    generationErrors: [],
    priorityLimitReached: false,
    publicationCheck: null,
  }
}

export function createInitialWorkshopState(): WorkshopState {
  return { draft: createInitialDraft(), session: createInitialSession() }
}

function withDraft(state: WorkshopState, changes: Partial<WorkshopDraft>): WorkshopState {
  return { ...state, draft: { ...state.draft, ...changes } }
}

function withSourcing(state: WorkshopState, changes: Partial<WorkshopDraft['sourcing']>): WorkshopState {
  return withDraft(state, { sourcing: { ...state.draft.sourcing, ...changes } })
}

function withActivePriorityWords(state: WorkshopState, words: string[]): WorkshopDraft['priorityWords'] {
  return { ...state.draft.priorityWords, [state.draft.poolSource]: words }
}

export function workshopReducer(state: WorkshopState, action: WorkshopAction): WorkshopState {
  switch (action.type) {
    case 'SET_CLUE':
      return withDraft(state, { clue: action.clue })
    case 'SET_POOL_SOURCE':
      return {
        draft: { ...state.draft, poolSource: action.poolSource },
        session: { ...state.session, priorityLimitReached: false },
      }
    case 'SET_POOL_TEXT':
      return withDraft(state, { poolText: action.poolText })
    case 'SET_SOURCING_CONTEXT':
      return withSourcing(state, { context: action.context })
    case 'SET_PROPER_NOUNS':
      return withSourcing(state, { properNouns: action.properNouns })
    case 'SET_ABBREVIATIONS':
      return withSourcing(state, { abbreviations: action.abbreviations })
    case 'SET_SOURCE_KIND':
      return withSourcing(state, { sourceKind: action.sourceKind })
    case 'SOURCED_POOL_RECEIVED':
      // Replaces the reviewed pool; Priority Words are kept even if the new
      // pool lacks them (they then block Generate).
      return withSourcing(state, { pool: action.pool })
    case 'SET_CANDIDATE_INCLUDED': {
      const pool = state.draft.sourcing.pool
      if (!pool) return state
      return withSourcing(state, {
        pool: { ...pool, candidates: setCandidateIncluded(pool.candidates, action.id, action.included) },
      })
    }
    case 'TOGGLE_PRIORITY_WORD': {
      const { selection, limitReached } = togglePriorityWord(selectActivePriorityWords(state.draft), action.word)
      return {
        draft: limitReached ? state.draft : { ...state.draft, priorityWords: withActivePriorityWords(state, selection) },
        session: { ...state.session, priorityLimitReached: limitReached },
      }
    }
    case 'REMOVE_PRIORITY_WORD':
      return {
        draft: {
          ...state.draft,
          priorityWords: withActivePriorityWords(
            state,
            selectActivePriorityWords(state.draft).filter((word) => word !== action.word),
          ),
        },
        session: { ...state.session, priorityLimitReached: false },
      }
    case 'GENERATION_FAILED':
      // A refused Generate changes nothing else: the previous batch,
      // selection, and Final Puzzle stay.
      return { ...state, session: { ...state.session, generationErrors: action.errors } }
    case 'GENERATION_SUCCEEDED':
      // A new batch clears selection, approval, and publication, so
      // approval never appears to outlive what it approved.
      return {
        draft: { ...state.draft, generationCount: action.batch.generationNumber, finalPuzzle: null },
        session: { ...state.session, batch: action.batch, selectedId: null, generationErrors: [], publicationCheck: null },
      }
    case 'SELECT_CANDIDATE':
      return { ...state, session: { ...state.session, selectedId: action.id } }
    case 'APPROVE_CANDIDATE': {
      // Re-opening the current Final Puzzle changes nothing, keeping the
      // author's ID and clue (and its publication); approving another
      // replaces it. Showing the Final Puzzle is the caller's navigation.
      if (action.candidate.identitySignature === selectApprovedId(state.draft)) return state
      const clueDefault = state.session.batch?.clue ?? ''
      return {
        draft: {
          ...state.draft,
          finalPuzzle: {
            candidate: action.candidate,
            number: action.number,
            inputs: { id: suggestPuzzleId(clueDefault), clue: clueDefault },
            publication: null,
          },
        },
        session: { ...state.session, publicationCheck: null },
      }
    }
    case 'SET_FINAL_PUZZLE_INPUTS': {
      const finalPuzzle = state.draft.finalPuzzle
      if (!finalPuzzle) return state
      return withDraft(state, { finalPuzzle: { ...finalPuzzle, inputs: action.inputs } })
    }
    case 'FINAL_PUZZLE_PUBLISHED':
      // Applies only to the Final Puzzle that published, even if the author
      // has moved on while the request was in flight.
      if (action.signature !== selectApprovedId(state.draft) || !state.draft.finalPuzzle) return state
      return {
        draft: { ...state.draft, finalPuzzle: { ...state.draft.finalPuzzle, publication: action.published } },
        session: { ...state.session, publicationCheck: null },
      }
    case 'DRAFT_RESTORED':
      return {
        draft: action.draft,
        session: { ...createInitialSession(), publicationCheck: action.draft.finalPuzzle?.publication ? 'checking' : null },
      }
    case 'NEW_PUZZLE':
      return { draft: action.draft, session: createInitialSession() }
    case 'PUBLICATION_CHECKED': {
      const finalPuzzle = state.draft.finalPuzzle
      // Only for the restored record still being checked.
      if (!finalPuzzle?.publication || action.signature !== finalPuzzle.candidate.identitySignature) return state
      if (state.session.publicationCheck !== 'checking') return state
      const session = { ...state.session, publicationCheck: action.outcome }
      if (action.outcome !== 'not-found') return { ...state, session }
      return { draft: { ...state.draft, finalPuzzle: { ...finalPuzzle, publication: null } }, session }
    }
    default:
      return state
  }
}

// Selectors

/** The durable draft, exactly what a later phase persists. Session state is never included. */
export function selectPersistableDraft(state: WorkshopState): WorkshopDraft {
  return state.draft
}

export function selectActivePriorityWords(draft: WorkshopDraft): string[] {
  return draft.priorityWords[draft.poolSource]
}

/**
 * The active mode's pool, analyzed by the existing Pool Diagnostics. Takes
 * only the fields it reads, so callers can memoize on exactly those.
 */
export function analyzeActivePool(
  poolSource: PoolSource,
  poolText: string,
  sourcedPool: SourcedPool | null,
): CandidatePoolAnalysis {
  return poolSource === 'manual'
    ? parsePool(poolText)
    : analyzeCandidatePool(poolReviewEntries(sourcedPool?.candidates ?? []))
}

export function selectApprovedId(draft: WorkshopDraft): string | null {
  return draft.finalPuzzle?.candidate.identitySignature ?? null
}

/** The publication recorded for the current Final Puzzle, if any. */
export function selectPublished(state: WorkshopState): PublishedState | null {
  return state.draft.finalPuzzle?.publication ?? null
}
