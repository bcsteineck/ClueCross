// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOGS_CANDIDATE_POOL } from '../../tools/generator/src/pool/dogsCandidatePool.js'
import { createMemoryDraftStore, memoryDraftClient } from '../server/draft/memoryDraftStore'
import { envelopeOf, fullDraft } from '../server/draft/testDrafts'
import type { DraftReadResult } from '../server/draft/draftStore'
import type { ProductionClient } from './production/productionClient'
import type { PublishingClient } from './publishing/publishingClient'
import { WorkshopApp } from './WorkshopApp'

// Phase 2c-3: on narrow workspaces the gallery and a candidate's detail are
// separate screens, with the detail screen at #/candidates/<key>. jsdom
// doesn't evaluate container queries, so these tests set the custom
// property the stylesheet publishes (--ws-candidates-layout) directly; the
// real breakpoint is checked in a browser.

const layoutStyle = document.createElement('style')

function setLayout(layout: 'screens' | 'columns') {
  layoutStyle.textContent = `.ws-candidates-workspace { --ws-candidates-layout: ${layout}; }`
  act(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrollTo = vi.fn()
  vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo as unknown as typeof window.scrollTo)
  window.history.replaceState(null, '', '/')
  document.head.append(layoutStyle)
  layoutStyle.textContent = '.ws-candidates-workspace { --ws-candidates-layout: screens; }'
})
afterEach(() => {
  cleanup()
  layoutStyle.remove()
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
    // Still loading: these tests only need the route, not a schedule.
    schedule: vi.fn(() => new Promise<never>(() => {})),
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

const restored = (): DraftReadResult => ({ kind: 'ok', envelope: envelopeOf(fullDraft()) })

async function generate(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'Author' })
  await user.type(screen.getByLabelText('Clue'), 'Dogs')
  await user.click(screen.getByLabelText('Candidate words'))
  await user.paste(DOGS_CANDIDATE_POOL.join('\n'))
  await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
  return screen.findByRole('region', { name: /Generated Candidates/ })
}

const cards = () => within(screen.getByRole('region', { name: /Generated Candidates/ })).getAllByRole('button')
const savedCards = () => within(screen.getByRole('region', { name: /^Saved Candidates/ })).getAllByRole('button')
const tab = (name: 'Current Batch' | 'Saved Candidates') => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

// Saves Current Batch candidates by number (each from its detail screen,
// staying there until it reads Saved), then shows Saved Candidates.
async function saveCandidates(user: ReturnType<typeof userEvent.setup>, numbers: number[]) {
  for (const number of numbers) {
    await user.click(card(number))
    await user.click(screen.getByRole('button', { name: 'Save Candidate' }))
    await screen.findByRole('button', { name: 'Saved' })
    expect(detailHeading().textContent).toMatch(new RegExp(`^Candidate ${number} of`))
    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    await screen.findByRole('region', { name: /Generated Candidates/ })
  }
  await user.click(tab('Saved Candidates'))
}
const card = (number: number) => cards().find((button) => button.textContent?.startsWith(`Candidate ${number}`))!
const detailHeading = () => screen.getByRole('heading', { level: 3, name: /^Candidate \d+ of \d+/ })
const boardLabel = () => screen.getByRole('img', { name: /^Puzzle preview/ }).getAttribute('aria-label')
const previous = () => screen.getByRole('button', { name: 'Previous' })
const next = () => screen.getByRole('button', { name: 'Next' })
const board = () => screen.getByRole('img', { name: /^Puzzle preview/ }).parentElement!

function swipe(dx: number, dy: number, pointerType = 'touch') {
  const target = board()
  const start = { pointerId: 1, pointerType, isPrimary: true, clientX: 200, clientY: 200 }
  fireEvent.pointerDown(target, start)
  fireEvent.pointerUp(target, { ...start, clientX: 200 + dx, clientY: 200 + dy })
}

