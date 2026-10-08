import { FREE_REVEALS_PER_PUZZLE, getLetterCost } from './letterCosts'
import type { PuzzleResult } from './puzzleResults'
import type { CellId, PuzzleDefinition, RevealHistoryEntry } from './types'

export interface GameState {
  puzzle: PuzzleDefinition
  values: Record<CellId, string>
  revealedLetters: Record<string, true>
  score: number
  freeRevealsRemaining: number
  revealHistory: RevealHistoryEntry[]
}

export function createInitialGameState(puzzle: PuzzleDefinition): GameState {
  const values: Record<CellId, string> = {}
  for (const cellId of Object.keys(puzzle.cells)) {
    values[cellId] = ''
  }
  return {
    puzzle,
    values,
    revealedLetters: {},
    score: puzzle.unlockBudget,
    freeRevealsRemaining: FREE_REVEALS_PER_PUZZLE,
    revealHistory: [],
  }
}

// Reconstructs a completed puzzle's board from a persisted result (spec
// section 12/15: revisiting a completed archived puzzle restores its
// completed state). The full grid was never stored — since completion
// means every cell already equals its correctLetter, it's cheaper and
// exactly as accurate to fill it directly from the puzzle definition than
// to have persisted a redundant copy of the answers. `revealedLetters` is
// rebuilt from the persisted history purely for display consistency (e.g.
// Reveal History), not because it changes locking — a complete puzzle's
// cells are already all locked regardless of which letters were revealed.
export function createCompletedGameState(puzzle: PuzzleDefinition, result: PuzzleResult): GameState {
  const values: Record<CellId, string> = {}
  for (const cell of Object.values(puzzle.cells)) {
    values[cell.id] = cell.correctLetter
  }
  const revealedLetters: Record<string, true> = {}
  for (const entry of result.revealHistory) {
    revealedLetters[entry.letter] = true
  }
  return {
    puzzle,
    values,
    revealedLetters,
    score: result.score,
    freeRevealsRemaining: 0,
    revealHistory: result.revealHistory,
  }
}

// Derived rather than stored: fully computable from values vs. correctLetter
// at any instant, so there's nothing to reset after an edit or reveal.
export function isPuzzleComplete(state: GameState): boolean {
  return Object.values(state.puzzle.cells).every(
    (cell) => state.values[cell.id] === cell.correctLetter,
  )
}

// Once complete, the whole board freezes. Before that, only cells whose
// letter has been revealed are locked — running out of budget does not
// lock anything by itself.
export function isCellLocked(state: GameState, cellId: CellId): boolean {
  if (isPuzzleComplete(state)) {
    return true
  }
  const cell = state.puzzle.cells[cellId]
  return !!cell && !!state.revealedLetters[cell.correctLetter]
}

export function getLockedCellIds(state: GameState): Record<CellId, true> {
  const locked: Record<CellId, true> = {}
  for (const cellId of Object.keys(state.puzzle.cells)) {
    if (isCellLocked(state, cellId)) {
      locked[cellId] = true
    }
  }
  return locked
}

export function setCellValue(state: GameState, cellId: CellId, value: string): GameState {
  if (isCellLocked(state, cellId)) {
    return state
  }
  return {
    ...state,
    values: { ...state.values, [cellId]: value },
  }
}

// Spends that letter's fixed cost (see letterCosts.ts) to fix every
// occurrence of it across the whole board, overwriting any manual entries
// in those cells. Costs the same fixed price even if the letter appears
// nowhere — a spent guess, not a free one, same as guessing a consonant in
// Hangman/Wheel of Fortune. The cost never depends on how many cells (if
// any) the letter actually fills, or on anything else about this puzzle.
//
// The puzzle's first FREE_REVEALS_PER_PUZZLE reveals cost 0 regardless of
// letter — consumed in the order the player reveals letters, including a
// reveal of a letter absent from the puzzle.
//
// Score is a running total, not a spending limit: a reveal is never
// blocked for costing more than the current score, and the score is
// allowed to go negative.
export function revealLetter(state: GameState, rawLetter: string): GameState {
  const letter = rawLetter.toUpperCase()
  if (isPuzzleComplete(state) || state.revealedLetters[letter]) {
    return state
  }

  const matchingCells = Object.values(state.puzzle.cells).filter(
    (cell) => cell.correctLetter === letter,
  )
  const usesFreeReveal = state.freeRevealsRemaining > 0
  const cost = usesFreeReveal ? 0 : getLetterCost(letter)

  const nextValues = { ...state.values }
  for (const cell of matchingCells) {
    nextValues[cell.id] = letter
  }

  const historyEntry: RevealHistoryEntry = {
    letter,
    cost: usesFreeReveal ? 'Free' : cost,
    cellsRevealed: matchingCells.length,
  }

  return {
    ...state,
    values: nextValues,
    revealedLetters: { ...state.revealedLetters, [letter]: true },
    score: state.score - cost,
    freeRevealsRemaining: usesFreeReveal
      ? state.freeRevealsRemaining - 1
      : state.freeRevealsRemaining,
    revealHistory: [historyEntry, ...state.revealHistory],
  }
}

// Unfinished-puzzle progress in its smallest faithful form: the non-empty
// cell values and the order letters were revealed. Everything else —
// score, free reveals left, Reveal History (costs and cell counts), and
// locked cells — follows from those through revealLetter, so it is never
// stored separately and can't drift out of sync. See puzzleProgress.ts.
export interface PuzzleProgress {
  values: Record<CellId, string>
  /** Revealed letters, oldest first. */
  reveals: string[]
}

export function progressFromState(state: GameState): PuzzleProgress {
  const values: Record<CellId, string> = {}
  for (const [cellId, value] of Object.entries(state.values)) {
    if (value) values[cellId] = value
  }
  return { values, reveals: state.revealHistory.map((entry) => entry.letter).reverse() }
}

const SINGLE_LETTER = /^[A-Z]$/

// Rebuilds an unfinished game by replaying the saved progress through the
// same engine functions play uses: every saved value first, then every
// reveal in its original order. Replaying values first is exact: a reveal
// overwrites all cells of its letter with that letter regardless of what
// they held, and its cost and cell count never depend on cell contents —
// so the resulting values, locks, score, free reveals, and history match
// the original game. Returns null for anything that isn't a faithful,
// still-unfinished game for this puzzle (unknown cells, non-letters,
// repeated reveals, a round trip that doesn't reproduce the saved values,
// or a board that would already be complete).
export function restoreGameState(puzzle: PuzzleDefinition, progress: PuzzleProgress): GameState | null {
  const savedValues = Object.entries(progress.values)
  if (savedValues.some(([cellId, value]) => !Object.hasOwn(puzzle.cells, cellId) || !SINGLE_LETTER.test(value))) {
    return null
  }
  if (
    progress.reveals.length > 26 ||
    new Set(progress.reveals).size !== progress.reveals.length ||
    progress.reveals.some((letter) => !SINGLE_LETTER.test(letter))
  ) {
    return null
  }

  let state = createInitialGameState(puzzle)
  for (const [cellId, value] of savedValues) state = setCellValue(state, cellId, value)
  for (const letter of progress.reveals) state = revealLetter(state, letter)

  if (isPuzzleComplete(state)) return null
  // The replay must reproduce exactly what was saved.
  const restored = progressFromState(state)
  const sameValues =
    Object.keys(restored.values).length === savedValues.length &&
    savedValues.every(([cellId, value]) => restored.values[cellId] === value)
  if (!sameValues || restored.reveals.join() !== progress.reveals.join()) return null
  return state
}
