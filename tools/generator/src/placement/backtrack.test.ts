import { describe, expect, it } from 'vitest'
import {
  answerBoundaryNeighbors,
  cellKey,
  checkGeometryInvariant,
  constructFixedAnswerPuzzle,
  createConstructionTelemetry,
  findCandidates,
  rankPlaceableWords,
  scoreRemainingWords,
  validateCandidate,
} from './backtrack'
import type { Bounds, ScoredWord, SearchState } from './backtrack'
import { derivePlayableEntries } from '../derive/derivePlayableEntries'
import { computeMetrics } from '../metrics/metrics'
import { createRng } from '../rng'
import type { ConstructionSuccess, GeneratorConfig, PlacedAnswer } from '../types'

const ROOMY: Pick<GeneratorConfig, 'maxWidth' | 'maxHeight'> = { maxWidth: 10, maxHeight: 10 }

// Small hand-built grid fixture: "CAT" placed across at (0,0)-(2,0), owned
// by answer index 0 in the across direction.
function catAcrossGrid(): Map<string, { letter: string; across?: number; down?: number }> {
  const grid = new Map<string, { letter: string; across?: number; down?: number }>()
  grid.set(cellKey(0, 0), { letter: 'C', across: 0 })
  grid.set(cellKey(1, 0), { letter: 'A', across: 0 })
  grid.set(cellKey(2, 0), { letter: 'T', across: 0 })
  return grid
}

function boundsOfCatAcross(): Bounds {
  return { minX: 0, maxX: 2, minY: 0, maxY: 0 }
}

describe('validateCandidate', () => {
  it('accepts a matching perpendicular crossing', () => {
    const grid = catAcrossGrid()
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'ART',
      { direction: 'down', start: { x: 1, y: 0 } },
      ROOMY,
      true,
      [],
    )
    expect(result).not.toBeNull()
  })

  it('rejects a mismatched-letter crossing', () => {
    const grid = catAcrossGrid()
    // ARTS placed down through x=2 would need (2,0) === 'A', but the
    // existing grid has 'T' there (from CAT).
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'ARTS',
      { direction: 'down', start: { x: 2, y: -1 } },
      ROOMY,
      true,
      [],
    )
    expect(result).toBeNull()
  })

  it('rejects a same-direction overlap even when every letter matches', () => {
    const grid = catAcrossGrid()
    // "AT" across, starting at (1,0), matches CAT's letters exactly at
    // every overlapping cell but is a second, distinct across answer
    // running through the same cells.
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'AT',
      { direction: 'across', start: { x: 1, y: 0 } },
      ROOMY,
      true,
      [],
    )
    expect(result).toBeNull()
  })

  it('rejects a same-direction authored-run extension end-to-end (the original CAT+RUG case)', () => {
    const grid = catAcrossGrid()
    // "RUG" across starting at (3,0) shares no cell with CAT, but sits
    // immediately after it on the same row — the derived-entry pass could
    // not tell this apart from one continuous 6-letter run.
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'RUG',
      { direction: 'across', start: { x: 3, y: 0 } },
      ROOMY,
      false,
      [],
    )
    expect(result).toBeNull()
  })

  it('rejects a candidate whose own start would be extended by an existing PERPENDICULAR answer (generalized: not just same-direction)', () => {
    const grid = catAcrossGrid()
    // "OWL" down starting at (0,1) sits directly below CAT's own first
    // cell (0,0) — CAT is across, OWL is down, so the old same-direction-
    // only check missed this, but the resulting column (0,0)-(0,3) would
    // still derive as one 4-cell run ("COWL"), extending OWL's own
    // 3-letter authored span by one cell it doesn't own. This is the
    // exact class of bug the CORGI/BARK Dogs-pool reproduction exposed.
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'OWL',
      { direction: 'down', start: { x: 0, y: 1 } },
      ROOMY,
      false,
      [],
    )
    expect(result).toBeNull()
  })

  it('rejects a candidate whose own end would be extended by an existing perpendicular answer', () => {
    // Existing "DOG" across at (0,3)-(2,3). Candidate "TIE" down at
    // (0,0)-(0,2) would end immediately above DOG's own start (0,3),
    // extending TIE's own 3-letter span into a 4-cell "TIED"-shaped run.
    const grid = new Map<string, { letter: string; across?: number; down?: number }>()
    grid.set(cellKey(0, 3), { letter: 'D', across: 0 })
    grid.set(cellKey(1, 3), { letter: 'O', across: 0 })
    grid.set(cellKey(2, 3), { letter: 'G', across: 0 })
    const bounds: Bounds = { minX: 0, maxX: 2, minY: 3, maxY: 3 }

    const result = validateCandidate(
      grid,
      bounds,
      'TIE',
      { direction: 'down', start: { x: 0, y: 0 } },
      ROOMY,
      false,
      [],
    )
    expect(result).toBeNull()
  })

  it('rejects a placement that would exceed the configured maximum width', () => {
    const grid = catAcrossGrid()
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'ART',
      { direction: 'down', start: { x: 1, y: 0 } },
      { maxWidth: 2, maxHeight: 10 },
      true,
      [],
    )
    expect(result).toBeNull()
  })

  it('requires a crossing with the existing grid unless explicitly seeding', () => {
    const grid = catAcrossGrid()
    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'DOG',
      { direction: 'across', start: { x: 0, y: 5 } },
      ROOMY,
      true,
      [],
    )
    expect(result).toBeNull()
  })
})

