import { describe, expect, it } from 'vitest'
import { deriveEntryDirection, getAvailableDirectionsForCell } from './entryDirection'
import type { PuzzleDefinition } from '../core/types'
import type { LayoutDefinition } from './types'

const puzzle: PuzzleDefinition = {
  id: 'fixture-puzzle',
  clue: 'Test',
  unlockBudget: 0,
  cells: {
    c1: { id: 'c1', correctLetter: 'L' },
    c2: { id: 'c2', correctLetter: 'I' },
    c3: { id: 'c3', correctLetter: 'M' },
    c4: { id: 'c4', correctLetter: 'E' },
    c5: { id: 'c5', correctLetter: 'A' },
    solo: { id: 'solo', correctLetter: 'X' },
  },
  entries: [
    { id: 'lime', cellIds: ['c1', 'c2', 'c3', 'c4'] },
    { id: 'down-word', cellIds: ['c3', 'c5'] },
    { id: 'one-letter', cellIds: ['solo'] },
  ],
}

const layout: LayoutDefinition = {
  id: 'fixture-layout',
  puzzleId: 'fixture-puzzle',
  cellPositions: {
    c1: { x: 0, y: 0 },
    c2: { x: 1, y: 0 },
    c3: { x: 2, y: 0 },
    c4: { x: 3, y: 0 },
    c5: { x: 2, y: 1 },
    solo: { x: 5, y: 5 },
  },
  navigationOrder: ['c1', 'c2', 'c3', 'c4', 'c5', 'solo'],
}

describe('deriveEntryDirection', () => {
  it('derives across for a horizontal entry', () => {
    expect(deriveEntryDirection(puzzle.entries[0], layout)).toBe('across')
  })

  it('derives down for a vertical entry', () => {
    expect(deriveEntryDirection(puzzle.entries[1], layout)).toBe('down')
  })

  it('returns null for a single-cell entry', () => {
    expect(deriveEntryDirection(puzzle.entries[2], layout)).toBeNull()
  })

  it('returns null when cells are not axis-aligned', () => {
    const diagonalEntry = { id: 'diagonal', cellIds: ['c1', 'c5'] }
    expect(deriveEntryDirection(diagonalEntry, layout)).toBeNull()
  })
})

describe('getAvailableDirectionsForCell', () => {
  it('returns both directions for an intersection cell', () => {
    expect(getAvailableDirectionsForCell(puzzle, layout, 'c3').sort()).toEqual([
      'across',
      'down',
    ])
  })

  it('returns a single direction for a non-intersecting cell', () => {
    expect(getAvailableDirectionsForCell(puzzle, layout, 'c1')).toEqual(['across'])
  })

  it('returns an empty array for a cell with no directional entry', () => {
    expect(getAvailableDirectionsForCell(puzzle, layout, 'solo')).toEqual([])
  })
})
