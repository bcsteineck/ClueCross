// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import type { MemoryDraftStore } from '../server/draft/memoryDraftStore'
import type { DraftReadResult } from '../server/draft/draftStore'
import { dogsBatch, envelopeOf, fullDraft } from '../server/draft/testDrafts'
import { candidateFingerprint } from './candidateFingerprint'
import type { DraftClient } from './draft/draftClient'
import type { PublishingClient } from './publishing/publishingClient'
import type { WorkshopDraft } from './state/workshopReducer'
import { WorkshopApp } from './WorkshopApp'

// Phase 2d: Current Batch -> Saved Candidates -> Final Puzzle, on the wide
// layout (the narrow screens are covered in WorkshopApp.mobileCandidates).
// Saves go through a real in-memory draft endpoint that tests can hold or
// fail, to check that "Saved" only ever follows a durable write.

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SAVE_WAIT = { timeout: 3000 }

// A draft client whose saves can be held (to see the in-between state) or fail.
function controllableDrafts(store: MemoryDraftStore) {
  const inner = memoryDraftClient(store)
  let held: Promise<void> | null = null
  let release = () => {}
  let failing = false
  const client: DraftClient = {
    load: () => inner.load(),
    async save(request, options) {
      if (held) await held
      if (failing) return { ok: false }
      return inner.save(request, options)
    },
  }
  return {
    client,
    hold() {
      held = new Promise((resolve) => (release = resolve))
    },
    release() {
      held = null
      release()
    },
    fail(value: boolean) {
      failing = value
    },
  }
}

function publisher(): PublishingClient {
  return {
    preview: vi.fn(async () => ({ ok: true as const, body: { status: 'not-configured' as const, message: 'Not configured.' } })),
    publish: vi.fn(async () => ({ ok: true as const, body: { status: 'not-configured' as const, message: 'Not configured.' } })),
  }
}

function renderApp({ store: given, initial }: { store?: MemoryDraftStore; initial?: DraftReadResult } = {}) {
  const store = given ?? createMemoryDraftStore(initial)
  const drafts = controllableDrafts(store)
  const user = userEvent.setup()
  const view = render(<WorkshopApp drafts={drafts.client} publisher={publisher()} production={null} />)
  return { user, drafts, view, store }
}

function savedDraft(store: MemoryDraftStore): WorkshopDraft {
  const current = store.current()
  if (current.kind !== 'ok') throw new Error(`no saved draft (${current.kind})`)
  return current.envelope.draft
}

async function generate(user: ReturnType<typeof userEvent.setup>, clue = 'Dogs') {
  await screen.findByLabelText('Clue')
  await user.type(screen.getByLabelText('Clue'), clue)
  await user.click(screen.getByLabelText('Candidate words'))
  await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
  await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
  await screen.findByRole('region', { name: /Generated Candidates/ })
}

const tab = (name: 'Current Batch' | 'Saved Candidates') => screen.getByRole('tab', { name: new RegExp(`^${name}`) })
const batchCards = () => within(screen.getByRole('region', { name: /Generated Candidates/ })).getAllByRole('button')
const savedCards = () => within(screen.getByRole('region', { name: /^Saved Candidates/ })).getAllByRole('button')
const inspector = () => screen.getByRole('region', { name: /^Selected Candidate/ })
const saveAction = () => within(inspector()).getByRole('button', { name: /^(Save Candidate|Saving…|Saved|Approved)$/ })
// The button's text without its decorative (aria-hidden) check mark.
const label = (element: HTMLElement) => (element.textContent ?? '').replace(/^✓ /, '')

async function saveCard(user: ReturnType<typeof userEvent.setup>, index: number) {
  await user.click(batchCards()[index])
  await user.click(saveAction())
  await waitFor(() => expect(saveAction().textContent).toMatch(/Saved/), SAVE_WAIT)
}

