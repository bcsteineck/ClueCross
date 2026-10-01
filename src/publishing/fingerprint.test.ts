import { describe, expect, it } from 'vitest'
import type { PuzzleDefinition } from '../core/types'
import type { LayoutDefinition } from '../layout/types'
import {
  FINGERPRINT_VERSION,
  canonicalPuzzleContentV1,
  canonicalPuzzleJsonV1,
  computeFingerprintV1,
  sha256Hex,
} from './fingerprint'
import type { PublishedPuzzle } from './types'

// CAT across crossing TIE down at the T.
function fixture(): { puzzle: PuzzleDefinition; layout: LayoutDefinition } {
  return {
    puzzle: {
      id: 'cats',
      clue: 'Cats',
      unlockBudget: 2000,
      cells: {
        r0c0: { id: 'r0c0', correctLetter: 'C' },
        r0c1: { id: 'r0c1', correctLetter: 'A' },
        r0c2: { id: 'r0c2', correctLetter: 'T' },
        r1c2: { id: 'r1c2', correctLetter: 'I' },
        r2c2: { id: 'r2c2', correctLetter: 'E' },
      },
      entries: [
        { id: 'cat', cellIds: ['r0c0', 'r0c1', 'r0c2'] },
        { id: 'tie', cellIds: ['r0c2', 'r1c2', 'r2c2'] },
      ],
    },
    layout: {
      id: 'cats-grid',
      puzzleId: 'cats',
      cellPositions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r1c2: { x: 2, y: 1 },
        r2c2: { x: 2, y: 2 },
      },
      navigationOrder: ['r0c0', 'r0c1', 'r0c2', 'r1c2', 'r2c2'],
    },
  }
}

// Golden values: the JSON is written out by hand from the contract, and
// its SHA-256 was computed independently with `shasum -a 256`.
const GOLDEN_JSON =
  '{"puzzle":{"id":"cats","clue":"Cats","unlockBudget":2000,"cells":[' +
  '{"id":"r0c0","correctLetter":"C"},{"id":"r0c1","correctLetter":"A"},{"id":"r0c2","correctLetter":"T"},' +
  '{"id":"r1c2","correctLetter":"I"},{"id":"r2c2","correctLetter":"E"}],"entries":[' +
  '{"id":"cat","cellIds":["r0c0","r0c1","r0c2"]},{"id":"tie","cellIds":["r0c2","r1c2","r2c2"]}]},' +
  '"layout":{"id":"cats-grid","puzzleId":"cats","cellPositions":[' +
  '{"cellId":"r0c0","x":0,"y":0},{"cellId":"r0c1","x":1,"y":0},{"cellId":"r0c2","x":2,"y":0},' +
  '{"cellId":"r1c2","x":2,"y":1},{"cellId":"r2c2","x":2,"y":2}],' +
  '"navigationOrder":["r0c0","r0c1","r0c2","r1c2","r2c2"]}}'
const GOLDEN_FINGERPRINT = 'e42366c7c72abdfba7e7b9aba2c97b754878d28a6dee2f81440d1d88121748a3'

async function fingerprintOf(edit: (pair: ReturnType<typeof fixture>) => void): Promise<string> {
  const pair = fixture()
  edit(pair)
  return computeFingerprintV1(pair.puzzle, pair.layout)
}

describe('SHA-256 hex', () => {
  it('matches standard test vectors as lowercase 64-character hex', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hashes UTF-8 bytes of non-ASCII text', async () => {
    // Independently computed with shasum -a 256.
    expect(await sha256Hex('Café “quote” 🧩')).toBe('4abcdae4ee43980cb446bc765582ae358fdf8ce10b00cce03c16786121de74e4')
  })
})

