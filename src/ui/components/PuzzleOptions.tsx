import { SquareM, SquareX } from 'lucide-react'
import { Button } from './Button'
import { CreditBadge } from './CreditBadge'
import './PuzzleOptions.scss'

export interface PuzzleOptionsProps {
  score: number
  mode: 'typing' | 'reveal'
  buyDisabled: boolean
  onToggle: () => void
}

export function PuzzleOptions({ score, mode, buyDisabled, onToggle }: PuzzleOptionsProps) {
  const isTyping = mode === 'typing'

  return (
    <div className="puzzle-options">
      <CreditBadge
        value={score}
        label="Score:"
        showIcon={false}
        ariaLabel={`Score: ${score}`}
        testId="score-badge"
      />
      <Button
        pulse={isTyping}
        disabled={isTyping && buyDisabled}
        iconLeft={
          isTyping ? (
            <SquareM size={20} aria-hidden="true" />
          ) : (
            <SquareX size={20} aria-hidden="true" />
          )
        }
        onClick={onToggle}
      >
        {isTyping ? 'Buy Letter' : 'Cancel Buy Letter'}
      </Button>
    </div>
  )
}
