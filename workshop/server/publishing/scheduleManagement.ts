// The publishing schedule as an operator sees it, and the one change it
// allows: removing an unreleased (scheduled) puzzle.
//
//   Released rows are permanent history. Scheduled rows (release instant
//   still after the store's authoritative now()) form a future queue. Removing
//   a scheduled puzzle deletes it and moves every later puzzle forward one
//   day, in ascending date order, in ONE transaction: each move lands on the
//   date the previous step just freed, so the non-deferrable UNIQUE
//   (publish_date) constraint never sees a collision. The store's guards
//   refuse to delete or move anything onto a released date, so a released
//   row can never change even if the clock crosses 10 PM mid-transaction.
//
// Status is always derived from the store clock, never stored or taken from
// a client. Like publishing, removal retries contention with completely
// fresh attempts, and every attempt re-checks the operator's expected date
// and fingerprint, so a stale preview can never be forced through.

import { addDays, compareDateKeys } from '../../../src/publishing/dateKey'
import { releaseInstant } from '../../../src/publishing/releaseSchedule'
import type { DateKey } from '../../../src/publishing/types'
import { MAX_PUBLISH_ATTEMPTS } from './publishPuzzle'
import { PublicationContentionError } from './publicationStore'
import type { CalendarRecord, PublicationReader, PublicationStore } from './publicationStore'
import type { Schedule, ScheduleEntry, ScheduleMove, SchedulePuzzle } from '../../src/production/contract'

export type { Schedule, ScheduleEntry, ScheduleMove, SchedulePuzzle }

export type RemovalPlan =
  | { kind: 'removable'; target: SchedulePuzzle; moves: ScheduleMove[] }
  | { kind: 'released'; target: SchedulePuzzle }
  | { kind: 'not-found' }

export interface RemovalRequest {
  puzzleId: string
  /** From the operator's preview; a guard, not an instruction. */
  expectedPublishDate: DateKey
  expectedFingerprint: string
}

export type RemovalOutcome =
  | { kind: 'removed'; removed: SchedulePuzzle; moves: ScheduleMove[] }
  | { kind: 'not-found' }
  | { kind: 'stale'; current: SchedulePuzzle }
  | { kind: 'released'; target: SchedulePuzzle }
  | { kind: 'busy' }
  | { kind: 'unavailable' }

function toSchedulePuzzle(record: CalendarRecord): SchedulePuzzle {
  return {
    puzzleId: record.puzzleId,
    clue: record.clue,
    publishDate: record.publishDate,
    releaseInstant: releaseInstant(record.publishDate).toISOString(),
    contentFingerprint: record.contentFingerprint,
  }
}

function isReleased(publishDate: DateKey, now: Date): boolean {
  return releaseInstant(publishDate).getTime() <= now.getTime()
}

function sortedByDate(records: CalendarRecord[]): CalendarRecord[] {
  return [...records].sort((a, b) => compareDateKeys(a.publishDate, b.publishDate))
}

function daysBetween(from: DateKey, to: DateKey): number {
  let days = 0
  for (let date = from; compareDateKeys(date, to) < 0; date = addDays(date, 1)) days++
  return days
}

/** The operator's schedule at `now`. Pure. */
export function buildSchedule(records: CalendarRecord[], now: Date): Schedule {
  const sorted = sortedByDate(records)
  const released = sorted.filter((record) => isReleased(record.publishDate, now))
  const currentDate = released.at(-1)?.publishDate ?? null
  const entries: ScheduleEntry[] = sorted.map((record) => {
    const scheduled = !isReleased(record.publishDate, now)
    return {
      ...toSchedulePuzzle(record),
      status: scheduled ? 'scheduled' : record.publishDate === currentDate ? 'current' : 'released',
      removable: scheduled,
    }
  })
  const scheduled = entries.filter((entry) => entry.status === 'scheduled')

  const dates = new Set(sorted.map((record) => record.publishDate))
  const gaps: DateKey[] = []
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1].publishDate
    for (let date = sorted[0].publishDate; compareDateKeys(date, last) < 0; date = addDays(date, 1)) {
      if (!dates.has(date)) gaps.push(date)
    }
  }

  let filledThrough: DateKey | null = currentDate
  while (filledThrough !== null && dates.has(addDays(filledThrough, 1))) filledThrough = addDays(filledThrough, 1)

  return {
    asOf: now.toISOString(),
    entries,
    summary: {
      currentDate,
      lastScheduledDate: scheduled.at(-1)?.publishDate ?? null,
      scheduledCount: scheduled.length,
      filledThrough,
      daysAhead: currentDate !== null && filledThrough !== null ? daysBetween(currentDate, filledThrough) : 0,
      gaps,
    },
  }
}

/** What removing `puzzleId` at `now` would do. Pure. */
export function planRemoval(records: CalendarRecord[], puzzleId: string, now: Date): RemovalPlan {
  const sorted = sortedByDate(records)
  const target = sorted.find((record) => record.puzzleId === puzzleId)
  if (!target) return { kind: 'not-found' }
  if (isReleased(target.publishDate, now)) return { kind: 'released', target: toSchedulePuzzle(target) }
  // Every later row is necessarily unreleased too (its release is later than the target's).
  const moves = sorted
    .filter((record) => compareDateKeys(record.publishDate, target.publishDate) > 0)
    .map((record) => ({ puzzleId: record.puzzleId, clue: record.clue, from: record.publishDate, to: addDays(record.publishDate, -1) }))
  return { kind: 'removable', target: toSchedulePuzzle(target), moves }
}

export async function readSchedule(reader: PublicationReader): Promise<Schedule> {
  const [now, records] = [await reader.now(), await reader.listCalendar()]
  return buildSchedule(records, now)
}

/** Never writes. The plan can go stale; removal re-checks everything. */
export async function previewRemoval(reader: PublicationReader, puzzleId: string): Promise<RemovalPlan> {
  const [now, records] = [await reader.now(), await reader.listCalendar()]
  return planRemoval(records, puzzleId, now)
}

export async function removeScheduledPuzzle(
  request: RemovalRequest,
  store: PublicationStore,
  maxAttempts = MAX_PUBLISH_ATTEMPTS,
): Promise<RemovalOutcome> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await store.transaction<RemovalOutcome>(async (tx) => {
        const plan = planRemoval(await tx.listCalendar(), request.puzzleId, await tx.now())
        if (plan.kind === 'not-found') return plan
        const { target } = plan
        if (target.publishDate !== request.expectedPublishDate || target.contentFingerprint !== request.expectedFingerprint) {
          return { kind: 'stale', current: target }
        }
        if (plan.kind === 'released') return plan

        // A guard refusing here means 10 PM passed mid-transaction: roll back
        // and let a fresh attempt classify the puzzle as released.
        if (!(await tx.deleteScheduled(target.puzzleId, target.publishDate))) {
          throw new PublicationContentionError('release-slot-passed')
        }
        for (const move of plan.moves) {
          if (!(await tx.moveScheduled(move.puzzleId, move.from, move.to))) {
            throw new PublicationContentionError('release-slot-passed')
          }
        }
        return { kind: 'removed', removed: target, moves: plan.moves }
      })
    } catch (error) {
      if (error instanceof PublicationContentionError) continue
      return { kind: 'unavailable' }
    }
  }
  return { kind: 'busy' }
}
