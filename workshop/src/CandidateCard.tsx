import type { Ref } from 'react'
import type { PoolCandidate } from '../../tools/generator/src/pool/generateCandidatePoolSelection.js'
import type { CandidateStatus } from './CandidateActions'
import { CandidateBoard } from './CandidateBoard'
import { formatMobileCellSize } from './generateBatch'

interface CandidateCardProps {
  /** Null only for an edited version with an empty board. */
  candidate: PoolCandidate | null
  number: number
  /** The card's name; defaults to "Candidate N". */
  title?: string
  /** An edited version (Manual Editor): marked Edited in text. */
  edited?: boolean
  isSelected: boolean
  /** Saved and Approved are shown as text badges (Saving… and Removing… as plain text). */
  status: CandidateStatus
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
// Saved and Approved are text badges too.
export function CandidateCard({
  candidate,
  number,
  title = `Candidate ${number}`,
  edited = false,
  isSelected,
  status,
  onSelect,
  compact = false,
  buttonRef,
}: CandidateCardProps) {
  const classes = [
    'ws-card',
    compact && 'ws-card--compact',
    isSelected && 'ws-card--selected',
    status === 'approved' && 'ws-card--approved',
  ]

  const header = (
    <span className="ws-card__header">
      <span className="ws-card__number">{title}</span>
      {edited && <span className="ws-badge ws-badge--saved">Edited</span>}
      <StatusBadge status={status} />
    </span>
  )

  if (!candidate) {
    return (
      <button
        type="button"
        className={classes.filter(Boolean).join(' ')}
        aria-pressed={compact ? undefined : isSelected}
        onClick={onSelect}
        ref={compact ? buttonRef : undefined}
      >
        {header}
        <span className="ws-card__empty">Empty board</span>
        <span className="ws-card__facts">
          <span className="ws-card__headline">0 answers</span>
          {compact && isSelected && <span className="ws-card__selected">Selected</span>}
        </span>
      </button>
    )
  }

  const { boundingWidth, boundingHeight, occupiedCellCount } = candidate.metrics.geometry

  if (compact) {
    return (
      <button type="button" className={classes.filter(Boolean).join(' ')} onClick={onSelect} ref={buttonRef}>
        {header}
        <CandidateBoard construction={candidate.construction} />
        <span className="ws-card__facts">
          <span>{answers(candidate.answerCount)}</span>
          {isSelected && <span className="ws-card__selected">Selected</span>}
        </span>
      </button>
    )
  }

  return (
    <button type="button" className={classes.filter(Boolean).join(' ')} aria-pressed={isSelected} onClick={onSelect}>
      {header}
      <CandidateBoard construction={candidate.construction} />
      <span className="ws-card__facts">
        <span className="ws-card__headline">{answers(candidate.answerCount)}</span>
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

// An edited version can have a single answer.
const answers = (count: number) => `${count} ${count === 1 ? 'answer' : 'answers'}`

const BADGE: Partial<Record<CandidateStatus, { label: string; className: string }>> = {
  approved: { label: 'Approved', className: 'ws-badge' },
  saved: { label: 'Saved', className: 'ws-badge ws-badge--saved' },
  removing: { label: 'Saved', className: 'ws-badge ws-badge--saved' },
  saving: { label: 'Saving…', className: 'ws-badge ws-badge--pending' },
}

/** The workflow state in text: Approved (green), Saved (outlined), Saving… (plain). */
export function StatusBadge({ status }: { status: CandidateStatus }) {
  const badge = BADGE[status]
  return badge ? <span className={badge.className}>{badge.label}</span> : null
}
