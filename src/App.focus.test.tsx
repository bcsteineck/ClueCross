// @vitest-environment jsdom
// Regression tests for puzzle input/focus consistency: the visible active
// cell must be where typing goes, a manually entered letter is always
// replaceable while its cell is active, a stale impossible-letter alert
// clears as soon as the cell's value is eligible, and a completed puzzle is
// readable but no longer looks or behaves editable.
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// CAT across (r0c0–r0c2) crossing TIE down (r0c2–r2c2).
const puzzle: PuzzleDefinition = {
  id: 'cats',
  clue: 'Cats',
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
}
const layout: LayoutDefinition = {
  id: 'cats-grid',
  puzzleId: 'cats',
  cellPositions: {
    r0c0: { x: 0, y: 0 },
    r0c1: { x: 1, y: 0 },
    r0c2: { x: 2, y: 0 },
    r1c2: { x: 2, y: 1 },
    r2c2: { x: 2, y: 2 },
  },
  navigationOrder: ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'],
}

const client = () => fakeCalendarClient([published('2026-10-12', puzzle, layout)])

const cell = (id: string) => screen.getByTestId(`cell-${id}`) as HTMLInputElement
const activeCells = () => document.querySelectorAll('.cell--active')
const banner = () => screen.queryByText(/has already been revealed/)

// Keyboards that report no key (keydown "Unidentified") deliver input events only.
function typeViaInputEvent(id: string, rawValue: string) {
  fireEvent.keyDown(cell(id), { key: 'Unidentified' })
  fireEvent.change(cell(id), { target: { value: rawValue } })
}

async function reveal(user: ReturnType<typeof userEvent.setup>, letter: string) {
  await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
  await user.click(screen.getByTestId(`letter-${letter}`))
}

describe('impossible-letter alert', () => {
  it('clears immediately when the same cell gets an eligible letter', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'A')

    // The last cell of TIE: auto-advance has nowhere to go, so it stays active.
    await user.click(cell('r2c2'))
    await user.keyboard('A')
    expect(banner()).toBeTruthy()
    expect(cell('r2c2').className).toContain('cell--impossible')
    expect(document.activeElement).toBe(cell('r2c2'))

    await user.keyboard('E')
    expect(cell('r2c2').value).toBe('E')
    expect(banner()).toBeNull()
    expect(cell('r2c2').className).not.toContain('cell--impossible')
  })

  it('clears when the flagged cell is corrected after returning to it', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'A')
    await user.click(cell('r1c2'))
    await user.keyboard('A') // impossible; auto-advances to r2c2
    expect(banner()).toBeTruthy()

    await user.click(cell('r1c2'))
    await user.keyboard('I')
    expect(cell('r1c2').value).toBe('I')
    expect(banner()).toBeNull()
    expect(cell('r1c2').className).not.toContain('cell--impossible')
  })

  it('stays when the replacement is also ineligible', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'A')
    await reveal(user, 'C')
    await user.click(cell('r2c2'))
    await user.keyboard('A')
    await user.keyboard('C')
    expect(cell('r2c2').value).toBe('C')
    expect(banner()?.textContent).toMatch('Every "C" has already been revealed')
    expect(cell('r2c2').className).toContain('cell--impossible')
  })
})

describe('replacing a letter in the active cell', () => {
  it('replaces the last letter of an entry where auto-advance stopped', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r0c0'))
    await user.keyboard('CAT')
    // CAT ends at r0c2: nowhere further across, so r0c2 stays active.
    expect(document.activeElement).toBe(cell('r0c2'))
    expect(cell('r0c2').value).toBe('T')

    await user.keyboard('X')
    expect(cell('r0c2').value).toBe('X')
    await user.keyboard('t') // lowercase is entered uppercase, as before
    expect(cell('r0c2').value).toBe('T')
  })

  it('replaces after clicking the already-active cell (which places a caret)', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r2c2'))
    await user.keyboard('Q')
    await user.click(cell('r2c2'))
    await user.keyboard('E')
    expect(cell('r2c2').value).toBe('E')
  })

  it('still never changes a revealed (locked) cell', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'T')
    await user.click(cell('r0c2'))
    await user.keyboard('X')
    expect(cell('r0c2').value).toBe('T')
  })
})

// Keyboards that report no key (keydown "Unidentified", e.g. Android
// on-screen keyboards) only deliver input events: the cell briefly holds the
// old letter plus the new one, on either side of the caret.
describe('input-event-only replacement', () => {
  it('leaves no selected text when auto-advance stops on a filled cell', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r0c0'))
    await user.keyboard('CAT')
    expect(document.activeElement).toBe(cell('r0c2'))
    expect(cell('r0c2').selectionStart).toBe(cell('r0c2').selectionEnd)
  })

  it('replaces the existing letter rather than appending, whichever side the new letter lands', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r0c0'))
    await user.keyboard('CAT')

    typeViaInputEvent('r0c2', 'TX') // caret after the old letter
    expect(cell('r0c2').value).toBe('X')
    typeViaInputEvent('r0c2', 'qX') // caret before it; lowercase still uppercased
    expect(cell('r0c2').value).toBe('Q')
    expect(document.activeElement).toBe(cell('r0c2')) // end of entry: no advance
  })

  it('still enters and auto-advances from an empty cell', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r0c0'))
    typeViaInputEvent('r0c0', 'c')
    expect(cell('r0c0').value).toBe('C')
    expect(document.activeElement).toBe(cell('r0c1'))
  })

  it('flags an impossible letter and clears it when replaced with an eligible one', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'A')
    await user.click(cell('r2c2'))
    typeViaInputEvent('r2c2', 'A')
    expect(banner()).toBeTruthy()
    typeViaInputEvent('r2c2', 'AE')
    expect(cell('r2c2').value).toBe('E')
    expect(banner()).toBeNull()
    expect(cell('r2c2').className).not.toContain('cell--impossible')
  })

  it('never changes a revealed (locked) cell', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await reveal(user, 'T')
    typeViaInputEvent('r0c2', 'TX')
    expect(cell('r0c2').value).toBe('T')
  })
})

