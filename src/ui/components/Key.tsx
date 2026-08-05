import { Delete } from 'lucide-react'
import './Key.scss'

export interface KeyProps {
  type: 'letter' | 'delete'
  letter?: string
  cost?: string
  disabled: boolean
  variant?: 'reveal'
  ariaLabel: string
  ariaPressed?: boolean
  testId?: string
  onClick: () => void
}

export function Key({
  type,
  letter,
  cost,
  disabled,
  variant,
  ariaLabel,
  ariaPressed,
  testId,
  onClick,
}: KeyProps) {
  const className = ['key', variant === 'reveal' && 'key--reveal'].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-testid={testId}
      onClick={onClick}
    >
      {type === 'delete' ? (
        <Delete size={24} aria-hidden="true" />
      ) : (
        <span className="key__letter">{letter}</span>
      )}
      {cost && <span className="key__cost">{cost}</span>}
    </button>
  )
}
