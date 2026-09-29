import { describe, expect, it } from 'vitest'
import { canonicalSignature, signatureUnderTransform, SYMMETRY_TRANSFORMS } from './canonicalize'
import { buildCellAt } from '../derive/derivePlayableEntries'
import type { CellId, PlacedAnswer, Position } from '../types'

// Every equivalence asserted below was independently verified against
// this exact implementation before being written down here (this module
// involves genuinely error-prone coordinate arithmetic — see the git
// history / Phase 4 checkpoint report for the by-hand mistakes that
// process caught before they became wrong test fixtures).

describe('canonicalSignature: black-box equivalence between independently-valid constructions', () => {
  it('gives an identical construction the same signature as itself', () => {
    const answers: PlacedAnswer[] = [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ]
    const positions: Record<CellId, Position> = {
      c: { x: 0, y: 0 },
      a: { x: 1, y: 0 },
      t: { x: 2, y: 0 },
      i: { x: 2, y: 1 },
      e: { x: 2, y: 2 },
    }
    expect(canonicalSignature(answers, positions)).toBe(canonicalSignature(answers, positions))
  })

  it('is translation-invariant', () => {
    const origin: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }]
    const originPos: Record<CellId, Position> = { c: { x: 0, y: 0 }, a: { x: 1, y: 0 }, t: { x: 2, y: 0 } }
    const shifted: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 5, y: 7 } }]
    const shiftedPos: Record<CellId, Position> = { c: { x: 5, y: 7 }, a: { x: 6, y: 7 }, t: { x: 7, y: 7 } }
    expect(canonicalSignature(origin, originPos)).toBe(canonicalSignature(shifted, shiftedPos))
  })

  it('detects 90-degree-family rotation equivalence (a down word vs. the same word placed across)', () => {
    // A DOWN word converts to an ascending ACROSS word under rotate90 (and
    // symmetrically for rotate270), so this is one of the six symmetries
    // constructible from two genuinely independent, real (forward-only)
    // PlacedAnswer fixtures — see the module comment in canonicalize.ts.
    const down: PlacedAnswer[] = [{ word: 'TIE', direction: 'down', start: { x: 0, y: 0 } }]
    const downPos: Record<CellId, Position> = { t: { x: 0, y: 0 }, i: { x: 0, y: 1 }, e: { x: 0, y: 2 } }
    const across: PlacedAnswer[] = [{ word: 'TIE', direction: 'across', start: { x: 0, y: 0 } }]
    const acrossPos: Record<CellId, Position> = { t: { x: 0, y: 0 }, i: { x: 1, y: 0 }, e: { x: 2, y: 0 } }
    expect(canonicalSignature(down, downPos)).toBe(canonicalSignature(across, acrossPos))
  })

  it('detects reflectHorizontal equivalence (two parallel down words with their left-right order swapped)', () => {
    const base: PlacedAnswer[] = [
      { word: 'TIE', direction: 'down', start: { x: 0, y: 0 } },
      { word: 'ARM', direction: 'down', start: { x: 3, y: 0 } },
    ]
    const basePos: Record<CellId, Position> = {
      t: { x: 0, y: 0 },
      i: { x: 0, y: 1 },
      e: { x: 0, y: 2 },
      a: { x: 3, y: 0 },
      r: { x: 3, y: 1 },
      m: { x: 3, y: 2 },
    }
    const mirrored: PlacedAnswer[] = [
      { word: 'ARM', direction: 'down', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 3, y: 0 } },
    ]
    const mirroredPos: Record<CellId, Position> = {
      a: { x: 0, y: 0 },
      r: { x: 0, y: 1 },
      m: { x: 0, y: 2 },
      t: { x: 3, y: 0 },
      i: { x: 3, y: 1 },
      e: { x: 3, y: 2 },
    }
    expect(canonicalSignature(base, basePos)).toBe(canonicalSignature(mirrored, mirroredPos))
  })

  it('detects reflectVertical equivalence (two parallel across words with their top-bottom order swapped)', () => {
    const base: PlacedAnswer[] = [
      { word: 'TIE', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'ARM', direction: 'across', start: { x: 0, y: 3 } },
    ]
    const basePos: Record<CellId, Position> = {
      t: { x: 0, y: 0 },
      i: { x: 1, y: 0 },
      e: { x: 2, y: 0 },
      a: { x: 0, y: 3 },
      r: { x: 1, y: 3 },
      m: { x: 2, y: 3 },
    }
    const mirrored: PlacedAnswer[] = [
      { word: 'ARM', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'across', start: { x: 0, y: 3 } },
    ]
    const mirroredPos: Record<CellId, Position> = {
      a: { x: 0, y: 0 },
      r: { x: 1, y: 0 },
      m: { x: 2, y: 0 },
      t: { x: 0, y: 3 },
      i: { x: 1, y: 3 },
      e: { x: 2, y: 3 },
    }
    expect(canonicalSignature(base, basePos)).toBe(canonicalSignature(mirrored, mirroredPos))
  })

  it('detects reflectMainDiagonal equivalence for a crossing fixture (both words swap orientation)', () => {
    // reflectMainDiagonal is the one non-identity transform that preserves
    // forward-readability for BOTH across and down words simultaneously,
    // so it's the cleanest multi-answer (crossing) equivalence to test
    // this way.
    const base: PlacedAnswer[] = [
      { word: 'TIE', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'ION', direction: 'down', start: { x: 1, y: 0 } },
    ]
    const basePos: Record<CellId, Position> = {
      t: { x: 0, y: 0 },
      i: { x: 1, y: 0 },
      e: { x: 2, y: 0 },
      o: { x: 1, y: 1 },
      n: { x: 1, y: 2 },
    }
    const diagonal: PlacedAnswer[] = [
      { word: 'TIE', direction: 'down', start: { x: 0, y: 0 } },
      { word: 'ION', direction: 'across', start: { x: 0, y: 1 } },
    ]
    const diagonalPos: Record<CellId, Position> = {
      t: { x: 0, y: 0 },
      i: { x: 0, y: 1 },
      e: { x: 0, y: 2 },
      o: { x: 1, y: 1 },
      n: { x: 2, y: 1 },
    }
    expect(canonicalSignature(base, basePos)).toBe(canonicalSignature(diagonal, diagonalPos))
  })

  it('canonicalizes a rectangular (non-square) bounding box correctly under rotation', () => {
    // A 4-letter word: once wide (4x1), once tall (1x4) — the same word
    // rotated 90 degrees. Confirms width/height swap correctly rather
    // than either shape being compared against a square assumption.
    const wide: PlacedAnswer[] = [{ word: 'SEAT', direction: 'across', start: { x: 0, y: 0 } }]
    const widePos: Record<CellId, Position> = {
      s: { x: 0, y: 0 },
      e: { x: 1, y: 0 },
      a: { x: 2, y: 0 },
      t: { x: 3, y: 0 },
    }
    const tall: PlacedAnswer[] = [{ word: 'SEAT', direction: 'down', start: { x: 0, y: 0 } }]
    const tallPos: Record<CellId, Position> = {
      s: { x: 0, y: 0 },
      e: { x: 0, y: 1 },
      a: { x: 0, y: 2 },
      t: { x: 0, y: 3 },
    }
    expect(canonicalSignature(wide, widePos)).toBe(canonicalSignature(tall, tallPos))
  })

  it('gives genuinely different authored answers different signatures', () => {
    const cat: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }]
    const catPos: Record<CellId, Position> = { c: { x: 0, y: 0 }, a: { x: 1, y: 0 }, t: { x: 2, y: 0 } }
    const dog: PlacedAnswer[] = [{ word: 'DOG', direction: 'across', start: { x: 0, y: 0 } }]
    const dogPos: Record<CellId, Position> = { d: { x: 0, y: 0 }, o: { x: 1, y: 0 }, g: { x: 2, y: 0 } }
    expect(canonicalSignature(cat, catPos)).not.toBe(canonicalSignature(dog, dogPos))
  })

  it('gives the same occupied silhouette different signatures when authored-answer ownership differs', () => {
    // Both constructions occupy the exact same 2x2 block of 4 cells with
    // the exact same letters at each cell — but one splits it into two
    // ACROSS words (rows) and the other into two DOWN words (columns).
    // Deduplicating on occupied cells alone would wrongly conflate these.
    const rows: PlacedAnswer[] = [
      { word: 'AB', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'CD', direction: 'across', start: { x: 0, y: 1 } },
    ]
    const rowsPos: Record<CellId, Position> = {
      a: { x: 0, y: 0 },
      b: { x: 1, y: 0 },
      c: { x: 0, y: 1 },
      d: { x: 1, y: 1 },
    }
    const columns: PlacedAnswer[] = [
      { word: 'AC', direction: 'down', start: { x: 0, y: 0 } },
      { word: 'BD', direction: 'down', start: { x: 1, y: 0 } },
    ]
    const columnsPos: Record<CellId, Position> = {
      a: { x: 0, y: 0 },
      c: { x: 0, y: 1 },
      b: { x: 1, y: 0 },
      d: { x: 1, y: 1 },
    }
    expect(canonicalSignature(rows, rowsPos)).not.toBe(canonicalSignature(columns, columnsPos))
  })
})

