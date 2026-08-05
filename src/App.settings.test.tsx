// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { toDateKey } from './core/archiveCalendar'
import { isDateCompleted } from './core/completionTracking'
import { dogsPuzzle } from './data/dogsPuzzle'

// jsdom's default test origin doesn't provide a working localStorage, so
// stub in a simple in-memory implementation to exercise real persistence.
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

// A fixed "today" with two available dates (today + yesterday), both the
// Dogs puzzle, so completion of one date can be checked once it's no
// longer the "active" (currently viewing) date.
const TODAY = new Date(2026, 7, 5)

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

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-reduce-motion')
})

function getCell(cellId: string): HTMLInputElement {
  return screen.getByTestId(`cell-${cellId}`) as HTMLInputElement
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^settings$/i }))
}

describe('Settings modal', () => {
  it('opens on Settings click and closes via the X button', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('dialog')).toBeNull()
    await openSettings(user)
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /close settings/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openSettings(user)
    expect(screen.getByRole('dialog')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when clicking the backdrop, but not when clicking inside the dialog', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)
    await openSettings(user)

    await user.click(screen.getByRole('heading', { name: /settings/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    const overlay = container.querySelector('.settings-modal__overlay')
    expect(overlay).toBeTruthy()
    await user.click(overlay as Element)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('marks the rest of the page inert while open', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    expect(container.querySelector('.app__content')?.hasAttribute('inert')).toBe(false)
    await openSettings(user)
    expect(container.querySelector('.app__content')?.hasAttribute('inert')).toBe(true)
  })

  it('returns focus to the Settings button after closing', async () => {
    const user = userEvent.setup()
    render(<App />)
    const settingsButton = screen.getByRole('button', { name: /^settings$/i })

    await openSettings(user)
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(settingsButton)
  })

  it('traps Tab focus within the dialog', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openSettings(user)

    const dialog = screen.getByRole('dialog')
    const focusable = dialog.querySelectorAll('button, input')
    const last = focusable[focusable.length - 1] as HTMLElement
    last.focus()

    await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('toggles Reduce Motion and applies it as a data attribute on <html>', async () => {
    const user = userEvent.setup()
    render(<App />)
    await openSettings(user)

    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    expect(document.documentElement.dataset.reduceMotion).toBe('false')

    await user.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(document.documentElement.dataset.reduceMotion).toBe('true')
  })

  it('persists Reduce Motion across a remount via localStorage', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)
    await openSettings(user)
    await user.click(screen.getByRole('checkbox', { name: /reduce motion/i }))
    unmount()

    render(<App />)
    await openSettings(user)
    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('requires confirmation before resetting the current puzzle, and clears progress on confirm', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(getCell('r0c0'))
    await user.keyboard('S')
    expect(getCell('r0c0').value).toBe('S')

    await openSettings(user)
    await user.click(screen.getByRole('button', { name: /reset current puzzle/i }))
    expect(screen.getByText(/reset your progress/i)).toBeTruthy()

    // Cancel backs out without resetting or closing the modal.
    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByText(/reset your progress/i)).toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(getCell('r0c0').value).toBe('S')

    await user.click(screen.getByRole('button', { name: /reset current puzzle/i }))
    await user.click(screen.getByRole('button', { name: /^reset$/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(getCell('r0c0').value).toBe('')
  })
})

describe('Completion tracking', () => {
  it('marks a date completed once its puzzle is solved, distinct from the active date', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const cell of Object.values(dogsPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }
    expect(isDateCompleted(toDateKey(TODAY))).toBe(true)

    // Switch to yesterday's puzzle so today is no longer the "active" date
    // — active takes visual priority over completed in the calendar.
    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for august 4, 2026/i }))

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    expect(
      screen.getByRole('button', { name: /august 5, 2026 \(completed\)/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /august 4, 2026 \(currently viewing\)/i }),
    ).toBeTruthy()
  })

  it('resetting the current puzzle does not un-mark it as completed', async () => {
    const user = userEvent.setup()
    render(<App />)

    for (const cell of Object.values(dogsPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }
    expect(isDateCompleted(toDateKey(TODAY))).toBe(true)

    await openSettings(user)
    await user.click(screen.getByRole('button', { name: /reset current puzzle/i }))
    await user.click(screen.getByRole('button', { name: /^reset$/i }))

    expect(isDateCompleted(toDateKey(TODAY))).toBe(true)
  })
})
