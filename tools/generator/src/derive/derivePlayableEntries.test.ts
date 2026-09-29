import { describe, expect, it } from 'vitest'
import {
  assertUniqueEntryIds,
  assignEntryIds,
  derivePlayableEntries,
} from './derivePlayableEntries'
import type { DerivedEntry } from './derivePlayableEntries'
import { constructFixedAnswerPuzzle } from '../placement/backtrack'
import type { CellId, PlacedAnswer, Position } from '../types'

function positionsFrom(cells: Record<CellId, [number, number]>): Record<CellId, Position> {
  const positions: Record<CellId, Position> = {}
  for (const [id, [x, y]] of Object.entries(cells)) {
    positions[id] = { x, y }
  }
  return positions
}

describe('derivePlayableEntries', () => {
  it('derives one across run for a horizontal-only occupied line', () => {
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0] })
    expect(derivePlayableEntries(positions)).toEqual([
      { direction: 'across', cellIds: ['a', 'b', 'c'] },
    ])
  })

  it('derives one down run for a vertical-only occupied line', () => {
    const positions = positionsFrom({ a: [0, 0], b: [0, 1], c: [0, 2] })
    expect(derivePlayableEntries(positions)).toEqual([
      { direction: 'down', cellIds: ['a', 'b', 'c'] },
    ])
  })

  it('derives both the across and down run through a crossing', () => {
    // a-b-c across at y=0; b-d-e down at x=1
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0], d: [1, 1], e: [1, 2] })
    const runs = derivePlayableEntries(positions)
    expect(runs).toContainEqual({ direction: 'across', cellIds: ['a', 'b', 'c'] })
    expect(runs).toContainEqual({ direction: 'down', cellIds: ['b', 'd', 'e'] })
    expect(runs).toHaveLength(2)
  })

  it('derives a maximal run through a full crossing intersection, not a partial one', () => {
    // Plus shape: across run through the middle row, down run through the
    // middle column, sharing the center cell.
    const positions = positionsFrom({
      a: [0, 1],
      b: [1, 1],
      c: [2, 1],
      d: [1, 0],
      e: [1, 2],
    })
    const runs = derivePlayableEntries(positions)
    expect(runs).toContainEqual({ direction: 'across', cellIds: ['a', 'b', 'c'] })
    expect(runs).toContainEqual({ direction: 'down', cellIds: ['d', 'b', 'e'] })
    expect(runs).toHaveLength(2)
  })

  it('splits a row with a gap into two separate maximal runs', () => {
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [3, 0], d: [4, 0] })
    const runs = derivePlayableEntries(positions)
    expect(runs).toContainEqual({ direction: 'across', cellIds: ['a', 'b'] })
    expect(runs).toContainEqual({ direction: 'across', cellIds: ['c', 'd'] })
    expect(runs).toHaveLength(2)
  })

  it('does not derive an entry for an isolated single occupied cell', () => {
    expect(derivePlayableEntries(positionsFrom({ a: [5, 5] }))).toEqual([])
  })

  it('does not derive an entry for cells that are only diagonally adjacent', () => {
    expect(derivePlayableEntries(positionsFrom({ a: [0, 0], b: [1, 1] }))).toEqual([])
  })

  it('derives an incidental run even though it was never an authored answer', () => {
    // Geometry-only: derivePlayableEntries has no notion of which cells
    // an authored answer produced, so any maximal 2+ run is derived, the
    // same way the production Space puzzle's incidental "rasa" run is.
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0] })
    expect(derivePlayableEntries(positions)).toEqual([
      { direction: 'across', cellIds: ['a', 'b', 'c', 'd'] },
    ])
  })
})

