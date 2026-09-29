// Generator-internal types.
//
// Deliberately NOT importing PuzzleDefinition/Entry from src/core/types.ts:
// Phase 1 stops at generator-internal placed geometry and stays minimally
// coupled to the production app (see tools/generator README-less plan in
// the Phase 1 checkpoint report). PlacedAnswer is intentionally NOT an
// Entry — an Entry is a runtime/playable-navigation concept that a later
// phase derives from final grid geometry, independent of which authored
// answer(s) produced any given contiguous run (a puzzle can contain
// incidental derived entries no authored answer intended, e.g. the
// "rasa" case in the existing Space puzzle).

export type CellId = string

export interface Position {
  x: number
  y: number
}

export type Direction = 'across' | 'down'

// An authored answer as placed by the construction engine: the word plus
// where it starts and which way it runs. Its full cell span is derivable
// from `word.length`, so it isn't duplicated here.
export interface PlacedAnswer {
  word: string
  direction: Direction
  start: Position
}

export interface GeneratorConfig {
  mode: 'fixed-answer'
  // Every one of these must be placed for construction to succeed.
  answers: string[]
  maxWidth: number
  maxHeight: number
  // Deterministic seed: the same answers + config + seed always produce
  // the same result.
  seed: number | string
  // Bounded, deterministic search effort (a count of placement attempts,
  // not wall-clock time). Defaults applied by the search itself.
  maxAttempts?: number
}

export interface ConstructionSuccess {
  ok: true
  placedAnswers: PlacedAnswer[]
  // cellId -> letter, and cellId -> normalized position, kept as two
  // separate maps (rather than one merged object) to foreshadow the
  // PuzzleDefinition/LayoutDefinition split a later phase assembles from
  // this result.
  cells: Record<CellId, string>
  positions: Record<CellId, Position>
  width: number
  height: number
  attemptsUsed: number
}

export interface ConstructionFailure {
  ok: false
  reason: string
  attemptsUsed: number
}

export type ConstructionResult = ConstructionSuccess | ConstructionFailure
