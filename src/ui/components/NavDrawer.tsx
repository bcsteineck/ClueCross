import { Check, X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { TEST_TOOLS_ENABLED } from '../../state/testTools'
import { Button } from './Button'
import './NavDrawer.scss'

export interface NavDrawerProps {
  reduceMotion: boolean
  onReduceMotionChange: (enabled: boolean) => void
  onClose: () => void
  /** Dev/Preview builds only (see state/testTools.ts). */
  onResetTestState?: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A single settings overlay now on both breakpoints — the mobile hamburger
// menu this used to also serve (a separate 'menu' view) was removed along
// with the hamburger itself (spec section 6): mobile's persistent header
// has its own direct Settings icon now, the same as desktop.
export function NavDrawer({
  reduceMotion,
  onReduceMotionChange,
  onClose,
  onResetTestState,
}: NavDrawerProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()
  // Captured once via a lazy state initializer rather than read inside the
  // effect below: the initializer form is stable across React StrictMode's
  // dev-only extra mount/cleanup/mount cycle, whereas reading
  // document.activeElement directly in the effect body is not — that
  // cleanup already runs once "for practice" before the effect it belongs
  // to fires again, and this drawer's trigger is briefly inert while any of
  // that is happening, so its own restorative focus() call silently no-ops
  // and the second mount would otherwise capture the (wrong) close button
  // as "previously focused" instead.
  const [previouslyFocused] = useState(() => document.activeElement as HTMLElement | null)

  // Locks background scroll for the lifetime of the drawer, and restores
  // focus to whatever triggered it once closed.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [previouslyFocused])

  // Flips one render after mount, so the panel is first painted off-screen
  // and this becomes a genuine transform change for the slide-in transition
  // to animate (see NavDrawer.scss for why that matters).
  useEffect(() => {
    setOpen(true)
  }, [])

  // Focuses the title, not the first focusable control (the close button)
  // — a screen reader gets this dialog's own context first, and a normal
  // tap-to-open doesn't leave a focus-visible ring sitting on the close
  // button, which reads as a stray highlight rather than a deliberate one.
  useEffect(() => {
    titleRef.current?.focus()
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
    <div className="nav-drawer__overlay" onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className={`nav-drawer${open ? ' nav-drawer--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="nav-drawer__header">
          <div className="nav-drawer__header-start">
            <h2 ref={titleRef} id={titleId} tabIndex={-1} className="nav-drawer__title">
              Settings
            </h2>
          </div>
          <button
            type="button"
            className="nav-drawer__close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <section className="nav-drawer__section">
          <h3 className="nav-drawer__section-title">Accessibility</h3>
          <label className="nav-drawer__checkbox-row">
            <span className="nav-drawer__checkbox">
              <input
                type="checkbox"
                checked={reduceMotion}
                onChange={(event) => onReduceMotionChange(event.target.checked)}
              />
              <Check size={16} aria-hidden="true" className="nav-drawer__checkbox-icon" />
            </span>
            Reduce motion
          </label>
        </section>

        {/* Manual-testing tool: compiled out of Production builds entirely. */}
        {TEST_TOOLS_ENABLED && onResetTestState && (
          <section className="nav-drawer__section">
            <h3 className="nav-drawer__section-title">Testing (dev &amp; Preview only)</h3>
            <Button
              onClick={() => {
                onResetTestState()
                onClose()
              }}
            >
              Reset Test State
            </Button>
            <p className="nav-drawer__hint">
              Clears this puzzle’s completion, saved result, and progress on this device, then starts it fresh.
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
