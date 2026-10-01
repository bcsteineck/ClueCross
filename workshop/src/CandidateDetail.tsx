import type { Ref } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { ConstructionSuccess } from '../../tools/generator/src/types.js'
import { CandidateBoard } from './CandidateBoard'
import { formatMobileCellSize } from './generateBatch'

interface CandidateDetailProps {
  candidate: PoolCandidate
  number: number
  batchSeed: string
  isApproved: boolean
  onApprove: () => void
  approveButtonRef?: Ref<HTMLButtonElement>
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
  isApproved,
  onApprove,
  approveButtonRef,
}: CandidateDetailProps) {
  const { geometry, authoredIntersections, derivedEntries, letters } = candidate.metrics
  const mobileCellSize = formatMobileCellSize(geometry.boundingWidth, geometry.boundingHeight)

  return (
    <section className="ws-detail" aria-labelledby="ws-detail-heading">
      <h2 id="ws-detail-heading" className="ws-detail__heading">
        Selected Candidate {number}
        {isApproved && <span className="ws-badge">Approved</span>}
      </h2>

      <div className="ws-detail__board">
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

      <h3 className="ws-detail__subheading">Selected answers ({candidate.selectedAnswers.length})</h3>
      <ul className="ws-word-list">
        {candidate.selectedAnswers.map((word) => (
          <li key={word}>{word}</li>
        ))}
      </ul>

      <h3 className="ws-detail__subheading">Unselected candidate words ({candidate.unselectedAnswers.length})</h3>
      {candidate.unselectedAnswers.length > 0 ? (
        <ul className="ws-word-list ws-word-list--muted">
          {candidate.unselectedAnswers.map((word) => (
            <li key={word}>{word}</li>
          ))}
        </ul>
      ) : (
        <p className="ws-muted">Every candidate word was used.</p>
      )}

      <h3 className="ws-detail__subheading">Additional metrics</h3>
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

      <h3 className="ws-detail__subheading">Provenance</h3>
      <dl className="ws-metrics ws-metrics--debug">
        <dt>Batch seed</dt>
        <dd>{batchSeed}</dd>
        <dt>Construction seed</dt>
        <dd>{String(candidate.representativeSeed)}</dd>
        <dt>Subset trial</dt>
        <dd>{candidate.representativeTrialIndex}</dd>
        <dt>Duplicate trials</dt>
        <dd>{candidate.duplicateCount}</dd>
      </dl>

      <div className="ws-detail__approve">
        <button type="button" className="ws-button" onClick={onApprove} ref={approveButtonRef}>
          {isApproved ? 'Open Final Puzzle' : 'Approve Candidate'}
        </button>
        <p className="ws-muted">
          Approving opens the Final Puzzle for validation and export. Nothing is saved or published, and approval
          lasts only for this session.
        </p>
      </div>
    </section>
  )
}
