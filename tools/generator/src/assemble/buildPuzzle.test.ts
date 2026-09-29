import { describe, expect, it } from 'vitest'
import { buildPuzzle } from './buildPuzzle'
import { constructFixedAnswerPuzzle } from '../placement/backtrack'
import type { ConstructionSuccess } from '../types'
import { validatePuzzleDefinition } from '../../../../src/core/validatePuzzleDefinition'

// Small hand-built fixture: authored CAT (across) crossing authored TIE
// (down) at CAT's 'T'. Kept separate from real Phase 1 search output so
// the cell/layout assembly tests below are exact and easy to read.
function crossingFixture(): ConstructionSuccess {
  return {
    ok: true,
    placedAnswers: [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ],
    cells: {
      r0c0: 'C',
      r0c1: 'A',
      r0c2: 'T',
      r1c2: 'I',
      r2c2: 'E',
    },
    positions: {
      r0c0: { x: 0, y: 0 },
      r0c1: { x: 1, y: 0 },
      r0c2: { x: 2, y: 0 },
      r1c2: { x: 2, y: 1 },
      r2c2: { x: 2, y: 2 },
    },
    width: 3,
    height: 3,
    attemptsUsed: 1,
  }
}

describe('buildPuzzle: cell and layout assembly', () => {
  it('produces deterministic r{row}c{col} cell ids from normalized positions', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'test',
      clue: 'Test',
      unlockBudget: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.puzzle.cells).sort()).toEqual(['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'])
  })

  it('creates exactly one Cell per occupied coordinate, with correct letters preserved', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'test',
      clue: 'Test',
      unlockBudget: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.puzzle.cells).toEqual({
      r0c0: { id: 'r0c0', correctLetter: 'C' },
      r0c1: { id: 'r0c1', correctLetter: 'A' },
      r0c2: { id: 'r0c2', correctLetter: 'T' },
      r1c2: { id: 'r1c2', correctLetter: 'I' },
      r2c2: { id: 'r2c2', correctLetter: 'E' },
    })
  })

  it('makes cellPositions exactly match cells, with no orphans in either direction', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'test',
      clue: 'Test',
      unlockBudget: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.layout.cellPositions).sort()).toEqual(Object.keys(result.puzzle.cells).sort())
  })

  it('builds a navigationOrder covering every cell exactly once, no duplicates, no unknown cells', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'test',
      clue: 'Test',
      unlockBudget: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { navigationOrder } = result.layout
    expect(navigationOrder.slice().sort()).toEqual(Object.keys(result.puzzle.cells).sort())
    expect(new Set(navigationOrder).size).toBe(navigationOrder.length)
  })

  it('orders navigationOrder row-major: y ascending, then x ascending', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'test',
      clue: 'Test',
      unlockBudget: 100,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.navigationOrder).toEqual(['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'])
  })

  it('carries the given id/clue/unlockBudget through, and derives the layout id/puzzleId from it', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'my-puzzle',
      clue: 'My Clue',
      unlockBudget: 777,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.puzzle.id).toBe('my-puzzle')
    expect(result.puzzle.clue).toBe('My Clue')
    expect(result.puzzle.unlockBudget).toBe(777)
    expect(result.layout.puzzleId).toBe('my-puzzle')
    expect(result.layout.id).toBe('my-puzzle-grid')
  })
})

