// Reproducible entry point for the Phase 6 grid-size experiment. Not a
// general-purpose CLI — a single dedicated script that runs the approved
// Dogs-pool configuration across the four candidate grid envelopes and
// writes the JSON + HTML artifacts to tools/generator/output/ (gitignored
// generated content, analogous to dist/).
//
// Run via the same zero-new-dependency approach as the rest of the
// generator:
//   npx tsc -p tools/generator/tsconfig.json
//   node tools/generator/dist/experiment/runGridSizeExperiment.js
//
// This script has no dependency on src/ (it only touches ConstructionSuccess,
// PlacedAnswer, MetricsResult, and candidate-pool output — ConstructionSuccess/
// PlacedAnswer/MetricsResult/PoolCandidate all being generator-internal
// types), so it builds through the same nodenext pipeline as the rest of
// tools/generator/src, with no need to touch the assemble/** exclusion.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOGS_CANDIDATE_POOL } from '../pool/dogsCandidatePool.js'
import { GRID_SIZES, runGridSizeExperiment, verifyTrialPlanAcrossSizes } from './gridSizeExperiment.js'
import { renderExperimentHtml } from './renderHtml.js'
import { toJsonArtifact } from './toJsonArtifact.js'

// Same configuration as the Phase 5 Dogs-pool reference run, extended
// across all four grid sizes. maxAttempts is deliberately omitted so the
// run uses the generator's own default (DEFAULT_MAX_ATTEMPTS).
export const DOGS_SIZE_EXPERIMENT_CONFIG = {
  candidatePool: DOGS_CANDIDATE_POOL,
  seed: 'dogs-experiment-1',
  minAnswers: 6,
  maxAnswers: 12,
  maxSubsetTrials: 500,
  sizes: GRID_SIZES,
}

function outputDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  // dist/experiment/ -> tools/generator/output
  return join(here, '..', '..', 'output')
}

export function main(): void {
  console.log('Running grid-size experiment (Dogs candidate pool)...')
  const start = Date.now()
  const result = runGridSizeExperiment(DOGS_SIZE_EXPERIMENT_CONFIG)
  console.log(`Done in ${Date.now() - start}ms.`)

  for (const size of result.sizes) {
    console.log(
      `  ${size.maxWidth}x${size.maxHeight}: ${size.viableSubsetTrialCount}/${size.subsetTrialsAttempted} viable, ` +
        `${size.uniqueCandidateCount} unique, failures ${JSON.stringify(size.failureReasons)}, ` +
        `${size.geometryViolations.length} geometry violations, ${size.elapsedMs}ms`,
    )
  }

  // The data is only meaningful if every size replayed the same subsets
  // and every success obeys the geometry invariant — refuse to write
  // artifacts otherwise.
  const planProblems = verifyTrialPlanAcrossSizes(result)
  const geometryProblems = result.sizes.flatMap((size) =>
    size.geometryViolations.map((v) => `${size.maxWidth}x${size.maxHeight}: ${v}`),
  )
  if (planProblems.length > 0 || geometryProblems.length > 0) {
    for (const problem of [...planProblems, ...geometryProblems]) console.error(`  ${problem}`)
    throw new Error('Grid-size experiment failed verification; no artifacts written.')
  }
  console.log('  Verified: identical trial plan at every size; zero geometry violations.')

  const dir = outputDir()
  mkdirSync(dir, { recursive: true })

  const jsonPath = join(dir, 'grid-size-experiment.json')
  const htmlPath = join(dir, 'grid-size-experiment.html')

  writeFileSync(jsonPath, JSON.stringify(toJsonArtifact(result), null, 2), 'utf8')
  writeFileSync(htmlPath, renderExperimentHtml(result), 'utf8')

  console.log(`Wrote ${jsonPath}`)
  console.log(`Wrote ${htmlPath}`)
}

// Only run when executed directly (node .../runGridSizeExperiment.js),
// not when imported (e.g. if a future script re-uses DOGS_SIZE_EXPERIMENT_CONFIG).
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}
