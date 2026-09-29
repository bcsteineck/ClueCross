// Static HTML comparison report for a grid-size experiment result. No
// React, no build step, no server, no external JS/CSS dependency —
// openable directly from disk in a browser. This is a reporting/debugging
// artifact, not the production ClueCross UI, and does not claim to
// reproduce it pixel-for-pixel.
//
// Numbers here are display-rounded for readability; the underlying
// SizeExperimentResult (and the JSON artifact) keep raw floating-point
// precision — rounding is strictly a rendering concern, done in this file
// only.

import { DEFAULT_MAX_ATTEMPTS } from '../placement/backtrack.js'
import type { PoolCandidate } from '../pool/generateCandidatePoolSelection.js'
import { ANSWER_COUNTS } from './budgetExperiment.js'
import type { RepresentativeCandidate } from './selectRepresentatives.js'
import type {
  GridSize,
  SizeDistributions,
  SizeExperimentResult,
  SizeExperimentSizeResult,
} from './gridSizeExperiment.js'
import type { NumericSummary } from './summarize.js'

export interface RenderHtmlOptions {
  title?: string
  poolLabel?: string
  /** Fixed cell size (px) for the "intrinsic" board view — shows actual relative physical size across grid sizes. Defaults to 26. */
  intrinsicCellPx?: number
  /** Shared representative mobile container width (px) for the "fitted" board view. Defaults to 360, per Part 7's documented convention. */
  mobileContainerPx?: number
}

const DEFAULT_INTRINSIC_CELL_PX = 26
const DEFAULT_MOBILE_CONTAINER_PX = 360