// jsdom can't show a native selection highlight, so these check what the
// code does: activating a filled cell never selects its text, and the next
// letter still replaces it.
describe('returning to a filled cell', () => {
  it('activates it with a collapsed caret, never selecting the letter, and replaces on typing', async () => {
    const select = vi.spyOn(HTMLInputElement.prototype, 'select')
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r0c0'))
    await user.keyboard('C') // advances to r0c1
    expect(document.activeElement).toBe(cell('r0c1'))

    await user.click(cell('r0c0'))
    expect(document.activeElement).toBe(cell('r0c0'))
    expect(cell('r0c0').className).toContain('cell--active')
    expect(cell('r0c0').selectionStart).toBe(1)
    expect(cell('r0c0').selectionEnd).toBe(1)

    await user.keyboard('X')
    expect(cell('r0c0').value).toBe('X')
    expect(document.activeElement).toBe(cell('r0c1')) // auto-advance unchanged
    expect(select).not.toHaveBeenCalled()
  })

  it('collapses a selection a pointer gesture leaves behind', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r1c2'))
    await user.keyboard('I')
    await user.click(cell('r0c0'))

    // A tap can land with the letter selected (as a double-tap would).
    cell('r1c2').setSelectionRange(0, 1)
    await user.click(cell('r1c2'))
    expect(cell('r1c2').selectionStart).toBe(cell('r1c2').selectionEnd)

    typeViaInputEvent('r1c2', 'IQ')
    expect(cell('r1c2').value).toBe('Q')
  })

  it('collapses the caret when a filled cell is reached from the keyboard', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r0c0'))
    await user.keyboard('CA') // r0c1 filled; now on r0c2
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement).toBe(cell('r0c1'))
    expect(cell('r0c1').selectionStart).toBe(cell('r0c1').selectionEnd)
    await user.keyboard('O')
    expect(cell('r0c1').value).toBe('O')
  })
})

describe('completed puzzle', () => {
  it('stays readable but no longer takes focus or shows the editing state', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    for (const letter of ['C', 'A', 'T', 'I', 'E']) await reveal(user, letter)
    await user.click(screen.getByRole('button', { name: /close|continue|done/i }))

    const board = screen.getByRole('group', { name: 'Puzzle board, completed' })
    expect(board).toBeTruthy()
    for (const [id, letter] of Object.entries({ r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'I', r2c2: 'E' })) {
      expect(cell(id).value).toBe(letter)
      expect(cell(id).disabled).toBe(true)
      expect(cell(id).tabIndex).toBe(-1)
      expect(cell(id).getAttribute('aria-label')).toBe(`Completed, letter ${letter}`)
    }

    await user.click(cell('r0c0'))
    expect(document.activeElement).not.toBe(cell('r0c0'))
    expect(activeCells()).toHaveLength(0)
    await user.keyboard('Z')
    expect(cell('r0c0').value).toBe('C')
  })
})

describe('focus leaving the puzzle', () => {
  it('shows no active cell until the board has focus, and clears it when focus leaves', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    expect(activeCells()).toHaveLength(0)

    await user.click(cell('r0c0'))
    expect(activeCells()).toHaveLength(1)
    expect(cell('r0c0').className).toContain('cell--active')

    // Pointer: click a non-interactive area outside the board.
    await user.click(screen.getByText('Fill in the hidden words that all relate to Cats.'))
    expect(document.activeElement).not.toBe(cell('r0c0'))
    expect(activeCells()).toHaveLength(0)
    await user.keyboard('Q')
    expect(cell('r0c0').value).toBe('')

    // Returning restores normal editing.
    await user.click(cell('r0c0'))
    expect(cell('r0c0').className).toContain('cell--active')
    await user.keyboard('C')
    expect(cell('r0c0').value).toBe('C')
  })

  it('clears the active state when keyboard focus tabs out, and Tab back returns to the remembered cell', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await user.click(cell('r1c2'))
    expect(cell('r1c2').className).toContain('cell--active')

    await user.tab()
    expect(document.activeElement?.getAttribute('data-testid')?.startsWith('cell-')).not.toBe(true)
    expect(activeCells()).toHaveLength(0)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(cell('r1c2'))
    expect(cell('r1c2').className).toContain('cell--active')
  })
})
