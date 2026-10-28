import { describe, expect, it } from 'vitest'
import { DEV_PUBLICATION, dogsBatch, fullDraft, savedEntry, savedIdOf, version2EnvelopeOf } from '../../server/draft/testDrafts'
import { candidateFingerprint } from '../candidateFingerprint'
import { DRAFT_SCHEMA_VERSION, parseDraftEnvelope, parseWorkshopDraft } from '../draft/draftSchema'
import { prepareFinalPuzzle } from '../finalPuzzle/finalPuzzle'
import { approvalIssues, createInitialWorkshopState, selectApprovedId, workshopReducer } from '../state/workshopReducer'
import type { SavedCandidate, WorkshopAction, WorkshopDraft, WorkshopState } from '../state/workshopReducer'
import { createEditedVersion, editedPoolCandidate, isLocked, savedCandidateName } from './editedCandidate'
import { EMPTY_HISTORY, recordEdit, redo, undo } from './editorHistory'
import { addManualWord, addWord, layoutIssues, moveWord, removeWord, unusedWords, wordCells } from './editorLayout'
import type { EditorLayout, EditorWord } from './editorLayout'

const sharesCell = (a: EditorWord, b: EditorWord) =>
  wordCells(a).some((cell) => wordCells(b).some((other) => other.x === cell.x && other.y === cell.y))

const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const batch = dogsBatch()
const A = () => batch.candidates[0]
const B = () => batch.candidates[1]

function run(actions: WorkshopAction[], state: WorkshopState = createInitialWorkshopState()): WorkshopState {
  return actions.reduce(workshopReducer, state)
}

let ids = 0
function versionOf(source: SavedCandidate, saved: SavedCandidate[], layout?: EditorLayout): SavedCandidate {
  const version = createEditedVersion(
    source,
    {
      id: `edit-${++ids}`,
      savedAt: '2026-10-27T10:00:00.000Z',
      saved,
      sourceIndex: saved.findIndex((entry) => entry.id === source.id),
      priorityWords: ['ZEBRA'],
    },
    layout,
  )
  if (!version) throw new Error('no version')
  return version
}

/** Saved A and B, and an edited copy of A. */
function withEdit(): { state: WorkshopState; edited: SavedCandidate } {
  const state = run([
    { type: 'SET_CLUE', clue: 'Dogs' },
    { type: 'SAVE_CANDIDATE', saved: savedEntry(A(), 1) },
    { type: 'SAVE_CANDIDATE', saved: savedEntry(B(), 2) },
  ])
  const edited = versionOf(state.draft.savedCandidates[0], state.draft.savedCandidates)
  return { state: workshopReducer(state, { type: 'CREATE_EDITED_CANDIDATE', saved: edited }), edited }
}

const layoutOf = (saved: SavedCandidate): EditorLayout => ({ words: saved.edit!.words, pool: saved.edit!.pool })
const entry = (state: WorkshopState, id: string) => state.draft.savedCandidates.find((saved) => saved.id === id)!

