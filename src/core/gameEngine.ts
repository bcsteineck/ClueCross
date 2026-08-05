import { getLetterCost } from './letterCosts'
import type { CellId, PuzzleDefinition } from './types'

export interface GameState {
  puzzle: PuzzleDefinition
  values: Record<CellId, string>
  revealedLetters: Record<string, true>
  score: number
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
// Score is a running total, not a spending limit: a reveal is never
// blocked for costing more than the current score, and the score is
// allowed to go negative.
export function revealLetter(state: GameState, rawLetter: string): GameState {
  const letter = rawLetter.toUpperCase()
  const cost = getLetterCost(letter)
  if (isPuzzleComplete(state) || state.revealedLetters[letter]) {
    return state
  }
  const nextValues = { ...state.values }
  for (const cell of Object.values(state.puzzle.cells)) {
    if (cell.correctLetter === letter) {
      nextValues[cell.id] = letter
    }
  }
  return {
    ...state,
    values: nextValues,
    revealedLetters: { ...state.revealedLetters, [letter]: true },
    score: state.score - cost,
  }
}
