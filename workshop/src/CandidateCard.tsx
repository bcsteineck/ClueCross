import type { Ref } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import { CandidateBoard } from './CandidateBoard'
import { formatMobileCellSize } from './generateBatch'

interface CandidateCardProps {
  candidate: PoolCandidate
  number: number
  isSelected: boolean
  isApproved: boolean
  onSelect: () => void
  /**
   * The narrow-workspace gallery: the board and number only, and the card
   * opens the candidate's detail screen instead of toggling selection.
   */
  compact?: boolean
  buttonRef?: Ref<HTMLButtonElement>
}

// The whole card is one button, so its accessible name is its visible
// text; the board inside is decorative here because the same facts are
// spelled out as text on the card. Beside the inspector it's a toggle
// (aria-pressed = selected); compact, it opens the detail screen, and the
// last-opened card says "Selected" in text, so the state is never color-only.
export function CandidateCard({ candidate, number, isSelected, isApproved, onSelect, compact = false, buttonRef }: CandidateCardProps) {
  const { boundingWidth, boundingHeight, occupiedCellCount } = candidate.metrics.geometry
  const classes = [
    'ws-card',
    compact && 'ws-card--compact',
    isSelected && 'ws-card--selected',
    isApproved && 'ws-card--approved',
  ]

  if (compact) {
    return (
      <button type="button" className={classes.filter(Boolean).join(' ')} onClick={onSelect} ref={buttonRef}>
        <span className="ws-card__header">
          <span className="ws-card__number">Candidate {number}</span>
          {isApproved && <span className="ws-badge">Approved</span>}
        </span>
        <CandidateBoard construction={candidate.construction} />
        <span className="ws-card__facts">
          <span>{candidate.answerCount} answers</span>
          {isSelected && <span className="ws-card__selected">Selected</span>}
        </span>
      </button>
    )
  }

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
