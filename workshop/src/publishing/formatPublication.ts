// Author-facing publication dates. A DateKey is a calendar date with no
// zone, so it is formatted in UTC and can never shift with the browser's
// own timezone; release instants are shown in Eastern time, the official
// publishing zone.

import { parseDateKey } from '../../../src/publishing/dateKey'
import { PUBLICATION_TIME_ZONE } from '../../../src/publishing/easternTime'
import type { DateKey } from '../../../src/publishing/types'

const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })

const releaseFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLICATION_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** "October 4, 2026" */
export function formatPublishDate(date: DateKey): string {
  const { year, month, day } = parseDateKey(date)
  const utc = new Date(0)
  utc.setUTCFullYear(year, month - 1, day)
  return dateFormat.format(utc)
}

/** "October 3 at 10:00 PM ET" */
export function formatReleaseInstant(iso: string): string {
  const parts = Object.fromEntries(
    releaseFormat
      .formatToParts(new Date(iso))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.month} ${parts.day} at ${parts.hour}:${parts.minute} ${parts.dayPeriod} ET`
}

/**
 * "November 7 at 7:00 PM PST" — the same instant in a viewer's own zone,
 * by default the browser's. Intl supplies the offset and abbreviation for
 * that date, so daylight saving time is never assumed.
 */
export function formatLocalInstant(iso: string, timeZone?: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
      .formatToParts(new Date(iso))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return `${parts.month} ${parts.day} at ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`
}

const shortDateFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: '2-digit', day: '2-digit', year: '2-digit' })

/** "10/04/26" — the compact form of formatPublishDate, for narrow tables. */
export function formatPublishDateShort(date: DateKey): string {
  const { year, month, day } = parseDateKey(date)
  const utc = new Date(0)
  utc.setUTCFullYear(year, month - 1, day)
  return shortDateFormat.format(utc)
}

const shortReleaseFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLICATION_TIME_ZONE,
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/**
 * { date: "10/03", time: "10 PM" } — the compact form of
 * formatReleaseInstant, still in Eastern time (the zone is named once, by
 * the column header, instead of on every row). Minutes appear only when
 * they aren't :00.
 */
export function formatReleaseInstantShort(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    shortReleaseFormat
      .formatToParts(new Date(iso))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const minutes = parts.minute === '00' ? '' : `:${parts.minute}`
  return { date: `${parts.month}/${parts.day}`, time: `${parts.hour}${minutes} ${parts.dayPeriod}` }
}
