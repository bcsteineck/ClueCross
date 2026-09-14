import { getStarCount } from '../../core/awardLevel'
import { getProgress } from '../../core/progress'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import { MobileBackBar } from './MobileBackBar'
import './MobileStatsView.scss'
import { ProgressBar } from './ProgressBar'
import { RevealHistoryList } from './RevealHistoryList'
import { StarRating } from './StarRating'

export interface MobileStatsViewProps {
  onBack: () => void
}

// Spec section 6: Back to Puzzle, Your Score, Progress, Reveal History —
// scrollable. No How It Works card here — How to Play is its own
// dedicated view reached through the header's Info control, not duplicated
// inside Stats. Reuses the same underlying pieces as the desktop cards
// (StarRating/ProgressBar/RevealHistoryList) but composed into
// mobile-appropriate sections rather than stacking the desktop cards
// verbatim.
export function MobileStatsView({ onBack }: MobileStatsViewProps) {
  const { state } = usePuzzleSession()
  const progress = getProgress(state)

  return (
    <div className="mobile-stats-view">
      <MobileBackBar onBack={onBack} />

      <div className="mobile-stats-view__score-band">
        <div className="mobile-stats-view__score-heading">
          <h2 className="mobile-stats-view__title">Your Score</h2>
          <StarRating count={getStarCount(state.score)} />
        </div>
        <p className="mobile-stats-view__score-value" data-testid="score-badge">
          {state.score} <span className="mobile-stats-view__score-total">/ {state.puzzle.unlockBudget}</span>
        </p>
      </div>

      <section className="mobile-stats-view__section">
        <h2 className="mobile-stats-view__title">Progress</h2>
        <ProgressBar progress={progress} />
      </section>

      <section className="mobile-stats-view__section">
        <h2 className="mobile-stats-view__title">Reveal History</h2>
        <RevealHistoryList entries={state.revealHistory} />
      </section>
    </div>
  )
}
