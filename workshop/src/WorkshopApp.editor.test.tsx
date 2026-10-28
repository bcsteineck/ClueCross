// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import type { MemoryDraftStore } from '../server/draft/memoryDraftStore'
import { dogsBatch, envelopeOf, savedEntry, savedIdOf } from '../server/draft/testDrafts'
import type { DraftClient } from './draft/draftClient'
import { createEditedVersion } from './editor/editedCandidate'
import { suggestionCount } from './editor/editorLayout'
import type { EditorWord } from './editor/editorLayout'
import type { PublishingClient } from './publishing/publishingClient'
import { editorHash } from './shell/useWorkspaceRoute'
import { createInitialWorkshopState, workshopReducer } from './state/workshopReducer'
import type { SavedCandidate, WorkshopAction, WorkshopDraft } from './state/workshopReducer'
import { WorkshopApp } from './WorkshopApp'

// Phase 3: the Manual Editor, end to end through WorkshopApp and a real
// in-memory draft endpoint. The edited version under test has a small,
// known layout (CAT across, TIE down through its T) so cells can be named;
// placement rules themselves are covered in editor/editorLayout.test.ts.

const WAIT = { timeout: 3000 }
const EDIT_ID = 'edit-under-test'
const layoutStyle = document.createElement('style')

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  layoutStyle.textContent = ''
  document.head.append(layoutStyle)
})
afterEach(() => {
  cleanup()
  layoutStyle.remove()
  vi.restoreAllMocks()
})

const word = (id: string, text: string, direction: 'across' | 'down', x: number, y: number): EditorWord => ({
  id,
  word: text,
  direction,
  start: { x, y },
})
// CAT across from row 3, column 3; TIE down through its T (row 3, column 5).
const CAT = word('w1', 'CAT', 'across', 2, 2)
const TIE = word('w2', 'TIE', 'down', 4, 2)
const POOL = ['CAT', 'TIE', 'EAT', 'DOG'].map((each) => ({ word: each, source: 'pool' as const }))

/** Saved A and B (generated), and an edited version of A with the CAT/TIE layout. */
function editorDraft(extra: (edited: SavedCandidate) => WorkshopAction[] = () => []): WorkshopDraft {
  const batch = dogsBatch()
  const base = [
    { type: 'SET_CLUE', clue: 'Dogs' },
    { type: 'SAVE_CANDIDATE', saved: savedEntry(batch.candidates[0], 1) },
    { type: 'SAVE_CANDIDATE', saved: savedEntry(batch.candidates[1], 2) },
  ] satisfies WorkshopAction[]
  const state = base.reduce(workshopReducer, createInitialWorkshopState())
  const edited = createEditedVersion(state.draft.savedCandidates[0], {
    id: EDIT_ID,
    savedAt: '2026-10-27T10:00:00.000Z',
    saved: state.draft.savedCandidates,
    sourceIndex: 0,
    priorityWords: [],
  })!
  const small = { words: [CAT, TIE], pool: POOL }
  const withSmall: SavedCandidate = { ...edited, edit: { ...edited.edit!, ...small, baseline: small.words } }
  const actions: WorkshopAction[] = [
    { type: 'CREATE_EDITED_CANDIDATE', saved: withSmall },
    { type: 'UPDATE_EDITED_LAYOUT', id: EDIT_ID, layout: small },
    ...extra(withSmall),
  ]
  return actions.reduce(workshopReducer, state).draft
}

function controllableDrafts(store: MemoryDraftStore) {
  const inner = memoryDraftClient(store)
  let failing = false
  const client: DraftClient = {
    load: () => inner.load(),
    async save(request, options) {
      if (failing) return { ok: false }
      return inner.save(request, options)
    },
  }
  return { client, fail: (value: boolean) => (failing = value) }
}

function publisher(): PublishingClient {
  return {
    preview: vi.fn(async () => ({ ok: true as const, body: { status: 'not-configured' as const, message: 'Not configured.' } })),
    publish: vi.fn(async () => ({ ok: true as const, body: { status: 'not-configured' as const, message: 'Not configured.' } })),
  }
}

function renderApp({ draft = editorDraft(), hash = editorHash(EDIT_ID), store: given }: { draft?: WorkshopDraft; hash?: string; store?: MemoryDraftStore } = {}) {
  window.history.replaceState(null, '', `/${hash}`)
  const store = given ?? createMemoryDraftStore({ kind: 'ok', envelope: envelopeOf(draft) })
  const drafts = controllableDrafts(store)
  const user = userEvent.setup()
  const view = render(<WorkshopApp drafts={drafts.client} publisher={publisher()} production={null} />)
  return { user, store, drafts, view }
}

