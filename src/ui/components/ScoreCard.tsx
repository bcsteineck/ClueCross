import { getStarCount } from '../../core/awardLevel'
import { ContainerCard } from './ContainerCard'
import { CreditBadge } from './CreditBadge'
import { StarRating } from './StarRating'
import './ScoreCard.scss'

export interface ScoreCardProps {
  score: number
  unlockBudget: number
}

export function ScoreCard({ score, unlockBudget }: ScoreCardProps) {
  return (
    <ContainerCard className="score-card">
      <h2 className="container-card__title">Your Score</h2>
      <div className="score-card__row">
        <CreditBadge
          value={score}
          secondaryText={`/ ${unlockBudget}`}
          showIcon={false}
          ariaLabel={`Score: ${score} out of ${unlockBudget}`}
          testId="score-badge"
        />
        <StarRating count={getStarCount(score)} />
      </div>
    </ContainerCard>
  )
}
