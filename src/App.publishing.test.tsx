// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PuzzleDefinition } from './core/types'
import type { PuzzleResult } from './data/puzzleCalendar'
import type { LayoutDefinition } from './layout/types'
import { fakeCalendarClient, published, renderApp } from './testing/playerHarness'

// jsdom's default origin has no working localStorage; use an in-memory one.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// CAT across crossing TIE down, under any id/clue.
function tiny(id: string, clue: string): { puzzle: PuzzleDefinition; layout: LayoutDefinition } {
  return {
    puzzle: {
      id,
      clue,
      unlockBudget: 2000,
      cells: {
        r0c0: { id: 'r0c0', correctLetter: 'C' },
        r0c1: { id: 'r0c1', correctLetter: 'A' },
        r0c2: { id: 'r0c2', correctLetter: 'T' },
        r1c2: { id: 'r1c2', correctLetter: 'I' },
        r2c2: { id: 'r2c2', correctLetter: 'E' },
      },
      entries: [
        { id: 'cat', cellIds: ['r0c0', 'r0c1', 'r0c2'] },
        { id: 'tie', cellIds: ['r0c2', 'r1c2', 'r2c2'] },
      ],
    },
    layout: {
      id: `${id}-grid`,
      puzzleId: id,
      cellPositions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r1c2: { x: 2, y: 1 },
        r2c2: { x: 2, y: 2 },
      },
      navigationOrder: ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'],
    },
  }
}

const day = (date: string, id: string, clue: string) => {
  const { puzzle, layout } = tiny(id, clue)
  return published(date, puzzle, layout)
}

// Oct 8 and Oct 11 are released; Oct 9–10 is a gap; Oct 12 is current.
const RELEASED = [day('2026-10-08', 'older', 'Older'), day('2026-10-11', 'yesterday', 'Yesterday'), day('2026-10-12', 'current', 'Current')]

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function clueHeading() {
  return screen.getByRole('heading', { level: 1 })
}

async function openArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^archive$/i }))
}

function dateButton(name: RegExp) {
  return screen.getByRole('button', { name })
}

describe('initial load', () => {
  it('shows a loading state, then the server’s current puzzle without a second request', async () => {
    const client = fakeCalendarClient(RELEASED)
    const gate = deferred<void>()
    const fetchCalendar = client.fetchCalendar.bind(client)
    client.fetchCalendar = async () => {
      await gate.promise
      return fetchCalendar()
    }
    render(<App calendarClient={client} />)
    expect(screen.getByRole('status').textContent).toMatch('Loading today’s puzzle…')
    await act(async () => gate.resolve())
    await waitFor(() => expect(clueHeading().textContent).toBe("Today's ClueCurrent"))
    expect(client.puzzleRequests).toEqual([])
  })

  it('shows an error with Retry, then loads on retry', async () => {
    const client = fakeCalendarClient(RELEASED)
    client.failCalendar = true
    const user = userEvent.setup()
    render(<App calendarClient={client} />)
    expect((await screen.findByRole('alert')).textContent).toMatch('The puzzle couldn’t be loaded.')
    expect(document.querySelector('[data-testid^="cell-"]')).toBeNull()

    client.failCalendar = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(clueHeading().textContent).toBe("Today's ClueCurrent"))
    expect(client.calendarCalls).toBe(2)
  })

  it('shows the empty state for an empty calendar, never a bundled puzzle', async () => {
    render(<App calendarClient={fakeCalendarClient([])} />)
    expect((await screen.findByRole('status')).textContent).toMatch('No puzzle is available yet.')
    expect(document.querySelector('[data-testid^="cell-"]')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Dogs|Flower|Space|Fruit|Magic/)
  })
})

