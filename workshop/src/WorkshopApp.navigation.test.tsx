// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import type { MemoryDraftStore } from '../server/draft/memoryDraftStore'
import { envelopeOf, fullDraft } from '../server/draft/testDrafts'
import type { DraftReadResult } from '../server/draft/draftStore'
import type { ProductionClient } from './production/productionClient'
import type { PublishingClient } from './publishing/publishingClient'
import { WorkshopApp } from './WorkshopApp'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const NOT_CONFIGURED = { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' } as const

function fakePublisher(): PublishingClient & { preview: ReturnType<typeof vi.fn>; publish: ReturnType<typeof vi.fn> } {
  return {
    preview: vi.fn(async () => ({ ok: true as const, body: NOT_CONFIGURED })),
    publish: vi.fn(async () => ({ ok: true as const, body: NOT_CONFIGURED })),
  }
}

function fakeProduction(): ProductionClient {
  return {
    schedule: vi.fn(async () => ({
      ok: true as const,
      body: {
        status: 'ok' as const,
        schedule: {
          asOf: '2026-10-06T16:00:00.000Z',
          entries: [],
          summary: { currentDate: null, lastScheduledDate: null, scheduledCount: 0, filledThrough: null, daysAhead: 0, gaps: [] },
        },
      },
    })),
    previewPublish: vi.fn(),
    publish: vi.fn(),
    previewRemoval: vi.fn(),
    remove: vi.fn(),
  }
}

function renderApp({
  store,
  initial,
  production = null,
  publisher = fakePublisher(),
}: { store?: MemoryDraftStore; initial?: DraftReadResult; production?: ProductionClient | null; publisher?: PublishingClient } = {}) {
  const drafts = store ?? createMemoryDraftStore(initial)
  const user = userEvent.setup()
  const view = render(<WorkshopApp drafts={memoryDraftClient(drafts)} publisher={publisher} production={production} />)
  return { user, store: drafts, publisher, ...view }
}

const nav = () => screen.getByRole('navigation', { name: 'Workshop' })
const workspaceHeading = () => document.querySelector<HTMLElement>('[data-workspace-heading]')

async function goTo(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(within(nav()).getByRole('link', { name: label }))
}

async function fillDogs(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Clue'), 'Dogs')
  await user.click(screen.getByLabelText('Candidate words'))
  await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
}

const cards = () => within(screen.getByRole('region', { name: /Generated Candidates/ })).getAllByRole('button')

describe('workspace routing', () => {
  it('opens Author by default and marks it as the current workspace', async () => {
    renderApp()
    expect((await screen.findByRole('heading', { name: 'Author' })).hasAttribute('data-workspace-heading')).toBe(true)
    expect(window.location.hash).toBe('#/author')
    expect(within(nav()).getByRole('link', { name: 'Author' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav()).getByRole('link', { name: 'Publish' }).getAttribute('aria-current')).toBeNull()
    expect(within(nav()).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Author',
      'Candidates',
      'Final Puzzle',
      'Publish',
    ])
  })

  it('opens the workspace named by the URL, and falls back to Author for unknown routes', async () => {
    window.history.replaceState(null, '', '/#/publish')
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Publish' })).toBeTruthy()
    cleanup()

    window.history.replaceState(null, '', '/#/nowhere')
    const lengthBefore = window.history.length
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Author' })).toBeTruthy()
    expect(window.location.hash).toBe('#/author')
    expect(window.history.length).toBe(lengthBefore) // replaced, not added
  })

  it('follows Back and Forward, moving focus to each workspace heading', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await goTo(user, 'Candidates')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Candidates' }))
    await goTo(user, 'Final Puzzle')
    expect(document.activeElement).toBe(workspaceHeading())

    window.history.back()
    expect(await screen.findByRole('heading', { name: 'Candidates' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Candidates' })))
    window.history.forward()
    expect(await screen.findByText(/No Final Puzzle has been approved\./)).toBeTruthy()
  })

  it('never saves navigation: moving between workspaces writes nothing to the draft', async () => {
    const { user, store } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft(), 4) } })
    await screen.findByRole('heading', { name: 'Author' })
    for (const label of ['Candidates', 'Final Puzzle', 'Publish', 'Author']) await goTo(user, label)
    await new Promise((resolve) => setTimeout(resolve, 900))
    expect(store.writes).toHaveLength(0)
  })
})

