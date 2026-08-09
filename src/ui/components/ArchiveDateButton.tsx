import './ArchiveDateButton.scss'

export type ArchiveDateStatus = 'default' | 'completed' | 'active'

export interface ArchiveDateButtonProps {
  day: number
  status: ArchiveDateStatus
  available: boolean
  ariaLabel: string
  onSelect: () => void
}

// Completed/active are still conveyed to assistive tech via the aria-label
// suffix and aria-current below, even though the visual distinction is
// color-only now.
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
    </button>
  )
}
