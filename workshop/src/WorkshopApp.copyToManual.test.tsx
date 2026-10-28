// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import type { MemoryDraftStore } from '../server/draft/memoryDraftStore'
import { envelopeOf, fixtureSourcedPool } from '../server/draft/testDrafts'
import { createInitialWorkshopState, workshopReducer } from './state/workshopReducer'
import type { WorkshopAction, WorkshopDraft } from './state/workshopReducer'
import { copyableSourcedWords } from './sourcing/copyToManual'
import { WorkshopApp } from './WorkshopApp'

// Copy to Manual in the Author workspace: a one-time copy of the included
// sourced words into the manual list, saved like any other edit.

beforeEach(() => window.history.replaceState(null, '', '/#/author'))
afterEach(() => cleanup())

const WAIT = { timeout: 3000 }

function sourcedDraft(poolText = 'Zebra\nlion'): WorkshopDraft {
  const actions: WorkshopAction[] = [
    { type: 'SET_CLUE', clue: 'Dogs' },
    { type: 'SET_POOL_TEXT', poolText },
    { type: 'SET_POOL_SOURCE', poolSource: 'sourced' },
    { type: 'SET_SOURCE_KIND', sourceKind: 'fixture' },
    { type: 'SOURCED_POOL_RECEIVED', pool: fixtureSourcedPool() },
  ]
  return actions.reduce(workshopReducer, createInitialWorkshopState()).draft
}

function renderApp(store: MemoryDraftStore) {
  const user = userEvent.setup()
  render(<WorkshopApp drafts={memoryDraftClient(store)} production={null} />)
  return user
}

function saved(store: MemoryDraftStore): WorkshopDraft {
  const current = store.current()
  if (current.kind !== 'ok') throw new Error('nothing saved')
  return current.envelope.draft
}

const copyButton = () => screen.getByRole('button', { name: 'Copy to Manual' })
const words = copyableSourcedWords(fixtureSourcedPool().candidates)

describe('Copy to Manual', () => {
  it('appends the included sourced words to Manual, stays in Source from clue, and saves', async () => {
    const store = createMemoryDraftStore({ kind: 'ok', envelope: envelopeOf(sourcedDraft()) })
    const user = renderApp(store)
    await user.click(await screen.findByRole('button', { name: 'Copy to Manual' }, WAIT))

    expect(screen.getByText(`${words.length} words added to Manual.`)).toBeTruthy()
    expect((screen.getByLabelText('Source from clue') as HTMLInputElement).checked).toBe(true)
    expect(window.location.hash).toBe('#/author')
    await waitFor(() => expect(saved(store).poolText).toBe(`Zebra\nlion\n${words.join('\n')}`), WAIT)
    // The sourced list and its include choices are untouched.
    expect(saved(store).sourcing.pool).toEqual(fixtureSourcedPool())

    // Again: nothing new to add.
    await user.click(copyButton())
    expect(screen.getByText('All words already exist in Manual.')).toBeTruthy()
    expect(saved(store).poolText).toBe(`Zebra\nlion\n${words.join('\n')}`)
  })

  it('leaves the copied words independent of later sourced changes, editable, and saved across a reload', async () => {
    const store = createMemoryDraftStore({ kind: 'ok', envelope: envelopeOf(sourcedDraft('')) })
    const user = renderApp(store)
    await user.click(await screen.findByRole('button', { name: 'Copy to Manual' }, WAIT))
    // Unchecking a sourced word afterwards doesn't touch Manual.
    await user.click(screen.getByRole('checkbox', { name: `Include ${words[0]}` }))
    await waitFor(() => expect(saved(store).sourcing.pool?.candidates.find((c) => c.sourceAnswer === words[0])?.included).toBe(false), WAIT)
    expect(saved(store).poolText).toBe(words.join('\n'))

    cleanup()
    const again = renderApp(store)
    await again.click(await screen.findByLabelText('Enter manually', {}, WAIT))
    const manual = screen.getByLabelText('Candidate words') as HTMLTextAreaElement
    expect(manual.value).toBe(words.join('\n'))
    // Ordinary manual text: editable like anything typed.
    await again.clear(manual)
    await again.type(manual, 'Corgi')
    await waitFor(() => expect(saved(store).poolText).toBe('Corgi'), WAIT)
    expect(saved(store).sourcing.pool?.candidates.find((c) => c.sourceAnswer === words[1])?.included).toBe(true)
  })

  it('is disabled when no sourced word is included', async () => {
    const none = fixtureSourcedPool().candidates.map((c) => c.id)
    const draft = none.reduce(
      (state, id) => workshopReducer(state, { type: 'SET_CANDIDATE_INCLUDED', id, included: false }),
      { ...createInitialWorkshopState(), draft: sourcedDraft() },
    ).draft
    const store = createMemoryDraftStore({ kind: 'ok', envelope: envelopeOf(draft) })
    renderApp(store)
    const button = await screen.findByRole('button', { name: 'Copy to Manual' }, WAIT)
    expect(button).toHaveProperty('disabled', true)
    expect(within(button.parentElement!).getByText('No included words to copy.')).toBeTruthy()
  })
})
