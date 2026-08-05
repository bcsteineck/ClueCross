import { DEFAULT_REVEAL_BUDGET } from '../core/letterCosts'
import type { PuzzleDefinition } from '../core/types'

// Hand-authored from the "Space" spreadsheet. Layout is preserved exactly
// as given — see layout/spacePuzzleLayout.ts for cell positions.
export const spacePuzzle: PuzzleDefinition = {
  id: 'space',
  clue: 'Space',
  unlockBudget: DEFAULT_REVEAL_BUDGET,
  cells: {
    r0c13: { id: 'r0c13', correctLetter: 'C' },
    r1c7: { id: 'r1c7', correctLetter: 'B' }, r1c8: { id: 'r1c8', correctLetter: 'L' },
    r1c9: { id: 'r1c9', correctLetter: 'A' }, r1c10: { id: 'r1c10', correctLetter: 'C' },
    r1c11: { id: 'r1c11', correctLetter: 'K' }, r1c12: { id: 'r1c12', correctLetter: 'H' },
    r1c13: { id: 'r1c13', correctLetter: 'O' }, r1c14: { id: 'r1c14', correctLetter: 'L' },
    r1c15: { id: 'r1c15', correctLetter: 'E' },
    r2c1: { id: 'r2c1', correctLetter: 'S' }, r2c2: { id: 'r2c2', correctLetter: 'A' },
    r2c3: { id: 'r2c3', correctLetter: 'T' }, r2c4: { id: 'r2c4', correctLetter: 'U' },
    r2c5: { id: 'r2c5', correctLetter: 'R' }, r2c6: { id: 'r2c6', correctLetter: 'N' },
    r2c13: { id: 'r2c13', correctLetter: 'M' },
    r3c2: { id: 'r3c2', correctLetter: 'L' }, r3c6: { id: 'r3c6', correctLetter: 'A' },
    r3c9: { id: 'r3c9', correctLetter: 'G' }, r3c13: { id: 'r3c13', correctLetter: 'E' },
    r3c16: { id: 'r3c16', correctLetter: 'A' },
    r4c0: { id: 'r4c0', correctLetter: 'U' }, r4c1: { id: 'r4c1', correctLetter: 'N' },
    r4c2: { id: 'r4c2', correctLetter: 'I' }, r4c3: { id: 'r4c3', correctLetter: 'V' },
    r4c4: { id: 'r4c4', correctLetter: 'E' }, r4c5: { id: 'r4c5', correctLetter: 'R' },
    r4c6: { id: 'r4c6', correctLetter: 'S' }, r4c7: { id: 'r4c7', correctLetter: 'E' },
    r4c9: { id: 'r4c9', correctLetter: 'A' }, r4c12: { id: 'r4c12', correctLetter: 'S' },
    r4c13: { id: 'r4c13', correctLetter: 'T' }, r4c14: { id: 'r4c14', correctLetter: 'A' },
    r4c15: { id: 'r4c15', correctLetter: 'R' }, r4c16: { id: 'r4c16', correctLetter: 'S' },
    r5c2: { id: 'r5c2', correctLetter: 'E' }, r5c4: { id: 'r5c4', correctLetter: 'X' },
    r5c6: { id: 'r5c6', correctLetter: 'A' }, r5c8: { id: 'r5c8', correctLetter: 'P' },
    r5c9: { id: 'r5c9', correctLetter: 'L' }, r5c10: { id: 'r5c10', correctLetter: 'U' },
    r5c11: { id: 'r5c11', correctLetter: 'T' }, r5c12: { id: 'r5c12', correctLetter: 'O' },
    r5c16: { id: 'r5c16', correctLetter: 'T' },
    r6c2: { id: 'r6c2', correctLetter: 'N' }, r6c4: { id: 'r6c4', correctLetter: 'O' },
    r6c9: { id: 'r6c9', correctLetter: 'A' }, r6c12: { id: 'r6c12', correctLetter: 'L' },
    r6c13: { id: 'r6c13', correctLetter: 'U' }, r6c14: { id: 'r6c14', correctLetter: 'N' },
    r6c15: { id: 'r6c15', correctLetter: 'A' }, r6c16: { id: 'r6c16', correctLetter: 'R' },
    r7c4: { id: 'r7c4', correctLetter: 'P' }, r7c9: { id: 'r7c9', correctLetter: 'X' },
    r7c12: { id: 'r7c12', correctLetter: 'A' }, r7c16: { id: 'r7c16', correctLetter: 'O' },
    r8c4: { id: 'r8c4', correctLetter: 'L' }, r8c5: { id: 'r8c5', correctLetter: 'I' },
    r8c6: { id: 'r8c6', correctLetter: 'G' }, r8c7: { id: 'r8c7', correctLetter: 'H' },
    r8c8: { id: 'r8c8', correctLetter: 'T' }, r8c9: { id: 'r8c9', correctLetter: 'Y' },
    r8c10: { id: 'r8c10', correctLetter: 'E' }, r8c11: { id: 'r8c11', correctLetter: 'A' },
    r8c12: { id: 'r8c12', correctLetter: 'R' }, r8c14: { id: 'r8c14', correctLetter: 'S' },
    r8c15: { id: 'r8c15', correctLetter: 'U' }, r8c16: { id: 'r8c16', correctLetter: 'N' },
    r9c4: { id: 'r9c4', correctLetter: 'A' }, r9c8: { id: 'r9c8', correctLetter: 'E' },
    r9c11: { id: 'r9c11', correctLetter: 'S' }, r9c16: { id: 'r9c16', correctLetter: 'A' },
    r10c2: { id: 'r10c2', correctLetter: 'C' }, r10c3: { id: 'r10c3', correctLetter: 'O' },
    r10c4: { id: 'r10c4', correctLetter: 'N' }, r10c5: { id: 'r10c5', correctLetter: 'S' },
    r10c6: { id: 'r10c6', correctLetter: 'T' }, r10c7: { id: 'r10c7', correctLetter: 'E' },
    r10c8: { id: 'r10c8', correctLetter: 'L' }, r10c9: { id: 'r10c9', correctLetter: 'L' },
    r10c10: { id: 'r10c10', correctLetter: 'A' }, r10c11: { id: 'r10c11', correctLetter: 'T' },
    r10c12: { id: 'r10c12', correctLetter: 'I' }, r10c13: { id: 'r10c13', correctLetter: 'O' },
    r10c14: { id: 'r10c14', correctLetter: 'N' }, r10c16: { id: 'r10c16', correctLetter: 'U' },
    r11c2: { id: 'r11c2', correctLetter: 'O' }, r11c4: { id: 'r11c4', correctLetter: 'E' },
    r11c8: { id: 'r11c8', correctLetter: 'E' }, r11c11: { id: 'r11c11', correctLetter: 'E' },
    r11c14: { id: 'r11c14', correctLetter: 'E' }, r11c16: { id: 'r11c16', correctLetter: 'T' },
    r12c2: { id: 'r12c2', correctLetter: 'S' }, r12c4: { id: 'r12c4', correctLetter: 'T' },
    r12c5: { id: 'r12c5', correctLetter: 'H' }, r12c6: { id: 'r12c6', correctLetter: 'R' },
    r12c7: { id: 'r12c7', correctLetter: 'U' }, r12c8: { id: 'r12c8', correctLetter: 'S' },
    r12c9: { id: 'r12c9', correctLetter: 'T' }, r12c10: { id: 'r12c10', correctLetter: 'E' },
    r12c11: { id: 'r12c11', correctLetter: 'R' }, r12c14: { id: 'r12c14', correctLetter: 'B' },
    r13c2: { id: 'r13c2', correctLetter: 'M' }, r13c6: { id: 'r13c6', correctLetter: 'O' },
    r13c8: { id: 'r13c8', correctLetter: 'C' }, r13c11: { id: 'r13c11', correctLetter: 'O' },
    r13c14: { id: 'r13c14', correctLetter: 'U' }, r13c15: { id: 'r13c15', correctLetter: 'F' },
    r13c16: { id: 'r13c16', correctLetter: 'O' },
    r14c1: { id: 'r14c1', correctLetter: 'C' }, r14c2: { id: 'r14c2', correctLetter: 'O' },
    r14c3: { id: 'r14c3', correctLetter: 'S' }, r14c4: { id: 'r14c4', correctLetter: 'M' },
    r14c5: { id: 'r14c5', correctLetter: 'I' }, r14c6: { id: 'r14c6', correctLetter: 'C' },
    r14c8: { id: 'r14c8', correctLetter: 'O' }, r14c9: { id: 'r14c9', correctLetter: 'R' },
    r14c10: { id: 'r14c10', correctLetter: 'B' }, r14c11: { id: 'r14c11', correctLetter: 'I' },
    r14c12: { id: 'r14c12', correctLetter: 'T' }, r14c13: { id: 'r14c13', correctLetter: 'A' },
    r14c14: { id: 'r14c14', correctLetter: 'L' },
    r15c2: { id: 'r15c2', correctLetter: 'S' }, r15c6: { id: 'r15c6', correctLetter: 'K' },
    r15c8: { id: 'r15c8', correctLetter: 'P' }, r15c11: { id: 'r15c11', correctLetter: 'D' },
    r15c14: { id: 'r15c14', correctLetter: 'A' },
    r16c5: { id: 'r16c5', correctLetter: 'M' }, r16c6: { id: 'r16c6', correctLetter: 'E' },
    r16c7: { id: 'r16c7', correctLetter: 'T' }, r16c8: { id: 'r16c8', correctLetter: 'E' },
    r16c9: { id: 'r16c9', correctLetter: 'O' }, r16c10: { id: 'r16c10', correctLetter: 'R' },
    r17c6: { id: 'r17c6', correctLetter: 'T' },
  },
  entries: [
    {
      id: 'blackhole',
      cellIds: ['r1c7', 'r1c8', 'r1c9', 'r1c10', 'r1c11', 'r1c12', 'r1c13', 'r1c14', 'r1c15'],
    },
    { id: 'saturn', cellIds: ['r2c1', 'r2c2', 'r2c3', 'r2c4', 'r2c5', 'r2c6'] },
    {
      id: 'universe',
      cellIds: ['r4c0', 'r4c1', 'r4c2', 'r4c3', 'r4c4', 'r4c5', 'r4c6', 'r4c7'],
    },
    { id: 'stars', cellIds: ['r4c12', 'r4c13', 'r4c14', 'r4c15', 'r4c16'] },
    { id: 'pluto', cellIds: ['r5c8', 'r5c9', 'r5c10', 'r5c11', 'r5c12'] },
    { id: 'lunar', cellIds: ['r6c12', 'r6c13', 'r6c14', 'r6c15', 'r6c16'] },
    {
      id: 'lightyear',
      cellIds: [
        'r8c4', 'r8c5', 'r8c6', 'r8c7', 'r8c8', 'r8c9', 'r8c10', 'r8c11', 'r8c12',
      ],
    },
    { id: 'sun', cellIds: ['r8c14', 'r8c15', 'r8c16'] },
    {
      id: 'constellation',
      cellIds: [
        'r10c2', 'r10c3', 'r10c4', 'r10c5', 'r10c6', 'r10c7', 'r10c8',
        'r10c9', 'r10c10', 'r10c11', 'r10c12', 'r10c13', 'r10c14',
      ],
    },
    {
      id: 'thruster',
      cellIds: [
        'r12c4', 'r12c5', 'r12c6', 'r12c7', 'r12c8', 'r12c9', 'r12c10', 'r12c11',
      ],
    },
    { id: 'ufo', cellIds: ['r13c14', 'r13c15', 'r13c16'] },
    {
      id: 'cosmic',
      cellIds: ['r14c1', 'r14c2', 'r14c3', 'r14c4', 'r14c5', 'r14c6'],
    },
    {
      id: 'orbital',
      cellIds: [
        'r14c8', 'r14c9', 'r14c10', 'r14c11', 'r14c12', 'r14c13', 'r14c14',
      ],
    },
    { id: 'meteor', cellIds: ['r16c5', 'r16c6', 'r16c7', 'r16c8', 'r16c9', 'r16c10'] },
    // Down entries. "rasa" is just an incidental crossing from the grid
    // geometry rather than a dictionary word, same as some short crossings
    // in the Dogs puzzle — the game never surfaces entry ids to the
    // player, only the filled letters.
    { id: 'alien', cellIds: ['r2c2', 'r3c2', 'r4c2', 'r5c2', 'r6c2'] },
    {
      id: 'cosmos',
      cellIds: ['r10c2', 'r11c2', 'r12c2', 'r13c2', 'r14c2', 'r15c2'],
    },
    {
      id: 'exoplanet',
      cellIds: [
        'r4c4', 'r5c4', 'r6c4', 'r7c4', 'r8c4', 'r9c4', 'r10c4', 'r11c4', 'r12c4',
      ],
    },
    { id: 'rasa', cellIds: ['r2c6', 'r3c6', 'r4c6', 'r5c6'] },
    {
      id: 'rocket',
      cellIds: ['r12c6', 'r13c6', 'r14c6', 'r15c6', 'r16c6', 'r17c6'],
    },
    {
      id: 'telescope',
      cellIds: [
        'r8c8', 'r9c8', 'r10c8', 'r11c8', 'r12c8', 'r13c8', 'r14c8', 'r15c8', 'r16c8',
      ],
    },
    {
      id: 'galaxy',
      cellIds: ['r3c9', 'r4c9', 'r5c9', 'r6c9', 'r7c9', 'r8c9'],
    },
    {
      id: 'asteroid',
      cellIds: [
        'r8c11', 'r9c11', 'r10c11', 'r11c11', 'r12c11', 'r13c11', 'r14c11', 'r15c11',
      ],
    },
    { id: 'solar', cellIds: ['r4c12', 'r5c12', 'r6c12', 'r7c12', 'r8c12'] },
    { id: 'comet', cellIds: ['r0c13', 'r1c13', 'r2c13', 'r3c13', 'r4c13'] },
    {
      id: 'nebula',
      cellIds: ['r10c14', 'r11c14', 'r12c14', 'r13c14', 'r14c14', 'r15c14'],
    },
    {
      id: 'astronaut',
      cellIds: [
        'r3c16', 'r4c16', 'r5c16', 'r6c16', 'r7c16', 'r8c16', 'r9c16', 'r10c16', 'r11c16',
      ],
    },
  ],
}
