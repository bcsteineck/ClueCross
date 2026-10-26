// @vitest-environment jsdom
// The compact score line between the mobile Puzzle view's board and action: the same
// score and star rating as Stats, through play, reveals, completion,
// archive switching, and a reload.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PuzzleDefinition } from './core/types'
import type { LayoutDefinition } from './layout/types'
import { fakeCalendarClient, published, renderApp } from './testing/playerHarness'
import { dogsPuzzle } from './testing/fixtures/dogsPuzzle'
import { dogsPuzzleLayout } from './testing/fixtures/dogsPuzzleLayout'

type User = ReturnType<typeof userEvent.setup>

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

function stubMatchMedia(mobile: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mobile && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
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
const crossingClient = () =>
  fakeCalendarClient([published('2026-10-05', BATS, BATS_LAYOUT), published('2026-10-06', CATS, CATS_LAYOUT)])
const dogsClient = () => fakeCalendarClient([published('2026-08-05', dogsPuzzle, dogsPuzzleLayout)])

const scoreLine = () => screen.getByTestId('mobile-score-line')

// What a screen reader gets: the score sentence and the star rating's label.
function readScoreLine() {
  const line = scoreLine()
  return {
    score: line.querySelector('.mobile-score-line__visually-hidden')?.textContent,
    stars: within(line).getByRole('img').getAttribute('aria-label'),
    visible: line.querySelector('[aria-hidden="true"]')?.textContent,
  }
}

// Stats' own presentation of the same values.
async function readStats(user: User) {
  await user.click(screen.getByRole('button', { name: /stats/i }))
  const stats = {
    score: screen.getByTestId('score-badge').textContent,
    stars: screen.getByRole('img', { name: /out of 3 stars/ }).getAttribute('aria-label'),
  }
  await user.click(screen.getByRole('button', { name: /back to puzzle/i }))
  return stats
}

async function reveal(user: User, letter: string) {
  await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
  await user.click(screen.getByTestId(`letter-${letter}`))
}

async function openArchiveDate(user: User, name: RegExp) {
  await user.click(screen.getByRole('button', { name: /^archive$/i }))
  await user.click(screen.getByRole('button', { name }))
  await waitFor(() => expect(screen.getByTestId('cell-r0c0')).toBeTruthy())
}

beforeEach(() => {
  stubMatchMedia(true)
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Mobile score line', () => {
  it('sits between the board and Reveal Letter, matching Stats, and is not a live region', async () => {
    const user = userEvent.setup()
    await renderApp(dogsClient())

    expect(scoreLine().previousElementSibling?.classList.contains('mobile-puzzle-view__board')).toBe(true)
    expect(scoreLine().nextElementSibling?.classList.contains('mobile-puzzle-view__actions')).toBe(true)

    expect(readScoreLine()).toEqual({ score: 'Score: 2000 out of 2000', stars: '3 out of 3 stars', visible: 'Score: 2000 / 2000' })
    expect(await readStats(user)).toEqual({ score: '2000 / 2000', stars: '3 out of 3 stars' })
    expect(scoreLine().closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
  })

  it('stays in place on the Reveal Letter view, between the letters and Cancel Reveal', async () => {
    const user = userEvent.setup()
    await renderApp(dogsClient())
    await reveal(user, 'B')
    await reveal(user, 'U')
    await reveal(user, 'P')
    await reveal(user, 'E') // 170

    await user.click(screen.getByRole('button', { name: /^reveal letter/i }))
    expect(screen.getByRole('button', { name: /^cancel reveal$/i })).toBeTruthy()
    expect(scoreLine().previousElementSibling?.classList.contains('mobile-reveal-view__selector')).toBe(true)
    expect(scoreLine().nextElementSibling?.classList.contains('mobile-reveal-view__cancel-band')).toBe(true)
    expect(readScoreLine()).toMatchObject({ score: 'Score: 1830 out of 2000', stars: '3 out of 3 stars' })
  })

  it('follows reveals, including a change in stars, and ignores typed entries', async () => {
    const user = userEvent.setup()
    await renderApp(dogsClient())

    await user.click(screen.getByTestId('cell-r0c0'))
    await user.keyboard('Q') // a wrong entry never costs points
    expect(readScoreLine().score).toBe('Score: 2000 out of 2000')

    for (const letter of ['B', 'U', 'P']) await reveal(user, letter) // free
    expect(readScoreLine().score).toBe('Score: 2000 out of 2000')
    for (const letter of ['E', 'A', 'R', 'I', 'O']) await reveal(user, letter) // 170+160+150+150+140
    expect(readScoreLine()).toMatchObject({ score: 'Score: 1230 out of 2000', stars: '3 out of 3 stars' })
    await reveal(user, 'T') // 140: below the 1200 three-star band
    expect(readScoreLine()).toMatchObject({ score: 'Score: 1090 out of 2000', stars: '2 out of 3 stars' })
    expect(await readStats(user)).toEqual({ score: '1090 / 2000', stars: '2 out of 3 stars' })
  })

  it('stays above Share Result once complete, keeps each date’s own result, and survives a reload', async () => {
    const user = userEvent.setup()
    await renderApp(crossingClient())

    for (const letter of ['C', 'A', 'T', 'I', 'E']) await reveal(user, letter) // free x3, then 150 + 170
    await user.click(within(screen.getByRole('dialog', { name: /puzzle complete/i })).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: 'Share Result' })).toBeTruthy()
    expect(readScoreLine()).toMatchObject({ score: 'Score: 1680 out of 2000', stars: '3 out of 3 stars' })

    await openArchiveDate(user, /open puzzle for october 5, 2026/i)
    expect(readScoreLine().score).toBe('Score: 2000 out of 2000')
    await reveal(user, 'B')
    await reveal(user, 'A')
    await reveal(user, 'T')
    await reveal(user, 'E') // 170
    expect(readScoreLine().score).toBe('Score: 1830 out of 2000')
    expect(await readStats(user)).toEqual({ score: '1830 / 2000', stars: '3 out of 3 stars' })

    await openArchiveDate(user, /open puzzle for october 6, 2026/i)
    expect(readScoreLine().score).toBe('Score: 1680 out of 2000')

    cleanup()
    await renderApp(crossingClient())
    expect(readScoreLine().score).toBe('Score: 1680 out of 2000')
    expect(await readStats(user)).toEqual({ score: '1680 / 2000', stars: '3 out of 3 stars' })
  })

  it('is mobile only: the desktop dashboard has no score line', async () => {
    stubMatchMedia(false)
    await renderApp(dogsClient())
    expect(screen.queryByTestId('mobile-score-line')).toBeNull()
  })
})
