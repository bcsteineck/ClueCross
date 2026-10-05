// America/New_York wall-clock handling for publishing, via the IANA zone in
// the runtime's Intl data — never a fixed EST/EDT/UTC offset, and never the
// machine's own timezone. Every function takes an explicit instant; none
// reads the current time.

import { formatDateKey, parseDateKey } from './dateKey.js'
import type { DateKey } from './types'

export const PUBLICATION_TIME_ZONE = 'America/New_York'

export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLICATION_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function assertValidInstant(instant: Date): void {
  if (Number.isNaN(instant.getTime())) throw new Error('Invalid instant.')
}

// Wall-clock fields read as if they were UTC, for offset arithmetic.
function wallAsUtcMs(wall: Omit<WallClock, 'millisecond'> & { millisecond?: number }): number {
  const date = new Date(0)
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day)
  date.setUTCHours(wall.hour, wall.minute, wall.second, wall.millisecond ?? 0)
  return date.getTime()
}

/** The Eastern wall-clock reading at `instant`. */
export function easternWallClock(instant: Date): WallClock {
  assertValidInstant(instant)
  const parts: Record<string, number> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  // Eastern offsets are whole minutes, so milliseconds match the instant's.
  const millisecond = ((instant.getTime() % 1000) + 1000) % 1000
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond,
  }
}

/** The Eastern calendar date at `instant`. */
export function easternDateKey(instant: Date): DateKey {
  const { year, month, day } = easternWallClock(instant)
  return formatDateKey({ year, month, day })
}

// Eastern's UTC offset in effect at `instant`, in ms (e.g. -4h during EDT).
function offsetMs(instant: number): number {
  return wallAsUtcMs(easternWallClock(new Date(instant))) - instant
}

/**
 * The instant at which the Eastern wall clock reads `date hour:minute:second`.
 * Two passes find the offset in effect at the result, so DST is applied from
 * the zone rules. Throws for a wall time that doesn't exist (a spring-forward
 * gap); an ambiguous fall-back time resolves to one of its two instants.
 * Publishing only asks for 22:00, which DST transitions (at 02:00) never touch.
 */
export function easternWallTimeToInstant(date: DateKey, hour: number, minute = 0, second = 0): Date {
  const { year, month, day } = parseDateKey(date)
  const target = wallAsUtcMs({ year, month, day, hour, minute, second })
  let instant = target - offsetMs(target)
  const corrected = target - offsetMs(instant)
  if (corrected !== instant) instant = corrected

  const wall = easternWallClock(new Date(instant))
  if (
    wall.year !== year ||
    wall.month !== month ||
    wall.day !== day ||
    wall.hour !== hour ||
    wall.minute !== minute ||
    wall.second !== second
  ) {
    throw new Error(`${date} ${hour}:${minute}:${second} does not exist in ${PUBLICATION_TIME_ZONE}.`)
  }
  return new Date(instant)
}
