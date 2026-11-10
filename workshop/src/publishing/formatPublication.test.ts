import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatLocalInstant, formatPublishDate, formatPublishDateShort, formatReleaseInstant, formatReleaseInstantShort } from './formatPublication'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('publication date formatting', () => {
  it('formats a DateKey as its calendar date', () => {
    expect(formatPublishDate('2026-10-04')).toBe('October 4, 2026')
    expect(formatPublishDate('2027-01-01')).toBe('January 1, 2027')
    expect(formatPublishDate('2028-02-29')).toBe('February 29, 2028')
  })

  it('shows release instants in Eastern time, across DST', () => {
    expect(formatReleaseInstant('2026-10-04T02:00:00.000Z')).toBe('October 3 at 10:00 PM ET')
    expect(formatReleaseInstant('2026-11-02T03:00:00.000Z')).toBe('November 1 at 10:00 PM ET')
    expect(formatReleaseInstant('2027-01-01T03:00:00.000Z')).toBe('December 31 at 10:00 PM ET')
  })

  it('has compact forms that keep the same date and Eastern time', () => {
    expect(formatPublishDateShort('2026-10-04')).toBe('10/04/26')
    expect(formatPublishDateShort('2028-02-29')).toBe('02/29/28')
    expect(formatReleaseInstantShort('2026-10-04T02:00:00.000Z')).toEqual({ date: '10/03', time: '10 PM' }) // EDT
    expect(formatReleaseInstantShort('2026-11-02T03:00:00.000Z')).toEqual({ date: '11/01', time: '10 PM' }) // EST
    expect(formatReleaseInstantShort('2027-01-01T03:00:00.000Z')).toEqual({ date: '12/31', time: '10 PM' }) // across the year
    expect(formatReleaseInstantShort('2026-10-04T02:30:00.000Z')).toEqual({ date: '10/03', time: '10:30 PM' })
  })

  it('never shifts with the machine timezone', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
      vi.stubEnv('TZ', tz)
      expect(formatPublishDate('2026-10-04'), tz).toBe('October 4, 2026')
      expect(formatPublishDate('2027-01-01'), tz).toBe('January 1, 2027')
      expect(formatReleaseInstant('2026-10-04T02:00:00.000Z'), tz).toBe('October 3 at 10:00 PM ET')
      expect(formatPublishDateShort('2027-01-01'), tz).toBe('01/01/27')
      expect(formatReleaseInstantShort('2026-10-04T02:00:00.000Z'), tz).toEqual({ date: '10/03', time: '10 PM' })
    }
  })

  it('shows a release instant in another zone with that date’s own offset', () => {
    // Nov 7, 2026 at 10 PM EST, the release of the November 8 puzzle.
    expect(formatLocalInstant('2026-11-08T03:00:00.000Z', 'America/Los_Angeles')).toBe('November 7 at 7:00 PM PST')
    expect(formatLocalInstant('2026-11-08T03:00:00.000Z', 'America/New_York')).toBe('November 7 at 10:00 PM EST')
    // Summer: daylight time on both coasts.
    expect(formatLocalInstant('2026-07-05T02:00:00.000Z', 'America/Los_Angeles')).toBe('July 4 at 7:00 PM PDT')
    // A zone ahead of Eastern lands on the next calendar day.
    expect(formatLocalInstant('2026-11-08T03:00:00.000Z', 'UTC')).toBe('November 8 at 3:00 AM UTC')
  })

  it('defaults to the machine (browser) timezone', () => {
    vi.stubEnv('TZ', 'America/Chicago')
    expect(formatLocalInstant('2026-11-08T03:00:00.000Z')).toBe('November 7 at 9:00 PM CST')
  })
})