describe('edited versions', () => {
  it('editing a generated candidate makes a separate saved copy and leaves the original unchanged', () => {
    const { state, edited } = withEdit()
    const original = state.draft.savedCandidates[0]
    const before = viaJson(original)
    expect(state.draft.savedCandidates.map((saved) => saved.id)).toEqual([savedIdOf(A()), savedIdOf(B()), edited.id])
    expect(edited.id).not.toBe(original.id)
    expect(viaJson(entry(state, original.id))).toEqual(before)
    // Same layout, its own identity: identical edited layouts are allowed.
    expect(edited.fingerprint).toBe(original.fingerprint)
    expect(edited.edit).toMatchObject({ sourceId: original.id, parentId: null, sourceLabel: 'Candidate 1', editNumber: 1 })
    expect(edited.edit!.words).toEqual(edited.edit!.baseline)
    expect(edited.edit!.original).toEqual(edited.edit!.baseline)
    // The pool is the candidate's own: its answers and the unselected words.
    expect(edited.edit!.pool.map((entry) => entry.word).sort()).toEqual([...A().selectedAnswers, ...A().unselectedAnswers].sort())
    expect(edited.edit!.priorityWords).toEqual(['ZEBRA'])
    expect(savedCandidateName(edited, 2)).toBe('Candidate 1 — Edit 1')
  })

  it('numbers further edits of the same candidate, and branches carry their parent’s pool and layout', () => {
    const { state, edited } = withEdit()
    const second = versionOf(state.draft.savedCandidates[0], state.draft.savedCandidates)
    expect(savedCandidateName(second, 3)).toBe('Candidate 1 — Edit 2')

    const word = unusedWords(layoutOf(edited))[0]?.word
    const manual = addManualWord(layoutOf(edited), 'Snoot')
    if (!manual.ok) throw new Error(manual.reason)
    const moved = removeWord(manual.layout, edited.edit!.words[0].id)
    if (!moved.ok) throw new Error(moved.reason)
    const branch = versionOf(edited, [...state.draft.savedCandidates, second], moved.layout)
    expect(branch.id).not.toBe(edited.id)
    expect(branch.edit).toMatchObject({ parentId: edited.id, sourceId: edited.edit!.sourceId, editNumber: 3 })
    expect(branch.edit!.baseline).toEqual(moved.layout.words)
    expect(branch.edit!.original).toEqual(edited.edit!.original)
    expect(branch.edit!.pool).toContainEqual({ word: 'SNOOT', source: 'manual' })
    expect(word).toBeDefined()
  })

  it('an edited version never inherits its source’s publication', () => {
    const published = { ...savedEntry(A(), 1), publication: { inputs: { id: 'dogs7', clue: 'Dogs' }, published: DEV_PUBLICATION } }
    const copy = versionOf(published, [published])
    expect(copy.publication).toBeNull()
    expect(isLocked(published, null)).toBe(true)
    expect(isLocked(copy, null)).toBe(false)
    expect(isLocked(copy, copy.id)).toBe(true)
  })

  it('has no candidate while its board is empty', () => {
    const { edited } = withEdit()
    expect(editedPoolCandidate({ words: [], pool: edited.edit!.pool })).toBeNull()
    const candidate = editedPoolCandidate(layoutOf(edited))!
    expect(candidate.selectedAnswers).toEqual(A().selectedAnswers)
    expect(candidate.unselectedAnswers).toEqual(A().unselectedAnswers)
  })
})

