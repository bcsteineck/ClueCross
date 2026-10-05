import { formatFullDate } from '../../core/archiveCalendar'
import { ContainerCard } from './ContainerCard'
import './ClueCard.scss'

export interface ClueCardProps {
  clue: string
  isCurrentPuzzle: boolean
  date: Date
}

// The current released puzzle (the server's, which between 10 PM and
// midnight ET is dated tomorrow) shows "Today's Clue"; any other shows its
// publication date instead (spec section 15).
export function ClueCard({ clue, isCurrentPuzzle, date }: ClueCardProps) {
  const label = isCurrentPuzzle ? "Today's Clue" : formatFullDate(date)
  return (
    <ContainerCard className="clue-card">
      <h1 className="clue-card__heading">
        <span className="clue-card__label">{label}</span>
        <span className="clue-card__clue">{clue}</span>
      </h1>
      <p className="clue-card__description">
        Fill in the hidden words that all relate to {clue}.
      </p>
    </ContainerCard>
  )
}