describe('Narrow Candidates: gallery and detail screens', () => {
  it('shows a compact gallery with no inspector; a card opens that candidate’s detail', async () => {
    const { user } = renderApp()
    const gallery = await generate(user)
    expect(cards().length).toBeGreaterThanOrEqual(4)
    expect(screen.queryByRole('region', { name: /Selected Candidate/ })).toBeNull()
    expect(screen.queryByText('Select a candidate to inspect it.')).toBeNull()
    // Compact cards open a screen; they aren't toggles, and carry no word lists.
    expect(card(1).getAttribute('aria-pressed')).toBeNull()
    expect(card(1).textContent).not.toMatch(/·|@ 360/)
    expect(gallery).toBeTruthy()
    // The gallery carries the list tabs, with their counts.
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
    expect(tab('Current Batch').textContent).toBe(`Current Batch (${cards().length})`)
    expect(tab('Saved Candidates').getAttribute('aria-selected')).toBe('false')
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (0)')

    const lengthBefore = window.history.length
    await user.click(card(3))
    expect(detailHeading().textContent).toMatch(/^Candidate 3 of \d+/)
    expect(window.location.hash).toMatch(/^#\/candidates\/[a-z0-9]+$/)
    expect(window.history.length).toBe(lengthBefore + 1)
    expect(document.activeElement).toBe(detailHeading())
    expect(screen.queryByRole('region', { name: /Generated Candidates/ })).toBeNull()
    expect(screen.getAllByRole('status').some((status) => /^Candidate 3 of \d+$/.test(status.textContent ?? ''))).toBe(true)
    // Still the Candidates workspace; the list tabs and their note belong to the gallery only.
    expect(screen.getByRole('link', { name: 'Candidates' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab', { name: /Saved Candidates/ })).toBeNull()
    expect(screen.queryByText(/Generated candidates are temporary/)).toBeNull()
    // Current Batch's one action is Save.
    expect(screen.getByRole('button', { name: 'Save Candidate' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull()
  })

  it('shows the list tabs again when returning to the gallery, and the detail starts with All Candidates', async () => {
    const { user } = renderApp()
    await generate(user)
    await user.click(card(2))
    const allCandidates = screen.getByRole('button', { name: 'All Candidates' })
    // Nothing between the workspace header and the detail screen's own controls.
    const screenRoot = allCandidates.parentElement!
    expect(screenRoot.firstElementChild).toBe(allCandidates)
    expect(screenRoot.previousElementSibling?.querySelector('h2')?.textContent).toBe('Candidates')

    await user.click(allCandidates)
    await screen.findByRole('region', { name: /Generated Candidates/ })
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
    expect(tab('Saved Candidates')).toBeTruthy()
    expect(screen.getByText(/Generated candidates are temporary/)).toBeTruthy()
    expect(screen.getByRole('tabpanel')).toBeTruthy()
    expect(document.activeElement).toBe(card(2))
  })

  it('Previous and Next follow batch order, stop at the ends, and replace the history entry', async () => {
    const { user } = renderApp()
    await generate(user)
    const total = cards().length
    const labels = cards().map((button) => button.textContent)
    await user.click(card(1))
    const lengthAtDetail = window.history.length

    expect(previous().getAttribute('aria-disabled')).toBe('true')
    const firstBoard = boardLabel()
    await user.click(previous())
    expect(detailHeading().textContent).toMatch(/^Candidate 1 of/)

    await user.click(next())
    expect(detailHeading().textContent).toMatch(/^Candidate 2 of/)
    expect(boardLabel()).not.toBe(firstBoard)
    expect(document.activeElement).toBe(next())
    for (let n = 3; n <= total; n++) await user.click(next())
    expect(detailHeading().textContent).toBe(`Candidate ${total} of ${total}`)
    expect(next().getAttribute('aria-disabled')).toBe('true')
    await user.click(next())
    expect(detailHeading().textContent).toBe(`Candidate ${total} of ${total}`)
    expect(window.history.length).toBe(lengthAtDetail)

    // Back from any candidate returns to the gallery, not to earlier candidates.
    window.history.back()
    await screen.findByRole('region', { name: /Generated Candidates/ })
    expect(cards().map((button) => button.textContent?.replace('Selected', ''))).toEqual(
      labels.map((label) => label?.replace('Selected', '')),
    )
    await waitFor(() => expect(document.activeElement).toBe(card(total)))
    expect(card(total).textContent).toMatch(/Selected$/)
  })

  it('swipes left for Next and right for Previous; vertical, short, and mouse drags do nothing', async () => {
    const { user } = renderApp()
    await generate(user)
    const total = cards().length
    await user.click(card(2))

    swipe(-80, 10)
    expect(detailHeading().textContent).toMatch(/^Candidate 3 of/)
    swipe(90, -20)
    expect(detailHeading().textContent).toMatch(/^Candidate 2 of/)

    swipe(10, -200) // vertical scroll
    swipe(-30, 0) // too short
    swipe(-80, 60) // too diagonal
    swipe(-120, 0, 'mouse')
    expect(detailHeading().textContent).toMatch(/^Candidate 2 of/)

    // A cancelled gesture (the browser took over to scroll) never navigates.
    fireEvent.pointerDown(board(), { pointerId: 4, pointerType: 'touch', isPrimary: true, clientX: 200, clientY: 200 })
    fireEvent.pointerCancel(board(), { pointerId: 4 })
    fireEvent.pointerUp(board(), { pointerId: 4, pointerType: 'touch', isPrimary: true, clientX: 50, clientY: 200 })
    expect(detailHeading().textContent).toMatch(/^Candidate 2 of/)

    // One swipe moves one candidate, and none beyond the ends.
    swipe(120, 0)
    expect(detailHeading().textContent).toMatch(/^Candidate 1 of/)
    swipe(120, 0)
    expect(detailHeading().textContent).toMatch(/^Candidate 1 of/)
    for (let n = 2; n <= total; n++) swipe(-120, 0)
    swipe(-120, 0)
    expect(detailHeading().textContent).toBe(`Candidate ${total} of ${total}`)
  })

  it('opens the detail at the top and brings the gallery back where it was scrolled to', async () => {
    const { user } = renderApp()
    await generate(user)
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 })
    await user.click(card(4))
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    await user.click(next())

    window.history.back()
    await screen.findByRole('region', { name: /Generated Candidates/ })
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 640))
    await waitFor(() => expect(document.activeElement).toBe(card(5)))

    // Through All Candidates too.
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 320 })
    await user.click(card(2))
    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    await screen.findByRole('region', { name: /Generated Candidates/ })
    await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith(0, 320))
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('All Candidates and Back return to the gallery; Forward reopens the detail', async () => {
    const { user } = renderApp()
    await generate(user)
    const start = window.history.length

    await user.click(card(3))
    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    await screen.findByRole('region', { name: /Generated Candidates/ })
    expect(window.location.hash).toBe('#/candidates')
    await waitFor(() => expect(document.activeElement).toBe(card(3)))

    window.history.forward()
    await waitFor(() => expect(detailHeading().textContent).toMatch(/^Candidate 3 of/))
    window.history.back()
    await screen.findByRole('region', { name: /Generated Candidates/ })

    // Reopening replaces the forward entry instead of piling entries up.
    await user.click(card(4))
    expect(window.history.length).toBe(start + 1)
    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    await screen.findByRole('region', { name: /Generated Candidates/ })
    expect(window.location.hash).toBe('#/candidates')
  })

  it('a detail URL with no gallery entry behind it returns by replacing, not by leaving the Workshop', async () => {
    const { user } = renderApp()
    await generate(user)
    await user.click(card(2))
    const hash = window.location.hash
    // As if the detail URL had been opened directly (no marker from the gallery).
    window.history.replaceState(null, '', hash)
    const length = window.history.length
    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    expect(await screen.findByRole('region', { name: /Generated Candidates/ })).toBeTruthy()
    expect(window.location.hash).toBe('#/candidates')
    expect(window.history.length).toBe(length)
  })

  it('saves from the detail screen, approves from a Saved detail screen, and Back from Final returns focus to its card', async () => {
    const { user } = renderApp()
    await generate(user)
    await saveCandidates(user, [2])
    await user.click(savedCards()[0])
    expect(window.location.hash).toMatch(/^#\/candidates\/saved\/[a-z0-9]+$/)
    expect(detailHeading().textContent).toMatch(/^Candidate 1 of 1/)
    const approve = screen.getByRole('button', { name: 'Approve as Final Puzzle' })
    expect(within(screen.getByRole('region', { name: /^Candidate 1 of/ })).getByRole('button', { name: 'Approve as Final Puzzle' })).toBe(approve)
    await user.click(approve)
    expect(await screen.findByRole('heading', { name: /Final Puzzle/ })).toBeTruthy()
    expect(window.location.hash).toBe('#/final')
    expect(screen.getByText(/Approved Candidate 1/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to Candidate Review' }))
    await screen.findByRole('region', { name: /^Saved Candidates/ })
    await waitFor(() => expect(document.activeElement).toBe(savedCards()[0]))
    expect(savedCards()[0].textContent).toMatch(/Approved/)
    await user.click(tab('Current Batch'))
    expect(card(2).textContent).toMatch(/Approved/)
  })

  it('a stale or unknown detail key is replaced with the gallery, never approved', async () => {
    const { user } = renderApp()
    await generate(user)
    const length = window.history.length
    act(() => {
      window.location.hash = '#/candidates/zzzz'
    })
    await waitFor(() => expect(window.location.hash).toBe('#/candidates'))
    expect(screen.getByRole('region', { name: /Generated Candidates/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Approve|Save Candidate/ })).toBeNull()
    expect(window.history.length).toBe(length + 1) // the typed URL's own entry, replaced in place

    act(() => {
      window.location.hash = '#/candidates/'
    })
    await waitFor(() => expect(window.location.hash).toBe('#/candidates'))
    expect(screen.getByRole('heading', { name: 'Candidates' })).toBeTruthy()
  })

  it('a new batch drops detail navigation from the old one', async () => {
    const { user } = renderApp()
    await generate(user)
    await user.click(card(3))
    const oldHash = window.location.hash
    const oldBoard = boardLabel()

    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    await screen.findByRole('region', { name: /Generated Candidates/ })
    expect(window.location.hash).toBe('#/candidates')
    expect(cards().some((button) => button.textContent?.includes('Selected'))).toBe(false)

    // Back to the old batch's detail URL: only the very same layout may show,
    // otherwise it's replaced with the gallery.
    window.history.back()
    await waitFor(() => expect(window.location.hash === '#/candidates' || screen.queryByRole('img', { name: /^Puzzle preview/ })).toBeTruthy())
    if (window.location.hash === oldHash) expect(boardLabel()).toBe(oldBoard)
    else expect(screen.getByRole('region', { name: /Generated Candidates/ })).toBeTruthy()
  })

  it('refreshing on a detail URL shows the empty state and the restored Final Puzzle', async () => {
    window.history.replaceState(null, '', '/#/candidates/abc123')
    const length = window.history.length
    renderApp({ initial: restored() })
    expect(await screen.findByText(/No current batch\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Final Puzzle' })).toBeTruthy()
    await waitFor(() => expect(window.location.hash).toBe('#/candidates'))
    expect(window.history.length).toBe(length)
  })
})

describe('Switching between narrow and wide', () => {
  it('keeps the selection across the breakpoint without adding history', async () => {
    const { user } = renderApp()
    await generate(user)
    await user.click(card(3))
    const length = window.history.length
    const detailHash = window.location.hash

    setLayout('columns')
    const inspector = await screen.findByRole('region', { name: /Selected Candidate 3/ })
    expect(screen.getByRole('region', { name: /Generated Candidates/ })).toBeTruthy()
    expect(within(inspector).getByRole('button', { name: 'Save Candidate' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'All Candidates' })).toBeNull()
    expect(card(3).getAttribute('aria-pressed')).toBe('true')
    expect(window.location.hash).toBe(detailHash)
    expect(window.history.length).toBe(length)

    // Selecting beside the inspector keeps the URL naming the selection.
    await user.click(card(4))
    expect(screen.getByRole('region', { name: /Selected Candidate 4/ })).toBeTruthy()
    expect(window.history.length).toBe(length)

    // Narrow again on that URL: its detail screen.
    setLayout('screens')
    expect(detailHeading().textContent).toMatch(/^Candidate 4 of/)

    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    await screen.findByRole('region', { name: /Generated Candidates/ })
    setLayout('columns')
    expect(screen.getByRole('region', { name: /Selected Candidate 4/ })).toBeTruthy()
    const wideLength = window.history.length
    // Wide to narrow on the gallery stays on the gallery.
    setLayout('screens')
    expect(screen.getByRole('region', { name: /Generated Candidates/ })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Selected Candidate/ })).toBeNull()
    expect(card(4).textContent).toMatch(/Selected$/)
    expect(window.history.length).toBe(wideLength)
    expect(window.location.hash).toBe('#/candidates')
  })

  it('wide: the gallery and inspector are unchanged, and selecting never changes the URL', async () => {
    setLayout('columns')
    const { user } = renderApp()
    await generate(user)
    const length = window.history.length
    await user.click(card(2))
    expect(card(2).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('region', { name: /Selected Candidate 2/ })).toBeTruthy()
    expect(window.location.hash).toBe('#/candidates')
    expect(window.history.length).toBe(length)
    // Beside the inspector, the list tabs stay.
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
    expect(tab('Saved Candidates').getAttribute('aria-selected')).toBe('false')
  })
})

describe('Detail screen and the rest of the Workshop', () => {
  it('moves to other workspaces from the detail screen and back, keeping Production routes intact', async () => {
    const { user } = renderApp({ production: fakeProduction() })
    await generate(user)
    await user.click(card(2))
    const detailHash = window.location.hash
    await user.click(screen.getByRole('link', { name: 'Production Schedule' }))
    expect(await screen.findByRole('heading', { name: 'Production Schedule' })).toBeTruthy()
    window.history.back()
    await waitFor(() => expect(window.location.hash).toBe(detailHash))
    expect(detailHeading().textContent).toMatch(/^Candidate 2 of/)

    await user.click(screen.getByRole('link', { name: 'Author' }))
    expect((await screen.findByLabelText('Clue') as HTMLInputElement).value).toBe('Dogs')
    expect(screen.getByLabelText('Candidate words')).toBeTruthy()
  })

  it('a detail URL never reaches Production Schedule outside Production-operations mode', async () => {
    window.history.replaceState(null, '', '/#/candidates/schedule')
    renderApp()
    await screen.findByRole('heading', { name: 'Candidates' })
    await waitFor(() => expect(window.location.hash).toBe('#/candidates'))
    expect(screen.queryByRole('link', { name: 'Production Schedule' })).toBeNull()
  })

  it('Generate from a Saved detail screen opens the new Current Batch without asking, keeping the Final Puzzle', async () => {
    const { user } = renderApp()
    await generate(user)
    await saveCandidates(user, [2])
    await user.click(savedCards()[0])
    await user.click(screen.getByRole('button', { name: 'Approve as Final Puzzle' }))
    await screen.findByRole('heading', { name: /Final Puzzle/ })
    window.history.back()
    await waitFor(() => expect(detailHeading().textContent).toMatch(/^Candidate 1 of 1/))
    expect(screen.getByRole('button', { name: 'Open Final Puzzle' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Generate Candidates' }))
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(await screen.findByRole('region', { name: /Generated Candidates/ })).toBeTruthy()
    expect(screen.getByText(/seed workshop-generation-2/)).toBeTruthy()
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
    expect(tab('Saved Candidates').textContent).toBe('Saved Candidates (1)')
  })
})

describe('Narrow Saved Candidates', () => {
  it('Previous, Next, and swipes go through Saved Candidates only, in saved order', async () => {
    const { user } = renderApp()
    await generate(user)
    await saveCandidates(user, [5, 2, 7])
    expect(savedCards().map((button) => /Candidate (\d+)/.exec(button.textContent ?? '')?.[1])).toEqual(['1', '2', '3'])
    await user.click(savedCards()[0])
    const historyLength = window.history.length
    expect(detailHeading().textContent).toMatch(/^Candidate 1 of 3/)
    const first = boardLabel()
    expect(previous().getAttribute('aria-disabled')).toBe('true')

    await user.click(next())
    expect(detailHeading().textContent).toMatch(/^Candidate 2 of 3/)
    swipe(-120, 5)
    expect(detailHeading().textContent).toMatch(/^Candidate 3 of 3/)
    expect(next().getAttribute('aria-disabled')).toBe('true')
    swipe(-120, 5) // the end: no wrap
    expect(detailHeading().textContent).toMatch(/^Candidate 3 of 3/)
    swipe(120, 5)
    swipe(120, 5)
    expect(boardLabel()).toBe(first)
    // Saved detail screens offer Approve and Remove, never Save.
    expect(screen.getByRole('button', { name: 'Approve as Final Puzzle' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove from Saved' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save Candidate' })).toBeNull()
    // Previous/Next and swipes replace the detail entry rather than adding entries.
    expect(window.history.length).toBe(historyLength)

    // Back restores the Saved gallery, with focus on the card that was open.
    window.history.back()
    await screen.findByRole('region', { name: /^Saved Candidates/ })
    await waitFor(() => expect(document.activeElement).toBe(savedCards()[0]))
    expect(tab('Saved Candidates').getAttribute('aria-selected')).toBe('true')
  })

  it('restores the Saved gallery’s own scroll position', async () => {
    const { user } = renderApp()
    await generate(user)
    await saveCandidates(user, [1, 2])
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 })
    await user.click(savedCards()[1])
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    scrollTo.mockClear()
    await user.click(screen.getByRole('button', { name: 'All Candidates' }))
    await screen.findByRole('region', { name: /^Saved Candidates/ })
    expect(scrollTo).toHaveBeenCalledWith(0, 640)
  })

  it('removing on a detail screen moves on to the candidate that took its place; removing the last returns to the empty gallery', async () => {
    const { user } = renderApp()
    await generate(user)
    await saveCandidates(user, [3, 4])
    await user.click(savedCards()[0])
    await user.click(screen.getByRole('button', { name: 'Remove from Saved' }))
    await waitFor(() => expect(detailHeading().textContent).toMatch(/^Candidate 1 of 1/))
    expect(document.activeElement).toBe(detailHeading())
    expect(window.location.hash).toMatch(/^#\/candidates\/saved\//)

    await user.click(screen.getByRole('button', { name: 'Remove from Saved' }))
    await screen.findByText('No saved candidates yet')
    expect(window.location.hash).toBe('#/candidates')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View Current Batch' })))
    await user.click(screen.getByRole('button', { name: 'View Current Batch' }))
    expect(tab('Current Batch').getAttribute('aria-selected')).toBe('true')
    // Both are saveable again.
    expect(card(3).textContent).not.toMatch(/Saved/)
    expect(card(4).textContent).not.toMatch(/Saved/)
  })

  it('a Saved detail URL survives a refresh (Saved Candidates are in the draft)', async () => {
    const { user } = renderApp({ initial: restored() })
    await screen.findByRole('heading', { name: 'Author' })
    await user.click(screen.getByRole('link', { name: 'Candidates' }))
    await user.click(tab('Saved Candidates'))
    await user.click(savedCards()[1])
    const hash = window.location.hash
    cleanup()
    window.history.replaceState(null, '', hash)
    renderApp({ initial: restored() })
    await waitFor(() => expect(detailHeading().textContent).toMatch(/^Candidate 2 of 2/))
    expect(screen.getByRole('button', { name: 'Open Final Puzzle' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove from Saved' })).toBeNull()
  })
})