describe('reducer: edited versions', () => {
  it('saves generated layouts once, but never merges them with edited versions', () => {
    const { state, edited } = withEdit()
    // B saved again from another batch: no change.
    expect(workshopReducer(state, { type: 'SAVE_CANDIDATE', saved: savedEntry(B(), 7, batch, 'saved-other') })).toBe(state)
    // A second edited version with the very same layout is its own entry.
    const twin = { ...edited, id: 'edit-twin' }
    const both = workshopReducer(state, { type: 'CREATE_EDITED_CANDIDATE', saved: twin })
    expect(both.draft.savedCandidates.filter((saved) => saved.fingerprint === edited.fingerprint)).toHaveLength(3)
    // The same id can't be added twice.
    expect(workshopReducer(both, { type: 'CREATE_EDITED_CANDIDATE', saved: twin })).toBe(both)
  })

  it('applies completed edits to the version only, deriving its candidate again', () => {
    const { state, edited } = withEdit()
    const removed = removeWord(layoutOf(edited), edited.edit!.words[0].id)
    if (!removed.ok) throw new Error(removed.reason)
    const next = workshopReducer(state, { type: 'UPDATE_EDITED_LAYOUT', id: edited.id, layout: removed.layout })
    const updated = entry(next, edited.id)
    expect(updated.edit!.words).toHaveLength(edited.edit!.words.length - 1)
    expect(updated.candidate!.answerCount).toBe(edited.edit!.words.length - 1)
    expect(updated.fingerprint).not.toBe(edited.fingerprint)
    expect(updated.fingerprint).toBe(candidateFingerprint(updated.candidate!))
    // The source candidate is untouched.
    expect(next.draft.savedCandidates[0]).toBe(state.draft.savedCandidates[0])
    // A generated candidate can't be edited in place.
    expect(workshopReducer(state, { type: 'UPDATE_EDITED_LAYOUT', id: savedIdOf(A()), layout: removed.layout })).toBe(state)
  })

  it('never changes an approved or published version', () => {
    const { state, edited } = withEdit()
    const approved = workshopReducer(state, { type: 'APPROVE_SAVED_CANDIDATE', id: edited.id })
    expect(selectApprovedId(approved.draft)).toBe(edited.id)
    const removed = removeWord(layoutOf(edited), edited.edit!.words[0].id)
    if (!removed.ok) throw new Error(removed.reason)
    expect(workshopReducer(approved, { type: 'UPDATE_EDITED_LAYOUT', id: edited.id, layout: removed.layout })).toBe(approved)
    const published = run(
      [
        { type: 'FINAL_PUZZLE_PUBLISHED', savedId: edited.id, inputs: { id: 'dogs', clue: 'Dogs' }, published: DEV_PUBLICATION },
        { type: 'CLEAR_FINAL_PUZZLE' },
      ],
      approved,
    )
    expect(entry(published, edited.id).publication).not.toBeNull()
    expect(workshopReducer(published, { type: 'UPDATE_EDITED_LAYOUT', id: edited.id, layout: removed.layout })).toBe(published)
  })

  it('approves a connected edited crossword, warnings and all, and refuses empty, single-word, and disconnected ones', () => {
    const { state, edited } = withEdit()
    const update = (layout: EditorLayout) => workshopReducer(state, { type: 'UPDATE_EDITED_LAYOUT', id: edited.id, layout })
    const approve = (from: WorkshopState) => workshopReducer(from, { type: 'APPROVE_SAVED_CANDIDATE', id: edited.id })

    const empty = update({ words: [], pool: edited.edit!.pool })
    expect(approvalIssues(entry(empty, edited.id))).toEqual(['The board is empty. Place at least two crossing words.'])
    expect(approve(empty)).toBe(empty)

    const single = update({ words: [edited.edit!.words[0]], pool: edited.edit!.pool })
    expect(approve(single)).toBe(single)

    // Move one word away from the rest: legal, saved, but disconnected.
    // (The shortest word, put back somewhere it crosses nothing.)
    const lone = [...edited.edit!.words].sort((a, b) => a.word.length - b.word.length)[0]
    const without = removeWord(layoutOf(edited), lone.id)
    if (!without.ok) throw new Error(without.reason)
    let disconnected: EditorLayout | null = null
    for (const direction of ['across', 'down'] as const) {
      for (let y = 0; y < 12 && !disconnected; y++) {
        for (let x = 0; x < 12 && !disconnected; x++) {
          const placed = addWord(without.layout, { word: lone.word, direction, start: { x, y } }, lone.id)
          const crosses = placed.ok && placed.layout.words.some((word) => word.id !== lone.id && sharesCell(word, placed.layout.words.at(-1)!))
          if (placed.ok && !crosses) disconnected = placed.layout
        }
      }
    }
    expect(disconnected).not.toBeNull()
    const apart = update(disconnected!)
    expect(approvalIssues(entry(apart, edited.id)).join(' ')).toMatch(/separate groups/)
    expect(approve(apart)).toBe(apart)

    // The unchanged copy is approvable though it lacks its Priority Word (a warning only).
    expect(layoutIssues(edited.edit!.words, edited.edit!.priorityWords).advisory).toEqual(['Missing Priority Word: ZEBRA.'])
    const approved = approve(state)
    expect(approved.draft.finalPuzzle).toMatchObject({ savedId: edited.id, number: 3 })
    expect(approved.draft.finalPuzzle!.candidate).toBe(entry(state, edited.id).candidate)
  })

  it('a two-word crossword with a warning can be approved and is ready to publish', () => {
    const { state, edited } = withEdit()
    const [first] = edited.edit!.words
    // Keep one word and one word that crosses it.
    const crossing = edited.edit!.words.find(
      (word) => word.id !== first.id && word.direction !== first.direction && approvalIssues({ ...edited, edit: { ...edited.edit!, words: [first, word] } }).length === 0,
    )!
    const pair = workshopReducer(state, {
      type: 'UPDATE_EDITED_LAYOUT',
      id: edited.id,
      layout: { words: [first, crossing], pool: edited.edit!.pool },
    })
    const approved = workshopReducer(pair, { type: 'APPROVE_SAVED_CANDIDATE', id: edited.id })
    expect(selectApprovedId(approved.draft)).toBe(edited.id)
    const validation = prepareFinalPuzzle(approved.draft.finalPuzzle!.candidate.construction, { id: 'dogsedit', clue: 'Dogs' })
    expect(validation.exportErrors).toEqual([])
    expect(validation.ready).toBe(true)
  })

  it('deletes only the chosen version, never its source, parent, or branches', () => {
    const { state, edited } = withEdit()
    const branch = versionOf(edited, state.draft.savedCandidates)
    const three = workshopReducer(state, { type: 'CREATE_EDITED_CANDIDATE', saved: branch })
    const gone = workshopReducer(three, { type: 'REMOVE_SAVED_CANDIDATE', id: edited.id })
    expect(gone.draft.savedCandidates.map((saved) => saved.id)).toEqual([savedIdOf(A()), savedIdOf(B()), branch.id])
    // The branch still has everything it needs.
    expect(entry(gone, branch.id).edit!.original).toEqual(edited.edit!.original)
  })

  it('renames, keeping what was typed; a blank name means the default', () => {
    const { state, edited } = withEdit()
    const named = workshopReducer(state, { type: 'RENAME_SAVED_CANDIDATE', id: edited.id, name: 'Tighter corner ' })
    expect(entry(named, edited.id).name).toBe('Tighter corner ')
    expect(savedCandidateName(entry(named, edited.id), 2)).toBe('Tighter corner')
    const cleared = workshopReducer(named, { type: 'RENAME_SAVED_CANDIDATE', id: edited.id, name: '  ' })
    expect(entry(cleared, edited.id).name).toBeNull()
  })
})

