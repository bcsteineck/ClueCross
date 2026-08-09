import { CircleStar } from 'lucide-react'
import type { AwardLevel } from '../../core/awardLevel'
import { getAwardLevel } from '../../core/awardLevel'
import './CreditBadge.scss'

export interface CreditBadgeProps {
  value: number | string
  ariaLabel: string
  testId: string
  // Only meaningful for a numeric value; explicit values (e.g. non-score
  // content) can pin the styling directly instead of deriving it from the
  // award level.
  variant?: AwardLevel
  showIcon?: boolean
  // Text shown before the value (e.g. "Score:"). Kept separate from
  // `value` so award-level variant detection still sees the raw number.
  label?: string
}

// A badge whose styling reflects the award level of a numeric value, using
// the same gold/silver/bronze/bust tiers as the end-of-puzzle result.
export function CreditBadge({
  value,
  ariaLabel,
  testId,
  variant,
  showIcon = true,
  label,
}: CreditBadgeProps) {
  const resolvedVariant = variant ?? (typeof value === 'number' ? getAwardLevel(value) : 'gold')
  return (
    <div
      className={`credit-badge credit-badge--${resolvedVariant}`}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {showIcon && <CircleStar size={20} aria-hidden="true" />}
      <span className="credit-badge__value">{label ? `${label} ${value}` : value}</span>
    </div>
  )
}
