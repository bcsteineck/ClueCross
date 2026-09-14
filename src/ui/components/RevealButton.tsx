import './RevealButton.scss'

export interface RevealButtonProps {
  variant?: 'default' | 'cancel'
  label: string
  sublabel?: string
  disabled?: boolean
  onClick: () => void
}

// The primary "Reveal Letter" CTA (green) and its "Cancel Reveal" (purple)
// counterpart shown while the Reveal Letter view is open — same Figma
// component, two variants. The sublabel renders as a caption below the
// button rather than inside it, so the two variants' buttons always match
// in size — neither one's own box depends on whether an optional line of
// text happens to be present (e.g. once free reveals run out, the default
// variant's sublabel disappears; the cancel variant's "Nevermind!" always
// renders).
export function RevealButton({ variant = 'default', label, sublabel, disabled, onClick }: RevealButtonProps) {
  const sublabelClassName = [
    'reveal-button__sublabel',
    disabled && 'reveal-button__sublabel--disabled',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="reveal-button-group">
      <button
        type="button"
        className={`reveal-button reveal-button--${variant}`}
        disabled={disabled}
        onClick={onClick}
      >
        <span className="reveal-button__label">{label}</span>
      </button>
      {sublabel && <span className={sublabelClassName}>{sublabel}</span>}
    </div>
  )
}
