// The persistence boundary for Publishing v1. Domain logic (publishPuzzle.ts)
// depends only on these interfaces; the in-memory store implements them for
// tests and the Neon store will in Phase 4. No driver concepts leak here.
//
// Contract every store must honor:
//   - transaction(fn) gives fn a fresh, consistent view, commits only if fn
//     resolves, and rolls back (no partial writes) if fn throws;
//   - now() is the store's authoritative clock (the database clock);
//   - insert enforces unique puzzleId and unique publishDate, and rejects a
//     publishDate whose release instant is no longer strictly after now();
//   - contention a fresh attempt could resolve (a taken date or id, a
//     serialization failure, a passed release slot) is thrown as
//     PublicationContentionError; anything else is an infrastructure failure;
//   - deleteScheduled/moveScheduled change a row only while it is still at
//     the given date and the affected release instant is strictly after
//     now(), so a released row can never be deleted or moved; they report
//     whether the row changed, and a move onto a taken date is contention.

import type { DateKey, FingerprintVersion, PublishedPuzzle } from '../../../src/publishing/types'

export type NewPublication = Omit<PublishedPuzzle, 'createdAt'>

/** Schedule metadata for one publication — never its puzzle or layout content. */
export interface CalendarRecord {
  puzzleId: string
  publishDate: DateKey
  clue: string
  contentFingerprint: string
  fingerprintVersion: FingerprintVersion
}

export interface PublicationReader {
  now(): Promise<Date>
  findById(puzzleId: string): Promise<PublishedPuzzle | null>
  latestPublishDate(): Promise<DateKey | null>
  /** Every publication's metadata, ascending by publishDate. */
  listCalendar(): Promise<CalendarRecord[]>
}

export interface PublicationTransaction extends PublicationReader {
  /** Stages the record; it becomes visible to others only when the transaction commits. */
  insert(record: NewPublication): Promise<PublishedPuzzle>
  /** Deletes the row if it is still at `publishDate` and that date has not released. */
  deleteScheduled(puzzleId: string, publishDate: DateKey): Promise<boolean>
  /** Moves the row from `from` to `to` if it is still at `from` and `to` has not released. */
  moveScheduled(puzzleId: string, from: DateKey, to: DateKey): Promise<boolean>
}

export interface PublicationStore {
  transaction<T>(fn: (tx: PublicationTransaction) => Promise<T>): Promise<T>
  /** Non-locking reads for preview, outside any transaction. */
  reader(): PublicationReader
}

export type ContentionReason = 'puzzle-id-taken' | 'publish-date-taken' | 'serialization' | 'release-slot-passed'

/** Retryable: another publisher or the clock moved; a completely fresh attempt may succeed. */
export class PublicationContentionError extends Error {
  readonly reason: ContentionReason

  constructor(reason: ContentionReason) {
    super(`Publication contention: ${reason}.`)
    this.name = 'PublicationContentionError'
    this.reason = reason
  }
}