describe('validateCandidate: authored-run extension of an ALREADY-PLACED answer (the CORGI/BARK class of bug)', () => {
  // These reproduce the Phase 5 Dogs-experiment finding directly: a cell
  // that is completely legal as part of the CANDIDATE's own span can
  // still land exactly one cell beyond an existing answer's start/end
  // along THAT answer's own axis, extending its authored run even though
  // the candidate itself is never "self-extended" (see the module
  // comment above validateCandidate in backtrack.ts).

  it('rejects a new across answer whose own start cell sits immediately below an existing down answer\'s end (original orientation)', () => {
    // Existing CORGI down at (0,0)-(0,4): C,O,R,G,I. Candidate BARK
    // across starting at (0,5) — its own start is legal from BARK's own
    // perspective (nothing beside it), but (0,5) is exactly CORGI's own
    // "after" neighbor, so placing BARK there would extend CORGI's
    // 5-letter span into a 6-cell "CORGIB" run.
    const grid = new Map<string, { letter: string; across?: number; down?: number }>()
    const corgi = 'CORGI'
    for (let i = 0; i < corgi.length; i++) {
      grid.set(cellKey(0, i), { letter: corgi[i], down: 0 })
    }
    const bounds: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 4 }
    const placedAnswers: PlacedAnswer[] = [{ word: 'CORGI', direction: 'down', start: { x: 0, y: 0 } }]

    const result = validateCandidate(
      grid,
      bounds,
      'BARK',
      { direction: 'across', start: { x: 0, y: 5 } },
      ROOMY,
      false,
      placedAnswers,
    )
    expect(result).toBeNull()
  })

  it('rejects the inverse placement order: a new down answer whose own end sits immediately above an existing across answer\'s start', () => {
    // Existing BARK across at (0,5)-(3,5). Candidate CORGI down would end
    // at (0,4) — immediately above BARK's existing start (0,5) — which is
    // CORGI's own "after" neighbor, so this is caught by CORGI's own
    // self-extension check (part 1) rather than part 2, but proves the
    // reverse placement order is equally rejected.
    const grid = new Map<string, { letter: string; across?: number; down?: number }>()
    const bark = 'BARK'
    for (let i = 0; i < bark.length; i++) {
      grid.set(cellKey(i, 5), { letter: bark[i], across: 0 })
    }
    const bounds: Bounds = { minX: 0, maxX: 3, minY: 5, maxY: 5 }
    const placedAnswers: PlacedAnswer[] = [{ word: 'BARK', direction: 'across', start: { x: 0, y: 5 } }]

    const result = validateCandidate(
      grid,
      bounds,
      'CORGI',
      { direction: 'down', start: { x: 0, y: 0 } },
      ROOMY,
      false,
      placedAnswers,
    )
    expect(result).toBeNull()
  })

  it('rejects a 90-degree-rotated equivalent: a new down answer extending an existing across answer horizontally', () => {
    // Existing CORGI ACROSS at (0,0)-(4,0) (swapped from the earlier
    // tests' down orientation). Candidate BARK DOWN starting at (5,0) —
    // its own start is CORGI's own "after" neighbor along CORGI's across
    // axis. Proves the rule isn't hardcoded to "below a down answer".
    const grid = new Map<string, { letter: string; across?: number; down?: number }>()
    const corgi = 'CORGI'
    for (let i = 0; i < corgi.length; i++) {
      grid.set(cellKey(i, 0), { letter: corgi[i], across: 0 })
    }
    const bounds: Bounds = { minX: 0, maxX: 4, minY: 0, maxY: 0 }
    const placedAnswers: PlacedAnswer[] = [{ word: 'CORGI', direction: 'across', start: { x: 0, y: 0 } }]

    const result = validateCandidate(
      grid,
      bounds,
      'BARK',
      { direction: 'down', start: { x: 5, y: 0 } },
      ROOMY,
      false,
      placedAnswers,
    )
    expect(result).toBeNull()
  })

  it('rejects two across answers on adjacent rows even though neither own span is extended', () => {
    // CAT across at row 0, DOG across directly below at row 1. Neither
    // across span is extended, but the three columns each derive a 2-cell
    // down run (CD, AO, TG) that no authored answer spans. Previously
    // allowed under the (now-corrected) assumption that incidental entries
    // were acceptable; the side-contact rule makes this illegal.
    const grid = catAcrossGrid()
    const placedAnswers: PlacedAnswer[] = [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }]

    const result = validateCandidate(
      grid,
      boundsOfCatAcross(),
      'DOG',
      { direction: 'across', start: { x: 0, y: 1 } },
      ROOMY,
      false,
      placedAnswers,
    )
    expect(result).toBeNull()
  })
})

