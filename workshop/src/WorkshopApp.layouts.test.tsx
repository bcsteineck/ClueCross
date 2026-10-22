// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import { envelopeOf, fullDraft } from '../server/draft/testDrafts'
import type { DraftReadResult } from '../server/draft/draftStore'
import type { ProductionClient } from './production/productionClient'
import type { PublishingClient } from './publishing/publishingClient'
import { WorkshopApp } from './WorkshopApp'

// Phase 2c-2 workspace layouts: what each workspace groups together and the
// order it is read in (which is also the order it stacks in on narrow
// screens). Column widths are CSS and deliberately not asserted here.

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const NOT_CONFIGURED = { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' } as const

function fakePublisher(): PublishingClient {
  return {
    preview: vi.fn(async () => ({ ok: true as const, body: NOT_CONFIGURED })),
    publish: vi.fn(async () => ({ ok: true as const, body: NOT_CONFIGURED })),
  }
}

function fakeProduction(): ProductionClient {
  return {
    schedule: vi.fn(),
    previewPublish: vi.fn(),
    publish: vi.fn(),
    previewRemoval: vi.fn(),
    remove: vi.fn(),
  }
}

function renderApp({ initial, production = null }: { initial?: DraftReadResult; production?: ProductionClient | null } = {}) {
  const user = userEvent.setup()
  render(
    <WorkshopApp drafts={memoryDraftClient(createMemoryDraftStore(initial))} publisher={fakePublisher()} production={production} />,
  )
  return { user }
}

const restored = (draft = fullDraft()): DraftReadResult => ({ kind: 'ok', envelope: envelopeOf(draft) })
const precedes = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const inputsPanel = () => screen.getByRole('region', { name: 'Authoring inputs' })
const generationPanel = () => screen.getByRole('region', { name: 'Generation' })

describe('Author layout', () => {
  it('groups the manual inputs before Priority Words, the pool checks, and Generate', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })

    expect(within(inputsPanel()).getByLabelText('Clue')).toBeTruthy()
    expect(within(inputsPanel()).getByRole('radio', { name: 'Enter manually' })).toBeTruthy()
    expect(within(inputsPanel()).getByLabelText('Candidate words')).toBeTruthy()
    expect(within(generationPanel()).getByRole('group', { name: /^Priority Words/ })).toBeTruthy()
    const generate = within(generationPanel()).getByRole('button', { name: 'Generate Candidates' })
    expect(precedes(inputsPanel(), generationPanel())).toBe(true)

    // A refused Generate is explained beside the button, and Author stays put.
    await user.click(generate)
    expect(within(generationPanel()).getByRole('alert')).toBeTruthy()
    expect(window.location.hash).toBe('#/author')

    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
    await user.click(within(generationPanel()).getByRole('checkbox', { name: 'KENNEL' }))
    await user.click(generate)
    expect(await screen.findByRole('heading', { name: 'Candidates' })).toBeTruthy()
    expect(screen.getByText(/· Priority Words: KENNEL$/)).toBeTruthy()
  })

  it('keeps sourcing and Pool Review with the authoring inputs, and Priority Words per mode', async () => {
    const { user } = renderApp({ initial: restored() })
    await screen.findByRole('heading', { name: 'Author' })

    expect(within(inputsPanel()).getByLabelText('Author context (optional)')).toBeTruthy()
    expect(within(inputsPanel()).getByRole('button', { name: 'Source Candidates' })).toBeTruthy()
    expect(within(inputsPanel()).getByRole('region', { name: 'Pool Review' })).toBeTruthy()
    expect(within(generationPanel()).queryByRole('region', { name: 'Pool Review' })).toBeNull()
    expect(within(generationPanel()).getByText('Selected: POODLE')).toBeTruthy()

    await user.click(screen.getByRole('radio', { name: 'Enter manually' }))
    expect(within(generationPanel()).getByText('Selected: KENNEL')).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: 'Source from clue' }))
    expect(within(generationPanel()).getByText('Selected: POODLE')).toBeTruthy()
    expect(within(generationPanel()).getByRole('button', { name: 'Generate Candidates' })).toBeTruthy()
  })
})