describe('state across workspaces', () => {
  it('keeps authoring inputs, the batch, and the selection; nothing regenerates', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await fillDogs(user)
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    // Generating from Author shows the batch in Candidates.
    expect(window.location.hash).toBe('#/candidates')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Candidates' }))
    await user.click(cards()[2])
    const seedLine = screen.getByText(/seed workshop-generation-1/).textContent

    await goTo(user, 'Author')
    expect((screen.getByLabelText('Clue') as HTMLInputElement).value).toBe('Dogs')
    expect((screen.getByLabelText('Candidate words') as HTMLTextAreaElement).value).toBe(DOGS_CANDIDATE_POOL.join('\n'))
    await goTo(user, 'Publish')
    await goTo(user, 'Candidates')
    expect(cards()[2].getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('region', { name: /Selected Candidate 3/ })).toBeTruthy()
    expect(screen.getByText(/seed workshop-generation-1/).textContent).toBe(seedLine)
  })

  it('a refresh on Candidates keeps the route and shows an empty current batch', async () => {
    const first = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await fillDogs(first.user)
    await first.user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    await waitFor(() => expect(first.store.current().kind).toBe('ok'))
    first.unmount()

    renderApp({ store: first.store })
    expect(await screen.findByRole('heading', { name: 'Candidates' })).toBeTruthy()
    expect(screen.getByText(/No current batch\./)).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
  })

  it('a restored Final Puzzle opens directly at #/final with no batch', async () => {
    window.history.replaceState(null, '', '/#/final')
    renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft()) } })
    const heading = await screen.findByRole('heading', { name: /^Final Puzzle/ })
    expect(heading.textContent).toMatch('Approved Candidate 2')
    expect((screen.getByLabelText('Puzzle ID') as HTMLInputElement).value).toBe('dogs7')
    expect(screen.getByRole('img', { name: /Final puzzle board/ })).toBeTruthy()
  })
})

describe('Generate from Author and Candidates', () => {
  it('Candidates generates the next batch with the same inputs and validation', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await fillDogs(user)
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.getByText(/seed workshop-generation-1/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.getByText(/seed workshop-generation-2/)).toBeTruthy()

    // Invalid inputs: the error appears here, nothing navigates, the batch and inputs stay.
    await goTo(user, 'Author')
    await user.clear(screen.getByLabelText('Clue'))
    await goTo(user, 'Candidates')
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch('Enter a clue.')
    expect(within(alert).getByRole('link', { name: 'Review them in Author' }).getAttribute('href')).toBe('#/author')
    expect(window.location.hash).toBe('#/candidates')
    expect(screen.getByText(/seed workshop-generation-2/)).toBeTruthy()
  })

  it('asks before a new batch clears the Final Puzzle; Cancel keeps it', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await fillDogs(user)
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    await user.click(cards()[0])
    await user.click(screen.getByRole('button', { name: 'Approve Candidate' }))
    expect(window.location.hash).toBe('#/final')
    await goTo(user, 'Candidates')

    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    const confirm = screen.getByRole('group', { name: 'Generate a new batch and clear the Final Puzzle?' })
    expect(confirm.textContent).toMatch('clears the approved Final Puzzle (Approved Candidate 1 · dogs)')
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('group', { name: /Generate a new batch/ })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.getByText(/seed workshop-generation-1/)).toBeTruthy()
    expect(cards()[0].textContent).toMatch('Approved')
  })
})

