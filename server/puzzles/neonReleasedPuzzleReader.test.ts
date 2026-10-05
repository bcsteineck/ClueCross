import { describe, expect, it } from 'vitest'
import { createNeonReleasedPuzzleReader, readerFromEnvironment } from './neonReleasedPuzzleReader'

function recordingQuery(rows: Record<string, unknown>[]) {
  const calls: { text: string; params?: unknown[] }[] = []
  return {
    calls,
    query: async (text: string, params?: unknown[]) => {
      calls.push({ text, params })
      return rows
    },
  }
}

describe('Neon released-puzzle reader', () => {
  it('reads the calendar from the released view only, in one statement with database time', async () => {
    const { calls, query } = recordingQuery([
      { now: '2026-10-02T16:00:00.000Z', dates: [{ publishDate: '2026-10-01', puzzleId: 'a' }], current: null },
    ])
    const read = await createNeonReleasedPuzzleReader('postgresql://unused', query).readCalendar()
    expect(read).toEqual({
      now: new Date('2026-10-02T16:00:00.000Z'),
      dates: [{ publishDate: '2026-10-01', puzzleId: 'a' }],
      current: null,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toMatch(/FROM released_puzzles/)
    expect(calls[0].text).not.toMatch(/published_puzzles|created_at|content_fingerprint/)
    expect(calls[0].text).toMatch(/ORDER BY publish_date\)/) // dates ascending
    expect(calls[0].text).toMatch(/ORDER BY publish_date DESC LIMIT 1/) // newest is current
  })

  it('reads one date as a bound parameter', async () => {
    const { calls, query } = recordingQuery([{ now: '2026-10-02T16:00:00.000Z', puzzle: null }])
    const read = await createNeonReleasedPuzzleReader('postgresql://unused', query).readPuzzle('2026-10-01')
    expect(read).toEqual({ now: new Date('2026-10-02T16:00:00.000Z'), puzzle: null })
    expect(calls[0].params).toEqual(['2026-10-01'])
    expect(calls[0].text).toMatch(/FROM released_puzzles WHERE publish_date = \$1/)
  })

  it('fails on a malformed result rather than inventing data', async () => {
    const noTime = createNeonReleasedPuzzleReader('postgresql://unused', recordingQuery([{ now: null, dates: [], current: null }]).query)
    await expect(noTime.readCalendar()).rejects.toThrow()
    const badDates = createNeonReleasedPuzzleReader('postgresql://unused', recordingQuery([{ now: '2026-10-02T16:00:00.000Z', dates: 'x', current: null }]).query)
    await expect(badDates.readCalendar()).rejects.toThrow()
  })

  it('is configured by PUZZLES_READ_DATABASE_URL only, never an owner credential', () => {
    expect(readerFromEnvironment({})).toBeUndefined()
    expect(
      readerFromEnvironment({
        DATABASE_URL: 'postgresql://owner@x/db',
        DATABASE_URL_UNPOOLED: 'postgresql://owner@x/db',
        PUBLISHING_DATABASE_URL: 'postgresql://owner@x/db',
        POSTGRES_URL: 'postgresql://owner@x/db',
      }),
    ).toBeUndefined()
    expect(readerFromEnvironment({ PUZZLES_READ_DATABASE_URL: '  ' })).toBeUndefined()
    expect(readerFromEnvironment({ PUZZLES_READ_DATABASE_URL: 'postgresql://cluecross_reader@x/db' })).toBeDefined()
  })
})
