// Shapes a SizeExperimentResult into the trimmed, JSON-serializable form
// written to disk. Representative candidates keep their full construction
// (needed to re-render a board later; there are only a handful per size,
// so this stays small) — but the full per-size candidate list is reduced
// to compact summaries (no cells/positions) rather than dumping every
// unique candidate's entire construction, which would make the artifact
// unnecessarily huge without adding reproducibility value the summary
// distributions don't already provide.

import type { CellId, ConstructionSuccess, Position } from '../types.js'
import type { MetricsResult } from '../metrics/metrics.js'
import type { PoolCandidate } from '../pool/generateCandidatePoolSelection.js'
import type {
  SizeExperimentConfig,
  SizeDistributions,
  SizeExperimentResult,
  SizeExperimentSizeResult,
} from './gridSizeExperiment.js'

export interface JsonRepresentative {
  label: string
  selectedAnswers: string[]
  unselectedAnswers: string[]
  answerCount: number
  construction: {
    cells: Record<CellId, string>
    positions: Record<CellId, Position>
    width: number
    height: number
  }
  metrics: MetricsResult
  identitySignature: string
  representativeTrialIndex: number
  sourceTrialIndices: number[]
  duplicateCount: number
}

export interface JsonCandidateSummary {
  selectedAnswers: string[]
  answerCount: number
  occupiedCellCount: number
  boundingWidth: number
  boundingHeight: number
  density: number
  identitySignature: string
  representativeTrialIndex: number
  duplicateCount: number
}

export interface JsonSizeResult {
  maxWidth: number
  maxHeight: number
  subsetTrialsAttempted: number
  viableSubsetTrialCount: number
  failedSubsetTrialCount: number
  uniqueSelectedAnswerSetCount: number
  rawSuccessfulLayoutCount: number
  uniqueCandidateCount: number
  duplicateCandidateCount: number
  authoredRecoveryFailureCount: number
  failureReasons: SizeExperimentSizeResult['failureReasons']
  answerCounts: SizeExperimentSizeResult['answerCounts']
  geometryViolations: string[]
  elapsedMs: number
  distributions: SizeDistributions
  representatives: JsonRepresentative[]
  candidates: JsonCandidateSummary[]
}

export interface JsonArtifact {
  generatedAt: string
  config: SizeExperimentConfig
  sizes: JsonSizeResult[]
}

function toJsonRepresentative(representative: { label: string; candidate: PoolCandidate }): JsonRepresentative {
  const { label, candidate } = representative
  const construction: ConstructionSuccess = candidate.construction
  return {
    label,
    selectedAnswers: candidate.selectedAnswers,
    unselectedAnswers: candidate.unselectedAnswers,
    answerCount: candidate.answerCount,
    construction: {
      cells: construction.cells,
      positions: construction.positions,
      width: construction.width,
      height: construction.height,
    },
    metrics: candidate.metrics,
    identitySignature: candidate.identitySignature,
    representativeTrialIndex: candidate.representativeTrialIndex,
    sourceTrialIndices: candidate.sourceTrialIndices,
    duplicateCount: candidate.duplicateCount,
  }
}

function toJsonCandidateSummary(candidate: PoolCandidate): JsonCandidateSummary {
  return {
    selectedAnswers: candidate.selectedAnswers,
    answerCount: candidate.answerCount,
    occupiedCellCount: candidate.metrics.geometry.occupiedCellCount,
    boundingWidth: candidate.metrics.geometry.boundingWidth,
    boundingHeight: candidate.metrics.geometry.boundingHeight,
    density: candidate.metrics.geometry.density,
    identitySignature: candidate.identitySignature,
    representativeTrialIndex: candidate.representativeTrialIndex,
    duplicateCount: candidate.duplicateCount,
  }
}

export function toJsonArtifact(result: SizeExperimentResult, generatedAt: string = new Date().toISOString()): JsonArtifact {
  return {
    generatedAt,
    config: result.config,
    sizes: result.sizes.map((size) => ({
      maxWidth: size.maxWidth,
      maxHeight: size.maxHeight,
      subsetTrialsAttempted: size.subsetTrialsAttempted,
      viableSubsetTrialCount: size.viableSubsetTrialCount,
      failedSubsetTrialCount: size.failedSubsetTrialCount,
      uniqueSelectedAnswerSetCount: size.uniqueSelectedAnswerSetCount,
      rawSuccessfulLayoutCount: size.rawSuccessfulLayoutCount,
      uniqueCandidateCount: size.uniqueCandidateCount,
      duplicateCandidateCount: size.duplicateCandidateCount,
      authoredRecoveryFailureCount: size.authoredRecoveryFailureCount,
      failureReasons: size.failureReasons,
      answerCounts: size.answerCounts,
      geometryViolations: size.geometryViolations,
      elapsedMs: size.elapsedMs,
      distributions: size.distributions,
      representatives: size.representatives.map(toJsonRepresentative),
      candidates: size.candidates.map(toJsonCandidateSummary),
    })),
  }
}
