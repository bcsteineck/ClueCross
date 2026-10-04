import { beforeAll, describe, expect, it } from 'vitest'
import { buildPuzzle } from '../../../tools/generator/src/assemble/buildPuzzle.js'
import { DOGS_CANDIDATE_POOL } from '../../../tools/generator/src/pool/dogsCandidatePool.js'
import type { PoolCandidate } from '../../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { ConstructionSuccess, PlacedAnswer } from '../../../tools/generator/src/types.js'
import { DEFAULT_REVEAL_BUDGET } from '../../../src/core/letterCosts'
import type { PuzzleDefinition } from '../../../src/core/types'
import { validatePuzzleDefinition } from '../../../src/core/validatePuzzleDefinition'
import type { LayoutDefinition } from '../../../src/layout/types'
import { generateBatch } from '../generateBatch'
import { parsePool } from '../parsePool'
import {
  RESERVED_PUZZLE_IDS,
  prepareFinalPuzzle,
  suggestPuzzleId,
  validateExportStructure,
  validateFinalPuzzleMetadata,
} from './finalPuzzle'

// Builds a ConstructionSuccess from placed answers, the same r{y}c{x}
// cell ids and normalized positions the generator produces.
function construct(placedAnswers: PlacedAnswer[]): ConstructionSuccess {
  const cells: Record<string, string> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  for (const answer of placedAnswers) {
    for (let i = 0; i < answer.word.length; i++) {
      const x = answer.direction === 'across' ? answer.start.x + i : answer.start.x
      const y = answer.direction === 'across' ? answer.start.y : answer.start.y + i
      cells[`r${y}c${x}`] = answer.word[i]
      positions[`r${y}c${x}`] = { x, y }
    }
  }
  const xs = Object.values(positions).map((p) => p.x)
  const ys = Object.values(positions).map((p) => p.y)
  return {
    ok: true,
    placedAnswers,
    cells,
    positions,
    width: Math.max(...xs) + 1,
    height: Math.max(...ys) + 1,
    attemptsUsed: 1,
  }
}

