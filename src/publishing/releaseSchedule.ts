// Publishing v1 release rules, all in America/New_York. A puzzle with
// publishDate D releases at 10:00 PM Eastern on the calendar day before D.
// Status is derived from that instant, never stored. Every function takes
// the current instant as a parameter — callers supply the authoritative
// clock (the database's, when publishing) — so nothing here reads Date.now().

import { addDays, compareDateKeys, maxDateKey } from './dateKey.js'
import { easternDateKey, easternWallTimeToInstant } from './easternTime.js'
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
 * publishDate, but never before `earliest`. Normal publishing never fills
 * a gap; only an explicit backfill to a missed date does (missedPublishDates).
 */
export function assignPublishDate(latestPublishDate: DateKey | null, earliest: DateKey): DateKey {
  return latestPublishDate === null ? earliest : maxDateKey(addDays(latestPublishDate, 1), earliest)
}

export function publicationStatus(publishDate: DateKey, now: Date): PublicationStatus {
  return now.getTime() < releaseInstant(publishDate).getTime() ? 'scheduled' : 'published'
}

/** The latest publishDate whose release instant has passed at `now`: the day before earliestPublishDate. */
export function latestReleasedDate(now: Date): DateKey {
  return addDays(earliestPublishDate(now), -1)
}

export type BackfillIneligibility = 'no-history' | 'before-first' | 'not-released' | 'occupied'

/**
 * Why `publishDate` can't take a backfill at `now`, or null when it can: a
 * missed date is one on or after the first published date, already past
 * its release instant, and holding no puzzle. `publishDates` is every
 * existing publishDate (released or scheduled), in any order.
 */
export function backfillIneligibility(
  publishDate: DateKey,
  publishDates: readonly DateKey[],
  now: Date,
): BackfillIneligibility | null {
  if (publishDates.length === 0) return 'no-history'
  const first = publishDates.reduce((a, b) => (compareDateKeys(a, b) <= 0 ? a : b))
  if (compareDateKeys(publishDate, first) < 0) return 'before-first'
  if (publicationStatus(publishDate, now) !== 'published') return 'not-released'
  if (publishDates.includes(publishDate)) return 'occupied'
  return null
}

/**
 * Every missed date at `now`, oldest first: from the first published date
 * through latestReleasedDate(now), skipping dates that hold a puzzle. It
 * includes today's date once its release has passed with nothing in it.
 * Bounded by the first published date; empty with no history.
 */
export function missedPublishDates(publishDates: readonly DateKey[], now: Date): DateKey[] {
  if (publishDates.length === 0) return []
  const occupied = new Set(publishDates)
  const first = publishDates.reduce((a, b) => (compareDateKeys(a, b) <= 0 ? a : b))
  const last = latestReleasedDate(now)
  const missed: DateKey[] = []
  for (let date = first; compareDateKeys(date, last) <= 0; date = addDays(date, 1)) {
    if (!occupied.has(date)) missed.push(date)
  }
  return missed
}
