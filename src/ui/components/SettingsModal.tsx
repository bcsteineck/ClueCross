import { X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import './SettingsModal.scss'

export interface SettingsModalProps {
  reduceMotion: boolean
  onReduceMotionChange: (enabled: boolean) => void
  onResetCurrentPuzzle: () => void
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function SettingsModal({
  reduceMotion,
  onReduceMotionChange,
  onResetCurrentPuzzle,
  onClose,
}: SettingsModalProps) {
  const [confirmingReset, setConfirmingReset] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  // Locks background scroll, moves focus into the dialog, and restores
  // both on close — standard modal behavior so the page behind genuinely
  // can't be scrolled or interacted with while this is open.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    if (confirmingReset) {
      cancelButtonRef.current?.focus()
    }
  }, [confirmingReset])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  function handleConfirmedReset() {
    onResetCurrentPuzzle()
    onClose()
  }

  return (
    <div className="settings-modal__overlay" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="settings-modal__header">
          <h2 id={titleId} className="settings-modal__title">
            Settings
          </h2>
          <button
            type="button"
            className="settings-modal__close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <section className="settings-modal__section">
          <h3 className="settings-modal__section-title">Accessibility</h3>
          <label className="settings-modal__checkbox-row">
            <input
              type="checkbox"
              checked={reduceMotion}
              onChange={(event) => onReduceMotionChange(event.target.checked)}
            />
            Reduce motion
          </label>
        </section>

        <section className="settings-modal__section">
          <h3 className="settings-modal__section-title">Puzzle</h3>
          {confirmingReset ? (
            <div className="settings-modal__confirm">
              <p className="settings-modal__confirm-text">
                Reset your progress on this puzzle? Entered and revealed letters will be
                cleared.
              </p>
              <div className="settings-modal__confirm-actions">
                <Button ref={cancelButtonRef} onClick={() => setConfirmingReset(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmedReset}>Reset</Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setConfirmingReset(true)}>Reset current puzzle</Button>
          )}
        </section>
      </div>
    </div>
  )
}