// CAT across crossing TIE down at the T: valid under every rule.
const crossing = () =>
  construct([
    { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
    { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
  ])

const inputs = { id: 'cats', clue: 'Cats' }

function assembled(): { puzzle: PuzzleDefinition; layout: LayoutDefinition } {
  const result = buildPuzzle({ construction: crossing(), id: 'cats', clue: 'Cats', unlockBudget: DEFAULT_REVEAL_BUDGET })
  if (!result.ok) throw new Error(result.reason)
  return { puzzle: result.puzzle, layout: result.layout }
}

let generated: PoolCandidate

beforeAll(() => {
  const result = generateBatch('Dogs', parsePool(DOGS_CANDIDATE_POOL.join('\n')), 1)
  if (!result.ok || result.batch.candidates.length === 0) throw new Error('expected generated candidates')
  generated = result.batch.candidates[0]
})

describe('Final Puzzle assembly', () => {
  it('assembles a generated candidate through buildPuzzle into a production-valid, export-ready pair', () => {
    const result = prepareFinalPuzzle(generated.construction, { id: 'workshopdogs', clue: '  Dogs  ' })
    expect(result).toMatchObject({ ready: true, metadataErrors: [], productionErrors: [], exportErrors: [] })
    const { puzzle, layout } = result
    if (!puzzle || !layout) throw new Error('expected an assembled pair')
    expect(validatePuzzleDefinition(puzzle, layout)).toEqual({ valid: true, errors: [] })
    expect(puzzle.id).toBe('workshopdogs')
    expect(puzzle.clue).toBe('Dogs')
    expect(puzzle.unlockBudget).toBe(DEFAULT_REVEAL_BUDGET)
    expect(layout.id).toBe('workshopdogs-grid')
    expect(layout.puzzleId).toBe('workshopdogs')
    expect(puzzle.entries.map((entry) => entry.id).sort()).toEqual(
      generated.construction.placedAnswers.map((answer) => answer.word.toLowerCase()).sort(),
    )
  })

  it('produces a deterministic row-major navigation order', () => {
    const first = prepareFinalPuzzle(generated.construction, inputs).layout!
    const second = prepareFinalPuzzle(generated.construction, inputs).layout!
    expect(second.navigationOrder).toEqual(first.navigationOrder)
    const rowMajor = [...first.navigationOrder].sort(
      (a, b) =>
        first.cellPositions[a].y - first.cellPositions[b].y || first.cellPositions[a].x - first.cellPositions[b].x,
    )
    expect(first.navigationOrder).toEqual(rowMajor)
  })

  it('assembles the hand-built fixture exactly', () => {
    const { puzzle, layout } = prepareFinalPuzzle(crossing(), inputs)
    expect(puzzle?.entries).toEqual([
      { id: 'cat', cellIds: ['r0c0', 'r0c1', 'r0c2'] },
      { id: 'tie', cellIds: ['r0c2', 'r1c2', 'r2c2'] },
    ])
    expect(layout?.navigationOrder).toEqual(['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'])
  })
})

describe('Final Puzzle metadata validation', () => {
  it('keeps the legacy development and fixture ids reserved', () => {
    expect([...RESERVED_PUZZLE_IDS].sort()).toEqual(['dogs', 'flower', 'fruit', 'magic', 'sample', 'space'])
  })

  it('requires an id and a non-blank clue', () => {
    expect(validateFinalPuzzleMetadata({ id: '  ', clue: '   ' })).toEqual([
      { field: 'id', message: 'Puzzle ID is required.' },
      { field: 'clue', message: 'Clue is required.' },
    ])
  })

  it('rejects malformed ids', () => {
    for (const id of ['Dogs', 'ice-cream', '2dogs', 'dogs!', 'ice cream', 'café']) {
      expect(validateFinalPuzzleMetadata({ id, clue: 'x' }), id).toEqual([
        { field: 'id', message: 'Puzzle ID must use only lowercase letters a–z and digits, starting with a letter.' },
      ])
    }
    expect(validateFinalPuzzleMetadata({ id: ' desserts2 ', clue: 'x' })).toEqual([])
  })

  it('rejects reserved ids without renaming them', () => {
    for (const id of RESERVED_PUZZLE_IDS) {
      expect(validateFinalPuzzleMetadata({ id, clue: 'x' }), id).toEqual([
        { field: 'id', message: `Puzzle ID “${id}” is reserved (a legacy development puzzle or test fixture) and can’t be used.` },
      ])
    }
    expect(validateFinalPuzzleMetadata({ id: 'custom', clue: 'x' }, ['custom'])).toHaveLength(1)
    expect(prepareFinalPuzzle(crossing(), { id: 'sample', clue: 'Sample' }).ready).toBe(false)
  })

  it('blocks export on metadata errors while still reporting the assembled pair', () => {
    const result = prepareFinalPuzzle(crossing(), { id: 'dogs', clue: ' ' })
    expect(result.ready).toBe(false)
    expect(result.metadataErrors.map((issue) => issue.field)).toEqual(['id', 'clue'])
    expect(result.productionErrors).toEqual([])
    expect(result.exportErrors).toEqual([])
    expect(result.puzzle).toBeDefined()
  })

  it('reserves the id of every puzzle fixture module', () => {
    // Keys only (lazy glob): nothing is loaded.
    const stems = Object.keys(import.meta.glob('/src/testing/fixtures/*Puzzle.ts')).map(
      (path) => path.match(/\/(\w+)Puzzle\.ts$/)![1],
    )
    expect(stems.sort()).toEqual(['dogs', 'flower', 'sample', 'space'])
    expect(stems.filter((stem) => !RESERVED_PUZZLE_IDS.includes(stem))).toEqual([])
  })

  it('suggests an editable id from the clue', () => {
    expect(suggestPuzzleId('Ice Cream!')).toBe('icecream')
    expect(suggestPuzzleId('7 Wonders')).toBe('wonders')
    expect(suggestPuzzleId('')).toBe('')
  })
})

describe('Final Puzzle export validation', () => {
  it('passes a valid pair', () => {
    const { puzzle, layout } = assembled()
    expect(validateExportStructure(puzzle, layout)).toEqual([])
  })

  it('rejects letters that are not a single uppercase A–Z character', () => {
    const { puzzle, layout } = assembled()
    puzzle.cells.r0c0 = { id: 'r0c0', correctLetter: 'c' }
    puzzle.cells.r0c1 = { id: 'r0c1', correctLetter: 'ÄB' }
    expect(validateExportStructure(puzzle, layout)).toEqual([
      'Cell r0c0 has letter “c”; every letter must be one uppercase A–Z character.',
      'Cell r0c1 has letter “ÄB”; every letter must be one uppercase A–Z character.',
    ])
  })

  it('rejects two cells in the same position', () => {
    const { puzzle, layout } = assembled()
    layout.cellPositions.r2c2 = { x: 2, y: 1 }
    expect(validateExportStructure(puzzle, layout)).toContain('Cells r1c2, r2c2 occupy the same position (2,1).')
  })

  it('rejects negative or fractional coordinates', () => {
    const { puzzle, layout } = assembled()
    layout.cellPositions.r0c0 = { x: -1, y: 0 }
    layout.cellPositions.r0c1 = { x: 0.5, y: 0 }
    expect(validateExportStructure(puzzle, layout)).toEqual([
      'Cell r0c0 is at (-1, 0); coordinates must be non-negative integers.',
      'Cell r0c1 is at (0.5, 0); coordinates must be non-negative integers.',
    ])
  })

  it('rejects a board whose origin is not 0, 0', () => {
    const { puzzle, layout } = assembled()
    for (const position of Object.values(layout.cellPositions)) position.y += 1
    expect(validateExportStructure(puzzle, layout)).toEqual([
      'The board must start at column 0 and row 0 (it starts at column 0, row 1).',
    ])
  })

  it('rejects a board wider or taller than 20', () => {
    const { puzzle, layout } = assembled()
    // Stretch TIE down so the board is 3 × 21, keeping it contiguous.
    for (let y = 3; y <= 20; y++) {
      puzzle.cells[`r${y}c2`] = { id: `r${y}c2`, correctLetter: 'E' }
      layout.cellPositions[`r${y}c2`] = { x: 2, y }
      puzzle.entries[1].cellIds.push(`r${y}c2`)
    }
    expect(validateExportStructure(puzzle, layout)).toEqual(['The board is 3 × 21; the maximum is 20 × 20.'])
  })

  it('rejects a cell that belongs to no answer', () => {
    const { puzzle, layout } = assembled()
    puzzle.entries[1].cellIds = ['r0c2', 'r1c2']
    expect(validateExportStructure(puzzle, layout)).toEqual(['Cells r2c2 are not part of any answer.'])
  })

  it('rejects an answer with gaps', () => {
    const { puzzle, layout } = assembled()
    puzzle.entries[1].cellIds = ['r0c2', 'r2c2']
    const errors = validateExportStructure(puzzle, layout)
    expect(errors).toContain('Answer “tie” has gaps; its cells must be contiguous.')
  })

  it('rejects a disconnected construction', () => {
    const disconnected = construct([
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'DOG', direction: 'across', start: { x: 0, y: 2 } },
    ])
    const result = prepareFinalPuzzle(disconnected, inputs)
    expect(result.ready).toBe(false)
    expect(result.productionErrors).toEqual([])
    expect(result.exportErrors).toEqual([
      'The board is not connected: every cell must be reachable from every other through its answers.',
    ])
  })

  it('rejects incidental derived entries (the generator geometry invariant)', () => {
    // CAT stacked on CAR: three incidental 2-letter down runs. The legacy
    // production validator accepts the result; export validation must not.
    const stacked = construct([
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'CAR', direction: 'across', start: { x: 0, y: 1 } },
    ])
    const result = prepareFinalPuzzle(stacked, inputs)
    expect(result.productionErrors).toEqual([])
    expect(result.ready).toBe(false)
    expect(result.exportErrors).toEqual([
      'Geometry invariant violated: derived entries must equal authored answers ' +
        '(incidental runs: down CC, down AA, down TR; unmatched answers: none).',
    ])
  })

  it('reports an unassemblable construction without throwing', () => {
    // CAT and DOG end to end on one row merge into one run, so neither
    // authored answer can be recovered.
    const merged = construct([
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'DOG', direction: 'across', start: { x: 3, y: 0 } },
    ])
    const result = prepareFinalPuzzle(merged, inputs)
    expect(result.ready).toBe(false)
    expect(result.puzzle).toBeUndefined()
    expect(result.exportErrors.some((error) => error.startsWith('The puzzle could not be assembled.'))).toBe(true)
  })
})