describe('assignEntryIds', () => {
  it('reuses the authored answer word, lowercased, as the id on an exact cell-span match', () => {
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0] })
    const runs = derivePlayableEntries(positions)
    const placedAnswers: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }]

    const result = assignEntryIds(runs, placedAnswers, positions)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toEqual([{ id: 'cat', direction: 'across', cellIds: ['a', 'b', 'c'] }])
  })

  it('matches by exact cell span, not by word text: a claimed span that is only a subset of the real run is not recognized', () => {
    // assignEntryIds never receives letters at all (only positions), so
    // it cannot match "by text" even in principle — this proves the only
    // thing that can make an authored answer recoverable is its claimed
    // span exactly equaling a derived run.
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0] })
    const runs = derivePlayableEntries(positions) // one 4-cell run: a,b,c,d
    const placedAnswers: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }] // claims only a,b,c

    const result = assignEntryIds(runs, placedAnswers, positions)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.unrecoverableAnswers).toEqual(placedAnswers)
  })

  it('requires every placed authored answer to be recoverable, reporting exactly the unrecoverable ones', () => {
    const positions = positionsFrom({
      a: [0, 0],
      b: [1, 0],
      c: [2, 0],
      d: [0, 2],
      e: [1, 2],
      f: [2, 2],
      g: [3, 2],
    })
    const runs = derivePlayableEntries(positions)
    const goodAnswer: PlacedAnswer = { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }
    // The real run at y=2 is 4 cells (d,e,f,g); this claims only 3 of them.
    const badAnswer: PlacedAnswer = { word: 'DOG', direction: 'across', start: { x: 0, y: 2 } }

    const result = assignEntryIds(runs, [goodAnswer, badAnswer], positions)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.unrecoverableAnswers).toEqual([badAnswer])
  })

  it('synthesizes a deterministic id for an incidental run with no authored answer', () => {
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0] })
    const runs = derivePlayableEntries(positions)

    const result = assignEntryIds(runs, [], positions)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries).toEqual([
      { id: 'across-r0-c0', direction: 'across', cellIds: ['a', 'b', 'c', 'd'] },
    ])
  })

  it('gives across and down synthesized ids starting at the same coordinate distinct ids', () => {
    const positions = positionsFrom({
      a: [0, 0],
      b: [1, 0],
      c: [2, 0], // across run starting at (0,0)
      d: [0, 1],
      e: [0, 2], // down run, also starting at (0,0)
    })
    const runs = derivePlayableEntries(positions)

    const result = assignEntryIds(runs, [], positions)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entries.map((entry) => entry.id).sort()).toEqual(['across-r0-c0', 'down-r0-c0'])
  })

  it('produces deterministic ids across repeated calls with the same input', () => {
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0] })
    const runs = derivePlayableEntries(positions)
    const first = assignEntryIds(runs, [], positions)
    const second = assignEntryIds(runs, [], positions)
    expect(first).toEqual(second)
  })

  it('assigns every derived run a final, unique id (authored ids and synthesized ids mixed)', () => {
    const positions = positionsFrom({
      a: [0, 0],
      b: [1, 0],
      c: [2, 0], // authored "CAT" across
      d: [1, 1],
      e: [1, 2], // incidental down run through b,d,e
    })
    const runs = derivePlayableEntries(positions)
    const placedAnswers: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }]

    const result = assignEntryIds(runs, placedAnswers, positions)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('cat')
    expect(ids).toContain('down-r0-c1')
  })

  it('treats two different authored answers resolving to the same cell span as an internal invariant violation', () => {
    // Hand-constructed conflict: Phase 1's same-direction-overlap rule
    // prevents real search output from ever producing two distinct
    // answers with an identical span, so this can only arise from a
    // caller passing malformed input directly.
    const positions = positionsFrom({ a: [0, 0], b: [1, 0], c: [2, 0] })
    const runs = derivePlayableEntries(positions)
    const placedAnswers: PlacedAnswer[] = [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'COW', direction: 'across', start: { x: 0, y: 0 } },
    ]

    expect(() => assignEntryIds(runs, placedAnswers, positions)).toThrow(/internal error/i)
  })
})

describe('assertUniqueEntryIds', () => {
  // Given the id scheme (authored ids are letters-only; synthesized ids
  // always contain a digit; across/down synthesized ids differ by their
  // direction prefix), a collision can't arise through assignEntryIds'
  // own public contract — this tests the defensive guard itself directly,
  // the same way Phase 1 tested individual placement rules that are hard
  // to trigger through full search.
  it('passes silently when every id is unique', () => {
    const entries: DerivedEntry[] = [
      { id: 'cat', direction: 'across', cellIds: ['a', 'b', 'c'] },
      { id: 'down-r0-c0', direction: 'down', cellIds: ['a', 'd', 'e'] },
    ]
    expect(() => assertUniqueEntryIds(entries)).not.toThrow()
  })

  it('throws on a duplicate id', () => {
    const entries: DerivedEntry[] = [
      { id: 'cat', direction: 'across', cellIds: ['a', 'b', 'c'] },
      { id: 'cat', direction: 'down', cellIds: ['a', 'd', 'e'] },
    ]
    expect(() => assertUniqueEntryIds(entries)).toThrow(/duplicate entry id/i)
  })
})

describe('authored-answer recovery regression: real Phase 1 constructions, many seeds', () => {
  // Regression coverage for the CORGI/BARK-class authored-run-extension
  // bug (see the checkpoint report): before the Phase 1 fix, a real
  // (unmodified) constructFixedAnswerPuzzle output could contain an
  // authored answer that assignEntryIds could not recover. This sweeps
  // many real seeds across a few varied word lists — including the exact
  // dog-themed list that originally exposed the bug — and asserts
  // recovery succeeds for every one, rather than testing only the single
  // originally-discovered case.
  it('assignEntryIds succeeds for every successful construction across a representative multi-seed, multi-wordlist sweep', () => {
    const wordLists = [
      ['CAT', 'TIE', 'EAR', 'ART', 'RAT'],
      ['COLLIE', 'CORGI', 'LEASH', 'COLLAR', 'FETCH', 'BARK', 'TREAT', 'KENNEL'],
      ['BEAGLE', 'POODLE', 'PUPPY', 'PAWS', 'TAIL', 'BONE', 'VET'],
    ]

    let successCount = 0
    for (const answers of wordLists) {
      for (let seed = 0; seed < 20; seed++) {
        const result = constructFixedAnswerPuzzle({
          mode: 'fixed-answer',
          answers,
          maxWidth: 14,
          maxHeight: 14,
          seed,
          maxAttempts: 5000,
        })
        if (!result.ok) continue
        successCount += 1

        const runs = derivePlayableEntries(result.positions)
        const assignment = assignEntryIds(runs, result.placedAnswers, result.positions)
        expect(assignment.ok).toBe(true)
      }
    }

    // Sanity check: the sweep actually exercised real successful
    // constructions, not just failures that trivially "pass" recovery.
    expect(successCount).toBeGreaterThan(0)
  })
})
