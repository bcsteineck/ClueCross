// @vitest-environment jsdom
// Unfinished-puzzle persistence through the real player: progress survives
// a reload (simulated by unmounting and remounting App over the same
// localStorage) for the current and archived puzzles, on desktop and
// mobile, and a restored game completes and shares its whole session.
import { StrictMode } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PuzzleDefinition } from './core/types'
import type { LayoutDefinition } from './layout/types'
import { fakeCalendarClient, published, renderApp } from './testing/playerHarness'

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

// A 3-letter word across crossing a 3-letter word down at its last letter.
function crossing(id: string, clue: string, across: string, down: string): [PuzzleDefinition, LayoutDefinition] {
  const cells = {
    r0c0: { id: 'r0c0', correctLetter: across[0] },
    r0c1: { id: 'r0c1', correctLetter: across[1] },
    r0c2: { id: 'r0c2', correctLetter: across[2] },
    r1c2: { id: 'r1c2', correctLetter: down[1] },
    r2c2: { id: 'r2c2', correctLetter: down[2] },
  }
  return [
    {
      id,
      clue,
      unlockBudget: 2000,
      cells,
      entries: [
        { id: `${id}-a`, cellIds: ['r0c0', 'r0c1', 'r0c2'] },
        { id: `${id}-d`, cellIds: ['r0c2', 'r1c2', 'r2c2'] },
      ],
    },
    {
      id: `${id}-grid`,
      puzzleId: id,
      cellPositions: { r0c0: { x: 0, y: 0 }, r0c1: { x: 1, y: 0 }, r0c2: { x: 2, y: 0 }, r1c2: { x: 2, y: 1 }, r2c2: { x: 2, y: 2 } },
      navigationOrder: ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'],
    },
  ]
}

const [CATS, CATS_LAYOUT] = crossing('cats', 'Cats', 'CAT', 'TIE') // current: Oct 6
const [BATS, BATS_LAYOUT] = crossing('bats', 'Bats', 'BAT', 'TEN') // archive: Oct 5
const RELEASED = () => [published('2026-10-05', BATS, BATS_LAYOUT), published('2026-10-06', CATS, CATS_LAYOUT)]
const client = () => fakeCalendarClient(RELEASED())

type User = ReturnType<typeof userEvent.setup>

const cell = (id: string) => screen.getByTestId(`cell-${id}`) as HTMLInputElement
const score = () => screen.getByTestId('score-badge').textContent
const history = () => document.querySelector('.reveal-history-card')?.textContent ?? ''
const freeCaption = () => screen.queryByText(/free reveals? remaining/)
const saved = () => JSON.parse(localStorage.getItem('cluecross:puzzle-progress') ?? '{}')

async function reveal(user: User, letter: string) {
  await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
  await user.click(screen.getByTestId(`letter-${letter}`))
}

async function typeInto(user: User, id: string, letter: string) {
  await user.click(cell(id))
  await user.keyboard(letter)
}

async function reload(previous: { unmount: () => void }, calendar = client()) {
  previous.unmount()
  return renderApp(calendar)
}

