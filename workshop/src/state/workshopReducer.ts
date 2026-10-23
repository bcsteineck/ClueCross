// Workshop authoring state: one pure reducer over two explicit slices.
//
//   draft   — the author's durable working draft: everything needed to
//             resume the same puzzle. Plain JSON-compatible data only; the
//             Workshop saves it to a local file (see draft/) and restores
//             it on startup (selectPersistableDraft, DRAFT_RESTORED).
//   session — workflow state that changes in the same transitions as the
//             draft but never outlives the session: the unsaved batch, the
//             Candidates tab and each tab's selection, Generate errors, the
//             Priority Word limit notice, and the result of re-checking a
//             restored publication record.
//             Which workspace is showing is navigation, not state: it lives
//             in the URL (shell/useWorkspaceRoute).
//
// Request state (sourcing in flight, its error), navigation between the
// Authoring and Production Schedule views, and focus bookkeeping stay as
// local hooks in WorkshopApp: they have no transitions shared with the
// draft. Side effects — sourcing requests, generation (timing), publishing
// — run in WorkshopApp, which dispatches their results here.
//
// Candidate workflow: Current Batch -> Saved Candidates -> Final Puzzle.
// A batch is session-only; saving copies a candidate into the draft's
// shortlist (savedCandidates, oldest first, one entry per fingerprint).
// Only a saved candidate can be approved, and the approved one stays in the
// shortlist and can't be removed — so the Final Puzzle always corresponds
// to a saved candidate. A new batch replaces the old one and keeps both the
// shortlist and the Final Puzzle. Persisting a save or removal (and undoing
// it if the write fails) is WorkshopApp's job; here each is one transition.
//
// Publishing is independent of approval. The durable record of a
// publication is the dev calendar's (the Workshop never changes or removes
// it here); the draft keeps a copy so the Workshop can show and lock it.
// That copy belongs to the candidate that was published: approving another
// candidate or clearing the Final Puzzle moves it into the candidate's
// Saved Candidates entry, and approving that candidate again brings it back
// (re-checked with the dev calendar). Another candidate never inherits it.

import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { candidateFingerprint } from '../candidateFingerprint'
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
  /** A copy of the approved saved candidate (same fingerprint as its Saved Candidates entry). */
  candidate: PoolCandidate
  /** The candidate's 1-based position in Saved Candidates when it was approved. */
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

/** Where a saved candidate came from. Informational: identity is the fingerprint. */
export interface SavedCandidateOrigin {
  /** The batch's seed ("workshop-generation-N"); null if unknown (migrated from an older draft). */
  batchSeed: string | null
  /** Its 1-based position in that batch; null if unknown. */
  number: number | null
  /** The batch's clue when it was generated; null if unknown. */
  clue: string | null
}

/** One entry in the Saved Candidates shortlist: an unchanging snapshot of the candidate. */
export interface SavedCandidate {
  /** candidateFingerprint(candidate); unique in the shortlist. */
  fingerprint: string
  candidate: PoolCandidate
  origin: SavedCandidateOrigin
  /** ISO 8601 time it was saved; null if unknown. */
  savedAt: string | null
  /**
   * Its dev-calendar publication, kept here while it is not the Final
   * Puzzle (the Final Puzzle's own is finalPuzzle.publication, and this is
   * then null). Approving it again restores that Final Puzzle as published.
   */
  publication: SavedPublication | null
}

/** A saved candidate's dev-calendar publication and the ID and clue it was published with. */
export interface SavedPublication {
  inputs: FinalPuzzleInputs
  published: PublishedState
}

export type CandidateTab = 'batch' | 'saved'

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
  /** The shortlist for this puzzle, oldest first. Includes the Final Puzzle's candidate. */
  savedCandidates: SavedCandidate[]
  /** Always one of savedCandidates (same fingerprint), or null. */
  finalPuzzle: FinalPuzzleDraft | null
}

