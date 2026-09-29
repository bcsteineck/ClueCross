import { describe, expect, it } from 'vitest'
import {
  compareCandidatesStructurally,
  orderCandidatesStructurally,
  STRUCTURAL_COMPARISON_CRITERIA,
} from './compare'
import type { Candidate } from './generateCandidatePool'
import type { PlacedAnswer } from '../types'

// Hand-built Candidate fixtures with directly-controlled metric values.
// This intentionally bypasses computeMetrics/real geometry: what's under
// test is the comparator's own criteria-reading and tie-break logic, not
// metric computation (already covered by metrics.test.ts) or geometry
// construction (Phase 1/2). Precisely isolating one criterion at a time
// via real crossword geometry turned out to be impractical by hand (see
// the Phase 4 checkpoint report), so this is the more reliable approach.
function makeCandidate(options: {
  words: string[]
  zeroOrSingle: number
  min: number
  density: number
  maxWidth?: number
  maxHeight?: number
}): Candidate {
  const placedAnswers: PlacedAnswer[] = options.words.map((word, index) => ({
    word,
    direction: 'across',
    start: { x: 0, y: index },
  }))

  return {
    construction: {
      ok: true,
      placedAnswers,
      cells: {},
      positions: {},
      width: 1,
      height: 1,
      attemptsUsed: 1,
    },
    metrics: {
      content: {
        authoredAnswerCount: options.words.length,
        authoredAnswerLengths: [],
        minAuthoredAnswerLength: 0,
        maxAuthoredAnswerLength: 0,
        meanAuthoredAnswerLength: 0,
        authoredAnswerLengthHistogram: {},
      },
      geometry: {
        occupiedCellCount: 0,
        boundingWidth: 0,
        boundingHeight: 0,
        boundingArea: 0,
        configuredMaxWidth: options.maxWidth ?? 10,
        configuredMaxHeight: options.maxHeight ?? 10,
        configuredMaxArea: 0,
        density: options.density,
        envelopeUtilization: 0,
        aspectRatio: 0,
      },
      authoredIntersections: {
        totalAuthoredIntersections: 0,
        intersectionsPerAuthoredAnswer: [],
        minIntersectionsPerAuthoredAnswer: options.min,
        maxIntersectionsPerAuthoredAnswer: 0,
        meanIntersectionsPerAuthoredAnswer: 0,
        zeroIntersectionAuthoredAnswerCount: 0,
        singleIntersectionAuthoredAnswerCount: 0,
        zeroOrSingleIntersectionAuthoredAnswerCount: options.zeroOrSingle,
      },
      derivedEntries: {
        derivedEntryCount: 0,
        incidentalEntryCount: 0,
        authoredMatchedEntryCount: 0,
        derivedEntryLengths: [],
        minDerivedEntryLength: 0,
        maxDerivedEntryLength: 0,
        meanDerivedEntryLength: 0,
      },
      letters: {
        distinctLetterCount: 0,
        letterFrequency: {},
        minPresentLetterFrequency: 0,
        maxPresentLetterFrequency: 0,
        meanPresentLetterFrequency: 0,
        revealFootprint: {},
        maxLetterShare: 0,
      },
      visualComplexityProxyFields: [],
      difficultyProxyFields: [],
    },
    canonicalSignature: 'test-signature',
    representativeSeed: 0,
    sourceSeeds: [0],
    duplicateCount: 0,
  }
}

const WORDS = ['CAT', 'TIE', 'EAR']

describe('STRUCTURAL_COMPARISON_CRITERIA', () => {
  it('has exactly the three retained criteria, each fully documented', () => {
    expect(STRUCTURAL_COMPARISON_CRITERIA).toHaveLength(3)
    expect(STRUCTURAL_COMPARISON_CRITERIA.map((c) => c.name)).toEqual([
      'fewerWeaklyConnectedAuthoredAnswers',
      'higherMinimumAuthoredIntersectionCount',
      'higherDensity',
    ])
    for (const criterion of STRUCTURAL_COMPARISON_CRITERIA) {
      expect(criterion.rationale.length).toBeGreaterThan(0)
      expect(criterion.limitation.length).toBeGreaterThan(0)
      expect(['higher-is-preferred', 'lower-is-preferred']).toContain(criterion.direction)
    }
  })

  it('each criterion reads the metric field it documents', () => {
    const candidate = makeCandidate({ words: WORDS, zeroOrSingle: 3, min: 2, density: 0.5 })
    const [weaklyConnected, minIntersections, density] = STRUCTURAL_COMPARISON_CRITERIA
    expect(weaklyConnected.read(candidate)).toBe(3)
    expect(minIntersections.read(candidate)).toBe(2)
    expect(density.read(candidate)).toBe(0.5)
  })
})