// Builds the search's internal grid (letter + per-direction owner index)
// from a list of placed answers, so each legality fixture below can be
// read directly off its answer list.
type TestGrid = Map<string, { letter: string; across?: number; down?: number }>

function gridFrom(answers: PlacedAnswer[]): TestGrid {
  const grid: TestGrid = new Map()
  answers.forEach((answer, index) => {
    for (let i = 0; i < answer.word.length; i++) {
      const x = answer.direction === 'across' ? answer.start.x + i : answer.start.x
      const y = answer.direction === 'across' ? answer.start.y : answer.start.y + i
      const key = cellKey(x, y)
      const occupant = { ...(grid.get(key) ?? { letter: answer.word[i] }) }
      occupant[answer.direction] = index
      grid.set(key, occupant)
    }
  })
  return grid
}

// The same answers as a (non-normalized) ConstructionSuccess, for the
// final geometry invariant, which only looks at finished geometry.
function constructionFrom(answers: PlacedAnswer[]): ConstructionSuccess {
  const cells: Record<string, string> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  let width = 0
  let height = 0
  for (const [key, occupant] of gridFrom(answers)) {
    const [x, y] = key.split(',').map(Number)
    cells[`r${y}c${x}`] = occupant.letter
    positions[`r${y}c${x}`] = { x, y }
    width = Math.max(width, x + 1)
    height = Math.max(height, y + 1)
  }
  return { ok: true, placedAnswers: answers, cells, positions, width, height, attemptsUsed: 0 }
}

function tryPlace(existing: PlacedAnswer[], candidate: PlacedAnswer, requireCrossing = true) {
  return validateCandidate(
    gridFrom(existing),
    null,
    candidate.word,
    { direction: candidate.direction, start: candidate.start },
    ROOMY,
    requireCrossing,
    existing,
  )
}

