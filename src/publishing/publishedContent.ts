// Parsing and validation of published puzzle content arriving as JSON —
// from the released_puzzles view (server) or from the player API (browser).
// Never trusted blindly: each value is rebuilt from known fields only (so
// stray properties can't leak or persist) and checked against the
// production validator. Pure; shared by server/puzzles and the player.

import type { Cell, Entry, PuzzleDefinition } from '../core/types'
import { validatePuzzleDefinition } from '../core/validatePuzzleDefinition.js'
import type { LayoutDefinition, Position } from '../layout/types'
import { isDateKey } from './dateKey.js'
import type { DateKey } from './types'

export interface RawCalendarEntry {
  publishDate: unknown
  puzzleId: unknown
}

export interface RawPublishedPuzzle extends RawCalendarEntry {
  puzzle: unknown
  layout: unknown
}

export interface CalendarEntry {
  publishDate: DateKey
  puzzleId: string
}

export interface ReleasedPuzzle extends CalendarEntry {
  puzzle: PuzzleDefinition
  layout: LayoutDefinition
}

// The published-puzzle ID format (enforced by the base table too).
const PUZZLE_ID = /^[a-z][a-z0-9]*$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value)

export function parseCalendarEntry(raw: RawCalendarEntry): CalendarEntry | null {
  if (!isString(raw.publishDate) || !isDateKey(raw.publishDate)) return null
  if (!isString(raw.puzzleId) || !PUZZLE_ID.test(raw.puzzleId)) return null
  return { publishDate: raw.publishDate, puzzleId: raw.puzzleId }
}

export function parsePuzzleDefinition(value: unknown): PuzzleDefinition | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.clue) || !isInteger(value.unlockBudget)) return null
  if (!isRecord(value.cells) || !Array.isArray(value.entries)) return null
  const cells: Record<string, Cell> = {}
  for (const [key, cell] of Object.entries(value.cells)) {
    if (!isRecord(cell) || !isString(cell.id) || !isString(cell.correctLetter)) return null
    cells[key] = { id: cell.id, correctLetter: cell.correctLetter }
  }
  const entries: Entry[] = []
  for (const entry of value.entries) {
    if (!isRecord(entry) || !isString(entry.id) || !isStringArray(entry.cellIds)) return null
    entries.push({ id: entry.id, cellIds: [...entry.cellIds] })
  }
  return { id: value.id, clue: value.clue, unlockBudget: value.unlockBudget, cells, entries }
}

export function parseLayoutDefinition(value: unknown): LayoutDefinition | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.puzzleId)) return null
  if (!isRecord(value.cellPositions) || !isStringArray(value.navigationOrder)) return null
  const cellPositions: Record<string, Position> = {}
  for (const [key, position] of Object.entries(value.cellPositions)) {
    if (!isRecord(position) || !isInteger(position.x) || !isInteger(position.y)) return null
    cellPositions[key] = { x: position.x, y: position.y }
  }
  return { id: value.id, puzzleId: value.puzzleId, cellPositions, navigationOrder: [...value.navigationOrder] }
}

/** A clean, production-valid released puzzle, or null if anything is off. */
export function parseReleasedPuzzle(raw: RawPublishedPuzzle): ReleasedPuzzle | null {
  const entry = parseCalendarEntry(raw)
  const puzzle = parsePuzzleDefinition(raw.puzzle)
  const layout = parseLayoutDefinition(raw.layout)
  if (!entry || !puzzle || !layout) return null
  if (puzzle.id !== entry.puzzleId || layout.puzzleId !== entry.puzzleId) return null
  if (!validatePuzzleDefinition(puzzle, layout).valid) return null
  return { ...entry, puzzle, layout }
}
