import { describe, expect, it } from 'vitest'
import { getNextCellInEntry, getPreviousCellInEntry } from './autoAdvance'
import type { PuzzleDefinition } from '../core/types'
import type { LayoutDefinition } from './types'

// Two separate across entries sharing row y=0, with a gap at x=2 — the bug
// this guards against: a purely spatial "nearest cell in this row" search
// would jump straight from entry-1's last cell (x=1) to entry-2's first
// cell (x=3), even though they're unrelated entries. Also includes a short
// down entry (x=0, y=0-1) so intersections/locking can be exercised.
const puzzle: PuzzleDefinition = {
  id: 'fixture',
  clue: 'Test',
  unlockBudget: 200,
  cells: {
    a: { id: 'a', correctLetter: 'A' }, // entry-1, x0y0 — also entry-down
    b: { id: 'b', correctLetter: 'B' }, // entry-1, x1y0
    c: { id: 'c', correctLetter: 'C' }, // entry-2, x3y0
    d: { id: 'd', correctLetter: 'D' }, // entry-2, x4y0
    e: { id: 'e', correctLetter: 'E' }, // entry-down, x0y1
  },
  entries: [
    { id: 'entry-1', cellIds: ['a', 'b'] },
    { id: 'entry-2', cellIds: ['c', 'd'] },
    { id: 'entry-down', cellIds: ['a', 'e'] },
  ],
}

const layout: LayoutDefinition = {
  id: 'fixture-layout',
  puzzleId: 'fixture',
  cellPositions: {
    a: { x: 0, y: 0 },
    b: { x: 1, y: 0 },
    c: { x: 3, y: 0 },
    d: { x: 4, y: 0 },
    e: { x: 0, y: 1 },
  },
  navigationOrder: ['a', 'b', 'c', 'd', 'e'],
}

describe('getNextCellInEntry', () => {
  it('advances to the next cell within the same entry', () => {
    expect(getNextCellInEntry(puzzle, layout, 'a', 'across', {})).toBe('b')
  })

  it('stops at the end of the entry rather than jumping to an unrelated entry sharing the row', () => {
    expect(getNextCellInEntry(puzzle, layout, 'b', 'across', {})).toBeNull()
  })

  it('never crosses into a different entry even though it is spatially nearest', () => {
    // If this ever regresses to spatial-only search, 'b' -> 'c' would pass.
    expect(getNextCellInEntry(puzzle, layout, 'b', 'across', {})).not.toBe('c')
  })

  it('skips a locked cell within the entry', () => {
    expect(getNextCellInEntry(puzzle, layout, 'a', 'across', { b: true })).toBeNull()
  })

  it('returns null when there is no entry in the requested direction', () => {
    // 'e' only belongs to the down entry; there is no across entry here.
    expect(getNextCellInEntry(puzzle, layout, 'e', 'across', {})).toBeNull()
  })

  it('advances correctly in the down direction', () => {
    expect(getNextCellInEntry(puzzle, layout, 'a', 'down', {})).toBe('e')
  })
})

describe('getPreviousCellInEntry', () => {
  it('moves back to the previous cell within the same entry', () => {
    expect(getPreviousCellInEntry(puzzle, layout, 'b', 'across', {})).toBe('a')
  })

  it('stops at the start of the entry rather than jumping to an unrelated entry', () => {
    expect(getPreviousCellInEntry(puzzle, layout, 'c', 'across', {})).toBeNull()
  })

  it('skips a locked cell within the entry', () => {
    expect(getPreviousCellInEntry(puzzle, layout, 'e', 'down', { a: true })).toBeNull()
  })
})