const CAT_ACROSS: PlacedAnswer = { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }
// TOP down through CAT's T:   C A T
//                                 O
//                                 P
const TOP_DOWN: PlacedAnswer = { word: 'TOP', direction: 'down', start: { x: 2, y: 0 } }

describe('validateCandidate: side contact (no incidental entries)', () => {
  it('rejects parallel down answers in adjacent columns', () => {
    // ARM down through CAT's A sits directly beside TOP: row 1 would read
    // "RO" and row 2 "MP" — two across runs nobody authored.
    expect(tryPlace([CAT_ACROSS, TOP_DOWN], { word: 'ARM', direction: 'down', start: { x: 1, y: 0 } })).toBeNull()
  })

  it('allows parallel answers separated by one empty row', () => {
    // PEN across through TOP's P, on row 2 — row 1 between it and CAT is
    // empty except TOP's own O, so nothing new touches:
    //   C A T . .
    //   . . O . .
    //   . . P E N
    const pen: PlacedAnswer = { word: 'PEN', direction: 'across', start: { x: 2, y: 2 } }
    expect(tryPlace([CAT_ACROSS, TOP_DOWN], pen)).not.toBeNull()
    expect(checkGeometryInvariant(constructionFrom([CAT_ACROSS, TOP_DOWN, pen])).ok).toBe(true)
  })

  it('allows a normal perpendicular crossing on the shared matching cell', () => {
    // TOP crosses CAT at T; TOP's new cells (O, P) have empty sides.
    expect(tryPlace([CAT_ACROSS], TOP_DOWN)).not.toBeNull()
    expect(checkGeometryInvariant(constructionFrom([CAT_ACROSS, TOP_DOWN])).ok).toBe(true)
  })

  it('allows diagonal-only contact', () => {
    // OWL down starting at (3,1) touches CAT's T only at a corner — no
    // shared edge, so no run forms.
    expect(tryPlace([CAT_ACROSS], { word: 'OWL', direction: 'down', start: { x: 3, y: 1 } }, false)).not.toBeNull()
  })

  it('rejects perpendicular near-touching without a true crossing', () => {
    // OWL across on row 1 starting under CAT's T: no shared cell, and
    // neither word's own ends are extended, but O sits directly below T,
    // forming a down run "TO" that no authored answer spans.
    expect(tryPlace([CAT_ACROSS], { word: 'OWL', direction: 'across', start: { x: 2, y: 1 } }, false)).toBeNull()
  })

  it('rejects a word that truly crosses one answer but brushes the side of another', () => {
    // SON across through TOP's O is a legitimate crossing, but its S lands
    // directly under CAT's A, forming a down run "AS":
    //   C A T
    //   . S O N
    //   . . P
    expect(tryPlace([CAT_ACROSS, TOP_DOWN], { word: 'SON', direction: 'across', start: { x: 1, y: 1 } })).toBeNull()
  })

  it('still rejects extending an existing authored answer before or after its span', () => {
    expect(tryPlace([CAT_ACROSS], { word: 'RUG', direction: 'across', start: { x: 3, y: 0 } }, false)).toBeNull()
    expect(tryPlace([CAT_ACROSS], { word: 'RUG', direction: 'across', start: { x: -3, y: 0 } }, false)).toBeNull()
    expect(tryPlace([CAT_ACROSS], { word: 'OWL', direction: 'down', start: { x: 0, y: 1 } }, false)).toBeNull()
  })

  it('rejects dense multi-word packing (the 2x2-block class of layout)', () => {
    // CAT across, TIE down through T, then KIT across through I — a real
    // crossing, but K lands under A, closing a 2x2 block of letters:
    //   C A T
    //   . K I T
    //   . . E
    const tie: PlacedAnswer = { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } }
    expect(tryPlace([CAT_ACROSS, tie], { word: 'KIT', direction: 'across', start: { x: 1, y: 1 } })).toBeNull()
  })
})