describe('canonical content v1', () => {
  it('produces the exact contract JSON and golden fingerprint', async () => {
    const { puzzle, layout } = fixture()
    expect(canonicalPuzzleJsonV1(puzzle, layout)).toBe(GOLDEN_JSON)
    expect(await computeFingerprintV1(puzzle, layout)).toBe(GOLDEN_FINGERPRINT)
    expect(FINGERPRINT_VERSION).toBe(1)
  })

  it('uses the contract property order regardless of input key order', () => {
    const { puzzle, layout } = fixture()
    const shuffledPuzzle = { entries: puzzle.entries, cells: puzzle.cells, unlockBudget: 2000, clue: 'Cats', id: 'cats' }
    const shuffledLayout = {
      navigationOrder: layout.navigationOrder,
      cellPositions: layout.cellPositions,
      puzzleId: 'cats',
      id: 'cats-grid',
    }
    expect(canonicalPuzzleJsonV1(shuffledPuzzle, shuffledLayout)).toBe(GOLDEN_JSON)
    const canonical = canonicalPuzzleContentV1(puzzle, layout)
    expect(Object.keys(canonical)).toEqual(['puzzle', 'layout'])
    expect(Object.keys(canonical.puzzle)).toEqual(['id', 'clue', 'unlockBudget', 'cells', 'entries'])
    expect(Object.keys(canonical.layout)).toEqual(['id', 'puzzleId', 'cellPositions', 'navigationOrder'])
    expect(Object.keys(canonical.puzzle.cells[0])).toEqual(['id', 'correctLetter'])
    expect(Object.keys(canonical.layout.cellPositions[0])).toEqual(['cellId', 'x', 'y'])
  })

  it('sorts cells, entries, and cell positions by code unit, not numerically or by locale', () => {
    const canonical = canonicalPuzzleContentV1(
      {
        id: 'p',
        clue: 'c',
        unlockBudget: 0,
        cells: { r2c0: { id: 'r2c0', correctLetter: 'A' }, r10c0: { id: 'r10c0', correctLetter: 'B' } },
        entries: [
          { id: 'b', cellIds: [] },
          { id: 'a', cellIds: [] },
          { id: 'B', cellIds: [] },
        ],
      },
      { id: 'g', puzzleId: 'p', cellPositions: { r2c0: { x: 0, y: 2 }, r10c0: { x: 0, y: 10 } }, navigationOrder: [] },
    )
    expect(canonical.puzzle.cells.map((cell) => cell.id)).toEqual(['r10c0', 'r2c0'])
    expect(canonical.puzzle.entries.map((entry) => entry.id)).toEqual(['B', 'a', 'b'])
    expect(canonical.layout.cellPositions.map((position) => position.cellId)).toEqual(['r10c0', 'r2c0'])
  })

  it('does not change the inputs', () => {
    const pair = fixture()
    const before = JSON.stringify(pair)
    canonicalPuzzleJsonV1(pair.puzzle, pair.layout)
    expect(JSON.stringify(pair)).toBe(before)
  })
})

describe('fingerprint v1: ordering', () => {
  it('ignores the order of cells, entries, and cell positions, which the contract sorts', async () => {
    const reordered = await fingerprintOf(({ puzzle, layout }) => {
      puzzle.cells = Object.fromEntries(Object.entries(puzzle.cells).reverse())
      puzzle.entries = [...puzzle.entries].reverse()
      layout.cellPositions = Object.fromEntries(Object.entries(layout.cellPositions).reverse())
    })
    expect(reordered).toBe(GOLDEN_FINGERPRINT)
  })

  it('preserves entry cellIds order', async () => {
    const reversed = await fingerprintOf(({ puzzle }) => {
      puzzle.entries[0].cellIds = [...puzzle.entries[0].cellIds].reverse()
    })
    expect(reversed).not.toBe(GOLDEN_FINGERPRINT)
  })

  it('preserves navigationOrder', async () => {
    const swapped = await fingerprintOf(({ layout }) => {
      layout.navigationOrder = ['r0c1', 'r0c0', 'r0c2', 'r1c2', 'r2c2']
    })
    expect(swapped).not.toBe(GOLDEN_FINGERPRINT)
  })
})

