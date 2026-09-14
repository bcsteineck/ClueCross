// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

// A fixed "today" with two available dates (today + yesterday), both the
// Dogs puzzle — mirrors the fixture already used by App.settings.test.tsx,
// reused here so the Archive-related mobile tests have something to select.

vi.mock('./data/archivePuzzles', async () => {
  const { dogsPuzzle } = await import('./data/dogsPuzzle')
  const { dogsPuzzleLayout } = await import('./layout/dogsPuzzleLayout')
  const { addMonths, startOfDay, startOfMonth, toDateKey } = await import('./core/archiveCalendar')

  const today = startOfDay(new Date(2026, 7, 5))
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const entries: Record<string, { puzzle: typeof dogsPuzzle; layout: typeof dogsPuzzleLayout }> = {
    [toDateKey(today)]: { puzzle: dogsPuzzle, layout: dogsPuzzleLayout },
    [toDateKey(yesterday)]: { puzzle: dogsPuzzle, layout: dogsPuzzleLayout },
  }

  return {
    getToday: () => today,
    getArchiveEntryForDate: (date: Date) => entries[toDateKey(date)],
    isDateAvailable: (date: Date) => {
      if (startOfDay(date).getTime() > today.getTime()) return false
      return entries[toDateKey(date)] !== undefined
    },
    getEarliestArchiveMonth: () => addMonths(startOfMonth(today), -2),
  }
})

// jsdom doesn't implement matchMedia at all — stub a minimal
// EventTarget-less implementation that always reports the mobile query as
// matching, which is what useIsMobile() reads.
function stubMobileMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  )
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  stubMobileMatchMedia()
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function getCell(cellId: string): HTMLInputElement {
  return screen.getByTestId(`cell-${cellId}`) as HTMLInputElement
}

describe('Mobile layout', () => {
  it('shows the persistent mobile header with icon-only Info/Settings/Archive controls, no hamburger', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /^cluecross$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^how to play$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^settings$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^archive$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /open menu/i })).toBeNull()
  })

  it('shows the info bar and puzzle board on the Puzzle view', () => {
    render(<App />)

    expect(screen.getByText(/today's clue/i)).toBeTruthy()
    expect(screen.getByText('Dogs')).toBeTruthy()
    expect(screen.getAllByTestId(/^cell-/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^reveal letter/i })).toBeTruthy()
  })

  it('opens the Reveal Letter view with the same info bar, and Cancel returns to Puzzle unchanged', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^reveal letter/i }))

    expect(screen.getByText(/select letter to reveal/i)).toBeTruthy()
    expect(screen.getByText(/today's clue/i)).toBeTruthy() // info bar persists
    expect(screen.getByTestId('letter-A')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /cancel reveal letter/i }))

    expect(screen.queryByText(/select letter to reveal/i)).toBeNull()
    expect(screen.getAllByTestId(/^cell-/).length).toBeGreaterThan(0)
  })

  it('revealing a letter returns to the Puzzle view automatically', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
    await user.click(screen.getByTestId('letter-S'))

    expect(screen.queryByText(/select letter to reveal/i)).toBeNull()
    expect(getCell('r0c0').value).toBe('S')
    expect(getCell('r0c0').readOnly).toBe(true)
  })

  it('navigates to Stats via the info bar, keeping the persistent header visible, and returns via Back to Puzzle', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /stats/i }))

    expect(screen.getByRole('heading', { name: /your score/i })).toBeTruthy()
    expect(screen.getByText(/progress/i)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /reveal history/i })).toBeTruthy()
    // Stats contains only Score/Progress/Reveal History — How to Play is
    // its own dedicated view, not duplicated here.
    expect(screen.queryByText(/how it works/i)).toBeNull()
    // The persistent header stays visible on Stats too (spec section 6).
    expect(screen.getByRole('button', { name: /^archive$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /back to puzzle/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /back to puzzle/i }))

    expect(screen.getAllByTestId(/^cell-/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /^archive$/i })).toBeTruthy()
  })

  it('keeps the persistent header visible on Archive and How to Play as well', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(screen.getByRole('button', { name: /^cluecross$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^settings$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /back to puzzle/i })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /back to puzzle/i }))

    await user.click(screen.getByRole('button', { name: /^how to play$/i }))
    expect(screen.getByRole('button', { name: /^cluecross$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^settings$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /back to puzzle/i })).toBeTruthy()
  })

  it('navigates to Archive via the header icon, selecting a date returns to Puzzle', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(screen.getByRole('group', { name: /puzzle calendar/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /open puzzle for august 4, 2026/i }))

    expect(screen.getByText(/august 4, 2026/i)).toBeTruthy() // archived date's clue label
    expect(screen.getAllByTestId(/^cell-/).length).toBeGreaterThan(0)
  })

  it('opens How to Play via the Info icon and returns via Back to Puzzle', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^how to play$/i }))
    expect(screen.getByRole('heading', { name: /how to play/i })).toBeTruthy()
    expect(screen.getByText(/three free reveals/i)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /back to puzzle/i }))
    expect(screen.getAllByTestId(/^cell-/).length).toBeGreaterThan(0)
  })

  it('opens Settings from the persistent header, same as desktop', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^settings$/i }))
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeTruthy()
  })

  it('dismisses the native-keyboard-focused cell when navigating to a different view', async () => {
    // Views fully replace the Puzzle board's DOM, so this can't observe
    // much on a switch to e.g. Stats (the cell is simply gone). Settings
    // is the meaningful case: it opens as an overlay on top of the
    // still-mounted board, so the focused cell input is still present and
    // would otherwise be left holding native-keyboard focus underneath it.
    const user = userEvent.setup()
    render(<App />)
    const cell = getCell('r0c0')

    await user.click(cell)
    expect(document.activeElement).toBe(cell)

    await user.click(screen.getByRole('button', { name: /^settings$/i }))
    expect(document.activeElement).not.toBe(cell)
  })

  it('uses inputMode="text" so the native keyboard can appear, instead of suppressing it', () => {
    render(<App />)
    expect(getCell('r0c0').getAttribute('inputmode')).toBe('text')
  })

  it('keeps typed progress when navigating away and back via Stats', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r0c0'))
    await user.keyboard('S')
    expect(getCell('r0c0').value).toBe('S')

    await user.click(screen.getByRole('button', { name: /stats/i }))
    await user.click(screen.getByRole('button', { name: /back to puzzle/i }))

    expect(getCell('r0c0').value).toBe('S')
  })
})

describe('Responsive breakpoint switch', () => {
  it('renders the desktop dashboard when the mobile media query does not match', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    )
    render(<App />)

    // Desktop's header shows Archive/Settings as visible text buttons
    // alongside the three-column dashboard; mobile's are icon-only with no
    // "Your Score"/"Progress" cards sitting beside the board.
    expect(screen.getByRole('heading', { name: /your score/i })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /progress/i })).toBeTruthy()
  })
})
