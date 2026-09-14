import { useEffect, useRef } from 'react'
import { isPuzzleComplete } from '../../core/gameEngine'
import { getLetterCost } from '../../core/letterCosts'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import { LetterRevealButton } from './LetterRevealButton'
import './RevealLetterSelector.scss'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export interface RevealLetterSelectorProps {
  // Called immediately after a successful reveal — the caller is
  // responsible for returning to the Puzzle view (spec section 7: a single
  // action, not a persistent mode). Not called for an already-revealed
  // letter or once the puzzle is complete.
  onRevealed: () => void
}

export function RevealLetterSelector({ onRevealed }: RevealLetterSelectorProps) {
  const { state, revealLetter } = usePuzzleSession()
  const complete = isPuzzleComplete(state)

  // Entering Reveal is a real view change (Puzzle <-> Reveal), on both
  // breakpoints, so focus needs a logical landing point instead of staying
  // wherever it was on the now-hidden Puzzle content (or falling back to
  // <body>). The heading itself, not the first letter button, so screen
  // readers get the view's context before its controls.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  function handleReveal(letter: string) {
    if (complete || state.revealedLetters[letter]) return
    revealLetter(letter)
    onRevealed()
  }

  return (
    <div className="reveal-letter-selector">
      <h2 ref={headingRef} tabIndex={-1} className="reveal-letter-selector__heading">
        Select Letter to Reveal!
      </h2>
      <div
        className="reveal-letter-selector__grid"
        role="group"
        aria-label="Letters available to reveal"
      >
        {LETTERS.map((letter) => {
          const isRevealed = !!state.revealedLetters[letter]
          const buttonState = isRevealed ? 'revealed' : complete ? 'disabled' : 'default'
          const cost = state.freeRevealsRemaining > 0 ? 'Free' : String(getLetterCost(letter))
          return (
            <LetterRevealButton
              key={letter}
              letter={letter}
              cost={cost}
              state={buttonState}
              onClick={() => handleReveal(letter)}
            />
          )
        })}
      </div>
      {state.freeRevealsRemaining > 0 && (
        <p className="reveal-letter-selector__footer">
          {state.freeRevealsRemaining} free reveal{state.freeRevealsRemaining === 1 ? '' : 's'}{' '}
          remaining
        </p>
      )}
    </div>
  )
}
