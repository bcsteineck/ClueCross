// @vitest-environment jsdom
// Completion sharing through the real player: the completion modal's Share
// Result and the completed puzzle's persistent Share Result (in the Reveal
// Letter slot) share the same text, on desktop (clipboard) and mobile
// (native share sheet), for the current puzzle, after a reload, and for
// archived puzzles.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
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
const client = () => fakeCalendarClient([published('2026-10-05', BATS, BATS_LAYOUT), published('2026-10-06', CATS, CATS_LAYOUT)])

// Revealing C, A, T, I, E: three free reveals, then I (150) and E (170).
const CATS_TEXT = 'ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,680 / 2,000\n5 reveals\ncluecross.com'
const BATS_TYPED_TEXT = 'ClueCross — Oct 5, 2026\n⭐⭐⭐ 2,000 / 2,000\n0 reveals\ncluecross.com'

type User = ReturnType<typeof userEvent.setup>

async function reveal(user: User, letter: string) {
  await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
  await user.click(screen.getByTestId(`letter-${letter}`))
}

async function completeByRevealing(user: User) {
  for (const letter of ['C', 'A', 'T', 'I', 'E']) await reveal(user, letter)
}

async function completeByTyping(user: User, puzzle: PuzzleDefinition) {
  for (const cell of Object.values(puzzle.cells)) {
    await user.click(screen.getByTestId(`cell-${cell.id}`))
    await user.keyboard(cell.correctLetter)
  }
}

const modal = () => screen.queryByRole('dialog', { name: /puzzle complete/i })
const persistentShare = () => document.querySelector<HTMLButtonElement>('[data-share-result]')

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (navigator as unknown as Record<string, unknown>).share
})

describe('desktop sharing (clipboard)', () => {
  it('Reveal Letter becomes Share Result on completion; the modal and persistent control copy identical text', async () => {
    const user = userEvent.setup()
    await renderApp(client())
    expect(screen.getByRole('button', { name: /^reveal letter/i })).toBeTruthy()
    expect(persistentShare()).toBeNull()

    await completeByRevealing(user)
    const dialog = modal()!
    const modalShare = within(dialog).getByRole('button', { name: 'Share Result' })
    await user.click(modalShare)
    expect(await navigator.clipboard.readText()).toBe(CATS_TEXT)
    expect(within(dialog).getByRole('status').textContent).toBe('Copied!')

    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(modal()).toBeNull()
    // Focus lands on the persistent control rather than the disabled last cell.
    expect(document.activeElement).toBe(persistentShare())
    expect(screen.queryByRole('button', { name: /^reveal letter/i })).toBeNull() // not a disabled Reveal Letter

    // While idle there's no empty caption line under the button (no gap above the next card).
    const group = persistentShare()!.parentElement!
    expect(group.querySelector('.reveal-button__sublabel')).toBeNull()

    await navigator.clipboard.writeText('')
    await user.click(screen.getByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe(CATS_TEXT)
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Copied!')).toBe(true)
    // The visible caption appears only with a message; the always-mounted live region announces it.
    const caption = group.querySelector('.reveal-button__sublabel')!
    expect(caption.textContent).toBe('Copied!')
    expect(caption.getAttribute('aria-hidden')).toBe('true')
    expect(within(group).getByRole('status').textContent).toBe('Copied!')
    // Shares in place: no modal, no Reveal view.
    expect(modal()).toBeNull()
    expect(screen.queryByTestId('letter-C')).toBeNull()
  })

  it('shares the same result after a reload, without reopening the modal', async () => {
    const user = userEvent.setup()
    const first = await renderApp(client())
    await completeByRevealing(user)
    first.unmount()

    await renderApp(client())
    expect(modal()).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe(CATS_TEXT) // same score and exact reveal count
  })

  it("an archived puzzle shares its own publish date and result, and switching puzzles doesn't leak results", async () => {
    const user = userEvent.setup()
    await renderApp(client())
    await completeByRevealing(user)
    await user.click(within(modal()!).getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for october 5, 2026/i }))
    await waitFor(() => expect(screen.getByTestId('cell-r0c0')).toBeTruthy())
    expect(screen.getByRole('button', { name: /^reveal letter/i })).toBeTruthy() // Oct 5 not completed yet
    await completeByTyping(user, BATS)
    await user.click(within(modal()!).getByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe(BATS_TYPED_TEXT)
    await user.click(within(modal()!).getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for october 6, 2026/i }))
    await user.click(await screen.findByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe(CATS_TEXT)

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for october 5, 2026/i }))
    await user.click(await screen.findByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe(BATS_TYPED_TEXT)
  })

  it('uses the clipboard on desktop even when the browser offers navigator.share', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const user = userEvent.setup()
    await renderApp(client())
    await completeByRevealing(user)
    await user.click(within(modal()!).getByRole('button', { name: 'Share Result' }))
    expect(await navigator.clipboard.readText()).toBe(CATS_TEXT)
    expect(share).not.toHaveBeenCalled()
  })
})

describe('mobile sharing (native share sheet)', () => {
  beforeEach(() => {
    // A phone: the mobile layout breakpoint and a coarse (touch) pointer.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width') || query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  })

  it('shares the same text from the modal and from the Share Result that replaces Reveal Letter', async () => {
    const share = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    const user = userEvent.setup()
    await renderApp(client())

    await completeByRevealing(user)
    await user.click(within(modal()!).getByRole('button', { name: 'Share Result' }))
    expect(share).toHaveBeenLastCalledWith({ text: CATS_TEXT })

    await user.click(within(modal()!).getByRole('button', { name: 'Close' }))
    expect(document.activeElement).toBe(persistentShare())
    expect(screen.queryByRole('button', { name: /^reveal letter/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Share Result' }))
    expect(share).toHaveBeenCalledTimes(2)
    expect(share).toHaveBeenLastCalledWith({ text: CATS_TEXT })
    expect(modal()).toBeNull()
  })

  it('keeps Reveal Letter for an incomplete puzzle', async () => {
    await renderApp(client())
    expect(screen.getByRole('button', { name: /^reveal letter/i })).toBeTruthy()
    expect(persistentShare()).toBeNull()
  })
})
