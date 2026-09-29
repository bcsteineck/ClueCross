// One press of "Generate Candidates": a thin, deterministic wrapper around
// the generator's existing candidate-pool selection (Phase 5, unchanged).
// No search, placement, or metrics logic lives here.

import { mobileCellSizePx } from '../../tools/generator/src/experiment/renderHtml.js'
import { generateCandidatePoolSelection } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type {
  PoolCandidate,
  PoolSelectionDiversityStats,
} from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { CandidatePoolAnalysis } from './poolDiagnostics'

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
// maxAttempts is deliberately omitted: every trial uses the generator's
// own default (DEFAULT_MAX_ATTEMPTS).
export const WORKSHOP_GENERATION_CONFIG = {
  maxWidth: 12,
  maxHeight: 12,
  minAnswers: 10,
  maxAnswers: 16,
  // Internal subset trials per batch.
  maxSubsetTrials: 100,
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
  /** Unique candidates in deterministic generation order, capped at MAX_DISPLAYED_CANDIDATES. */
  candidates: PoolCandidate[]
  diversity: PoolSelectionDiversityStats
  elapsedMs: number
}

export type GenerateBatchResult = { ok: true; batch: WorkshopBatch } | { ok: false; errors: string[] }

// The clue is required here; everything about the pool itself — including
// the 10-answer minimum — comes from the pool analysis, where only
// error-severity diagnostics block generation (duplicates are removed and
// invalid entries excluded, both reported as info).
export function validateInputs(clue: string, pool: CandidatePoolAnalysis): string[] {
  const errors: string[] = []
  if (clue.trim().length === 0) {
    errors.push('Enter a clue.')
  }
  for (const diagnostic of pool.diagnostics) {
    if (diagnostic.severity === 'error') errors.push(diagnostic.message)
  }
  return errors
}

export function generateBatch(clue: string, pool: CandidatePoolAnalysis, generationNumber: number): GenerateBatchResult {
  const errors = validateInputs(clue, pool)
  if (errors.length > 0) return { ok: false, errors }

  const seed = generationSeed(generationNumber)
  const start = performance.now()
  const result = generateCandidatePoolSelection({
    mode: 'candidate-pool',
    candidatePool: pool.usableAnswers,
    seed,
    ...WORKSHOP_GENERATION_CONFIG,
  })
  const elapsedMs = performance.now() - start

  if (!result.ok) return { ok: false, errors: [result.reason] }

  return {
    ok: true,
    batch: {
      clue: clue.trim(),
      seed,
      generationNumber,
      pool: result.normalizedPool,
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