/** Session-only workflow state. Never part of the draft. */
export interface WorkshopSession {
  /** The current, unsaved generation batch. */
  batch: WorkshopBatch | null
  /** Which Candidates tab is showing. */
  candidateTab: CandidateTab
  /** Fingerprint of the candidate selected in Current Batch. */
  selectedId: string | null
  /** Fingerprint of the candidate selected in Saved Candidates (the first one when unset or gone). */
  savedSelectedId: string | null
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
  | { type: 'SET_CANDIDATE_TAB'; tab: CandidateTab }
  /** Selects a candidate (by fingerprint) in Current Batch. */
  | { type: 'SELECT_CANDIDATE'; id: string }
  /** Selects a candidate (by fingerprint) in Saved Candidates. */
  | { type: 'SELECT_SAVED_CANDIDATE'; id: string }
  /** Appends to Saved Candidates; nothing happens if the same layout is already saved. */
  | { type: 'SAVE_CANDIDATE'; saved: SavedCandidate }
  /** Removes from Saved Candidates; never removes the approved one. */
  | { type: 'REMOVE_SAVED_CANDIDATE'; fingerprint: string }
  /** Puts back an entry whose removal couldn't be saved, at its old position. */
  | { type: 'RESTORE_SAVED_CANDIDATE'; saved: SavedCandidate; index: number }
  /** Approves a saved candidate as the Final Puzzle, using the current Author clue. */
  | { type: 'APPROVE_SAVED_CANDIDATE'; fingerprint: string }
  /** Removes the approval; the candidate stays saved. */
  | { type: 'CLEAR_FINAL_PUZZLE' }
  | { type: 'SET_FINAL_PUZZLE_INPUTS'; inputs: FinalPuzzleInputs }
  | { type: 'FINAL_PUZZLE_PUBLISHED'; signature: string; inputs: FinalPuzzleInputs; published: PublishedState }
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
    savedCandidates: [],
    finalPuzzle: null,
  }
}

