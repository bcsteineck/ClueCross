import { Star } from 'lucide-react'
import './StarRating.scss'

const TOTAL_STARS = 3

export interface StarRatingProps {
  count: 0 | 1 | 2 | 3
  size?: number
}

// Renders in `currentColor` — callers control the color (and so whether
// this reads as a real result or a muted/placeholder state, e.g. an
// unplayed Archive date) via their own text color, the same way any other
// icon-as-text element in this codebase does.
export function StarRating({ count, size = 20 }: StarRatingProps) {
  return (
    <div className="star-rating" role="img" aria-label={`${count} out of ${TOTAL_STARS} stars`}>
      {Array.from({ length: TOTAL_STARS }, (_, index) => (
        <Star
          key={index}
          size={size}
          aria-hidden="true"
          className="star-rating__star"
          fill={index < count ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  )
}
