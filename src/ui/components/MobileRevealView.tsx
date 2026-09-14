import { getFreeRevealsSublabel } from '../../core/letterCosts'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import './MobileRevealView.scss'
import { MobileInfoBar } from './MobileInfoBar'
import { RevealButton } from './RevealButton'
import { RevealLetterSelector } from './RevealLetterSelector'

export interface MobileRevealViewProps {
  date: Date
  isToday: boolean
  onStatsClick: () => void
  onRevealed: () => void
  onCancel: () => void
}

// Same info-bar shell and 1:1 primary-content footprint as
// MobilePuzzleView (spec section 6/7), so switching Puzzle <-> Reveal
// doesn't cause the surrounding chrome to jump.
export function MobileRevealView({
  date,
  isToday,
  onStatsClick,
  onRevealed,
  onCancel,
}: MobileRevealViewProps) {
  const { state } = usePuzzleSession()

  return (
    <div className="mobile-reveal-view">
      <MobileInfoBar
        clue={state.puzzle.clue}
        isToday={isToday}
        date={date}
        onStatsClick={onStatsClick}
      />
      <div className="mobile-reveal-view__selector">
        <RevealLetterSelector onRevealed={onRevealed} />
      </div>
      <div className="mobile-reveal-view__cancel-band">
        <RevealButton
          variant="cancel"
          label="Cancel Reveal"
          sublabel={getFreeRevealsSublabel(state.freeRevealsRemaining)}
          onClick={onCancel}
        />
      </div>
    </div>
  )
}
