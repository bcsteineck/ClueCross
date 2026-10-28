// The Manual Editor's crossword model: words placed on a fixed 12×12 board,
// and the pure operations and checks the Editor applies to them.
//
// Placement legality is the generator's own rule set (validateCandidate in
// tools/generator/src/placement/backtrack.ts): matching letters at shared
// cells, no same-direction overlap, no side contact, and no extension of
// any answer's run. This module only adds what manual editing needs on top
// of it: absolute board bounds, duplicate answers, a readable reason for a
// refused placement, and connected-placement suggestions. A reason is
// worked out only after validateCandidate has refused; it never decides.
//
// Unlike generation, a manually placed word need not cross anything:
// disconnected groups are a normal, saveable editing state. They are a
// blocking issue for approval (see layoutIssues), not invalid geometry.
//
// Words carry stable ids, so a word keeps its identity through moves and
// renumbering. Display numbers (numberWords) are derived, never stored.

import { normalizeAnswer } from '../../../tools/generator/src/input.js'
import { answerBoundaryNeighbors, checkGeometryInvariant, validateCandidate } from '../../../tools/generator/src/placement/backtrack.js'
import type { ConstructionSuccess, Direction, PlacedAnswer, Position } from '../../../tools/generator/src/types.js'

export const EDITOR_GRID_SIZE = 12

/** The answer-count range generation searches; advisory while editing. */
export const ADVISORY_ANSWER_RANGE = { min: 10, max: 16 } as const

export interface EditorWord {
  /** Stable within its edited version ("w1", "w2", …); never a display number. */
  id: string
  word: string
  direction: Direction
  /** Absolute board coordinates, 0 to EDITOR_GRID_SIZE - 1. */
  start: Position
}

export type PoolWordSource = 'pool' | 'manual'

/** One word in an edited version's own pool. Placed words are pool words too. */
export interface EditorPoolWord {
  word: string
  /** 'manual': entered in the Editor (shown as Manually Added); 'pool': from the candidate's word pool. */
  source: PoolWordSource
}

/** The editable state of one version: what Undo/Redo and autosave carry. */
export interface EditorLayout {
  words: EditorWord[]
  pool: EditorPoolWord[]
}

export interface Placement {
  word: string
  direction: Direction
  start: Position
}

interface Occupant {
  letter: string
  across?: number
  down?: number
}

type Grid = Map<string, Occupant>

const key = (x: number, y: number) => `${x},${y}`

export function wordCells(placement: Placement): { x: number; y: number; letter: string }[] {
  return [...placement.word].map((letter, i) => ({
    x: placement.direction === 'across' ? placement.start.x + i : placement.start.x,
    y: placement.direction === 'across' ? placement.start.y : placement.start.y + i,
    letter,
  }))
}

/** The same normalization as every other answer (construction form). */
export function sameAnswer(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase()
}

// The generator's grid for these words (shared cells hold both owners).
function buildGrid(words: readonly EditorWord[]): { grid: Grid; placed: PlacedAnswer[] } {
  const grid: Grid = new Map()
  const placed: PlacedAnswer[] = []
  words.forEach((word, index) => {
    placed.push({ word: word.word, direction: word.direction, start: word.start })
    for (const cell of wordCells(word)) {
      const existing = grid.get(key(cell.x, cell.y))
      const occupant: Occupant = existing ? { ...existing } : { letter: cell.letter }
      if (word.direction === 'across') occupant.across = index
      else occupant.down = index
      grid.set(key(cell.x, cell.y), occupant)
    }
  })
  return { grid, placed }
}

