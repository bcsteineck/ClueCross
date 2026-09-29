// Recursive backtracking construction engine for GeneratorConfig's
// fixed-answer mode: places every authored answer exactly once, honoring
// the approved hard constraints, or reports failure within a bounded,
// deterministic search budget. See tools/generator/src/types.ts for the
// authored-answer-vs-Entry distinction this stays on the near side of.

import { matchDerivedEntriesToAuthored } from '../derive/derivePlayableEntries.js'
import { normalizeAnswers } from '../input.js'
import { createRng, shuffle } from '../rng.js'
import type { Rng } from '../rng.js'
import type {
  CellId,
  ConstructionResult,
  ConstructionSuccess,
  Direction,
  GeneratorConfig,
  PlacedAnswer,
  Position,
} from '../types.js'

export const DEFAULT_MAX_ATTEMPTS = 10000

// A cell can be the crossing point of at most one across answer and one
// down answer at a time; `across`/`down` hold the index into the running
// placedAnswers list of whichever answer currently owns that direction
// through this cell, so a same-direction conflict can be detected without
// re-scanning placedAnswers.
interface CellOccupant {
  letter: string
  across?: number
  down?: number
}

type Grid = Map<string, CellOccupant>

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface Candidate {
  direction: Direction
  start: Position
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

function wordCells(word: string, candidate: Candidate): { x: number; y: number; letter: string }[] {
  const cells: { x: number; y: number; letter: string }[] = []
  for (let i = 0; i < word.length; i++) {
    cells.push({
      x: candidate.direction === 'across' ? candidate.start.x + i : candidate.start.x,
      y: candidate.direction === 'across' ? candidate.start.y : candidate.start.y + i,
      letter: word[i],
    })
  }
  return cells
}

// Every candidate this generates is anchored on a letter already present
// on the grid, so it always shares at least that one cell with the
// existing layout — later validation still re-checks this explicitly via
// `requireCrossing`, but candidate generation itself never proposes a
// placement with no relationship to the current grid at all.
export function findCandidates(grid: Grid, word: string): Candidate[] {
  const seen = new Set<string>()
  const candidates: Candidate[] = []

  for (const [key, occupant] of grid) {
    const [xStr, yStr] = key.split(',')
    const cellX = Number(xStr)
    const cellY = Number(yStr)

    for (let k = 0; k < word.length; k++) {
      if (word[k] !== occupant.letter) continue

      const options: Candidate[] = [
        { direction: 'across', start: { x: cellX - k, y: cellY } },
        { direction: 'down', start: { x: cellX, y: cellY - k } },
      ]
      for (const candidate of options) {
        const signature = `${candidate.direction}|${candidate.start.x}|${candidate.start.y}`
        if (seen.has(signature)) continue
        seen.add(signature)
        candidates.push(candidate)
      }
    }
  }
  return candidates
}

function boundsWith(bounds: Bounds | null, x: number, y: number): Bounds {
  if (!bounds) return { minX: x, maxX: x, minY: y, maxY: y }
  return {
    minX: Math.min(bounds.minX, x),
    maxX: Math.max(bounds.maxX, x),
    minY: Math.min(bounds.minY, y),
    maxY: Math.max(bounds.maxY, y),
  }
}

export interface ValidatedCandidate {
  cells: { x: number; y: number; letter: string }[]
  bounds: Bounds
}

// The cell immediately before an answer's own start, and immediately
// after its own end, along its own axis — the two positions that must
// stay unoccupied for the answer's authored span to remain exactly
// recoverable as one maximal contiguous run (see the authored-run-
// extension checks in validateCandidate below). Derived purely from the
// answer's own direction/start/length, independent of anything else on
// the grid.
export function answerBoundaryNeighbors(answer: PlacedAnswer): { before: Position; after: Position } {
  const length = answer.word.length
  if (answer.direction === 'across') {
    return {
      before: { x: answer.start.x - 1, y: answer.start.y },
      after: { x: answer.start.x + length, y: answer.start.y },
    }
  }
  return {
    before: { x: answer.start.x, y: answer.start.y - 1 },
    after: { x: answer.start.x, y: answer.start.y + length },
  }
}

// Checks every approved hard constraint for one candidate placement:
//  - matching letters at any shared cell (mismatched crossing is rejected)
//  - no same-direction overlap with an existing answer
//  - at least one crossing with the existing grid, unless this is the seed
//    answer (requireCrossing = false)
//  - no authored-run extension in either direction of the interaction:
//    (1) the candidate's own span must not gain an extra cell before its
//        start or after its end from ANY existing occupied cell, and
//    (2) the candidate must not place a new cell immediately before/after
//        any ALREADY-PLACED answer's own span, extending THAT answer's run
//    (see the module-level note on why this is direction-independent, not
//    just "same direction as the neighbor")
//  - no side contact: every cell the candidate NEWLY occupies must have
//    both perpendicular neighbors unoccupied (see the side-contact check
//    below — this is what keeps every derived run an authored answer)
//  - the resulting bounding box still fits config.maxWidth/config.maxHeight
// Returns the word's cells and the bounds they'd produce on success, or
// null if any constraint fails.
export function validateCandidate(
  grid: Grid,
  bounds: Bounds | null,
  word: string,
  candidate: Candidate,
  config: Pick<GeneratorConfig, 'maxWidth' | 'maxHeight'>,
  requireCrossing: boolean,
  placedAnswers: PlacedAnswer[],
): ValidatedCandidate | null {
  const cells = wordCells(word, candidate)
  let sharesCrossing = false

  for (const cell of cells) {
    const occupant = grid.get(cellKey(cell.x, cell.y))
    if (!occupant) continue
    if (occupant.letter !== cell.letter) return null // mismatched crossing

    const sameDirectionOwner = candidate.direction === 'across' ? occupant.across : occupant.down
    if (sameDirectionOwner !== undefined) return null // same-direction overlap

    sharesCrossing = true
  }

  if (requireCrossing && !sharesCrossing) return null

  // Side-contact check (the ClueCross geometry invariant: every maximal
  // run of 2+ occupied cells must be exactly one authored answer, so
  // there are never incidental entries). A cell this candidate newly
  // occupies has no owner along the perpendicular axis — the candidate is
  // its only answer, and it runs along the other axis — so any occupied
  // perpendicular neighbor would join it into a perpendicular run that no
  // authored answer spans (e.g. two parallel words side by side, or a
  // word brushing past the end or side of another without crossing it).
  // Crossing cells are exempt: their perpendicular run is the existing
  // answer being crossed, which the authored-run-extension checks below
  // keep exact. This is the whole rule, not a simplification of it —
  // "no neighbor" applies only to new cells, and only across the axis.
  for (const cell of cells) {
    if (grid.has(cellKey(cell.x, cell.y))) continue // crossing cell
    const sideA = candidate.direction === 'across' ? cellKey(cell.x, cell.y - 1) : cellKey(cell.x - 1, cell.y)
    const sideB = candidate.direction === 'across' ? cellKey(cell.x, cell.y + 1) : cellKey(cell.x + 1, cell.y)
    if (grid.has(sideA) || grid.has(sideB)) return null
  }

  // Authored-run-extension check, part 1 (candidate extends itself): the
  // cell immediately before the candidate's own start, and immediately
  // after its own end, must both be completely unoccupied — by anything,
  // not just a same-direction answer. derivePlayableEntries merges any
  // two axis-adjacent occupied cells into one run regardless of which
  // direction(s) placed them, so an occupied neighbor here — whichever
  // direction owns it — would extend this word's own authored span before
  // it's even fully placed.
  const first = cells[0]
  const last = cells[cells.length - 1]
  const before =
    candidate.direction === 'across' ? { x: first.x - 1, y: first.y } : { x: first.x, y: first.y - 1 }
  const after =
    candidate.direction === 'across' ? { x: last.x + 1, y: last.y } : { x: last.x, y: last.y + 1 }

  if (grid.has(cellKey(before.x, before.y))) return null
  if (grid.has(cellKey(after.x, after.y))) return null

  // Authored-run-extension check, part 2 (candidate extends an existing
  // answer): a cell the candidate is about to place can be entirely
  // legal as part of the CANDIDATE's own span while still landing exactly
  // one cell beyond an ALREADY-PLACED answer's start/end along THAT
  // answer's own axis — e.g. a new across answer's own start cell sitting
  // immediately below an existing down answer's last cell. That's legal
  // from the candidate's own perspective (checked above) but would still
  // extend the existing answer's recoverable run, so it has to be
  // rejected here, from the existing answer's perspective.
  const candidateCellKeys = new Set(cells.map((cell) => cellKey(cell.x, cell.y)))
  for (const existingAnswer of placedAnswers) {
    const { before: existingBefore, after: existingAfter } = answerBoundaryNeighbors(existingAnswer)
    if (candidateCellKeys.has(cellKey(existingBefore.x, existingBefore.y))) return null
    if (candidateCellKeys.has(cellKey(existingAfter.x, existingAfter.y))) return null
  }

  let nextBounds = bounds
  for (const cell of cells) {
    nextBounds = boundsWith(nextBounds, cell.x, cell.y)
  }
  if (!nextBounds) return null // unreachable: cells is never empty
  const width = nextBounds.maxX - nextBounds.minX + 1
  const height = nextBounds.maxY - nextBounds.minY + 1
  if (width > config.maxWidth || height > config.maxHeight) return null

  return { cells, bounds: nextBounds }
}

function commitCandidate(
  grid: Grid,
  candidate: Candidate,
  cells: { x: number; y: number; letter: string }[],
  answerIndex: number,
): Grid {
  const next: Grid = new Map(grid)
  for (const cell of cells) {
    const key = cellKey(cell.x, cell.y)
    const existing = next.get(key)
    const occupant: CellOccupant = existing ? { ...existing } : { letter: cell.letter }
    if (candidate.direction === 'across') occupant.across = answerIndex
    else occupant.down = answerIndex
    next.set(key, occupant)
  }
  return next
}

interface AttemptCounter {
  used: number
  limit: number
}

// Returns false once the budget is exhausted; increments unconditionally
// so `used` always reflects exactly how many placements were attempted.
function nextAttempt(counter: AttemptCounter): boolean {
  counter.used += 1
  return counter.used <= counter.limit
}

export interface SearchState {
  grid: Grid
  bounds: Bounds | null
  placedAnswers: PlacedAnswer[]
}

type SearchResult = SearchState | 'budget-exhausted' | null

// One remaining word's currently-legal placements, computed fresh against
// a specific partial grid — this is what "currently placeable" means at
// any given point in the search, as opposed to a word's placements against
// the *original* empty grid.
export interface ScoredCandidate extends ValidatedCandidate {
  candidate: Candidate
}

export interface ScoredWord {
  word: string
  candidates: ScoredCandidate[]
}

const SEED_CANDIDATES: Candidate[] = [
  { direction: 'across', start: { x: 0, y: 0 } },
  { direction: 'down', start: { x: 0, y: 0 } },
]

// Validates every currently-possible placement of every remaining word
// against the given partial grid. Each candidate validated here consumes
// one attempt from the budget, the same as an actual placement — deciding
// what's currently placeable is real search work, not free bookkeeping,
// so it has to stay inside the same deterministic budget everything else
// does.
export function scoreRemainingWords(
  remaining: string[],
  state: SearchState,
  config: Pick<GeneratorConfig, 'maxWidth' | 'maxHeight'>,
  rng: Rng,
  counter: AttemptCounter,
  isFirstPlacement: boolean,
): ScoredWord[] | 'budget-exhausted' {
  const scored: ScoredWord[] = []

  for (const word of remaining) {
    const rawCandidates = isFirstPlacement ? SEED_CANDIDATES : findCandidates(state.grid, word)
    const shuffledRaw = shuffle(rawCandidates, rng)

    const validCandidates: ScoredCandidate[] = []
    for (const candidate of shuffledRaw) {
      if (!nextAttempt(counter)) return 'budget-exhausted'
      const validated = validateCandidate(
        state.grid,
        state.bounds,
        word,
        candidate,
        config,
        !isFirstPlacement,
        state.placedAnswers,
      )
      if (validated) validCandidates.push({ ...validated, candidate })
    }

    scored.push({ word, candidates: validCandidates })
  }

  return scored
}

// Ranks only the words that currently have at least one legal placement —
// a word with none right now is left out entirely (it stays in
// `remaining` for a later recursion level, once some other word may have
// created a crossing opportunity for it) rather than failing this branch.
//
// Most-constrained-first (fewest legal placements right now) is a
// standard, simple constraint-satisfaction heuristic: a word running out
// of room should be placed while it still has options, rather than risk
// having zero later. Longer word is a secondary preference (it offers
// more distinct letters for others to cross against), and anything still
// tied is broken by the seeded shuffle, so the same seed always produces
// the same ranking.
export function rankPlaceableWords(scored: ScoredWord[], rng: Rng): ScoredWord[] {
  const placeable = scored.filter((entry) => entry.candidates.length > 0)
  const shuffled = shuffle(placeable, rng)
  return shuffled.sort((a, b) => {
    if (a.candidates.length !== b.candidates.length) return a.candidates.length - b.candidates.length
    return b.word.length - a.word.length
  })
}

// Recursively places the remaining words in no fixed order: at each level
// it (re-)scores every still-unplaced word against the *current* partial
// grid, ranks whichever ones are currently placeable, and tries them —
// backtracking over both which placement to use for a word AND which word
// to try next, rather than committing to one global ordering up front.
// A word with no legal placement right now simply isn't a candidate at
// this level; it isn't a failure unless *no* remaining word is placeable.
function search(
  remaining: string[],
  state: SearchState,
  config: Pick<GeneratorConfig, 'maxWidth' | 'maxHeight'>,
  rng: Rng,
  counter: AttemptCounter,
): SearchResult {
  if (remaining.length === 0) return state

  const isFirstPlacement = state.placedAnswers.length === 0
  const scored = scoreRemainingWords(remaining, state, config, rng, counter, isFirstPlacement)
  if (scored === 'budget-exhausted') return 'budget-exhausted'

  const ranked = rankPlaceableWords(scored, rng)
  if (ranked.length === 0) return null // nothing remaining can be placed right now

  for (const entry of ranked) {
    const nextRemaining = remaining.filter((word) => word !== entry.word)

    for (const scoredCandidate of entry.candidates) {
      const answerIndex = state.placedAnswers.length
      const nextGrid = commitCandidate(
        state.grid,
        scoredCandidate.candidate,
        scoredCandidate.cells,
        answerIndex,
      )
      const nextState: SearchState = {
        grid: nextGrid,
        bounds: scoredCandidate.bounds,
        placedAnswers: [
          ...state.placedAnswers,
          {
            word: entry.word,
            direction: scoredCandidate.candidate.direction,
            start: scoredCandidate.candidate.start,
          },
        ],
      }

      const result = search(nextRemaining, nextState, config, rng, counter)
      if (result === 'budget-exhausted') return 'budget-exhausted'
      if (result) return result
      // Dead end further down the recursion — try the next candidate for
      // this word, and once those are exhausted, fall through to the
      // next-ranked word (word-choice backtracking, not just placement
      // backtracking).
    }
  }

  return null
}

function toResult(state: SearchState, attemptsUsed: number): ConstructionSuccess {
  const bounds = state.bounds
  if (!bounds) {
    // Every successful search places at least the seed answer, which
    // always establishes bounds first.
    throw new Error('Internal error: successful search produced no bounds.')
  }

  const cells: Record<CellId, string> = {}
  const positions: Record<CellId, Position> = {}
  for (const [key, occupant] of state.grid) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr) - bounds.minX
    const y = Number(yStr) - bounds.minY
    const id = `r${y}c${x}`
    cells[id] = occupant.letter
    positions[id] = { x, y }
  }

  const placedAnswers: PlacedAnswer[] = state.placedAnswers.map((answer) => ({
    ...answer,
    start: { x: answer.start.x - bounds.minX, y: answer.start.y - bounds.minY },
  }))

  return {
    ok: true,
    placedAnswers,
    cells,
    positions,
    width: bounds.maxX - bounds.minX + 1,
    height: bounds.maxY - bounds.minY + 1,
    attemptsUsed,
  }
}