describe('checkGeometryInvariant (final defensive check)', () => {
  it('fails a construction containing an incidental run, naming the run', () => {
    // CAT with DOG directly below: three incidental down runs.
    const dog: PlacedAnswer = { word: 'DOG', direction: 'across', start: { x: 0, y: 1 } }
    const result = checkGeometryInvariant(constructionFrom([CAT_ACROSS, dog]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/Geometry invariant violated/)
    expect(result.reason).toMatch(/down CD, down AO, down TG/)
  })

  it('treats a run as incidental even when its text spells another pool word', () => {
    // Three across answers stacked so column 0 reads "RAT" by accident:
    //   R U G
    //   A R M
    //   T O P
    // RAT may well be in the candidate pool, but no authored answer
    // placed it there, so the construction is invalid (as are URO/GMP).
    const answers: PlacedAnswer[] = [
      { word: 'RUG', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'ARM', direction: 'across', start: { x: 0, y: 1 } },
      { word: 'TOP', direction: 'across', start: { x: 0, y: 2 } },
    ]
    const result = checkGeometryInvariant(constructionFrom(answers))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/down RAT/)
  })

  it('fails when an authored answer is not exactly one derived run', () => {
    // CAT + RUG end to end: one derived run "CATRUG", two unmatched answers.
    const rug: PlacedAnswer = { word: 'RUG', direction: 'across', start: { x: 3, y: 0 } }
    const result = checkGeometryInvariant(constructionFrom([CAT_ACROSS, rug]))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/unmatched answers: CAT, RUG/)
  })

  it('passes a completed search construction: derived entries equal authored answers', () => {
    const result = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: ['COLLIE', 'CORGI', 'LEASH', 'COLLAR', 'FETCH', 'BARK', 'TREAT', 'KENNEL'],
      maxWidth: 12,
      maxHeight: 12,
      seed: 'probe-2',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const runs = derivePlayableEntries(result.positions)
    expect(runs).toHaveLength(result.placedAnswers.length)
    const metrics = computeMetrics(result, { maxWidth: 12, maxHeight: 12 })
    expect(metrics.derivedEntries.incidentalEntryCount).toBe(0)
    expect(metrics.derivedEntries.derivedEntryCount).toBe(metrics.content.authoredAnswerCount)
  })
})

describe('answerBoundaryNeighbors', () => {
  it('computes the across before/after neighbors', () => {
    const answer: PlacedAnswer = { word: 'CAT', direction: 'across', start: { x: 2, y: 5 } }
    expect(answerBoundaryNeighbors(answer)).toEqual({ before: { x: 1, y: 5 }, after: { x: 5, y: 5 } })
  })

  it('computes the down before/after neighbors', () => {
    const answer: PlacedAnswer = { word: 'CORGI', direction: 'down', start: { x: 3, y: 0 } }
    expect(answerBoundaryNeighbors(answer)).toEqual({ before: { x: 3, y: -1 }, after: { x: 3, y: 5 } })
  })
})

describe('findCandidates', () => {
  it('only proposes placements anchored on a matching letter', () => {
    const grid = catAcrossGrid()
    const candidates = findCandidates(grid, 'TIE')
    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      const validated = validateCandidate(grid, boundsOfCatAcross(), 'TIE', candidate, ROOMY, true, [])
      // Every generated candidate is anchored on a real match, so it must
      // at least share a crossing (it may still fail other rules).
      if (!validated) continue
      expect(validated.cells.some((cell) => grid.has(cellKey(cell.x, cell.y)))).toBe(true)
    }
  })

  it('returns nothing when the word shares no letters with the grid', () => {
    const grid = catAcrossGrid()
    expect(findCandidates(grid, 'BUZZ')).toEqual([])
  })
})

