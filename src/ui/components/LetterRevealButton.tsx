import './LetterRevealButton.scss'

export type LetterRevealButtonState = 'default' | 'revealed' | 'disabled'

export interface LetterRevealButtonProps {
  letter: string
  cost: string
  state: LetterRevealButtonState
  onClick: () => void
}

// Three genuinely distinct states (spec section 8) — Revealed is
// non-interactive but must never look like Disabled (reserved for when
// Reveal Letter functionality itself is unavailable, e.g. puzzle complete).
export function LetterRevealButton({ letter, cost, state, onClick }: LetterRevealButtonProps) {
  const ariaLabel =
    state === 'revealed'
      ? `${letter}, already revealed`
      : state === 'disabled'
        ? `${letter}, reveal unavailable`
        : `Reveal letter ${letter} for ${cost}`

  return (
    <button
      type="button"
      className={`letter-reveal-button letter-reveal-button--${state}`}
      disabled={state !== 'default'}
      aria-label={ariaLabel}
      data-testid={`letter-${letter}`}
      onClick={onClick}
    >
      <span className="letter-reveal-button__letter" aria-hidden="true">
        {letter}
      </span>
      <span className="letter-reveal-button__cost" aria-hidden="true">
        {cost}
      </span>
    </button>
  )
}
