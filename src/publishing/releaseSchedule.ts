// Publishing v1 release rules, all in America/New_York. A puzzle with
// publishDate D releases at 10:00 PM Eastern on the calendar day before D.
// Status is derived from that instant, never stored. Every function takes
// the current instant as a parameter — callers supply the authoritative
// clock (the database's, when publishing) — so nothing here reads Date.now().

import { addDays, maxDateKey } from './dateKey'
import { easternDateKey, easternWallTimeToInstant } from './easternTime'
import type { DateKey, PublicationStatus } from './types'

export const RELEASE_HOUR = 22

/** 10:00 PM America/New_York on the day before `publishDate`. */
export function releaseInstant(publishDate: DateKey): Date {
  return easternWallTimeToInstant(addDays(publishDate, -1), RELEASE_HOUR)
}

/**
 * The earliest publishDate a new publication may take at `now`: Eastern
 * tomorrow before 10:00 PM, the day after that at or after 10:00 PM. Either
 * way its release instant is strictly after `now`.
 */
export function earliestPublishDate(now: Date): DateKey {
  const tomorrow = addDays(easternDateKey(now), 1)
  return now.getTime() < releaseInstant(tomorrow).getTime() ? tomorrow : addDays(tomorrow, 1)
}

/**
 * The date a new publication takes: the day after the latest existing
 * publishDate, but never before `earliest`. Gaps are never backfilled.
 */
export function assignPublishDate(latestPublishDate: DateKey | null, earliest: DateKey): DateKey {
  return latestPublishDate === null ? earliest : maxDateKey(addDays(latestPublishDate, 1), earliest)
}

export function publicationStatus(publishDate: DateKey, now: Date): PublicationStatus {
  return now.getTime() < releaseInstant(publishDate).getTime() ? 'scheduled' : 'published'
}
