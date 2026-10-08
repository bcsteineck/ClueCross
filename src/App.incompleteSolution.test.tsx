// @vitest-environment jsdom
// The "Not Quite There!" dialog: shown when play fills the last empty cell
// while some letter is wrong. Informational only — it never identifies
// the wrong letters, changes nothing about the game, isn't persisted, and
// never reopens just because the board is still full.
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
const client = () =>
  fakeCalendarClient([published('2026-10-05', BATS, BATS_LAYOUT), published('2026-10-06', CATS, CATS_LAYOUT)])

type User = ReturnType<typeof userEvent.setup>

const BODY =
  "You've filled every cell, but at least one letter isn't correct. Take another look at your answers and keep trying!"
const CELL_IDS = ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2']

const cell = (id: string) => screen.getByTestId(`cell-${id}`) as HTMLInputElement
const notQuiteThere = () => screen.queryByRole('dialog', { name: 'Not Quite There!' })
const puzzleComplete = () => screen.queryByRole('dialog', { name: 'Puzzle Complete!' })
const score = () => screen.getByTestId('score-badge').textContent
const freeCaption = () => screen.queryByText(/free reveals? remaining/)?.textContent ?? null
const history = () => document.querySelector('.reveal-history-card')?.textContent ?? ''
const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? '{}')

async function typeInto(user: User, id: string, letter: string) {
  await user.click(cell(id))
  await user.keyboard(letter)
}

async function clear(user: User, id: string) {
  await user.click(cell(id))
  await user.keyboard('{Backspace}')
}

async function reveal(user: User, letter: string) {
  await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
  await user.click(screen.getByTestId(`letter-${letter}`))
}

/** Types `letters` into the cells in navigation order, one each ('.' skips a cell). */
async function fill(user: User, letters: string) {
  for (const [index, letter] of [...letters].entries()) {
    if (letter !== '.') await typeInto(user, CELL_IDS[index], letter)
  }
}

async function continuePuzzle(user: User) {
  await user.click(within(notQuiteThere()!).getByRole('button', { name: 'Continue Puzzle' }))
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('when play fills the last empty cell', () => {
  it('with a wrong letter on the board, shows "Not Quite There!" with exactly the approved content', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATX') // r1c2 wrong, r2c2 still empty
    expect(notQuiteThere()).toBeNull()
    await typeInto(user, 'r2c2', 'E')

    const dialog = notQuiteThere()!
    expect(dialog).toBeTruthy()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(within(dialog).getByRole('heading', { name: 'Not Quite There!' })).toBeTruthy()
    expect(screen.getByText(BODY)).toBeTruthy()
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText(BODY).id)
    // Nothing but the title, the message, Close, and Continue Puzzle: no
    // counts, no locations, no letters.
    expect(within(dialog).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
      'Close',
      'Continue Puzzle',
    ])
    expect(dialog.textContent).toBe(`Not Quite There!${BODY}Continue Puzzle`)
    expect(puzzleComplete()).toBeNull()
  })

  it('correctly, shows the existing completion dialog instead', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATIE')
    expect(puzzleComplete()).toBeTruthy()
    expect(notQuiteThere()).toBeNull()
  })

  it('with a reveal while a wrong letter is on the board, shows it too', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATX.')
    await reveal(user, 'E') // fills r2c2, the last empty cell
    expect(cell('r2c2').value).toBe('E')
    expect(notQuiteThere()).toBeTruthy()
  })

  it('never appears for a partially filled board, right or wrong', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'QQQQ')
    await clear(user, 'r0c0')
    await fill(user, 'CAT')
    await reveal(user, 'Z') // zero cells: still partial
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('showing and dismissing it changes nothing about the game', () => {
  it('identifies no cell, and leaves score, reveals, history, completion, and the save untouched', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'C') // a free reveal, so there's history to compare
    await fill(user, '.ATX')
    const before = { score: score(), free: freeCaption(), history: history() }
    await typeInto(user, 'r2c2', 'E')
    expect(notQuiteThere()).toBeTruthy()

    const check = () => {
      for (const id of CELL_IDS) {
        expect(cell(id).className).not.toMatch(/impossible|complete|incorrect|wrong|error/)
        expect(cell(id).getAttribute('aria-invalid')).toBeNull()
        expect(cell(id).disabled).toBe(false)
      }
      expect(cell('r1c2').getAttribute('aria-label')).toBe('Editable, letter X entered')
      expect(cell('r2c2').getAttribute('aria-label')).toBe('Editable, letter E entered')
      expect({ score: score(), free: freeCaption(), history: history() }).toEqual(before)
      expect(stored('cluecross:puzzle-results')).toEqual({})
      expect(stored('cluecross:completed-dates')).toEqual({})
      expect(stored('cluecross:puzzle-progress')).toEqual({
        '2026-10-06:cats': { v: 1, values: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'X', r2c2: 'E' }, reveals: ['C'] },
      })
    }
    check()
    await continuePuzzle(user)
    expect(notQuiteThere()).toBeNull()
    check()
    expect(Object.keys(localStorage).join()).not.toMatch(/modal|incorrect|dismiss/i)
  })
})

