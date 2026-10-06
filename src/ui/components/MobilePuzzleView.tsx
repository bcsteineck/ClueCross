import { isPuzzleComplete } from '../../core/gameEngine'
import { getFreeRevealsSublabel } from '../../core/letterCosts'
import type { CellId } from '../../core/types'
import type { Direction } from '../../layout/entryDirection'
import type { LayoutDefinition } from '../../layout/types'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import './MobilePuzzleView.scss'
import { MobileInfoBar } from './MobileInfoBar'
import { PuzzleView } from './PuzzleView'
import { RevealButton } from './RevealButton'
import { ShareResultButton } from './ShareResultButton'

export interface MobilePuzzleViewProps {
  layout: LayoutDefinition
  date: Date
  isCurrentPuzzle: boolean
  activeCellId: CellId | null
  activeDirection: Direction
  onActiveCellChange: (cellId: CellId) => void
  onActiveDirectionChange: (direction: Direction) => void
  onStatsClick: () => void
  onRevealClick: () => void
}

// Spec section 6: info/nav bar, 1:1 puzzle, Reveal Letter action (Share
// Result once the puzzle is complete), native keyboard (handled by Cell.tsx
// directly — no on-screen keyboard here).
export function MobilePuzzleView({
  layout,
  date,
  isCurrentPuzzle,
  activeCellId,
  activeDirection,
  onActiveCellChange,
  onActiveDirectionChange,
  onStatsClick,
  onRevealClick,
}: MobilePuzzleViewProps) {
  const { state } = usePuzzleSession()
  const complete = isPuzzleComplete(state)

  return (
    <div className="mobile-puzzle-view">
      <MobileInfoBar
        clue={state.puzzle.clue}
        isCurrentPuzzle={isCurrentPuzzle}
        date={date}
        onStatsClick={onStatsClick}
      />
      <div className="mobile-puzzle-view__board">
        <PuzzleView
          layout={layout}
          activeCellId={activeCellId}
          activeDirection={activeDirection}
          onActiveCellChange={onActiveCellChange}
          onActiveDirectionChange={onActiveDirectionChange}
        />
      </div>
      <div className="mobile-puzzle-view__actions">
        {complete ? (
          <ShareResultButton />
        ) : (
          <RevealButton
            variant="default"
            label="Reveal Letter"
            sublabel={getFreeRevealsSublabel(state.freeRevealsRemaining)}
            onClick={onRevealClick}
          />
        )}
      </div>
    </div>
  )
}
