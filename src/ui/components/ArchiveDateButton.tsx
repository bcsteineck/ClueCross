import { Check } from 'lucide-react'
import './ArchiveDateButton.scss'

export type ArchiveDateStatus = 'default' | 'completed' | 'active'

export interface ArchiveDateButtonProps {
  day: number
  status: ArchiveDateStatus
  available: boolean
  ariaLabel: string
  onSelect: () => void
}

// Completed state adds a checkmark alongside the color change so it isn't
// communicated by color alone (Figma's mock only uses color). Active is
// additionally conveyed via aria-current, since it's the same idea as the
// browser's own "current page in a set of pages" semantics.
export function ArchiveDateButton({
  day,
  status,
  available,
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

  const suffix = active ? ' (currently viewing)' : completed ? ' (completed)' : ''

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
      {completed && <Check size={14} className="archive-date__check" aria-hidden="true" />}
    </button>
  )
}