function saved(store: MemoryDraftStore): WorkshopDraft {
  const current = store.current()
  if (current.kind !== 'ok') throw new Error('nothing saved')
  return current.envelope.draft
}
const savedVersion = (store: MemoryDraftStore, id = EDIT_ID) => saved(store).savedCandidates.find((entry) => entry.id === id)

const board = () => screen.getByRole('grid')
const cell = (row: number, column: number) => within(board()).getByRole('button', { name: new RegExp(`^row ${row}, column ${column},`) })
const placed = () => within(screen.getByRole('region', { name: /^Placed words/ }))
const unused = () => within(screen.getByRole('region', { name: /^Unused words/ }))
const placedWords = () => placed().queryAllByRole('button').map((button) => button.querySelector('.ws-editor__word-text')?.textContent)
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const status = () => screen.getAllByRole('status').map((element) => element.textContent).join(' ')

async function openEditor() {
  await screen.findByRole('grid', {}, WAIT)
}

async function savedToDisk(store: MemoryDraftStore, check: (draft: WorkshopDraft) => boolean) {
  await waitFor(() => expect(check(saved(store))).toBe(true), WAIT)
}

describe('Editor: opening edited versions', () => {
  it('Edit Candidate on a generated candidate saves a new edited copy, then opens it; the original is unchanged', async () => {
    const { user, store } = renderApp({ hash: '#/candidates' })
    await user.click(await screen.findByRole('tab', { name: /^Saved Candidates/ }, WAIT))
    const cards = within(screen.getByRole('region', { name: /^Saved Candidates/ })).getAllByRole('button')
    await user.click(cards[1])
    const before = structuredClone(saved(store).savedCandidates[1])
    await user.click(button('Edit Candidate'))

    await openEditor()
    expect(screen.getByRole('heading', { level: 2, name: /Candidate 2 — Edit 1/ })).toBeTruthy()
    const created = saved(store).savedCandidates.at(-1)!
    expect(window.location.hash).toBe(editorHash(created.id))
    expect(created.edit).toMatchObject({ sourceId: savedIdOf(dogsBatch().candidates[1]), editNumber: 1 })
    expect(saved(store).savedCandidates[1]).toEqual(before)
    expect(saved(store).savedCandidates).toHaveLength(4)
  })

  it('reopens an unapproved edited version as it is (no new copy), and Back selects it in Saved Candidates', async () => {
    const { user, store } = renderApp({ hash: '#/candidates' })
    await user.click(await screen.findByRole('tab', { name: /^Saved Candidates/ }, WAIT))
    const cards = within(screen.getByRole('region', { name: /^Saved Candidates/ })).getAllByRole('button')
    expect(cards[2].textContent).toMatch(/Candidate 1 — Edit 1.*Edited/)
    await user.click(cards[2])
    await user.click(button('Continue Editing'))
    await openEditor()
    expect(window.location.hash).toBe(editorHash(EDIT_ID))
    expect(saved(store).savedCandidates).toHaveLength(3)

    // An unfinished operation ends with the Editor; nothing is saved for it.
    await user.click(unused().getByRole('button', { name: /^EAT/ }))
    const writes = store.writes.length
    await user.click(button('Back to Saved Candidates'))
    expect(window.location.hash).toBe('#/candidates')
    expect(screen.getByRole('region', { name: /^Selected Candidate 1 — Edit 1/ })).toBeTruthy()
    expect(store.writes.length).toBe(writes)
    expect(savedVersion(store)!.edit!.words).toEqual([CAT, TIE])
  })

  it('loads directly from its route, survives a refresh, and follows Back/Forward', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(unused().getByRole('button', { name: /^EAT/ }))
    await user.click(cell(5, 5))
    await savedToDisk(store, (draft) => draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.edit!.words.length === 3)

    // A refresh: the same version, with its edit.
    cleanup()
    renderApp({ store, hash: editorHash(EDIT_ID) })
    await openEditor()
    expect(placedWords()).toEqual(['CAT', 'EAT', 'TIE'])

    // Back from another workspace returns to the Editor.
    window.location.hash = '#/final'
    await screen.findByRole('heading', { name: 'Final Puzzle' })
    act(() => window.history.back())
    await openEditor()
  })

  it('shows a way back when the route names a candidate that no longer exists', async () => {
    const { user } = renderApp({ hash: editorHash('gone') })
    expect(await screen.findByText('This edited candidate no longer exists.', {}, WAIT)).toBeTruthy()
    await user.click(button('Go to Saved Candidates'))
    expect(window.location.hash).toBe('#/candidates')
    expect(screen.getByRole('tab', { name: /^Saved Candidates/ }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Editor: selecting and placing', () => {
  it('selects from the board and the list, toggling at an intersection, without an Undo step', async () => {
    const { user } = renderApp()
    await openEditor()
    await user.click(cell(3, 5)) // CAT’s T, TIE’s first letter
    expect(placed().getByRole('button', { name: /CAT/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Selected: CAT' })).toBeTruthy()
    await user.click(cell(3, 5))
    expect(screen.getByRole('heading', { name: 'Selected: TIE' })).toBeTruthy()
    expect(cell(4, 5).getAttribute('aria-label')).toMatch(/in the selected word/)
    await user.click(placed().getByRole('button', { name: /CAT/ }))
    expect(screen.getByRole('heading', { name: 'Selected: CAT' })).toBeTruthy()
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true')
  })

  it('adds a word at a suggested intersection, showing counts and crossings first', async () => {
    const { user, store } = renderApp()
    await openEditor()
    const count = suggestionCount([CAT, TIE], 'EAT')
    expect(unused().getByRole('button', { name: /^EAT/ }).textContent).toMatch(`${count} placement`)
    await user.click(unused().getByRole('button', { name: /^EAT/ }))
    expect(screen.getByRole('heading', { name: 'Placing EAT' })).toBeTruthy()
    expect(status()).toMatch(/1 suggested position Across/)
    // Hovering previews it, with how many words it crosses.
    await user.hover(cell(5, 5))
    expect(screen.getByText(/✓ EAT Across at row 5, column 5 fits · crosses 1 word/)).toBeTruthy()
    expect(cell(5, 5).getAttribute('aria-label')).toMatch(/suggested start, EAT Across fits starting here, crossing 1 letter/)
    await user.keyboard('d')
    expect(screen.getByRole('button', { name: 'Down (D)' }).getAttribute('aria-pressed')).toBe('true')
    expect(status()).toMatch(/No connected Down positions for EAT/)
    await user.keyboard('a')
    await user.click(cell(5, 5))
    expect(placedWords()).toEqual(['CAT', 'EAT', 'TIE'])
    expect(placed().getByRole('button', { name: /EAT/ }).textContent).toMatch(/3 Across/)
    await savedToDisk(store, (draft) => draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.edit!.words.length === 3)
  })

  it('explains an invalid placement and changes nothing', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(unused().getByRole('button', { name: /^DOG/ }))
    const writes = store.writes.length
    await user.click(cell(4, 3)) // right under CAT’s C, beside TIE’s I
    expect(status()).toMatch(/DOG would .* Nothing was changed\./)
    expect(placedWords()).toEqual(['CAT', 'TIE'])
    expect(store.writes.length).toBe(writes)
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true')
  })

  it('places a word by hand away from the others (disconnected), saving it with a blocking issue', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(unused().getByRole('button', { name: /^DOG/ }))
    expect(status()).toMatch(/No connected Across positions for DOG. You can still place it by hand/)
    await user.click(cell(10, 8))
    expect(placedWords()).toEqual(['CAT', 'DOG', 'TIE'])
    expect(screen.getByText(/The words form 2 separate groups/)).toBeTruthy()
    await savedToDisk(store, (draft) => draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.edit!.words.length === 3)
  })

  it('moves a word, turning it, and Escape cancels a separate unfinished move', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(placed().getByRole('button', { name: /TIE/ }))
    await user.click(button('Move Word'))
    expect(screen.getByRole('heading', { name: 'Moving TIE' })).toBeTruthy()
    await user.keyboard('{Escape}')
    expect(status()).toMatch(/Canceled. Nothing was changed./)
    expect(savedVersion(store)!.edit!.words).toEqual([CAT, TIE])

    // TIE is still selected.
    await user.click(button('Move Word'))
    await user.click(screen.getByRole('button', { name: 'Across (A)' }))
    await user.click(cell(8, 2))
    expect(placed().getByRole('button', { name: /TIE/ }).textContent).toMatch(/Across/)
    await savedToDisk(store, (draft) =>
      draft.savedCandidates
        .find((entry) => entry.id === EDIT_ID)!
        .edit!.words.some((each) => each.word === 'TIE' && each.direction === 'across' && each.start.x === 1 && each.start.y === 7),
    )
  })

  it('replaces and removes words, returning them to the unused list', async () => {
    const { user } = renderApp()
    await openEditor()
    await user.click(placed().getByRole('button', { name: /CAT/ }))
    await user.click(button('Replace Word'))
    await user.click(unused().getByRole('button', { name: /^DOG/ }))
    expect(status()).toMatch(/would put G where T already is.*Nothing was changed/)
    await user.click(screen.getByRole('textbox', { name: 'New answer' }))
    await user.keyboard('Bat')
    await user.click(button('Add and Replace'))
    expect(placedWords()).toEqual(['BAT', 'TIE'])
    expect(unused().getByRole('button', { name: /^CAT/ })).toBeTruthy()

    await user.click(placed().getByRole('button', { name: /TIE/ }))
    await user.keyboard('{Delete}')
    expect(placedWords()).toEqual(['BAT'])
    expect(unused().getByRole('button', { name: /^TIE/ })).toBeTruthy()
    expect(screen.getByText(/Only one word is placed/)).toBeTruthy()
  })

  it('adds a manually entered word to this version’s pool only, where it persists and stays reusable', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'New answer' }), 'Snoot')
    await user.click(button('Add Word'))
    expect(screen.getByRole('heading', { name: 'Placing SNOOT' })).toBeTruthy()
    await user.keyboard('{Escape}')
    const manual = unused().getByRole('button', { name: /^SNOOT/ })
    expect(manual.textContent).toMatch(/Manually Added/)
    await savedToDisk(store, (draft) =>
      draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.edit!.pool.some((each) => each.word === 'SNOOT' && each.source === 'manual'),
    )
    expect(saved(store).poolText).toBe('')
    await user.type(screen.getByRole('textbox', { name: 'New answer' }), 'snoot')
    await user.click(button('Add Word'))
    expect(screen.getByRole('alert').textContent).toBe('SNOOT is already in this candidate’s word pool.')
  })
})

