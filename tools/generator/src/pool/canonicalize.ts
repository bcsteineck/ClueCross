// Canonical signature for a construction's authored-answer geometry, used
// to detect when two different seeds produced the same layout up to the
// square grid's symmetry group (translation is already handled by Phase
// 1's own origin normalization; this module additionally covers rotation
// and reflection).
//
// Two constructions are equivalent here only if there is a single
// symmetry transform under which EVERY authored answer's own (word,
// transformed cell-position sequence) matches some answer in the other
// construction — not merely if the two constructions occupy the same set
// of cells. A signature is built per transform by pairing each answer's
// word with its transformed position sequence (order preserved, so the
// sequence itself encodes the transformed start and direction — no
// separate direction field is needed), sorting those per-answer strings
// so answer-placement order doesn't matter, and joining them. The
// signature does not separately encode letters: an authored answer's word
// already determines the letter at each position in its own span, and
// every occupied cell belongs to exactly one or more authored answers
// (Phase 1 never produces an orphan cell), so the set of (word,
// transformed positions) pairs already accounts for all occupied geometry
// and its letters.
//
// Canonicalization is for signature/deduplication purposes only — it
// never mutates or re-labels the actual construction, and it does not
// check whether a transformed shape would still fit any particular
// maxWidth/maxHeight envelope (see generateCandidatePool.ts, where
// dedup only ever happens within one pool's single fixed configuration
// anyway).
//
// One consequence worth documenting for anyone extending the tests here:
// PlacedAnswer can only represent a word read forward (ascending x for
// across, ascending y for down) — Phase 1 never places one "backward".
// rotate180 and the anti-diagonal reflection negate a word's own varying
// coordinate, which reverses that ascending order for ANY 2+-letter word,
// palindromes included (reversing preserves a palindrome's LETTERS but
// not this module's position-indexed signature, which is intentionally
// sensitive to more than just the resulting letter pattern — see the
// module comment above). So two genuinely independent, real
// (forward-only) constructions can never be related by rotate180 or the
// anti-diagonal reflection alone for a 2+-letter word; those two
// transforms still have to be searched (a hand-built or future non-
// Phase-1 input could use them), but black-box "two independent
// fixtures" tests for them specifically aren't constructible the way the
// other six are — see canonicalize.test.ts, which tests those two via
// the exported per-transform signature function directly instead.

import { answerCellIds, buildCellAt } from '../derive/derivePlayableEntries.js'
import type { CellId, PlacedAnswer, Position } from '../types.js'

export type SymmetryTransform = (x: number, y: number) => Position

export interface NamedSymmetryTransform {
  name: string
  apply: SymmetryTransform
}

// The 8 symmetries of a square (dihedral group D4), applied to integer
// lattice coordinates. Each produces a valid but not-yet-renormalized set
// of positions — canonicalSignature renormalizes per transform below.
export const SYMMETRY_TRANSFORMS: readonly NamedSymmetryTransform[] = [
  { name: 'identity', apply: (x, y) => ({ x, y }) },
  { name: 'rotate90', apply: (x, y) => ({ x: y, y: -x }) },
  { name: 'rotate180', apply: (x, y) => ({ x: -x, y: -y }) },
  { name: 'rotate270', apply: (x, y) => ({ x: -y, y: x }) },
  { name: 'reflectHorizontal', apply: (x, y) => ({ x: -x, y }) },
  { name: 'reflectVertical', apply: (x, y) => ({ x, y: -y }) },
  { name: 'reflectMainDiagonal', apply: (x, y) => ({ x: y, y: x }) },
  { name: 'reflectAntiDiagonal', apply: (x, y) => ({ x: -y, y: -x }) },
]

// Exported for direct, precise per-transform testing (see the module
// comment above on why rotate180/reflectAntiDiagonal specifically need
// this rather than a black-box "two fixtures" test). Computes one
// transform's renormalized (word, transformed-position-sequence)
// signature for a whole construction.
export function signatureUnderTransform(
  transform: SymmetryTransform,
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
  cellAt: Map<string, CellId>,
): string {
  const perAnswer = placedAnswers.map((answer) => {
    const cellIds = answerCellIds(answer, cellAt)
    const transformed = cellIds.map((cellId) => {
      const position = positions[cellId]
      return transform(position.x, position.y)
    })
    return { word: answer.word, transformed }
  })

  // Renormalize to origin AFTER transforming: a rotation/reflection can
  // move the shape away from (0,0) even though the untransformed
  // construction was already normalized there.
  const allPoints = perAnswer.flatMap((answer) => answer.transformed)
  const minX = Math.min(...allPoints.map((point) => point.x))
  const minY = Math.min(...allPoints.map((point) => point.y))

  const perAnswerSignatures = perAnswer
    .map((answer) => {
      const coordinates = answer.transformed.map((point) => `${point.x - minX},${point.y - minY}`).join(';')
      return `${answer.word}@${coordinates}`
    })
    .sort()

  return perAnswerSignatures.join('|')
}

// The lexicographically smallest of the 8 per-transform signatures,
// chosen deterministically as the canonical representative. Two
// constructions produce the same canonicalSignature if and only if some
// symmetry transform maps one's authored-answer placement exactly onto
// the other's.
export function canonicalSignature(
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
): string {
  const cellAt = buildCellAt(positions)
  const signatures = SYMMETRY_TRANSFORMS.map(({ apply }) =>
    signatureUnderTransform(apply, placedAnswers, positions, cellAt),
  )
  return signatures.slice().sort()[0]
}
