// Final Puzzle v1: an approved candidate + author id and clue, assembled
// into the production { PuzzleDefinition, LayoutDefinition } pair through
// the generator's own buildPuzzle, then validated in two explicit layers
// before publishing or export is allowed:
//
//   1. the unchanged production validator (validatePuzzleDefinition);
//   2. Workshop export validation — the stricter contract newly generated
//      puzzles are held to (metadata, letters, board geometry, coverage,
//      and the generator's zero-incidental-entry invariant), without
//      retroactively applying it to the legacy hand-authored fixtures.
//
// Pure and session-only: nothing here writes files or persists anything —
// publishing re-runs this on the Workshop server before writing. Structural checks deliberately exclude any
// subjective quality judgment (density, shape, answer mix) — that belongs
// to Candidate Review.

import { buildPuzzle } from '../../../tools/generator/src/assemble/buildPuzzle.js'
import { buildCellAt } from '../../../tools/generator/src/derive/derivePlayableEntries.js'
import { checkGeometryInvariant } from '../../../tools/generator/src/placement/backtrack.js'
import type { ConstructionSuccess } from '../../../tools/generator/src/types.js'
import { DEFAULT_REVEAL_BUDGET } from '../../../src/core/letterCosts'
import type { PuzzleDefinition } from '../../../src/core/types'
import { validatePuzzleDefinition } from '../../../src/core/validatePuzzleDefinition'
import { RESERVED_PUZZLE_IDS } from '../../../src/publishing/reservedPuzzleIds'
import { deriveEntryDirection } from '../../../src/layout/entryDirection'
import { getGridDimensions } from '../../../src/layout/gridDimensions'
import type { LayoutDefinition } from '../../../src/layout/types'

/** Production board ceiling (the player's maximum grid), independent of the generator's 12×12 envelope. */
export const MAX_BOARD_SIZE = 20

// Lowercase letters and digits, starting with a letter: the existing ids'
// convention, and what keeps `<id>Puzzle` a valid identifier and
// `<id>Puzzle.ts` a safe filename in the exported modules.
export const PUZZLE_ID_PATTERN = /^[a-z][a-z0-9]*$/

export { RESERVED_PUZZLE_IDS }

export interface FinalPuzzleInputs {
  id: string
  clue: string
}

export interface MetadataIssue {
  field: 'id' | 'clue'
  message: string
}

export interface FinalPuzzleValidation {
  /** The assembled production pair, when assembly succeeded (even if other checks failed). */
  puzzle?: PuzzleDefinition
  layout?: LayoutDefinition
  metadataErrors: MetadataIssue[]
  /** Layer 1: validatePuzzleDefinition's own errors. */
  productionErrors: string[]
  /** Layer 2: assembly failures and the stricter export contract. */
  exportErrors: string[]
  ready: boolean
}

/** A default id suggestion from the clue; the author can always change it. */
export function suggestPuzzleId(clue: string): string {
  return clue
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[0-9]+/, '')
}

// Published IDs are kept unique by the database (a repeat ID is an
// idempotent re-publish or a conflict); this only rejects reserved IDs.
export function validateFinalPuzzleMetadata(
  inputs: FinalPuzzleInputs,
  reservedIds: readonly string[] = RESERVED_PUZZLE_IDS,
): MetadataIssue[] {
  const issues: MetadataIssue[] = []
  const id = inputs.id.trim()
  if (id === '') {
    issues.push({ field: 'id', message: 'Puzzle ID is required.' })
  } else if (!PUZZLE_ID_PATTERN.test(id)) {
    issues.push({
      field: 'id',
      message: 'Puzzle ID must use only lowercase letters a–z and digits, starting with a letter.',
    })
  } else if (reservedIds.includes(id)) {
    issues.push({
      field: 'id',
      message: `Puzzle ID “${id}” is reserved (a legacy development puzzle or test fixture) and can’t be used.`,
    })
  }
  if (inputs.clue.trim() === '') {
    issues.push({ field: 'clue', message: 'Clue is required.' })
  }
  return issues
}

function positionKey(x: number, y: number): string {
  return `${x},${y}`
}

/**
 * Layer 2's structural checks on an assembled pair: letters, coordinates,
 * board size, cell coverage, entry contiguity, and connectivity. Entries
 * the production validator can't place on one axis are left to it.
 */
