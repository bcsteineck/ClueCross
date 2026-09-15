import { useEffect, useRef } from 'react'
import './MobileHowToPlayView.scss'
import { MobileBackBar } from './MobileBackBar'

export interface MobileHowToPlayViewProps {
  onBack: () => void
}

// No Figma mockup was supplied for this view — built from the same
// back-nav shell as Stats/Archive, covering the full instructional content
// required by spec section 19.
export function MobileHowToPlayView({ onBack }: MobileHowToPlayViewProps) {
  // Entering this view is a real navigation (Puzzle -> How to Play), so
  // focus needs a logical landing point instead of staying on the
  // now-hidden Puzzle content or falling back to <body> — the heading
  // itself, not the Back button, so screen readers get this view's own
  // context first (and so a normal tap here doesn't leave a focus-visible
  // ring sitting on the Back button, which reads as a stray highlight
  // rather than a deliberate one).
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  return (
    <div className="mobile-how-to-play-view">
      <MobileBackBar onBack={onBack} />
      <div className="mobile-how-to-play-view__content">
        <h1 ref={titleRef} tabIndex={-1} className="mobile-how-to-play-view__title">
          How to Play
        </h1>
        <ol className="mobile-how-to-play-view__steps">
          <li>Read the clue at the top of the puzzle.</li>
          <li>Fill in the interconnected words that all relate to that clue.</li>
          <li>Use Reveal Letter when you get stuck.</li>
          <li>Revealing a letter locks every occurrence of that letter across the whole board.</li>
          <li>Every puzzle begins with three free reveals.</li>
          <li>Additional reveals reduce your score according to that letter's cost.</li>
          <li>The higher your remaining score, the more stars you earn.</li>
          <li>Puzzles are scored on a 3-star system, from 0 to 3 stars.</li>
          <li>Archive lets you play previously published puzzles at any time.</li>
        </ol>
      </div>
    </div>
  )
}