describe('compareCandidatesStructurally: criteria in isolation', () => {
  it('criterion 1: fewer weakly-connected authored answers wins when it is the only difference', () => {
    const fewer = makeCandidate({ words: WORDS, zeroOrSingle: 0, min: 2, density: 0.5 })
    const more = makeCandidate({ words: WORDS, zeroOrSingle: 2, min: 2, density: 0.5 })
    expect(compareCandidatesStructurally(fewer, more)).toBe(-1)
    expect(compareCandidatesStructurally(more, fewer)).toBe(1)
  })

  it('criterion 2: a higher minimum authored-intersection count wins when criterion 1 ties', () => {
    const higherMin = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 2, density: 0.5 })
    const lowerMin = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 1, density: 0.5 })
    expect(compareCandidatesStructurally(higherMin, lowerMin)).toBe(-1)
    expect(compareCandidatesStructurally(lowerMin, higherMin)).toBe(1)
  })

  it('criterion 3: higher density wins when criteria 1 and 2 both tie', () => {
    const denser = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 1, density: 0.8 })
    const sparser = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 1, density: 0.3 })
    expect(compareCandidatesStructurally(denser, sparser)).toBe(-1)
    expect(compareCandidatesStructurally(sparser, denser)).toBe(1)
  })

  it('ties on every criterion compare equal', () => {
    const a = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 1, density: 0.5 })
    const b = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 1, density: 0.5 })
    expect(compareCandidatesStructurally(a, b)).toBe(0)
  })

  it('an identical candidate compares equal to itself', () => {
    const a = makeCandidate({ words: WORDS, zeroOrSingle: 2, min: 1, density: 0.4 })
    expect(compareCandidatesStructurally(a, a)).toBe(0)
  })

  it('criterion 1 ranks ahead of criterion 2 even when criterion 2 alone would favor the other candidate', () => {
    // a has more weakly-connected answers (worse on criterion 1) but a
    // higher minimum (better on criterion 2) — criterion 1 must decide
    // first regardless.
    const a = makeCandidate({ words: WORDS, zeroOrSingle: 2, min: 5, density: 0.9 })
    const b = makeCandidate({ words: WORDS, zeroOrSingle: 0, min: 1, density: 0.1 })
    expect(compareCandidatesStructurally(a, b)).toBe(1) // b preferred
    expect(compareCandidatesStructurally(b, a)).toBe(-1)
  })
})

describe('compareCandidatesStructurally: compatibility guard', () => {
  it('throws when the two candidates have different authored-answer sets', () => {
    const a = makeCandidate({ words: ['CAT', 'TIE'], zeroOrSingle: 0, min: 1, density: 0.5 })
    const b = makeCandidate({ words: ['DOG', 'ARM'], zeroOrSingle: 0, min: 1, density: 0.5 })
    expect(() => compareCandidatesStructurally(a, b)).toThrow(/different authored-answer sets/i)
  })

  it('throws when the two candidates were generated under different configurations', () => {
    const a = makeCandidate({ words: WORDS, zeroOrSingle: 0, min: 1, density: 0.5, maxWidth: 10, maxHeight: 10 })
    const b = makeCandidate({ words: WORDS, zeroOrSingle: 0, min: 1, density: 0.5, maxWidth: 12, maxHeight: 10 })
    expect(() => compareCandidatesStructurally(a, b)).toThrow(/different maxWidth\/maxHeight/i)
  })

  it('does not require the same authored-answer ORDER, only the same set', () => {
    const a = makeCandidate({ words: ['CAT', 'TIE', 'EAR'], zeroOrSingle: 0, min: 1, density: 0.5 })
    const b = makeCandidate({ words: ['EAR', 'CAT', 'TIE'], zeroOrSingle: 0, min: 1, density: 0.5 })
    expect(() => compareCandidatesStructurally(a, b)).not.toThrow()
  })
})

describe('compareCandidatesStructurally: no numeric score', () => {
  it('only ever returns -1, 0, or 1', () => {
    const a = makeCandidate({ words: WORDS, zeroOrSingle: 3, min: 0, density: 0.1 })
    const b = makeCandidate({ words: WORDS, zeroOrSingle: 0, min: 5, density: 0.9 })
    expect([-1, 0, 1]).toContain(compareCandidatesStructurally(a, b))
    expect([-1, 0, 1]).toContain(compareCandidatesStructurally(b, a))
    expect([-1, 0, 1]).toContain(compareCandidatesStructurally(a, a))
  })
})

describe('orderCandidatesStructurally', () => {
  it('sorts candidates most-preferred first without mutating the input array', () => {
    const best = makeCandidate({ words: WORDS, zeroOrSingle: 0, min: 3, density: 0.9 })
    const middle = makeCandidate({ words: WORDS, zeroOrSingle: 1, min: 2, density: 0.5 })
    const worst = makeCandidate({ words: WORDS, zeroOrSingle: 2, min: 1, density: 0.1 })
    const input = [worst, best, middle]
    const inputCopy = [...input]

    const ordered = orderCandidatesStructurally(input)

    expect(ordered).toEqual([best, middle, worst])
    expect(input).toEqual(inputCopy) // input untouched
  })
})
