// The eight Production management operations, as one small orchestration
// layer over the existing publishing and schedule services:
//
//   schedule          readSchedule              (metadata only)
//   publish-preview   previewPublication        (never writes)
//   publish           publishFinalPuzzle        (with the previewed fingerprint)
//   backfill-preview  previewBackfill           (never writes; the missed dates)
//   backfill          backfillFinalPuzzle       (one explicit missed past date)
//   remove-preview    previewRemoval            (never writes)
//   remove            removeScheduledPuzzle     (atomic remove + queue compaction)
//   puzzle-preview    previewStoredPuzzle       (never writes; one puzzle's content)
//
// Nothing here assigns dates, fingerprints content, or decides release:
// those stay in publishPuzzle.ts / scheduleManagement.ts against the
// store's authoritative clock. This module only validates the operation
// (including the operator's typed confirmation) and maps outcomes onto the
// wire contract, so every result is built from known fields — no driver
// errors, connection details, or puzzle content beyond what the contract
// names ever leave it. puzzle-preview is the only operation that returns a
// stored puzzle's content, and only for the one puzzle it names.

import { isDateKey } from '../../../src/publishing/dateKey'
import type { BackfillIneligibility } from '../../../src/publishing/releaseSchedule'
import type {
  ProductionBackfillBody,
  ProductionBackfillPreviewBody,
  ProductionPublishBody,
  ProductionPublishPreviewBody,
  ProductionPuzzlePreviewBody,
  ProductionRemoveBody,
  ProductionRemovePreviewBody,
  ProductionScheduleBody,
} from '../../src/production/contract'
import type { PublishingConflictBody, PublishRequest } from '../../src/publishing/contract'
import { handlePreviewRequest } from '../publishing/publishingEndpoint'
import { parsePublishRequest } from '../publishing/parsePublishRequest'
import type { PublicationStore } from '../publishing/publicationStore'
import { previewStoredPuzzle } from '../publishing/puzzlePreview'
import { backfillFinalPuzzle, previewBackfill, publishFinalPuzzle } from '../publishing/publishPuzzle'
import type { ExistingPublicationRef } from '../publishing/publishPuzzle'
import { previewRemoval, readSchedule, removeScheduledPuzzle } from '../publishing/scheduleManagement'

export type ProductionOperation =
  | { operation: 'schedule' }
  | { operation: 'publish-preview'; request: PublishRequest }
  | { operation: 'publish'; request: PublishRequest; expectedFingerprint: string; confirmPuzzleId: string }
  | { operation: 'backfill-preview'; request: PublishRequest }
  | {
      operation: 'backfill'
      request: PublishRequest
      publishDate: string
      expectedFingerprint: string
      confirmPuzzleId: string
    }
  | { operation: 'remove-preview'; puzzleId: string }
  | { operation: 'remove'; puzzleId: string; expectedPublishDate: string; expectedFingerprint: string; confirmPuzzleId: string }
  | { operation: 'puzzle-preview'; puzzleId: string; expectedFingerprint: string }

export type ProductionOperationName = ProductionOperation['operation']

export type ProductionOperationBody =
  | ProductionScheduleBody
  | ProductionPublishPreviewBody
  | ProductionPublishBody
  | ProductionBackfillPreviewBody
  | ProductionBackfillBody
  | ProductionRemovePreviewBody
  | ProductionRemoveBody
  | ProductionPuzzlePreviewBody

export type ParseOperationResult = { ok: true; operation: ProductionOperation } | { ok: false; message: string }

const OPERATIONS: readonly ProductionOperationName[] = [
  'schedule',
  'publish-preview',
  'publish',
  'backfill-preview',
  'backfill',
  'remove-preview',
  'remove',
  'puzzle-preview',
]
const PUZZLE_ID = /^[a-z][a-z0-9]*$/
const FINGERPRINT = /^[0-9a-f]{64}$/

const UNAVAILABLE = 'Production is unavailable right now. Nothing was changed; try again.'
const BUSY = 'Another Production change was happening at the same time. Nothing was changed; try again.'