export function createInitialSession(): WorkshopSession {
  return {
    batch: null,
    candidateTab: 'batch',
    selectedId: null,
    savedSelectedId: null,
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
      // The new batch replaces the old one (its unsaved candidates are
      // gone) and opens in Current Batch; Saved Candidates and the Final
      // Puzzle are untouched.
      return {
        draft: { ...state.draft, generationCount: action.batch.generationNumber },
        session: { ...state.session, batch: action.batch, candidateTab: 'batch', selectedId: null, generationErrors: [] },
      }
    case 'SET_CANDIDATE_TAB':
      return { ...state, session: { ...state.session, candidateTab: action.tab } }
    case 'SELECT_CANDIDATE':
      return { ...state, session: { ...state.session, selectedId: action.id } }
    case 'SELECT_SAVED_CANDIDATE':
      return { ...state, session: { ...state.session, savedSelectedId: action.id } }
    case 'SAVE_CANDIDATE': {
      const { saved } = action
      if (findSaved(state.draft, saved.fingerprint) >= 0) return state
      return withDraft(state, { savedCandidates: [...state.draft.savedCandidates, saved] })
    }
    case 'REMOVE_SAVED_CANDIDATE': {
      const index = findSaved(state.draft, action.fingerprint)
      if (index < 0 || action.fingerprint === selectApprovedFingerprint(state.draft)) return state
      return withDraft(state, { savedCandidates: state.draft.savedCandidates.filter((_, i) => i !== index) })
    }
    case 'RESTORE_SAVED_CANDIDATE': {
      if (findSaved(state.draft, action.saved.fingerprint) >= 0) return state
      const savedCandidates = [...state.draft.savedCandidates]
      savedCandidates.splice(Math.min(Math.max(action.index, 0), savedCandidates.length), 0, action.saved)
      return withDraft(state, { savedCandidates })
    }
    case 'APPROVE_SAVED_CANDIDATE': {
      // Re-approving the current Final Puzzle changes nothing, keeping the
      // author's ID and clue (and its publication); approving another
      // replaces it at once. The clue is the Author clue as it is now, not
      // the one the candidate was generated under; the saved snapshot itself
      // is never changed. Showing the Final Puzzle is the caller's navigation.
      // A candidate published earlier comes back with the ID and clue it
      // was published with, and its record is re-checked as on restore.
      const index = findSaved(state.draft, action.fingerprint)
      if (index < 0 || action.fingerprint === selectApprovedFingerprint(state.draft)) return state
      let savedCandidates = withFinalPublicationKept(state.draft)
      const saved = savedCandidates[index]
      const clue = state.draft.clue.trim()
      if (saved.publication) savedCandidates = savedCandidates.with(index, { ...saved, publication: null })
      return {
        draft: {
          ...state.draft,
          savedCandidates,
          finalPuzzle: {
            candidate: saved.candidate,
            number: index + 1,
            inputs: saved.publication?.inputs ?? { id: suggestPuzzleId(clue), clue },
            publication: saved.publication?.published ?? null,
          },
        },
        session: { ...state.session, publicationCheck: saved.publication ? 'checking' : null },
      }
    }
    case 'CLEAR_FINAL_PUZZLE':
      if (!state.draft.finalPuzzle) return state
      return {
        draft: { ...state.draft, savedCandidates: withFinalPublicationKept(state.draft), finalPuzzle: null },
        session: { ...state.session, publicationCheck: null },
      }
    case 'SET_FINAL_PUZZLE_INPUTS': {
      const finalPuzzle = state.draft.finalPuzzle
      if (!finalPuzzle) return state
      return withDraft(state, { finalPuzzle: { ...finalPuzzle, inputs: action.inputs } })
    }
    case 'FINAL_PUZZLE_PUBLISHED': {
      // Recorded on the candidate that published, even if the author
      // approved another (or cleared the Final Puzzle) while the request was
      // in flight; dropped only if that candidate is no longer saved.
      if (action.signature === selectApprovedFingerprint(state.draft) && state.draft.finalPuzzle) {
        return {
          draft: { ...state.draft, finalPuzzle: { ...state.draft.finalPuzzle, publication: action.published } },
          session: { ...state.session, publicationCheck: null },
        }
      }
      const index = findSaved(state.draft, action.signature)
      if (index < 0) return state
      const savedCandidates = state.draft.savedCandidates.with(index, {
        ...state.draft.savedCandidates[index],
        publication: { inputs: action.inputs, published: action.published },
      })
      return withDraft(state, { savedCandidates })
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
      if (!finalPuzzle?.publication || action.signature !== candidateFingerprint(finalPuzzle.candidate)) return state
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

/** The approved candidate's fingerprint, or null. */
export function selectApprovedFingerprint(draft: WorkshopDraft): string | null {
  return draft.finalPuzzle ? candidateFingerprint(draft.finalPuzzle.candidate) : null
}

/** A copy of the shortlist with the Final Puzzle's publication (if any) kept on its saved entry. */
// (The same array when there's nothing to keep.)
function withFinalPublicationKept(draft: WorkshopDraft): SavedCandidate[] {
  const finalPuzzle = draft.finalPuzzle
  const index = finalPuzzle?.publication ? findSaved(draft, candidateFingerprint(finalPuzzle.candidate)) : -1
  if (!finalPuzzle?.publication || index < 0) return draft.savedCandidates
  return draft.savedCandidates.with(index, {
    ...draft.savedCandidates[index],
    publication: { inputs: finalPuzzle.inputs, published: finalPuzzle.publication },
  })
}

function findSaved(draft: WorkshopDraft, fingerprint: string): number {
  return draft.savedCandidates.findIndex((saved) => saved.fingerprint === fingerprint)
}

/** The publication recorded for the current Final Puzzle, if any. */
export function selectPublished(state: WorkshopState): PublishedState | null {
  return state.draft.finalPuzzle?.publication ?? null
}
