import { X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { getStarCount } from '../../core/awardLevel'
import { StarRating } from './StarRating'
import './ResultModal.scss'

export interface ResultModalProps {
  score: number
  unlockBudget: number
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Centered dialog + blurred/locked backdrop, same treatment as the nav
// drawer's overlay — shown once, immediately when a puzzle is completed.
export function ResultModal({ score, unlockBudget, onClose }: ResultModalProps) {
  const starCount = getStarCount(score)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  // See NavDrawer's identical capture for why this is a lazy state
  // initializer rather than a plain read inside the effect below (stable
  // across React StrictMode's dev-only extra mount/cleanup/mount cycle).
  const [previouslyFocused] = useState(() => document.activeElement as HTMLElement | null)

  // Locks background scroll, moves focus into the dialog, and restores
  // both on close — the page behind genuinely can't be scrolled or
  // interacted with while this is open. Focuses the title, not the first
  // focusable control (the close button) — a screen reader gets "Puzzle
  // Complete!" first, and this modal popping up (it's not a response to any
  // click) doesn't leave a focus-visible ring sitting on the close button,
  // which reads as a stray highlight rather than a deliberate one.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [previouslyFocused])

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
    // Initial focus lands on the title (see above), which isn't part of
    // this focusable list — so "at the start of the trap" means either
    // genuinely on `first`, or not on any tracked control yet at all.
    const atStart = document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement)

    if (event.shiftKey && atStart) {
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
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="result-modal__title">
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

        <div className="result-modal__award">
          <StarRating count={starCount} size={32} />
        </div>
        <p className="result-modal__score">
          Final Score: {score} / {unlockBudget}
        </p>
      </div>
    </div>
  )
}