describe('signatureUnderTransform: direct per-transform verification', () => {
  // rotate180 and reflectAntiDiagonal negate a word's own varying
  // coordinate, which reverses ANY 2+-letter word's forward reading order
  // (see canonicalize.ts's module comment) — so unlike the six symmetries
  // above, no pair of genuinely independent, real PlacedAnswer fixtures
  // can be constructed to test them via canonicalSignature's black-box
  // equivalence. They're verified directly here instead, against exact
  // values confirmed against this implementation.

  it('computes all 8 transforms correctly for a minimal 2-cell answer', () => {
    const answers: PlacedAnswer[] = [{ word: 'AB', direction: 'across', start: { x: 0, y: 0 } }]
    const positions: Record<CellId, Position> = { p0: { x: 0, y: 0 }, p1: { x: 1, y: 0 } }
    const cellAt = buildCellAt(positions)

    const byName = Object.fromEntries(
      SYMMETRY_TRANSFORMS.map(({ name, apply }) => [
        name,
        signatureUnderTransform(apply, answers, positions, cellAt),
      ]),
    )

    expect(byName).toEqual({
      identity: 'AB@0,0;1,0',
      rotate90: 'AB@0,1;0,0',
      rotate180: 'AB@1,0;0,0',
      rotate270: 'AB@0,0;0,1',
      reflectHorizontal: 'AB@1,0;0,0',
      reflectVertical: 'AB@0,0;1,0',
      reflectMainDiagonal: 'AB@0,0;0,1',
      reflectAntiDiagonal: 'AB@0,1;0,0',
    })
  })

  it('computes rotate180 correctly for a multi-answer crossing fixture', () => {
    const answers: PlacedAnswer[] = [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ]
    const positions: Record<CellId, Position> = {
      c: { x: 0, y: 0 },
      a: { x: 1, y: 0 },
      t: { x: 2, y: 0 },
      i: { x: 2, y: 1 },
      e: { x: 2, y: 2 },
    }
    const cellAt = buildCellAt(positions)
    const rotate180 = SYMMETRY_TRANSFORMS.find((t) => t.name === 'rotate180')
    if (!rotate180) throw new Error('rotate180 not found')

    expect(signatureUnderTransform(rotate180.apply, answers, positions, cellAt)).toBe(
      'CAT@2,2;1,2;0,2|TIE@0,2;0,1;0,0',
    )
  })

  it('computes reflectAntiDiagonal correctly for a multi-answer crossing fixture', () => {
    const answers: PlacedAnswer[] = [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ]
    const positions: Record<CellId, Position> = {
      c: { x: 0, y: 0 },
      a: { x: 1, y: 0 },
      t: { x: 2, y: 0 },
      i: { x: 2, y: 1 },
      e: { x: 2, y: 2 },
    }
    const cellAt = buildCellAt(positions)
    const antiDiagonal = SYMMETRY_TRANSFORMS.find((t) => t.name === 'reflectAntiDiagonal')
    if (!antiDiagonal) throw new Error('reflectAntiDiagonal not found')

    expect(signatureUnderTransform(antiDiagonal.apply, answers, positions, cellAt)).toBe(
      'CAT@2,2;2,1;2,0|TIE@2,0;1,0;0,0',
    )
  })

  it('canonicalSignature picks the lexicographically smallest of the 8 per-transform signatures', () => {
    const answers: PlacedAnswer[] = [{ word: 'AB', direction: 'across', start: { x: 0, y: 0 } }]
    const positions: Record<CellId, Position> = { p0: { x: 0, y: 0 }, p1: { x: 1, y: 0 } }
    const cellAt = buildCellAt(positions)
    const allSignatures = SYMMETRY_TRANSFORMS.map(({ apply }) =>
      signatureUnderTransform(apply, answers, positions, cellAt),
    )
    expect(canonicalSignature(answers, positions)).toBe(allSignatures.slice().sort()[0])
  })
})