export function constructFixedAnswerPuzzle(config: GeneratorConfig): ConstructionResult {
  const normalized = normalizeAnswers(config.answers)
  if (!normalized.ok) {
    return { ok: false, reason: `Invalid input: ${normalized.errors.join(' ')}`, attemptsUsed: 0 }
  }

  const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const rng = createRng(config.seed)
  const counter: AttemptCounter = { used: 0, limit: maxAttempts }

  const initialState: SearchState = { grid: new Map(), bounds: null, placedAnswers: [] }
  const result = search(normalized.answers, initialState, config, rng, counter)

  if (result === 'budget-exhausted') {
    return {
      ok: false,
      reason: `Search budget exhausted after ${counter.used} attempts (maxAttempts=${maxAttempts}).`,
      attemptsUsed: counter.used,
    }
  }
  if (!result) {
    return {
      ok: false,
      reason: 'No legal connected arrangement found for this answer list and configuration.',
      attemptsUsed: counter.used,
    }
  }
  return checkGeometryInvariant(toResult(result, counter.used))
}

// Final defensive invariant: a construction is only a success if its
// derived playable entries are exactly its authored answers (see
// matchDerivedEntriesToAuthored). validateCandidate should make this
// unreachable; if a future placement change breaks that, the construction
// fails loudly here instead of emitting accidental entries.
export function checkGeometryInvariant(construction: ConstructionSuccess): ConstructionResult {
  const match = matchDerivedEntriesToAuthored(construction.placedAnswers, construction.positions)
  if (match.ok) return construction

  const incidental = match.incidentalRuns
    .map((run) => `${run.direction} ${run.cellIds.map((id) => construction.cells[id]).join('')}`)
    .join(', ')
  const unmatched = match.unmatchedAnswers.map((answer) => answer.word).join(', ')
  return {
    ok: false,
    reason:
      `Geometry invariant violated: derived entries must equal authored answers ` +
      `(incidental runs: ${incidental || 'none'}; unmatched answers: ${unmatched || 'none'}).`,
    attemptsUsed: construction.attemptsUsed,
  }
}
