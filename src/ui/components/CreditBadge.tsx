import { CircleStar } from 'lucide-react'
import './CreditBadge.scss'

export interface CreditBadgeProps {
  value: number | string
  ariaLabel: string
  testId: string
  // Only meaningful for a numeric value; explicit values (e.g. non-score
  // content) can pin the styling directly instead of deriving it from sign.
  variant?: 'unused' | 'used'
  showIcon?: boolean
  // Text shown before the value (e.g. "Score:"). Kept separate from
  // `value` so sign-based variant detection still sees the raw number.
  label?: string
}

// A badge whose styling reflects the sign of a numeric value: the
// "unused credits" gold look for zero/positive, and the "used credits"
// red look once negative.
export function CreditBadge({
  value,
  ariaLabel,
  testId,
  variant,
  showIcon = true,
  label,
}: CreditBadgeProps) {
  const resolvedVariant = variant ?? (typeof value === 'number' && value < 0 ? 'used' : 'unused')
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
