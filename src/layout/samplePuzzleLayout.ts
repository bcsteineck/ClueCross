import type { LayoutDefinition } from './types'

// Draft grid arrangement to exercise the model end-to-end. Not a committed
// board shape — grid vs. freeform is still an open design question.
export const samplePuzzleLayout: LayoutDefinition = {
  id: 'sample-fruits-grid',
  puzzleId: 'sample-fruits-puzzle',
  cellPositions: {
    c1: { x: 0, y: 0 },
    c2: { x: 1, y: 0 },
    c3: { x: 2, y: 0 },
    c4: { x: 3, y: 0 },
    c5: { x: 2, y: 1 },
    c6: { x: 2, y: 2 },
    c7: { x: 2, y: 3 },
    c8: { x: 2, y: 4 },
  },
  navigationOrder: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'],
}
