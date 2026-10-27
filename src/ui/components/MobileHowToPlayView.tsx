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
        <ul className="mobile-how-to-play-view__steps">
          <li>Use each day's clue to solve the puzzle.</li>
          <li>Fill in the interconnected words that all relate to the puzzle clue.</li>
          <li>Reveal letters one at a time using the "Reveal Letter" feature to help complete the puzzle.</li>
          <li>Revealing a letter locks every occurrence of that letter across the puzzle board.</li>
          <li>Puzzles begin with three free letter reveals.</li>
          <li>Letter reveals reduce your score according to the cost of each letter.</li>
          <li>Additional reveals reduce your score according to each letter's cost.</li>
          <li>Scores are translated into a 0 to 3 star rating upon puzzle completion.</li>
          <li>The higher your remaining score, the more stars you earn.</li>
          <li>Enjoy previously published puzzles at your leisure using the Archive feature.</li>
        </ul>
      </div>
    </div>
  )
}
