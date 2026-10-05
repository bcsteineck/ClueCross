import { describe, expect, it, vi } from 'vitest'
import { archiveMonthRange, createPuzzleCalendarClient, dateFromKey } from './puzzleCalendar'

// CAT across crossing TIE down: production-valid.
function puzzleJson(id: string) {
  return {
    puzzle: {
      id,
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
    },
    layout: {
      id: `${id}-grid`,
      puzzleId: id,
      cellPositions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r1c2: { x: 2, y: 1 },
        r2c2: { x: 2, y: 2 },
      },
      navigationOrder: ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'],
    },
  }
}

function client(status: number, body: unknown) {
  const urls: string[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url))
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { client: createPuzzleCalendarClient(fetchImpl), urls }
}

const calendarBody = {
  current: { publishDate: '2026-10-02', puzzleId: 'two', ...puzzleJson('two') },
  dates: [
    { publishDate: '2026-09-28', puzzleId: 'one' },
    { publishDate: '2026-10-02', puzzleId: 'two' },
  ],
}

describe('fetchCalendar', () => {
  it('calls only /api/calendar and returns the validated calendar', async () => {
    const { client: c, urls } = client(200, calendarBody)
    const result = await c.fetchCalendar()
    expect(urls).toEqual(['/api/calendar'])
    expect(result).toMatchObject({ ok: true, calendar: { dates: calendarBody.dates, current: { publishDate: '2026-10-02', puzzleId: 'two' } } })
  })

  it('accepts an empty calendar', async () => {
    expect(await client(200, { current: null, dates: [] }).client.fetchCalendar()).toEqual({
      ok: true,
      calendar: { current: null, dates: [] },
    })
  })

  it('treats failures and unusable data as errors', async () => {
    const bad: [number, unknown][] = [
      [503, { error: 'unavailable' }],
      [200, '<html>'],
      [200, { current: null, dates: [{ publishDate: '2026-10-02', puzzleId: 'two' }] }],
      [200, { ...calendarBody, dates: [...calendarBody.dates].reverse() }],
      [200, { ...calendarBody, dates: [calendarBody.dates[0]] }],
      [200, { ...calendarBody, current: { ...calendarBody.current, puzzle: { ...calendarBody.current.puzzle, cells: [] } } }],
      [200, { ...calendarBody, current: { ...calendarBody.current, layout: { ...calendarBody.current.layout, puzzleId: 'other' } } }],
    ]
    for (const [status, body] of bad) {
      expect(await client(status, body).client.fetchCalendar(), JSON.stringify(body).slice(0, 60)).toEqual({ ok: false })
    }
    const offline = createPuzzleCalendarClient(vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch)
    expect(await offline.fetchCalendar()).toEqual({ ok: false })
  })
})

describe('fetchPuzzle', () => {
  it('calls /api/puzzle?date= and returns the validated puzzle', async () => {
    const { client: c, urls } = client(200, { publishDate: '2026-09-28', ...puzzleJson('one') })
    const result = await c.fetchPuzzle('2026-09-28')
    expect(urls).toEqual(['/api/puzzle?date=2026-09-28'])
    expect(result).toMatchObject({ kind: 'ready', puzzle: { publishDate: '2026-09-28', puzzleId: 'one' } })
  })

  it('maps 404 to unavailable and other failures to error', async () => {
    expect(await client(404, { error: 'not-found' }).client.fetchPuzzle('2026-09-29')).toEqual({ kind: 'unavailable' })
    expect(await client(503, { error: 'unavailable' }).client.fetchPuzzle('2026-09-28')).toEqual({ kind: 'error' })
    expect(await client(200, { publishDate: '2026-09-27', ...puzzleJson('one') }).client.fetchPuzzle('2026-09-28')).toEqual({ kind: 'error' })
    expect(await client(200, { publishDate: '2026-09-28', puzzle: {}, layout: {} }).client.fetchPuzzle('2026-09-28')).toEqual({ kind: 'error' })
  })

  it('never requests an invalid date', async () => {
    const { client: c, urls } = client(200, {})
    expect(await c.fetchPuzzle('2026-02-30')).toEqual({ kind: 'unavailable' })
    expect(urls).toEqual([])
  })
})

describe('archive month range', () => {
  it('runs from one month before the oldest released date to the current date’s month', () => {
    const range = archiveMonthRange({
      current: null,
      dates: [
        { publishDate: '2025-07-10', puzzleId: 'a' },
        { publishDate: '2026-11-01', puzzleId: 'b' },
      ],
    })
    expect(range.earliestMonth).toEqual(new Date(2025, 5, 1))
    expect(dateFromKey('2026-11-01')).toEqual(new Date(2026, 10, 1))
  })
})
