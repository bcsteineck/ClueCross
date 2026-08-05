import { Key } from './Key'
import './keyboardLayout.scss'

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].map((row) => row.split(''))

export interface KeyboardProps {
  disabled: boolean
  onLetterPress: (letter: string) => void
  onDeletePress: () => void
}

export function Keyboard({ disabled, onLetterPress, onDeletePress }: KeyboardProps) {
  return (
    <div className="keyboard" role="group" aria-label="Letter keyboard">
      {ROWS.map((row, index) => (
        <div key={index} className="keyboard__row">
          {row.map((letter) => (
            <Key
              key={letter}
              type="letter"
              letter={letter}
              disabled={disabled}
              ariaLabel={`Type ${letter}`}
              testId={`key-${letter}`}
              onClick={() => onLetterPress(letter)}
            />
          ))}
          {index === ROWS.length - 1 && (
            <Key
              type="delete"
              disabled={disabled}
              ariaLabel="Delete letter"
              testId="key-delete"
              onClick={onDeletePress}
            />
          )}
        </div>
      ))}
    </div>
  )
}
