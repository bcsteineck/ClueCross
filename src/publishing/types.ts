// Publishing v1 record types. Pure data: a publication's status is never
// stored — it is derived from its publishDate and the current instant (see
// releaseSchedule.ts).

import type { PuzzleDefinition } from '../core/types'
import type { LayoutDefinition } from '../layout/types'

/** A calendar date with no time or zone: canonical `YYYY-MM-DD` (see dateKey.ts). */
export type DateKey = string

export type FingerprintVersion = 1

export type PublicationStatus = 'scheduled' | 'published'

export interface PublishedPuzzle {
  puzzleId: string
  publishDate: DateKey
  /** Lowercase 64-character hex SHA-256 of the canonical content (see fingerprint.ts). */
  contentFingerprint: string
  fingerprintVersion: FingerprintVersion
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
  /** ISO 8601 instant the record was created. Informational only. */
  createdAt: string
}
