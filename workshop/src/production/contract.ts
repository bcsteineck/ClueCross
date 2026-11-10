// Wire contract between the Workshop browser and its local Production
// operations endpoints (Production-operations mode only). Types plus the
// fixed paths — shared by the server bridge/runner and the browser client,
// like publishing/contract.ts. The browser never receives credentials, and
// schedule data is metadata only. The one narrow exception is
// puzzle-preview: when the operator clicks Preview, that single puzzle's
// stored content (released or not) comes back for read-only display.

import type { BackfillIneligibility } from '../../../src/publishing/releaseSchedule'
import type { DateKey } from '../../../src/publishing/types'
import type {
  PreviewResponseBody,
  PublicationSummary,
  PublishingConflictBody,
  PublishRequest,
  PublishResponseBody,
  PublishValidationErrors,
} from '../publishing/contract'

export const PRODUCTION_PATHS = {
  schedule: '/api/production/schedule',
  publishPreview: '/api/production/publish/preview',
  publish: '/api/production/publish',
  removePreview: '/api/production/remove/preview',
  remove: '/api/production/remove',
  backfillPreview: '/api/production/backfill/preview',
  backfill: '/api/production/backfill',
  puzzlePreview: '/api/production/puzzle/preview',
} as const

export type ScheduleStatus = 'released' | 'current' | 'scheduled'

/** One publication as the schedule shows it: metadata only, never puzzle content. */
export interface SchedulePuzzle {
  puzzleId: string
  clue: string
  publishDate: DateKey
  /** ISO 8601: 10:00 PM America/New_York on the day before publishDate. */
  releaseInstant: string
  contentFingerprint: string
}

export interface ScheduleEntry extends SchedulePuzzle {
  status: ScheduleStatus
  /** Informational: removal re-checks this at transaction time. */
  removable: boolean
}

export interface ScheduleSummary {
  /** The current puzzle's date: the released puzzle with the greatest publishDate. */
  currentDate: DateKey | null
  lastScheduledDate: DateKey | null
  scheduledCount: number
  /** Last date of the unbroken run of puzzles starting at the current one. */
  filledThrough: DateKey | null
  /** Days from the current puzzle's date to `filledThrough`. */
  daysAhead: number
  /** Dates with no puzzle between the first and last date in the calendar. */
  gaps: DateKey[]
  /**
   * Dates a backfill can fill: on or after the first date, already past
   * their release, and holding no puzzle — including today's date once its
   * release has passed with nothing in it.
   */
  missedDates: DateKey[]
}

export interface Schedule {
  /** The authoritative database time the statuses were derived at. */
  asOf: string
  /** Ascending by publishDate. */
  entries: ScheduleEntry[]
  summary: ScheduleSummary
}

export interface ScheduleMove {
  puzzleId: string
  clue: string
  from: DateKey
  to: DateKey
}

// ---- Request bodies (the operation is named by the path) ----------------

export interface ProductionPublishPreviewRequest {
  request: PublishRequest
}

export interface ProductionPublishRequest {
  request: PublishRequest
  /** The fingerprint shown in the Production preview. */
  expectedFingerprint: string
  /** The operator's typed confirmation; must equal request.id. */
  confirmPuzzleId: string
}

export interface ProductionBackfillPreviewRequest {
  request: PublishRequest
}

/** Publish to one missed past date — an explicit, separate operation from publish. */
export interface ProductionBackfillRequest {
  request: PublishRequest
  /** The missed date the operator chose; the server re-checks it and never substitutes another. */
  publishDate: DateKey
  /** The fingerprint shown in the backfill preview. */
  expectedFingerprint: string
  /** The operator's typed confirmation; must equal request.id. */
  confirmPuzzleId: string
}

/** Read one scheduled or released puzzle's stored content, as the schedule listed it. */
export interface ProductionPuzzlePreviewRequest {
  puzzleId: string
  /** The fingerprint the schedule showed; the server refuses if the stored content differs. */
  expectedFingerprint: string
}

export interface ProductionRemovePreviewRequest {
  puzzleId: string
}

export interface ProductionRemoveRequest {
  puzzleId: string
  expectedPublishDate: DateKey
  expectedFingerprint: string
  /** The operator's typed confirmation; must equal puzzleId. */
  confirmPuzzleId: string
}

