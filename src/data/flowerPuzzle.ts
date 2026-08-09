import { DEFAULT_REVEAL_BUDGET } from '../core/letterCosts'
import type { PuzzleDefinition } from '../core/types'

// Hand-authored from a flower-themed word grid (crossing flower names,
// across and down). See layout/flowerPuzzleLayout.ts for cell positions.
export const flowerPuzzle: PuzzleDefinition = {
  id: 'flower',
  clue: 'Flowers',
  unlockBudget: DEFAULT_REVEAL_BUDGET,
  cells: {
    r0c2: { id: 'r0c2', correctLetter: 'L' }, r0c3: { id: 'r0c3', correctLetter: 'I' }, r0c4: { id: 'r0c4', correctLetter: 'L' }, r0c5: { id: 'r0c5', correctLetter: 'A' },
    r0c6: { id: 'r0c6', correctLetter: 'C' }, r0c8: { id: 'r0c8', correctLetter: 'P' }, r0c10: { id: 'r0c10', correctLetter: 'D' }, r0c11: { id: 'r0c11', correctLetter: 'A' },
    r0c12: { id: 'r0c12', correctLetter: 'H' }, r0c13: { id: 'r0c13', correctLetter: 'L' }, r0c14: { id: 'r0c14', correctLetter: 'I' }, r0c15: { id: 'r0c15', correctLetter: 'A' },
    r1c6: { id: 'r1c6', correctLetter: 'A' }, r1c8: { id: 'r1c8', correctLetter: 'A' }, r1c15: { id: 'r1c15', correctLetter: 'Z' }, r1c19: { id: 'r1c19', correctLetter: 'O' },
    r2c1: { id: 'r2c1', correctLetter: 'T' }, r2c4: { id: 'r2c4', correctLetter: 'G' }, r2c5: { id: 'r2c5', correctLetter: 'E' }, r2c6: { id: 'r2c6', correctLetter: 'R' },
    r2c7: { id: 'r2c7', correctLetter: 'A' }, r2c8: { id: 'r2c8', correctLetter: 'N' }, r2c9: { id: 'r2c9', correctLetter: 'I' }, r2c10: { id: 'r2c10', correctLetter: 'U' },
    r2c11: { id: 'r2c11', correctLetter: 'M' }, r2c15: { id: 'r2c15', correctLetter: 'A' }, r2c16: { id: 'r2c16', correctLetter: 'S' }, r2c17: { id: 'r2c17', correctLetter: 'T' },
    r2c18: { id: 'r2c18', correctLetter: 'E' }, r2c19: { id: 'r2c19', correctLetter: 'R' }, r3c1: { id: 'r3c1', correctLetter: 'U' }, r3c6: { id: 'r3c6', correctLetter: 'N' },
    r3c8: { id: 'r3c8', correctLetter: 'S' }, r3c12: { id: 'r3c12', correctLetter: 'S' }, r3c15: { id: 'r3c15', correctLetter: 'L' }, r3c19: { id: 'r3c19', correctLetter: 'C' },
    r4c1: { id: 'r4c1', correctLetter: 'L' }, r4c3: { id: 'r4c3', correctLetter: 'B' }, r4c6: { id: 'r4c6', correctLetter: 'A' }, r4c8: { id: 'r4c8', correctLetter: 'Y' },
    r4c10: { id: 'r4c10', correctLetter: 'B' }, r4c11: { id: 'r4c11', correctLetter: 'L' }, r4c12: { id: 'r4c12', correctLetter: 'U' }, r4c13: { id: 'r4c13', correctLetter: 'E' },
    r4c14: { id: 'r4c14', correctLetter: 'B' }, r4c15: { id: 'r4c15', correctLetter: 'E' }, r4c16: { id: 'r4c16', correctLetter: 'L' }, r4c17: { id: 'r4c17', correctLetter: 'L' },
    r4c19: { id: 'r4c19', correctLetter: 'H' }, r5c1: { id: 'r5c1', correctLetter: 'I' }, r5c3: { id: 'r5c3', correctLetter: 'U' }, r5c6: { id: 'r5c6', correctLetter: 'T' },
    r5c12: { id: 'r5c12', correctLetter: 'N' }, r5c15: { id: 'r5c15', correctLetter: 'A' }, r5c19: { id: 'r5c19', correctLetter: 'I' }, r6c1: { id: 'r6c1', correctLetter: 'P' },
    r6c2: { id: 'r6c2', correctLetter: 'E' }, r6c3: { id: 'r6c3', correctLetter: 'T' }, r6c4: { id: 'r6c4', correctLetter: 'U' }, r6c5: { id: 'r6c5', correctLetter: 'N' },
    r6c6: { id: 'r6c6', correctLetter: 'I' }, r6c7: { id: 'r6c7', correctLetter: 'A' }, r6c12: { id: 'r6c12', correctLetter: 'F' }, r6c17: { id: 'r6c17', correctLetter: 'F' },
    r6c19: { id: 'r6c19', correctLetter: 'D' }, r7c3: { id: 'r7c3', correctLetter: 'T' }, r7c6: { id: 'r7c6', correctLetter: 'O' }, r7c10: { id: 'r7c10', correctLetter: 'G' },
    r7c11: { id: 'r7c11', correctLetter: 'O' }, r7c12: { id: 'r7c12', correctLetter: 'L' }, r7c13: { id: 'r7c13', correctLetter: 'D' }, r7c14: { id: 'r7c14', correctLetter: 'E' },
    r7c15: { id: 'r7c15', correctLetter: 'N' }, r7c16: { id: 'r7c16', correctLetter: 'R' }, r7c17: { id: 'r7c17', correctLetter: 'O' }, r7c18: { id: 'r7c18', correctLetter: 'D' },
    r8c2: { id: 'r8c2', correctLetter: 'B' }, r8c3: { id: 'r8c3', correctLetter: 'E' }, r8c4: { id: 'r8c4', correctLetter: 'G' }, r8c5: { id: 'r8c5', correctLetter: 'O' },
    r8c6: { id: 'r8c6', correctLetter: 'N' }, r8c7: { id: 'r8c7', correctLetter: 'I' }, r8c8: { id: 'r8c8', correctLetter: 'A' }, r8c12: { id: 'r8c12', correctLetter: 'O' },
    r8c17: { id: 'r8c17', correctLetter: 'X' }, r9c3: { id: 'r9c3', correctLetter: 'R' }, r9c9: { id: 'r9c9', correctLetter: 'S' }, r9c12: { id: 'r9c12', correctLetter: 'W' },
    r9c17: { id: 'r9c17', correctLetter: 'G' }, r10c3: { id: 'r10c3', correctLetter: 'C' }, r10c4: { id: 'r10c4', correctLetter: 'H' }, r10c5: { id: 'r10c5', correctLetter: 'R' },
    r10c6: { id: 'r10c6', correctLetter: 'Y' }, r10c7: { id: 'r10c7', correctLetter: 'S' }, r10c8: { id: 'r10c8', correctLetter: 'A' }, r10c9: { id: 'r10c9', correctLetter: 'N' },
    r10c10: { id: 'r10c10', correctLetter: 'T' }, r10c11: { id: 'r10c11', correctLetter: 'H' }, r10c12: { id: 'r10c12', correctLetter: 'E' }, r10c13: { id: 'r10c13', correctLetter: 'M' },
    r10c14: { id: 'r10c14', correctLetter: 'U' }, r10c15: { id: 'r10c15', correctLetter: 'M' }, r10c17: { id: 'r10c17', correctLetter: 'L' }, r11c3: { id: 'r11c3', correctLetter: 'U' },
    r11c9: { id: 'r11c9', correctLetter: 'A' }, r11c12: { id: 'r11c12', correctLetter: 'R' }, r11c15: { id: 'r11c15', correctLetter: 'A' }, r11c17: { id: 'r11c17', correctLetter: 'O' },
    r12c1: { id: 'r12c1', correctLetter: 'M' }, r12c3: { id: 'r12c3', correctLetter: 'P' }, r12c6: { id: 'r12c6', correctLetter: 'P' }, r12c7: { id: 'r12c7', correctLetter: 'O' },
    r12c8: { id: 'r12c8', correctLetter: 'P' }, r12c9: { id: 'r12c9', correctLetter: 'P' }, r12c10: { id: 'r12c10', correctLetter: 'Y' }, r12c15: { id: 'r12c15', correctLetter: 'R' },
    r12c17: { id: 'r12c17', correctLetter: 'V' }, r13c1: { id: 'r13c1', correctLetter: 'A' }, r13c4: { id: 'r13c4', correctLetter: 'L' }, r13c6: { id: 'r13c6', correctLetter: 'R' },
    r13c9: { id: 'r13c9', correctLetter: 'D' }, r13c11: { id: 'r13c11', correctLetter: 'J' }, r13c12: { id: 'r13c12', correctLetter: 'A' }, r13c13: { id: 'r13c13', correctLetter: 'S' },
    r13c14: { id: 'r13c14', correctLetter: 'M' }, r13c15: { id: 'r13c15', correctLetter: 'I' }, r13c16: { id: 'r13c16', correctLetter: 'N' }, r13c17: { id: 'r13c17', correctLetter: 'E' },
    r14c1: { id: 'r14c1', correctLetter: 'G' }, r14c4: { id: 'r14c4', correctLetter: 'I' }, r14c5: { id: 'r14c5', correctLetter: 'R' }, r14c6: { id: 'r14c6', correctLetter: 'I' },
    r14c7: { id: 'r14c7', correctLetter: 'S' }, r14c9: { id: 'r14c9', correctLetter: 'R' }, r14c15: { id: 'r14c15', correctLetter: 'G' }, r15c1: { id: 'r15c1', correctLetter: 'N' },
    r15c4: { id: 'r15c4', correctLetter: 'L' }, r15c6: { id: 'r15c6', correctLetter: 'M' }, r15c9: { id: 'r15c9', correctLetter: 'A' }, r15c11: { id: 'r15c11', correctLetter: 'D' },
    r15c12: { id: 'r15c12', correctLetter: 'A' }, r15c13: { id: 'r15c13', correctLetter: 'F' }, r15c14: { id: 'r15c14', correctLetter: 'F' }, r15c15: { id: 'r15c15', correctLetter: 'O' },
    r15c16: { id: 'r15c16', correctLetter: 'D' }, r15c17: { id: 'r15c17', correctLetter: 'I' }, r15c18: { id: 'r15c18', correctLetter: 'L' }, r16c1: { id: 'r16c1', correctLetter: 'O' },
    r16c3: { id: 'r16c3', correctLetter: 'H' }, r16c4: { id: 'r16c4', correctLetter: 'Y' }, r16c5: { id: 'r16c5', correctLetter: 'D' }, r16c6: { id: 'r16c6', correctLetter: 'R' },
    r16c7: { id: 'r16c7', correctLetter: 'A' }, r16c8: { id: 'r16c8', correctLetter: 'N' }, r16c9: { id: 'r16c9', correctLetter: 'G' }, r16c10: { id: 'r16c10', correctLetter: 'E' },
    r16c11: { id: 'r16c11', correctLetter: 'A' }, r16c15: { id: 'r16c15', correctLetter: 'L' }, r16c18: { id: 'r16c18', correctLetter: 'O' }, r17c1: { id: 'r17c1', correctLetter: 'L' },
    r17c6: { id: 'r17c6', correctLetter: 'O' }, r17c9: { id: 'r17c9', correctLetter: 'O' }, r17c11: { id: 'r17c11', correctLetter: 'I' }, r17c15: { id: 'r17c15', correctLetter: 'D' },
    r17c18: { id: 'r17c18', correctLetter: 'T' }, r18c1: { id: 'r18c1', correctLetter: 'I' }, r18c6: { id: 'r18c6', correctLetter: 'S' }, r18c9: { id: 'r18c9', correctLetter: 'N' },
    r18c11: { id: 'r18c11', correctLetter: 'S' }, r18c18: { id: 'r18c18', correctLetter: 'U' }, r19c0: { id: 'r19c0', correctLetter: 'L' }, r19c1: { id: 'r19c1', correctLetter: 'A' },
    r19c2: { id: 'r19c2', correctLetter: 'V' }, r19c3: { id: 'r19c3', correctLetter: 'E' }, r19c4: { id: 'r19c4', correctLetter: 'N' }, r19c5: { id: 'r19c5', correctLetter: 'D' },
    r19c6: { id: 'r19c6', correctLetter: 'E' }, r19c7: { id: 'r19c7', correctLetter: 'R' }, r19c11: { id: 'r19c11', correctLetter: 'Y' }, r19c16: { id: 'r19c16', correctLetter: 'R' },
    r19c17: { id: 'r19c17', correctLetter: 'O' }, r19c18: { id: 'r19c18', correctLetter: 'S' }, r19c19: { id: 'r19c19', correctLetter: 'E' },
  },
  entries: [
    { id: 'lilac', cellIds: ['r0c2', 'r0c3', 'r0c4', 'r0c5', 'r0c6'] },
    { id: 'dahlia', cellIds: ['r0c10', 'r0c11', 'r0c12', 'r0c13', 'r0c14', 'r0c15'] },
    { id: 'pansy', cellIds: ['r0c8', 'r1c8', 'r2c8', 'r3c8', 'r4c8'] },
    { id: 'azalea', cellIds: ['r0c15', 'r1c15', 'r2c15', 'r3c15', 'r4c15', 'r5c15'] },
    { id: 'orchid', cellIds: ['r1c19', 'r2c19', 'r3c19', 'r4c19', 'r5c19', 'r6c19'] },
    { id: 'geranium', cellIds: [
      'r2c4', 'r2c5', 'r2c6', 'r2c7', 'r2c8', 'r2c9', 'r2c10', 'r2c11',
    ] },
    { id: 'aster', cellIds: ['r2c15', 'r2c16', 'r2c17', 'r2c18', 'r2c19'] },
    { id: 'tulip', cellIds: ['r2c1', 'r3c1', 'r4c1', 'r5c1', 'r6c1'] },
    { id: 'carnation', cellIds: [
      'r0c6', 'r1c6', 'r2c6', 'r3c6', 'r4c6', 'r5c6', 'r6c6', 'r7c6', 'r8c6',
    ] },
    { id: 'buttercup', cellIds: [
      'r4c3', 'r5c3', 'r6c3', 'r7c3', 'r8c3', 'r9c3', 'r10c3', 'r11c3', 'r12c3',
    ] },
    { id: 'bluebell', cellIds: [
      'r4c10', 'r4c11', 'r4c12', 'r4c13', 'r4c14', 'r4c15', 'r4c16', 'r4c17',
    ] },
    { id: 'sunflower', cellIds: [
      'r3c12', 'r4c12', 'r5c12', 'r6c12', 'r7c12', 'r8c12', 'r9c12', 'r10c12', 'r11c12',
    ] },
    { id: 'petunia', cellIds: ['r6c1', 'r6c2', 'r6c3', 'r6c4', 'r6c5', 'r6c6', 'r6c7'] },
    { id: 'foxglove', cellIds: [
      'r6c17', 'r7c17', 'r8c17', 'r9c17', 'r10c17', 'r11c17', 'r12c17', 'r13c17',
    ] },
    { id: 'goldenrod', cellIds: [
      'r7c10', 'r7c11', 'r7c12', 'r7c13', 'r7c14', 'r7c15', 'r7c16', 'r7c17', 'r7c18',
    ] },
    { id: 'begonia', cellIds: ['r8c2', 'r8c3', 'r8c4', 'r8c5', 'r8c6', 'r8c7', 'r8c8'] },
    { id: 'snapdragon', cellIds: [
      'r9c9', 'r10c9', 'r11c9', 'r12c9', 'r13c9', 'r14c9', 'r15c9', 'r16c9', 'r17c9', 'r18c9',
    ] },
    { id: 'chrysanthemum', cellIds: [
      'r10c3', 'r10c4', 'r10c5', 'r10c6', 'r10c7', 'r10c8', 'r10c9', 'r10c10', 'r10c11', 'r10c12', 'r10c13', 'r10c14', 'r10c15',
    ] },
    { id: 'marigold', cellIds: [
      'r10c15', 'r11c15', 'r12c15', 'r13c15', 'r14c15', 'r15c15', 'r16c15', 'r17c15',
    ] },
    { id: 'magnolia', cellIds: [
      'r12c1', 'r13c1', 'r14c1', 'r15c1', 'r16c1', 'r17c1', 'r18c1', 'r19c1',
    ] },
    { id: 'poppy', cellIds: ['r12c6', 'r12c7', 'r12c8', 'r12c9', 'r12c10'] },
    { id: 'jasmine', cellIds: [
      'r13c11', 'r13c12', 'r13c13', 'r13c14', 'r13c15', 'r13c16', 'r13c17',
    ] },
    { id: 'lily', cellIds: ['r13c4', 'r14c4', 'r15c4', 'r16c4'] },
    { id: 'primrose', cellIds: [
      'r12c6', 'r13c6', 'r14c6', 'r15c6', 'r16c6', 'r17c6', 'r18c6', 'r19c6',
    ] },
    { id: 'iris', cellIds: ['r14c4', 'r14c5', 'r14c6', 'r14c7'] },
    { id: 'daffodil', cellIds: [
      'r15c11', 'r15c12', 'r15c13', 'r15c14', 'r15c15', 'r15c16', 'r15c17', 'r15c18',
    ] },
    { id: 'daisy', cellIds: ['r15c11', 'r16c11', 'r17c11', 'r18c11', 'r19c11'] },
    { id: 'hydrangea', cellIds: [
      'r16c3', 'r16c4', 'r16c5', 'r16c6', 'r16c7', 'r16c8', 'r16c9', 'r16c10', 'r16c11',
    ] },
    { id: 'lotus', cellIds: ['r15c18', 'r16c18', 'r17c18', 'r18c18', 'r19c18'] },
    { id: 'lavender', cellIds: [
      'r19c0', 'r19c1', 'r19c2', 'r19c3', 'r19c4', 'r19c5', 'r19c6', 'r19c7',
    ] },
    { id: 'rose', cellIds: ['r19c16', 'r19c17', 'r19c18', 'r19c19'] },
  ],
}
