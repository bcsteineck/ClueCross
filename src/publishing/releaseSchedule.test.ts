import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays } from './dateKey'
import { easternWallClock } from './easternTime'
import {
  assignPublishDate,
  backfillIneligibility,
  earliestPublishDate,
  latestReleasedDate,
  missedPublishDates,
  publicationStatus,
  releaseInstant,
} from './releaseSchedule'

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

describe('latestReleasedDate', () => {
  it('is today (Eastern) before 10 PM and tomorrow from 10 PM, in daylight time', () => {
    // October 2, 2026 in New York (EDT).
    expect(latestReleasedDate(at('2026-10-03T01:59:59.999Z'))).toBe('2026-10-02') // Oct 2, 9:59:59.999 PM EDT
    expect(latestReleasedDate(at('2026-10-03T02:00:00.000Z'))).toBe('2026-10-03') // Oct 2, 10:00 PM EDT
  })

  it('uses the EST cutoff in winter', () => {
    // The November 8, 2026 puzzle releases November 7 at 10 PM EST (03:00Z).
    expect(latestReleasedDate(at('2026-11-08T02:59:59.999Z'))).toBe('2026-11-07')
    expect(latestReleasedDate(at('2026-11-08T03:00:00.000Z'))).toBe('2026-11-08')
  })

  it('always names a date whose release has passed, and the next date has not', () => {
    const start = at('2026-03-06T00:00:00.000Z').getTime()
    for (let t = start; t < start + 10 * 86_400_000; t += 37 * 60_000 + 7) {
      const now = at(new Date(t).toISOString())
      const latest = latestReleasedDate(now)
      expect(publicationStatus(latest, now)).toBe('published')
      expect(publicationStatus(addDays(latest, 1), now)).toBe('scheduled')
    }
  })
})

describe('backfillIneligibility', () => {
  // Released Nov 1–7 and Nov 9 (published late), Nov 10 scheduled; Nov 8 was missed.
  const DATES = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-10']
  const NOON_NOV_9 = at('2026-11-09T17:00:00.000Z') // noon EST

  it('accepts a missed historical date after the first published date', () => {
    expect(backfillIneligibility('2026-11-08', DATES, NOON_NOV_9)).toBeNull()
  })

  it('refuses a date before the first published date', () => {
    expect(backfillIneligibility('2026-10-31', DATES, NOON_NOV_9)).toBe('before-first')
  })

  it('refuses an occupied date, released or scheduled', () => {
    expect(backfillIneligibility('2026-11-07', DATES, NOON_NOV_9)).toBe('occupied')
    expect(backfillIneligibility('2026-11-09', DATES, NOON_NOV_9)).toBe('occupied')
  })

  it('refuses a future date, scheduled or not', () => {
    expect(backfillIneligibility('2026-11-10', DATES, NOON_NOV_9)).toBe('not-released') // scheduled
    expect(backfillIneligibility('2026-11-11', DATES, NOON_NOV_9)).toBe('not-released')
  })

  it('accepts a missed date only from its release cutoff (10 PM Eastern the day before)', () => {
    const dates = DATES.slice(0, 7) // through Nov 7; Nov 8 is missing
    expect(backfillIneligibility('2026-11-08', dates, at('2026-11-08T02:59:59.999Z'))).toBe('not-released') // 9:59:59.999 PM EST
    expect(backfillIneligibility('2026-11-08', dates, at('2026-11-08T03:00:00.000Z'))).toBeNull() // 10:00 PM EST
  })

  it('uses the EDT cutoff in daylight time', () => {
    const dates = ['2026-07-01', '2026-07-02']
    expect(backfillIneligibility('2026-07-03', dates, at('2026-07-03T01:59:59.999Z'))).toBe('not-released') // 9:59:59.999 PM EDT
    expect(backfillIneligibility('2026-07-03', dates, at('2026-07-03T02:00:00.000Z'))).toBeNull() // 10:00 PM EDT
  })

  it('crosses the DST transitions at 10 PM local time', () => {
    // Spring forward: the March 9, 2026 puzzle releases March 8 at 10 PM EDT (02:00Z).
    expect(backfillIneligibility('2026-03-09', ['2026-03-07'], at('2026-03-09T01:59:59.999Z'))).toBe('not-released')
    expect(backfillIneligibility('2026-03-09', ['2026-03-07'], at('2026-03-09T02:00:00.000Z'))).toBeNull()
    // Fall back: the November 2, 2026 puzzle releases November 1 at 10 PM EST (03:00Z).
    expect(backfillIneligibility('2026-11-02', ['2026-10-30'], at('2026-11-02T02:59:59.999Z'))).toBe('not-released')
    expect(backfillIneligibility('2026-11-02', ['2026-10-30'], at('2026-11-02T03:00:00.000Z'))).toBeNull()
  })

  it('refuses everything with no publication history', () => {
    expect(backfillIneligibility('2026-11-08', [], NOON_NOV_9)).toBe('no-history')
  })

  it('takes the first date from the data, in any order', () => {
    expect(backfillIneligibility('2026-11-02', ['2026-11-05', '2026-11-01'], NOON_NOV_9)).toBeNull()
    expect(backfillIneligibility('2026-10-31', ['2026-11-05', '2026-11-01'], NOON_NOV_9)).toBe('before-first')
  })
})

describe('missedPublishDates', () => {
  it('lists missed dates from the first published date through the latest released date', () => {
    const dates = ['2026-11-01', '2026-11-03', '2026-11-04', '2026-11-07', '2026-11-09', '2026-11-12']
    expect(missedPublishDates(dates, at('2026-11-09T17:00:00.000Z'))).toEqual(['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-08'])
  })

  it('includes today’s missed date right after its cutoff, with nothing after it', () => {
    const dates = ['2026-11-06', '2026-11-07']
    expect(missedPublishDates(dates, at('2026-11-08T02:59:59.999Z'))).toEqual([]) // Nov 7, 9:59:59.999 PM EST
    expect(missedPublishDates(dates, at('2026-11-08T03:00:00.000Z'))).toEqual(['2026-11-08']) // Nov 7, 10:00 PM EST
  })

  it('is empty with no history, with nothing missed, or before the first date releases', () => {
    expect(missedPublishDates([], at('2026-11-09T17:00:00.000Z'))).toEqual([])
    expect(missedPublishDates(['2026-11-08', '2026-11-09'], at('2026-11-09T17:00:00.000Z'))).toEqual([])
    // The only puzzle is still scheduled: nothing has released, so nothing is missed.
    expect(missedPublishDates(['2026-11-20'], at('2026-11-09T17:00:00.000Z'))).toEqual([])
  })

  it('never lists a date before the first published date', () => {
    const missed = missedPublishDates(['2026-11-05'], at('2026-11-09T17:00:00.000Z'))
    expect(missed).toEqual(['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])
  })

  it('agrees with backfillIneligibility for every date it lists', () => {
    const dates = ['2026-03-01', '2026-03-04', '2026-03-10']
    const now = at('2026-03-12T12:00:00.000Z')
    for (const date of missedPublishDates(dates, now)) expect(backfillIneligibility(date, dates, now), date).toBeNull()
  })
})