function gridBounds(grid: Grid) {
  if (grid.size === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const cellKey of grid.keys()) {
    const [x, y] = cellKey.split(',').map(Number)
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  return { minX, maxX, minY, maxY }
}

function inBounds(placement: Placement): boolean {
  return wordCells(placement).every(
    (cell) => cell.x >= 0 && cell.y >= 0 && cell.x < EDITOR_GRID_SIZE && cell.y < EDITOR_GRID_SIZE,
  )
}

export function cellName(x: number, y: number): string {
  return `row ${y + 1}, column ${x + 1}`
}

export type PlacementCheck =
  | { ok: true; crossings: number }
  | { ok: false; reason: string }

// Only after validateCandidate has refused: the first of its rules this
// placement breaks, in words the author can act on.
function refusalReason(grid: Grid, placed: PlacedAnswer[], placement: Placement): string {
  const cells = wordCells(placement)
  for (const cell of cells) {
    const occupant = grid.get(key(cell.x, cell.y))
    if (!occupant) continue
    if (occupant.letter !== cell.letter) {
      return `${placement.word} would put ${cell.letter} where ${occupant.letter} already is (${cellName(cell.x, cell.y)}).`
    }
    const owner = placement.direction === 'across' ? occupant.across : occupant.down
    if (owner !== undefined) return `${placement.word} would overlap ${placed[owner].word} in the same direction.`
  }
  for (const cell of cells) {
    if (grid.has(key(cell.x, cell.y))) continue
    const sides =
      placement.direction === 'across'
        ? [key(cell.x, cell.y - 1), key(cell.x, cell.y + 1)]
        : [key(cell.x - 1, cell.y), key(cell.x + 1, cell.y)]
    if (sides.some((side) => grid.has(side))) {
      return `${placement.word} would touch another word side by side at ${cellName(cell.x, cell.y)}, forming letters that aren’t an answer.`
    }
  }
  const first = cells[0]
  const last = cells[cells.length - 1]
  const before = placement.direction === 'across' ? key(first.x - 1, first.y) : key(first.x, first.y - 1)
  const after = placement.direction === 'across' ? key(last.x + 1, last.y) : key(last.x, last.y + 1)
  if (grid.has(before) || grid.has(after)) {
    return `${placement.word} would run straight into another word’s letters, making a longer run that isn’t an answer.`
  }
  const own = new Set(cells.map((cell) => key(cell.x, cell.y)))
  for (const answer of placed) {
    const { before: b, after: a } = answerBoundaryNeighbors(answer)
    if (own.has(key(b.x, b.y)) || own.has(key(a.x, a.y))) {
      return `${placement.word} would extend ${answer.word} past its end.`
    }
  }
  return `${placement.word} can’t go there under the crossword’s placement rules.`
}

/**
 * Whether `placement` can be added to `words` (excluding `excludeId`, the
 * word being moved or replaced), and how many words it would cross.
 * Crossing is never required here; suggestions require it separately.
 */
export function checkPlacement(words: readonly EditorWord[], placement: Placement, excludeId?: string): PlacementCheck {
  return checkWith(boardContext(words, excludeId), placement)
}

interface BoardContext {
  others: readonly EditorWord[]
  grid: Grid
  placed: PlacedAnswer[]
  bounds: ReturnType<typeof gridBounds>
}

function boardContext(words: readonly EditorWord[], excludeId?: string): BoardContext {
  const others = excludeId ? words.filter((word) => word.id !== excludeId) : words
  const { grid, placed } = buildGrid(others)
  return { others, grid, placed, bounds: gridBounds(grid) }
}

function checkWith({ others, grid, placed, bounds }: BoardContext, placement: Placement): PlacementCheck {
  if (!inBounds(placement)) return { ok: false, reason: `${placement.word} doesn’t fit inside the 12 × 12 board there.` }
  if (others.some((word) => sameAnswer(word.word, placement.word))) {
    return { ok: false, reason: `${placement.word} is already on the board. Each answer can appear only once.` }
  }
  const validated = validateCandidate(
    grid,
    bounds,
    placement.word,
    { direction: placement.direction, start: placement.start },
    { maxWidth: EDITOR_GRID_SIZE, maxHeight: EDITOR_GRID_SIZE },
    false,
    placed,
  )
  if (!validated) return { ok: false, reason: refusalReason(grid, placed, placement) }
  const crossings = wordCells(placement).filter((cell) => grid.has(key(cell.x, cell.y))).length
  return { ok: true, crossings }
}

/**
 * Suggested starting positions for `word` in `direction`: every valid
 * placement that crosses at least one existing word, or — on an empty
 * board — every valid placement at all. Disconnected placements are never
 * suggested (they can still be placed by hand).
 */
export function suggestedStarts(
  words: readonly EditorWord[],
  word: string,
  direction: Direction,
  excludeId?: string,
): Position[] {
  const context = boardContext(words, excludeId)
  const starts: Position[] = []
  const limit = EDITOR_GRID_SIZE - (word.length - 1)
  const empty = context.others.length === 0
  for (let y = 0; y < (direction === 'down' ? limit : EDITOR_GRID_SIZE); y++) {
    for (let x = 0; x < (direction === 'across' ? limit : EDITOR_GRID_SIZE); x++) {
      const check = checkWith(context, { word, direction, start: { x, y } })
      if (check.ok && (empty || check.crossings > 0)) starts.push({ x, y })
    }
  }
  return starts
}

/** Connected suggestions across both orientations (the unused-word list's count). */
export function suggestionCount(words: readonly EditorWord[], word: string, excludeId?: string): number {
  return (
    suggestedStarts(words, word, 'across', excludeId).length + suggestedStarts(words, word, 'down', excludeId).length
  )
}

/**
 * Display numbers in the usual crossword way: every cell where a word
 * starts gets the next number, reading row by row; an Across and a Down
 * word starting in the same cell share it.
 */
export function numberWords(words: readonly EditorWord[]): Map<string, number> {
  const starts = [...new Set(words.map((word) => key(word.start.x, word.start.y)))]
    .map((cellKey) => cellKey.split(',').map(Number))
    .sort(([ax, ay], [bx, by]) => ay - by || ax - bx)
  const numberAt = new Map(starts.map(([x, y], index) => [key(x, y), index + 1]))
  return new Map(words.map((word) => [word.id, numberAt.get(key(word.start.x, word.start.y)) ?? 0]))
}

/** Words in display order: Across by number, then Down by number. */
export function orderedWords(words: readonly EditorWord[]): EditorWord[] {
  const numbers = numberWords(words)
  return [...words].sort(
    (a, b) =>
      (a.direction === b.direction ? 0 : a.direction === 'across' ? -1 : 1) || numbers.get(a.id)! - numbers.get(b.id)!,
  )
}

/** The words covering a cell: at most one Across and one Down. */
export function wordsAt(words: readonly EditorWord[], x: number, y: number): EditorWord[] {
  return words.filter((word) => wordCells(word).some((cell) => cell.x === x && cell.y === y))
}

/**
 * The word a click on (x, y) selects. The first click picks the cell's
 * Across word (or its only word); clicking a cell of the selected word
 * again switches to the other word through that cell, if there is one.
 */
export function selectAt(words: readonly EditorWord[], x: number, y: number, selectedId: string | null): string | null {
  const here = wordsAt(words, x, y).sort((a, b) => (a.direction === 'across' ? -1 : 1) - (b.direction === 'across' ? -1 : 1))
  if (here.length === 0) return null
  const current = here.findIndex((word) => word.id === selectedId)
  if (current < 0) return here[0].id
  return here[(current + 1) % here.length].id
}

/** Groups of words joined through shared cells. */
export function wordGroups(words: readonly EditorWord[]): EditorWord[][] {
  const owners = new Map<string, number[]>()
  words.forEach((word, index) => {
    for (const cell of wordCells(word)) owners.set(key(cell.x, cell.y), [...(owners.get(key(cell.x, cell.y)) ?? []), index])
  })
  const seen = new Set<number>()
  const groups: EditorWord[][] = []
  words.forEach((_, start) => {
    if (seen.has(start)) return
    const group: EditorWord[] = []
    const queue = [start]
    seen.add(start)
    while (queue.length > 0) {
      const index = queue.pop()!
      group.push(words[index])
      for (const cell of wordCells(words[index])) {
        for (const other of owners.get(key(cell.x, cell.y)) ?? []) {
          if (!seen.has(other)) {
            seen.add(other)
            queue.push(other)
          }
        }
      }
    }
    groups.push(group)
  })
  return groups
}

/** Shared cells between words: each crossing counted once. */
export function intersectionCount(words: readonly EditorWord[]): number {
  const counts = new Map<string, number>()
  for (const word of words) for (const cell of wordCells(word)) counts.set(key(cell.x, cell.y), (counts.get(key(cell.x, cell.y)) ?? 0) + 1)
  return [...counts.values()].filter((count) => count > 1).length
}

/**
 * The words as a generator construction, translated so its top-left cell
 * is 0,0 (what Saved Candidates, Final Puzzle, and publishing read). Null
 * for an empty board.
 */
export function toConstruction(words: readonly EditorWord[]): ConstructionSuccess | null {
  if (words.length === 0) return null
  const cells = words.flatMap((word) => wordCells(word))
  const minX = Math.min(...cells.map((cell) => cell.x))
  const minY = Math.min(...cells.map((cell) => cell.y))
  const letters: Record<string, string> = {}
  const positions: Record<string, Position> = {}
  for (const cell of cells) {
    const x = cell.x - minX
    const y = cell.y - minY
    const id = `r${y}c${x}`
    // A conflicting letter (only possible in hand-edited files) keeps the first;
    // the geometry check reports the layout as invalid.
    letters[id] ??= cell.letter
    positions[id] = { x, y }
  }
  return {
    ok: true,
    placedAnswers: words.map((word) => ({
      word: word.word,
      direction: word.direction,
      start: { x: word.start.x - minX, y: word.start.y - minY },
    })),
    cells: letters,
    positions,
    width: Math.max(...cells.map((cell) => cell.x)) - minX + 1,
    height: Math.max(...cells.map((cell) => cell.y)) - minY + 1,
    attemptsUsed: 0,
  }
}

/** A construction's answers placed on the editor board, centered. */
export function wordsFromConstruction(construction: ConstructionSuccess): EditorWord[] {
  const offsetX = Math.max(0, Math.floor((EDITOR_GRID_SIZE - construction.width) / 2))
  const offsetY = Math.max(0, Math.floor((EDITOR_GRID_SIZE - construction.height) / 2))
  return construction.placedAnswers.map((answer, index) => ({
    id: `w${index + 1}`,
    word: answer.word,
    direction: answer.direction,
    start: { x: answer.start.x + offsetX, y: answer.start.y + offsetY },
  }))
}

export interface LayoutIssues {
  /** Anything here keeps the layout from being approved as the Final Puzzle. */
  blocking: string[]
  /** Shown, never blocking. */
  advisory: string[]
}

/**
 * The validation summary for a layout. Blocking issues are the hard
 * requirements for approval (and, re-checked independently, for
 * publishing); advisory ones are the generation guidelines that manual
 * editing may knowingly depart from.
 */
export function layoutIssues(words: readonly EditorWord[], priorityWords: readonly string[] = []): LayoutIssues {
  const blocking: string[] = []
  const advisory: string[] = []

  const outside = words.filter((word) => !inBounds(word))
  if (outside.length > 0) blocking.push(`${outside.map((word) => word.word).join(', ')} ${outside.length === 1 ? 'runs' : 'run'} outside the 12 × 12 board.`)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const word of words) {
    const normalized = word.word.toUpperCase()
    if (seen.has(normalized)) duplicates.add(normalized)
    seen.add(normalized)
  }
  if (duplicates.size > 0) blocking.push(`${[...duplicates].join(', ')} ${duplicates.size === 1 ? 'appears' : 'appear'} more than once.`)

  const construction = toConstruction(words)
  if (construction && !checkGeometryInvariant(construction).ok) {
    blocking.push('Some words touch or overlap in a way the crossword rules don’t allow, forming letter runs that aren’t answers.')
  }

  if (words.length === 0) blocking.push('The board is empty. Place at least two crossing words.')
  else if (words.length === 1) blocking.push('Only one word is placed. A crossword needs at least two crossing words.')
  else {
    if (intersectionCount(words) === 0) blocking.push('No words cross. A crossword needs at least one intersection.')
    const groups = wordGroups(words)
    if (groups.length > 1) {
      const smallest = [...groups].sort((a, b) => a.length - b.length)[0]
      blocking.push(
        `The words form ${groups.length} separate groups. Connect them into one crossword (for example, ${smallest.map((word) => word.word).join(', ')}).`,
      )
    }
  }

  if (words.length < ADVISORY_ANSWER_RANGE.min || words.length > ADVISORY_ANSWER_RANGE.max) {
    advisory.push(
      `${words.length} ${words.length === 1 ? 'answer' : 'answers'}; generated puzzles have ${ADVISORY_ANSWER_RANGE.min}–${ADVISORY_ANSWER_RANGE.max}.`,
    )
  }
  const missing = priorityWords.filter((priority) => !words.some((word) => sameAnswer(word.word, priority)))
  if (missing.length > 0) advisory.push(`Missing Priority ${missing.length === 1 ? 'Word' : 'Words'}: ${missing.join(', ')}.`)

  return { blocking, advisory }
}