describe('Candidates layout', () => {
  it('reads the gallery, then the inspector, with Approve before the word lists', async () => {
    const { user } = renderApp()
    await screen.findByRole('heading', { name: 'Author' })
    await user.type(screen.getByLabelText('Clue'), 'Dogs')
    await user.click(screen.getByLabelText('Candidate words'))
    await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))

    const gallery = await screen.findByRole('region', { name: /Generated Candidates/ })
    await user.click(within(gallery).getAllByRole('button')[0])
    const inspector = screen.getByRole('region', { name: /Selected Candidate 1/ })
    expect(precedes(gallery, inspector)).toBe(true)
    const approve = within(inspector).getByRole('button', { name: 'Approve Candidate' })
    expect(precedes(approve, within(inspector).getByRole('heading', { name: /Selected answers/ }))).toBe(true)

    // Generate stays available here, ahead of the batch, alongside Approve.
    expect(precedes(screen.getByRole('button', { name: 'Generate Candidates' }), gallery)).toBe(true)
    await user.click(approve)
    expect(await screen.findByRole('heading', { name: /Final Puzzle/ })).toBeTruthy()
    expect(window.location.hash).toBe('#/final')
  })
})

describe('Final Puzzle layout', () => {
  it('a restored Final Puzzle shows its board first, then its details, with no batch', async () => {
    window.history.replaceState(null, '', '/#/final')
    renderApp({ initial: restored() })
    const board = await screen.findByRole('img', { name: /^Final puzzle board/ })
    const id = screen.getByLabelText('Puzzle ID') as HTMLInputElement
    expect(id.value).toBe('dogs7')
    expect(precedes(board, id)).toBe(true)
    expect(precedes(id, screen.getByRole('heading', { name: 'Validation' }))).toBe(true)
    expect(screen.getByRole('list', { name: 'Answers' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Candidate Review' })).toBeTruthy()
  })
})

describe('Publish layout', () => {
  it('reads Readiness, then Publishing actions (dev, then Production), then Advanced', async () => {
    window.history.replaceState(null, '', '/#/publish')
    renderApp({ initial: restored(), production: fakeProduction() })
    const readiness = await screen.findByRole('region', { name: 'Readiness' })
    const actions = screen.getByRole('region', { name: 'Publishing actions' })
    const advanced = screen.getByText(/^Advanced: developer export/).closest('details')!

    expect(within(readiness).getByText(/Ready to publish\./)).toBeTruthy()
    expect(precedes(readiness, actions)).toBe(true)
    expect(precedes(actions, advanced)).toBe(true)
    const dev = within(actions).getByRole('heading', { name: 'Publish to dev calendar (testing)' })
    const prod = within(actions).getByRole('heading', { name: 'Publish to Production' })
    expect(precedes(dev, prod)).toBe(true)
    expect(advanced.open).toBe(false)
  })

  it('without a valid Final Puzzle, Readiness explains and no Publishing actions appear', async () => {
    window.history.replaceState(null, '', '/#/publish')
    renderApp()
    const empty = await screen.findByRole('region', { name: 'Readiness' })
    expect(within(empty).getByText(/Nothing to publish yet\./)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Publishing actions' })).toBeNull()
    cleanup()

    window.history.replaceState(null, '', '/#/publish')
    const draft = fullDraft()
    renderApp({ initial: restored({ ...draft, finalPuzzle: { ...draft.finalPuzzle!, inputs: { id: 'dogs', clue: 'Dogs' } } }) })
    const readiness = await screen.findByRole('region', { name: 'Readiness' })
    expect(within(readiness).getByText(/Not ready to publish\./)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Publishing actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Publish to Dev Calendar' })).toBeNull()
  })
})
