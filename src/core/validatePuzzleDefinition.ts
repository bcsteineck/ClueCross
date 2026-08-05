import type { CellId, PuzzleDefinition } from './types'
import type { LayoutDefinition } from '../layout/types'
import { deriveEntryDirection } from '../layout/entryDirection'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function validatePuzzleDefinition(
  puzzle: PuzzleDefinition,
  layout: LayoutDefinition,
): ValidationResult {
  const errors: string[] = []

  if (layout.puzzleId !== puzzle.id) {
    errors.push(
      `Layout "${layout.id}" is for puzzle "${layout.puzzleId}" but is being validated against puzzle "${puzzle.id}".`,
    )
  }

  const cellIds = Object.keys(puzzle.cells)
  const cellIdSet = new Set(cellIds)

  if (cellIds.length === 0) {
    errors.push('Puzzle has no cells.')
  }

  for (const [key, cell] of Object.entries(puzzle.cells)) {
    if (cell.id !== key) {
      errors.push(`Cell keyed "${key}" has mismatched id "${cell.id}".`)
    }
    if (!cell.correctLetter) {
      errors.push(`Cell "${key}" has no correctLetter.`)
    }
  }

  if (puzzle.entries.length === 0) {
    errors.push('Puzzle has no entries.')
  }

  const entryIds = new Set<string>()
  for (const entry of puzzle.entries) {
    if (entryIds.has(entry.id)) {
      errors.push(`Duplicate entry id "${entry.id}".`)
    }
    entryIds.add(entry.id)

    if (entry.cellIds.length === 0) {
      errors.push(`Entry "${entry.id}" has no cells.`)
    }

    const seenInEntry = new Set<CellId>()
    for (const cellId of entry.cellIds) {
      if (seenInEntry.has(cellId)) {
        errors.push(`Entry "${entry.id}" references cell "${cellId}" more than once.`)
      }
      seenInEntry.add(cellId)

      if (!cellIdSet.has(cellId)) {
        errors.push(`Entry "${entry.id}" references unknown cell "${cellId}".`)
      }
    }
  }

  const layoutCellIds = Object.keys(layout.cellPositions)
  const layoutCellIdSet = new Set(layoutCellIds)

  for (const cellId of cellIds) {
    if (!layoutCellIdSet.has(cellId)) {
      errors.push(`Cell "${cellId}" has no position in the layout.`)
    }
  }
  for (const cellId of layoutCellIds) {
    if (!cellIdSet.has(cellId)) {
      errors.push(`Layout defines a position for unknown cell "${cellId}".`)
    }
  }

  // Direction (across/down) drives cell navigation and is derived from
  // layout positions, so an entry that isn't axis-aligned has no usable
  // direction and would silently break navigation — fail clearly instead.
  for (const entry of puzzle.entries) {
    if (entry.cellIds.length < 2) continue
    const allCellsKnown = entry.cellIds.every(
      (cellId) => cellIdSet.has(cellId) && layoutCellIdSet.has(cellId),
    )
    if (!allCellsKnown) continue // already reported above

    if (!deriveEntryDirection(entry, layout)) {
      errors.push(
        `Entry "${entry.id}" cells are not axis-aligned in layout "${layout.id}"; its direction cannot be determined.`,
      )
    }
  }

  const navSeen = new Set<CellId>()
  for (const cellId of layout.navigationOrder) {
    if (navSeen.has(cellId)) {
      errors.push(`Cell "${cellId}" appears more than once in navigationOrder.`)
    }
    navSeen.add(cellId)
    if (!cellIdSet.has(cellId)) {
      errors.push(`navigationOrder references unknown cell "${cellId}".`)
    }
  }
  for (const cellId of cellIds) {
    if (!navSeen.has(cellId)) {
      errors.push(`Cell "${cellId}" is missing from navigationOrder.`)
    }
  }

  // unlockBudget is a fixed-economy credit balance (see letterCosts.ts),
  // not a count of allowed reveals, so it has no relationship to the
  // puzzle's unique-letter count and isn't bounded by it.
  if (!Number.isInteger(puzzle.unlockBudget) || puzzle.unlockBudget < 0) {
    errors.push(`unlockBudget must be a non-negative integer, got ${puzzle.unlockBudget}.`)
  }

  return { valid: errors.length === 0, errors }
}
