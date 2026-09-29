// Entry point for the high-answer-count experiment (see
// highAnswerExperiment.ts). Measurement only.
//
//   npx tsc -p tools/generator/tsconfig.json
//   node tools/generator/dist/experiment/runHighAnswerExperiment.js
//
// Writes tools/generator/output/high-answer-experiment.{json,html}
// (gitignored) and prints a Markdown summary. Refuses to write artifacts
// if any geometry/replay verification fails.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOGS_BREEDS_CANDIDATE_POOL } from '../pool/dogsBreedsCandidatePool.js'
import type { HighAnswerConfig, HighAnswerRepresentative } from './highAnswerExperiment.js'
import {
  groupByAnswerCount,
  isLetterConnected,
  runHighAnswerExperiment,
  selectHighAnswerRepresentatives,
  verifyRun,
} from './highAnswerExperiment.js'
import { renderHighAnswerHtml } from './highAnswerReport.js'
import { summarize } from './summarize.js'

export const DOGS_HIGH_ANSWER_CONFIG: HighAnswerConfig = {
  candidatePool: DOGS_BREEDS_CANDIDATE_POOL,
  seed: 'dogs-high-answer-experiment-1',
  maxWidth: 12,
  maxHeight: 12,
  minAnswers: 10,
  maxAnswers: 16,
  maxSubsetTrials: 500,
  maxAttempts: 10000,
}

const f = (value: number | null, d = 2) => (value === null ? '–' : String(Math.round(value * 10 ** d) / 10 ** d))