describe('Save Candidate', () => {
  it('reads Saving… until the draft is written, then Saved, keeping the batch, selection, and workspace', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await user.click(batchCards()[2])
    drafts.hold()
    await user.click(saveAction())

    expect(label(saveAction())).toBe('Saving…')
    expect(saveAction().getAttribute('aria-disabled')).toBe('true')
    expect(batchCards()[2].textContent).toMatch('Saving…')
    // Not counted (or listed) as saved until it's written.
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (0)')
    expect(window.location.hash).toBe('#/candidates')

    drafts.release()
    await waitFor(() => expect(label(saveAction())).toBe('Saved'), SAVE_WAIT)
    expect(savedDraft(store).savedCandidates.map((saved) => saved.origin.number)).toEqual([3])
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (1)')
    expect(batchCards()).toHaveLength(20)
    expect(batchCards()[2].getAttribute('aria-pressed')).toBe('true')
    expect(batchCards()[2].textContent).toMatch('Saved')
    expect(document.activeElement).toBe(saveAction())
    expect(screen.getByText('Candidate 3 saved.')).toBeTruthy()
  })

  it('a failed save never shows Saved: it is undone, explained, and can be tried again', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await waitFor(() => expect(savedDraft(store).generationCount).toBe(1), SAVE_WAIT)
    await user.click(batchCards()[0])
    drafts.fail(true)
    await user.click(saveAction())
    const alert = await within(inspector()).findByRole('alert', {}, SAVE_WAIT)
    expect(alert.textContent).toMatch('Not saved: Couldn’t reach the Workshop server. Try again.')
    expect(label(saveAction())).toBe('Save Candidate')
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (0)')
    expect(savedDraft(store).savedCandidates).toEqual([])

    drafts.fail(false)
    await user.click(saveAction())
    await waitFor(() => expect(label(saveAction())).toBe('Saved'), SAVE_WAIT)
    expect(within(inspector()).queryByRole('alert')).toBeNull()
    expect(savedDraft(store).savedCandidates).toHaveLength(1)
  })

  it('rapid repeated clicks save once', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await user.click(batchCards()[1])
    drafts.hold()
    const button = saveAction()
    await user.click(button)
    await user.click(button)
    await user.dblClick(button)
    drafts.release()
    await waitFor(() => expect(label(saveAction())).toBe('Saved'), SAVE_WAIT)
    expect(savedDraft(store).savedCandidates).toHaveLength(1)
  })

  it('a save and authoring edits made while it is being written both land', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await user.click(batchCards()[4])
    drafts.hold()
    await user.click(saveAction())
    await user.click(screen.getByRole('link', { name: 'Author' }))
    await user.type(screen.getByLabelText('Clue'), ' and pups')
    await user.click(screen.getByRole('checkbox', { name: 'BEAGLE' }))
    drafts.release()
    await waitFor(
      () =>
        expect(savedDraft(store)).toMatchObject({
          clue: 'Dogs and pups',
          priorityWords: { manual: ['BEAGLE'] },
          savedCandidates: [{ origin: { number: 5 } }],
        }),
      SAVE_WAIT,
    )
  })

  it('keeps New Puzzle and leaving the page waiting while a save is unfinished', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await user.click(batchCards()[0])
    drafts.hold()
    await user.click(saveAction())

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: 'New Puzzle' }))
    const start = screen.getByRole('button', { name: 'Start New Puzzle' })
    expect(start.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Wait for the candidate being saved or removed to finish.')).toBeTruthy()
    await user.click(start)
    expect(window.location.hash).toBe('#/candidates')
    expect(screen.getByRole('group', { name: 'Start a new puzzle?' })).toBeTruthy()

    drafts.release()
    await waitFor(() => expect(start.getAttribute('aria-disabled')).toBeNull(), SAVE_WAIT)
    const after = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(after)
    expect(after.defaultPrevented).toBe(false)

    // Now New Puzzle clears the shortlist too, durably, and nothing brings it back.
    await user.click(start)
    await waitFor(() => expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe(''), SAVE_WAIT)
    expect(savedDraft(store).savedCandidates).toEqual([])
    await user.click(screen.getByRole('link', { name: 'Candidates' }))
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (0)')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(savedDraft(store).savedCandidates).toEqual([])
  })

  it('recognizes a layout already saved from an earlier batch, whatever the clue: Saved or Approved, never saved twice', async () => {
    // The saved draft holds candidates 1 and 2 of Dogs batch 1 (2 approved);
    // with the count reset, the next Generate finds the same batch again.
    const draft = {
      ...fullDraft(),
      poolSource: 'manual' as const,
      priorityWords: { manual: [], sourced: [] },
      generationCount: 0,
      clue: '',
      poolText: '',
    }
    const { user, store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(draft) } })
    await generate(user, 'Puppies')
    expect(batchCards()[0].textContent).toMatch('Saved')
    expect(batchCards()[1].textContent).toMatch('Approved')
    await user.click(batchCards()[0])
    expect(label(saveAction())).toBe('Saved')
    expect(saveAction().getAttribute('aria-disabled')).toBe('true')
    await user.click(saveAction())
    await user.click(batchCards()[1])
    expect(label(saveAction())).toBe('Approved')
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (2)')
    // Saving a new one appends it after them.
    await saveCard(user, 5)
    expect(savedDraft(store).savedCandidates.map((saved) => saved.fingerprint)).toEqual(
      [0, 1, 5].map((index) => candidateFingerprint(dogsBatch().candidates[index])),
    )
  })
})

