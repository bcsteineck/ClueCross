// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompletedGameState, createInitialGameState } from '../core/gameEngine'
import type { GameState } from '../core/gameEngine'
import type { PuzzleDefinition, RevealHistoryEntry } from '../core/types'
import { PuzzleSessionContext } from './PuzzleSessionContext'
import { prefersNativeShare, STATUS_DISPLAY_MS, useShareResult } from './useShareResult'

const CATS: PuzzleDefinition = {
  id: 'cats',
  clue: 'Cats',
  unlockBudget: 2000,
  cells: {
    r0c0: { id: 'r0c0', correctLetter: 'C' },
    r0c1: { id: 'r0c1', correctLetter: 'A' },
    r0c2: { id: 'r0c2', correctLetter: 'T' },
  },
  entries: [{ id: 'cat', cellIds: ['r0c0', 'r0c1', 'r0c2'] }],
}

const HISTORY: RevealHistoryEntry[] = [
  { letter: 'Q', cost: 30, cellsRevealed: 0 },
  { letter: 'X', cost: 40, cellsRevealed: 0 },
  { letter: 'T', cost: 'Free', cellsRevealed: 1 },
  { letter: 'A', cost: 'Free', cellsRevealed: 1 },
  { letter: 'C', cost: 'Free', cellsRevealed: 1 },
]
const COMPLETED = createCompletedGameState(CATS, { score: 1740, revealHistory: HISTORY })
const EXPECTED_TEXT = 'ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,740 / 2,000\n5 reveals\ncluecross.com'

const define = (target: object, key: string, value: unknown) =>
  Object.defineProperty(target, key, { value, configurable: true, writable: true })

function stubPlatform({ coarse, share, clipboard }: { coarse: boolean; share?: unknown; clipboard?: unknown }) {
  define(window, 'matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)', media: query }))
  define(navigator, 'share', share)
  define(navigator, 'clipboard', clipboard)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  for (const key of ['share', 'clipboard'] as const) delete (navigator as unknown as Record<string, unknown>)[key]
  delete (window as unknown as Record<string, unknown>).matchMedia
})

function Harness() {
  const { share, message, canShare } = useShareResult()
  return (
    <>
      <button type="button" onClick={share}>
        Share Result
      </button>
      <p role="status">{message}</p>
      <span data-testid="can-share">{String(canShare)}</span>
    </>
  )
}

function renderWith(state: GameState = COMPLETED, publishDate = '2026-10-06') {
  return render(
    <PuzzleSessionContext.Provider
      value={{
        state,
        publishDate,
        setCellValue: () => {},
        revealLetter: () => {},
        justCompleted: false,
        dismissCompletion: () => {},
        justFilledIncorrectly: false,
        dismissIncorrectFill: () => {},
      }}
    >
      <Harness />
    </PuzzleSessionContext.Provider>,
  )
}

const click = () => fireEvent.click(screen.getByRole('button', { name: 'Share Result' }))
const status = () => screen.getByRole('status').textContent
const settle = () => act(async () => {})

describe('prefersNativeShare (mobile vs desktop)', () => {
  it('uses the share sheet only on a touchscreen (coarse pointer) device with Web Share', () => {
    stubPlatform({ coarse: true, share: () => Promise.resolve() })
    expect(prefersNativeShare()).toBe(true)
    stubPlatform({ coarse: false, share: () => Promise.resolve() }) // desktop that has navigator.share
    expect(prefersNativeShare()).toBe(false)
    stubPlatform({ coarse: true, share: undefined }) // phone browser without Web Share
    expect(prefersNativeShare()).toBe(false)
    delete (window as unknown as Record<string, unknown>).matchMedia
    define(navigator, 'share', () => Promise.resolve())
    expect(prefersNativeShare()).toBe(false)
  })
})