export function main(): void {
  const run = runHighAnswerExperiment(DOGS_HIGH_ANSWER_CONFIG)
  const problems = verifyRun(run)
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    throw new Error('High-answer experiment failed verification; no artifacts written.')
  }

  const groups = groupByAnswerCount(run)
  const representatives = new Map<number, HighAnswerRepresentative[]>()
  for (const group of groups) {
    representatives.set(
      group.answerCount,
      selectHighAnswerRepresentatives(run.candidates.filter((c) => c.answerCount === group.answerCount)),
    )
  }

  // Descriptive connectivity/size facts per requested answer count.
  const connectivity = groups.map((group) => {
    const trials = run.subsetTrials.filter((t) => t.attemptedSubset.length === group.answerCount)
    const letters = (words: string[]) => words.reduce((sum, w) => sum + w.length, 0)
    const ok = trials.filter((t) => t.ok)
    const failed = trials.filter((t) => !t.ok)
    return {
      answerCount: group.answerCount,
      letterConnectedSubsets: trials.filter((t) => isLetterConnected(t.attemptedSubset)).length,
      attempted: trials.length,
      medianSubsetLettersSucceeded: summarize(ok.map((t) => letters(t.attemptedSubset)))?.median ?? null,
      medianSubsetLettersFailed: summarize(failed.map((t) => letters(t.attemptedSubset)))?.median ?? null,
    }
  })

  // Per-word: how often a word's inclusion ended in success at 13–16.
  const wordRates = run.normalizedPool.map((word) => {
    const trials = run.subsetTrials.filter((t) => t.attemptedSubset.length >= 13 && t.attemptedSubset.includes(word))
    return { word, attempted: trials.length, succeeded: trials.filter((t) => t.ok).length }
  })

  const lines: string[] = []
  const log = (line = '') => lines.push(line)
  const viable = run.subsetTrials.filter((t) => t.ok).length
  const counts = run.candidates.map((c) => c.answerCount)
  log(`# High-answer experiment — ${run.config.seed}`)
  log(`Verification: replay identical, sizes in bounds, geometry invariant passes, 0 incidental everywhere.`)
  log(`Overall: ${run.subsetTrials.length} trials, ${viable} viable (${f((viable / run.subsetTrials.length) * 100, 1)}%), ` +
    `${run.candidates.length} unique, median answers ${summarize(counts)?.median ?? '–'}, max ${counts.length ? Math.max(...counts) : '–'}, ` +
    `${f(run.totalMs / 1000)}s generation (+ ${f(run.trialTimings.reduce((s, t) => s + t.ms, 0) / 1000)}s timed replay)`)
  log()
  log('| answers | attempted | viable | success | unique | dupes | budget | no arrangement | other | runtime | ms/trial | ms/success |')
  log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const g of groups) {
    log(`| ${g.answerCount} | ${g.attempted} | ${g.viable} | ${f(g.successRate * 100, 1)}% | ${g.unique} | ${g.duplicates} | ` +
      `${g.failures['budget-exhausted']} | ${g.failures['no-legal-arrangement']} | ${g.failures.other} | ${f(g.runtimeMs / 1000)}s | ` +
      `${f(g.meanMsPerTrial, 1)} | ${f(g.meanMsPerSuccess, 1)} |`)
  }
  log()
  log('| answers | cells | W | H | area | density | int/answer | total int | 0–1-int answers | distinct | max share | px@360 |')
  log('|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const g of groups) {
    const m = g.geometry
    log(`| ${g.answerCount} | ${f(m.occupiedCells, 1)} | ${f(m.boundingWidth, 1)} | ${f(m.boundingHeight, 1)} | ${f(m.boundingArea, 1)} | ` +
      `${f(m.density, 3)} | ${f(m.meanIntersectionsPerAnswer)} | ${f(m.totalIntersections, 1)} | ${f(m.lowIntersectionAnswers, 1)} | ` +
      `${f(m.distinctLetters, 1)} | ${f(m.maxLetterShare, 3)} | ${f(m.cellSizeAt360, 1)} |`)
  }
  log()
  log('| answers | letter-connected subsets | median letters (succeeded) | median letters (failed) |')
  log('|---|---|---|---|')
  for (const c of connectivity) {
    log(`| ${c.answerCount} | ${c.letterConnectedSubsets}/${c.attempted} | ${f(c.medianSubsetLettersSucceeded, 1)} | ${f(c.medianSubsetLettersFailed, 1)} |`)
  }
  log()
  log('Per-word success when included in a 13–16 subset: ' +
    wordRates.map((w) => `${w.word} ${w.succeeded}/${w.attempted}`).join(', '))
  log()
  log('## Representatives')
  for (const [count, reps] of representatives) {
    for (const rep of reps) {
      const c = rep.candidate
      const geo = c.metrics.geometry
      const ai = c.metrics.authoredIntersections
      log(`- ${count} answers [${rep.labels.join(' + ')}] trial ${c.representativeTrialIndex}: ${geo.boundingWidth}x${geo.boundingHeight}, ` +
        `${geo.occupiedCellCount} cells, density ${f(geo.density, 3)}, ${ai.totalAuthoredIntersections} int (${f(ai.meanIntersectionsPerAuthoredAnswer)}/answer), ` +
        `${ai.zeroOrSingleIntersectionAuthoredAnswerCount} low-int, ${f(360 / Math.max(geo.boundingWidth, geo.boundingHeight), 1)}px @360 — ${c.selectedAnswers.join(',')}`)
    }
  }

  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'output')
  mkdirSync(dir, { recursive: true })
  const jsonPath = join(dir, 'high-answer-experiment.json')
  const htmlPath = join(dir, 'high-answer-experiment.html')
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        config: run.config,
        totals: { trials: run.subsetTrials.length, viable, unique: run.candidates.length, totalMs: run.totalMs },
        groups,
        connectivity,
        wordRates,
        representatives: [...representatives.entries()].map(([answerCount, reps]) => ({
          answerCount,
          representatives: reps.map((r) => ({
            labels: r.labels,
            selectedAnswers: r.candidate.selectedAnswers,
            construction: r.candidate.construction,
            metrics: r.candidate.metrics,
            representativeTrialIndex: r.candidate.representativeTrialIndex,
          })),
        })),
        trials: run.subsetTrials.map((t, i) => ({
          trialIndex: t.trialIndex,
          seed: t.seed,
          attemptedSubset: t.attemptedSubset,
          ok: t.ok,
          reason: t.ok ? null : t.reason,
          attemptsUsed: t.attemptsUsed,
          ms: run.trialTimings[i].ms,
        })),
      },
      null,
      2,
    ),
    'utf8',
  )
  writeFileSync(htmlPath, renderHighAnswerHtml(run, groups, representatives), 'utf8')
  log()
  log(`Wrote ${jsonPath}`)
  log(`Wrote ${htmlPath}`)
  console.log(lines.join('\n'))
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}
