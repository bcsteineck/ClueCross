import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ReplaceResult } from './draft/draftSaver'

interface NewPuzzleControlProps {
  /** Saves an empty draft, then resets the Workshop; resolves with the outcome. */
  onConfirm: () => Promise<ReplaceResult>
  /** Called after a successful reset, once the confirmation has closed. */
  onReset: () => void
}

// New Puzzle: an explicit, confirmed reset of the local working draft only —
// it never touches published or scheduled puzzles. The confirmation follows
// the Workshop's inline pattern (a labelled group; focus moves to Cancel;
// Escape cancels). On failure the current draft is untouched and the
// reason is shown.
export function NewPuzzleControl({ onConfirm, onReset }: NewPuzzleControlProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
    else if (restoreFocus.current) {
      restoreFocus.current = false
      openButtonRef.current?.focus()
    }
  }, [open])

  function cancel() {
    if (busy) return
    restoreFocus.current = true
    setError(null)
    setOpen(false)
  }

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await onConfirm()
    setBusy(false)
    if (result.ok) {
      setOpen(false)
      onReset()
    } else {
      setError(result.message)
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') cancel()
  }

  return (
    <div className="ws-new-puzzle">
      <button
        type="button"
        className="ws-button ws-button--secondary"
        ref={openButtonRef}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={open ? 'ws-new-puzzle-confirm' : undefined}
      >
        New Puzzle
      </button>
      {open && (
        <div
          id="ws-new-puzzle-confirm"
          className="ws-publish__confirm ws-new-puzzle__confirm"
          role="group"
          aria-labelledby="ws-new-puzzle-heading"
          aria-describedby="ws-new-puzzle-description"
          onKeyDown={handleKeyDown}
        >
          <p id="ws-new-puzzle-heading">
            <strong>Start a new puzzle?</strong>
          </p>
          <p id="ws-new-puzzle-description" className="ws-muted">
            This will permanently clear the current working draft, including its authoring inputs, Priority Words, and
            Final Puzzle. This cannot be undone. Published and scheduled puzzles are not affected.
          </p>
          {error && (
            <p className="ws-publish__problem" role="alert">
              The new puzzle wasn’t started, and the current draft is unchanged. {error}
            </p>
          )}
          <div className="ws-publish__actions">
            <button type="button" className="ws-button" onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Starting…' : 'Start New Puzzle'}
            </button>
            <button type="button" className="ws-button ws-button--secondary" onClick={cancel} disabled={busy} ref={cancelRef}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