describe('Final Puzzle and Publish guards', () => {
  it('Final Puzzle and Publish explain what is missing without a Final Puzzle', async () => {
    const { user, publisher } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await goTo(user, 'Final Puzzle')
    expect(screen.getByText(/No Final Puzzle has been approved\./)).toBeTruthy()
    await goTo(user, 'Publish')
    expect(screen.getByText(/Nothing to publish yet\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Publish to/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    expect(publisher.preview).not.toHaveBeenCalled()
  })

  it('an invalid Final Puzzle reached at #/publish offers no publishing', async () => {
    const draft = fullDraft()
    const invalid = { ...draft, finalPuzzle: { ...draft.finalPuzzle!, inputs: { id: 'dogs', clue: 'Dogs' } } } // reserved ID
    window.history.replaceState(null, '', '/#/publish')
    const { publisher } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(invalid) } })
    expect(await screen.findByText(/Not ready to publish\./)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Publish to dev calendar (testing)' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Publish to/ })).toBeNull()
    expect(publisher.preview).not.toHaveBeenCalled()
  })

  it('the developer export is in a collapsed Advanced disclosure', async () => {
    const { user } = renderApp({ initial: { kind: 'ok', envelope: envelopeOf(fullDraft()) } })
    await screen.findByRole('heading', { name: 'Author' })
    await goTo(user, 'Publish')
    const summary = screen.getByText('Advanced: developer export (download puzzle modules)')
    const details = summary.parentElement as HTMLDetailsElement
    expect(details.tagName).toBe('DETAILS')
    expect(details.open).toBe(false)
    // Native disclosure: keyboard toggling (Enter/Space on the summary) is the
    // browser's own, which jsdom doesn't implement; verified in the browser.
    await user.click(summary)
    expect(details.open).toBe(true)
    expect(within(details).getByRole('button', { name: 'Download dogs7Puzzle.ts' })).toBeTruthy()
  })
})

describe('mobile navigation drawer', () => {
  it('opens as a modal dialog, traps Tab, closes on Escape, and returns focus to Menu', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    const menu = screen.getByRole('button', { name: 'Menu' })
    expect(menu.getAttribute('aria-expanded')).toBe('false')
    await user.click(menu)

    const drawer = screen.getByRole('dialog', { name: 'ClueCross Workshop' })
    expect(drawer.getAttribute('aria-modal')).toBe('true')
    expect(menu.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(within(drawer).getByRole('button', { name: 'Close' }))
    // Everything behind the drawer is inert.
    expect(document.querySelector('main')?.closest('[inert]')).toBeTruthy()

    const links = within(drawer).getAllByRole('link')
    links[links.length - 1].focus()
    await user.tab()
    expect(document.activeElement).toBe(within(drawer).getByRole('button', { name: 'Close' }))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(links[links.length - 1])

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(menu)
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('choosing a destination closes the drawer and moves to that workspace', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await user.click(screen.getByRole('button', { name: 'Menu' }))
    const drawer = screen.getByRole('dialog', { name: 'ClueCross Workshop' })
    expect(within(drawer).getByRole('link', { name: 'Author' }).getAttribute('aria-current')).toBe('page')
    await user.click(within(drawer).getByRole('link', { name: 'Publish' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.hash).toBe('#/publish')
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Publish' }))
  })
})

describe('Production Schedule access', () => {
  it('is not reachable outside Production-operations mode, even by URL', async () => {
    window.history.replaceState(null, '', '/#/schedule')
    renderApp()
    expect(await screen.findByRole('heading', { name: 'Author' })).toBeTruthy()
    expect(window.location.hash).toBe('#/author')
    expect(screen.queryByRole('link', { name: 'Production Schedule' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Production Schedule' })).toBeNull()
  })

  it('is a separate destination in Production-operations mode, with the banner on every workspace', async () => {
    window.history.replaceState(null, '', '/#/schedule')
    const production = fakeProduction()
    const { user } = renderApp({ production })
    expect(await screen.findByRole('heading', { name: 'Production Schedule' })).toBeTruthy()
    expect(within(nav()).getByRole('link', { name: 'Production Schedule' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('note', { name: 'Production operations' }).textContent).toMatch('Production Operations Enabled')
    await goTo(user, 'Author')
    expect(screen.getByRole('note', { name: 'Production operations' })).toBeTruthy()
  })
})
