// In-memory PublicationStore with the same behavioral contract as the
// planned Postgres store (see publicationStore.ts), for deterministic tests
// of the publishing domain. Not a fake SQL database — just enough to model:
//
//   - committed state, and a snapshot per transaction (a fresh view);
//   - staged inserts that commit atomically or are discarded on failure;
//   - unique puzzleId and publishDate against *committed* state at insert;
//   - a serialization failure when another commit changed the latest
//     publishDate after this transaction read it (what SERIALIZABLE
//     isolation would detect);
//   - the release guard: an insert whose release instant is not strictly
//     after the store clock is rejected as retryable;
//   - an injectable, controllable authoritative clock;
//   - interceptors that run just before an insert is checked, so tests can
//     commit a competing publication, move the clock, or throw;
//   - scheduled-queue changes (deleteScheduled/moveScheduled) on a
//     transaction-local copy, with the same release guard, a duplicate-date
//     check standing in for the UNIQUE constraint, and a serialization
//     failure at commit if anything else committed meanwhile.

import { compareDateKeys } from '../../../src/publishing/dateKey'
import { releaseInstant } from '../../../src/publishing/releaseSchedule'
import type { DateKey, PublishedPuzzle } from '../../../src/publishing/types'
import { PublicationContentionError } from './publicationStore'
import type {
  CalendarRecord,
  NewPublication,
  PublicationReader,
  PublicationStore,
  PublicationTransaction,
} from './publicationStore'

export interface InsertInterceptorContext {
  store: MemoryPublicationStore
  record: NewPublication
  /** 1-based count of transactions begun on this store. */
  transactionNumber: number
}

export type InsertInterceptor = (context: InsertInterceptorContext) => void

export interface ScheduleChangeContext {
  store: MemoryPublicationStore
  change: { kind: 'delete'; puzzleId: string; publishDate: DateKey } | { kind: 'move'; puzzleId: string; from: DateKey; to: DateKey }
  transactionNumber: number
}

export type ScheduleChangeInterceptor = (context: ScheduleChangeContext) => void

function latestOf(records: Iterable<PublishedPuzzle>): DateKey | null {
  let latest: DateKey | null = null
  for (const record of records) {
    if (latest === null || compareDateKeys(record.publishDate, latest) > 0) latest = record.publishDate
  }
  return latest
}

function copy(record: PublishedPuzzle): PublishedPuzzle {
  return structuredClone(record)
}

function calendarOf(records: Iterable<PublishedPuzzle>): CalendarRecord[] {
  return [...records]
    .sort((a, b) => compareDateKeys(a.publishDate, b.publishDate))
    .map((record) => ({
      puzzleId: record.puzzleId,
      publishDate: record.publishDate,
      clue: record.puzzle.clue,
      contentFingerprint: record.contentFingerprint,
      fingerprintVersion: record.fingerprintVersion,
    }))
}

export class MemoryPublicationStore implements PublicationStore {
  private readonly committed = new Map<string, PublishedPuzzle>()
  private clock: Date
  private readonly insertInterceptors: InsertInterceptor[] = []
  private readonly scheduleInterceptors: ScheduleChangeInterceptor[] = []
  private readonly scheduleFailures: Error[] = []
  /** Bumped by every commit, so a transaction can tell that someone else committed. */
  private committedVersion = 0
  private readonly transactionFailures: Error[] = []
  private readonly readFailures: Error[] = []
  transactionCount = 0
  /** Every publishDate an insert was attempted for, in order (including rejected ones). */
  readonly attemptedDates: DateKey[] = []

  constructor(options: { now: Date; records?: PublishedPuzzle[] }) {
    this.clock = new Date(options.now)
    for (const record of options.records ?? []) this.commitDirectly(record)
  }

  // ---- Test controls ----------------------------------------------------

  setNow(now: Date): void {
    this.clock = new Date(now)
  }

  /** Commits a record as another publisher would, bypassing the transaction checks except uniqueness. */
  commitDirectly(record: PublishedPuzzle): void {
    if (this.committed.has(record.puzzleId)) throw new Error(`Duplicate puzzleId ${record.puzzleId}.`)
    if ([...this.committed.values()].some((r) => r.publishDate === record.publishDate)) {
      throw new Error(`Duplicate publishDate ${record.publishDate}.`)
    }
    this.committed.set(record.puzzleId, copy(record))
    this.committedVersion += 1
  }

  /** Runs once, before the next insert's checks (one interceptor per insert, in order). */
  interceptNextInsert(interceptor: InsertInterceptor): void {
    this.insertInterceptors.push(interceptor)
  }

  /** Replaces committed state as another writer's commit would (e.g. a competing removal). */
  replaceCommittedDirectly(records: PublishedPuzzle[]): void {
    this.committed.clear()
    for (const record of records) this.commitDirectly(record)
  }

  /** Runs once, before the next deleteScheduled/moveScheduled check. */
  interceptNextScheduleChange(interceptor: ScheduleChangeInterceptor): void {
    this.scheduleInterceptors.push(interceptor)
  }

  /** The next deleteScheduled/moveScheduled throws this error (as a failed statement would). */
  failNextScheduleChange(error: Error): void {
    this.scheduleFailures.push(error)
  }

