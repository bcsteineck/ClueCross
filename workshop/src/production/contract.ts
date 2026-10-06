// Wire contract between the Workshop browser and its local Production
// operations endpoints (Production-operations mode only). Types plus the
// fixed paths — shared by the server bridge/runner and the browser client,
// like publishing/contract.ts. The browser never receives credentials or
// unreleased puzzle content: schedule data is metadata only.

import type { DateKey } from '../../../src/publishing/types'
import type { PreviewResponseBody, PublishRequest, PublishResponseBody } from '../publishing/contract'

export const PRODUCTION_PATHS = {
  schedule: '/api/production/schedule',
  publishPreview: '/api/production/publish/preview',
  publish: '/api/production/publish',
  removePreview: '/api/production/remove/preview',
  remove: '/api/production/remove',
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
