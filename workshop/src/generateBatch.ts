// One press of "Generate Candidates": a thin, deterministic wrapper around
// the generator's existing candidate-pool selection (Phase 5, unchanged).
// No search, placement, or metrics logic lives here.

import { mobileCellSizePx } from '../../tools/generator/src/experiment/renderHtml.js'
import {
  generateCandidatePoolSelection,
  SELECTED_CONSTRUCTION_RESTARTS,
} from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type {
  PoolCandidate,
  PoolSelectionDiversityStats,
} from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { CandidatePoolAnalysis } from './poolDiagnostics'
import { analyzePriorityWords } from './priorityWords'

// The 12x12 envelope is the primary ClueCross size constraint: a ceiling,
// not a target — actual puzzles are often smaller.
//
// 10–16 is the current Workshop search range, not a permanent product
// rule. 10 is the floor because 6–9-answer generations looked too sparse
// in manual testing; 16 is a practical computational ceiling, not a
// product maximum. The pool API caps the effective maximum at the pool
// size, so a 10–15-word pool never attempts impossible subset sizes.
// Pools dominated by long words may yield few or no candidates in this
// range; that's reported as-is, with no fallback to smaller answer counts.
// Each subset trial runs deterministic construction restarts (5 × 2,000
// attempts, stopping at the first success) instead of one 10,000-attempt
// search; the 10,000-attempt maximum per trial is unchanged. See
// docs/decisions.md, "Deterministic Construction Restarts".
export const WORKSHOP_GENERATION_CONFIG = {
  maxWidth: 12,
  maxHeight: 12,
  minAnswers: 10,
  maxAnswers: 16,
  // Internal subset trials per batch.
  maxSubsetTrials: 100,
  constructionRestarts: SELECTED_CONSTRUCTION_RESTARTS,
} as const

export const MAX_DISPLAYED_CANDIDATES = 20

export function generationSeed(generationNumber: number): string {
  return `workshop-generation-${generationNumber}`
}

export interface WorkshopBatch {
  clue: string
  seed: string
  generationNumber: number
  pool: string[]
  /** The Priority Words this batch was generated with (every candidate contains all of them); empty when unconstrained. */
  priorityWords: string[]
  /** Unique candidates in deterministic generation order, capped at MAX_DISPLAYED_CANDIDATES. */
  candidates: PoolCandidate[]
  diversity: PoolSelectionDiversityStats
  elapsedMs: number
}

export type GenerateBatchResult = { ok: true; batch: WorkshopBatch } | { ok: false; errors: string[] }

// The clue is required here; everything about the pool itself — including
// the 10-answer minimum — comes from the pool analysis, where only
// error-severity diagnostics block generation (duplicates are removed and
// invalid entries excluded, both reported as info). Priority Word errors
// (missing from the pool, too many, provably uncrossable) block it too.
export function validateInputs(clue: string, pool: CandidatePoolAnalysis, priorityWords: readonly string[] = []): string[] {
  const errors: string[] = []
  if (clue.trim().length === 0) {
    errors.push('Enter a clue.')
  }
  for (const diagnostic of pool.diagnostics) {
    if (diagnostic.severity === 'error') errors.push(diagnostic.message)
  }
  for (const diagnostic of analyzePriorityWords(priorityWords, pool.usableAnswers)) {
    errors.push(diagnostic.message)
  }
  return errors
}

export function generateBatch(
  clue: string,
  pool: CandidatePoolAnalysis,
  generationNumber: number,
  priorityWords: readonly string[] = [],
): GenerateBatchResult {
  const errors = validateInputs(clue, pool, priorityWords)
  if (errors.length > 0) return { ok: false, errors }

  const seed = generationSeed(generationNumber)
  const start = performance.now()
  let result: ReturnType<typeof generateCandidatePoolSelection>
  try {
    result = generateCandidatePoolSelection({
      mode: 'candidate-pool',
      candidatePool: pool.usableAnswers,
      seed,
      ...WORKSHOP_GENERATION_CONFIG,
      requiredAnswers: [...priorityWords],
    })
  } catch (error) {
    // Only a violated generator invariant throws (e.g. a candidate missing
    // a required answer); report it rather than showing any candidates.
    return {
      ok: false,
      errors: [`Unexpected generator error: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
  const elapsedMs = performance.now() - start

  if (!result.ok) return { ok: false, errors: [result.reason] }

  return {
    ok: true,
    batch: {
      clue: clue.trim(),
      seed,
      generationNumber,
      pool: result.normalizedPool,
      priorityWords: [...priorityWords],
      candidates: result.candidates.slice(0, MAX_DISPLAYED_CANDIDATES),
      diversity: result.diversity,
      elapsedMs,
    },
  }
}

// Informational only — never used to filter, rank, or grade candidates.
export function formatMobileCellSize(boundingWidth: number, boundingHeight: number): string {
  const px = mobileCellSizePx(boundingWidth, boundingHeight, 360)
  return `${Number(px.toFixed(1))}px`
}
