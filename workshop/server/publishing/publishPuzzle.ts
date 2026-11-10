// Publishing v1 domain flow, on top of the PublicationStore abstraction:
//
//   request (construction, id, clue)
//     -> prepareFinalPuzzle: server-side re-assembly via buildPuzzle, the
//        production validator, and the stricter Final Puzzle / geometry
//        rules (zero incidental entries) — failure means no store access
//     -> fingerprint v1 of the server-assembled pair (and, when the caller
//        previewed it, a check against that expected fingerprint — a
//        mismatch means the content changed, so nothing is written)
//     -> up to MAX_PUBLISH_ATTEMPTS fresh transactions, each:
//          look up puzzleId first (same fingerprint: existing; different:
//          conflict) -> store now -> latest publishDate -> Phase 1 date
//          rules -> insert
//
// A retryable contention error abandons the attempt entirely; the next one
// re-reads everything and recalculates the date — it never increments the
// previously attempted date. All clock reads come from the store.
//
// Backfill (backfillFinalPuzzle) is the separate, explicit path for one
// missed past date the operator chose: the same preparation, fingerprint
// check, and id lookup, then the date's eligibility at the store clock
// (backfillIneligibility) and insertMissed. It never chooses or changes the
// date — a retry re-checks the same date and reports why it can't be used.

import { computeFingerprintV1, FINGERPRINT_VERSION } from '../../../src/publishing/fingerprint'
import {
  assignPublishDate,
  backfillIneligibility,
  earliestPublishDate,
  missedPublishDates,
  releaseInstant,
} from '../../../src/publishing/releaseSchedule'
import type { BackfillIneligibility } from '../../../src/publishing/releaseSchedule'
import type { DateKey, PublishedPuzzle } from '../../../src/publishing/types'
import type { PuzzleDefinition } from '../../../src/core/types'
import type { LayoutDefinition } from '../../../src/layout/types'
import { prepareFinalPuzzle } from '../../src/finalPuzzle/finalPuzzle'
import type { MissedDate } from '../../src/production/contract'
import type { PublicationSummary, PublishRequest, PublishValidationErrors } from '../../src/publishing/contract'
import { PublicationContentionError } from './publicationStore'
import type { PublicationReader, PublicationStore } from './publicationStore'

export const MAX_PUBLISH_ATTEMPTS = 3

export interface ExistingPublicationRef {
  puzzleId: string
  publishDate: DateKey
  releaseInstant: string
}

export type PublishOutcome =
  | { kind: 'created'; publication: PublicationSummary }
  | { kind: 'existing'; publication: PublicationSummary }
  | { kind: 'conflict'; existing: ExistingPublicationRef }
  | { kind: 'invalid'; errors: PublishValidationErrors }
  | { kind: 'content-changed'; contentFingerprint: string }
  | { kind: 'busy' }
  | { kind: 'unavailable' }

export interface PublishOptions {
  maxAttempts?: number
  /** The fingerprint the operator previewed; publishing refuses different content. */
  expectedFingerprint?: string
}

export type PreviewOutcome =
  | { kind: 'estimate'; publishDate: DateKey; releaseInstant: string; contentFingerprint: string }
  | { kind: 'existing'; publication: PublicationSummary }
  | { kind: 'conflict'; existing: ExistingPublicationRef }
  | { kind: 'invalid'; errors: PublishValidationErrors }
  | { kind: 'unavailable' }

interface PreparedPublication {
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
  contentFingerprint: string
}

/** Re-assembles and re-validates on the server; never trusts a browser-built pair. */
async function preparePublication(
  request: PublishRequest,
): Promise<{ ok: true; prepared: PreparedPublication } | { ok: false; errors: PublishValidationErrors }> {
  const validation = prepareFinalPuzzle(request.construction, { id: request.id, clue: request.clue })
  if (!validation.ready || !validation.puzzle || !validation.layout) {
    return {
      ok: false,
      errors: {
        metadata: validation.metadataErrors,
        production: validation.productionErrors,
        export: validation.exportErrors,
      },
    }
  }
  const { puzzle, layout } = validation
  return { ok: true, prepared: { puzzle, layout, contentFingerprint: await computeFingerprintV1(puzzle, layout) } }
}

export function summarizePublication(record: PublishedPuzzle): PublicationSummary {
  return {
    puzzleId: record.puzzleId,
    publishDate: record.publishDate,
    releaseInstant: releaseInstant(record.publishDate).toISOString(),
    contentFingerprint: record.contentFingerprint,
    fingerprintVersion: record.fingerprintVersion,
  }
}

// Same id: identical content is the same publication; anything else conflicts.
function classifyExisting(
  record: PublishedPuzzle,
  contentFingerprint: string,
): { kind: 'existing'; publication: PublicationSummary } | { kind: 'conflict'; existing: ExistingPublicationRef } {
  if (record.fingerprintVersion === FINGERPRINT_VERSION && record.contentFingerprint === contentFingerprint) {
    return { kind: 'existing', publication: summarizePublication(record) }
  }
  return {
    kind: 'conflict',
    existing: {
      puzzleId: record.puzzleId,
      publishDate: record.publishDate,
      releaseInstant: releaseInstant(record.publishDate).toISOString(),
    },
  }
}

async function nextPublishDate(reader: PublicationReader): Promise<DateKey> {
  const now = await reader.now()
  const latest = await reader.latestPublishDate()
  return assignPublishDate(latest, earliestPublishDate(now))
}

