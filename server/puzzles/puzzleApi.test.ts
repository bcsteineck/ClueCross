import { describe, expect, it } from 'vitest'
import { releaseInstant } from '../../src/publishing/releaseSchedule'
import { handleCalendarRequest, handlePuzzleRequest } from './puzzleApi'
import type { CalendarRead, PuzzleRead, RawReleasedPuzzle, ReleasedPuzzleReader } from './releasedPuzzleReader'

// CAT across crossing TIE down: a production-valid puzzle.
function released(puzzleId: string, publishDate: string, extra: Record<string, unknown> = {}): RawReleasedPuzzle {
  return {
    publishDate,
    puzzleId,
    puzzle: {
      id: puzzleId,
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
      id: `${puzzleId}-grid`,
      puzzleId,
      cellPositions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r1c2: { x: 2, y: 1 },
        r2c2: { x: 2, y: 2 },
      },
      navigationOrder: ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'],
    },
    ...extra,
  }
}

// Oct 2, 2026 12:00 ET (EDT): Oct 1 and Oct 2 are released; Oct 3 releases at 10 PM tonight.
const NOON_OCT_2 = new Date('2026-10-02T16:00:00.000Z')
const SECRET = 'postgres://reader:s3cret@db.internal/neondb'

function fakeReader(options: {
  calendar?: () => CalendarRead
  puzzle?: (date: string) => PuzzleRead
}): ReleasedPuzzleReader & { puzzleDates: string[] } {
  const puzzleDates: string[] = []
  return {
    puzzleDates,
    readCalendar: async () => {
      if (!options.calendar) throw new Error('unexpected calendar read')
      return options.calendar()
    },
    readPuzzle: async (date) => {
      puzzleDates.push(date)
      if (!options.puzzle) throw new Error('unexpected puzzle read')
      return options.puzzle(date)
    },
  }
}

const GET = (url: string) => ({ method: 'GET', url })

function expectSanitized503(response: { status: number; headers: Record<string, string>; body: unknown }) {
  expect(response.status).toBe(503)
  expect(response.body).toEqual({ error: 'unavailable', message: 'Puzzles are temporarily unavailable. Try again shortly.' })
  expect(response.headers['Cache-Control']).toBe('no-store')
  expect(response.headers['Vercel-CDN-Cache-Control']).toBeUndefined()
  expect(JSON.stringify(response)).not.toMatch(/s3cret|postgres|future|nextone|stack/i)
}

