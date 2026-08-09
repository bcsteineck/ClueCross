import { useEffect, useRef, useState } from 'react'
import { toDateKey } from '../../core/archiveCalendar'
import { markDateCompleted } from '../../core/completionTracking'
import { getLockedCellIds, isPuzzleComplete } from '../../core/gameEngine'
import { getLetterCost } from '../../core/letterCosts'
import type { CellId, PuzzleDefinition } from '../../core/types'
import type { Direction } from '../../layout/entryDirection'
import type { LayoutDefinition } from '../../layout/types'
import { useMessageBanner } from '../../state/useMessageBanner'
import { usePuzzleGame } from '../../state/usePuzzleGame'
import { AlphabetKeyboard } from './AlphabetKeyboard'
import { ClueHeader } from './ClueHeader'
import { Keyboard } from './Keyboard'
import { MessageBanner } from './MessageBanner'
import { PuzzleBoard } from './PuzzleBoard'
import type { PuzzleBoardHandle } from './PuzzleBoard'
import { PuzzleOptions } from './PuzzleOptions'
import { ResultModal } from './ResultModal'

type KeyboardMode = 'typing' | 'reveal'

export interface PuzzlePageProps {
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
  date: Date
}

export function PuzzlePage({ puzzle, layout, date }: PuzzlePageProps) {
  const { state, setCellValue, revealLetter } = usePuzzleGame(puzzle)
  const [activeCellId, setActiveCellId] = useState<CellId | null>(null)
  const [activeDirection, setActiveDirection] = useState<Direction>('across')
  const [announcement, setAnnouncement] = useState('')
  const [keyboardMode, setKeyboardMode] = useState<KeyboardMode>('typing')
  const [impossibleCellId, setImpossibleCellId] = useState<CellId | null>(null)
  const { message: bannerMessage, showMessage, dismiss: dismissBanner } = useMessageBanner()
  const boardRef = useRef<PuzzleBoardHandle>(null)

  const complete = isPuzzleComplete(state)
  const lockedCellIds = getLockedCellIds(state)

  // Tracks whether the puzzle was already complete as of this render, so
  // the effect below can tell "just finished it" apart from "loaded an
  // already-solved date from the archive" — only the former should pop
  // the result modal. Starting the ref at the puzzle's initial complete
  // state (rather than always false) is what makes that distinction work
  // on first mount too.
  const wasCompleteRef = useRef(complete)
  const [showResultModal, setShowResultModal] = useState(false)

  useEffect(() => {
    if (complete) {
      markDateCompleted(toDateKey(date), puzzle.id)
      if (!wasCompleteRef.current) {
        setShowResultModal(true)
      }
    }
    wasCompleteRef.current = complete
  }, [complete, date, puzzle.id])
  // Reveals are always available — the reveal keyboard/Buy Letter only
  // ever disables once the puzzle is complete, never based on score.
  const keyboardDisabled = complete

  // The "impossible letter" cell highlight is meant to reinforce the
  // banner message, so it shares the banner's exact lifetime — it clears
  // whenever the banner does, whether that's the auto-dismiss timeout or
  // the close button.
  useEffect(() => {
    if (bannerMessage === null) {
      setImpossibleCellId(null)
    }
  }, [bannerMessage])

  function handleRevealLetter(letter: string) {
    revealLetter(letter)
    const newScore = state.score - getLetterCost(letter)
    setAnnouncement(`Unlocked ${letter}. Score: ${newScore}.`)
  }

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
      <div className="puzzle">
        <ClueHeader clue={state.puzzle.clue} />
        <PuzzleBoard
          ref={boardRef}
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
          onActiveCellChange={setActiveCellId}
          onActiveDirectionChange={setActiveDirection}
          onImpossibleLetterAttempt={handleImpossibleLetterAttempt}
          onImpossibleLetterCleared={handleImpossibleLetterCleared}
        />
      </div>
      <PuzzleOptions
        score={state.score}
        mode={keyboardMode}
        buyDisabled={keyboardDisabled}
        onToggle={() => setKeyboardMode(keyboardMode === 'typing' ? 'reveal' : 'typing')}
      />
      {keyboardMode === 'reveal' ? (
        <AlphabetKeyboard
          revealedLetters={state.revealedLetters}
          isComplete={complete}
          announcement={announcement}
          onRevealLetter={handleRevealLetter}
        />
      ) : (
        <Keyboard
          disabled={complete}
          onLetterPress={(letter) => boardRef.current?.typeLetter(letter)}
          onDeletePress={() => boardRef.current?.backspace()}
        />
      )}
      <MessageBanner message={bannerMessage} onDismiss={dismissBanner} />
      {showResultModal && (
        <ResultModal score={state.score} onClose={() => setShowResultModal(false)} />
      )}
    </>
  )
}
