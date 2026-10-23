interface GenerateControlProps {
  /** "submit" inside the Author form (Enter in a field generates, as before); "button" elsewhere. */
  type: 'submit' | 'button'
  /** Secondary styling where another action (Approve) is the primary one. */
  secondary?: boolean
  canGenerate: boolean
  /** ids of the blocking diagnostics, announced with the button. */
  describedBy?: string
  /** Asks to generate; WorkshopApp validates the inputs first. */
  onGenerate: () => void
}

// The one Generate control, used by Author and Candidates; both call the
// same WorkshopApp handler, so validation, Priority Words, and generation
// are shared. A new batch replaces only the current (unsaved) batch — Saved
// Candidates and the Final Puzzle stay — so it needs no confirmation.
export function GenerateControl({ type, secondary = false, canGenerate, describedBy, onGenerate }: GenerateControlProps) {
  return (
    <div className="ws-generate">
      {/* aria-disabled rather than disabled, so the button stays focusable and
          its reason (the blocking error) is announced with it. */}
      <button
        type={type}
        className={secondary ? 'ws-button ws-button--secondary' : 'ws-button'}
        aria-disabled={!canGenerate}
        aria-describedby={describedBy || undefined}
        onClick={type === 'button' ? onGenerate : undefined}
      >
        Generate Candidates
      </button>
    </div>
  )
}
