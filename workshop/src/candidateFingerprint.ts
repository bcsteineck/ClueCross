import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { ConstructionSuccess } from '../../tools/generator/src/types.js'

// A candidate's persistent identity in the Workshop: the exact crossword it
// would publish. Saved Candidates, the approved Final Puzzle, and the
// Saved/Approved markers on a batch all match on it, across batches and
// restarts.
//
// It is built from the layout alone — the bounding size, and every answer's
// word, direction, and start cell, translated so the layout's top-left cell
// is 0,0 and listed in sorted order — so the same layout found in two
// batches (whatever their seeds, clues, or positions in the gallery) is one
// candidate, and the same answers placed differently are two. Unlike the
// generator's identitySignature it does not merge rotations or reflections:
// those swap Across and Down, which is a different puzzle for players.
//
// The "v1" prefix lets a later format change be told apart from this one.

export const CANDIDATE_FINGERPRINT_PREFIX = 'v1'

export function constructionFingerprint(construction: ConstructionSuccess): string {
  const positions = Object.values(construction.positions)
  const xs = positions.map((position) => position.x)
  const ys = positions.map((position) => position.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const width = Math.max(...xs) - minX + 1
  const height = Math.max(...ys) - minY + 1
  const answers = construction.placedAnswers
    .map((answer) => `${answer.direction === 'across' ? 'A' : 'D'}${answer.start.x - minX},${answer.start.y - minY}:${answer.word}`)
    .sort()
  return `${CANDIDATE_FINGERPRINT_PREFIX};${width}x${height};${answers.join('|')}`
}

// Candidates are immutable once generated or restored, so each is fingerprinted once.
const cache = new WeakMap<PoolCandidate, string>()

export function candidateFingerprint(candidate: PoolCandidate): string {
  let fingerprint = cache.get(candidate)
  if (fingerprint === undefined) {
    fingerprint = constructionFingerprint(candidate.construction)
    cache.set(candidate, fingerprint)
  }
  return fingerprint
}
