import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatPublishDate, formatReleaseInstant } from './formatPublication'

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

  it('never shifts with the machine timezone', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Tokyo', 'America/Los_Angeles', 'UTC']) {
      vi.stubEnv('TZ', tz)
      expect(formatPublishDate('2026-10-04'), tz).toBe('October 4, 2026')
      expect(formatPublishDate('2027-01-01'), tz).toBe('January 1, 2027')
      expect(formatReleaseInstant('2026-10-04T02:00:00.000Z'), tz).toBe('October 3 at 10:00 PM ET')
    }
  })
})
