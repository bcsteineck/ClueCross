// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeCalendarClient, published, renderApp } from './testing/playerHarness'
import { dogsPuzzleLayout } from './testing/fixtures/dogsPuzzleLayout'
import { toDateKey } from './core/archiveCalendar'
import { isDateCompleted } from './core/completionTracking'
import { dogsPuzzle } from './testing/fixtures/dogsPuzzle'

// Released puzzles served by a fake player API.
const calendarClient = () =>
  fakeCalendarClient([
    published('2026-08-04', dogsPuzzle, dogsPuzzleLayout),
    published('2026-08-05', dogsPuzzle, dogsPuzzleLayout),
  ])

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

describe('Settings drawer', () => {
  it('opens on Settings click and closes via the X button', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())

    expect(screen.queryByRole('dialog')).toBeNull()
    await openSettings(user)
    expect(screen.getByRole('dialog', { name: /settings/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /close settings/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())
    await openSettings(user)
    expect(screen.getByRole('dialog')).toBeTruthy()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when clicking the backdrop, but not when clicking inside the dialog', async () => {
    const user = userEvent.setup()
    const { container } = await renderApp(calendarClient())
    await openSettings(user)

    await user.click(screen.getByRole('heading', { name: /settings/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    const overlay = container.querySelector('.nav-drawer__overlay')
    expect(overlay).toBeTruthy()
    await user.click(overlay as Element)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('marks the rest of the page inert while open', async () => {
    const user = userEvent.setup()
    const { container } = await renderApp(calendarClient())

    expect(container.querySelector('.app__content')?.hasAttribute('inert')).toBe(false)
    await openSettings(user)
    expect(container.querySelector('.app__content')?.hasAttribute('inert')).toBe(true)
  })

  it('returns focus to the Settings button after closing', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())
    const settingsButton = screen.getByRole('button', { name: /^settings$/i })

    await openSettings(user)
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(settingsButton)
  })

  it('traps Tab focus within the dialog', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())
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
    await renderApp(calendarClient())
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
    const { unmount } = await renderApp(calendarClient())
    await openSettings(user)
    await user.click(screen.getByRole('checkbox', { name: /reduce motion/i }))
    unmount()

    await renderApp(calendarClient())
    await openSettings(user)
    const checkbox = screen.getByRole('checkbox', { name: /reduce motion/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('offers players no way to reset the puzzle (that would hand back free reveals)', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())
    await user.click(getCell('r0c0'))
    await user.keyboard('S')

    await openSettings(user)
    expect(screen.queryByRole('button', { name: /reset current puzzle/i })).toBeNull()
    expect(screen.queryByText(/reset your progress/i)).toBeNull()
    expect(getCell('r0c0').value).toBe('S')
  })
})

describe('Completion tracking', () => {
  it('marks a date completed once its puzzle is solved, distinct from the active date', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())

    for (const cell of Object.values(dogsPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }
    expect(isDateCompleted(toDateKey(TODAY), dogsPuzzle.id)).toBe(true)

    // Switch to yesterday's puzzle so today is no longer the "active" date
    // — active takes visual priority over completed in the calendar.
    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    await user.click(screen.getByRole('button', { name: /open puzzle for august 4, 2026/i }))

    await user.click(screen.getByRole('button', { name: /^archive$/i }))
    // Filled entirely by typing with no reveals, so the score stays at the
    // full starting budget (2000) — a 3-star result.
    expect(
      screen.getByRole('button', { name: /august 5, 2026 \(completed, 3 out of 3 stars\)/i }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /august 4, 2026 \(currently viewing\)/i }),
    ).toBeTruthy()
  })
})

describe('Settings in a production build', () => {
  beforeEach(() => {
    vi.stubEnv('DEV', false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('has no reset control for a general player, before or after completing a puzzle', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())
    await openSettings(user)
    expect(screen.queryByRole('button', { name: /reset current puzzle/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /close settings/i }))

    for (const cell of Object.values(dogsPuzzle.cells)) {
      await user.click(getCell(cell.id))
      await user.keyboard(cell.correctLetter)
    }
    expect(isDateCompleted(toDateKey(TODAY), dogsPuzzle.id)).toBe(true)
    await user.click(screen.getByRole('button', { name: /^close$/i })) // the completion dialog
    await openSettings(user)
    expect(screen.queryByRole('button', { name: /reset current puzzle/i })).toBeNull()
  })
})