async function openArchiveDate(user: User, label: RegExp) {
  await user.click(screen.getByRole('button', { name: /^archive$/i }))
  await user.click(screen.getByRole('button', { name: label }))
  await waitFor(() => expect(screen.getByTestId('cell-r0c0')).toBeTruthy())
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('unfinished progress survives a reload', () => {
  it('after all 3 free reveals and typed letters: letters, locks, score, history, and 0 free reveals', async () => {
    const user = userEvent.setup()
    let app = await renderApp(client())
    for (const letter of ['C', 'Q', 'T']) await reveal(user, letter) // C and T on the board, Q absent
    await typeInto(user, 'r1c2', 'X') // wrong on purpose: stays unfinished
    expect(freeCaption()).toBeNull()
    const before = { score: score(), history: history() }

    app = await reload(app)
    expect(cell('r0c0').value).toBe('C')
    expect(cell('r0c2').value).toBe('T')
    expect(cell('r1c2').value).toBe('X')
    expect(cell('r0c0').readOnly).toBe(true) // revealed cells stay locked
    expect(cell('r1c2').readOnly).toBe(false)
    expect(freeCaption()).toBeNull() // no free reveals handed back
    expect(score()).toBe(before.score)
    expect(history()).toBe(before.history)
    void app
  })

  it.each([1, 2])('after %i free reveal(s), the rest stay available', async (count) => {
    const user = userEvent.setup()
    const app = await renderApp(client())
    for (const letter of ['C', 'A'].slice(0, count)) await reveal(user, letter)
    await reload(app)
    expect(screen.getByText(`${3 - count} free reveal${3 - count === 1 ? '' : 's'} remaining`)).toBeTruthy()
  })

  it('after paid reveals and a zero-cell reveal, the score keeps every deduction', async () => {
    const user = userEvent.setup()
    const app = await renderApp(client())
    for (const letter of ['Q', 'X', 'Z', 'C', 'A']) await reveal(user, letter) // C 110 + A 160 paid
    expect(score()).toMatch(/^1730/)
    const before = history()
    await reload(app)
    expect(score()).toMatch(/^1730/)
    expect(history()).toBe(before)
  })

  it('removing typed letters updates the save; an untouched puzzle keeps no entry', async () => {
    const user = userEvent.setup()
    let app = await renderApp(client())
    expect(saved()).toEqual({})
    await typeInto(user, 'r0c0', 'C')
    expect(saved()).toEqual({ '2026-10-06:cats': { v: 1, values: { r0c0: 'C' }, reveals: [] } })
    await user.click(cell('r0c0'))
    await user.keyboard('{Backspace}')
    expect(saved()).toEqual({})
    app = await reload(app)
    expect(cell('r0c0').value).toBe('')
    void app
  })
})

describe('archive and rollover', () => {
  it('keeps current and archived progress separate, across switching and reloads', async () => {
    const user = userEvent.setup()
    let app = await renderApp(client())
    await typeInto(user, 'r0c0', 'C')
    await openArchiveDate(user, /open puzzle for october 5, 2026/i)
    expect(cell('r0c0').value).toBe('') // the archived puzzle starts fresh
    await reveal(user, 'B')
    expect(cell('r0c0').value).toBe('B')

    app = await reload(app) // reopening starts on the current puzzle
    expect(cell('r0c0').value).toBe('C')
    expect(screen.getByText('3 free reveals remaining')).toBeTruthy()
    await openArchiveDate(user, /open puzzle for october 5, 2026/i)
    expect(cell('r0c0').value).toBe('B')
    expect(cell('r0c0').readOnly).toBe(true)
    expect(screen.getByText('2 free reveals remaining')).toBeTruthy()
    void app
  })

  it('on a new daily release the new puzzle starts fresh and yesterday’s progress waits in the Archive', async () => {
    const user = userEvent.setup()
    const yesterday = fakeCalendarClient([published('2026-10-05', BATS, BATS_LAYOUT)])
    const app = await renderApp(yesterday)
    await reveal(user, 'B')
    await reload(app, client()) // 10 PM ET passed: Oct 6 (Cats) is now current
    expect(screen.getByRole('heading', { name: /today's clue/i }).parentElement?.textContent).toMatch('Cats')
    expect(cell('r0c0').value).toBe('')
    expect(screen.getByText('3 free reveals remaining')).toBeTruthy()
    await openArchiveDate(user, /open puzzle for october 5, 2026/i)
    expect(cell('r0c0').value).toBe('B')
  })
})

describe('completion', () => {
  it('a restored game completes, records its result, clears its progress, and shares the whole session', async () => {
    const user = userEvent.setup()
    let app = await renderApp(client())
    for (const letter of ['C', 'A', 'T']) await reveal(user, letter) // 3 free
    app = await reload(app)
    await reveal(user, 'I') // paid 150
    await reveal(user, 'E') // paid 170, completes
    const dialog = screen.getByRole('dialog', { name: /puzzle complete/i })
    await user.click(within(dialog).getByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe('ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,680 / 2,000\n5 reveals\ncluecross.com')
    expect(saved()).toEqual({})
    expect(Object.keys(JSON.parse(localStorage.getItem('cluecross:puzzle-results') ?? '{}'))).toEqual(['2026-10-06:cats'])
    void app
  })

  it('a completed result beats a stale unfinished save, which is removed', async () => {
    localStorage.setItem('cluecross:puzzle-results', JSON.stringify({ '2026-10-06:cats': { score: 1500, revealHistory: [] } }))
    localStorage.setItem('cluecross:puzzle-progress', JSON.stringify({ '2026-10-06:cats': { v: 1, values: { r0c0: 'X' }, reveals: [] } }))
    await renderApp(client())
    expect(cell('r0c0').value).toBe('C')
    expect(cell('r0c0').disabled).toBe(true) // completed board
    expect(screen.getByRole('button', { name: 'Share Result' })).toBeTruthy()
    expect(saved()).toEqual({})
  })
})

describe('bad or unavailable storage never breaks the player', () => {
  it.each([
    ['corrupt JSON', '{oops'],
    ['an unsupported version', JSON.stringify({ '2026-10-06:cats': { v: 9, values: { r0c0: 'C' }, reveals: [] } })],
    ['an unknown cell', JSON.stringify({ '2026-10-06:cats': { v: 1, values: { zzz: 'C' }, reveals: [] } })],
    ['a value contradicting a reveal', JSON.stringify({ '2026-10-06:cats': { v: 1, values: { r0c0: 'X' }, reveals: ['C'] } })],
    ['a save that would already be complete', JSON.stringify({ '2026-10-06:cats': { v: 1, values: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'I', r2c2: 'E' }, reveals: [] } })],
  ])('%s: starts the puzzle fresh', async (_label, raw) => {
    localStorage.setItem('cluecross:puzzle-progress', raw)
    await renderApp(client())
    expect(cell('r0c0').value).toBe('')
    expect(screen.getByText('3 free reveals remaining')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('plays normally when localStorage throws', async () => {
    const throwing = {
      ...createMemoryStorage(),
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    vi.stubGlobal('localStorage', throwing)
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'C')
    expect(cell('r0c0').value).toBe('C')
  })
})

describe('React StrictMode', () => {
  it('restores saved progress without its repeated effects overwriting it', async () => {
    localStorage.setItem('cluecross:puzzle-progress', JSON.stringify({ '2026-10-06:cats': { v: 1, values: { r0c0: 'C', r1c2: 'X' }, reveals: ['C'] } }))
    render(
      <StrictMode>
        <App calendarClient={client()} />
      </StrictMode>,
    )
    await waitFor(() => expect(cell('r0c0').value).toBe('C'))
    expect(cell('r1c2').value).toBe('X')
    expect(screen.getByText('2 free reveals remaining')).toBeTruthy()
    expect(saved()).toEqual({ '2026-10-06:cats': { v: 1, values: { r0c0: 'C', r1c2: 'X' }, reveals: ['C'] } })
  })
})

describe('mobile', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  it('restores the same progress on the mobile layout', async () => {
    const user = userEvent.setup()
    const app = await renderApp(client())
    for (const letter of ['C', 'Q', 'T']) await reveal(user, letter)
    await reload(app)
    expect(cell('r0c0').value).toBe('C')
    expect(cell('r0c0').readOnly).toBe(true)
    expect(freeCaption()).toBeNull()
    expect(screen.getByRole('button', { name: /^reveal letter/i })).toBeTruthy()
  })
})

describe('Reset Test State (dev/Preview)', () => {
  it('also clears the puzzle’s unfinished progress, so a reload stays fresh', async () => {
    const user = userEvent.setup()
    let app = await renderApp(client())
    await reveal(user, 'C')
    expect(saved()).toHaveProperty('2026-10-06:cats')
    await user.click(screen.getByRole('button', { name: /^settings$/i }))
    await user.click(screen.getByRole('button', { name: 'Reset Test State' }))
    expect(saved()).toEqual({})
    app = await reload(app)
    expect(cell('r0c0').value).toBe('')
    expect(screen.getByText('3 free reveals remaining')).toBeTruthy()
    void app
  })
})
