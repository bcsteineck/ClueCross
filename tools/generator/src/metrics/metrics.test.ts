import { describe, expect, it } from 'vitest'
import {
  computeAuthoredIntersectionMetrics,
  computeContentMetrics,
  computeDerivedEntryMetrics,
  computeGeometryMetrics,
  computeLetterMetrics,
  computeMetrics,
} from './metrics'
import { derivePlayableEntries } from '../derive/derivePlayableEntries'
import type { ConstructionSuccess, PlacedAnswer } from '../types'

// CAT (across, (0,0)) crossing TIE (down, (2,0)) at CAT's 'T'. Every
// number below is hand-computable and asserted exactly.
function crossingFixture(): ConstructionSuccess {
  return {
    ok: true,
    placedAnswers: [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ],
    cells: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'I', r2c2: 'E' },
    positions: {
      r0c0: { x: 0, y: 0 },
      r0c1: { x: 1, y: 0 },
      r0c2: { x: 2, y: 0 },
      r1c2: { x: 2, y: 1 },
      r2c2: { x: 2, y: 2 },
    },
    width: 3,
    height: 3,
    attemptsUsed: 1,
  }
}

// CAT and TOP stacked in adjacent rows with no authored down answer
// between them: disconnected authored content (0 authored intersections)
// plus three incidental 2-cell down runs (one per shared column).
function incidentalFixture(): ConstructionSuccess {
  return {
    ok: true,
    placedAnswers: [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TOP', direction: 'across', start: { x: 0, y: 1 } },
    ],
    cells: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c0: 'T', r1c1: 'O', r1c2: 'P' },
    positions: {
      r0c0: { x: 0, y: 0 },
      r0c1: { x: 1, y: 0 },
      r0c2: { x: 2, y: 0 },
      r1c0: { x: 0, y: 1 },
      r1c1: { x: 1, y: 1 },
      r1c2: { x: 2, y: 1 },
    },
    width: 3,
    height: 2,
    attemptsUsed: 1,
  }
}

// A single authored answer, no crossings at all — the smallest
// meaningful construction.
function singleAnswerFixture(): ConstructionSuccess {
  return {
    ok: true,
    placedAnswers: [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }],
    cells: { r0c0: 'C', r0c1: 'A', r0c2: 'T' },
    positions: { r0c0: { x: 0, y: 0 }, r0c1: { x: 1, y: 0 }, r0c2: { x: 2, y: 0 } },
    width: 3,
    height: 1,
    attemptsUsed: 1,
  }
}

const ROOMY = { maxWidth: 10, maxHeight: 10 }

