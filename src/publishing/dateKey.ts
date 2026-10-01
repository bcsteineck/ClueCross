// Calendar-date arithmetic on canonical `YYYY-MM-DD` keys. A DateKey is a
// date with no time or zone, so arithmetic runs in UTC, which has no DST:
// adding a day is always exactly one calendar day, never 24 hours of some
// zone's wall clock. Nothing here reads the machine's timezone or clock.

import type { DateKey } from './types'

export interface CalendarDate {
  year: number
  /** 1–12 */
  month: number
  /** 1–31 */
  day: number
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

// setUTCFullYear rather than Date.UTC, which maps years 0–99 to 1900–1999.
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date
}

function fromUtcDate(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

/** True for a canonical key naming a real calendar date (e.g. not 2026-02-30). */
export function isDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = fromUtcDate(utcDate(year, month, day))
  return date.year === year && date.month === month && date.day === day
}

export function parseDateKey(value: DateKey): CalendarDate {
  if (!isDateKey(value)) throw new Error(`Invalid DateKey "${value}"; expected a real date as YYYY-MM-DD.`)
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

export function formatDateKey({ year, month, day }: CalendarDate): DateKey {
  const key = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
  if (!isDateKey(key)) throw new Error(`Invalid calendar date ${year}-${month}-${day}.`)
  return key
}

/** Negative, zero, or positive as `a` is before, equal to, or after `b`. */
export function compareDateKeys(a: DateKey, b: DateKey): number {
  parseDateKey(a)
  parseDateKey(b)
  // Canonical fixed-width keys sort chronologically as strings.
  return a < b ? -1 : a > b ? 1 : 0
}

export function maxDateKey(a: DateKey, b: DateKey): DateKey {
  return compareDateKeys(a, b) >= 0 ? a : b
}

/** Calendar-day arithmetic: `days` may be negative; must be an integer. */
export function addDays(key: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) throw new Error(`Day offset must be an integer, got ${days}.`)
  const { year, month, day } = parseDateKey(key)
  return formatDateKey(fromUtcDate(utcDate(year, month, day + days)))
}