// cellSizeAt360 = containerPx / max(boundingWidth, boundingHeight) — the
// largest square cell size that lets the WHOLE puzzle (including its
// longer axis) fit inside a containerPx x containerPx area. Answers "how
// large can cells be while the whole board fits in a 360x360 area?" —
// a geometric measurement only; it makes no claim about accessibility.
export function mobileCellSizePx(
  boundingWidth: number,
  boundingHeight: number,
  containerPx: number = DEFAULT_MOBILE_CONTAINER_PX,
): number {
  return containerPx / Math.max(boundingWidth, boundingHeight)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function fmt(value: number, decimals: number): string {
  return round(value, decimals).toString()
}

function fmtSummary(summary: NumericSummary | null, decimals: number): string {
  if (!summary) return 'n/a (no unique candidates)'
  return `median ${fmt(summary.median, decimals)} (range ${fmt(summary.min, decimals)}–${fmt(summary.max, decimals)}, mean ${fmt(summary.mean, decimals)}, n=${summary.count})`
}

function renderBoardGrid(candidate: PoolCandidate, cellPx: number): string {
  const { construction } = candidate
  const cellsHtml = Object.entries(construction.cells)
    .map(([cellId, letter]) => {
      const position = construction.positions[cellId]
      return (
        `<div class="cc-cell" style="grid-column:${position.x + 1};grid-row:${position.y + 1}">` +
        `<span class="cc-letter">${escapeHtml(letter)}</span></div>`
      )
    })
    .join('')
  return (
    `<div class="cc-board" style="grid-template-columns:repeat(${construction.width},${cellPx}px);` +
    `grid-template-rows:repeat(${construction.height},${cellPx}px);--cell-size:${cellPx}px">` +
    `${cellsHtml}</div>`
  )
}

function renderRepresentative(representative: RepresentativeCandidate, options: Required<RenderHtmlOptions>): string {
  const { candidate, label } = representative
  const { construction, metrics } = candidate
  const mobileCellPx = mobileCellSizePx(construction.width, construction.height, options.mobileContainerPx)

  return `
    <article class="cc-representative">
      <h4 class="cc-representative-label">${escapeHtml(label)}</h4>
      <div class="cc-board-views">
        <div class="cc-board-view">
          <div class="cc-board-caption">Intrinsic size &mdash; ${construction.width}&times;${construction.height} cells at ${options.intrinsicCellPx}px each (${construction.width * options.intrinsicCellPx}&times;${construction.height * options.intrinsicCellPx}px)</div>
          ${renderBoardGrid(candidate, options.intrinsicCellPx)}
        </div>
        <div class="cc-board-view">
          <div class="cc-board-caption">Fitted to a ${options.mobileContainerPx}px board &mdash; cells ${fmt(mobileCellPx, 1)}px each</div>
          ${renderBoardGrid(candidate, mobileCellPx)}
        </div>
      </div>
      <dl class="cc-candidate-meta">
        <dt>Selected answers (${candidate.answerCount})</dt>
        <dd>${escapeHtml(candidate.selectedAnswers.join(', '))}</dd>
        <dt>Unselected answers (${candidate.unselectedAnswers.length})</dt>
        <dd>${escapeHtml(candidate.unselectedAnswers.join(', ') || '(none)')}</dd>
        <dt>Bounding dimensions</dt>
        <dd>${construction.width}&times;${construction.height} (${metrics.geometry.occupiedCellCount} occupied cells)</dd>
        <dt>Cell size @ ${options.mobileContainerPx}px</dt>
        <dd>${fmt(mobileCellPx, 1)}px (${options.mobileContainerPx} / max(${construction.width}, ${construction.height})) &mdash; descriptive only</dd>
        <dt>Density</dt>
        <dd>${fmt(metrics.geometry.density, 3)}</dd>
        <dt>Authored intersections</dt>
        <dd>${metrics.authoredIntersections.totalAuthoredIntersections} total, mean ${fmt(metrics.authoredIntersections.meanIntersectionsPerAuthoredAnswer, 2)}/answer</dd>
        <dt>Derived entries</dt>
        <dd>${metrics.derivedEntries.derivedEntryCount} total (${metrics.derivedEntries.incidentalEntryCount} incidental)</dd>
        <dt>Distinct letters</dt>
        <dd>${metrics.letters.distinctLetterCount} (max letter share ${fmt(metrics.letters.maxLetterShare, 3)})</dd>
        <dt>Provenance</dt>
        <dd>representative trial #${candidate.representativeTrialIndex}, seed <code>${escapeHtml(String(candidate.representativeSeed))}</code>, ${candidate.duplicateCount} duplicate trial(s)</dd>
      </dl>
    </article>`
}

function pct(part: number, share: number | null): string {
  return share === null ? `${part}` : `${part} (${fmt(share * 100, 1)}%)`
}

function median(summary: NumericSummary | null, decimals: number): string {
  return summary ? fmt(summary.median, decimals) : 'n/a'
}

function renderCrossSizeSummaryTable(sizes: SizeExperimentSizeResult[]): string {
  const rows = sizes
    .map((size) => {
      const d = size.distributions
      const a = size.answerCounts
      return `
        <tr>
          <th scope="row">${size.maxWidth}&times;${size.maxHeight}</th>
          <td>${size.viableSubsetTrialCount} / ${size.subsetTrialsAttempted} (${fmt((size.viableSubsetTrialCount / size.subsetTrialsAttempted) * 100, 1)}%)</td>
          <td>${size.uniqueCandidateCount}</td>
          <td>${size.failedSubsetTrialCount} (${size.failureReasons['budget-exhausted']} budget, ${size.failureReasons['no-legal-arrangement']} no arrangement, ${size.failureReasons.other} other)</td>
          <td>${median(d.selectedAnswerCount, 1)}</td>
          <td>${pct(a.count8to12, a.share8to12)}</td>
          <td>${pct(a.count10to12, a.share10to12)}</td>
          <td>${pct(a.count11to12, a.share11to12)}</td>
          <td>${median(d.occupiedCellCount, 1)}</td>
          <td>${median(d.boundingWidth, 1)}&times;${median(d.boundingHeight, 1)} (area ${median(d.boundingArea, 1)})</td>
          <td>${median(d.density, 3)}</td>
          <td>${median(d.envelopeUtilization, 3)}</td>
          <td>${median(d.meanIntersectionsPerAuthoredAnswer, 2)}</td>
          <td>${median(d.incidentalEntryCount, 0)}</td>
          <td>${size.elapsedMs}ms</td>
        </tr>`
    })
    .join('')

  const distributionRows = sizes
    .map(
      (size) => `
        <tr>
          <th scope="row">${size.maxWidth}&times;${size.maxHeight}</th>
          ${ANSWER_COUNTS.map((n) => `<td>${size.answerCounts.distribution[n]}</td>`).join('')}
          <td>${size.answerCounts.count}</td>
        </tr>`,
    )
    .join('')

  return `
    <table class="cc-summary-table">
      <caption>Cross-size summary (medians over unique candidates; see each per-size section for full distributions)</caption>
      <thead>
        <tr>
          <th scope="col">Size</th>
          <th scope="col">Viable / attempted trials</th>
          <th scope="col">Unique candidates</th>
          <th scope="col">Failed trials (by reason)</th>
          <th scope="col">Median answers</th>
          <th scope="col">8&ndash;12 answers</th>
          <th scope="col">10&ndash;12 answers</th>
          <th scope="col">11&ndash;12 answers</th>
          <th scope="col">Median occupied cells</th>
          <th scope="col">Median bounding W&times;H</th>
          <th scope="col">Median density</th>
          <th scope="col">Median envelope utilization</th>
          <th scope="col">Median intersections/answer</th>
          <th scope="col">Median incidental entries (must be 0)</th>
          <th scope="col">Elapsed</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="cc-summary-table">
      <caption>Unique candidates by authored-answer count</caption>
      <thead>
        <tr>
          <th scope="col">Size</th>
          ${ANSWER_COUNTS.map((n) => `<th scope="col">${n}</th>`).join('')}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>${distributionRows}</tbody>
    </table>`
}

function renderDistributionList(distributions: SizeDistributions): string {
  const rows: [string, NumericSummary | null, number][] = [
    ['Selected answer count', distributions.selectedAnswerCount, 0],
    ['Occupied cell count', distributions.occupiedCellCount, 0],
    ['Bounding width', distributions.boundingWidth, 0],
    ['Bounding height', distributions.boundingHeight, 0],
    ['Bounding area', distributions.boundingArea, 0],
    ['Density', distributions.density, 3],
    ['Envelope utilization', distributions.envelopeUtilization, 3],
    ['Total authored intersections', distributions.totalAuthoredIntersections, 0],
    ['Mean intersections/answer', distributions.meanIntersectionsPerAuthoredAnswer, 2],
    ['Weakly-connected answers (0-1 intersections)', distributions.zeroOrSingleIntersectionAuthoredAnswerCount, 0],
    ['Derived entry count', distributions.derivedEntryCount, 0],
    ['Incidental entry count', distributions.incidentalEntryCount, 0],
    ['Distinct letter count', distributions.distinctLetterCount, 0],
    ['Max letter share', distributions.maxLetterShare, 3],
  ]
  const items = rows.map(([name, summary, decimals]) => `<li><strong>${name}:</strong> ${fmtSummary(summary, decimals)}</li>`).join('')
  return `<ul class="cc-distribution-list">${items}</ul>`
}

function renderSizeSection(size: SizeExperimentSizeResult, options: Required<RenderHtmlOptions>): string {
  const representatives = size.representatives.map((r) => renderRepresentative(r, options)).join('')
  return `
    <section class="cc-size-section" id="size-${size.maxWidth}x${size.maxHeight}">
      <h3>${size.maxWidth}&times;${size.maxHeight}</h3>
      <p class="cc-size-stats">
        ${size.viableSubsetTrialCount} viable / ${size.subsetTrialsAttempted} attempted subset trials
        (${size.failedSubsetTrialCount} failed) &middot;
        ${size.uniqueSelectedAnswerSetCount} unique selected-answer sets &middot;
        ${size.uniqueCandidateCount} unique candidates (${size.duplicateCandidateCount} duplicate) &middot;
        ${size.authoredRecoveryFailureCount} authored-recovery failures &middot;
        ${size.elapsedMs}ms elapsed
      </p>
      <p class="cc-size-stats">
        Failed trials by reason: ${size.failureReasons['budget-exhausted']} search budget exhausted
        (not proof that no arrangement exists) &middot; ${size.failureReasons['no-legal-arrangement']} no legal
        arrangement (search space exhausted) &middot; ${size.failureReasons.other} other.
        Geometry invariant (derived entries = authored answers, zero incidental entries):
        ${size.geometryViolations.length === 0 ? 'passed for every successful trial and candidate' : `${size.geometryViolations.length} VIOLATIONS`}.
      </p>
      <h4>Distributions (over ${size.uniqueCandidateCount} unique candidates)</h4>
      ${renderDistributionList(size.distributions)}
      <h4>Representative candidates</h4>
      ${representatives || '<p><em>No viable candidates at this size.</em></p>'}
    </section>`
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; line-height: 1.5; color: #1a1a1a; background: #fafafa; }
  h1 { margin-bottom: 4px; }
  .cc-subtitle { color: #555; margin-top: 0; }
  .cc-methodology { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px 20px; margin: 16px 0 32px; }
  .cc-methodology ul { margin: 8px 0 0; padding-left: 20px; }
  table.cc-summary-table { border-collapse: collapse; width: 100%; margin: 16px 0 32px; background: #fff; }
  table.cc-summary-table caption { text-align: left; font-size: 0.85em; color: #666; margin-bottom: 6px; }
  table.cc-summary-table th, table.cc-summary-table td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 0.9em; }
  table.cc-summary-table thead th { background: #f0f0f0; }
  .cc-size-section { border-top: 3px solid #333; margin-top: 40px; padding-top: 16px; }
  .cc-size-stats { color: #444; font-size: 0.95em; }
  .cc-distribution-list { columns: 2; column-gap: 32px; list-style: none; padding: 0; margin: 8px 0 24px; font-size: 0.9em; }
  .cc-distribution-list li { break-inside: avoid; margin-bottom: 4px; }
  .cc-representative { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px 20px; margin: 16px 0; }
  .cc-representative-label { margin: 0 0 12px; font-size: 1em; color: #333; }
  .cc-board-views { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; margin-bottom: 12px; }
  .cc-board-view { display: flex; flex-direction: column; gap: 6px; }
  .cc-board-caption { font-size: 0.8em; color: #666; }
  .cc-board { display: grid; gap: 1px; background: #999; border: 1px solid #666; width: max-content; }
  .cc-cell { background: #fff; display: flex; align-items: center; justify-content: center; font-family: "SF Mono", Menlo, Consolas, monospace; font-weight: 600; font-size: calc(var(--cell-size) * 0.5); }
  body.cc-hide-letters .cc-letter { visibility: hidden; }
  .cc-candidate-meta { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 0.85em; margin: 0; }
  .cc-candidate-meta dt { font-weight: 600; color: #444; }
  .cc-candidate-meta dd { margin: 0; }
  .cc-toggle-bar { margin: 12px 0 24px; }
  .cc-toggle-bar button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid #999; background: #fff; cursor: pointer; }
`

const LETTER_TOGGLE_SCRIPT = `
  function ccToggleLetters() {
    document.body.classList.toggle('cc-hide-letters');
  }
`

export function renderExperimentHtml(result: SizeExperimentResult, options: RenderHtmlOptions = {}): string {
  const resolved: Required<RenderHtmlOptions> = {
    title: options.title ?? 'ClueCross Grid Size Experiment',
    poolLabel: options.poolLabel ?? 'Dogs Candidate Pool',
    intrinsicCellPx: options.intrinsicCellPx ?? DEFAULT_INTRINSIC_CELL_PX,
    mobileContainerPx: options.mobileContainerPx ?? DEFAULT_MOBILE_CONTAINER_PX,
  }

  const sizeLabel = (size: GridSize) => `${size.maxWidth}×${size.maxHeight}`
  const sizesLine = result.config.sizes.map(sizeLabel).join(' vs ')

  const summaryTable = renderCrossSizeSummaryTable(result.sizes)
  const sizeSections = result.sizes.map((size) => renderSizeSection(size, resolved)).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(resolved.title)}</title>
  <style>${STYLE}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(resolved.title)}</h1>
    <p class="cc-subtitle">${escapeHtml(resolved.poolLabel)} &middot; ${escapeHtml(sizesLine)}</p>
  </header>

  <section class="cc-methodology">
    <strong>Methodology</strong>
    <ul>
      <li>Same ${result.config.candidatePool.length}-word candidate pool used for every size (listed below).</li>
      <li>Same base seed (<code>${escapeHtml(String(result.config.seed))}</code>) used for every size &mdash; each size attempts the exact same sequence of candidate subsets; only the grid envelope differs.</li>
      <li>Same subset-trial budget (${result.config.maxSubsetTrials} trials) and answer-count bounds (${result.config.minAnswers}&ndash;${result.config.maxAnswers} answers) for every size.</li>
      <li>Search budget: ${result.config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS} placement attempts per trial${result.config.maxAttempts === undefined ? ' (the generator default)' : ''}.</li>
      <li>Geometry rule: every maximal across/down run of 2+ occupied cells must be exactly one authored answer. Incidental entries are invalid, so every successful candidate reports 0 incidental entries; unrelated words may touch only diagonally.</li>
      <li>Failure reasons distinguish search-budget exhaustion (the search stopped early) from &ldquo;no legal arrangement&rdquo; (the search tried every placement it can make).</li>
      <li>No semantic/theme scoring &mdash; every pool word is assumed already editorially approved.</li>
      <li>No cross-size quality ranking. This report presents raw measurements and representative boards only; it does not calculate a "best" size.</li>
      <li>Candidate pool: ${escapeHtml(result.config.candidatePool.join(', '))}</li>
    </ul>
  </section>

  <div class="cc-toggle-bar">
    <button type="button" onclick="ccToggleLetters()">Show / hide letters</button>
  </div>

  <h2>Cross-size summary</h2>
  ${summaryTable}

  <h2>Per-size detail</h2>
  ${sizeSections}

  <script>${LETTER_TOGGLE_SCRIPT}</script>
</body>
</html>`
}
