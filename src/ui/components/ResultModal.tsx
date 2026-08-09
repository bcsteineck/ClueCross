import { CircleStar, CircleX, X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useId, useRef } from 'react'
import { AWARD_LABELS, AWARD_MESSAGES, getAwardLevel } from '../../core/awardLevel'
import './ResultModal.scss'

export interface ResultModalProps {
  score: number
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Centered dialog + blurred/locked backdrop, same treatment as the nav
// drawer's overlay — shown once, immediately when a puzzle is completed.
export function ResultModal({ score, onClose }: ResultModalProps) {
  const award = getAwardLevel(score)
  const AwardIcon = award === 'bust' ? CircleX : CircleStar
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Locks background scroll, moves focus into the dialog, and restores
  // both on close — the page behind genuinely can't be scrolled or
  // interacted with while this is open.
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

  return (
    <div className="result-modal__overlay" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className="result-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="result-modal__header">
          <h2 id={titleId} className="result-modal__title">
            Puzzle Complete!
          </h2>
          <button
            type="button"
            className="result-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={`result-modal__award result-modal__award--${award}`}>
          <AwardIcon aria-hidden="true" />
          {AWARD_LABELS[award]}
        </div>
        <p className="result-modal__message">{AWARD_MESSAGES[award]}</p>
        <p className="result-modal__score">Final Score: {score}</p>
      </div>
    </div>
  )
}