describe('buildPuzzle: production validation bridge', () => {
  it('assembles a small hand-built construction that passes validatePuzzleDefinition unchanged', () => {
    const result = buildPuzzle({
      construction: crossingFixture(),
      id: 'test-puzzle',
      clue: 'Test',
      unlockBudget: 500,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(validatePuzzleDefinition(result.puzzle, result.layout)).toEqual({ valid: true, errors: [] })
  })

  it('assembles a real Phase 1 construction result end to end and passes validatePuzzleDefinition', () => {
    const construction = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: ['CAT', 'TIE', 'EAR'],
      maxWidth: 10,
      maxHeight: 10,
      seed: 'phase-2-validation-seed',
    })
    expect(construction.ok).toBe(true)
    if (!construction.ok) return

    const result = buildPuzzle({
      construction,
      id: 'phase-2-demo',
      clue: 'Demo',
      unlockBudget: 2000,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(validatePuzzleDefinition(result.puzzle, result.layout)).toEqual({ valid: true, errors: [] })
  })

  it('assembles a construction containing incidental derived entries, which also passes validatePuzzleDefinition', () => {
    // Two authored across answers stacked in adjacent rows, sharing no
    // authored down answer between them. Every column they share
    // incidentally forms its own 2-cell down run — not authored, but
    // still legal playable geometry, the same way the production Space
    // puzzle's "rasa" run is.
    const construction: ConstructionSuccess = {
      ok: true,
      placedAnswers: [
        { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
        { word: 'TOP', direction: 'across', start: { x: 0, y: 1 } },
      ],
      cells: {
        r0c0: 'C',
        r0c1: 'A',
        r0c2: 'T',
        r1c0: 'T',
        r1c1: 'O',
        r1c2: 'P',
      },
      positions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r1c0: { x: 0, y: 1 },
        r1c1: { x: 1, y: 1 },
        r1c2: { x: 2, y: 1 },
      },
      width: 3,
      height: 2,
      attemptsUsed: 1,
    }

    const result = buildPuzzle({ construction, id: 'incidental-demo', clue: 'Demo', unlockBudget: 100 })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const entryIds = result.puzzle.entries.map((entry) => entry.id).sort()
    expect(entryIds).toEqual(['cat', 'down-r0-c0', 'down-r0-c1', 'down-r0-c2', 'top'])
    expect(validatePuzzleDefinition(result.puzzle, result.layout)).toEqual({ valid: true, errors: [] })
  })

  it('fails assembly clearly, without producing runtime data, when the construction input is malformed', () => {
    // Same coordinate is claimed twice, once by each of two different
    // authored answers — not something Phase 1 search can produce, but a
    // caller could still pass this directly.
    const construction: ConstructionSuccess = {
      ok: true,
      placedAnswers: [
        { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
        { word: 'COW', direction: 'across', start: { x: 0, y: 0 } },
      ],
      cells: { r0c0: 'C', r0c1: 'A', r0c2: 'T' },
      positions: { r0c0: { x: 0, y: 0 }, r0c1: { x: 1, y: 0 }, r0c2: { x: 2, y: 0 } },
      width: 3,
      height: 1,
      attemptsUsed: 1,
    }

    expect(() =>
      buildPuzzle({ construction, id: 'malformed', clue: 'Demo', unlockBudget: 0 }),
    ).toThrow(/internal error/i)
  })
})

describe('buildPuzzle: authored-run-extension invariant', () => {
  it('rejects assembly when two authored answers were placed end-to-end, merging into one ambiguous run', () => {
    // Phase 1's approved authored-run-extension rule (validateCandidate)
    // prevents real search output from ever producing this, but the
    // recovery invariant buildPuzzle enforces has to hold independently
    // of how the geometry arose — this constructs the malformed geometry
    // directly, exactly as CAT + TAIL placed end-to-end in one row:
    // "CATTAIL" derives as a single 7-cell across run, and neither CAT's
    // own 3-cell span nor TAIL's own 4-cell span exactly matches it.
    const construction: ConstructionSuccess = {
      ok: true,
      placedAnswers: [
        { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
        { word: 'TAIL', direction: 'across', start: { x: 3, y: 0 } },
      ],
      cells: {
        r0c0: 'C',
        r0c1: 'A',
        r0c2: 'T',
        r0c3: 'T',
        r0c4: 'A',
        r0c5: 'I',
        r0c6: 'L',
      },
      positions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r0c3: { x: 3, y: 0 },
        r0c4: { x: 4, y: 0 },
        r0c5: { x: 5, y: 0 },
        r0c6: { x: 6, y: 0 },
      },
      width: 7,
      height: 1,
      attemptsUsed: 1,
    }

    const result = buildPuzzle({ construction, id: 'cattail', clue: 'Demo', unlockBudget: 0 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('CAT')
    expect(result.reason).toContain('TAIL')
  })
})