// Operations. Each returns the next layout, or a reason nothing changed.

export type EditResult = { ok: true; layout: EditorLayout } | { ok: false; reason: string }

/** The next free word id for a version (ids are never reused within it). */
export function nextWordId(...lists: readonly (readonly EditorWord[])[]): string {
  const highest = Math.max(0, ...lists.flat().map((word) => Number(/^w(\d+)$/.exec(word.id)?.[1] ?? 0)))
  return `w${highest + 1}`
}

function withPoolWord(pool: EditorPoolWord[], word: string): EditorPoolWord[] {
  return pool.some((entry) => sameAnswer(entry.word, word)) ? pool : [...pool, { word, source: 'manual' }]
}

export function addWord(layout: EditorLayout, placement: Placement, id: string): EditResult {
  const check = checkPlacement(layout.words, placement)
  if (!check.ok) return check
  return {
    ok: true,
    layout: { words: [...layout.words, { id, ...placement }], pool: withPoolWord(layout.pool, placement.word) },
  }
}

/** Moves a word (and possibly turns it), all at once; the word's old cells don't count against it. */
export function moveWord(layout: EditorLayout, id: string, direction: Direction, start: Position): EditResult {
  const word = layout.words.find((each) => each.id === id)
  if (!word) return { ok: false, reason: 'That word is no longer on the board.' }
  const check = checkPlacement(layout.words, { word: word.word, direction, start }, id)
  if (!check.ok) return check
  return { ok: true, layout: { ...layout, words: layout.words.map((each) => (each.id === id ? { ...each, direction, start } : each)) } }
}

