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
