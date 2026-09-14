import { describe, expect, it } from 'vitest'
import { getGridDimensions } from './gridDimensions'
import type { LayoutDefinition } from './types'

function makeLayout(cellPositions: LayoutDefinition['cellPositions']): LayoutDefinition {
  return { id: 'test', puzzleId: 'test', cellPositions, navigationOrder: Object.keys(cellPositions) }
}

describe('getGridDimensions', () => {
  it('is one more than the largest x/y coordinate on each axis', () => {
    const layout = makeLayout({
      a: { x: 0, y: 0 },
      b: { x: 4, y: 0 },
      c: { x: 0, y: 2 },
    })
    expect(getGridDimensions(layout)).toEqual({ cols: 5, rows: 3 })
  })

  it('handles a single cell', () => {
    const layout = makeLayout({ a: { x: 0, y: 0 } })
    expect(getGridDimensions(layout)).toEqual({ cols: 1, rows: 1 })
  })

  it('handles a non-square grid', () => {
    const layout = makeLayout({
      a: { x: 19, y: 0 },
      b: { x: 0, y: 16 },
    })
    expect(getGridDimensions(layout)).toEqual({ cols: 20, rows: 17 })
  })
})
