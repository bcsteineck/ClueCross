// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { hasCompletedOnboarding, markOnboardingCompleted } from './core/onboardingCompletion'

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

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function getOnboardingDialog() {
  return screen.getByRole('dialog', { name: /one clue\. many words\./i })
}

describe('Onboarding', () => {
  it('opens automatically on a genuine first visit', () => {
    render(<App />)
    expect(getOnboardingDialog()).toBeTruthy()
  })

  it('does not open on a return visit once already completed', () => {
    markOnboardingCompleted()
    render(<App />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('steps forward and back through cards via Next and Back', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: /one clue\. many words\./i })).toBeTruthy()
    expect((screen.getByRole('button', { name: /^back$/i }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    await user.click(screen.getByRole('button', { name: /^next$/i }))
    expect(screen.getByRole('heading', { name: /complete the puzzle/i })).toBeTruthy()
    expect((screen.getByRole('button', { name: /^back$/i }) as HTMLButtonElement).disabled).toBe(
      false,
    )

    await user.click(screen.getByRole('button', { name: /^back$/i }))
    expect(screen.getByRole('heading', { name: /one clue\. many words\./i })).toBeTruthy()
  })

  it('shows Start Playing only on the final card, and it closes onboarding', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('button', { name: /start playing/i })).toBeNull()
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /^next$/i }))
    }
    expect(screen.getByRole('heading', { name: /explore the archive/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^next$/i })).toBeNull()

    await user.click(screen.getByRole('button', { name: /start playing/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hasCompletedOnboarding()).toBe(true)
  })

  it('closes and marks completion when skipped from any card', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^next$/i }))
    await user.click(screen.getByRole('button', { name: /^skip$/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hasCompletedOnboarding()).toBe(true)
  })

  it('returns the player directly to their already-loaded puzzle after skipping', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^skip$/i }))

    expect(screen.getByRole('heading', { name: /clue:/i })).toBeTruthy()
    expect(screen.getAllByTestId(/^cell-/).length).toBeGreaterThan(0)
  })

  it('closes on Escape and still marks onboarding complete', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hasCompletedOnboarding()).toBe(true)
  })

  it('marks the rest of the page inert while open', () => {
    const { container } = render(<App />)
    expect(container.querySelector('.app__content')?.hasAttribute('inert')).toBe(true)
  })

  it('reopens from the How to Play button after being dismissed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^skip$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: /how to play/i }))
    expect(getOnboardingDialog()).toBeTruthy()
    // Reopening starts from the first card again, not wherever it left off.
    expect(screen.getByRole('heading', { name: /one clue\. many words\./i })).toBeTruthy()
  })

  it('reopens from the mobile menu\'s How to Play entry', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^skip$/i }))

    await user.click(screen.getByRole('button', { name: /open menu/i }))
    const menuDialog = screen.getByRole('dialog', { name: /^menu$/i })
    await user.click(within(menuDialog).getByRole('button', { name: /how to play/i }))

    expect(getOnboardingDialog()).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: /^menu$/i })).toBeNull()
  })

  it('navigates cards with the ArrowRight and ArrowLeft keys', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('heading', { name: /complete the puzzle/i })).toBeTruthy()

    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('heading', { name: /one clue\. many words\./i })).toBeTruthy()
  })

  it('returns focus to the How to Play button after closing a reopened session', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /^skip$/i }))

    const howToPlayButton = screen.getByRole('button', { name: /how to play/i })
    await user.click(howToPlayButton)
    await user.keyboard('{Escape}')

    expect(document.activeElement).toBe(howToPlayButton)
  })
})