describe('fingerprint v1: included fields', () => {
  const edits: [string, (pair: ReturnType<typeof fixture>) => void][] = [
    ['puzzle.id', ({ puzzle }) => (puzzle.id = 'kats')],
    ['puzzle.clue', ({ puzzle }) => (puzzle.clue = 'Cats!')],
    ['puzzle.clue whitespace (never normalized)', ({ puzzle }) => (puzzle.clue = 'Cats ')],
    ['puzzle.clue case (never normalized)', ({ puzzle }) => (puzzle.clue = 'cats')],
    ['puzzle.unlockBudget', ({ puzzle }) => (puzzle.unlockBudget = 1999)],
    ['cell.correctLetter', ({ puzzle }) => (puzzle.cells.r0c0 = { id: 'r0c0', correctLetter: 'B' })],
    ['cell.id', ({ puzzle }) => (puzzle.cells.r0c0 = { id: 'r0c9', correctLetter: 'C' })],
    ['entry.id', ({ puzzle }) => (puzzle.entries[0].id = 'cot')],
    ['entry.cellIds', ({ puzzle }) => (puzzle.entries[0].cellIds = ['r0c0', 'r0c1'])],
    ['layout.id', ({ layout }) => (layout.id = 'cats-layout')],
    ['layout.puzzleId', ({ layout }) => (layout.puzzleId = 'kats')],
    ['position.x', ({ layout }) => (layout.cellPositions.r2c2 = { x: 3, y: 2 })],
    ['position.y', ({ layout }) => (layout.cellPositions.r2c2 = { x: 2, y: 3 })],
    ['position cellId', ({ layout }) => {
      layout.cellPositions = { ...layout.cellPositions, r9c9: layout.cellPositions.r2c2 }
      delete layout.cellPositions.r2c2
    }],
    ['navigationOrder contents', ({ layout }) => (layout.navigationOrder = layout.navigationOrder.slice(1))],
  ]

  for (const [name, edit] of edits) {
    it(`changes when ${name} changes`, async () => {
      const changed = await fingerprintOf(edit)
      expect(changed).toMatch(/^[0-9a-f]{64}$/)
      expect(changed).not.toBe(GOLDEN_FINGERPRINT)
    })
  }
})

describe('fingerprint v1: excluded data', () => {
  it('ignores publication metadata', async () => {
    const records: PublishedPuzzle[] = [
      { publishDate: '2026-10-01', createdAt: '2026-09-30T12:00:00.000Z' },
      { publishDate: '2027-05-09', createdAt: '2027-05-01T08:30:00.000Z' },
    ].map((metadata) => ({
      ...fixture(),
      ...metadata,
      puzzleId: 'cats',
      contentFingerprint: 'not-an-input',
      fingerprintVersion: 1,
    }))
    for (const record of records) {
      expect(await computeFingerprintV1(record.puzzle, record.layout)).toBe(GOLDEN_FINGERPRINT)
    }
  })

  it('ignores properties outside the contract, such as Workshop or generator metadata', async () => {
    const withExtras = await fingerprintOf((pair) => {
      Object.assign(pair.puzzle, { status: 'scheduled', difficulty: 'hard', seed: 'workshop-generation-1' })
      Object.assign(pair.puzzle.cells.r0c0, { revealed: true })
      Object.assign(pair.puzzle.entries[0], { direction: 'across', rationale: 'A pet.' })
      Object.assign(pair.layout, { metrics: { density: 0.5 }, source: 'export const catsPuzzle = …' })
      Object.assign(pair.layout.cellPositions.r0c0, { z: 1 })
    })
    expect(withExtras).toBe(GOLDEN_FINGERPRINT)
  })

  it('is deterministic across repeated computation', async () => {
    const { puzzle, layout } = fixture()
    const results = await Promise.all([1, 2, 3].map(() => computeFingerprintV1(puzzle, layout)))
    expect(new Set(results)).toEqual(new Set([GOLDEN_FINGERPRINT]))
  })
})
