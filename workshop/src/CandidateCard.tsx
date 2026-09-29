import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateBoard } from './CandidateBoard'
import { formatMobileCellSize } from './generateBatch'

interface CandidateCardProps {
  candidate: PoolCandidate
  number: number
  isSelected: boolean
  isApproved: boolean
  onSelect: () => void
}

// The whole card is one toggle button (aria-pressed = selected), so its
// accessible name is its visible text; the board inside is decorative
// here because the same facts are spelled out as text on the card.
export function CandidateCard({ candidate, number, isSelected, isApproved, onSelect }: CandidateCardProps) {
  const { boundingWidth, boundingHeight, occupiedCellCount } = candidate.metrics.geometry
  const classes = ['ws-card', isSelected && 'ws-card--selected', isApproved && 'ws-card--approved']

  return (
    <button type="button" className={classes.filter(Boolean).join(' ')} aria-pressed={isSelected} onClick={onSelect}>
      <span className="ws-card__header">
        <span className="ws-card__number">Candidate {number}</span>
        {isApproved && <span className="ws-badge">Approved</span>}
      </span>
      <CandidateBoard construction={candidate.construction} />
      <span className="ws-card__facts">
        <span className="ws-card__headline">{candidate.answerCount} answers</span>
        <span>
          {boundingWidth} × {boundingHeight}
        </span>
        <span>{occupiedCellCount} cells</span>
        <span>{formatMobileCellSize(boundingWidth, boundingHeight)} @ 360</span>
      </span>
      <span className="ws-card__words">{candidate.selectedAnswers.join(' · ')}</span>
    </button>
  )
}
