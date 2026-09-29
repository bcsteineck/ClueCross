// Entry point for the search-budget experiment (see budgetExperiment.ts).
// Measurement only: nothing here changes generator defaults.
//
//   npx tsc -p tools/generator/tsconfig.json
//   node tools/generator/dist/experiment/runBudgetExperiment.js
//
// Writes tools/generator/output/budget-experiment.json (gitignored) and
// prints a Markdown report. Candidate/yield results are deterministic; the
// whole budget sequence is repeated TIMING_REPEATS times purely to show
// wall-clock noise, and every repeat is checked to produce identical
// trial outcomes.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOGS_CANDIDATE_POOL } from '../pool/dogsCandidatePool.js'
import type { BudgetExperimentConfig, BudgetRun, BudgetSummary } from './budgetExperiment.js'
import {
  ANSWER_COUNTS,
  analyzeRecovery,
  failureKind,
  marginal,
  runBudget,
  summarizeBudget,
  verifyGeometry,
  verifyMonotonic,
  verifyTrialPlanIdentity,
} from './budgetExperiment.js'

export const DOGS_BUDGET_EXPERIMENT_CONFIG: BudgetExperimentConfig = {
  candidatePool: DOGS_CANDIDATE_POOL,
  seed: 'dogs-budget-experiment-1',
  maxWidth: 12,
  maxHeight: 12,
  minAnswers: 6,
  maxAnswers: 12,
  maxSubsetTrials: 500,
  budgets: [5000, 10000, 20000, 50000],
}

const TIMING_REPEATS = 3
const WORKSHOP_TRIALS = 100

const pct = (value: number | null) => (value === null ? '–' : `${(value * 100).toFixed(1)}%`)
const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function outcomeSignature(run: BudgetRun): string {
  return run.result.subsetTrials.map((t) => (t.ok ? JSON.stringify(t.construction) : failureKind(t))).join('|')
}