describe('mobile: native share sheet', () => {
  it('calls navigator.share synchronously in the click with only the exact text', () => {
    const share = vi.fn(() => Promise.resolve())
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: true, share, clipboard: { writeText } })
    renderWith()
    click()
    // Called inside the click itself — no await in between — so the user gesture is kept.
    expect(share).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledWith({ text: EXPECTED_TEXT })
    expect(Object.keys((share.mock.calls[0] as unknown as [object])[0])).toEqual(['text']) // no title, no url
    expect(writeText).not.toHaveBeenCalled()
  })

  it('treats dismissing the share sheet as normal: no message', async () => {
    stubPlatform({ coarse: true, share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')) })
    renderWith()
    click()
    await settle()
    expect(status()).toBe('')
  })

  it('shows an accessible error when sharing really fails, without falling back to the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: true, share: () => Promise.reject(new DOMException('No', 'NotAllowedError')), clipboard: { writeText } })
    renderWith()
    click()
    await settle()
    expect(status()).toBe('Couldn’t share. Try again.')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('catches a synchronous throw from navigator.share', async () => {
    stubPlatform({
      coarse: true,
      share: () => {
        throw new TypeError('bad data')
      },
    })
    renderWith()
    click()
    await settle()
    expect(status()).toBe('Couldn’t share. Try again.')
  })

  it('ignores repeat taps while the share sheet is open', async () => {
    let resolve!: () => void
    const share = vi.fn(() => new Promise<void>((done) => (resolve = done)))
    stubPlatform({ coarse: true, share })
    renderWith()
    click()
    click()
    click()
    expect(share).toHaveBeenCalledTimes(1)
    resolve()
    await settle()
    click()
    expect(share).toHaveBeenCalledTimes(2)
  })
})

describe('desktop: clipboard', () => {
  it('copies the exact text even when the browser has navigator.share, and confirms briefly', async () => {
    vi.useFakeTimers()
    const share = vi.fn(() => Promise.resolve())
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: false, share, clipboard: { writeText } })
    renderWith()
    click()
    await settle()
    expect(writeText).toHaveBeenCalledWith(EXPECTED_TEXT)
    expect(share).not.toHaveBeenCalled()
    expect(status()).toBe('Copied!')
    expect(screen.getByRole('button', { name: 'Share Result' })).toBeTruthy() // label stays stable
    await act(async () => {
      vi.advanceTimersByTime(STATUS_DISPLAY_MS.copied)
    })
    expect(status()).toBe('')
  })

  it('reports a rejected or missing clipboard', async () => {
    stubPlatform({ coarse: false, clipboard: { writeText: () => Promise.reject(new Error('denied')) } })
    renderWith()
    click()
    await settle()
    expect(status()).toBe('Couldn’t copy. Try again.')
    cleanup()

    stubPlatform({ coarse: false, clipboard: undefined })
    renderWith()
    click()
    await settle()
    expect(status()).toBe('Couldn’t copy. Try again.')
  })

  it('ignores repeat clicks while a copy is in progress', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: false, clipboard: { writeText } })
    renderWith()
    click()
    click()
    await settle()
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})

describe('what gets shared', () => {
  it('shares nothing for an incomplete puzzle', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: false, clipboard: { writeText } })
    renderWith(createInitialGameState(CATS))
    expect(screen.getByTestId('can-share').textContent).toBe('false')
    click()
    await settle()
    expect(writeText).not.toHaveBeenCalled()
    expect(status()).toBe('')
  })

  it("uses the puzzle's publish date, never today's", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: false, clipboard: { writeText } })
    renderWith(COMPLETED, '2026-09-30')
    click()
    await settle()
    expect(writeText).toHaveBeenCalledWith(EXPECTED_TEXT.replace('Oct 6, 2026', 'Sep 30, 2026'))
  })

  it('omits the reveal line for a malformed restored result rather than inventing a count', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    stubPlatform({ coarse: false, clipboard: { writeText } })
    renderWith({ ...COMPLETED, revealHistory: 'oops' as unknown as RevealHistoryEntry[] })
    click()
    await settle()
    expect(writeText).toHaveBeenCalledWith('ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,740 / 2,000\ncluecross.com')
  })
})
