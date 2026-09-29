// A conservative, explicitly experimental structural comparator for
// candidates that share the same authored-answer set and the same
// maxWidth/maxHeight configuration — never a general-purpose "puzzle
// quality" ranking. It produces an ordering (-1/0/1), never a numeric
// score: there is no blended/weighted formula here, and none of the old
// planning-report weights (0.30 * density + ...) were carried forward —
// they were never validated against real generated output.
//
// The criteria below are deliberately narrower than the original
// five-criterion hypothesis from planning. Reviewing the actual Phase 3
// metric shapes and Phase 1's own placement invariants ruled out two of
// the five (see each criterion's rationale/limitation, and the Phase 4
// checkpoint report, for why). It is acceptable — and preferred — for
// this comparator to compare on fewer criteria than originally proposed
// rather than include one the evidence doesn't support.

import type { Candidate } from './generateCandidatePool.js'

export type ComparisonResult = -1 | 0 | 1

export interface StructuralComparisonCriterion {
  name: string
  direction: 'higher-is-preferred' | 'lower-is-preferred'
  rationale: string
  limitation: string
  read: (candidate: Candidate) => number
}

export const STRUCTURAL_COMPARISON_CRITERIA: readonly StructuralComparisonCriterion[] = [
  {
    name: 'fewerWeaklyConnectedAuthoredAnswers',
    direction: 'lower-is-preferred',
    rationale:
      'Fewer authored answers with 0 or 1 intersection suggests a more evenly interconnected ' +
      'puzzle. Phase 1 requires every answer but the seed to cross the grid-so-far at the moment ' +
      "it's placed, and a crossing is never removed once formed, so in any legitimate multi-answer " +
      'construction the zero-intersection component of this count is always 0 — this criterion is ' +
      'therefore effectively "fewer single-intersection answers" today. It reuses the existing ' +
      'zeroOrSingleIntersectionAuthoredAnswerCount metric field rather than inventing a new one, ' +
      'since the always-0 component never changes the comparison.',
    limitation:
      'Says how MANY answers are weakly connected, not which ones or how severely; two candidates ' +
      'tied on this count can still differ structurally in ways this criterion cannot see.',
    read: (candidate) => candidate.metrics.authoredIntersections.zeroOrSingleIntersectionAuthoredAnswerCount,
  },
  {
    name: 'higherMinimumAuthoredIntersectionCount',
    direction: 'higher-is-preferred',
    rationale:
      'A higher floor means even the least-connected authored answer has more than the bare ' +
      'minimum of one crossing — a distinct signal from the first criterion, which counts how many ' +
      'answers are weak rather than how weak the weakest one is.',
    limitation:
      'Determined entirely by a single outlier answer; says nothing about the rest of the puzzle.',
    read: (candidate) => candidate.metrics.authoredIntersections.minIntersectionsPerAuthoredAnswer,
  },
  {
    name: 'higherDensity',
    direction: 'higher-is-preferred',
    rationale:
      'Higher occupiedCellCount/boundingArea means the authored content is packed more tightly ' +
      'into its own footprint. Density (rather than raw bounding area) was chosen because it already ' +
      "normalizes for occupied-cell count, which itself varies slightly between candidates from the " +
      "same answer set depending on how many crossings each has; using both density and bounding " +
      'area as separate criteria would double-count the same compactness signal without ' +
      'justification for weighting one over the other.',
    limitation:
      'Measures packing tightness only, not visual pleasantness — a dense but irregularly-shaped ' +
      'bounding box scores identically to a dense, clean rectangle.',
    read: (candidate) => candidate.metrics.geometry.density,
  },
] as const

// Criteria considered during planning and explicitly NOT included, kept
// here (rather than silently dropped) so the omission is traceable:
//   - "fewer zero-intersection authored answers" on its own: always 0 for
//     legitimate multi-answer output (see the first criterion above), so
//     it can never discriminate between candidates.
//   - "fewer incidental derived entries": there is no evidence yet that
//     incidental entries are undesirable — including this would encode an
//     unvalidated aesthetic judgment as if it were a structural fact.
//   - "smaller bounding area" as a SEPARATE criterion from density: see
//     the density criterion's rationale above.

function assertComparable(a: Candidate, b: Candidate): void {
  const wordsA = a.construction.placedAnswers.map((answer) => answer.word).sort()
  const wordsB = b.construction.placedAnswers.map((answer) => answer.word).sort()
  const sameWords = wordsA.length === wordsB.length && wordsA.every((word, index) => word === wordsB[index])
  if (!sameWords) {
    throw new Error(
      'Cannot structurally compare candidates: they were generated from different authored-answer sets.',
    )
  }

  const envelopeA = a.metrics.geometry
  const envelopeB = b.metrics.geometry
  if (
    envelopeA.configuredMaxWidth !== envelopeB.configuredMaxWidth ||
    envelopeA.configuredMaxHeight !== envelopeB.configuredMaxHeight
  ) {
    throw new Error(
      'Cannot structurally compare candidates: they were generated under different maxWidth/maxHeight configurations.',
    )
  }
}

// Returns -1 when `a` is preferred over `b`, 1 when `b` is preferred, and
// 0 when every criterion ties (including when a and b are the same
// candidate). Throws — rather than silently comparing — when the two
// candidates don't share an authored-answer set and configuration, since
// this ordering is only ever valid for genuinely like-for-like
// candidates.
export function compareCandidatesStructurally(a: Candidate, b: Candidate): ComparisonResult {
  assertComparable(a, b)

  for (const criterion of STRUCTURAL_COMPARISON_CRITERIA) {
    const valueA = criterion.read(a)
    const valueB = criterion.read(b)
    if (valueA === valueB) continue
    const aIsPreferred = criterion.direction === 'higher-is-preferred' ? valueA > valueB : valueA < valueB
    return aIsPreferred ? -1 : 1
  }
  return 0
}

// Convenience wrapper: an explicitly experimental ORDERING (see the
// module comment), not a ranking with scores. Does not mutate `candidates`.
export function orderCandidatesStructurally(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(compareCandidatesStructurally)
}