describe('GET /api/calendar', () => {
  it('returns released dates oldest-first and the newest as current, without internal fields', async () => {
    const current = released('catstwo', '2026-10-02', { contentFingerprint: 'f'.repeat(64), fingerprintVersion: 1, createdAt: 'x' })
    const reader = fakeReader({
      calendar: () => ({
        now: NOON_OCT_2,
        dates: [
          { publishDate: '2026-09-20', puzzleId: 'older' },
          { publishDate: '2026-10-01', puzzleId: 'catsone' },
          { publishDate: '2026-10-02', puzzleId: 'catstwo' },
        ],
        current,
      }),
    })
    const response = await handleCalendarRequest(GET('/api/calendar'), { reader })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      current: { publishDate: '2026-10-02', puzzleId: 'catstwo', puzzle: current.puzzle, layout: current.layout },
      dates: [
        { publishDate: '2026-09-20', puzzleId: 'older' },
        { publishDate: '2026-10-01', puzzleId: 'catsone' },
        { publishDate: '2026-10-02', puzzleId: 'catstwo' },
      ],
    })
    expect(JSON.stringify(response.body)).not.toMatch(/contentFingerprint|fingerprintVersion|createdAt/)
    expect(response.headers['Content-Type']).toBe('application/json; charset=utf-8')
  })

  it('returns an empty calendar as 200', async () => {
    const reader = fakeReader({ calendar: () => ({ now: NOON_OCT_2, dates: [], current: null }) })
    const response = await handleCalendarRequest(GET('/api/calendar'), { reader })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ current: null, dates: [] })
  })

  it('refuses the whole calendar if any row is unreleased by the TypeScript rule', async () => {
    const reader = fakeReader({
      calendar: () => ({
        now: NOON_OCT_2,
        dates: [
          { publishDate: '2026-10-02', puzzleId: 'catstwo' },
          { publishDate: '2026-10-03', puzzleId: 'nextone' }, // releases tonight
        ],
        current: released('nextone', '2026-10-03'),
      }),
    })
    expectSanitized503(await handleCalendarRequest(GET('/api/calendar'), { reader }))
  })

  it('refuses an unreleased current puzzle even when the index looks fine', async () => {
    const reader = fakeReader({
      calendar: () => ({ now: NOON_OCT_2, dates: [{ publishDate: '2026-10-02', puzzleId: 'catstwo' }], current: released('future', '2099-01-01') }),
    })
    expectSanitized503(await handleCalendarRequest(GET('/api/calendar'), { reader }))
  })

  it('refuses inconsistent data: out-of-order or duplicate dates, a current that is not the newest, or a missing current', async () => {
    const cases: CalendarRead[] = [
      {
        now: NOON_OCT_2,
        dates: [
          { publishDate: '2026-10-02', puzzleId: 'catstwo' },
          { publishDate: '2026-10-01', puzzleId: 'catsone' },
        ],
        current: released('catstwo', '2026-10-02'),
      },
      {
        now: NOON_OCT_2,
        dates: [
          { publishDate: '2026-10-02', puzzleId: 'catstwo' },
          { publishDate: '2026-10-02', puzzleId: 'catstwo' },
        ],
        current: released('catstwo', '2026-10-02'),
      },
      {
        now: NOON_OCT_2,
        dates: [
          { publishDate: '2026-10-01', puzzleId: 'catsone' },
          { publishDate: '2026-10-02', puzzleId: 'catstwo' },
        ],
        current: released('catsone', '2026-10-01'),
      },
      { now: NOON_OCT_2, dates: [{ publishDate: '2026-10-02', puzzleId: 'catstwo' }], current: null },
      { now: NOON_OCT_2, dates: [{ publishDate: '2026-10-02', puzzleId: 'Not-An-Id' }], current: null },
      { now: NOON_OCT_2, dates: [{ publishDate: '2026-02-30', puzzleId: 'bad' }], current: null },
    ]
    for (const read of cases) {
      expectSanitized503(await handleCalendarRequest(GET('/api/calendar'), { reader: fakeReader({ calendar: () => read }) }))
    }
  })

  it('maps a database failure or missing configuration to a sanitized 503', async () => {
    const reader = fakeReader({
      calendar: () => {
        throw new Error(`connect ECONNREFUSED ${SECRET}`)
      },
    })
    expectSanitized503(await handleCalendarRequest(GET('/api/calendar'), { reader }))
    expectSanitized503(await handleCalendarRequest(GET('/api/calendar'), { reader: undefined }))
  })

  it('accepts GET only', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const response = await handleCalendarRequest({ method, url: '/api/calendar' }, { reader: undefined })
      expect(response.status, method).toBe(405)
      expect(response.headers.Allow).toBe('GET')
      expect(response.headers['Cache-Control']).toBe('no-store')
    }
  })
})

