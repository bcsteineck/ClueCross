import { afterEach, describe, expect, it, vi } from 'vitest'
import { easternDateKey, easternWallClock, easternWallTimeToInstant } from './easternTime'

const at = (iso: string) => new Date(iso)
// vi.stubEnv('TZ', …) changes the zone Node uses for local-time Date
// methods immediately; these functions must not be affected by it.
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Eastern wall clock', () => {
  it('reads EDT and EST correctly, including the date where UTC has already rolled over', () => {
    // 2026-10-01T01:59:59.999Z is still September 30 in New York (EDT, UTC−4).
    expect(easternWallClock(at('2026-10-01T01:59:59.999Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 30,
      hour: 21,
      minute: 59,
      second: 59,
      millisecond: 999,
    })
    expect(easternDateKey(at('2026-10-01T03:30:00Z'))).toBe('2026-09-30')
    expect(easternDateKey(at('2026-10-01T04:00:00Z'))).toBe('2026-10-01')
    // Winter: EST, UTC−5.
    expect(easternWallClock(at('2027-01-01T04:59:00Z'))).toMatchObject({ year: 2026, month: 12, day: 31, hour: 23 })
    expect(easternDateKey(at('2027-01-01T05:00:00Z'))).toBe('2027-01-01')
  })

  it('uses midnight as hour 0, never 24', () => {
    expect(easternWallClock(at('2026-10-01T04:00:00Z'))).toMatchObject({ day: 1, hour: 0, minute: 0 })
  })

  it('follows the 2026 DST transitions from the zone rules', () => {
    // Spring forward: 01:59:59 EST is followed by 03:00:00 EDT.
    expect(easternWallClock(at('2026-03-08T06:59:59Z'))).toMatchObject({ day: 8, hour: 1, minute: 59, second: 59 })
    expect(easternWallClock(at('2026-03-08T07:00:00Z'))).toMatchObject({ day: 8, hour: 3, minute: 0 })
    // Fall back: 01:30 happens twice, an hour apart.
    expect(easternWallClock(at('2026-11-01T05:30:00Z'))).toMatchObject({ day: 1, hour: 1, minute: 30 })
    expect(easternWallClock(at('2026-11-01T06:30:00Z'))).toMatchObject({ day: 1, hour: 1, minute: 30 })
  })

  it('rejects an invalid instant', () => {
    expect(() => easternWallClock(new Date(Number.NaN))).toThrow('Invalid instant')
  })
})

describe('Eastern wall time → instant', () => {
  it('applies EDT or EST from the zone rules', () => {
    expect(easternWallTimeToInstant('2026-09-30', 22).toISOString()).toBe('2026-10-01T02:00:00.000Z')
    expect(easternWallTimeToInstant('2026-12-31', 22).toISOString()).toBe('2027-01-01T03:00:00.000Z')
    expect(easternWallTimeToInstant('2026-07-04', 0).toISOString()).toBe('2026-07-04T04:00:00.000Z')
  })

  it('handles the days on either side of each DST change', () => {
    expect(easternWallTimeToInstant('2026-03-07', 22).toISOString()).toBe('2026-03-08T03:00:00.000Z')
    expect(easternWallTimeToInstant('2026-03-08', 22).toISOString()).toBe('2026-03-09T02:00:00.000Z')
    expect(easternWallTimeToInstant('2026-10-31', 22).toISOString()).toBe('2026-11-01T02:00:00.000Z')
    expect(easternWallTimeToInstant('2026-11-01', 22).toISOString()).toBe('2026-11-02T03:00:00.000Z')
    // Just after each transition on the day itself.
    expect(easternWallTimeToInstant('2026-03-08', 3).toISOString()).toBe('2026-03-08T07:00:00.000Z')
    expect(easternWallTimeToInstant('2026-11-01', 2).toISOString()).toBe('2026-11-01T07:00:00.000Z')
  })

  it('rejects a wall time skipped by spring-forward', () => {
    expect(() => easternWallTimeToInstant('2026-03-08', 2, 30)).toThrow('does not exist in America/New_York')
  })

  it('round-trips with the wall clock', () => {
    const instant = easternWallTimeToInstant('2028-02-29', 22, 15, 30)
    expect(easternWallClock(instant)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
      hour: 22,
      minute: 15,
      second: 30,
      millisecond: 0,
    })
  })
})

describe('independence from the machine timezone', () => {
  it('gives identical results whatever TZ the runtime is set to', () => {
    const localHours = new Set<number>()
    const results = (['UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Kolkata', 'America/Los_Angeles'] as const).map(
      (tz) => {
        vi.stubEnv('TZ', tz)
        localHours.add(at('2026-10-01T02:00:00Z').getHours())
        return [
          easternDateKey(at('2026-10-01T03:30:00Z')),
          easternWallClock(at('2026-03-08T07:00:00Z')).hour,
          easternWallTimeToInstant('2026-11-01', 22).toISOString(),
          easternWallTimeToInstant('2026-03-07', 22).toISOString(),
        ]
      },
    )
    // The stub really changed the zone local-time methods use...
    expect(localHours.size).toBe(5)
    // ...and none of the Eastern results moved.
    for (const result of results) expect(result).toEqual(results[0])
    expect(results[0]).toEqual(['2026-09-30', 3, '2026-11-02T03:00:00.000Z', '2026-03-08T03:00:00.000Z'])
  })
})
