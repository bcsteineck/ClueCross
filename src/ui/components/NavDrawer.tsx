import { Archive, ArrowLeft, Check, Info, Settings, X } from 'lucide-react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from './Button'
import './NavDrawer.scss'

export type NavDrawerView = 'menu' | 'settings'

export interface NavDrawerProps {
  initialView: NavDrawerView
  onHowToPlayClick: () => void
  archiveActive?: boolean
  onArchiveClick: () => void
  reduceMotion: boolean
  onReduceMotionChange: (enabled: boolean) => void
  onResetCurrentPuzzle: () => void
  onClose: () => void
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function NavDrawer({
  initialView,
  onHowToPlayClick,
  archiveActive,
  onArchiveClick,
  reduceMotion,
  onReduceMotionChange,
  onResetCurrentPuzzle,
  onClose,
}: NavDrawerProps) {
  const [view, setView] = useState<NavDrawerView>(initialView)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  // Locks background scroll for the whole lifetime of the drawer, and
  // restores focus to whatever triggered it once closed — same modal
  // semantics regardless of which view is currently showing.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [])

  // Flips one render after mount, so the panel is first painted off-screen
  // and this becomes a genuine transform change for the slide-in transition
  // to animate (see NavDrawer.scss for why that matters).
  useEffect(() => {
    setOpen(true)
  }, [])

  // Moves focus into the panel on open, and again on every menu <-> settings
  // transition so screen reader users land on the new view instead of a
  // control that just got replaced out from under them.
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
  }, [view])

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

  function handleBack() {
    setConfirmingReset(false)
    setView('menu')
  }

  // Only a drawer that started on the menu (mobile hamburger) can go back
  // to it — one opened straight into settings (desktop) has no menu view
  // to return to.
  const canGoBack = initialView === 'menu' && view === 'settings'

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
            {canGoBack && (
              <button
                type="button"
                className="nav-drawer__back"
                aria-label="Back to menu"
                onClick={handleBack}
              >
                <ArrowLeft size={20} aria-hidden="true" />
              </button>
            )}
            <h2 id={titleId} className="nav-drawer__title">
              {view === 'menu' ? 'Menu' : 'Settings'}
            </h2>
          </div>
          <button
            type="button"
            className="nav-drawer__close"
            aria-label={view === 'menu' ? 'Close menu' : 'Close settings'}
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {view === 'menu' ? (
          <nav className="nav-drawer__nav">
            <Button
              variant="text"
              iconLeft={<Info size={20} aria-hidden="true" />}
              onClick={onHowToPlayClick}
            >
              How to Play
            </Button>
            <Button
              variant="text"
              active={archiveActive}
              iconLeft={<Archive size={20} aria-hidden="true" />}
              onClick={onArchiveClick}
            >
              Archive
            </Button>
            <Button
              variant="text"
              iconLeft={<Settings size={20} aria-hidden="true" />}
              onClick={() => setView('settings')}
            >
              Settings
            </Button>
          </nav>
        ) : (
          <>
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

            <section className="nav-drawer__section">
              <h3 className="nav-drawer__section-title">Puzzle</h3>
              {confirmingReset ? (
                <div className="nav-drawer__confirm">
                  <p className="nav-drawer__confirm-text">
                    Reset your progress on this puzzle? Entered and revealed letters will be
                    cleared.
                  </p>
                  <div className="nav-drawer__confirm-actions">
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
          </>
        )}
      </div>
    </div>
  )
}
