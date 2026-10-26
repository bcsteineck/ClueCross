import { getStarCount } from '../../core/awardLevel'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import './MobileScoreLine.scss'
import { StarRating } from './StarRating'

// A compact, glanceable score between the mobile Puzzle view's board and
// its action: the
// same session score, budget, and star rating that Stats shows, on one
// line. Deliberately not a live region, so typing never announces it.
export function MobileScoreLine() {
  const { state } = usePuzzleSession()
  const { score } = state
  const budget = state.puzzle.unlockBudget

  return (
    <div className="mobile-score-line" data-testid="mobile-score-line">
      <p className="mobile-score-line__score">
        <span aria-hidden="true">
          Score: <span className="mobile-score-line__value">{score}</span>{' '}
          <span className="mobile-score-line__total">/ {budget}</span>
        </span>
        <span className="mobile-score-line__visually-hidden">
          Score: {score} out of {budget}
        </span>
      </p>
      <StarRating count={getStarCount(score)} size={16} />
    </div>
  )
}
