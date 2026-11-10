import { describe, expect, it } from 'vitest'
import { releaseInstant } from '../../src/publishing/releaseSchedule'
import {
  calendarCacheHeaders,
  nextReleaseBoundary,
  notFoundCacheHeaders,
  releasedPuzzleCacheHeaders,
  secondsBeforeNextBoundary,
} from './cacheHeaders'

const at = (iso: string) => new Date(iso)
const calendar = (seconds: number) => ({
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': `public, s-maxage=${seconds}`,
})

describe('next release boundary', () => {
  it('is the first 10:00 PM Eastern strictly after now', () => {
    expect(nextReleaseBoundary(at('2026-10-02T16:00:00.000Z')).toISOString()).toBe('2026-10-03T02:00:00.000Z') // noon EDT
    expect(nextReleaseBoundary(at('2026-10-03T01:59:59.999Z')).toISOString()).toBe('2026-10-03T02:00:00.000Z')
    expect(nextReleaseBoundary(at('2026-10-03T02:00:00.000Z')).toISOString()).toBe('2026-10-04T02:00:00.000Z') // exactly 10 PM
  })
})

describe('seconds before the next release boundary', () => {
  it('stops before 10 PM Eastern in daylight time, with a safety margin', () => {
    expect(secondsBeforeNextBoundary(at('2026-10-03T01:59:00.000Z'))).toBe(58) // 9:59:00 PM EDT
    expect(secondsBeforeNextBoundary(at('2026-10-02T16:00:00.000Z'))).toBe(36_000 - 2) // noon EDT
    expect(secondsBeforeNextBoundary(at('2026-10-03T01:59:59.000Z'))).toBe(0) // inside the margin
    expect(secondsBeforeNextBoundary(at('2026-10-03T02:00:00.000Z'))).toBe(86_400 - 2) // exactly 10 PM
  })

  it('follows standard time', () => {
    expect(secondsBeforeNextBoundary(at('2027-01-15T02:00:00.000Z'))).toBe(3_600 - 2) // 9:00 PM EST
    expect(secondsBeforeNextBoundary(at('2027-01-15T03:00:00.000Z'))).toBe(86_400 - 2) // 10:00 PM EST
  })

  it('handles the 23- and 25-hour days around DST transitions', () => {
    // 10 PM EST Mar 7 -> 10 PM EDT Mar 8 is 23 hours.
    expect(secondsBeforeNextBoundary(at('2026-03-08T03:00:00.000Z'))).toBe(23 * 3_600 - 2)
    // Midnight Mar 8 (EST) -> 10 PM EDT is only 21 hours.
    expect(secondsBeforeNextBoundary(at('2026-03-08T05:00:00.000Z'))).toBe(21 * 3_600 - 2)
    // 10 PM EDT Oct 31 -> 10 PM EST Nov 1 is 25 hours.
    expect(secondsBeforeNextBoundary(at('2026-11-01T02:00:00.000Z'))).toBe(25 * 3_600 - 2)
  })
})

describe('calendar caching', () => {
  it('caches at the CDN for at most 60 seconds, so a backfilled date appears within a minute', () => {
    expect(calendarCacheHeaders(at('2026-10-02T16:00:00.000Z'))).toEqual(calendar(60)) // noon EDT
    expect(calendarCacheHeaders(at('2026-10-03T02:00:00.000Z'))).toEqual(calendar(60)) // exactly 10 PM
    expect(calendarCacheHeaders(at('2027-01-15T03:00:00.000Z'))).toEqual(calendar(60)) // 10 PM EST
  })

  it('still expires before the next 10 PM Eastern release inside the final minute', () => {
    const release = releaseInstant('2026-10-03').getTime() // Oct 2, 10 PM EDT
    expect(calendarCacheHeaders(new Date(release - 61_000))).toEqual(calendar(59))
    expect(calendarCacheHeaders(at('2026-10-03T01:59:00.000Z'))).toEqual(calendar(58)) // 9:59:00 PM EDT
    expect(calendarCacheHeaders(at('2026-10-03T01:59:59.000Z'))).toEqual({ 'Cache-Control': 'no-store' })
  })

  it('never lets a cached calendar outlive the boundary', () => {
    const start = at('2026-03-06T00:00:00.000Z').getTime()
    for (let t = start; t < start + 10 * 86_400_000; t += 7 * 60_000 + 13) {
      const now = new Date(t)
      const headers = calendarCacheHeaders(now)
      const seconds = Number(/s-maxage=(\d+)/.exec(headers['Vercel-CDN-Cache-Control'] ?? '')?.[1] ?? 0)
      expect(seconds).toBeLessThanOrEqual(60)
      expect(t + seconds * 1000).toBeLessThan(nextReleaseBoundary(now).getTime())
    }
  })
})

describe('puzzle caching', () => {
  it('caches a released puzzle for a year at the CDN and a day in browsers', () => {
    expect(releasedPuzzleCacheHeaders()).toEqual({
      'Cache-Control': 'public, max-age=86400, immutable',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=31536000, immutable',
    })
  })

  it('caches a 404 for at most 60 seconds', () => {
    expect(notFoundCacheHeaders(at('2026-10-02T16:00:00.000Z'))).toEqual(calendar(60))
  })

  it('never lets a 404 for a date about to release survive its release', () => {
    const release = releaseInstant('2026-10-03').getTime()
    expect(notFoundCacheHeaders(new Date(release - 30_000))).toEqual(calendar(28))
    expect(notFoundCacheHeaders(new Date(release - 61_000))).toEqual(calendar(59))
    expect(notFoundCacheHeaders(new Date(release - 2_500))).toEqual({ 'Cache-Control': 'no-store' })
    for (let before = 1; before <= 120_000; before += 997) {
      const now = new Date(release - before)
      const header = notFoundCacheHeaders(now)['Vercel-CDN-Cache-Control']
      const seconds = header ? Number(/s-maxage=(\d+)/.exec(header)![1]) : 0
      expect(now.getTime() + seconds * 1000).toBeLessThan(release)
    }
  })
})
