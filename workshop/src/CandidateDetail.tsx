import type { ReactNode, Ref } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { ConstructionSuccess } from '../../tools/generator/src/types.js'
import type { CandidateStatus } from './CandidateActions'
import { CandidateBoard } from './CandidateBoard'
import { StatusBadge } from './CandidateCard'
import { formatMobileCellSize } from './generateBatch'
import type { SwipeHandlers } from './workspaces/useSwipeNavigation'

interface CandidateDetailProps {
  candidate: PoolCandidate
  number: number
  /** The batch it was generated in, if known. */
  batchSeed: string | null
  /** Shown as a Saved or Approved badge beside the heading. */
  status: CandidateStatus
  /** The collection's actions (Save, or Approve and Remove), under the board and summary. */
  actions: ReactNode
  /** Extra provenance for a saved candidate (where and under which clue it was generated). */
  origin?: string | null
  /** The detail screen's heading and position; defaults to the inspector's "Selected Candidate N". */
  heading?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
  /** Shown between the heading and the board (the detail screen's Previous/Next). */
  navigation?: ReactNode
  /** Swipe gestures on the board (the detail screen). */
  swipe?: SwipeHandlers
}

function describeBoard(construction: ConstructionSuccess): string {
  const answers = construction.placedAnswers.map((answer) => `${answer.word} ${answer.direction}`).join(', ')
  return `Puzzle preview, ${construction.width} by ${construction.height} grid: ${answers}.`
}

function formatDecimal(value: number, places = 2): string {
  return String(Number(value.toFixed(places)))
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

// Every number here is descriptive — no grades, thresholds, or colors.
export function CandidateDetail({
  candidate,
  number,
  batchSeed,
  status,
  actions,
  origin = null,
  heading,
  headingRef,
  navigation,
  swipe,
}: CandidateDetailProps) {
  const { geometry, authoredIntersections, derivedEntries, letters } = candidate.metrics
  const mobileCellSize = formatMobileCellSize(geometry.boundingWidth, geometry.boundingHeight)

  return (
    <section className="ws-detail" aria-labelledby="ws-detail-heading">
      <h3 id="ws-detail-heading" className="ws-detail__heading" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
        {heading ?? `Selected Candidate ${number}`}
        <StatusBadge status={status} />
      </h3>

      {navigation}

      <div className={swipe ? 'ws-detail__board ws-detail__board--swipe' : 'ws-detail__board'} {...swipe}>
        <CandidateBoard construction={candidate.construction} label={describeBoard(candidate.construction)} />
      </div>

      <dl className="ws-detail__summary">
        <div>
          <dt>Authored answers</dt>
          <dd>{candidate.answerCount}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>
            {geometry.boundingWidth} × {geometry.boundingHeight}
          </dd>
        </div>
        <div>
          <dt>Occupied cells</dt>
          <dd>{geometry.occupiedCellCount}</dd>
        </div>
        <div>
          <dt>Cell size</dt>
          <dd>{mobileCellSize} cells @ 360px board</dd>
        </div>
      </dl>

      {actions}

      <h4 className="ws-detail__subheading">Selected answers ({candidate.selectedAnswers.length})</h4>
      <ul className="ws-word-list">
        {candidate.selectedAnswers.map((word) => (
          <li key={word}>{word}</li>
        ))}
      </ul>

      <h4 className="ws-detail__subheading">Unselected candidate words ({candidate.unselectedAnswers.length})</h4>
      {candidate.unselectedAnswers.length > 0 ? (
        <ul className="ws-word-list ws-word-list--muted">
          {candidate.unselectedAnswers.map((word) => (
            <li key={word}>{word}</li>
          ))}
        </ul>
      ) : (
        <p className="ws-muted">Every candidate word was used.</p>
      )}

      <h4 className="ws-detail__subheading">Additional metrics</h4>
      <dl className="ws-metrics">
        <dt>Authored intersections</dt>
        <dd>{authoredIntersections.totalAuthoredIntersections}</dd>
        <dt>Mean intersections per answer</dt>
        <dd>{formatDecimal(authoredIntersections.meanIntersectionsPerAuthoredAnswer)}</dd>
        <dt>Derived entries</dt>
        <dd>{derivedEntries.derivedEntryCount}</dd>
        <dt>Incidental entries</dt>
        <dd>{derivedEntries.incidentalEntryCount}</dd>
        <dt>Density</dt>
        <dd>{formatPercent(geometry.density)}</dd>
        <dt>Distinct letters</dt>
        <dd>{letters.distinctLetterCount}</dd>
        <dt>Max letter share</dt>
        <dd>{formatPercent(letters.maxLetterShare)}</dd>
      </dl>

      <h4 className="ws-detail__subheading">Provenance</h4>
      <dl className="ws-metrics ws-metrics--debug">
        {origin && (
          <>
            <dt>Saved from</dt>
            <dd>{origin}</dd>
          </>
        )}
        <dt>Batch seed</dt>
        <dd>{batchSeed ?? 'Unknown (saved by an earlier Workshop)'}</dd>
        <dt>Construction seed</dt>
        <dd>{String(candidate.representativeSeed)}</dd>
        <dt>Subset trial</dt>
        <dd>{candidate.representativeTrialIndex}</dd>
        <dt>Duplicate trials</dt>
        <dd>{candidate.duplicateCount}</dd>
      </dl>
    </section>
  )
}