  /** The next transaction fails to begin with this error. */
  failNextTransaction(error: Error): void {
    this.transactionFailures.push(error)
  }

  /** The next non-transactional read fails with this error. */
  failNextRead(error: Error): void {
    this.readFailures.push(error)
  }

  records(): PublishedPuzzle[] {
    return [...this.committed.values()].map(copy).sort((a, b) => compareDateKeys(a.publishDate, b.publishDate))
  }

  // ---- PublicationStore ---------------------------------------------------

  reader(): PublicationReader {
    const take = () => {
      const failure = this.readFailures.shift()
      if (failure) throw failure
    }
    return {
      now: async () => {
        take()
        return new Date(this.clock)
      },
      findById: async (puzzleId) => {
        take()
        const record = this.committed.get(puzzleId)
        return record ? copy(record) : null
      },
      latestPublishDate: async () => {
        take()
        return latestOf(this.committed.values())
      },
      listCalendar: async () => {
        take()
        return calendarOf(this.committed.values())
      },
    }
  }

  async transaction<T>(fn: (tx: PublicationTransaction) => Promise<T>): Promise<T> {
    this.transactionCount += 1
    const transactionNumber = this.transactionCount
    const failure = this.transactionFailures.shift()
    if (failure) throw failure

    // Fresh view: this transaction reads the state committed when it began.
    const snapshot = new Map([...this.committed].map(([id, record]) => [id, copy(record)]))
    const snapshotLatest = latestOf(snapshot.values())
    const startVersion = this.committedVersion
    // Scheduled-queue changes apply to this copy; it replaces committed state at commit.
    const working = new Map([...snapshot].map(([id, record]) => [id, copy(record)]))
    let queueChanged = false
    const beforeScheduleChange = (change: ScheduleChangeContext['change']) => {
      this.scheduleInterceptors.shift()?.({ store: this, change, transactionNumber })
      const failure = this.scheduleFailures.shift()
      if (failure) throw failure
    }
    const staged: PublishedPuzzle[] = []
    const checkAgainstCommitted = (record: NewPublication, earlier: PublishedPuzzle[]) => {
      if (this.committed.has(record.puzzleId) || earlier.some((r) => r.puzzleId === record.puzzleId)) {
        throw new PublicationContentionError('puzzle-id-taken')
      }
      const dates = [...this.committed.values(), ...earlier].map((r) => r.publishDate)
      if (dates.includes(record.publishDate)) throw new PublicationContentionError('publish-date-taken')
      // Another commit moved the queue after this transaction read it.
      if (latestOf(this.committed.values()) !== snapshotLatest) {
        throw new PublicationContentionError('serialization')
      }
    }

    const tx: PublicationTransaction = {
      now: async () => new Date(this.clock),
      findById: async (puzzleId) => {
        const record = working.get(puzzleId)
        return record ? copy(record) : null
      },
      latestPublishDate: async () => (queueChanged ? latestOf(working.values()) : snapshotLatest),
      listCalendar: async () => calendarOf(working.values()),
      deleteScheduled: async (puzzleId, publishDate) => {
        beforeScheduleChange({ kind: 'delete', puzzleId, publishDate })
        const record = working.get(puzzleId)
        if (!record || record.publishDate !== publishDate) return false
        if (releaseInstant(publishDate).getTime() <= this.clock.getTime()) return false
        working.delete(puzzleId)
        queueChanged = true
        return true
      },
      moveScheduled: async (puzzleId, from, to) => {
        beforeScheduleChange({ kind: 'move', puzzleId, from, to })
        const record = working.get(puzzleId)
        if (!record || record.publishDate !== from) return false
        if (releaseInstant(to).getTime() <= this.clock.getTime()) return false
        if ([...working.values()].some((other) => other.publishDate === to)) {
          throw new PublicationContentionError('publish-date-taken') // the UNIQUE constraint
        }
        record.publishDate = to
        queueChanged = true
        return true
      },
      insert: async (record) => {
        this.attemptedDates.push(record.publishDate)
        this.insertInterceptors.shift()?.({ store: this, record, transactionNumber })

        // Database-side release guard, against the authoritative clock at insert.
        if (releaseInstant(record.publishDate).getTime() <= this.clock.getTime()) {
          throw new PublicationContentionError('release-slot-passed')
        }
        checkAgainstCommitted(record, staged)

        const created: PublishedPuzzle = { ...structuredClone(record), createdAt: this.clock.toISOString() }
        staged.push(created)
        return copy(created)
      },
    }

    const result = await fn(tx) // a throw here discards `staged` and `working`: rollback
    // Commit atomically, re-checking against anything committed meanwhile.
    if (queueChanged) {
      if (this.committedVersion !== startVersion) throw new PublicationContentionError('serialization')
      this.committed.clear()
      for (const [id, record] of working) this.committed.set(id, record)
    }
    staged.forEach((record, index) => checkAgainstCommitted(record, staged.slice(0, index)))
    for (const record of staged) this.committed.set(record.puzzleId, record)
    if (queueChanged || staged.length > 0) this.committedVersion += 1
    return result
  }
}
