// The five Production management operations, as one small orchestration
// layer over the existing publishing and schedule services:
//
//   schedule         readSchedule              (metadata only)
//   publish-preview  previewPublication        (never writes)
//   publish          publishFinalPuzzle        (with the previewed fingerprint)
//   remove-preview   previewRemoval            (never writes)
//   remove           removeScheduledPuzzle     (atomic remove + backfill)
//
// Nothing here assigns dates, fingerprints content, or decides release:
// those stay in publishPuzzle.ts / scheduleManagement.ts against the
// store's authoritative clock. This module only validates the operation
// (including the operator's typed confirmation) and maps outcomes onto the
// wire contract, so every result is built from known fields — no driver
// errors, connection details, or puzzle content beyond what the contract
// names ever leave it.

import { isDateKey } from '../../../src/publishing/dateKey'
import type {
  ProductionPublishBody,
  ProductionPublishPreviewBody,
  ProductionRemoveBody,
  ProductionRemovePreviewBody,
  ProductionScheduleBody,
} from '../../src/production/contract'
import type { PublishRequest } from '../../src/publishing/contract'
import { handlePreviewRequest } from '../publishing/publishingEndpoint'
import { parsePublishRequest } from '../publishing/parsePublishRequest'
import type { PublicationStore } from '../publishing/publicationStore'
import { publishFinalPuzzle } from '../publishing/publishPuzzle'
import { previewRemoval, readSchedule, removeScheduledPuzzle } from '../publishing/scheduleManagement'

export type ProductionOperation =
  | { operation: 'schedule' }
  | { operation: 'publish-preview'; request: PublishRequest }
  | { operation: 'publish'; request: PublishRequest; expectedFingerprint: string; confirmPuzzleId: string }
  | { operation: 'remove-preview'; puzzleId: string }
  | { operation: 'remove'; puzzleId: string; expectedPublishDate: string; expectedFingerprint: string; confirmPuzzleId: string }

export type ProductionOperationName = ProductionOperation['operation']

export type ProductionOperationBody =
  | ProductionScheduleBody
  | ProductionPublishPreviewBody
  | ProductionPublishBody
  | ProductionRemovePreviewBody
  | ProductionRemoveBody

export type ParseOperationResult = { ok: true; operation: ProductionOperation } | { ok: false; message: string }

const OPERATIONS: readonly ProductionOperationName[] = ['schedule', 'publish-preview', 'publish', 'remove-preview', 'remove']
const PUZZLE_ID = /^[a-z][a-z0-9]*$/
const FINGERPRINT = /^[0-9a-f]{64}$/

const UNAVAILABLE = 'Production is unavailable right now. Nothing was changed; try again.'
const BUSY = 'Another Production change was happening at the same time. Nothing was changed; try again.'

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
    }
  } catch (error) {
    if (error instanceof OperationShapeError) return { ok: false, message: error.message }
    throw error
  }
}

async function publish(operation: Extract<ProductionOperation, { operation: 'publish' }>, store: PublicationStore): Promise<ProductionPublishBody> {
  const outcome = await publishFinalPuzzle(operation.request, store, { expectedFingerprint: operation.expectedFingerprint })
  switch (outcome.kind) {
    case 'created':
    case 'existing':
      return { status: outcome.kind, publication: outcome.publication }
    case 'conflict':
      return {
        status: 'conflict',
        message: `Puzzle ID “${outcome.existing.puzzleId}” is already scheduled for ${outcome.existing.publishDate} with different content. Choose a new ID.`,
        existing: outcome.existing,
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
      case 'remove-preview':
        return await removePreview(operation.puzzleId, store)
      case 'remove':
        return await remove(operation, store)
    }
  } catch {
    return { status: 'production-unavailable', reason: 'unavailable', message: UNAVAILABLE }
  }
}

