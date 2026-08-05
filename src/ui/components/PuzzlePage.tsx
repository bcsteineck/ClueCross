import { useEffect, useRef, useState } from 'react'
import { toDateKey } from '../../core/archiveCalendar'
import { markDateCompleted } from '../../core/completionTracking'
import { getLockedCellIds, isPuzzleComplete } from '../../core/gameEngine'
import { getLetterCost } from '../../core/letterCosts'
import type { CellId, PuzzleDefinition } from '../../core/types'
import type { Direction } from '../../layout/entryDirection'
import type { LayoutDefinition } from '../../layout/types'
import { usePuzzleGame } from '../../state/usePuzzleGame'
import { AlphabetKeyboard } from './AlphabetKeyboard'
import { ClueHeader } from './ClueHeader'
import { Keyboard } from './Keyboard'
import { PuzzleBoard } from './PuzzleBoard'
import type { PuzzleBoardHandle } from './PuzzleBoard'
import { PuzzleOptions } from './PuzzleOptions'

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
  const boardRef = useRef<PuzzleBoardHandle>(null)

  const complete = isPuzzleComplete(state)
  const lockedCellIds = getLockedCellIds(state)

  useEffect(() => {
    if (complete) {
      markDateCompleted(toDateKey(date))
    }
  }, [complete, date])
  // Reveals are always available — the reveal keyboard/Buy Letter only
  // ever disables once the puzzle is complete, never based on score.
  const keyboardDisabled = complete

  function handleRevealLetter(letter: string) {
    revealLetter(letter)
    const newScore = state.score - getLetterCost(letter)
    setAnnouncement(`Unlocked ${letter}. Score: ${newScore}.`)
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
          isComplete={complete}
          activeCellId={activeCellId}
          activeDirection={activeDirection}
          onSetCellValue={setCellValue}
          onActiveCellChange={setActiveCellId}
          onActiveDirectionChange={setActiveDirection}
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
    </>
  )
}