describe('Undo/Redo history', () => {
  it('records one entry per completed operation, and a new edit drops anything undone', () => {
    const { edited } = withEdit()
    const start = layoutOf(edited)
    const removed = removeWord(start, edited.edit!.words[0].id)
    if (!removed.ok) throw new Error(removed.reason)
    let history = recordEdit(EMPTY_HISTORY, start)
    expect(history.past).toEqual([start])
    const back = undo(history, removed.layout)!
    expect(back.layout).toBe(start)
    history = back.history
    const forward = redo(history, start)!
    expect(forward.layout).toBe(removed.layout)
    // Undo again, then a different edit: the old redo is gone.
    const again = undo(forward.history, removed.layout)!
    history = recordEdit(again.history, again.layout)
    expect(history.future).toEqual([])
    expect(redo(history, again.layout)).toBeNull()
    expect(undo(EMPTY_HISTORY, start)).toBeNull()
  })
})

describe('persistence: edited versions', () => {
  function draftWithVersions(): { draft: WorkshopDraft; edited: SavedCandidate; empty: SavedCandidate } {
    const { state, edited } = withEdit()
    const manual = addManualWord(layoutOf(edited), 'snoot')
    if (!manual.ok) throw new Error(manual.reason)
    const first = edited.edit!.words[0]
    const moved = moveWord(manual.layout, first.id, first.direction === 'across' ? 'down' : 'across', { x: 0, y: 11 })
    const layout = moved.ok ? moved.layout : manual.layout
    const empty = versionOf(edited, state.draft.savedCandidates, { words: [], pool: manual.layout.pool })
    const draft = run(
      [
        { type: 'UPDATE_EDITED_LAYOUT', id: edited.id, layout },
        { type: 'RENAME_SAVED_CANDIDATE', id: edited.id, name: 'Wide' },
        { type: 'CREATE_EDITED_CANDIDATE', saved: empty },
      ],
      state,
    ).draft
    return { draft, edited, empty }
  }

  it('round-trips edited versions exactly: words, pool, manual words, baseline, original, lineage, names, and empty boards', () => {
    const { draft, edited, empty } = draftWithVersions()
    const parsed = parseWorkshopDraft(viaJson(draft))
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).toEqual(draft)
    const restored = parsed.value.savedCandidates.find((saved) => saved.id === edited.id)!
    expect(restored.name).toBe('Wide')
    expect(restored.edit!.pool).toContainEqual({ word: 'SNOOT', source: 'manual' })
    expect(restored.edit!.baseline).toEqual(edited.edit!.baseline)
    const restoredEmpty = parsed.value.savedCandidates.find((saved) => saved.id === empty.id)!
    expect(restoredEmpty.candidate).toBeNull()
    expect(restoredEmpty.edit!.words).toEqual([])
    expect(restoredEmpty.edit!.parentId).toBe(edited.id)
  })

  it('derives an edited version’s candidate from its words, never from the file', () => {
    const { draft, edited } = draftWithVersions()
    const file = viaJson(draft) as unknown as { savedCandidates: { id: string; candidate: unknown; fingerprint: string }[] }
    const stored = file.savedCandidates.find((saved) => saved.id === edited.id)!
    stored.candidate = { tampered: true }
    stored.fingerprint = 'v1;1x1;'
    const parsed = parseWorkshopDraft(file)
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).toEqual(draft)
  })

  it('rejects malformed edited versions and duplicate ids', () => {
    const { draft, edited } = draftWithVersions()
    const broken = (mutate: (version: Record<string, unknown>) => void) => {
      const file = viaJson(draft) as unknown as { savedCandidates: { id: string; edit: Record<string, unknown> }[] }
      mutate(file.savedCandidates.find((saved) => saved.id === edited.id)!.edit)
      const result = parseWorkshopDraft(file)
      return result.ok ? null : result.message
    }
    expect(broken((version) => ((version.words as { word: string }[])[0].word = 'NOTINPOOL'))).toMatch(/isn't in draft\.savedCandidates\[2\]\.edit\.pool/)
    expect(broken((version) => ((version.words as { word: string }[])[0].word = 'ab'))).toMatch(/is not a valid answer/)
    expect(broken((version) => ((version.words as { id: string }[])[1].id = (version.words as { id: string }[])[0].id))).toMatch(/duplicate word ids/)
    expect(broken((version) => (version.editNumber = 0))).toMatch(/editNumber must be at least 1/)
    const twice = viaJson(draft) as unknown as { savedCandidates: { id: string }[] }
    twice.savedCandidates[1].id = twice.savedCandidates[0].id
    expect(parseWorkshopDraft(twice)).toEqual({ ok: false, message: 'draft.savedCandidates has duplicate ids.' })
  })

  it('keeps an approved edited version as the Final Puzzle by id, even when another version has the same layout', () => {
    const { state, edited } = withEdit()
    const twin = { ...edited, id: 'edit-twin' }
    const draft = run(
      [
        { type: 'CREATE_EDITED_CANDIDATE', saved: twin },
        { type: 'APPROVE_SAVED_CANDIDATE', id: 'edit-twin' },
      ],
      state,
    ).draft
    const parsed = parseWorkshopDraft(viaJson(draft))
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value.finalPuzzle?.savedId).toBe('edit-twin')
    const wrong = viaJson(draft) as unknown as { finalPuzzle: { savedId: string } }
    wrong.finalPuzzle.savedId = 'missing'
    expect(parseWorkshopDraft(wrong)).toEqual({ ok: false, message: 'draft.finalPuzzle must be one of draft.savedCandidates.' })
  })

  it('migrates a version 2 draft: ids in list order, no names or edits, the Final Puzzle matched by layout', () => {
    const current = fullDraft({ published: true })
    const parsed = parseDraftEnvelope(version2EnvelopeOf(current, 4))
    if (!parsed.ok) throw new Error(parsed.message)
    expect(parsed.value).toMatchObject({ schemaVersion: DRAFT_SCHEMA_VERSION, revision: 4 })
    const { draft } = parsed.value
    expect(draft.savedCandidates.map((saved) => [saved.id, saved.name, saved.edit])).toEqual([
      ['saved-1', null, null],
      ['saved-2', null, null],
    ])
    expect(draft.finalPuzzle?.savedId).toBe('saved-2')
    // Everything else is exactly as it was.
    const strip = (value: WorkshopDraft) => ({
      ...value,
      savedCandidates: value.savedCandidates.map(({ id: _id, ...rest }) => rest),
      finalPuzzle: value.finalPuzzle && { ...value.finalPuzzle, savedId: '' },
    })
    expect(strip(draft)).toEqual(strip(current))
    // Migration is deterministic, so the server's and the browser's reads agree.
    expect(parseDraftEnvelope(version2EnvelopeOf(current, 4))).toEqual(parsed)
  })
})
