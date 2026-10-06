import { parseDateKey } from '../publishing/dateKey'
import type { DateKey } from '../publishing/types'
import { getStarCount } from './awardLevel'

// The spoiler-free result a player shares after completing a puzzle:
//
//   ClueCross — Oct 6, 2026
//   ⭐⭐⭐ 1,740 / 2,000
//   5 reveals
//   cluecross.com
//
// Deliberately takes only numbers and the publish date — never the clue,
// answers, grid, or revealed letters — so it can't leak a spoiler. Stars
// come from the same getStarCount() the game shows; no thresholds here.

export const SHARE_URL = 'cluecross.com'

export interface ShareResultInput {
  /** The puzzle's publish date (YYYY-MM-DD) — never today's or the share date. */
  publishDate: DateKey
  score: number
  maxScore: number
  /** Total Reveal actions (free, paid, and letters absent from the puzzle). Null if unknown. */
  revealCount: number | null
}

// A DateKey is a calendar date with no zone: formatting it at UTC midnight
// in UTC can never shift it to a neighboring day in the player's timezone.
const SHARE_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const NUMBER_FORMAT = new Intl.NumberFormat('en-US')

/** "Oct 6, 2026" */
export function formatShareDate(publishDate: DateKey): string {
  const { year, month, day } = parseDateKey(publishDate)
  return SHARE_DATE_FORMAT.format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatShareStars(score: number): string {
  const filled = getStarCount(score)
  return '⭐'.repeat(filled) + '☆'.repeat(3 - filled)
}

export function formatRevealCount(count: number): string {
  return `${count} ${count === 1 ? 'reveal' : 'reveals'}`
}

export function formatShareResult({ publishDate, score, maxScore, revealCount }: ShareResultInput): string {
  const lines = [
    `ClueCross — ${formatShareDate(publishDate)}`,
    `${formatShareStars(score)} ${NUMBER_FORMAT.format(score)} / ${NUMBER_FORMAT.format(maxScore)}`,
  ]
  // A malformed stored result never gets an invented count: the line is left out.
  if (revealCount !== null) lines.push(formatRevealCount(revealCount))
  lines.push(SHARE_URL)
  return lines.join('\n')
}