function summaryTable(summaries: BudgetSummary[]): string[] {
  const lines = [
    '| maxAttempts | viable | success | unique | dupes | failed | median | 8–12 | 10–12 | 11–12 | runtime (median) | per trial | per viable |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ]
  for (const s of summaries) {
    lines.push(
      `| ${s.maxAttempts} | ${s.viableTrials} | ${pct(s.successRate)} | ${s.uniqueCandidates} | ${s.duplicateCandidates} | ` +
        `${s.failedTrials} | ${s.answers.median ?? '–'} | ${s.answers.count8to12} (${pct(s.answers.share8to12)}) | ` +
        `${s.answers.count10to12} (${pct(s.answers.share10to12)}) | ${s.answers.count11to12} (${pct(s.answers.share11to12)}) | ` +
        `${secs(s.elapsedMs)} | ${(s.elapsedMs / s.trialsAttempted).toFixed(2)}ms | ` +
        `${s.viableTrials ? (s.elapsedMs / s.viableTrials).toFixed(2) + 'ms' : '–'} |`,
    )
  }
  return lines
}

function distributionTable(summaries: BudgetSummary[]): string[] {
  return [
    `| maxAttempts | ${ANSWER_COUNTS.join(' | ')} |`,
    `|---|${ANSWER_COUNTS.map(() => '---').join('|')}|`,
    ...summaries.map((s) => `| ${s.maxAttempts} | ${ANSWER_COUNTS.map((n) => s.answers.distribution[n]).join(' | ')} |`),
  ]
}

export function main(): void {
  const config = DOGS_BUDGET_EXPERIMENT_CONFIG
  const report: string[] = []
  const log = (line = '') => report.push(line)

  // Repeat the whole sequence for timing; results must be identical each time.
  const repeats: BudgetRun[][] = []
  for (let r = 0; r < TIMING_REPEATS; r++) {
    repeats.push(config.budgets.map((budget) => runBudget(config, budget)))
  }
  const runs = repeats[0]
  const timingMs = config.budgets.map((_, b) => repeats.map((repeat) => repeat[b].elapsedMs))
  const medianRuns: BudgetRun[] = runs.map((run, b) => ({ ...run, elapsedMs: median(timingMs[b]) }))

  const problems = [
    ...verifyTrialPlanIdentity(runs),
    ...verifyMonotonic(runs),
    ...runs.flatMap(verifyGeometry),
    ...repeats.slice(1).flatMap((repeat, r) =>
      repeat
        .filter((run, b) => outcomeSignature(run) !== outcomeSignature(runs[b]))
        .map((run) => `repeat ${r + 2}: outcomes differ at ${run.maxAttempts}`),
    ),
  ]

  const full = medianRuns.map((run) => summarizeBudget(run))

  // First-100 snapshot: outcomes come from the 500-trial plan's prefix;
  // runtime comes from real maxSubsetTrials=100 runs of the SAME seed
  // (identical first 100 trials), which must produce identical summaries.
  const workshopConfig = { ...config, maxSubsetTrials: WORKSHOP_TRIALS }
  const first100 = medianRuns.map((run, b) => {
    const timed = Array.from({ length: TIMING_REPEATS }, () => runBudget(workshopConfig, run.maxAttempts))
    const prefix = summarizeBudget(run, WORKSHOP_TRIALS)
    const direct = summarizeBudget(timed[0])
    if (JSON.stringify({ ...prefix, elapsedMs: 0 }) !== JSON.stringify({ ...direct, elapsedMs: 0 })) {
      problems.push(`first-${WORKSHOP_TRIALS} prefix differs from a direct ${WORKSHOP_TRIALS}-trial run at ${config.budgets[b]}`)
    }
    return { ...prefix, elapsedMs: median(timed.map((t) => t.elapsedMs)) }
  })
  const recovery = analyzeRecovery(runs)
  const finalRun = runs[runs.length - 1]

  log(`# Search-budget experiment — ${config.seed}, ${config.maxSubsetTrials} trials, ${config.maxWidth}x${config.maxHeight}`)
  log()
  log(`Verification problems: ${problems.length === 0 ? 'none' : ''}`)
  for (const p of problems) log(`- ${p}`)
  log()
  log('## Full 500-trial plan (unique candidates; runtime = median of repeats)')
  summaryTable(full).forEach((l) => log(l))
  log()
  distributionTable(full).forEach((l) => log(l))
  log()
  log('## Failure reasons')
  log('| maxAttempts | budget exhausted | no legal arrangement (proven) | other |')
  log('|---|---|---|---|')
  for (const s of full) {
    log(`| ${s.maxAttempts} | ${s.failures['budget-exhausted']} | ${s.failures['no-legal-arrangement']} | ${s.failures.other} |`)
  }
  log()
  log('## Marginal')
  log('| step | +viable | +% | +8–12 | +10–12 | +11–12 | +runtime | +% runtime | viable per extra second |')
  log('|---|---|---|---|---|---|---|---|---|')
  for (let i = 1; i < full.length; i++) {
    const m = marginal(full[i - 1], full[i])
    log(
      `| ${m.from}→${m.to} | ${m.additionalViable} | ${pct(m.viableIncrease)} | ${m.additional8to12} | ` +
        `${m.additional10to12} | ${m.additional11to12} | ${secs(m.additionalMs)} | ${pct(m.runtimeIncrease)} | ` +
        `${m.viablePerAdditionalSecond?.toFixed(1) ?? '–'} |`,
    )
  }
  log()
  log('## Per-trial recovery (budget of first success, by attempted subset size)')
  const keys = [...config.budgets.map(String), 'never']
  log(`| first success | ${ANSWER_COUNTS.join(' | ')} | total |`)
  log(`|---|${ANSWER_COUNTS.map(() => '---').join('|')}|---|`)
  for (const key of keys) {
    const row = recovery.bySubsetSize[key] ?? {}
    const total = ANSWER_COUNTS.reduce((sum, n) => sum + (row[n] ?? 0), 0)
    log(`| ${key} | ${ANSWER_COUNTS.map((n) => row[n] ?? 0).join(' | ')} | ${total} |`)
  }
  const neverKinds = { 'budget-exhausted': 0, 'no-legal-arrangement': 0, other: 0 }
  finalRun.result.subsetTrials.forEach((t) => {
    const kind = failureKind(t)
    if (kind) neverKinds[kind] += 1
  })
  log(`Never succeeded, by final (${finalRun.maxAttempts}) failure reason: ${JSON.stringify(neverKinds)}`)
  log()
  log(`| never succeeded, reason at ${finalRun.maxAttempts} | ${ANSWER_COUNTS.join(' | ')} |`)
  log(`|---|${ANSWER_COUNTS.map(() => '---').join('|')}|`)
  for (const kind of ['budget-exhausted', 'no-legal-arrangement'] as const) {
    const bySize = ANSWER_COUNTS.map(
      (n) => finalRun.result.subsetTrials.filter((t) => failureKind(t) === kind && t.attemptedSubset.length === n).length,
    )
    log(`| ${kind} | ${bySize.join(' | ')} |`)
  }
  log()
  log(`## First ${WORKSHOP_TRIALS} trials of the same plan (Workshop batch size)`)
  summaryTable(first100).forEach((l) => log(l))
  log()
  distributionTable(first100).forEach((l) => log(l))
  log()
  log('## Timing repeats (ms, full 500-trial plan)')
  config.budgets.forEach((budget, b) => log(`- ${budget}: ${timingMs[b].map((ms) => ms.toFixed(0)).join(', ')}`))

  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'output')
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'budget-experiment.json')
  writeFileSync(
    jsonPath,
    JSON.stringify({ config, problems, timingMs, full, first100, recovery }, null, 2),
    'utf8',
  )
  log()
  log(`Wrote ${jsonPath}`)
  console.log(report.join('\n'))
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}