const INELIGIBLE: Record<BackfillIneligibility, (date: string) => string> = {
  'no-history': () => 'Nothing has been published to Production yet, so there is no missed date to fill. Nothing was published.',
  'before-first': (date) => `${date} is before the first Production puzzle, so it can’t be filled. Nothing was published.`,
  'not-released': (date) =>
    `${date} hasn’t reached its release time yet, so it isn’t a missed date. Nothing was published; use Next available date instead.`,
  occupied: (date) => `${date} already has a puzzle. Nothing was published; choose another missed date.`,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

class OperationShapeError extends Error {}

function requireString(record: Record<string, unknown>, key: string, pattern?: RegExp): string {
  const value = record[key]
  if (typeof value !== 'string' || (pattern && !pattern.test(value))) {
    throw new OperationShapeError(`${key} is missing or malformed.`)
  }
  return value
}

function requireConfirmation(record: Record<string, unknown>, puzzleId: string): string {
  const confirmPuzzleId = requireString(record, 'confirmPuzzleId')
  if (confirmPuzzleId !== puzzleId) {
    throw new OperationShapeError('Type the puzzle ID exactly to confirm this Production change.')
  }
  return confirmPuzzleId
}

function requirePublishRequest(record: Record<string, unknown>): PublishRequest {
  const parsed = parsePublishRequest(record.request)
  if (!parsed.ok) throw new OperationShapeError(parsed.message)
  return parsed.request
}

/** Validates an untrusted operation (from the browser, or the runner's stdin) and rebuilds a clean copy. */
export function parseProductionOperation(value: unknown): ParseOperationResult {
  try {
    if (!isRecord(value)) throw new OperationShapeError('The operation must be an object.')
    const operation = value.operation
    if (typeof operation !== 'string' || !OPERATIONS.includes(operation as ProductionOperationName)) {
      throw new OperationShapeError('Unknown Production operation.')
    }
    switch (operation as ProductionOperationName) {
      case 'schedule':
        return { ok: true, operation: { operation: 'schedule' } }
      case 'publish-preview':
        return { ok: true, operation: { operation: 'publish-preview', request: requirePublishRequest(value) } }
      case 'publish': {
        const request = requirePublishRequest(value)
        return {
          ok: true,
          operation: {
            operation: 'publish',
            request,
            expectedFingerprint: requireString(value, 'expectedFingerprint', FINGERPRINT),
            confirmPuzzleId: requireConfirmation(value, request.id),
          },
        }
      }
      case 'backfill-preview':
        return { ok: true, operation: { operation: 'backfill-preview', request: requirePublishRequest(value) } }
      case 'backfill': {
        const request = requirePublishRequest(value)
        const publishDate = requireString(value, 'publishDate')
        if (!isDateKey(publishDate)) throw new OperationShapeError('publishDate must be a real calendar date (YYYY-MM-DD).')
        return {
          ok: true,
          operation: {
            operation: 'backfill',
            request,
            publishDate,
            expectedFingerprint: requireString(value, 'expectedFingerprint', FINGERPRINT),
            confirmPuzzleId: requireConfirmation(value, request.id),
          },
        }
      }
      case 'remove-preview':
        return { ok: true, operation: { operation: 'remove-preview', puzzleId: requireString(value, 'puzzleId', PUZZLE_ID) } }
      case 'remove': {
        const puzzleId = requireString(value, 'puzzleId', PUZZLE_ID)
        const expectedPublishDate = requireString(value, 'expectedPublishDate')
        if (!isDateKey(expectedPublishDate)) throw new OperationShapeError('expectedPublishDate is missing or malformed.')
        return {
          ok: true,
          operation: {
            operation: 'remove',
            puzzleId,
            expectedPublishDate,
            expectedFingerprint: requireString(value, 'expectedFingerprint', FINGERPRINT),
            confirmPuzzleId: requireConfirmation(value, puzzleId),
          },
        }
      }
      case 'puzzle-preview':
        return {
          ok: true,
          operation: {
            operation: 'puzzle-preview',
            puzzleId: requireString(value, 'puzzleId', PUZZLE_ID),
            expectedFingerprint: requireString(value, 'expectedFingerprint', FINGERPRINT),
          },
        }
    }
  } catch (error) {
    if (error instanceof OperationShapeError) return { ok: false, message: error.message }
    throw error
  }
}

function conflictBody(existing: ExistingPublicationRef): PublishingConflictBody {
  return {
    status: 'conflict',
    message: `Puzzle ID “${existing.puzzleId}” is already scheduled for ${existing.publishDate} with different content. Choose a new ID.`,
    existing,
  }
}

async function publish(operation: Extract<ProductionOperation, { operation: 'publish' }>, store: PublicationStore): Promise<ProductionPublishBody> {
  const outcome = await publishFinalPuzzle(operation.request, store, { expectedFingerprint: operation.expectedFingerprint })
  switch (outcome.kind) {
    case 'created':
    case 'existing':
      return { status: outcome.kind, publication: outcome.publication }
    case 'conflict':
      return conflictBody(outcome.existing)
    case 'invalid':
      return { status: 'invalid', errors: outcome.errors }
    case 'content-changed':
      return {
        status: 'content-changed',
        message: 'This puzzle changed since the Production preview. Nothing was published; preview again.',
        contentFingerprint: outcome.contentFingerprint,
      }
    case 'busy':
      return { status: 'busy', message: BUSY }
    case 'unavailable':
      return { status: 'unavailable', message: UNAVAILABLE }
  }
}

async function backfillPreview(request: PublishRequest, store: PublicationStore): Promise<ProductionBackfillPreviewBody> {
  const outcome = await previewBackfill(request, store)
  switch (outcome.kind) {
    case 'missed-dates':
      return {
        status: 'missed-dates',
        contentFingerprint: outcome.contentFingerprint,
        firstPublishDate: outcome.firstPublishDate,
        dates: outcome.dates,
      }
    case 'existing':
      return { status: 'existing', publication: outcome.publication }
    case 'conflict':
      return conflictBody(outcome.existing)
    case 'invalid':
      return { status: 'invalid', errors: outcome.errors }
    case 'unavailable':
      return { status: 'unavailable', message: UNAVAILABLE }
  }
}

async function backfill(operation: Extract<ProductionOperation, { operation: 'backfill' }>, store: PublicationStore): Promise<ProductionBackfillBody> {
  const outcome = await backfillFinalPuzzle(operation.request, operation.publishDate, store, {
    expectedFingerprint: operation.expectedFingerprint,
  })
  switch (outcome.kind) {
    case 'created':
    case 'existing':
      return { status: outcome.kind, publication: outcome.publication }
    case 'conflict':
      return conflictBody(outcome.existing)
    case 'ineligible':
      return {
        status: 'ineligible',
        publishDate: outcome.publishDate,
        reason: outcome.reason,
        message: INELIGIBLE[outcome.reason](outcome.publishDate),
      }
    case 'invalid':
      return { status: 'invalid', errors: outcome.errors }
    case 'content-changed':
      return {
        status: 'content-changed',
        message: 'This puzzle changed since the Production preview. Nothing was published; preview again.',
        contentFingerprint: outcome.contentFingerprint,
      }
    case 'busy':
      return { status: 'busy', message: BUSY }
    case 'unavailable':
      return { status: 'unavailable', message: UNAVAILABLE }
  }
}

async function removePreview(puzzleId: string, store: PublicationStore): Promise<ProductionRemovePreviewBody> {
  try {
    const plan = await previewRemoval(store.reader(), puzzleId)
    switch (plan.kind) {
      case 'removable':
        return { status: 'removable', target: plan.target, moves: plan.moves }
      case 'released':
        return { status: 'released', target: plan.target }
      case 'not-found':
        return { status: 'not-found' }
    }
  } catch {
    return { status: 'unavailable', message: UNAVAILABLE }
  }
}

async function remove(operation: Extract<ProductionOperation, { operation: 'remove' }>, store: PublicationStore): Promise<ProductionRemoveBody> {
  const outcome = await removeScheduledPuzzle(operation, store)
  switch (outcome.kind) {
    case 'removed':
      return { status: 'removed', removed: outcome.removed, moves: outcome.moves }
    case 'not-found':
      return { status: 'not-found' }
    case 'stale':
      return { status: 'stale', current: outcome.current }
    case 'released':
      return { status: 'released', target: outcome.target }
    case 'busy':
      return { status: 'busy', message: BUSY }
    case 'unavailable':
      return { status: 'unavailable', message: UNAVAILABLE }
  }
}

async function puzzlePreview(
  operation: Extract<ProductionOperation, { operation: 'puzzle-preview' }>,
  store: PublicationStore,
): Promise<ProductionPuzzlePreviewBody> {
  try {
    const outcome = await previewStoredPuzzle(store.reader(), operation.puzzleId, operation.expectedFingerprint)
    switch (outcome.kind) {
      case 'ok':
        return { status: 'ok', preview: outcome.preview }
      case 'not-found':
        return { status: 'not-found' }
      case 'changed':
        return { status: 'changed', current: outcome.current }
      case 'unreadable':
        return { status: 'unavailable', message: 'The stored puzzle content couldn’t be read for preview. Nothing was changed.' }
    }
  } catch {
    return { status: 'unavailable', message: UNAVAILABLE }
  }
}

/** Runs one validated operation against `store`. Never throws; failures are sanitized bodies. */
export async function runProductionOperation(operation: ProductionOperation, store: PublicationStore): Promise<ProductionOperationBody> {
  try {
    switch (operation.operation) {
      case 'schedule':
        return { status: 'ok', schedule: await readSchedule(store.reader()) }
      case 'publish-preview':
        // The same handler the dev Workshop's preview uses, so the estimate is computed identically.
        return (await handlePreviewRequest(operation.request, { store })).body
      case 'publish':
        return await publish(operation, store)
      case 'backfill-preview':
        return await backfillPreview(operation.request, store)
      case 'backfill':
        return await backfill(operation, store)
      case 'remove-preview':
        return await removePreview(operation.puzzleId, store)
      case 'remove':
        return await remove(operation, store)
      case 'puzzle-preview':
        return await puzzlePreview(operation, store)
    }
  } catch {
    return { status: 'production-unavailable', reason: 'unavailable', message: UNAVAILABLE }
  }
}