describe('current-puzzle semantics', () => {
  it('follows the server’s current puzzle even when it is tomorrow by the browser clock', async () => {
    // 9:30 PM CDT / 10:30 PM EDT on Oct 1: the browser’s civil date is Oct 1,
    // but the 10 PM ET release already made Oct 2 current.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-02T02:30:00.000Z'))
    const user = userEvent.setup()
    await renderApp(fakeCalendarClient([day('2026-10-01', 'yesterday', 'Yesterday'), day('2026-10-02', 'current', 'Current')]))
    expect(clueHeading().textContent).toBe("Today's ClueCurrent")

    await openArchive(user)
    expect(dateButton(/october 2, 2026 \(currently viewing\)/i)).toBeTruthy()
    expect(dateButton(/october 3, 2026, puzzle not yet available/i)).toBeTruthy()
  })
})

describe('Archive availability', () => {
  it('enables released dates and disables gaps and unreleased dates', async () => {
    const user = userEvent.setup()
    await renderApp(fakeCalendarClient(RELEASED))
    await openArchive(user)
    expect(dateButton(/open puzzle for october 11, 2026/i).getAttribute('aria-disabled')).not.toBe('true')
    expect(dateButton(/october 10, 2026, no puzzle available/i)).toBeTruthy()
    expect(dateButton(/october 9, 2026, no puzzle available/i)).toBeTruthy()
    expect(dateButton(/october 13, 2026, puzzle not yet available/i)).toBeTruthy()
  })

  it('shows stars from saved results keyed by publishDate:puzzleId', async () => {
    localStorage.setItem(
      'cluecross:puzzle-results',
      JSON.stringify({ '2026-10-11:yesterday': { score: 2000, revealHistory: [] } }),
    )
    const user = userEvent.setup()
    await renderApp(fakeCalendarClient(RELEASED))
    await openArchive(user)
    expect(dateButton(/october 11, 2026 \(completed, 3 out of 3 stars\)/i)).toBeTruthy()
  })
})

