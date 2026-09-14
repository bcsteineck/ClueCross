import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { markDateCompleted } from '../core/completionTracking'
import { createCompletedGameState, createInitialGameState, isPuzzleComplete } from '../core/gameEngine'
import type { GameState } from '../core/gameEngine'
import { getPuzzleResult, recordPuzzleResult } from '../core/puzzleResults'
import type { CellId, PuzzleDefinition } from '../core/types'
import type { Direction } from '../layout/entryDirection'
import { PuzzleSessionContext } from './PuzzleSessionContext'
import { usePuzzleGame } from './usePuzzleGame'

// Standard visually-hidden recipe, inlined rather than pulled from a
// stylesheet — this file is otherwise pure state/logic with no
// presentational CSS dependency, and this is the one unavoidably visual
// (but invisible) detail it needs: an always-mounted aria-live region.
const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

// Passed as plain props to whichever view renders the board/selector —
// deliberately NOT part of PuzzleSessionValue/context, since no other view
// or column needs to read the active cell/direction (see spec section 18:
// "preserve the previously selected cell/direction when practical").
export interface PuzzleInteractionState {
  activeCellId: CellId | null
  activeDirection: Direction
  onActiveCellChange: (cellId: CellId) => void
  onActiveDirectionChange: (direction: Direction) => void
}

export interface PuzzleSessionProviderProps {
  puzzle: PuzzleDefinition
  sessionKey: string
  cache: RefObject<Record<string, GameState>>
  // False right after an explicit "reset current puzzle" (until the next
  // genuinely fresh session key) — otherwise a persisted completed result
  // for this key would immediately re-restore the completed board the
  // player just asked to clear. True in every other case, including a
  // plain first-ever visit to this key.
  allowRestoringResult: boolean
  children: (interaction: PuzzleInteractionState) => ReactNode
}

// Mounted once per active puzzle (keyed by the caller — typically the
// active date — via the `key` prop on this component), as a sibling of
// Archive/Stats/How-to-Play rather than nested under a view-conditional,
// so switching `view` never unmounts it and never loses progress. Only
// selecting a different puzzle remounts it, at which point `cache` lets a
// previously played session on that key pick back up where it left off,
// per spec section 15 ("restores its existing saved state if previously
// played").
export function PuzzleSessionProvider({
  puzzle,
  sessionKey,
  cache,
  allowRestoringResult,
  children,
}: PuzzleSessionProviderProps) {
  // Only consulted on this component's first render (useReducer's lazy
  // init only ever runs once), so it's fine to recompute this on every
  // render rather than memoize it.
  const cached = cache.current[sessionKey]
  const persistedResult = allowRestoringResult ? getPuzzleResult(sessionKey, puzzle.id) : undefined
  const initialState =
    cached ??
    (persistedResult ? createCompletedGameState(puzzle, persistedResult) : createInitialGameState(puzzle))
  const { state, setCellValue, revealLetter } = usePuzzleGame(puzzle, initialState)
  const [activeCellId, setActiveCellId] = useState<CellId | null>(null)
  const [activeDirection, setActiveDirection] = useState<Direction>('across')

  useEffect(() => {
    cache.current[sessionKey] = state
  }, [state, sessionKey, cache])

  // Announces each reveal's actual recorded effect. Deliberately lives here
  // rather than in whichever view triggered the reveal (e.g. a Reveal
  // Letter view/selector): that view typically unmounts immediately after
  // a successful reveal (spec section 7 — single-action, auto-return to
  // Puzzle), which would very likely drop the aria-live update before a
  // screen reader ever announces it. This provider is the one thing
  // guaranteed to stay mounted across that transition.
  const [announcement, setAnnouncement] = useState('')
  const previousRevealCountRef = useRef(state.revealHistory.length)
  useEffect(() => {
    if (state.revealHistory.length > previousRevealCountRef.current) {
      const latest = state.revealHistory[0]
      setAnnouncement(`Unlocked ${latest.letter}. Score: ${state.score}.`)
    }
    previousRevealCountRef.current = state.revealHistory.length
  }, [state.revealHistory, state.score])

  // Persists the result and detects "just now completed" here rather than
  // in the Puzzle view — that view unmounts whenever the active view
  // switches away from 'puzzle' (e.g. while Reveal Letter is open), so if
  // the reveal that completes the puzzle also navigates back to Puzzle
  // (spec section 7 — every reveal does), the Puzzle view remounts fresh
  // with the puzzle already complete, indistinguishable there from loading
  // an already-solved archived puzzle. This provider, like the
  // announcement above, is guaranteed to stay mounted across that
  // transition, so it can tell the two cases apart correctly.
  const complete = isPuzzleComplete(state)
  const wasCompleteRef = useRef(complete)
  const [justCompleted, setJustCompleted] = useState(false)
  useEffect(() => {
    if (complete) {
      markDateCompleted(sessionKey, puzzle.id)
      recordPuzzleResult(sessionKey, puzzle.id, {
        score: state.score,
        revealHistory: state.revealHistory,
      })
      if (!wasCompleteRef.current) {
        setJustCompleted(true)
      }
    }
    wasCompleteRef.current = complete
  }, [complete, sessionKey, puzzle.id, state.score, state.revealHistory])

  const dismissCompletion = useCallback(() => setJustCompleted(false), [])

  const value = useMemo(
    () => ({ state, setCellValue, revealLetter, justCompleted, dismissCompletion }),
    [state, setCellValue, revealLetter, justCompleted, dismissCompletion],
  )

  return (
    <PuzzleSessionContext.Provider value={value}>
      <p aria-live="polite" style={visuallyHiddenStyle}>
        {announcement}
      </p>
      {children({
        activeCellId,
        activeDirection,
        onActiveCellChange: setActiveCellId,
        onActiveDirectionChange: setActiveDirection,
      })}
    </PuzzleSessionContext.Provider>
  )
}
