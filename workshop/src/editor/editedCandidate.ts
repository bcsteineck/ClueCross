// Edited versions of saved candidates: their durable data, how one is
// created from a saved candidate or branched from another version, and how
// the rest of the Workshop sees one.
//
// An edited version is its own Saved Candidates entry with its own id. It
// never changes the candidate it came from, and it survives that
// candidate's removal: everything it needs (its words, its own pool, its
// reset baseline, and the original generated layout for View Original) is
// copied into it. sourceId and parentId are lineage only.
//
// The rest of the Workshop reads a saved candidate's `candidate` (a
// PoolCandidate). For an edited version that is derived from its current
// words, so Saved Candidates, the Final Puzzle, and publishing all go
// through the same code as generated candidates. An empty board (or a
// layout the metrics can't describe, only possible from a hand-edited
// file) has no PoolCandidate: `candidate` is then null.

import { computeMetrics } from '../../../tools/generator/src/metrics/metrics.js'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { constructionFingerprint } from '../candidateFingerprint'
import { WORKSHOP_GENERATION_CONFIG } from '../generateBatch'
import type { SavedCandidate } from '../state/workshopReducer'
import { sameAnswer, toConstruction, unusedWords, wordsFromConstruction } from './editorLayout'
import type { EditorLayout, EditorPoolWord, EditorWord } from './editorLayout'

export interface EditedVersion {
  words: EditorWord[]
  /** This version's own word pool (placed words included), independent of Author. */
  pool: EditorPoolWord[]
  /** Reset Layout restores these placements: the layout this version started from. */
  baseline: EditorWord[]
  /** The original generated candidate's layout, for View Original. */
  original: EditorWord[]
  /** The Priority Words when the first version was made; missing ones are an advisory warning. */
  priorityWords: string[]
  /** The generated candidate this lineage started from (it may have been removed since). */
  sourceId: string | null
  /** The version this one was branched or copied from, if any (it may have been removed since). */
  parentId: string | null
  /** The source candidate's name when the lineage started ("Candidate 4"), for default names. */
  sourceLabel: string
  /** "Edit N" in the default name. */
  editNumber: number
}

export const EDITED_SEED = 'manual-edit'

/** A short random id for a new saved candidate; persistent, never shown. */
export function newCandidateId(): string {
  return `cand-${globalThis.crypto.randomUUID()}`
}

/** The name shown for a saved candidate: its custom name, or a default from its kind and place. */
export function savedCandidateName(saved: SavedCandidate, index: number): string {
  if (saved.name?.trim()) return saved.name.trim()
  if (saved.edit) return `${saved.edit.sourceLabel} — Edit ${saved.edit.editNumber}`
  return `Candidate ${index + 1}`
}

/** Approved, or carrying a dev-calendar publication: editing must leave it as it is. */
export function isLocked(saved: SavedCandidate, approvedId: string | null): boolean {
  return saved.id === approvedId || saved.publication !== null
}

/**
 * The PoolCandidate the rest of the Workshop reads for these words, or
 * null for an empty board or a layout the metrics can't describe.
 */
export function editedPoolCandidate(layout: EditorLayout): PoolCandidate | null {
  const construction = toConstruction(layout.words)
  if (!construction || construction.width > WORKSHOP_GENERATION_CONFIG.maxWidth || construction.height > WORKSHOP_GENERATION_CONFIG.maxHeight) {
    return null
  }
  let metrics: PoolCandidate['metrics']
  try {
    metrics = computeMetrics(construction, {
      maxWidth: WORKSHOP_GENERATION_CONFIG.maxWidth,
      maxHeight: WORKSHOP_GENERATION_CONFIG.maxHeight,
    })
  } catch {
    return null
  }
  const fingerprint = constructionFingerprint(construction)
  return {
    construction,
    metrics,
    canonicalSignature: fingerprint,
    representativeSeed: EDITED_SEED,
    sourceSeeds: [],
    duplicateCount: 0,
    selectedAnswers: layout.words.map((word) => word.word).sort(),
    unselectedAnswers: unusedWords(layout)
      .map((entry) => entry.word)
      .sort(),
    answerCount: layout.words.length,
    identitySignature: fingerprint,
    representativeTrialIndex: 0,
    sourceTrialIndices: [],
  }
}

/** A saved entry for an edited version with these words and pool (candidate and fingerprint derived). */
export function withEditedLayout(saved: SavedCandidate & { edit: EditedVersion }, layout: EditorLayout): SavedCandidate {
  const candidate = editedPoolCandidate(layout)
  return {
    ...saved,
    candidate,
    fingerprint: candidate ? constructionFingerprint(candidate.construction) : '',
    edit: { ...saved.edit, words: layout.words, pool: layout.pool },
  }
}

function nextEditNumber(saved: readonly SavedCandidate[], sourceId: string | null, sourceLabel: string): number {
  const numbers = saved
    .filter((entry) => entry.edit && entry.edit.sourceId === sourceId && entry.edit.sourceLabel === sourceLabel)
    .map((entry) => entry.edit!.editNumber)
  return Math.max(0, ...numbers) + 1
}

export interface NewVersionOptions {
  id: string
  savedAt: string
  /** Every saved candidate, for the next "Edit N". */
  saved: readonly SavedCandidate[]
  /** The source's place in Saved Candidates (0-based), for "Candidate N" when it's a generated candidate. */
  sourceIndex: number
  /** The current Priority Words, kept with a lineage's first version. */
  priorityWords: readonly string[]
}

/**
 * A new, unpublished edited version copied from `source` — a generated
 * candidate (the lineage's first edit), or another edited version (an
 * approved or published one, which is never edited in place, or a Save as
 * New Candidate). Its reset baseline is the layout it was copied from.
 */
export function createEditedVersion(source: SavedCandidate, options: NewVersionOptions, layout?: EditorLayout): SavedCandidate | null {
  let edit: EditedVersion
  if (source.edit) {
    const words = layout?.words ?? source.edit.words
    edit = {
      ...source.edit,
      words,
      pool: layout?.pool ?? source.edit.pool,
      baseline: words,
      parentId: source.id,
      editNumber: nextEditNumber(options.saved, source.edit.sourceId, source.edit.sourceLabel),
    }
  } else {
    if (!source.candidate) return null
    const words = wordsFromConstruction(source.candidate.construction)
    const pool: EditorPoolWord[] = []
    for (const word of [...source.candidate.selectedAnswers, ...source.candidate.unselectedAnswers]) {
      if (!pool.some((entry) => sameAnswer(entry.word, word))) pool.push({ word, source: 'pool' })
    }
    const sourceLabel = savedCandidateName(source, options.sourceIndex)
    edit = {
      words,
      pool,
      baseline: words,
      original: words,
      priorityWords: [...options.priorityWords],
      sourceId: source.id,
      parentId: null,
      sourceLabel,
      editNumber: nextEditNumber(options.saved, source.id, sourceLabel),
    }
  }
  const entry: SavedCandidate & { edit: EditedVersion } = {
    id: options.id,
    name: null,
    fingerprint: '',
    candidate: null,
    origin: source.origin,
    savedAt: options.savedAt,
    // A new version is never published or scheduled, whatever its source was.
    publication: null,
    edit,
  }
  return withEditedLayout(entry, { words: edit.words, pool: edit.pool })
}
