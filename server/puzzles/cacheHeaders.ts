// Cache-Control policy for the player API, computed from the database time
// a response was judged at. Vercel's CDN honors Vercel-CDN-Cache-Control
// (and doesn't forward it); browsers see only Cache-Control.
//
//   calendar   CDN until just before the next 10:00 PM America/New_York
//              release boundary; browsers revalidate on every load.
//   puzzle 200 Released content never changes: CDN 1 year, browser 1 day.
//   puzzle 404 At most 60 s at the CDN, and never past the next release
//              boundary, so a date that is about to release can't stay
//              "missing" from a stale cached 404. Browsers revalidate.
//   errors     Never cached.

import { earliestPublishDate, releaseInstant } from '../../src/publishing/releaseSchedule.js'

export type CacheHeaders = Record<'Cache-Control', string> & Partial<Record<'Vercel-CDN-Cache-Control', string>>

/**
 * Seconds of slack kept before a release boundary, covering the gap
 * between the database read and the CDN storing the response, so a cached
 * calendar or 404 always expires before the boundary rather than after it.
 */
export const BOUNDARY_SAFETY_SECONDS = 2
export const NOT_FOUND_MAX_SECONDS = 60
const ONE_YEAR = 31_536_000
const ONE_DAY = 86_400

const REVALIDATE = 'public, max-age=0, must-revalidate'
export const NO_STORE: CacheHeaders = { 'Cache-Control': 'no-store' }

/** The first 10:00 PM America/New_York release instant strictly after `now`. */
export function nextReleaseBoundary(now: Date): Date {
  return releaseInstant(earliestPublishDate(now))
}

/** Whole seconds a response judged at `now` may be cached without reaching the next boundary. */
export function secondsBeforeNextBoundary(now: Date): number {
  const remaining = Math.floor((nextReleaseBoundary(now).getTime() - now.getTime()) / 1000) - BOUNDARY_SAFETY_SECONDS
  return Math.max(0, remaining)
}

function cdnFor(seconds: number): CacheHeaders {
  return seconds > 0
    ? { 'Cache-Control': REVALIDATE, 'Vercel-CDN-Cache-Control': `public, s-maxage=${seconds}` }
    : NO_STORE
}

export function calendarCacheHeaders(now: Date): CacheHeaders {
  return cdnFor(secondsBeforeNextBoundary(now))
}

export function releasedPuzzleCacheHeaders(): CacheHeaders {
  return {
    'Cache-Control': `public, max-age=${ONE_DAY}, immutable`,
    'Vercel-CDN-Cache-Control': `public, s-maxage=${ONE_YEAR}, immutable`,
  }
}

export function notFoundCacheHeaders(now: Date): CacheHeaders {
  return cdnFor(Math.min(NOT_FOUND_MAX_SECONDS, secondsBeforeNextBoundary(now)))
}
