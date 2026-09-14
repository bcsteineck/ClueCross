import { StarRating } from './StarRating'
import './ArchiveDateButton.scss'

export type ArchiveDateStatus = 'default' | 'completed' | 'active'

export interface ArchiveDateButtonProps {
  day: number
  status: ArchiveDateStatus
  available: boolean
  // The real earned rating when `status` is 'completed' (or an 'active'
  // date that also happens to be completed); a placeholder 0 otherwise —
  // rendered as muted (available) or very-subtle (disabled) outline stars
  // via color context alone, per the Figma Archive Date Button states.
  starCount: 0 | 1 | 2 | 3
  ariaLabel: string
  onSelect: () => void
}

// Completed/active are conveyed to assistive tech via the aria-label
// suffix and aria-current below (including the real star count for a
// completed date), not just the visual color — a screen reader user
// couldn't otherwise tell a genuine 0-star result apart from an unplayed
// placeholder.
export function ArchiveDateButton({
  day,
  status,
  available,
  starCount,
  ariaLabel,
  onSelect,
}: ArchiveDateButtonProps) {
  const completed = available && status === 'completed'
  const active = available && status === 'active'
  const className = [
    'archive-date',
    completed && 'archive-date--completed',
    active && 'archive-date--active',
  ]
    .filter(Boolean)
    .join(' ')

  const suffix = active
    ? ' (currently viewing)'
    : completed
      ? ` (completed, ${starCount} out of 3 stars)`
      : ''

  return (
    <button
      type="button"
      className={className}
      disabled={!available}
      aria-label={`${ariaLabel}${suffix}`}
      aria-current={active ? 'date' : undefined}
      onClick={onSelect}
    >
      <span className="archive-date__day">{day}</span>
      <span aria-hidden="true">
        <StarRating count={starCount} size={11} />
      </span>
    </button>
  )
}
