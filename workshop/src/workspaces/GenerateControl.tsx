import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'

interface GenerateControlProps {
  /** "submit" inside the Author form (Enter in a field generates, as before); "button" elsewhere. */
  type: 'submit' | 'button'
  /** Secondary styling where another action (Approve) is the primary one. */
  secondary?: boolean
  canGenerate: boolean
  /** ids of the blocking diagnostics, announced with the button. */
  describedBy?: string
  /** Asks to generate; WorkshopApp validates, then confirms if a Final Puzzle would be cleared. */
  onGenerate: () => void
  /** Set while generating would clear an approved Final Puzzle and needs confirming. */
  confirm: { finalPuzzleLabel: string; published: boolean } | null
  onConfirm: () => void
  onCancel: () => void
}

// The one Generate control, used by Author and Candidates; both call the
// same WorkshopApp handler, so validation, Priority Words, and generation
// are shared. A new batch still clears the approved Final Puzzle (saved
// candidates change that later), so that is confirmed first, never silent.
export function GenerateControl({ type, secondary = false, canGenerate, describedBy, onGenerate, confirm, onConfirm, onCancel }: GenerateControlProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const open = confirm !== null

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  function cancel() {
    onCancel()
    buttonRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
  }

  return (
    <div className="ws-generate">
      {/* aria-disabled rather than disabled, so the button stays focusable and
          its reason (the blocking error) is announced with it. */}
      <button
        type={type}
        className={secondary ? 'ws-button ws-button--secondary' : 'ws-button'}
        ref={buttonRef}
        aria-disabled={!canGenerate}
        aria-describedby={describedBy || undefined}
        onClick={type === 'button' ? onGenerate : undefined}
      >
        Generate Candidates
      </button>
      {confirm && (
        <div
          className="ws-publish__confirm"
          role="group"
          aria-labelledby="ws-generate-confirm-heading"
          aria-describedby="ws-generate-confirm-description"
          onKeyDown={handleKeyDown}
        >
          <p id="ws-generate-confirm-heading">
            <strong>Generate a new batch and clear the Final Puzzle?</strong>
          </p>
          <p id="ws-generate-confirm-description" className="ws-muted">
            A new batch clears the approved Final Puzzle ({confirm.finalPuzzleLabel}) from the working draft
            {confirm.published
              ? ', including its record of the dev-calendar publication. The published puzzle itself stays scheduled.'
              : '.'}{' '}
            It can’t be restored afterward.
          </p>
          <div className="ws-publish__actions">
            <button type="button" className="ws-button" onClick={onConfirm}>
              Generate and Clear Final Puzzle
            </button>
            <button type="button" className="ws-button ws-button--secondary" ref={cancelRef} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
