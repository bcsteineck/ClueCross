import { Share, X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { getStarCount } from '../../core/awardLevel'
import { useShareResult } from '../../state/useShareResult'
import { PERSISTENT_SHARE_ATTRIBUTE } from './ShareResultButton'
import { StarRating } from './StarRating'
import './ResultModal.scss'

export interface ResultModalProps {
  score: number
  unlockBudget: number
  onClose: () => void
}

const SCORE_FORMAT = new Intl.NumberFormat('en-US')

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Centered dialog + blurred/locked backdrop, same treatment as the nav
// drawer's overlay — shown once, immediately when a puzzle is completed.
// Share Result is the primary action; it uses the same share behavior as
// the completed puzzle's persistent Share Result control.
export function ResultModal({ score, unlockBudget, onClose }: ResultModalProps) {
  const starCount = getStarCount(score)
  const { share, message } = useShareResult()

  return (
    <ResultDialog title="Puzzle Complete!" onClose={onClose}>
      <div className="result-modal__award">
        <StarRating count={starCount} size={40} />
      </div>
      <div className="result-modal__score-block">
        <p className="result-modal__score-label">Final score</p>
        <p className="result-modal__score">
          <span className="result-modal__score-value">{SCORE_FORMAT.format(score)}</span>{' '}
          <span className="result-modal__score-total">/ {SCORE_FORMAT.format(unlockBudget)}</span>
        </p>
      </div>

      <button type="button" className="result-modal__share" onClick={share}>
        <Share size={22} aria-hidden="true" />
        <span>Share Result</span>
      </button>
      <p role="status" className="result-modal__status">
        {message}
      </p>
    </ResultDialog>
  )
}

export interface IncompleteSolutionModalProps {
  onClose: () => void
}

// The same dialog when play fills every cell but some letter is wrong.
// Informational only: it never says which letters or how many, and
// closing it just returns to the board.
export function IncompleteSolutionModal({ onClose }: IncompleteSolutionModalProps) {
  const descriptionId = useId()

  return (
    <ResultDialog title="Not Quite There!" describedBy={descriptionId} onClose={onClose}>
      <p id={descriptionId} className="result-modal__message">
        You've filled every cell, but at least one letter isn't correct. Take another look at your answers and keep
        trying!
      </p>
      <button type="button" className="result-modal__continue" onClick={onClose}>
        Continue Puzzle
      </button>
    </ResultDialog>
  )
}

interface ResultDialogProps {
  title: string
  describedBy?: string
  onClose: () => void
  children: ReactNode
}

function ResultDialog({ title, describedBy, onClose, children }: ResultDialogProps) {
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
  // focusable control (the close button) — a screen reader gets the title
  // first, and this modal popping up (it's not a response to any click)
  // doesn't leave a focus-visible ring sitting on the close button, which
  // reads as a stray highlight rather than a deliberate one.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      // The control that completed the puzzle (usually the last cell typed
      // into) is disabled by now, so focus would fall to <body>. Land on the
      // completed puzzle's persistent Share Result control instead. An
      // unfinished puzzle has no such control, so focus goes back to the
      // cell it came from.
      const shareControl = document.querySelector<HTMLElement>(`[${PERSISTENT_SHARE_ATTRIBUTE}]`)
      ;(shareControl ?? previouslyFocused)?.focus()
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
        aria-describedby={describedBy}
        onKeyDown={handleKeyDown}
      >
        <div className="result-modal__header">
          <h2 ref={titleRef} id={titleId} tabIndex={-1} className="result-modal__title">
            {title}
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
        {children}
      </div>
    </div>
  )
}
