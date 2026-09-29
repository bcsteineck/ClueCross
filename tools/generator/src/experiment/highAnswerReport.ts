// Static HTML report for the high-answer-count experiment, organized by
// authored-answer count. Letters are shown by default (visual structure is
// what's being inspected), with a show/hide toggle. Display rounding only
// happens here; the JSON artifact keeps raw values.

import type { PoolCandidate } from '../pool/generateCandidatePoolSelection.js'
import type { AnswerCountGroup, HighAnswerRepresentative, HighAnswerRun } from './highAnswerExperiment.js'
import { cellSizeAt360 } from './highAnswerExperiment.js'

const INTRINSIC_CELL_PX = 26

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(value: number | null, decimals: number): string {
  if (value === null) return 'n/a'
  return String(Math.round(value * 10 ** decimals) / 10 ** decimals)
}

function board(candidate: PoolCandidate, cellPx: number): string {
  const { construction } = candidate
  const cells = Object.entries(construction.cells)
    .map(([id, letter]) => {
      const p = construction.positions[id]
      return `<div class="cell" style="grid-column:${p.x + 1};grid-row:${p.y + 1}"><span class="letter">${esc(letter)}</span></div>`
    })
    .join('')
  return (
    `<div class="board" style="grid-template-columns:repeat(${construction.width},${cellPx}px);` +
    `grid-template-rows:repeat(${construction.height},${cellPx}px);--cell:${cellPx}px">${cells}</div>`
  )
}

function representative(rep: HighAnswerRepresentative): string {
  const c = rep.candidate
  const { geometry, authoredIntersections: ai, derivedEntries, letters } = c.metrics
  const cell360 = cellSizeAt360(c)
  return `
    <article class="rep">
      <h4>${rep.labels.map(esc).join(' <em>and</em> ')}</h4>
      <div class="views">
        <div><div class="cap">Intrinsic &mdash; ${c.construction.width}&times;${c.construction.height} at ${INTRINSIC_CELL_PX}px</div>${board(c, INTRINSIC_CELL_PX)}</div>
        <div><div class="cap">Fitted to 360px &mdash; ${fmt(cell360, 1)}px cells</div>${board(c, cell360)}</div>
      </div>
      <dl>
        <dt>Selected answers (${c.answerCount})</dt><dd>${esc(c.selectedAnswers.join(', '))}</dd>
        <dt>Actual dimensions</dt><dd>${geometry.boundingWidth}&times;${geometry.boundingHeight} (area ${geometry.boundingArea})</dd>
        <dt>Occupied cells</dt><dd>${geometry.occupiedCellCount}</dd>
        <dt>Density</dt><dd>${fmt(geometry.density, 3)}</dd>
        <dt>Intersections</dt><dd>${ai.totalAuthoredIntersections} total, ${fmt(ai.meanIntersectionsPerAuthoredAnswer, 2)} per answer</dd>
        <dt>Answers with 0&ndash;1 intersections</dt><dd>${ai.zeroOrSingleIntersectionAuthoredAnswerCount}</dd>
        <dt>Derived entries</dt><dd>${derivedEntries.derivedEntryCount} (${derivedEntries.incidentalEntryCount} incidental)</dd>
        <dt>Letters</dt><dd>${letters.distinctLetterCount} distinct, max share ${fmt(letters.maxLetterShare, 3)}</dd>
        <dt>Cell size @ 360</dt><dd>${fmt(cell360, 1)}px</dd>
        <dt>Provenance</dt><dd>trial #${c.representativeTrialIndex}, seed <code>${esc(String(c.representativeSeed))}</code></dd>
      </dl>
    </article>`
}

function section(group: AnswerCountGroup, reps: HighAnswerRepresentative[]): string {
  const g = group.geometry
  return `
    <section id="answers-${group.answerCount}">
      <h2>${group.answerCount} answers</h2>
      <p class="stats">
        ${group.viable} viable / ${group.attempted} attempted (${fmt(group.successRate * 100, 1)}%) &middot;
        ${group.unique} unique (${group.duplicates} duplicate) &middot;
        failures: ${group.failures['budget-exhausted']} search budget exhausted, ${group.failures['no-legal-arrangement']} no legal arrangement, ${group.failures.other} other &middot;
        ${fmt(group.runtimeMs / 1000, 2)}s total, ${fmt(group.meanMsPerTrial, 1)}ms per trial
      </p>
      ${
        group.unique === 0
          ? `<p><em>No valid candidate at this answer count.${group.failures['budget-exhausted'] > 0 ? ' Feasibility at this answer count is unresolved at the current search budget.' : ''}</em></p>`
          : `<p class="stats">Medians over ${group.unique} unique candidates: occupied cells ${fmt(g.occupiedCells, 1)} &middot;
        ${fmt(g.boundingWidth, 1)}&times;${fmt(g.boundingHeight, 1)} (area ${fmt(g.boundingArea, 1)}) &middot; density ${fmt(g.density, 3)} &middot;
        ${fmt(g.meanIntersectionsPerAnswer, 2)} intersections/answer (${fmt(g.totalIntersections, 1)} total) &middot;
        ${fmt(g.lowIntersectionAnswers, 1)} answers with 0&ndash;1 intersections &middot; ${fmt(g.distinctLetters, 1)} distinct letters &middot;
        max letter share ${fmt(g.maxLetterShare, 3)} &middot; ${fmt(g.cellSizeAt360, 1)}px cells @ 360</p>
      ${reps.map(representative).join('')}`
      }
    </section>`
}

const STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; line-height: 1.45; color: #1a1a1a; background: #fafafa; }
  .box { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px 18px; margin: 12px 0 24px; }
  table { border-collapse: collapse; background: #fff; margin: 8px 0 24px; font-size: 0.9em; }
  th, td { border: 1px solid #ddd; padding: 4px 8px; text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  section { border-top: 3px solid #333; margin-top: 36px; padding-top: 8px; }
  .stats { color: #444; font-size: 0.92em; }
  .rep { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px 18px; margin: 14px 0; }
  .rep h4 { margin: 0 0 10px; }
  .views { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; margin-bottom: 10px; }
  .cap { font-size: 0.8em; color: #666; margin-bottom: 4px; }
  .board { display: grid; gap: 1px; background: #999; border: 1px solid #666; width: max-content; }
  .cell { background: #fff; display: flex; align-items: center; justify-content: center; font-family: Menlo, Consolas, monospace; font-weight: 600; font-size: calc(var(--cell) * 0.5); }
  body.hide-letters .letter { visibility: hidden; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 0.85em; margin: 0; }
  dt { font-weight: 600; color: #444; } dd { margin: 0; }
  button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #999; background: #fff; cursor: pointer; }
`

export function renderHighAnswerHtml(
  run: HighAnswerRun,
  groups: AnswerCountGroup[],
  representatives: Map<number, HighAnswerRepresentative[]>,
): string {
  const { config } = run
  const viable = run.subsetTrials.filter((t) => t.ok).length
  const rows = groups
    .map(
      (g) =>
        `<tr><td>${g.answerCount}</td><td>${g.attempted}</td><td>${g.viable}</td><td>${fmt(g.successRate * 100, 1)}%</td>` +
        `<td>${g.unique}</td><td>${g.failures['budget-exhausted']}</td><td>${g.failures['no-legal-arrangement']}</td>` +
        `<td>${fmt(g.geometry.occupiedCells, 1)}</td><td>${fmt(g.geometry.density, 3)}</td>` +
        `<td>${fmt(g.geometry.meanIntersectionsPerAnswer, 2)}</td><td>${fmt(g.geometry.lowIntersectionAnswers, 1)}</td>` +
        `<td>${fmt(g.geometry.boundingArea, 1)}</td><td>${fmt(g.geometry.cellSizeAt360, 1)}</td><td>${fmt(g.runtimeMs / 1000, 2)}s</td></tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ClueCross High-Answer Experiment</title>
  <style>${STYLE}</style>
</head>
<body>
  <h1>ClueCross High-Answer Experiment</h1>
  <div class="box">
    <strong>Methodology</strong>
    <ul>
      <li>Envelope ${config.maxWidth}&times;${config.maxHeight}; requested answer counts ${config.minAnswers}&ndash;${config.maxAnswers}, assigned round-robin by trial index; ${config.maxSubsetTrials} subset trials; seed <code>${esc(config.seed)}</code>; ${config.maxAttempts} placement attempts per trial.</li>
      <li>Geometry rule: every maximal across/down run of 2+ cells is exactly one authored answer &mdash; zero incidental entries, verified for every success.</li>
      <li>&ldquo;Search budget exhausted&rdquo; means the search stopped early; it is not evidence that no arrangement exists.</li>
      <li>Representatives are descriptive single-metric picks within one answer count, not quality rankings. The Phase 4 structural comparator is not used (it is only valid within one selected-answer set).</li>
      <li>Pool (${run.normalizedPool.length} words): ${esc(run.normalizedPool.join(', '))}</li>
    </ul>
  </div>
  <p>${viable} viable of ${run.subsetTrials.length} trials &middot; ${run.candidates.length} unique candidates &middot; ${fmt(run.totalMs / 1000, 2)}s generation</p>
  <p><button type="button" onclick="document.body.classList.toggle('hide-letters')">Show / hide letters</button></p>
  <table>
    <thead><tr><th>Answers</th><th>Attempted</th><th>Viable</th><th>Success</th><th>Unique</th><th>Budget exhausted</th><th>No arrangement</th>
      <th>Med. cells</th><th>Med. density</th><th>Med. int./answer</th><th>Med. 0&ndash;1-int. answers</th><th>Med. area</th><th>Med. px @ 360</th><th>Runtime</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${groups.map((g) => section(g, representatives.get(g.answerCount) ?? [])).join('')}
</body>
</html>`
}