/** Replaces a word in place (same start and direction); the old answer stays in the pool, unused. */
export function replaceWord(layout: EditorLayout, id: string, replacement: string, newId: string): EditResult {
  const word = layout.words.find((each) => each.id === id)
  if (!word) return { ok: false, reason: 'That word is no longer on the board.' }
  if (sameAnswer(word.word, replacement)) return { ok: false, reason: `${replacement} is already this word.` }
  const placement = { word: replacement, direction: word.direction, start: word.start }
  const check = checkPlacement(layout.words, placement, id)
  if (!check.ok) return { ok: false, reason: `${check.reason} Try Move Word, or a different replacement.` }
  return {
    ok: true,
    layout: {
      words: layout.words.map((each) => (each.id === id ? { id: newId, ...placement } : each)),
      pool: withPoolWord(layout.pool, replacement),
    },
  }
}

/** Removes a word; letters it shares with other words stay, since those words still use them. */
export function removeWord(layout: EditorLayout, id: string): EditResult {
  if (!layout.words.some((word) => word.id === id)) return { ok: false, reason: 'That word is no longer on the board.' }
  return { ok: true, layout: { ...layout, words: layout.words.filter((word) => word.id !== id) } }
}

/** Adds an answer typed in the Editor to this version's pool only (never the Author pool). */
export function addManualWord(layout: EditorLayout, raw: string): { ok: true; layout: EditorLayout; word: string } | { ok: false; reason: string } {
  const normalized = normalizeAnswer(raw.trim())
  if (!normalized.ok) return { ok: false, reason: normalized.error }
  const word = normalized.answer
  if (layout.pool.some((entry) => sameAnswer(entry.word, word))) {
    return { ok: false, reason: `${word} is already in this candidate’s word pool.` }
  }
  return { ok: true, word, layout: { ...layout, pool: [...layout.pool, { word, source: 'manual' }] } }
}

/** Pool words not on the board, in pool order. */
export function unusedWords(layout: EditorLayout): EditorPoolWord[] {
  return layout.pool.filter((entry) => !layout.words.some((word) => sameAnswer(word.word, entry.word)))
}
