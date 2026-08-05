import { describe, expect, it } from 'vitest'
import { getEntriesForCell } from './puzzleQueries'
import type { PuzzleDefinition } from './types'

const puzzle: PuzzleDefinition = {
  id: 'fixture-puzzle',
  clue: 'Test',
  unlockBudget: 0,
  cells: {
    c1: { id: 'c1', correctLetter: 'L' },
    c2: { id: 'c2', correctLetter: 'I' },
    c3: { id: 'c3', correctLetter: 'M' },
    c5: { id: 'c5', correctLetter: 'A' },
  },
  entries: [
    { id: 'lime', cellIds: ['c1', 'c2', 'c3'] },
    { id: 'mango', cellIds: ['c3', 'c5'] },
  ],
}

describe('getEntriesForCell', () => {
  it('returns both entries for a shared intersection cell', () => {
    const entries = getEntriesForCell(puzzle, 'c3')
    expect(entries.map((e) => e.id).sort()).toEqual(['lime', 'mango'])
  })

  it('returns a single entry for a non-intersecting cell', () => {
    const entries = getEntriesForCell(puzzle, 'c1')
    expect(entries.map((e) => e.id)).toEqual(['lime'])
  })

  it('returns an empty array for a cell that belongs to no entry', () => {
    const entries = getEntriesForCell(puzzle, 'unknown')
    expect(entries).toEqual([])
  })
})