// ---- Response bodies ----------------------------------------------------

/** The Production operation could not run (identity, configuration, runner, or timeout). Nothing was changed unless stated. */
export interface ProductionUnavailableBody {
  status: 'production-unavailable'
  reason: 'disabled' | 'not-configured' | 'identity' | 'unavailable' | 'uncertain'
  message: string
}

export interface ProductionBadRequestBody {
  status: 'bad-request'
  message: string
}

type ProductionFailure = ProductionUnavailableBody | ProductionBadRequestBody

export type ProductionScheduleBody = { status: 'ok'; schedule: Schedule } | ProductionFailure

export type ProductionPublishPreviewBody = PreviewResponseBody | ProductionFailure

export type ProductionPublishBody =
  | PublishResponseBody
  | { status: 'content-changed'; message: string; contentFingerprint: string }
  | ProductionFailure

/** A date a backfill could take, with the release instant that already passed. */
export interface MissedDate {
  publishDate: DateKey
  /** ISO 8601: 10:00 PM America/New_York on the day before publishDate (already passed). */
  releaseInstant: string
}

export type ProductionBackfillPreviewBody =
  | {
      status: 'missed-dates'
      contentFingerprint: string
      /** The first published date (the backfill lower bound); null with no history. */
      firstPublishDate: DateKey | null
      /** Oldest first; empty when nothing is missing or there is no history. */
      dates: MissedDate[]
    }
  | { status: 'existing'; publication: PublicationSummary }
  | PublishingConflictBody
  | { status: 'invalid'; errors: PublishValidationErrors }
  | { status: 'unavailable'; message: string }
  | ProductionFailure

export type ProductionBackfillBody =
  | { status: 'created'; publication: PublicationSummary }
  /** The same content is already published under this ID, on its own date; nothing was written. */
  | { status: 'existing'; publication: PublicationSummary }
  | PublishingConflictBody
  | { status: 'ineligible'; publishDate: DateKey; reason: BackfillIneligibility; message: string }
  | { status: 'invalid'; errors: PublishValidationErrors }
  | { status: 'content-changed'; message: string; contentFingerprint: string }
  | { status: 'busy'; message: string }
  | { status: 'unavailable'; message: string }
  | ProductionFailure

/** A stored puzzle's grid, shifted so its top-left occupied cell is at (0, 0). */
export interface PreviewBoard {
  width: number
  height: number
  /** cellId -> correct letter. */
  cells: Record<string, string>
  /** cellId -> 0-indexed position. */
  positions: Record<string, { x: number; y: number }>
}

export interface PreviewAnswer {
  /** The entry's letters in its stored cell order. */
  word: string
  direction: 'across' | 'down' | null
}

/** One stored puzzle for read-only display: only what the preview renders. */
export interface PuzzlePreview {
  puzzleId: string
  clue: string
  publishDate: DateKey
  releaseInstant: string
  /** Derived from database time; a released puzzle includes the current one. */
  status: 'scheduled' | 'released'
  contentFingerprint: string
  board: PreviewBoard
  /** In stored entry order. */
  answers: PreviewAnswer[]
}

export type ProductionPuzzlePreviewBody =
  | { status: 'ok'; preview: PuzzlePreview }
  /** No puzzle with that ID: removed since the schedule loaded. */
  | { status: 'not-found' }
  /** Same ID, different stored content (removed and published again). Nothing is shown. */
  | { status: 'changed'; current: SchedulePuzzle }
  | { status: 'unavailable'; message: string }
  | ProductionFailure

export type ProductionRemovePreviewBody =
  | { status: 'removable'; target: SchedulePuzzle; moves: ScheduleMove[] }
  | { status: 'released'; target: SchedulePuzzle }
  | { status: 'not-found' }
  | { status: 'unavailable'; message: string }
  | ProductionFailure

export type ProductionRemoveBody =
  | { status: 'removed'; removed: SchedulePuzzle; moves: ScheduleMove[] }
  | { status: 'not-found' }
  | { status: 'stale'; current: SchedulePuzzle }
  | { status: 'released'; target: SchedulePuzzle }
  | { status: 'busy'; message: string }
  | { status: 'unavailable'; message: string }
  | ProductionFailure