describe('rankPlaceableWords', () => {
  // Hand-built ScoredWord entries with a known candidate count, so the
  // heuristic can be tested directly without depending on real letter
  // geometry to produce a particular count.
  function scoredWord(word: string, candidateCount: number): ScoredWord {
    return {
      word,
      candidates: Array.from({ length: candidateCount }, () => ({
        cells: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
        candidate: { direction: 'across' as const, start: { x: 0, y: 0 } },
      })),
    }
  }

  it('ranks the most-constrained word (fewest legal placements) first', () => {
    const ranked = rankPlaceableWords(
      [scoredWord('SHORT', 3), scoredWord('LONGWORD', 1)],
      createRng('rank-seed'),
    )
    expect(ranked[0].word).toBe('LONGWORD')
  })

  it('prefers the longer word as a secondary tiebreak when placement counts are equal', () => {
    const ranked = rankPlaceableWords(
      [scoredWord('CAT', 2), scoredWord('ELEPHANT', 2)],
      createRng('rank-seed'),
    )
    expect(ranked[0].word).toBe('ELEPHANT')
  })

  it('excludes a word with zero currently-legal placements rather than failing', () => {
    const ranked = rankPlaceableWords(
      [scoredWord('PLACEABLE', 1), scoredWord('STUCK', 0)],
      createRng('rank-seed'),
    )
    expect(ranked.map((entry) => entry.word)).toEqual(['PLACEABLE'])
  })
})

describe('scoreRemainingWords', () => {
  it('leaves a not-yet-placeable word scored with zero candidates instead of failing', () => {
    const state: SearchState = { grid: catAcrossGrid(), bounds: boundsOfCatAcross(), placedAnswers: [] }
    const counter = { used: 0, limit: 1000 }
    // ART shares letters with CAT (A, T); DOG shares nothing with CAT.
    const scored = scoreRemainingWords(['ART', 'DOG'], state, ROOMY, createRng('score-seed'), counter, false)
    if (scored === 'budget-exhausted') throw new Error('unexpected budget exhaustion')

    const art = scored.find((entry) => entry.word === 'ART')
    const dog = scored.find((entry) => entry.word === 'DOG')
    expect(art?.candidates.length).toBeGreaterThan(0)
    expect(dog?.candidates.length).toBe(0)

    // Ranking then correctly excludes DOG without treating it as a failure.
    const ranked = rankPlaceableWords(scored, createRng('score-seed'))
    expect(ranked.map((entry) => entry.word)).toEqual(['ART'])
  })
})

