// Publishing v1 wire contract between the Workshop browser and its local
// publishing endpoints. Types plus the two fixed paths — shared by the
// server adapter/handlers and the browser client, the same way
// sourcing/contract.ts is. The browser sends Final Puzzle inputs, never an
// assembled puzzle: the server re-assembles, re-validates, fingerprints,
// and assigns the date.

import type { ConstructionSuccess } from '../../../tools/generator/src/types.js'
import type { DateKey, FingerprintVersion } from '../../../src/publishing/types'
import type { MetadataIssue } from '../finalPuzzle/finalPuzzle'

export const PUBLISHING_PREVIEW_PATH = '/api/publishing/preview'
export const PUBLISHING_PUBLISH_PATH = '/api/publishing/publish'

export interface PublishRequest {
  construction: ConstructionSuccess
  id: string
  clue: string
}

export interface PublicationSummary {
  puzzleId: string
  publishDate: DateKey
  /** ISO 8601: 10:00 PM America/New_York on the day before publishDate. */
  releaseInstant: string
  contentFingerprint: string
  fingerprintVersion: FingerprintVersion
}

export interface PublishValidationErrors {
  metadata: MetadataIssue[]
  production: string[]
  export: string[]
}

export type PublishingErrorBody =
  | { status: 'bad-request'; message: string }
  | { status: 'invalid'; errors: PublishValidationErrors }
  | { status: 'busy'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'not-configured'; message: string }

/** Same id, different content. The existing publication is never changed. */
export interface PublishingConflictBody {
  status: 'conflict'
  message: string
  existing: { puzzleId: string; publishDate: DateKey; releaseInstant: string }
}

export type PublishResponseBody =
  | { status: 'created'; publication: PublicationSummary }
  | { status: 'existing'; publication: PublicationSummary }
  | PublishingConflictBody
  | PublishingErrorBody

/** Preview is an estimate: a concurrent publish or the 10 PM cutoff can change the final date. */
export type PreviewResponseBody =
  | { status: 'estimate'; estimate: { publishDate: DateKey; releaseInstant: string; contentFingerprint: string } }
  | { status: 'existing'; publication: PublicationSummary }
  | PublishingConflictBody
  | Exclude<PublishingErrorBody, { status: 'busy' }>
