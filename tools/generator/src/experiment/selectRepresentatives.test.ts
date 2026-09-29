import { describe, expect, it } from 'vitest'
import { selectRepresentatives } from './selectRepresentatives'
import type { PoolCandidate } from '../pool/generateCandidatePoolSelection'
import type { PlacedAnswer } from '../types'

// Hand-built PoolCandidate fixtures with directly-controlled fields —
// same technique Phase 4's compare.test.ts uses, for the same reason:
// precisely isolating selection behavior is far more reliable than
// deriving real geometry with specific metric values by hand.
function makePoolCandidate(options: {
  words: string[]
  answerCount: number
  occupiedCellCount: number
  density?: number
  trialIndex: number
  identitySignature: string
  zeroOrSingle?: number
  min?: number
}): PoolCandidate {
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
        occupiedCellCount: options.occupiedCellCount,
        boundingWidth: 0,
        boundingHeight: 0,
        boundingArea: 0,
        configuredMaxWidth: 10,
        configuredMaxHeight: 10,
        configuredMaxArea: 100,
        density: options.density ?? 0.5,
        envelopeUtilization: 0,
        aspectRatio: 0,
      },
      authoredIntersections: {
        totalAuthoredIntersections: 0,
        intersectionsPerAuthoredAnswer: [],
        minIntersectionsPerAuthoredAnswer: options.min ?? 1,
        maxIntersectionsPerAuthoredAnswer: 0,
        meanIntersectionsPerAuthoredAnswer: 0,
        zeroIntersectionAuthoredAnswerCount: 0,
        singleIntersectionAuthoredAnswerCount: 0,
        zeroOrSingleIntersectionAuthoredAnswerCount: options.zeroOrSingle ?? 0,
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
    canonicalSignature: options.identitySignature,
    representativeSeed: options.trialIndex,
    sourceSeeds: [options.trialIndex],
    duplicateCount: 0,
    selectedAnswers: options.words.slice().sort(),
    unselectedAnswers: [],
    answerCount: options.answerCount,
    identitySignature: options.identitySignature,
    representativeTrialIndex: options.trialIndex,
    sourceTrialIndices: [options.trialIndex],
  }
}

describe('selectRepresentatives', () => {
  it('returns an empty array for zero candidates', () => {
    expect(selectRepresentatives([])).toEqual([])
  })

  it('returns exactly one representative for a single candidate, without duplicate labels', () => {
    const only = makePoolCandidate({
      words: ['CAT', 'TIE'],
      answerCount: 2,
      occupiedCellCount: 5,
      trialIndex: 0,
      identitySignature: 'sig-only',
    })
    const result = selectRepresentatives([only])
    expect(result).toHaveLength(1)
    expect(result[0].candidate).toBe(only)
  })

  it('picks the candidate nearest the median selected-answer count', () => {
    const candidates = [4, 5, 6, 7, 8].map((count, index) =>
      makePoolCandidate({
        words: Array.from({ length: count }, (_, i) => `W${index}${i}`),
        answerCount: count,
        occupiedCellCount: 10 + index, // distinct, unrelated to answerCount ordering
        trialIndex: index,
        identitySignature: `sig-${index}`,
      }),
    )
    const result = selectRepresentatives(candidates)
    const byAnswerCount = result.find((r) => r.label.includes('median selected-answer count'))
    expect(byAnswerCount?.candidate.answerCount).toBe(6) // median of [4,5,6,7,8]
  })

  it('picks the candidate nearest the median occupied-cell count', () => {
    const candidates = [10, 20, 30, 40, 50].map((occupied, index) =>
      makePoolCandidate({
        words: [`W${index}A`, `W${index}B`],
        answerCount: 2,
        occupiedCellCount: occupied,
        trialIndex: index,
        identitySignature: `sig-${index}`,
      }),
    )
    const result = selectRepresentatives(candidates)
    const byOccupied = result.find((r) => r.label.includes('median occupied-cell count'))
    expect(byOccupied?.candidate.metrics.geometry.occupiedCellCount).toBe(30)
  })

  it('uses the Phase 4 comparator among candidates sharing the same selected-answer set', () => {
    // Two candidates select the exact same words but differ structurally;
    // the comparator should prefer the one with fewer weakly-connected
    // answers (criterion 1: lower zeroOrSingle is preferred).
    const weaker = makePoolCandidate({
      words: ['CAT', 'TIE', 'EAR'],
      answerCount: 3,
      occupiedCellCount: 8,
      trialIndex: 0,
      identitySignature: 'sig-weaker',
      zeroOrSingle: 3,
    })
    const stronger = makePoolCandidate({
      words: ['CAT', 'TIE', 'EAR'],
      answerCount: 3,
      occupiedCellCount: 8,
      trialIndex: 1,
      identitySignature: 'sig-stronger',
      zeroOrSingle: 0,
    })
    const result = selectRepresentatives([weaker, stronger])
    const structural = result.find((r) => r.label.includes('structurally preferred'))
    expect(structural?.candidate.identitySignature).toBe('sig-stronger')
    expect(structural?.label).toContain('CAT, EAR, TIE')
  })

  it('falls back to a clearly-labeled rule, never a fake "structural" pick, when no same-subset alternatives exist', () => {
    const candidates = [3, 5, 7].map((count, index) =>
      makePoolCandidate({
        words: Array.from({ length: count }, (_, i) => `X${index}${i}`), // every candidate has a unique word set
        answerCount: count,
        occupiedCellCount: 10 + index,
        trialIndex: index,
        identitySignature: `sig-${index}`,
      }),
    )
    const result = selectRepresentatives(candidates)
    for (const representative of result) {
      expect(representative.label).not.toContain('structurally preferred')
    }
    // The highest-answer-count fallback should be present and labeled honestly.
    const fallback = result.find((r) => r.label.includes('highest selected-answer count'))
    expect(fallback?.label).toContain('no two candidates in this size shared a selected-answer set')
  })

  it('never returns two representatives with the same identitySignature', () => {
    const candidates = [4, 5, 6, 7, 8].map((count, index) =>
      makePoolCandidate({
        words: Array.from({ length: count }, (_, i) => `Y${index}${i}`),
        answerCount: count,
        occupiedCellCount: 10 + index,
        trialIndex: index,
        identitySignature: `sig-${index}`,
      }),
    )
    const result = selectRepresentatives(candidates)
    const signatures = result.map((r) => r.candidate.identitySignature)
    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it('reports fewer than 3 representatives rather than forcing duplicates when rules collide', () => {
    // Only two candidates total, sharing no selected-answer set — rule 1
    // and rule 2 may or may not collide, but there can never be more
    // representatives than meaningfully-distinct picks.
    const a = makePoolCandidate({
      words: ['CAT', 'TIE'],
      answerCount: 2,
      occupiedCellCount: 5,
      trialIndex: 0,
      identitySignature: 'sig-a',
    })
    const b = makePoolCandidate({
      words: ['DOG', 'ARM'],
      answerCount: 2,
      occupiedCellCount: 5,
      trialIndex: 1,
      identitySignature: 'sig-b',
    })
    const result = selectRepresentatives([a, b])
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('every representative actually belongs to the input candidate list', () => {
    const candidates = [4, 5, 6].map((count, index) =>
      makePoolCandidate({
        words: Array.from({ length: count }, (_, i) => `Z${index}${i}`),
        answerCount: count,
        occupiedCellCount: 10 + index,
        trialIndex: index,
        identitySignature: `sig-${index}`,
      }),
    )
    const result = selectRepresentatives(candidates)
    for (const representative of result) {
      expect(candidates).toContain(representative.candidate)
    }
  })
})