describe('constructFixedAnswerPuzzle', () => {
  function config(overrides: Partial<GeneratorConfig> = {}): GeneratorConfig {
    return {
      mode: 'fixed-answer',
      answers: ['CAT', 'TIE'],
      maxWidth: 10,
      maxHeight: 10,
      seed: 'phase-1-test-seed',
      ...overrides,
    }
  }

  it('constructs a connected layout for a small crossing fixture', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['CAT', 'TIE'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placedAnswers).toHaveLength(2)
    // CAT (3) + TIE (3) sharing exactly one 'T' = 5 distinct cells.
    expect(Object.keys(result.cells)).toHaveLength(5)
  })

  it('places every answer in the fixed list exactly once', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['CAT', 'TIE', 'EAR'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placedAnswers.map((a) => a.word).sort()).toEqual(['CAT', 'EAR', 'TIE'])
  })

  it('succeeds trivially for a single-answer list', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['LONELY'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placedAnswers).toHaveLength(1)
  })

  it('fails cleanly when the answer set cannot form a connected puzzle', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['CAT', 'DOG'] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/no legal connected arrangement/i)
  })

  it('respects a configured maxWidth', () => {
    const result = constructFixedAnswerPuzzle(
      config({ answers: ['ROCKET'], maxWidth: 3, maxHeight: 10 }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.width).toBeLessThanOrEqual(3)
  })

  it('respects a configured maxHeight', () => {
    const result = constructFixedAnswerPuzzle(
      config({ answers: ['ROCKET'], maxWidth: 10, maxHeight: 3 }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.height).toBeLessThanOrEqual(3)
  })

  it('respects independently configured non-square maximum dimensions', () => {
    const result = constructFixedAnswerPuzzle(
      config({ answers: ['ELEPHANT', 'TIGER', 'LION'], maxWidth: 8, maxHeight: 12 }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.width).toBeLessThanOrEqual(8)
    expect(result.height).toBeLessThanOrEqual(12)
  })

  it('normalizes successful coordinates so minX=0 and minY=0', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['CAT', 'TIE', 'EAR'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const xs = Object.values(result.positions).map((p) => p.x)
    const ys = Object.values(result.positions).map((p) => p.y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.min(...ys)).toBe(0)
  })

  it('produces the same successful result for the same seed', () => {
    const answers = CHAIN_ANSWERS
    const a = constructFixedAnswerPuzzle(config({ answers, seed: 7 }))
    const b = constructFixedAnswerPuzzle(config({ answers, seed: 7 }))
    expect(a).toEqual(b)
    expect(a.ok).toBe(true)
  })

  it('rejects input containing characters outside A-Z', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['CAT', 'DOG2'] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/A-Z/)
  })

  it('rejects duplicate answers rather than placing the word twice', () => {
    const result = constructFixedAnswerPuzzle(config({ answers: ['CAT', 'CAT'] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/duplicate/i)
  })

  it('reports search-budget exhaustion distinctly from "no arrangement exists"', () => {
    // A real construction of this chain-connected set needs many more
    // than 2 validated candidates (each remaining word is re-scored at
    // every recursion level), so a tiny budget is what stops the search,
    // not a genuine lack of any valid arrangement.
    const result = constructFixedAnswerPuzzle(config({ answers: CHAIN_ANSWERS, maxAttempts: 2 }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/budget exhausted/i)
  })

  it('defaults maxAttempts to 10,000 when omitted', () => {
    // Real Dogs subsets from the search-budget experiment: the first needs
    // 5,875 attempts (so it only succeeds above the old 5,000 default); the
    // second still exhausts the budget, reporting the default it used.
    const needsMoreThan5000 = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: ['BONE', 'SNIFF', 'KENNEL', 'LEASH', 'TREAT', 'PUPPY', 'BARK', 'PAWS', 'BEAGLE'],
      maxWidth: 12,
      maxHeight: 12,
      seed: 'dogs-budget-experiment-1-trial-10-construct',
    })
    expect(needsMoreThan5000).toMatchObject({ ok: true, attemptsUsed: 5875 })

    const exhausts = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: ['BARK', 'GROOM', 'FETCH', 'BONE', 'PUPPY', 'COLLAR', 'CORGI'],
      maxWidth: 12,
      maxHeight: 12,
      seed: 'dogs-budget-experiment-1-trial-1-construct',
    })
    expect(exhausts).toMatchObject({
      ok: false,
      attemptsUsed: 10001,
      reason: 'Search budget exhausted after 10001 attempts (maxAttempts=10000).',
    })
  })
})

// A chain, not a fully mutually-connected set: CRAB and KNOT share no
// letter at all, so the only way to place all three is for TACO — which
// shares a letter with both — to go down before whichever of CRAB/KNOT
// was placed first can connect to the other. A fixed word ordering that
// happened to try the disconnected pair back-to-back (e.g. CRAB, then
// KNOT, before TACO) would fail even though a full solution exists; this
// is exactly the scenario the dynamic remaining-words search exists to
// handle, by leaving a not-yet-placeable word out of a given level's
// ranking instead of failing the branch.
const CHAIN_ANSWERS = ['CRAB', 'TACO', 'KNOT']