export async function publishFinalPuzzle(
  request: PublishRequest,
  store: PublicationStore,
  { maxAttempts = MAX_PUBLISH_ATTEMPTS, expectedFingerprint }: PublishOptions = {},
): Promise<PublishOutcome> {
  const preparation = await preparePublication(request)
  if (!preparation.ok) return { kind: 'invalid', errors: preparation.errors }
  const { puzzle, layout, contentFingerprint } = preparation.prepared
  if (expectedFingerprint !== undefined && expectedFingerprint !== contentFingerprint) {
    return { kind: 'content-changed', contentFingerprint }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await store.transaction(async (tx) => {
        const existing = await tx.findById(puzzle.id)
        if (existing) return classifyExisting(existing, contentFingerprint)

        const publishDate = await nextPublishDate(tx)
        const record = await tx.insert({
          puzzleId: puzzle.id,
          publishDate,
          contentFingerprint,
          fingerprintVersion: FINGERPRINT_VERSION,
          puzzle,
          layout,
        })
        return { kind: 'created', publication: summarizePublication(record) }
      })
    } catch (error) {
      if (error instanceof PublicationContentionError) continue
      return { kind: 'unavailable' }
    }
  }
  return { kind: 'busy' }
}

/** Never writes. The estimate can go stale before a real publish. */
export async function previewPublication(request: PublishRequest, store: PublicationStore): Promise<PreviewOutcome> {
  const preparation = await preparePublication(request)
  if (!preparation.ok) return { kind: 'invalid', errors: preparation.errors }
  const { puzzle, contentFingerprint } = preparation.prepared

  try {
    const reader = store.reader()
    const existing = await reader.findById(puzzle.id)
    if (existing) return classifyExisting(existing, contentFingerprint)
    const publishDate = await nextPublishDate(reader)
    return {
      kind: 'estimate',
      publishDate,
      releaseInstant: releaseInstant(publishDate).toISOString(),
      contentFingerprint,
    }
  } catch {
    return { kind: 'unavailable' }
  }
}

// ---- Backfill: one explicit missed past date ------------------------------

export type BackfillOutcome =
  | { kind: 'created'; publication: PublicationSummary }
  /** The same content is already published under this id (on its own date); nothing was written. */
  | { kind: 'existing'; publication: PublicationSummary }
  | { kind: 'conflict'; existing: ExistingPublicationRef }
  | { kind: 'ineligible'; publishDate: DateKey; reason: BackfillIneligibility }
  | { kind: 'invalid'; errors: PublishValidationErrors }
  | { kind: 'content-changed'; contentFingerprint: string }
  | { kind: 'busy' }
  | { kind: 'unavailable' }

export type BackfillPreviewOutcome =
  | { kind: 'missed-dates'; contentFingerprint: string; firstPublishDate: DateKey | null; dates: MissedDate[] }
  | { kind: 'existing'; publication: PublicationSummary }
  | { kind: 'conflict'; existing: ExistingPublicationRef }
  | { kind: 'invalid'; errors: PublishValidationErrors }
  | { kind: 'unavailable' }

const toMissedDate = (publishDate: DateKey): MissedDate => ({
  publishDate,
  releaseInstant: releaseInstant(publishDate).toISOString(),
})

export async function backfillFinalPuzzle(
  request: PublishRequest,
  publishDate: DateKey,
  store: PublicationStore,
  { maxAttempts = MAX_PUBLISH_ATTEMPTS, expectedFingerprint }: PublishOptions = {},
): Promise<BackfillOutcome> {
  const preparation = await preparePublication(request)
  if (!preparation.ok) return { kind: 'invalid', errors: preparation.errors }
  const { puzzle, layout, contentFingerprint } = preparation.prepared
  if (expectedFingerprint !== undefined && expectedFingerprint !== contentFingerprint) {
    return { kind: 'content-changed', contentFingerprint }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await store.transaction<BackfillOutcome>(async (tx) => {
        const existing = await tx.findById(puzzle.id)
        if (existing) return classifyExisting(existing, contentFingerprint)

        const dates = (await tx.listCalendar()).map((record) => record.publishDate)
        const reason = backfillIneligibility(publishDate, dates, await tx.now())
        if (reason) return { kind: 'ineligible', publishDate, reason }

        const record = await tx.insertMissed({
          puzzleId: puzzle.id,
          publishDate,
          contentFingerprint,
          fingerprintVersion: FINGERPRINT_VERSION,
          puzzle,
          layout,
        })
        return { kind: 'created', publication: summarizePublication(record) }
      })
    } catch (error) {
      if (error instanceof PublicationContentionError) continue
      return { kind: 'unavailable' }
    }
  }
  return { kind: 'busy' }
}

/** Never writes. The missed dates can go stale before a real backfill, which re-checks its date. */
export async function previewBackfill(request: PublishRequest, store: PublicationStore): Promise<BackfillPreviewOutcome> {
  const preparation = await preparePublication(request)
  if (!preparation.ok) return { kind: 'invalid', errors: preparation.errors }
  const { puzzle, contentFingerprint } = preparation.prepared

  try {
    const reader = store.reader()
    const existing = await reader.findById(puzzle.id)
    if (existing) return classifyExisting(existing, contentFingerprint)
    const [now, records] = [await reader.now(), await reader.listCalendar()]
    const dates = records.map((record) => record.publishDate)
    return {
      kind: 'missed-dates',
      contentFingerprint,
      firstPublishDate: records[0]?.publishDate ?? null,
      dates: missedPublishDates(dates, now).map(toMissedDate),
    }
  } catch {
    return { kind: 'unavailable' }
  }
}
