// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_TOOLS_ENABLED, testToolsEnabledFor } from './state/testTools'
import { fakeCalendarClient, published, renderApp } from './testing/playerHarness'
import { dogsPuzzle } from './testing/fixtures/dogsPuzzle'
import { dogsPuzzleLayout } from './testing/fixtures/dogsPuzzleLayout'

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

// Same fixture puzzle on two dates; Aug 5 is current.
const calendarClient = () =>
  fakeCalendarClient([
    published('2026-08-04', dogsPuzzle, dogsPuzzleLayout),
    published('2026-08-05', dogsPuzzle, dogsPuzzleLayout),
  ])

const CURRENT = '2026-08-05:dogs'
const OTHER = '2026-08-04:dogs'

function stored(key: string): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(key) ?? '{}')
}

function filledCells(): number {
  return Object.keys(dogsPuzzle.cells).filter((id) => (screen.getByTestId(`cell-${id}`) as HTMLInputElement).value !== '').length
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^settings$/i }))
}

describe('test tools gating', () => {
  it('compiles in only for the dev server, tests, and Vercel Preview builds', () => {
    expect(testToolsEnabledFor('development', undefined)).toBe(true)
    expect(testToolsEnabledFor('test', undefined)).toBe(true)
    expect(testToolsEnabledFor('production', 'preview')).toBe(true)
    expect(testToolsEnabledFor('production', 'production')).toBe(false)
    expect(testToolsEnabledFor('production', undefined)).toBe(false) // plain local build
    expect(testToolsEnabledFor('development', 'production')).toBe(false)
    expect(TEST_TOOLS_ENABLED).toBe(true) // this Vitest build
  })

  it('shows Reset Test State in Settings in a test-tools build', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient())
    await openSettings(user)
    expect(screen.getByRole('button', { name: 'Reset Test State' })).toBeTruthy()
  })

  it('has no Reset Test State without test tools (Production configuration)', async () => {
    const user = userEvent.setup()
    await renderApp(calendarClient(), { testTools: false })
    await openSettings(user)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: /reset test state/i })).toBeNull()
    expect(dialog.textContent).not.toMatch(/Testing|Reset Test State/)
    expect(within(dialog).queryByRole('button', { name: /reset/i })).toBeNull() // no reset of any kind
  })
})

describe('Reset Test State', () => {
  it('clears only the current puzzle’s completion and result, and remounts a completed puzzle fresh', async () => {
    localStorage.setItem('cluecross:completed-dates', JSON.stringify({ [CURRENT]: true, [OTHER]: true }))
    const result = { score: 1500, revealHistory: [] }
    localStorage.setItem('cluecross:puzzle-results', JSON.stringify({ [CURRENT]: result, [OTHER]: result }))
    const user = userEvent.setup()
    await renderApp(calendarClient())
    expect(filledCells()).toBe(Object.keys(dogsPuzzle.cells).length) // restored as completed

    await openSettings(user)
    await user.click(screen.getByRole('button', { name: 'Reset Test State' }))

    expect(filledCells()).toBe(0)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe("Today's ClueDogs") // same puzzle and date
    expect(screen.getByTestId('score-badge').textContent).toMatch(/^2000/)
    expect(stored('cluecross:completed-dates')).toEqual({ [OTHER]: true })
    expect(stored('cluecross:puzzle-results')).toEqual({ [OTHER]: result })
  })

  it('discards in-progress session state, and the fresh state survives a reload', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderApp(calendarClient())
    await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
    await user.click(screen.getByTestId('letter-E'))
    expect(filledCells()).toBeGreaterThan(0)

    await openSettings(user)
    await user.click(screen.getByRole('button', { name: 'Reset Test State' }))
    expect(filledCells()).toBe(0)
    expect(screen.getByText(/3 free reveals remaining/i)).toBeTruthy()

    unmount()
    await renderApp(calendarClient())
    expect(filledCells()).toBe(0)
  })
})