describe('Editor: history, shortcuts, and views', () => {
  it('undoes and redoes each operation, by button and shortcut, but never while typing', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(unused().getByRole('button', { name: /^EAT/ }))
    await user.click(cell(5, 5))
    await user.click(placed().getByRole('button', { name: /CAT/ }))
    await user.click(button('Remove Word'))
    expect(placedWords()).toEqual(['EAT', 'TIE'])

    await user.keyboard('{Control>}z{/Control}')
    expect(placedWords()).toEqual(['CAT', 'EAT', 'TIE'])
    await user.click(button('Undo'))
    expect(placedWords()).toEqual(['CAT', 'TIE'])
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}')
    expect(placedWords()).toEqual(['CAT', 'EAT', 'TIE'])
    await savedToDisk(store, (draft) => draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.edit!.words.length === 3)

    // In the search field, keys are typing: no undo, no direction change, no removal.
    const search = screen.getByRole('searchbox', { name: 'Search unused words' })
    await user.click(search)
    await user.keyboard('do{Backspace}{Control>}z{/Control}')
    expect((search as HTMLInputElement).value).toBe('d')
    expect(placedWords()).toEqual(['CAT', 'EAT', 'TIE'])
    expect(unused().getAllByRole('button').flatMap((each) => each.querySelector('.ws-editor__word-text')?.textContent ?? [])).toEqual(['DOG'])
  })

  it('a new edit after Undo clears Redo', async () => {
    const { user } = renderApp()
    await openEditor()
    await user.click(placed().getByRole('button', { name: /TIE/ }))
    await user.click(button('Remove Word'))
    await user.click(button('Undo'))
    expect(button('Redo').getAttribute('aria-disabled')).toBe('false')
    await user.click(placed().getByRole('button', { name: /CAT/ }))
    await user.click(button('Remove Word'))
    expect(button('Redo').getAttribute('aria-disabled')).toBe('true')
  })

  it('resets the layout after confirmation (one Undo step), keeping manually added words', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'New answer' }), 'gnat')
    await user.click(button('Add Word'))
    await user.click(cell(1, 3)) // GNAT across on row 1, apart from the others
    await user.click(placed().getByRole('button', { name: /CAT/ }))
    await user.click(button('Remove Word'))

    await user.click(button('Reset Layout'))
    const confirm = screen.getByRole('group', { name: 'Reset the layout?' })
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: 'Reset the layout?' })).toBeNull()
    expect(document.activeElement).toBe(button('Reset Layout'))

    await user.click(button('Reset Layout'))
    await user.click(within(screen.getByRole('group', { name: 'Reset the layout?' })).getByRole('button', { name: 'Reset Layout' }))
    expect(placedWords()).toEqual(['CAT', 'TIE'])
    expect(unused().getByRole('button', { name: /^GNAT/ }).textContent).toMatch(/Manually Added/)
    await savedToDisk(store, (draft) => {
      const version = draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!
      return version.edit!.words.length === 2 && version.edit!.pool.some((each) => each.word === 'GNAT')
    })
    expect(screen.getByRole('heading', { level: 2, name: /Candidate 1 — Edit 1/ })).toBeTruthy()

    await user.click(button('Undo'))
    expect(placedWords()).not.toContain('CAT')
  })

  it('shows the original layout read-only, without saving or an Undo step', async () => {
    const { user, store } = renderApp()
    await openEditor()
    const writes = store.writes.length
    await user.click(button('Original'))
    expect(screen.getByText('Viewing the original generated layout (read-only).')).toBeTruthy()
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByRole('img', { name: /^Original layout of Candidate 1/ })).toBeTruthy()
    await user.keyboard('{Control>}z{/Control}')
    await user.click(button('Current'))
    expect(placedWords()).toEqual(['CAT', 'TIE'])
    expect(store.writes.length).toBe(writes)
  })
})