export function validateExportStructure(puzzle: PuzzleDefinition, layout: LayoutDefinition): string[] {
  const errors: string[] = []
  const cells = Object.values(puzzle.cells)

  for (const cell of cells) {
    if (!/^[A-Z]$/.test(cell.correctLetter)) {
      errors.push(`Cell ${cell.id} has letter “${cell.correctLetter}”; every letter must be one uppercase A–Z character.`)
    }
  }

  const positioned = cells.filter((cell) => layout.cellPositions[cell.id] !== undefined)
  if (positioned.length === 0) return errors

  const occupants = new Map<string, string[]>()
  let validCoordinates = true
  for (const cell of positioned) {
    const { x, y } = layout.cellPositions[cell.id]
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
      errors.push(`Cell ${cell.id} is at (${x}, ${y}); coordinates must be non-negative integers.`)
      validCoordinates = false
      continue
    }
    const key = positionKey(x, y)
    occupants.set(key, [...(occupants.get(key) ?? []), cell.id])
  }
  for (const [key, ids] of occupants) {
    if (ids.length > 1) errors.push(`Cells ${ids.join(', ')} occupy the same position (${key}).`)
  }
  if (!validCoordinates) return errors

  const xs = positioned.map((cell) => layout.cellPositions[cell.id].x)
  const ys = positioned.map((cell) => layout.cellPositions[cell.id].y)
  if (Math.min(...xs) !== 0 || Math.min(...ys) !== 0) {
    errors.push(`The board must start at column 0 and row 0 (it starts at column ${Math.min(...xs)}, row ${Math.min(...ys)}).`)
  }
  const { cols, rows } = getGridDimensions(layout)
  if (cols > MAX_BOARD_SIZE || rows > MAX_BOARD_SIZE) {
    errors.push(`The board is ${cols} × ${rows}; the maximum is ${MAX_BOARD_SIZE} × ${MAX_BOARD_SIZE}.`)
  }

  const covered = new Set(puzzle.entries.flatMap((entry) => entry.cellIds))
  const orphans = cells.filter((cell) => !covered.has(cell.id)).map((cell) => cell.id)
  if (orphans.length > 0) errors.push(`Cells ${orphans.join(', ')} are not part of any answer.`)

  for (const entry of puzzle.entries) {
    const direction = deriveEntryDirection(entry, layout)
    if (direction === null || entry.cellIds.some((id) => layout.cellPositions[id] === undefined)) continue
    const steps = entry.cellIds
      .map((id) => (direction === 'across' ? layout.cellPositions[id].x : layout.cellPositions[id].y))
      .sort((a, b) => a - b)
    if (steps.some((value, index) => index > 0 && value !== steps[index - 1] + 1)) {
      errors.push(`Answer “${entry.id}” has gaps; its cells must be contiguous.`)
    }
  }

  // Connectivity: every cell reachable from the first through side-adjacent cells.
  const cellAt = buildCellAt(Object.fromEntries(positioned.map((cell) => [cell.id, layout.cellPositions[cell.id]])))
  const reached = new Set<string>([positioned[0].id])
  const queue = [positioned[0].id]
  while (queue.length > 0) {
    const { x, y } = layout.cellPositions[queue.pop()!]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = cellAt.get(positionKey(x + dx, y + dy))
      if (neighbor !== undefined && !reached.has(neighbor)) {
        reached.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  if (reached.size < positioned.length) {
    errors.push('The board is not connected: every cell must be reachable from every other through its answers.')
  }

  return errors
}

/**
 * Assembles and validates the Final Puzzle from the approved candidate's
 * construction. Assembly runs on the trimmed
 * inputs even while metadata is invalid, so structural problems are still
 * reported; export is ready only when every layer is clean.
 */
export function prepareFinalPuzzle(
  construction: ConstructionSuccess,
  inputs: FinalPuzzleInputs,
  reservedIds: readonly string[] = RESERVED_PUZZLE_IDS,
): FinalPuzzleValidation {
  const metadataErrors = validateFinalPuzzleMetadata(inputs, reservedIds)
  const exportErrors: string[] = []
  let productionErrors: string[] = []
  let puzzle: PuzzleDefinition | undefined
  let layout: LayoutDefinition | undefined

  // The generator's own zero-incidental-entry invariant, re-checked on the
  // exact construction being exported: derived entries = authored answers.
  const invariant = checkGeometryInvariant(construction)
  if (!invariant.ok) exportErrors.push(invariant.reason)

  try {
    const built = buildPuzzle({
      construction,
      id: inputs.id.trim(),
      clue: inputs.clue.trim(),
      unlockBudget: DEFAULT_REVEAL_BUDGET,
    })
    if (built.ok) {
      puzzle = built.puzzle
      layout = built.layout
    } else {
      exportErrors.push(`The puzzle could not be assembled. ${built.reason}`)
    }
  } catch (error) {
    // buildPuzzle throws only on violated upstream invariants; report the
    // message, never a stack.
    exportErrors.push(`The puzzle could not be assembled. ${error instanceof Error ? error.message : String(error)}`)
  }

  if (puzzle && layout) {
    productionErrors = validatePuzzleDefinition(puzzle, layout).errors
    exportErrors.push(...validateExportStructure(puzzle, layout))
  }

  return {
    puzzle,
    layout,
    metadataErrors,
    productionErrors,
    exportErrors,
    ready:
      puzzle !== undefined &&
      metadataErrors.length === 0 &&
      productionErrors.length === 0 &&
      exportErrors.length === 0,
  }
}
