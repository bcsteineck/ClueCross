// Test-only harness for the API-backed player: a fake PuzzleCalendarClient
// over a list of released puzzles, and renderApp(), which renders <App>
// with it and waits for the calendar to load. Never imported by app code.

import { render, waitFor } from '@testing-library/react'
import App from '../App'
import type { PublishedPuzzle, PuzzleCalendarClient, PuzzleResult } from '../data/puzzleCalendar'
import type { PuzzleDefinition } from '../core/types'
import type { LayoutDefinition } from '../layout/types'
import type { DateKey } from '../publishing/types'

export function published(publishDate: DateKey, puzzle: PuzzleDefinition, layout: LayoutDefinition): PublishedPuzzle {
  return { publishDate, puzzleId: puzzle.id, puzzle, layout }
}

export interface FakeCalendarClient extends PuzzleCalendarClient {
  calendarCalls: number
  puzzleRequests: DateKey[]
  /** Replace what later calendar fetches return (e.g. a newly released puzzle). */
  setReleased: (puzzles: PublishedPuzzle[]) => void
  /** Override how a date's puzzle request resolves. */
  puzzleResponder?: (date: DateKey) => Promise<PuzzleResult>
  failCalendar?: boolean
}

/** A client serving `released` (any order); the newest is current. */
export function fakeCalendarClient(released: PublishedPuzzle[]): FakeCalendarClient {
  let puzzles = [...released].sort((a, b) => (a.publishDate < b.publishDate ? -1 : 1))
  const client: FakeCalendarClient = {
    calendarCalls: 0,
    puzzleRequests: [],
    setReleased: (next) => {
      puzzles = [...next].sort((a, b) => (a.publishDate < b.publishDate ? -1 : 1))
    },
    async fetchCalendar() {
      client.calendarCalls += 1
      if (client.failCalendar) return { ok: false }
      return {
        ok: true,
        calendar: {
          current: puzzles.at(-1) ?? null,
          dates: puzzles.map(({ publishDate, puzzleId }) => ({ publishDate, puzzleId })),
        },
      }
    },
    async fetchPuzzle(date) {
      client.puzzleRequests.push(date)
      if (client.puzzleResponder) return client.puzzleResponder(date)
      const puzzle = puzzles.find((candidate) => candidate.publishDate === date)
      return puzzle ? { kind: 'ready', puzzle } : { kind: 'unavailable' }
    },
  }
  return client
}

/** Renders the player with `client` and waits until a puzzle is on screen. */
export async function renderApp(client: PuzzleCalendarClient, options: { testTools?: boolean } = {}) {
  const result = render(<App calendarClient={client} {...options} />)
  await waitFor(() => {
    if (!result.container.querySelector('.app__content')) throw new Error('player not loaded yet')
  })
  return result
}
