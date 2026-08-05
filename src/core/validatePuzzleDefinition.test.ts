import { describe, expect, it } from 'vitest'
import { validatePuzzleDefinition } from './validatePuzzleDefinition'
import type { PuzzleDefinition } from './types'
import type { LayoutDefinition } from '../layout/types'
import { samplePuzzle } from '../data/samplePuzzle'
import { samplePuzzleLayout } from '../layout/samplePuzzleLayout'
import { dogsPuzzle } from '../data/dogsPuzzle'
import { dogsPuzzleLayout } from '../layout/dogsPuzzleLayout'
import { spacePuzzle } from '../data/spacePuzzle'
import { spacePuzzleLayout } from '../layout/spacePuzzleLayout'

function makeValidFixture(): { puzzle: PuzzleDefinition; layout: LayoutDefinition } {
  const puzzle: PuzzleDefinition = {
    id: 'test-puzzle',
    clue: 'Test',
    unlockBudget: 1,
    cells: {
      a: { id: 'a', correctLetter: 'X' },
      b: { id: 'b', correctLetter: 'Y' },
    },
    entries: [{ id: 'word-1', cellIds: ['a', 'b'] }],
  }
  const layout: LayoutDefinition = {
    id: 'test-layout',
    puzzleId: 'test-puzzle',
    cellPositions: {
      a: { x: 0, y: 0 },
      b: { x: 1, y: 0 },
    },
    navigationOrder: ['a', 'b'],
  }
  return { puzzle, layout }
}

describe('validatePuzzleDefinition', () => {
  it('accepts a minimal valid puzzle and layout', () => {
    const { puzzle, layout } = makeValidFixture()
    expect(validatePuzzleDefinition(puzzle, layout)).toEqual({ valid: true, errors: [] })
  })

  it('accepts the hand-authored sample puzzle', () => {
    const result = validatePuzzleDefinition(samplePuzzle, samplePuzzleLayout)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('accepts the hand-authored Dogs puzzle', () => {
    const result = validatePuzzleDefinition(dogsPuzzle, dogsPuzzleLayout)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('accepts the hand-authored Space puzzle', () => {
    const result = validatePuzzleDefinition(spacePuzzle, spacePuzzleLayout)
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('every Space puzzle cell belongs to at least one entry', () => {
    const coveredCellIds = new Set(spacePuzzle.entries.flatMap((entry) => entry.cellIds))
    const orphanedCellIds = Object.keys(spacePuzzle.cells).filter(
      (cellId) => !coveredCellIds.has(cellId),
    )
    expect(orphanedCellIds).toEqual([])
  })

  it('flags a layout intended for a different puzzle', () => {
    const { puzzle, layout } = makeValidFixture()
    layout.puzzleId = 'some-other-puzzle'
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(
      result.errors.some((e) => e.includes('is for puzzle "some-other-puzzle"')),
    ).toBe(true)
  })

  it('flags an entry referencing an unknown cell', () => {
    const { puzzle, layout } = makeValidFixture()
    puzzle.entries[0].cellIds.push('missing')
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown cell "missing"'))).toBe(true)
  })

  it('flags a cell missing a layout position', () => {
    const { puzzle, layout } = makeValidFixture()
    delete layout.cellPositions.b
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('no position in the layout'))).toBe(true)
  })

  it('flags a layout position for an unknown cell', () => {
    const { puzzle, layout } = makeValidFixture()
    layout.cellPositions.ghost = { x: 9, y: 9 }
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('unknown cell "ghost"'))).toBe(true)
  })

  it('flags a duplicate id in navigationOrder', () => {
    const { puzzle, layout } = makeValidFixture()
    layout.navigationOrder = ['a', 'a', 'b']
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('more than once in navigationOrder'))).toBe(true)
  })

  it('flags a cell missing from navigationOrder', () => {
    const { puzzle, layout } = makeValidFixture()
    layout.navigationOrder = ['a']
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('missing from navigationOrder'))).toBe(true)
  })

  it('flags a malformed entry with no cells', () => {
    const { puzzle, layout } = makeValidFixture()
    puzzle.entries.push({ id: 'empty-entry', cellIds: [] })
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('has no cells'))).toBe(true)
  })

  it('flags a duplicate entry id', () => {
    const { puzzle, layout } = makeValidFixture()
    puzzle.entries.push({ id: 'word-1', cellIds: ['a'] })
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate entry id'))).toBe(true)
  })

  it('flags a negative unlock budget', () => {
    const { puzzle, layout } = makeValidFixture()
    puzzle.unlockBudget = -1
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('unlockBudget must be'))).toBe(true)
  })

  it('flags an entry whose cells are not axis-aligned in the layout', () => {
    const puzzle: PuzzleDefinition = {
      id: 'diagonal-puzzle',
      clue: 'Test',
      unlockBudget: 0,
      cells: {
        a: { id: 'a', correctLetter: 'X' },
        b: { id: 'b', correctLetter: 'Y' },
      },
      entries: [{ id: 'diagonal-entry', cellIds: ['a', 'b'] }],
    }
    const layout: LayoutDefinition = {
      id: 'diagonal-layout',
      puzzleId: 'diagonal-puzzle',
      cellPositions: {
        a: { x: 0, y: 0 },
        b: { x: 1, y: 1 },
      },
      navigationOrder: ['a', 'b'],
    }
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('not axis-aligned'))).toBe(true)
  })

  it('accepts a fixed-economy budget far larger than the unique letter count', () => {
    // unlockBudget is a credit balance under the fixed letter-cost economy,
    // not a count of allowed reveals, so it has no ceiling tied to the
    // puzzle's unique-letter count (2, here) — 1000 must still be valid.
    const { puzzle, layout } = makeValidFixture()
    puzzle.unlockBudget = 1000
    const result = validatePuzzleDefinition(puzzle, layout)
    expect(result).toEqual({ valid: true, errors: [] })
  })
})
