import { getLetterCost } from '../../core/letterCosts'
import { Key } from './Key'
import './AlphabetKeyboard.scss'
import './keyboardLayout.scss'

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row) => row.split(''))

export interface AlphabetKeyboardProps {
  revealedLetters: Record<string, true>
  isComplete: boolean
  announcement: string
  onRevealLetter: (letter: string) => void
}

export function AlphabetKeyboard({
  revealedLetters,
  isComplete,
  announcement,
  onRevealLetter,
}: AlphabetKeyboardProps) {
  return (
    <div>
      <p className="alphabet-keyboard__announcement" aria-live="polite">
        {announcement}
      </p>
      <div className="keyboard" role="group" aria-label="Letter unlock keyboard">
        {ROWS.map((row, index) => (
          <div key={index} className="keyboard__row">
            {row.map((letter) => {
              const isRevealed = !!revealedLetters[letter]
              const cost = getLetterCost(letter)
              // Reveals are never blocked by affordability — the score is
              // a running total, not a spending limit — so a key is only
              // ever disabled for already being revealed or the puzzle
              // being complete.
              const isDisabled = isComplete || isRevealed
              return (
                <Key
                  key={letter}
                  type="letter"
                  letter={letter}
                  cost={String(cost)}
                  variant="reveal"
                  disabled={isDisabled}
                  ariaPressed={isRevealed}
                  ariaLabel={
                    isRevealed
                      ? `${letter}, already unlocked`
                      : `Unlock letter ${letter} for ${cost}`
                  }
                  testId={`letter-${letter}`}
                  onClick={() => onRevealLetter(letter)}
                />
              )
            })}
            {index === ROWS.length - 1 && (
              <Key type="delete" disabled variant="reveal" ariaLabel="Delete" onClick={() => {}} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