describe('dismissal and reappearance', () => {
  it('Continue Puzzle returns to an editable board, and the dialog stays closed while the board stays full', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    await continuePuzzle(user)
    expect(notQuiteThere()).toBeNull()

    await typeInto(user, 'r1c2', 'Y') // replace one wrong letter with another
    await typeInto(user, 'r0c0', 'K') // and a right one with a wrong one
    expect(cell('r1c2').value).toBe('Y')
    expect(cell('r0c0').value).toBe('K')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reappears after a cell is emptied and the board is filled again, still incorrectly', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    await continuePuzzle(user)
    await clear(user, 'r1c2')
    expect(screen.queryByRole('dialog')).toBeNull()
    await typeInto(user, 'r1c2', 'Y')
    expect(notQuiteThere()).toBeTruthy()
  })

  it('also closes with Close, Escape, or a click on the backdrop', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    await user.click(within(notQuiteThere()!).getByRole('button', { name: 'Close' }))
    expect(notQuiteThere()).toBeNull()

    await clear(user, 'r1c2')
    await typeInto(user, 'r1c2', 'X')
    await user.keyboard('{Escape}')
    expect(notQuiteThere()).toBeNull()

    await clear(user, 'r1c2')
    await typeInto(user, 'r1c2', 'X')
    await user.click(document.querySelector('.result-modal__overlay')!)
    expect(notQuiteThere()).toBeNull()
  })

  it('fixing the board after dismissing completes the puzzle normally, with the usual share text', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    await continuePuzzle(user)
    await typeInto(user, 'r1c2', 'I')

    const dialog = puzzleComplete()!
    expect(dialog).toBeTruthy()
    expect(notQuiteThere()).toBeNull()
    expect(cell('r1c2').disabled).toBe(true)
    await user.click(within(dialog).getByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe('ClueCross — Oct 6, 2026\n⭐⭐⭐ 2,000 / 2,000\n0 reveals\ncluecross.com')
    expect(Object.keys(stored('cluecross:puzzle-results'))).toEqual(['2026-10-06:cats'])
  })
})

describe('refresh and archive', () => {
  it('a reload restores a full-but-incorrect board without opening the dialog', async () => {
    const user = userEvent.setup()
    const app = await renderApp(client())
    await fill(user, 'CATXE')
    expect(notQuiteThere()).toBeTruthy()
    app.unmount()

    await renderApp(client())
    expect(CELL_IDS.map((id) => cell(id).value).join('')).toBe('CATXE')
    expect(screen.queryByRole('dialog')).toBeNull()
    await typeInto(user, 'r1c2', 'Y') // still editable; still quiet
    expect(screen.queryByRole('dialog')).toBeNull()
    await clear(user, 'r1c2')
    await typeInto(user, 'r1c2', 'X') // a real fill brings it back
    expect(notQuiteThere()).toBeTruthy()
  })

  it('switching to an archived puzzle and back never opens it on its own', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    await continuePuzzle(user)

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for october 5, 2026/i }))
    await waitFor(() => expect(cell('r0c0').value).toBe(''))
    expect(screen.queryByRole('dialog')).toBeNull()

    await fill(user, 'BATXN') // the archived puzzle gets its own dialog
    expect(notQuiteThere()).toBeTruthy()
    await continuePuzzle(user)

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for october 6, 2026/i }))
    await waitFor(() => expect(cell('r0c0').value).toBe('C'))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for october 5, 2026/i }))
    await waitFor(() => expect(cell('r0c0').value).toBe('B'))
    expect(screen.queryByRole('dialog')).toBeNull()
    await typeInto(user, 'r1c2', 'E') // correct now: the usual completion
    expect(puzzleComplete()).toBeTruthy()
  })
})

describe('keyboard and focus', () => {
  it('focuses the title, traps Tab, activates Continue Puzzle with Enter, and returns focus to the board', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    const dialog = notQuiteThere()!
    expect(document.activeElement).toBe(within(dialog).getByRole('heading', { name: 'Not Quite There!' }))

    const close = within(dialog).getByRole('button', { name: 'Close' })
    const continueButton = within(dialog).getByRole('button', { name: 'Continue Puzzle' })
    await user.tab()
    expect(document.activeElement).toBe(close)
    await user.tab()
    expect(document.activeElement).toBe(continueButton)
    await user.tab()
    expect(document.activeElement).toBe(close) // wraps, never reaching the board
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(continueButton)

    await user.keyboard('{Enter}')
    expect(notQuiteThere()).toBeNull()
    expect((document.activeElement as HTMLElement).dataset.testid).toMatch(/^cell-/)
    await user.keyboard('{Backspace}') // and keyboard play carries on
    expect(CELL_IDS.some((id) => cell(id).value === '')).toBe(true)
  })
})

describe('React StrictMode', () => {
  it('opens a single dialog, once', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <App calendarClient={client()} />
      </StrictMode>,
    )
    await waitFor(() => expect(cell('r0c0')).toBeTruthy())
    await fill(user, 'CATXE')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await continuePuzzle(user)
    expect(screen.queryByRole('dialog')).toBeNull()
    await typeInto(user, 'r1c2', 'Y')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays closed when restoring a full-but-incorrect save', async () => {
    localStorage.setItem(
      'cluecross:puzzle-progress',
      JSON.stringify({ '2026-10-06:cats': { v: 1, values: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'X', r2c2: 'E' }, reveals: [] } }),
    )
    render(
      <StrictMode>
        <App calendarClient={client()} />
      </StrictMode>,
    )
    await waitFor(() => expect(cell('r1c2').value).toBe('X'))
    expect(screen.queryByRole('dialog')).toBeNull()
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

  it('shows the same dialog, which Continue Puzzle closes back to the mobile board', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATXE')
    expect(screen.getByText(BODY)).toBeTruthy()
    await continuePuzzle(user)
    expect(notQuiteThere()).toBeNull()
    expect(screen.getByRole('button', { name: /^reveal letter/i })).toBeTruthy()
    await typeInto(user, 'r1c2', 'I')
    expect(puzzleComplete()).toBeTruthy()
  })

  it('a reveal from the mobile Reveal view that fills the board shows it back on the Puzzle view', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await fill(user, 'CATX.')
    await reveal(user, 'E')
    expect(notQuiteThere()).toBeTruthy()
    expect(cell('r2c2').value).toBe('E')
  })
})
