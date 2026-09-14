import { useEffect, useRef } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from './Button'
import './MobileBackBar.scss'

export interface MobileBackBarProps {
  onBack: () => void
}

// Shown by the Stats, Archive, and How to Play mobile views, below the
// still-visible persistent header (see MobileHeader) — none of the
// header's icons is itself a way back to the puzzle from these views.
export function MobileBackBar({ onBack }: MobileBackBarProps) {
  // These views fully replace the Puzzle view's content (a real navigation,
  // not a modal), so keyboard/screen-reader focus needs somewhere logical
  // to land rather than falling back to <body>. Focusing this button on
  // mount — once per view entry, not a trap — gives it that landing point.
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    buttonRef.current?.focus()
  }, [])

  return (
    <div className="mobile-back-bar">
      <Button
        ref={buttonRef}
        variant="text"
        iconLeft={<ChevronLeft size={20} aria-hidden="true" />}
        onClick={onBack}
      >
        Back to Puzzle
      </Button>
    </div>
  )
}