describe('GET /api/puzzle?date=', () => {
  it('returns a released puzzle with immutable caching', async () => {
    const row = released('catsone', '2026-10-01', { contentFingerprint: 'f'.repeat(64) })
    const reader = fakeReader({ puzzle: () => ({ now: NOON_OCT_2, puzzle: row }) })
    const response = await handlePuzzleRequest(GET('/api/puzzle?date=2026-10-01'), { reader })
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ publishDate: '2026-10-01', puzzle: row.puzzle, layout: row.layout })
    expect(response.headers['Cache-Control']).toBe('public, max-age=86400, immutable')
    expect(response.headers['Vercel-CDN-Cache-Control']).toBe('public, s-maxage=31536000, immutable')
    expect(reader.puzzleDates).toEqual(['2026-10-01'])
    expect(Object.keys(response.body as object)).toEqual(['publishDate', 'puzzle', 'layout'])
    expect(JSON.stringify(response.body)).not.toMatch(/contentFingerprint/)
  })

  it('returns the same 404 for a gap and a not-yet-released date', async () => {
    // The view returns nothing for both; the handler cannot and does not tell them apart.
    const reader = fakeReader({ puzzle: () => ({ now: NOON_OCT_2, puzzle: null }) })
    const gap = await handlePuzzleRequest(GET('/api/puzzle?date=2026-09-25'), { reader })
    const future = await handlePuzzleRequest(GET('/api/puzzle?date=2026-10-03'), { reader })
    expect(gap.status).toBe(404)
    expect(gap.body).toEqual({ error: 'not-found', message: 'No puzzle is available for that date.' })
    expect(future).toEqual(gap)
  })

  it('rejects malformed and impossible dates with 400 before reading anything', async () => {
    const reader = fakeReader({})
    for (const url of [
      '/api/puzzle',
      '/api/puzzle?date=',
      '/api/puzzle?date=2026-2-3',
      '/api/puzzle?date=2026/10/01',
      '/api/puzzle?date=2026-10-01T00:00',
      '/api/puzzle?date=2026-02-30',
      '/api/puzzle?date=2026-13-01',
      "/api/puzzle?date=2026-10-01'%20OR%201=1--",
    ]) {
      const response = await handlePuzzleRequest(GET(url), { reader })
      expect(response.status, url).toBe(400)
      expect(response.body).toEqual({ error: 'invalid-date', message: 'Use ?date=YYYY-MM-DD with a real calendar date.' })
      expect(response.headers['Cache-Control']).toBe('no-store')
    }
    expect(reader.puzzleDates).toEqual([])
  })

  it('refuses a row the TypeScript rule says is unreleased, or one for another date', async () => {
    const future = fakeReader({ puzzle: () => ({ now: NOON_OCT_2, puzzle: released('nextone', '2026-10-03') }) })
    expectSanitized503(await handlePuzzleRequest(GET('/api/puzzle?date=2026-10-03'), { reader: future }))
    const wrongDate = fakeReader({ puzzle: () => ({ now: NOON_OCT_2, puzzle: released('catsone', '2026-10-01') }) })
    expectSanitized503(await handlePuzzleRequest(GET('/api/puzzle?date=2026-09-30'), { reader: wrongDate }))
  })

  it('maps a database failure or missing configuration to a sanitized 503', async () => {
    const reader = fakeReader({
      puzzle: () => {
        throw new Error(`timeout ${SECRET}`)
      },
    })
    expectSanitized503(await handlePuzzleRequest(GET('/api/puzzle?date=2026-10-01'), { reader }))
    expectSanitized503(await handlePuzzleRequest(GET('/api/puzzle?date=2026-10-01'), { reader: undefined }))
  })

  it('accepts GET only', async () => {
    const response = await handlePuzzleRequest({ method: 'POST', url: '/api/puzzle?date=2026-10-01' }, { reader: undefined })
    expect(response.status).toBe(405)
    expect(response.body).toEqual({ error: 'method-not-allowed', message: 'Use GET.' })
  })
})

describe('database result validation', () => {
  const read = (puzzle: RawReleasedPuzzle) =>
    handlePuzzleRequest(GET(`/api/puzzle?date=${String(puzzle.publishDate)}`), {
      reader: fakeReader({ puzzle: () => ({ now: NOON_OCT_2, puzzle }) }),
    })

  it('rejects malformed puzzle JSON', async () => {
    const base = released('catsone', '2026-10-01')
    for (const puzzle of [null, 'text', { ...(base.puzzle as object), cells: [] }, { ...(base.puzzle as object), unlockBudget: '2000' }]) {
      expectSanitized503(await read({ ...base, puzzle }))
    }
  })

  it('rejects malformed layout JSON', async () => {
    const base = released('catsone', '2026-10-01')
    const layout = base.layout as Record<string, unknown>
    for (const bad of [
      null,
      { ...layout, navigationOrder: 'r0c0' },
      { ...layout, cellPositions: { ...(layout.cellPositions as object), r0c0: { x: '0', y: 0 } } },
    ]) {
      expectSanitized503(await read({ ...base, layout: bad }))
    }
  })

  it('rejects mismatched puzzle/layout IDs and production-invalid content', async () => {
    const base = released('catsone', '2026-10-01')
    const puzzle = base.puzzle as Record<string, unknown>
    const layout = base.layout as Record<string, unknown>
    expectSanitized503(await read({ ...base, puzzle: { ...puzzle, id: 'other' } }))
    expectSanitized503(await read({ ...base, layout: { ...layout, puzzleId: 'other' } }))
    expectSanitized503(await read({ ...base, puzzleId: 'other' }))
    // A cell with no layout position fails the production validator.
    const { r2c2: _dropped, ...positions } = layout.cellPositions as Record<string, unknown>
    void _dropped
    expectSanitized503(await read({ ...base, layout: { ...layout, cellPositions: positions } }))
  })
})

describe('release boundary sanity', () => {
  it('uses the 10 PM Eastern rule the fixtures assume', () => {
    expect(releaseInstant('2026-10-03').toISOString()).toBe('2026-10-03T02:00:00.000Z')
  })
})
