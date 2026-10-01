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
//     commit a competing publication, move the clock, or throw.

import { compareDateKeys } from '../../../src/publishing/dateKey'
import { releaseInstant } from '../../../src/publishing/releaseSchedule'
import type { DateKey, PublishedPuzzle } from '../../../src/publishing/types'
import { PublicationContentionError } from './publicationStore'
import type { NewPublication, PublicationReader, PublicationStore, PublicationTransaction } from './publicationStore'

export interface InsertInterceptorContext {
  store: MemoryPublicationStore
  record: NewPublication
  /** 1-based count of transactions begun on this store. */
  transactionNumber: number
}

export type InsertInterceptor = (context: InsertInterceptorContext) => void

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

export class MemoryPublicationStore implements PublicationStore {
  private readonly committed = new Map<string, PublishedPuzzle>()
  private clock: Date
  private readonly insertInterceptors: InsertInterceptor[] = []
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
  }

  /** Runs once, before the next insert's checks (one interceptor per insert, in order). */
  interceptNextInsert(interceptor: InsertInterceptor): void {
    this.insertInterceptors.push(interceptor)
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
        const record = snapshot.get(puzzleId)
        return record ? copy(record) : null
      },
      latestPublishDate: async () => snapshotLatest,
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

    const result = await fn(tx) // a throw here discards `staged`: rollback
    // Commit atomically, re-checking against anything committed meanwhile.
    staged.forEach((record, index) => checkAgainstCommitted(record, staged.slice(0, index)))
    for (const record of staged) this.committed.set(record.puzzleId, record)
    return result
  }
}
