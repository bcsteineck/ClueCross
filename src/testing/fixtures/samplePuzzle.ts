// TEST FIXTURE ONLY. The minimal validator/model fixture — never
// production calendar content and never imported by the player runtime
// (enforced in workshop/src/isolation.test.ts). Its ID is reserved
// (src/publishing/reservedPuzzleIds.ts) so it can't be published.
import type { PuzzleDefinition } from '../../core/types'

// Minimal fixture puzzle used to exercise the model end-to-end. The fuller
// legacy fixtures (e.g. dogsPuzzle) cover realistic gameplay.
export const samplePuzzle: PuzzleDefinition = {
  id: 'sample-fruits-puzzle',
  clue: 'Fruits',
  unlockBudget: 3,
  cells: {
    c1: { id: 'c1', correctLetter: 'L' },
    c2: { id: 'c2', correctLetter: 'I' },
    c3: { id: 'c3', correctLetter: 'M' },
    c4: { id: 'c4', correctLetter: 'E' },
    c5: { id: 'c5', correctLetter: 'A' },
    c6: { id: 'c6', correctLetter: 'N' },
    c7: { id: 'c7', correctLetter: 'G' },
    c8: { id: 'c8', correctLetter: 'O' },
  },
  entries: [
    { id: 'lime', cellIds: ['c1', 'c2', 'c3', 'c4'] },
    { id: 'mango', cellIds: ['c3', 'c5', 'c6', 'c7', 'c8'] },
  ],
}