describe('Editor: versions', () => {
  it('Save as New Candidate switches to an independent copy only once it’s written, with fresh history', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(placed().getByRole('button', { name: /TIE/ }))
    await user.click(button('Remove Word'))
    await user.click(button('Save as New Candidate'))
    await screen.findByRole('heading', { level: 2, name: /Candidate 1 — Edit 2/ }, WAIT)
    const copy = saved(store).savedCandidates.at(-1)!
    expect(window.location.hash).toBe(editorHash(copy.id))
    expect(copy.edit).toMatchObject({ parentId: EDIT_ID, baseline: [CAT] })
    expect(copy.publication).toBeNull()
    expect(button('Undo').getAttribute('aria-disabled')).toBe('true')
    // Both versions are kept, each its own.
    expect(savedVersion(store)!.edit!.words).toEqual([CAT])

    // Reset in the copy returns to where the copy started.
    await user.click(unused().getByRole('button', { name: /^TIE/ }))
    await user.keyboard('d')
    await user.click(cell(3, 5))
    await user.click(button('Reset Layout'))
    await user.click(within(screen.getByRole('group', { name: 'Reset the layout?' })).getByRole('button', { name: 'Reset Layout' }))
    expect(placedWords()).toEqual(['CAT'])
  })

  it('stays on the current version, with an error, when the new one can’t be saved', async () => {
    const { user, store, drafts } = renderApp()
    await openEditor()
    drafts.fail(true)
    await user.click(button('Save as New Candidate'))
    expect((await screen.findByText(/Not saved as a new candidate/, {}, WAIT)).getAttribute('role')).toBe('alert')
    expect(window.location.hash).toBe(editorHash(EDIT_ID))
    expect(screen.getByRole('heading', { level: 2, name: /Candidate 1 — Edit 1/ })).toBeTruthy()
    expect(saved(store).savedCandidates).toHaveLength(3)
    // A failed autosave is shown, and the edit kept in the window.
    await user.click(placed().getByRole('button', { name: /TIE/ }))
    await user.click(button('Remove Word'))
    expect(await screen.findByText(/Draft not saved\./, {}, WAIT)).toBeTruthy()
    expect(placedWords()).toEqual(['CAT'])
    drafts.fail(false)
    await user.click(button('Retry Saving'))
    await savedToDisk(store, (draft) => draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.edit!.words.length === 1)
  })

  it('renames a version; the name persists', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Tight corner')
    expect(screen.getByRole('heading', { level: 2, name: /Tight corner/ })).toBeTruthy()
    await savedToDisk(store, (draft) => draft.savedCandidates.find((entry) => entry.id === EDIT_ID)!.name === 'Tight corner')
  })

  it('opens an approved version read-only, offering a new copy instead', async () => {
    const { user, store } = renderApp({ draft: editorDraft(() => [{ type: 'APPROVE_SAVED_CANDIDATE', id: EDIT_ID }]) })
    expect(await screen.findByText(/It’s the approved Final Puzzle/, {}, WAIT)).toBeTruthy()
    expect(screen.queryByRole('grid')).toBeNull()
    await user.click(button('Edit a New Copy'))
    await openEditor()
    const copy = saved(store).savedCandidates.at(-1)!
    expect(copy.id).not.toBe(EDIT_ID)
    expect(saved(store).finalPuzzle?.savedId).toBe(EDIT_ID)
  })

  it('is read-only on a narrow screen, with the board, words, and validation', async () => {
    layoutStyle.textContent = '.ws-editor { --ws-editor-layout: readonly; }'
    renderApp()
    expect(await screen.findByText(/Editing a crossword needs a larger screen/, {}, WAIT)).toBeTruthy()
    expect(screen.queryByRole('grid')).toBeNull()
    expect(screen.getByRole('img', { name: /Candidate 1 — Edit 1, 12 by 12 board: 1 Across: CAT/ })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: /^Placed words/ })).getByText('CAT')).toBeTruthy()
    expect(screen.getByText('No blocking issues.', { selector: 'strong' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(button('Back to Saved Candidates')).toBeTruthy()
  })
})

