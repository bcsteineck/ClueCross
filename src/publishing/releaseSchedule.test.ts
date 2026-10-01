import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays } from './dateKey'
import { easternWallClock } from './easternTime'
import { assignPublishDate, earliestPublishDate, publicationStatus, releaseInstant } from './releaseSchedule'

const at = (iso: string) => new Date(iso)
// vi.stubEnv('TZ', …) changes the zone Node uses for local-time Date
// methods immediately; these functions must not be affected by it.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('releaseInstant', () => {
  it('is 10:00 PM Eastern on the day before publishDate', () => {
    expect(releaseInstant('2026-10-01').toISOString()).toBe('2026-10-01T02:00:00.000Z') // Sept 30, 10 PM EDT
    expect(releaseInstant('2027-01-15').toISOString()).toBe('2027-01-15T03:00:00.000Z') // Jan 14, 10 PM EST
    expect(easternWallClock(releaseInstant('2026-10-01'))).toMatchObject({ month: 9, day: 30, hour: 22, minute: 0 })
  })

  it('rolls back across month, year, and leap-day boundaries', () => {
    expect(easternWallClock(releaseInstant('2026-11-01'))).toMatchObject({ year: 2026, month: 10, day: 31, hour: 22 })
    expect(easternWallClock(releaseInstant('2027-01-01'))).toMatchObject({ year: 2026, month: 12, day: 31, hour: 22 })
    expect(easternWallClock(releaseInstant('2028-03-01'))).toMatchObject({ year: 2028, month: 2, day: 29, hour: 22 })
    expect(easternWallClock(releaseInstant('2027-03-01'))).toMatchObject({ year: 2027, month: 2, day: 28, hour: 22 })
  })

  it('follows DST: releases stay at 10 PM local, so the gaps are 23 and 25 hours', () => {
    const hour = 60 * 60 * 1000
    const spring = ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'].map((d) => releaseInstant(d).toISOString())
    expect(spring).toEqual([
      '2026-03-07T03:00:00.000Z', // Mar 6, EST
      '2026-03-08T03:00:00.000Z', // Mar 7, EST
      '2026-03-09T02:00:00.000Z', // Mar 8, EDT
      '2026-03-10T02:00:00.000Z', // Mar 9, EDT
    ])
    expect(releaseInstant('2026-03-09').getTime() - releaseInstant('2026-03-08').getTime()).toBe(23 * hour)

    const fall = ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'].map((d) => releaseInstant(d).toISOString())
    expect(fall).toEqual([
      '2026-10-31T02:00:00.000Z', // Oct 30, EDT
      '2026-11-01T02:00:00.000Z', // Oct 31, EDT
      '2026-11-02T03:00:00.000Z', // Nov 1, EST
      '2026-11-03T03:00:00.000Z', // Nov 2, EST
    ])
    expect(releaseInstant('2026-11-02').getTime() - releaseInstant('2026-11-01').getTime()).toBe(25 * hour)
  })
})