describe('opening archived puzzles', () => {
  it('fetches once, caches for the session, and returns to the current puzzle without a request', async () => {
    const client = fakeCalendarClient(RELEASED)
    const user = userEvent.setup()
    await renderApp(client)

    await openArchive(user)
    await user.click(dateButton(/open puzzle for october 11, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toMatch('Yesterday'))
    expect(clueHeading().textContent).not.toMatch("Today's Clue")

    await openArchive(user)
    await user.click(dateButton(/open puzzle for october 12, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toBe("Today's ClueCurrent"))

    await openArchive(user)
    await user.click(dateButton(/open puzzle for october 11, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toMatch('Yesterday'))
    expect(client.puzzleRequests).toEqual(['2026-10-11'])
  })

  it('shows a loading state, and a 404 as unavailable without leaving the active puzzle', async () => {
    const client = fakeCalendarClient(RELEASED)
    const pending = deferred<PuzzleResult>()
    client.puzzleResponder = () => pending.promise
    const user = userEvent.setup()
    await renderApp(client)
    await openArchive(user)
    await user.click(dateButton(/open puzzle for october 8, 2026/i))
    expect(screen.getByText('Loading the puzzle for October 8, 2026…')).toBeTruthy()

    await act(async () => pending.resolve({ kind: 'unavailable' }))
    expect(screen.getByRole('alert').textContent).toMatch('The puzzle for October 8, 2026 isn’t available.')
    await user.click(screen.getByRole('button', { name: 'Go to Today’s Puzzle' }))
    expect(clueHeading().textContent).toBe("Today's ClueCurrent")
  })

  it('offers Retry after a failure', async () => {
    const client = fakeCalendarClient(RELEASED)
    client.puzzleResponder = async () => ({ kind: 'error' })
    const user = userEvent.setup()
    await renderApp(client)
    await openArchive(user)
    await user.click(dateButton(/open puzzle for october 11, 2026/i))
    expect((await screen.findByRole('alert')).textContent).toMatch('couldn’t be loaded')
    expect(clueHeading().textContent).toBe("Today's ClueCurrent") // still playable

    client.puzzleResponder = undefined
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(clueHeading().textContent).toMatch('Yesterday'))
    expect(client.puzzleRequests).toEqual(['2026-10-11', '2026-10-11'])
  })

  it('never lets a stale response replace a newer selection', async () => {
    const client = fakeCalendarClient(RELEASED)
    const slow = deferred<PuzzleResult>()
    client.puzzleResponder = (date) =>
      date === '2026-10-08' ? slow.promise : Promise.resolve({ kind: 'ready', puzzle: RELEASED[1] })
    const user = userEvent.setup()
    await renderApp(client)
    await openArchive(user)
    await user.click(dateButton(/open puzzle for october 8, 2026/i))
    await user.click(dateButton(/open puzzle for october 11, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toMatch('Yesterday'))

    await act(async () => slow.resolve({ kind: 'ready', puzzle: RELEASED[0] }))
    expect(clueHeading().textContent).toMatch('Yesterday')
  })
})

describe('persistence', () => {
  it('records a completed result under publishDate:puzzleId and restores it after a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderApp(fakeCalendarClient(RELEASED))
    for (const letter of ['C', 'A', 'T', 'I', 'E']) {
      await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
      await user.click(screen.getByTestId(`letter-${letter}`))
    }
    const results = JSON.parse(localStorage.getItem('cluecross:puzzle-results') ?? '{}')
    expect(Object.keys(results)).toEqual(['2026-10-12:current'])
    expect(results['2026-10-12:current'].revealHistory).toHaveLength(5)
    expect(Object.keys(JSON.parse(localStorage.getItem('cluecross:completed-dates') ?? '{}'))).toEqual(['2026-10-12:current'])
    const score = screen.getByTestId('score-badge').textContent

    unmount()
    await renderApp(fakeCalendarClient(RELEASED))
    expect((screen.getByTestId('cell-r2c2') as HTMLInputElement).value).toBe('E')
    expect(screen.getByTestId('score-badge').textContent).toBe(score)
  })

  it('keeps unfinished progress across a reload, as progress rather than a completed result', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderApp(fakeCalendarClient(RELEASED))
    await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
    await user.click(screen.getByTestId('letter-C'))
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('C')
    unmount()
    await renderApp(fakeCalendarClient(RELEASED))
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('C')
    expect(localStorage.getItem('cluecross:puzzle-results')).toBeNull()
    expect(Object.keys(JSON.parse(localStorage.getItem('cluecross:puzzle-progress') ?? '{}'))).toEqual(['2026-10-12:current'])
  })
})

describe('release refresh', () => {
  it('re-fetches the calendar when Archive opens; a new release appears but never replaces the active puzzle', async () => {
    const client = fakeCalendarClient(RELEASED)
    const user = userEvent.setup()
    await renderApp(client)
    await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
    await user.click(screen.getByTestId('letter-C'))

    // 10 PM ET passes: Oct 3 is released.
    client.setReleased([...RELEASED, day('2026-10-13', 'newest', 'Newest')])
    await openArchive(user)
    await waitFor(() => expect(dateButton(/open puzzle for october 13, 2026/i)).toBeTruthy())
    expect(client.calendarCalls).toBe(2)
    expect(clueHeading().textContent).toMatch('Current') // not replaced
    expect((screen.queryByTestId('cell-r0c0') as HTMLInputElement | null)?.value ?? 'C').toBe('C')

    await user.click(dateButton(/open puzzle for october 13, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toBe("Today's ClueNewest"))
    expect(client.puzzleRequests).toEqual([]) // the new current came with the calendar

    await openArchive(user)
    await user.click(dateButton(/october 12, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toMatch('Current'))
    expect((screen.getByTestId('cell-r0c0') as HTMLInputElement).value).toBe('C') // session progress kept
  })

  it('keeps the calendar in use when a refresh fails', async () => {
    const client = fakeCalendarClient(RELEASED)
    const user = userEvent.setup()
    await renderApp(client)
    client.failCalendar = true
    await openArchive(user)
    await waitFor(() => expect(client.calendarCalls).toBe(2))
    await user.click(dateButton(/open puzzle for october 11, 2026/i))
    await waitFor(() => expect(clueHeading().textContent).toMatch('Yesterday'))
  })
})
