// Multi-seed orchestration around the existing Phase 1 fixed-answer
// constructor: run the same normalized answer set across many
// deterministic seeds, collect what succeeded, collapse symmetry-
// equivalent layouts into unique candidates (see canonicalize.ts), and
// attach the existing Phase 3 MetricsResult to each unique candidate.
//
// This file does not implement or duplicate any search logic — it only
// calls constructFixedAnswerPuzzle once per seed and organizes the
// results. It is still fixed-answer mode only: every candidate produced
// by one generateCandidatePool call shares the same answers/maxWidth/
// maxHeight, since that's exactly what CandidatePoolConfig requires as a
// single config for the whole pool.

import { constructFixedAnswerPuzzle } from '../placement/backtrack.js'
import { computeMetrics } from '../metrics/metrics.js'
import type { MetricsResult } from '../metrics/metrics.js'
import type { ConstructionSuccess } from '../types.js'
import { canonicalSignature } from './canonicalize.js'

export interface CandidatePoolConfig {
  answers: string[]
  maxWidth: number
  maxHeight: number
  seeds: (number | string)[]
  maxAttempts?: number
}

export interface SeedAttemptSuccess {
  seed: number | string
  ok: true
  attemptsUsed: number
  construction: ConstructionSuccess
}

export interface SeedAttemptFailure {
  seed: number | string
  ok: false
  attemptsUsed: number
  reason: string
}

export type SeedAttempt = SeedAttemptSuccess | SeedAttemptFailure

export interface Candidate {
  construction: ConstructionSuccess
  metrics: MetricsResult
  canonicalSignature: string
  /** The first attempted seed that produced this canonical layout. */
  representativeSeed: number | string
  /** Every seed (including the representative) that produced this canonical layout, in attempt order. */
  sourceSeeds: (number | string)[]
  /** sourceSeeds.length - 1 — how many OTHER seeds also produced this same layout. */
  duplicateCount: number
}

export interface PoolDiversityStats {
  attemptedSeedCount: number
  successfulSeedCount: number
  failedSeedCount: number
  /**
   * Layouts produced before symmetry deduplication. Always equal to
   * successfulSeedCount in this architecture (one seed produces at most
   * one layout) — kept as its own field because it answers a distinct
   * question ("how many layouts exist") from successfulSeedCount ("how
   * many seed attempts succeeded"), even though the two numbers coincide
   * today.
   */
  rawSuccessfulLayoutCount: number
  uniqueLayoutCount: number
  duplicateLayoutCount: number
  /**
   * uniqueLayoutCount / rawSuccessfulLayoutCount. `null` (not NaN/Infinity)
   * when rawSuccessfulLayoutCount is 0 — there is no rate to report when
   * nothing succeeded, and 0 would misleadingly suggest layouts existed
   * but were all duplicates.
   */
  uniquenessRate: number | null
}

export interface CandidatePoolResult {
  config: CandidatePoolConfig
  seedAttempts: SeedAttempt[]
  candidates: Candidate[]
  diversity: PoolDiversityStats
}

function isSuccess(attempt: SeedAttempt): attempt is SeedAttemptSuccess {
  return attempt.ok
}

export function generateCandidatePool(config: CandidatePoolConfig): CandidatePoolResult {
  const seedAttempts: SeedAttempt[] = config.seeds.map((seed) => {
    const result = constructFixedAnswerPuzzle({
      mode: 'fixed-answer',
      answers: config.answers,
      maxWidth: config.maxWidth,
      maxHeight: config.maxHeight,
      seed,
      maxAttempts: config.maxAttempts,
    })
    if (result.ok) {
      return { seed, ok: true, attemptsUsed: result.attemptsUsed, construction: result }
    }
    return { seed, ok: false, attemptsUsed: result.attemptsUsed, reason: result.reason }
  })

  const successes = seedAttempts.filter(isSuccess)

  // Group successes by canonical signature, in attempt order, so the
  // first-encountered seed for a given layout is a well-defined,
  // deterministic representative (documented policy — see the Phase 4
  // checkpoint report).
  const groups = new Map<string, SeedAttemptSuccess[]>()
  for (const success of successes) {
    const signature = canonicalSignature(success.construction.placedAnswers, success.construction.positions)
    const group = groups.get(signature)
    if (group) group.push(success)
    else groups.set(signature, [success])
  }

  const metricsConfig = { maxWidth: config.maxWidth, maxHeight: config.maxHeight }
  const candidates: Candidate[] = [...groups.entries()].map(([signature, group]) => {
    const representative = group[0]
    return {
      construction: representative.construction,
      metrics: computeMetrics(representative.construction, metricsConfig),
      canonicalSignature: signature,
      representativeSeed: representative.seed,
      sourceSeeds: group.map((attempt) => attempt.seed),
      duplicateCount: group.length - 1,
    }
  })

  const rawSuccessfulLayoutCount = successes.length
  const uniqueLayoutCount = candidates.length

  const diversity: PoolDiversityStats = {
    attemptedSeedCount: config.seeds.length,
    successfulSeedCount: successes.length,
    failedSeedCount: seedAttempts.length - successes.length,
    rawSuccessfulLayoutCount,
    uniqueLayoutCount,
    duplicateLayoutCount: rawSuccessfulLayoutCount - uniqueLayoutCount,
    uniquenessRate: rawSuccessfulLayoutCount === 0 ? null : uniqueLayoutCount / rawSuccessfulLayoutCount,
  }

  return { config, seedAttempts, candidates, diversity }
}
