import { useEffect, useState } from 'react'
import { getLockedCellIds, isPuzzleComplete } from '../../core/gameEngine'
import type { CellId } from '../../core/types'
import type { Direction } from '../../layout/entryDirection'
import type { LayoutDefinition } from '../../layout/types'
import { usePuzzleSession } from '../../state/PuzzleSessionContext'
import { useMessageBanner } from '../../state/useMessageBanner'
import { MessageBanner } from './MessageBanner'
import { PuzzleBoard } from './PuzzleBoard'
import { ResultModal } from './ResultModal'

// The breakpoint-agnostic core of the Puzzle view (spec section 4): the
// board itself, the impossible-letter banner, and the completion result
// modal. Completion tracking/persistence itself lives in
// PuzzleSessionProvider, not here — see justCompleted's doc comment for
// why. Surrounding chrome (clue display, the Reveal Letter action,
// native/on-screen input) is composed differently per layout — see
// DesktopLayout — since it differs enough between desktop and mobile that
// forcing one shared component to cover both would need more conditional
// branching than it's worth.
export interface PuzzleViewProps {
  layout: LayoutDefinition
  activeCellId: CellId | null
  activeDirection: Direction
  onActiveCellChange: (cellId: CellId) => void
  onActiveDirectionChange: (direction: Direction) => void
}

export function PuzzleView({
  layout,
  activeCellId,
  activeDirection,
  onActiveCellChange,
  onActiveDirectionChange,
}: PuzzleViewProps) {
  const { state, setCellValue, justCompleted, dismissCompletion } = usePuzzleSession()
  const [impossibleCellId, setImpossibleCellId] = useState<CellId | null>(null)
  const { message: bannerMessage, showMessage, dismiss: dismissBanner } = useMessageBanner()

  const complete = isPuzzleComplete(state)
  const lockedCellIds = getLockedCellIds(state)

  // The "impossible letter" cell highlight is meant to reinforce the
  // banner message, so it shares the banner's exact lifetime — it clears
  // whenever the banner does, whether that's the auto-dismiss timeout or
  // the close button.
  useEffect(() => {
    if (bannerMessage === null) {
      setImpossibleCellId(null)
    }
  }, [bannerMessage])

  function handleImpossibleLetterAttempt(cellId: CellId, letter: string) {
    setImpossibleCellId(cellId)
    showMessage(
      `Every "${letter}" has already been revealed, so it can't be the answer for this cell.`,
    )
  }

  // Deleting the flagged letter resolves the alert directly — dismissing
  // the banner here also clears impossibleCellId via the effect above.
  function handleImpossibleLetterCleared() {
    dismissBanner()
  }

  return (
    <>
      <PuzzleBoard
        puzzle={state.puzzle}
        layout={layout}
        values={state.values}
        lockedCellIds={lockedCellIds}
        revealedLetters={state.revealedLetters}
        isComplete={complete}
        activeCellId={activeCellId}
        activeDirection={activeDirection}
        impossibleCellId={impossibleCellId}
        onSetCellValue={setCellValue}
        onActiveCellChange={onActiveCellChange}
        onActiveDirectionChange={onActiveDirectionChange}
        onImpossibleLetterAttempt={handleImpossibleLetterAttempt}
        onImpossibleLetterCleared={handleImpossibleLetterCleared}
      />
      <MessageBanner message={bannerMessage} onDismiss={dismissBanner} />
      {justCompleted && (
        <ResultModal
          score={state.score}
          unlockBudget={state.puzzle.unlockBudget}
          onClose={dismissCompletion}
        />
      )}
    </>
  )
}
