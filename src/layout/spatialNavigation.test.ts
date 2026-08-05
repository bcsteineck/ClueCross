import { describe, expect, it } from 'vitest'
import { getCellsInDirection } from './spatialNavigation'
import type { LayoutDefinition } from './types'

// c1 c2 c3 c4  (row y=0)
//       c5     (y=1, same column as c3)
//       c6     (y=2, same column as c3)
const layout: LayoutDefinition = {
  id: 'fixture-layout',
  puzzleId: 'fixture-puzzle',
  cellPositions: {
    c1: { x: 0, y: 0 },
    c2: { x: 1, y: 0 },
    c3: { x: 2, y: 0 },
    c4: { x: 3, y: 0 },
    c5: { x: 2, y: 1 },
    c6: { x: 2, y: 2 },
  },
  navigationOrder: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
}

describe('getCellsInDirection', () => {
  it('finds cells to the right, nearest first', () => {
    expect(getCellsInDirection(layout, 'c1', 'right')).toEqual(['c2', 'c3', 'c4'])
  })

  it('finds cells to the left, nearest first', () => {
    expect(getCellsInDirection(layout, 'c4', 'left')).toEqual(['c3', 'c2', 'c1'])
  })

  it('finds cells below, nearest first', () => {
    expect(getCellsInDirection(layout, 'c3', 'down')).toEqual(['c5', 'c6'])
  })

  it('finds cells above, nearest first', () => {
    expect(getCellsInDirection(layout, 'c6', 'up')).toEqual(['c5', 'c3'])
  })

  it('returns an empty array when there is no cell in that direction', () => {
    expect(getCellsInDirection(layout, 'c4', 'right')).toEqual([])
    expect(getCellsInDirection(layout, 'c1', 'up')).toEqual([])
  })

  it('does not cross rows/columns', () => {
    // c1 is on row y=0; nothing shares its column (x=0) below it
    expect(getCellsInDirection(layout, 'c1', 'down')).toEqual([])
  })
})