describe('chain-connected construction (dynamic word ordering)', () => {
  function config(overrides: Partial<GeneratorConfig> = {}): GeneratorConfig {
    return {
      mode: 'fixed-answer',
      answers: CHAIN_ANSWERS,
      maxWidth: 10,
      maxHeight: 10,
      seed: 'chain-seed',
      ...overrides,
    }
  }

  it('confirms the fixture is a chain, not a fully mutually-connected set', () => {
    const shared = (a: string, b: string) => [...a].some((letter) => b.includes(letter))
    expect(shared('CRAB', 'TACO')).toBe(true)
    expect(shared('TACO', 'KNOT')).toBe(true)
    expect(shared('CRAB', 'KNOT')).toBe(false)
  })

  it('constructs the full chain-connected puzzle for a specific seed', () => {
    const result = constructFixedAnswerPuzzle(config({ seed: 'chain-seed' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.placedAnswers.map((a) => a.word).sort()).toEqual(['CRAB', 'KNOT', 'TACO'])
  })

  it('succeeds regardless of which word the ranking happens to try first, across many seeds', () => {
    // If any seed's initial ranking picks the disconnected pair (CRAB,
    // KNOT) as the first two placements, success here demonstrates the
    // search recovered — either by leaving the unplaceable word out of
    // an early level's ranking until TACO creates the connection, or by
    // backtracking over word choice — rather than failing the branch the
    // way a single fixed ordering could.
    for (let seed = 0; seed < 25; seed++) {
      const result = constructFixedAnswerPuzzle(config({ seed }))
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      expect(result.placedAnswers).toHaveLength(3)
    }
  })
})

describe('authored-run-extension regression: real construction-level reproduction', () => {
  it('no longer produces the CORGI/BARK-class perpendicular extension in real search output', () => {
    // The exact answer subset and seed that originally produced CORGI
    // (down) ending immediately above BARK's (across) start — see the
    // checkpoint report. Whatever this construction now produces, no
    // authored answer's own boundary-neighbor cells may be occupied,
    // otherwise its span would no longer be exactly recoverable as one
    // maximal run.
    const result = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: ['COLLIE', 'CORGI', 'LEASH', 'COLLAR', 'FETCH', 'BARK', 'TREAT', 'KENNEL'],
      maxWidth: 12,
      maxHeight: 12,
      seed: 'probe-2',
      maxAttempts: 5000,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const occupied = new Set(
      Object.values(result.positions).map((position) => cellKey(position.x, position.y)),
    )
    for (const answer of result.placedAnswers) {
      const { before, after } = answerBoundaryNeighbors(answer)
      expect(occupied.has(cellKey(before.x, before.y))).toBe(false)
      expect(occupied.has(cellKey(after.x, after.y))).toBe(false)
    }
  })
})

describe('ConstructionTelemetry (observe-only)', () => {
  it('never changes construction results, attempts, or failure reasons', () => {
    const cases = [
      { answers: ['COLLIE', 'CORGI', 'LEASH', 'COLLAR', 'FETCH', 'BARK', 'TREAT', 'KENNEL'], seed: 'probe-2', maxAttempts: 10000 },
      { answers: ['BARK', 'GROOM', 'FETCH', 'BONE', 'PUPPY', 'COLLAR', 'CORGI'], seed: 'dogs-budget-experiment-1-trial-1-construct', maxAttempts: 10000 },
      { answers: CHAIN_ANSWERS, seed: 'x', maxAttempts: 2 },
    ]
    for (const c of cases) {
      const config = { mode: 'fixed-answer' as const, maxWidth: 12, maxHeight: 12, ...c }
      const telemetry = createConstructionTelemetry()
      expect(constructFixedAnswerPuzzle(config, telemetry)).toEqual(constructFixedAnswerPuzzle(config))
      expect(telemetry.nodes).toBeGreaterThan(0)
    }
  })

  it('records depth reached and where attempts were spent', () => {
    const telemetry = createConstructionTelemetry()
    const result = constructFixedAnswerPuzzle(
      { mode: 'fixed-answer', answers: ['BARK', 'GROOM', 'FETCH', 'BONE', 'PUPPY', 'COLLAR', 'CORGI'], seed: 'dogs-budget-experiment-1-trial-1-construct', maxAttempts: 10000, maxWidth: 12, maxHeight: 12 },
      telemetry,
    )
    expect(result.ok).toBe(false)
    expect(telemetry.maxPlaced).toBeGreaterThan(0)
    expect(telemetry.maxPlaced).toBeLessThan(7)
    expect(telemetry.attemptsByPlaced.reduce((a, b) => a + (b ?? 0), 0)).toBe(result.attemptsUsed)
    expect(telemetry.nodesByPlaced.reduce((a, b) => a + (b ?? 0), 0)).toBe(telemetry.nodes)
  })
})
