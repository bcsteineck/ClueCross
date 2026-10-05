// Step 3-5 of the authored-answer -> derived-playable-entry pipeline: the
// only module that crosses into the production runtime's own types. Every
// other generator module (placement, derive) works entirely in generator-
// internal types; this file is where a successful Phase 1 construction
// becomes an actual PuzzleDefinition + LayoutDefinition the existing
// runtime (and its unmodified validatePuzzleDefinition) can consume.
//
// This module does not itself call validatePuzzleDefinition — assembly
// and production validation are kept as separate steps (see the Phase 2
// checkpoint report), the same way the rest of the app treats them as two
// independent concerns rather than baking one into the other.

import type { Cell, CellId, Entry, PuzzleDefinition } from '../../../../src/core/types.js'
import type { LayoutDefinition, Position } from '../../../../src/layout/types.js'
import { assignEntryIds, derivePlayableEntries } from '../derive/derivePlayableEntries.js'
import type { ConstructionSuccess } from '../types.js'

export interface BuildPuzzleInput {
  construction: ConstructionSuccess
  id: string
  clue: string
  unlockBudget: number
}

export interface BuildPuzzleSuccess {
  ok: true
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
}

export interface BuildPuzzleFailure {
  ok: false
  reason: string
}

export type BuildPuzzleResult = BuildPuzzleSuccess | BuildPuzzleFailure

// Row-major (y ascending, then x ascending), matching the existing
// hand-authored puzzles' own navigationOrder convention (see e.g.
// src/testing/fixtures/dogsPuzzleLayout.ts).
function rowMajorOrder(positions: Record<CellId, Position>): CellId[] {
  return Object.keys(positions).sort((a, b) => {
    const positionA = positions[a]
    const positionB = positions[b]
    if (positionA.y !== positionB.y) return positionA.y - positionB.y
    return positionA.x - positionB.x
  })
}

export function buildPuzzle(input: BuildPuzzleInput): BuildPuzzleResult {
  const { construction, id, clue, unlockBudget } = input

  const runs = derivePlayableEntries(construction.positions)
  const assignment = assignEntryIds(runs, construction.placedAnswers, construction.positions)

  if (!assignment.ok) {
    const words = assignment.unrecoverableAnswers.map((answer) => answer.word).join(', ')
    return {
      ok: false,
      reason:
        `Authored answer(s) could not be recovered as an exact derived playable ` +
        `entry, meaning the generated geometry lost their structure (for example, ` +
        `two answers merging into one ambiguous run): ${words}.`,
    }
  }

  const cells: Record<CellId, Cell> = {}
  for (const [cellId, letter] of Object.entries(construction.cells)) {
    cells[cellId] = { id: cellId, correctLetter: letter }
  }

  // Playable entries drop `direction` — like the production runtime
  // itself, direction is re-derived from layout positions (see
  // src/layout/entryDirection.ts), not stored as data.
  const entries: Entry[] = assignment.entries.map(({ id: entryId, cellIds }) => ({ id: entryId, cellIds }))

  const cellPositions: Record<CellId, Position> = { ...construction.positions }
  const navigationOrder = rowMajorOrder(construction.positions)

  const puzzle: PuzzleDefinition = { id, clue, unlockBudget, cells, entries }
  const layout: LayoutDefinition = {
    id: `${id}-grid`,
    puzzleId: id,
    cellPositions,
    navigationOrder,
  }

  return { ok: true, puzzle, layout }
}