function expectFinite(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => expectFinite(item, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      expectFinite(nested, `${path}.${key}`)
    }
    return
  }
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} was not finite (got ${value})`).toBe(true)
  }
}

describe('computeContentMetrics', () => {
  it('is computed from authored answers only and ignores incidental derived entries', () => {
    const result = computeContentMetrics(incidentalFixture().placedAnswers)
    // Only CAT and TOP (both authored); the 3 incidental down entries
    // this fixture produces must not appear here at all.
    expect(result).toEqual({
      authoredAnswerCount: 2,
      authoredAnswerLengths: [3, 3],
      minAuthoredAnswerLength: 3,
      maxAuthoredAnswerLength: 3,
      meanAuthoredAnswerLength: 3,
      authoredAnswerLengthHistogram: { 3: 2 },
    })
  })

  it('computes min/max/mean correctly for mixed-length answers', () => {
    const placedAnswers: PlacedAnswer[] = [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'ELEPHANT', direction: 'down', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'across', start: { x: 0, y: 5 } },
    ]
    const result = computeContentMetrics(placedAnswers)
    expect(result.authoredAnswerCount).toBe(3)
    expect(result.authoredAnswerLengths).toEqual([3, 8, 3])
    expect(result.minAuthoredAnswerLength).toBe(3)
    expect(result.maxAuthoredAnswerLength).toBe(8)
    expect(result.meanAuthoredAnswerLength).toBeCloseTo((3 + 8 + 3) / 3)
    expect(result.authoredAnswerLengthHistogram).toEqual({ 3: 2, 8: 1 })
  })
})

describe('computeGeometryMetrics', () => {
  it('computes exact values for the crossing fixture', () => {
    const result = computeGeometryMetrics(crossingFixture(), ROOMY)
    expect(result).toEqual({
      occupiedCellCount: 5,
      boundingWidth: 3,
      boundingHeight: 3,
      boundingArea: 9,
      configuredMaxWidth: 10,
      configuredMaxHeight: 10,
      configuredMaxArea: 100,
      density: 5 / 9,
      envelopeUtilization: 9 / 100,
      aspectRatio: 1,
    })
  })

  it('defines density as occupiedCellCount / boundingArea, not against the configured envelope', () => {
    // A fully-dense 3x2 fixture: 6 occupied cells filling exactly a 3x2
    // bounding box. Density must be 1, regardless of how roomy the
    // configured envelope is.
    const result = computeGeometryMetrics(incidentalFixture(), ROOMY)
    expect(result.occupiedCellCount).toBe(6)
    expect(result.boundingArea).toBe(6)
    expect(result.density).toBe(1)
    expect(result.envelopeUtilization).toBe(6 / 100)
  })

  it('keeps configured width/height independent for a non-square envelope', () => {
    const result = computeGeometryMetrics(crossingFixture(), { maxWidth: 12, maxHeight: 6 })
    expect(result.configuredMaxWidth).toBe(12)
    expect(result.configuredMaxHeight).toBe(6)
    expect(result.configuredMaxArea).toBe(72)
    expect(result.envelopeUtilization).toBe(9 / 72)
    // boundingWidth/Height/aspectRatio are unaffected by the envelope.
    expect(result.boundingWidth).toBe(3)
    expect(result.boundingHeight).toBe(3)
    expect(result.aspectRatio).toBe(1)
  })
})

describe('computeAuthoredIntersectionMetrics', () => {
  it('counts one crossing as +1 total and +1 for each of the two participating answers', () => {
    const { placedAnswers, positions } = crossingFixture()
    const result = computeAuthoredIntersectionMetrics(placedAnswers, positions)
    expect(result).toEqual({
      totalAuthoredIntersections: 1,
      intersectionsPerAuthoredAnswer: [1, 1], // [CAT, TIE], matching placedAnswers order
      minIntersectionsPerAuthoredAnswer: 1,
      maxIntersectionsPerAuthoredAnswer: 1,
      meanIntersectionsPerAuthoredAnswer: 1,
      zeroIntersectionAuthoredAnswerCount: 0,
      singleIntersectionAuthoredAnswerCount: 2,
      zeroOrSingleIntersectionAuthoredAnswerCount: 2,
    })
  })

  it('reports zero-intersection answers rather than assuming a connected construction', () => {
    // CAT and TOP share no cell in this fixture — Phase 1 would never
    // produce this (it requires a connected construction), but the
    // metric must still report what's actually there rather than assume.
    const { placedAnswers, positions } = incidentalFixture()
    const result = computeAuthoredIntersectionMetrics(placedAnswers, positions)
    expect(result.totalAuthoredIntersections).toBe(0)
    expect(result.intersectionsPerAuthoredAnswer).toEqual([0, 0])
    expect(result.zeroIntersectionAuthoredAnswerCount).toBe(2)
    expect(result.singleIntersectionAuthoredAnswerCount).toBe(0)
    expect(result.zeroOrSingleIntersectionAuthoredAnswerCount).toBe(2)
  })

  it('is unaffected by incidental derived entries — only authored-to-authored crossings count', () => {
    // The incidental fixture's three down runs are NOT authored answers,
    // so they must contribute nothing here even though they geometrically
    // "cross" both CAT and TOP.
    const { placedAnswers, positions } = incidentalFixture()
    const result = computeAuthoredIntersectionMetrics(placedAnswers, positions)
    expect(result.totalAuthoredIntersections).toBe(0)
  })

  it('counts multiple crossings correctly for one answer touching two others', () => {
    // "SEAT" across (S-E-A-T) crosses "SIT" down at its own 'S' (x=0) and
    // "ARM" down at its own 'A' (x=2) — letters agree at both shared
    // cells, matching Phase 1's own crossing-legality rule.
    const placedAnswers: PlacedAnswer[] = [
      { word: 'SEAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'SIT', direction: 'down', start: { x: 0, y: 0 } },
      { word: 'ARM', direction: 'down', start: { x: 2, y: 0 } },
    ]
    const positions = {
      r0c0: { x: 0, y: 0 }, // S (SEAT + SIT)
      r0c1: { x: 1, y: 0 }, // E
      r0c2: { x: 2, y: 0 }, // A (SEAT + ARM)
      r0c3: { x: 3, y: 0 }, // T
      r1c0: { x: 0, y: 1 }, // I
      r2c0: { x: 0, y: 2 }, // T
      r1c2: { x: 2, y: 1 }, // R
      r2c2: { x: 2, y: 2 }, // M
    }
    const result = computeAuthoredIntersectionMetrics(placedAnswers, positions)
    expect(result.totalAuthoredIntersections).toBe(2)
    expect(result.intersectionsPerAuthoredAnswer).toEqual([2, 1, 1]) // [SEAT, SIT, ARM]
    expect(result.minIntersectionsPerAuthoredAnswer).toBe(1)
    expect(result.maxIntersectionsPerAuthoredAnswer).toBe(2)
    expect(result.zeroIntersectionAuthoredAnswerCount).toBe(0)
    expect(result.singleIntersectionAuthoredAnswerCount).toBe(2)
  })

  it('handles a single authored answer with no possible crossings', () => {
    const { placedAnswers, positions } = singleAnswerFixture()
    const result = computeAuthoredIntersectionMetrics(placedAnswers, positions)
    expect(result).toEqual({
      totalAuthoredIntersections: 0,
      intersectionsPerAuthoredAnswer: [0],
      minIntersectionsPerAuthoredAnswer: 0,
      maxIntersectionsPerAuthoredAnswer: 0,
      meanIntersectionsPerAuthoredAnswer: 0,
      zeroIntersectionAuthoredAnswerCount: 1,
      singleIntersectionAuthoredAnswerCount: 0,
      zeroOrSingleIntersectionAuthoredAnswerCount: 1,
    })
  })
})

describe('computeDerivedEntryMetrics', () => {
  it('splits authored-matched vs. incidental entries using exact-span matching, not text', () => {
    const { placedAnswers, positions } = incidentalFixture()
    const runs = derivePlayableEntries(positions)
    const result = computeDerivedEntryMetrics(runs, placedAnswers, positions)
    expect(result.derivedEntryCount).toBe(5) // cat, top, + 3 incidental down runs
    expect(result.authoredMatchedEntryCount).toBe(2)
    expect(result.incidentalEntryCount).toBe(3)
    expect(result.derivedEntryLengths).toEqual([3, 3, 2, 2, 2])
    expect(result.minDerivedEntryLength).toBe(2)
    expect(result.maxDerivedEntryLength).toBe(3)
    expect(result.meanDerivedEntryLength).toBeCloseTo(12 / 5)
  })

  it('has no incidental entries for a fully-authored crossing fixture', () => {
    const { placedAnswers, positions } = crossingFixture()
    const runs = derivePlayableEntries(positions)
    const result = computeDerivedEntryMetrics(runs, placedAnswers, positions)
    expect(result.derivedEntryCount).toBe(2)
    expect(result.authoredMatchedEntryCount).toBe(2)
    expect(result.incidentalEntryCount).toBe(0)
  })
})

describe('computeLetterMetrics', () => {
  it('computes exact letter frequencies, reveal footprint, and maxLetterShare', () => {
    const result = computeLetterMetrics(crossingFixture().cells)
    // C, A, T, I, E: each occurs exactly once.
    expect(result.distinctLetterCount).toBe(5)
    expect(result.letterFrequency).toEqual({ A: 1, C: 1, E: 1, I: 1, T: 1 })
    expect(result.minPresentLetterFrequency).toBe(1)
    expect(result.maxPresentLetterFrequency).toBe(1)
    expect(result.meanPresentLetterFrequency).toBe(1)
    expect(result.maxLetterShare).toBe(1 / 5)
    // Documented as identical to letterFrequency, not a separate calculation.
    expect(result.revealFootprint).toEqual(result.letterFrequency)
  })

  it('computes a skewed distribution correctly (T appears twice)', () => {
    const result = computeLetterMetrics(incidentalFixture().cells)
    // C:1 A:1 T:2 O:1 P:1 — 5 distinct letters, 6 occupied cells.
    expect(result.distinctLetterCount).toBe(5)
    expect(result.letterFrequency).toEqual({ A: 1, C: 1, O: 1, P: 1, T: 2 })
    expect(result.minPresentLetterFrequency).toBe(1)
    expect(result.maxPresentLetterFrequency).toBe(2)
    expect(result.meanPresentLetterFrequency).toBeCloseTo(6 / 5)
    expect(result.maxLetterShare).toBeCloseTo(2 / 6)
  })

  it('returns letterFrequency keys in sorted A-Z order regardless of cell insertion order', () => {
    const result = computeLetterMetrics({ a: 'Z', b: 'A', c: 'M' })
    expect(Object.keys(result.letterFrequency)).toEqual(['A', 'M', 'Z'])
  })
})

describe('computeMetrics: full pipeline', () => {
  it('produces the exact combined result for the crossing fixture', () => {
    const result = computeMetrics(crossingFixture(), ROOMY)

    expect(result.content.authoredAnswerCount).toBe(2)
    expect(result.geometry.density).toBeCloseTo(5 / 9)
    expect(result.authoredIntersections.totalAuthoredIntersections).toBe(1)
    expect(result.derivedEntries.incidentalEntryCount).toBe(0)
    expect(result.letters.distinctLetterCount).toBe(5)

    // Proxy field lists are labels, not values, and are present on every result.
    expect(result.visualComplexityProxyFields).toContain('geometry.occupiedCellCount')
    expect(result.difficultyProxyFields).toContain('geometry.density')
  })

  it('produces no NaN or Infinity anywhere in the result for valid input', () => {
    expectFinite(computeMetrics(crossingFixture(), ROOMY))
    expectFinite(computeMetrics(incidentalFixture(), ROOMY))
    expectFinite(computeMetrics(singleAnswerFixture(), ROOMY))
  })

  it('handles the smallest supported meaningful fixture (a single authored answer)', () => {
    const result = computeMetrics(singleAnswerFixture(), ROOMY)
    expect(result.content.authoredAnswerCount).toBe(1)
    expect(result.authoredIntersections.zeroIntersectionAuthoredAnswerCount).toBe(1)
    expect(result.derivedEntries.derivedEntryCount).toBe(1)
    expect(result.derivedEntries.incidentalEntryCount).toBe(0)
    expect(result.geometry.density).toBe(1) // 3 cells filling exactly a 3x1 box
  })

  it('fails clearly rather than dividing by zero when config has a non-positive dimension', () => {
    expect(() => computeMetrics(crossingFixture(), { maxWidth: 0, maxHeight: 10 })).toThrow(
      /must be positive/i,
    )
  })

  it('fails clearly when the construction exceeds the given config envelope (mismatched input)', () => {
    expect(() => computeMetrics(crossingFixture(), { maxWidth: 2, maxHeight: 2 })).toThrow(
      /exceeds the given config's envelope/i,
    )
  })

  it('fails clearly on a construction with no placed answers', () => {
    const malformed: ConstructionSuccess = { ...crossingFixture(), placedAnswers: [] }
    expect(() => computeMetrics(malformed, ROOMY)).toThrow(/no placed answers/i)
  })

  it('fails clearly on a construction with no occupied cells', () => {
    const malformed: ConstructionSuccess = { ...crossingFixture(), cells: {}, positions: {} }
    expect(() => computeMetrics(malformed, ROOMY)).toThrow(/no occupied cells/i)
  })

  it('fails clearly when an authored answer cannot be recovered as an exact derived entry', () => {
    // The same CAT + TAIL authored-run-extension fixture from the Phase 2
    // invariant tests: "CATTAIL" derives as one 7-cell run, so neither
    // answer's own span matches it exactly.
    const malformed: ConstructionSuccess = {
      ok: true,
      placedAnswers: [
        { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
        { word: 'TAIL', direction: 'across', start: { x: 3, y: 0 } },
      ],
      cells: {
        r0c0: 'C',
        r0c1: 'A',
        r0c2: 'T',
        r0c3: 'T',
        r0c4: 'A',
        r0c5: 'I',
        r0c6: 'L',
      },
      positions: {
        r0c0: { x: 0, y: 0 },
        r0c1: { x: 1, y: 0 },
        r0c2: { x: 2, y: 0 },
        r0c3: { x: 3, y: 0 },
        r0c4: { x: 4, y: 0 },
        r0c5: { x: 5, y: 0 },
        r0c6: { x: 6, y: 0 },
      },
      width: 7,
      height: 1,
      attemptsUsed: 1,
    }
    expect(() => computeMetrics(malformed, ROOMY)).toThrow(/could not be recovered/i)
  })
})