describe('earliestPublishDate', () => {
  it('is Eastern tomorrow before 10:00 PM and the day after at or after 10:00 PM exactly', () => {
    // Sept 30, 2026 in New York (EDT); the UTC date is already October 1 for the last two hours.
    expect(earliestPublishDate(at('2026-09-30T04:00:00.000Z'))).toBe('2026-10-01') // 00:00
    expect(earliestPublishDate(at('2026-09-30T16:00:00.000Z'))).toBe('2026-10-01') // 12:00
    expect(earliestPublishDate(at('2026-10-01T01:59:59.999Z'))).toBe('2026-10-01') // 21:59:59.999
    expect(earliestPublishDate(at('2026-10-01T02:00:00.000Z'))).toBe('2026-10-02') // 22:00:00.000
    expect(earliestPublishDate(at('2026-10-01T03:59:59.999Z'))).toBe('2026-10-02') // 23:59:59.999
    expect(earliestPublishDate(at('2026-10-01T04:00:00.000Z'))).toBe('2026-10-02') // Oct 1, 00:00
  })

  it('uses the EST cutoff in winter', () => {
    expect(earliestPublishDate(at('2027-01-15T02:59:59.999Z'))).toBe('2027-01-15') // Jan 14, 21:59:59.999 EST
    expect(earliestPublishDate(at('2027-01-15T03:00:00.000Z'))).toBe('2027-01-16') // Jan 14, 22:00 EST
  })

  it('rolls over months, years, and leap days', () => {
    expect(earliestPublishDate(at('2027-01-01T02:59:59.999Z'))).toBe('2027-01-01') // Dec 31, 21:59:59.999
    expect(earliestPublishDate(at('2027-01-01T03:00:00.000Z'))).toBe('2027-01-02') // Dec 31, 22:00
    expect(earliestPublishDate(at('2028-02-29T02:59:59.999Z'))).toBe('2028-02-29') // Feb 28, 21:59:59.999
    expect(earliestPublishDate(at('2028-02-29T03:00:00.000Z'))).toBe('2028-03-01') // Feb 28, 22:00
    expect(earliestPublishDate(at('2026-11-01T02:00:00.000Z'))).toBe('2026-11-02') // Oct 31, 22:00 EDT
  })

  it('applies the cutoff on DST transition days', () => {
    // Mar 8, 2026 (spring forward): cutoff is 22:00 EDT = 02:00Z on Mar 9.
    expect(earliestPublishDate(at('2026-03-09T01:59:59.999Z'))).toBe('2026-03-09')
    expect(earliestPublishDate(at('2026-03-09T02:00:00.000Z'))).toBe('2026-03-10')
    // Nov 1, 2026 (fall back): cutoff is 22:00 EST = 03:00Z on Nov 2.
    expect(earliestPublishDate(at('2026-11-02T02:59:59.999Z'))).toBe('2026-11-02')
    expect(earliestPublishDate(at('2026-11-02T03:00:00.000Z'))).toBe('2026-11-03')
    // During the repeated 01:30 hour on Nov 1, both instants are Nov 1.
    expect(earliestPublishDate(at('2026-11-01T05:30:00Z'))).toBe('2026-11-02')
    expect(earliestPublishDate(at('2026-11-01T06:30:00Z'))).toBe('2026-11-02')
  })

  it('always yields a release instant strictly after now', () => {
    const start = at('2026-03-06T00:00:00Z').getTime()
    for (let t = start; t < start + 10 * 24 * 3600 * 1000; t += 17 * 60 * 1000 + 1) {
      const now = new Date(t)
      const earliest = earliestPublishDate(now)
      expect(releaseInstant(earliest).getTime()).toBeGreaterThan(t)
      // ...and the day before it would not have been: earliest is the first open slot.
      expect(releaseInstant(addDays(earliest, -1)).getTime()).toBeLessThanOrEqual(t)
    }
  })

  it('is independent of the machine timezone', () => {
    const now = at('2026-10-01T02:00:00.000Z')
    for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata']) {
      vi.stubEnv('TZ', tz)
      expect(earliestPublishDate(now), tz).toBe('2026-10-02')
      expect(releaseInstant('2026-10-02').toISOString(), tz).toBe('2026-10-02T02:00:00.000Z')
    }
  })
})

describe('assignPublishDate', () => {
  it('takes the earliest date when nothing is published', () => {
    expect(assignPublishDate(null, '2026-10-01')).toBe('2026-10-01')
  })

  it('never backfills when the queue is behind', () => {
    expect(assignPublishDate('2026-09-20', '2026-10-01')).toBe('2026-10-01')
    expect(assignPublishDate('2026-09-29', '2026-10-01')).toBe('2026-10-01')
  })

  it('continues the queue when it reaches the earliest date or beyond', () => {
    expect(assignPublishDate('2026-09-30', '2026-10-01')).toBe('2026-10-01')
    expect(assignPublishDate('2026-10-01', '2026-10-01')).toBe('2026-10-02')
    expect(assignPublishDate('2026-10-14', '2026-10-01')).toBe('2026-10-15')
  })

  it('uses calendar arithmetic across month, year, and leap-day boundaries', () => {
    expect(assignPublishDate('2026-12-31', '2026-12-01')).toBe('2027-01-01')
    expect(assignPublishDate('2028-02-28', '2028-02-01')).toBe('2028-02-29')
    expect(assignPublishDate('2027-02-28', '2027-02-01')).toBe('2027-03-01')
  })

  it('composes with earliestPublishDate across the cutoff', () => {
    const before = at('2026-10-01T01:59:59.999Z')
    const after = at('2026-10-01T02:00:00.000Z')
    expect(assignPublishDate(null, earliestPublishDate(before))).toBe('2026-10-01')
    expect(assignPublishDate(null, earliestPublishDate(after))).toBe('2026-10-02')
    expect(assignPublishDate('2026-10-05', earliestPublishDate(after))).toBe('2026-10-06')
  })
})

describe('publicationStatus', () => {
  it('is scheduled before the release instant and published from it onward', () => {
    expect(publicationStatus('2026-10-01', at('2026-10-01T01:59:59.999Z'))).toBe('scheduled')
    expect(publicationStatus('2026-10-01', at('2026-10-01T02:00:00.000Z'))).toBe('published')
    expect(publicationStatus('2026-10-01', at('2026-12-25T00:00:00Z'))).toBe('published')
    expect(publicationStatus('2026-10-02', at('2026-10-01T02:00:00.000Z'))).toBe('scheduled')
  })

  it('follows DST on transition days', () => {
    expect(publicationStatus('2026-11-02', at('2026-11-02T02:59:59.999Z'))).toBe('scheduled')
    expect(publicationStatus('2026-11-02', at('2026-11-02T03:00:00.000Z'))).toBe('published')
    expect(publicationStatus('2026-03-09', at('2026-03-09T01:59:59.999Z'))).toBe('scheduled')
    expect(publicationStatus('2026-03-09', at('2026-03-09T02:00:00.000Z'))).toBe('published')
  })
})