describe('Saved Candidates: edited versions', () => {
  async function openSaved(user: ReturnType<typeof userEvent.setup>, index: number) {
    await user.click(await screen.findByRole('tab', { name: /^Saved Candidates/ }, WAIT))
    await user.click(within(screen.getByRole('region', { name: /^Saved Candidates/ })).getAllByRole('button')[index])
  }

  it('blocks approving an incomplete edited version, listing why, and approves a valid one', async () => {
    const disconnected = editorDraft(() => [
      { type: 'UPDATE_EDITED_LAYOUT', id: EDIT_ID, layout: { words: [CAT, TIE, word('w3', 'DOG', 'across', 8, 9)], pool: POOL } },
    ])
    const { user } = renderApp({ draft: disconnected, hash: '#/candidates' })
    await openSaved(user, 2)
    const approve = button('Approve as Final Puzzle')
    expect(approve.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/Can’t be approved yet/).closest('div')!.textContent).toMatch(/separate groups/)
    await user.click(approve)
    expect(window.location.hash).toBe('#/candidates')

    cleanup()
    const ready = renderApp({ hash: '#/candidates' })
    await openSaved(ready.user, 2)
    await ready.user.click(button('Approve as Final Puzzle'))
    expect(window.location.hash).toBe('#/final')
    expect(screen.getByText('Approved Candidate 1 — Edit 1')).toBeTruthy()
    await savedToDisk(ready.store, (draft) => draft.finalPuzzle?.savedId === EDIT_ID)
  })

  it('deletes only the chosen edited version, after confirming', async () => {
    const branch = (edited: SavedCandidate): WorkshopAction[] => [
      { type: 'CREATE_EDITED_CANDIDATE', saved: { ...edited, id: 'edit-branch', edit: { ...edited.edit!, parentId: EDIT_ID, editNumber: 2 } } },
    ]
    const { user, store } = renderApp({ draft: editorDraft(branch), hash: '#/candidates' })
    await openSaved(user, 2)
    await user.click(button('Delete Version'))
    const confirm = screen.getByRole('group', { name: 'Delete this edited version?' })
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))
    await user.click(within(confirm).getByRole('button', { name: 'Delete Version' }))
    await savedToDisk(store, (draft) => !draft.savedCandidates.some((entry) => entry.id === EDIT_ID))
    expect(saved(store).savedCandidates.map((entry) => entry.id)).toEqual([
      savedIdOf(dogsBatch().candidates[0]),
      savedIdOf(dogsBatch().candidates[1]),
      'edit-branch',
    ])
  })

  it('New Puzzle clears edited versions too', async () => {
    const { user, store } = renderApp()
    await openEditor()
    await user.click(button('New Puzzle'))
    await user.click(button('Start New Puzzle'))
    await screen.findByRole('heading', { name: 'Author' }, WAIT)
    expect(saved(store).savedCandidates).toEqual([])
    window.location.hash = editorHash(EDIT_ID)
    expect(await screen.findByText('This edited candidate no longer exists.', {}, WAIT)).toBeTruthy()
  })
})