describe('Saved Candidates', () => {
  it('starts on the oldest saved candidate, and each tab remembers its own selection', async () => {
    const { user } = renderApp()
    await generate(user)
    await saveCard(user, 3)
    await saveCard(user, 0)
    await saveCard(user, 8)
    await user.click(batchCards()[12])

    await user.click(tab('Saved Candidates'))
    expect(savedCards().map((card) => card.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    expect(inspector().textContent).toMatch('Saved fromCandidate 4 of workshop-generation-1 (clue “Dogs”)')
    await user.click(savedCards()[2])
    await user.click(tab('Current Batch'))
    expect(batchCards()[12].getAttribute('aria-pressed')).toBe('true')
    await user.click(tab('Saved Candidates'))
    expect(savedCards()[2].getAttribute('aria-pressed')).toBe('true')
  })

  it('tabs follow the ARIA pattern: one tab stop, arrow keys switch', async () => {
    const { user } = renderApp()
    await generate(user)
    tab('Current Batch').focus()
    expect(tab('Saved Candidates').getAttribute('tabindex')).toBe('-1')
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tab('Saved Candidates'))
    expect(tab('Saved Candidates').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('ws-tab-saved')
    await user.keyboard('{ArrowLeft}')
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
  })

  it('an empty shortlist explains itself and leads back to Current Batch', async () => {
    const { user } = renderApp()
    await generate(user)
    await user.click(tab('Saved Candidates'))
    expect(screen.getByText('No saved candidates yet')).toBeTruthy()
    expect(screen.getByText('Save promising layouts from Current Batch to compare them here.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'View Current Batch' }))
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Current Batch'))
  })

  it('removes an unapproved candidate once written, selecting the next, and it can be saved again', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await saveCard(user, 1)
    await saveCard(user, 2)
    await saveCard(user, 3)
    await user.click(tab('Saved Candidates'))
    await user.click(savedCards()[1])

    drafts.hold()
    await user.click(within(inspector()).getByRole('button', { name: 'Remove from Saved' }))
    // Still listed (and counted) until the removal is written.
    expect(within(inspector()).getByRole('button', { name: 'Removing…' }).getAttribute('aria-disabled')).toBe('true')
    expect(within(inspector()).getByRole('button', { name: 'Approve as Final Puzzle' }).getAttribute('aria-disabled')).toBe('true')
    expect(savedCards()).toHaveLength(3)
    drafts.release()

    await waitFor(() => expect(savedCards()).toHaveLength(2), SAVE_WAIT)
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (2)')
    expect(savedDraft(store).savedCandidates.map((saved) => saved.origin.number)).toEqual([2, 4])
    // The candidate now in its place is selected, and focus is on its card.
    expect(inspector().textContent).toMatch('Candidate 4 of workshop-generation-1')
    expect(document.activeElement).toBe(savedCards()[1])
    expect(screen.getByText('Removed from Saved Candidates.')).toBeTruthy()

    await user.click(tab('Current Batch'))
    expect(batchCards()[2].textContent).not.toMatch('Saved')
    await user.click(batchCards()[2])
    expect(label(saveAction())).toBe('Save Candidate')
  })

  it('a failed removal keeps the candidate where it was and explains why', async () => {
    const { user, drafts, store } = renderApp()
    await generate(user)
    await saveCard(user, 1)
    await saveCard(user, 2)
    await user.click(tab('Saved Candidates'))
    drafts.fail(true)
    await user.click(within(inspector()).getByRole('button', { name: 'Remove from Saved' }))
    const alert = await within(inspector()).findByRole('alert', {}, SAVE_WAIT)
    expect(alert.textContent).toMatch('Not removed: Couldn’t reach the Workshop server. Try again.')
    expect(savedCards()).toHaveLength(2)
    expect(savedCards()[0].getAttribute('aria-pressed')).toBe('true')
    expect(savedDraft(store).savedCandidates).toHaveLength(2)
  })

  it('approves with the current Author clue, keeps the snapshot, moves approval, and can clear it', async () => {
    const { user, store } = renderApp()
    await generate(user)
    await saveCard(user, 0)
    await saveCard(user, 6)
    const snapshot = savedDraft(store).savedCandidates
    await user.click(screen.getByRole('link', { name: 'Author' }))
    await user.clear(screen.getByLabelText('Clue'))
    await user.type(screen.getByLabelText('Clue'), 'Good Boys')

    await user.click(screen.getByRole('link', { name: 'Candidates' }))
    // Generate wasn't run again, so the batch is still the "Dogs" one.
    await user.click(tab('Saved Candidates'))
    expect(within(inspector()).getByText(/current Author clue \(“Good Boys”\)/)).toBeTruthy()
    await user.click(within(inspector()).getByRole('button', { name: 'Approve as Final Puzzle' }))
    expect(window.location.hash).toBe('#/final')
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('goodboys')
    expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe('Good Boys')
    await waitFor(() => expect(savedDraft(store).finalPuzzle?.inputs.clue).toBe('Good Boys'), SAVE_WAIT)
    expect(savedDraft(store).savedCandidates).toEqual(snapshot)

    // Approving the other moves the approval with no confirmation; the first stays saved.
    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    await user.click(savedCards()[1])
    await user.click(within(inspector()).getByRole('button', { name: 'Approve as Final Puzzle' }))
    expect(screen.getByRole('heading', { name: /^Final Puzzle/ }).textContent).toMatch('Approved Candidate 2')
    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    expect(savedCards().map((card) => /Approved/.test(card.textContent ?? ''))).toEqual([false, true])
    expect(within(inspector()).queryByRole('button', { name: 'Remove from Saved' })).toBeNull()
    expect(within(inspector()).getByText(/approve another candidate or clear the Final Puzzle first/)).toBeTruthy()

    // Clearing keeps the shortlist; the candidate becomes removable again.
    await user.click(within(inspector()).getByRole('button', { name: 'Open Final Puzzle' }))
    await user.click(screen.getByRole('button', { name: 'Clear Final Puzzle' }))
    expect(screen.getByText(/No Final Puzzle has been approved\./)).toBeTruthy()
    await waitFor(() => expect(savedDraft(store).finalPuzzle).toBeNull(), SAVE_WAIT)
    expect(savedDraft(store).savedCandidates).toHaveLength(2)
    await user.click(screen.getByRole('link', { name: 'Candidates' }))
    expect(savedCards().some((card) => /Approved/.test(card.textContent ?? ''))).toBe(false)
    expect(within(inspector()).getByRole('button', { name: 'Remove from Saved' })).toBeTruthy()
  })

  it('survives authoring changes, a new batch, and a restart, in order', async () => {
    const store = createMemoryDraftStore()
    const first = renderApp({ store })
    await generate(first.user)
    await saveCard(first.user, 9)
    await saveCard(first.user, 4)
    await first.user.click(screen.getByRole('link', { name: 'Author' }))
    await first.user.type(screen.getByLabelText('Clue'), '!')
    await first.user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.getByText(/seed workshop-generation-2/)).toBeTruthy()
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (2)')
    await waitFor(() => expect(savedDraft(store).clue).toBe('Dogs!'), SAVE_WAIT)
    first.view.unmount()

    const second = renderApp({ store })
    await screen.findByRole('link', { name: 'Candidates' })
    await second.user.click(screen.getByRole('link', { name: 'Candidates' }))
    await second.user.click(tab('Saved Candidates'))
    expect(savedCards()).toHaveLength(2)
    expect(inspector().textContent).toMatch('Candidate 10 of workshop-generation-1')
    await second.user.click(savedCards()[1])
    expect(inspector().textContent).toMatch('Candidate 5 of workshop-generation-1')
  })
})
