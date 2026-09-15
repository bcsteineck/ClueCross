import { ChevronLeft } from 'lucide-react'
import { Button } from './Button'
import './MobileBackBar.scss'

export interface MobileBackBarProps {
  onBack: () => void
}

// Shown by the Stats, Archive, and How to Play mobile views, below the
// still-visible persistent header (see MobileHeader) — none of the
// header's icons is itself a way back to the puzzle from these views.
// These views fully replace the Puzzle view's content (a real navigation,
// not a modal), so keyboard/screen-reader focus needs somewhere logical to
// land rather than falling back to <body> — but each view focuses its own
// heading for that (see e.g. MobileHowToPlayView), not this button. Doing
// it here instead used to put a focus-visible ring on this button after
// every ordinary tap navigation, which reads as a stray highlighted
// control rather than a deliberate one.
export function MobileBackBar({ onBack }: MobileBackBarProps) {
  return (
    <div className="mobile-back-bar">
      <Button variant="text" iconLeft={<ChevronLeft size={20} aria-hidden="true" />} onClick={onBack}>
        Back to Puzzle
      </Button>
    </div>
  )
}
