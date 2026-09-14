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

export interface MobilePuzzleViewProps {
  layout: LayoutDefinition
  date: Date
  isToday: boolean
  activeCellId: CellId | null
  activeDirection: Direction
  onActiveCellChange: (cellId: CellId) => void
  onActiveDirectionChange: (direction: Direction) => void
  onStatsClick: () => void
  onRevealClick: () => void
}

// Spec section 6: info/nav bar, 1:1 puzzle, Reveal Letter action, native
// keyboard (handled by Cell.tsx directly — no on-screen keyboard here).
export function MobilePuzzleView({
  layout,
  date,
  isToday,
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
        isToday={isToday}
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
        <RevealButton
          variant="default"
          label="Reveal Letter"
          sublabel={getFreeRevealsSublabel(state.freeRevealsRemaining)}
          disabled={complete}
          onClick={onRevealClick}
        />
      </div>
    </div>
  )
}
