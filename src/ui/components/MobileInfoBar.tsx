import { ChevronRight } from 'lucide-react'
import { formatFullDate } from '../../core/archiveCalendar'
import { Button } from './Button'
import './MobileInfoBar.scss'

export interface MobileInfoBarProps {
  clue: string
  isToday: boolean
  date: Date
  onStatsClick: () => void
}

// Shared by the mobile Puzzle and Reveal views (spec section 6): "TODAY'S
// CLUE" (or the publication date for an archived puzzle) plus a Stats
// control.
export function MobileInfoBar({ clue, isToday, date, onStatsClick }: MobileInfoBarProps) {
  const label = isToday ? "Today's Clue:" : formatFullDate(date)
  return (
    <div className="mobile-info-bar">
      <h1 className="mobile-info-bar__heading">
        <span className="mobile-info-bar__label">{label}</span>
        <span className="mobile-info-bar__clue">{clue}</span>
      </h1>
      <Button
        variant="text"
        iconRight={<ChevronRight size={16} aria-hidden="true" />}
        onClick={onStatsClick}
      >
        Stats
      </Button>
    </div>
  )
}
