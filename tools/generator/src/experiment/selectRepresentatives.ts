// Deterministic, transparent selection of a small set of representative
// candidates for human inspection — never "best"/"worst"/"winner". Every
// representative carries a literal label describing exactly which rule
// picked it, so a reader never has to guess why a given board was shown.
//
// Three rules are attempted, in order, for up to 3 representatives:
//   1. nearest the median selected-answer count
//   2. nearest the median occupied-cell count (footprint)
//   3. structurally preferred (Phase 4's compareCandidatesStructurally)
//      among candidates sharing the SAME selected-answer set — the only
//      way that comparator may legally be used (see compare.ts's own
//      guard, which this deliberately never bypasses)
// If no size has two candidates sharing a selected-answer set, rule 3 has
// nothing valid to compare, and a clearly-labeled fallback (highest
// answer count, then lowest, then nearest-median density) is tried
// instead — never faked as a "structural" pick.
//
// If a rule resolves to a candidate already chosen under an earlier
// label, it's skipped rather than duplicated — this can leave fewer than
// 3 representatives, which is preferred over forcing an arbitrary count.

import { compareCandidatesStructurally } from '../pool/compare.js'
import type { PoolCandidate } from '../pool/generateCandidatePoolSelection.js'
import { summarize } from './summarize.js'

export interface RepresentativeCandidate {
  /** Literal, human-readable description of exactly which rule selected this candidate. */
  label: string
  candidate: PoolCandidate
}

function nearestByKey(
  candidates: PoolCandidate[],
  key: (candidate: PoolCandidate) => number,
  target: number,
): PoolCandidate {
  const sorted = [...candidates].sort((a, b) => {
    const distance = Math.abs(key(a) - target) - Math.abs(key(b) - target)
    if (distance !== 0) return distance
    // Deterministic tiebreak: lower representativeTrialIndex first.
    return a.representativeTrialIndex - b.representativeTrialIndex
  })
  return sorted[0]
}

function extremeByKey(
  candidates: PoolCandidate[],
  key: (candidate: PoolCandidate) => number,
  direction: 'highest' | 'lowest',
): PoolCandidate {
  const sorted = [...candidates].sort((a, b) => {
    const delta = direction === 'highest' ? key(b) - key(a) : key(a) - key(b)
    if (delta !== 0) return delta
    return a.representativeTrialIndex - b.representativeTrialIndex
  })
  return sorted[0]
}

export function selectRepresentatives(candidates: PoolCandidate[]): RepresentativeCandidate[] {
  if (candidates.length === 0) return []

  const chosen: RepresentativeCandidate[] = []
  const used = new Set<string>()

  function tryAdd(label: string, candidate: PoolCandidate | undefined): void {
    if (!candidate) return
    if (used.has(candidate.identitySignature)) return
    chosen.push({ label, candidate })
    used.add(candidate.identitySignature)
  }

  // Rule 1: nearest the median selected-answer count.
  const answerCountSummary = summarize(candidates.map((c) => c.answerCount))
  if (answerCountSummary) {
    tryAdd(
      'nearest the median selected-answer count',
      nearestByKey(candidates, (c) => c.answerCount, answerCountSummary.median),
    )
  }

  // Rule 2: nearest the median occupied-cell count.
  const occupiedSummary = summarize(candidates.map((c) => c.metrics.geometry.occupiedCellCount))
  if (occupiedSummary) {
    tryAdd(
      'nearest the median occupied-cell count',
      nearestByKey(candidates, (c) => c.metrics.geometry.occupiedCellCount, occupiedSummary.median),
    )
  }

  // Rule 3: structurally preferred among candidates sharing the same
  // selected-answer set (Phase 4 comparator), or a clearly-labeled
  // fallback if no such group exists in this size's candidates at all.
  const bySelectedSet = new Map<string, PoolCandidate[]>()
  for (const candidate of candidates) {
    const key = candidate.selectedAnswers.join(',')
    const group = bySelectedSet.get(key)
    if (group) group.push(candidate)
    else bySelectedSet.set(key, [candidate])
  }
  const comparableGroups = [...bySelectedSet.values()].filter((group) => group.length >= 2)

  if (comparableGroups.length > 0) {
    comparableGroups.sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length
      return a[0].selectedAnswers.join(',').localeCompare(b[0].selectedAnswers.join(','))
    })
    const group = comparableGroups[0]
    const ordered = [...group].sort(compareCandidatesStructurally)
    tryAdd(
      `structurally preferred (Phase 4 comparator) among ${group.length} candidates sharing the ` +
        `selected-answer set {${group[0].selectedAnswers.join(', ')}}`,
      ordered[0],
    )
  } else {
    tryAdd(
      'highest selected-answer count (no two candidates in this size shared a selected-answer ' +
        'set, so the Phase 4 comparator had nothing valid to compare)',
      extremeByKey(candidates, (c) => c.answerCount, 'highest'),
    )
    if (chosen.length < 3) {
      tryAdd(
        'lowest selected-answer count (same reason: no same-subset alternatives existed)',
        extremeByKey(candidates, (c) => c.answerCount, 'lowest'),
      )
    }
    if (chosen.length < 3) {
      const densitySummary = summarize(candidates.map((c) => c.metrics.geometry.density))
      if (densitySummary) {
        tryAdd(
          'nearest the median density (same reason: no same-subset alternatives existed)',
          nearestByKey(candidates, (c) => c.metrics.geometry.density, densitySummary.median),
        )
      }
    }
  }

  return chosen
}
