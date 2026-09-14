import { createContext, useContext } from 'react'
import type { GameState } from '../core/gameEngine'
import type { CellId } from '../core/types'

// Deliberately narrow: only what genuinely needs to be read simultaneously
// by multiple desktop columns, or by more than one swappable mobile view,
// lives here. Per-cell interaction state (active cell/direction) and
// transient board-local UI feedback (reveal announcements, the impossible
// letter highlight) are NOT part of this value — see PuzzleSessionProvider.
export interface PuzzleSessionValue {
  state: GameState
  setCellValue: (cellId: CellId, value: string) => void
  revealLetter: (letter: string) => void
  // True exactly once, right when the puzzle transitions from incomplete to
  // complete — not when a completed puzzle is simply loaded/revisited (see
  // PuzzleSessionProvider). Lives here (not in the Puzzle view itself)
  // because the action that completes the puzzle can be a reveal, which
  // immediately navigates back to the Puzzle view — a view-local "was this
  // already complete when I mounted" check can't tell that apart from
  // loading an already-solved archived puzzle, since both look identical
  // from a freshly (re)mounted Puzzle view's own perspective.
  justCompleted: boolean
  dismissCompletion: () => void
}

export const PuzzleSessionContext = createContext<PuzzleSessionValue | null>(null)

export function usePuzzleSession(): PuzzleSessionValue {
  const value = useContext(PuzzleSessionContext)
  if (!value) {
    throw new Error('usePuzzleSession must be used within a PuzzleSessionProvider')
  }
  return value
}
