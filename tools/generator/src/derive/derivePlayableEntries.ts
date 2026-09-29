// Step 1 + Step 2 of the authored-answer -> derived-playable-entry
// pipeline (see tools/generator/src/types.ts for the concept split this
// stays on the near side of):
//
//   authored answers -> placed geometry -> occupied cells
//     -> derived playable entries (this file)
//     -> PuzzleDefinition + LayoutDefinition (assemble/buildPuzzle.ts)
//
// derivePlayableEntries (Step 1) looks ONLY at final occupied-cell
// geometry — it has no notion of which authored answer, if any, produced
// a given run, so it intentionally also surfaces incidental runs no
// authored answer intended (e.g. the "rasa" case already present in the
// production Space puzzle). assignEntryIds (Step 2) is the only place
// authored answers and derived geometry meet: it decides, per derived
// run, whether to reuse an authored answer's word as its id or synthesize
// one, and it is where the authored-answer-recovery invariant is checked.

import type { CellId, Direction, PlacedAnswer, Position } from '../types.js'

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

// Exported (unchanged behavior) so Phase 3 metrics can compute an
// authored answer's own cell span the same way Step 2 does, instead of
// re-deriving this geometry logic or falling back to id-text matching.
export function buildCellAt(positions: Record<CellId, Position>): Map<string, CellId> {
  const cellAt = new Map<string, CellId>()
  for (const [cellId, position] of Object.entries(positions)) {
    cellAt.set(cellKey(position.x, position.y), cellId)
  }
  return cellAt
}

// A maximal contiguous run of 2+ occupied cells along one axis, before any
// id has been assigned to it.
export interface DerivedRun {
  direction: Direction
  cellIds: CellId[]
}

function findRuns(
  cellAt: Map<string, CellId>,
  positions: Record<CellId, Position>,
  direction: Direction,
): DerivedRun[] {
  const runs: DerivedRun[] = []

  for (const [cellId, position] of Object.entries(positions)) {
    // A cell only starts a run along this axis if the previous cell along
    // the axis is unoccupied — otherwise it's the middle or end of a run
    // that some earlier cell already started, and will be found from
    // there. This visits every maximal run exactly once without needing
    // a separate "already visited" set.
    const previousKey =
      direction === 'across' ? cellKey(position.x - 1, position.y) : cellKey(position.x, position.y - 1)
    if (cellAt.has(previousKey)) continue

    const cellIds: CellId[] = [cellId]
    let x = position.x
    let y = position.y
    for (;;) {
      if (direction === 'across') x += 1
      else y += 1
      const nextId = cellAt.get(cellKey(x, y))
      if (!nextId) break
      cellIds.push(nextId)
    }

    if (cellIds.length >= 2) {
      runs.push({ direction, cellIds })
    }
  }

  return runs
}

// Step 1: derives one playable Entry-shaped run for every maximal
// contiguous horizontal or vertical run of 2+ occupied cells. A run is
// maximal when extending one cell farther in either direction along its
// axis would land on an unoccupied cell. Single occupied cells never
// become a run in either direction.
export function derivePlayableEntries(positions: Record<CellId, Position>): DerivedRun[] {
  const cellAt = buildCellAt(positions)
  return [...findRuns(cellAt, positions, 'across'), ...findRuns(cellAt, positions, 'down')]
}

// Exported alongside buildCellAt/answerCellIds for the same reason.
export function runSignature(direction: Direction, cellIds: CellId[]): string {
  return `${direction}|${cellIds.join(',')}`
}

// An authored answer's own cell span, recomputed independently from its
// start/direction/word — NOT read off of any derived run — so it can be
// compared against the derived runs rather than assumed to match one.
export function answerCellIds(answer: PlacedAnswer, cellAt: Map<string, CellId>): CellId[] {
  const cellIds: CellId[] = []
  for (let i = 0; i < answer.word.length; i++) {
    const x = answer.direction === 'across' ? answer.start.x + i : answer.start.x
    const y = answer.direction === 'across' ? answer.start.y : answer.start.y + i
    const cellId = cellAt.get(cellKey(x, y))
    if (!cellId) {
      // Every cell an authored answer occupies must be part of the same
      // occupied-cell geometry the runs were derived from — a missing
      // cell here means the caller passed positions that don't actually
      // contain this answer's placement, which is a caller error, not a
      // recoverable geometry outcome.
      throw new Error(
        `Internal error: authored answer "${answer.word}" occupies a cell at ` +
          `(${x}, ${y}) that has no entry in the supplied positions.`,
      )
    }
    cellIds.push(cellId)
  }
  return cellIds
}

// A derived run with its final id assigned: either an authored answer's
// own word (reused, lowercased, when the run exactly matches that
// answer's cell span) or a synthesized id for a run with no exact
// authored match.
export interface DerivedEntry {
  id: string
  direction: Direction
  cellIds: CellId[]
}

export interface EntryAssignmentSuccess {
  ok: true
  entries: DerivedEntry[]
}

// One or more authored answers could not be recovered as an exact derived
// run — e.g. two answers placed end-to-end merged into one ambiguous run
// during derivation (the case Phase 1's approved authored-run-extension
// rule exists to prevent in real search output — see validateCandidate in
// placement/backtrack.ts). Assembly must stop rather than silently accept
// geometry that lost authored-answer structure.
export interface EntryAssignmentFailure {
  ok: false
  unrecoverableAnswers: PlacedAnswer[]
}

export type EntryAssignmentResult = EntryAssignmentSuccess | EntryAssignmentFailure

function answeredEntryId(word: string): string {
  return word.toLowerCase()
}

function synthesizedEntryId(direction: Direction, start: Position): string {
  return `${direction}-r${start.y}-c${start.x}`
}

// Throws on a duplicate id rather than returning a failure result: given
// the id scheme above, a collision can't arise from legitimate generator
// output —
//   - two authored answers with identical text are already rejected by
//     Phase 1 input normalization (normalizeAnswers), so at most one
//     answer can ever produce a given `answeredEntryId`;
//   - an authored word is always letters-only (Phase 1 input validation),
//     while a synthesized id always contains at least one digit (its row
//     or column), so the two id families can never collide with each
//     other;
//   - an across run and a down run starting at the same coordinate
//     synthesize to different strings, because the direction is part of
//     the id.
// A collision here means one of those invariants was violated upstream,
// which is a defect worth failing loudly on rather than silently
// overwriting an entry.
export function assertUniqueEntryIds(entries: DerivedEntry[]): void {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      throw new Error(`Internal error: duplicate entry id "${entry.id}" during assembly.`)
    }
    seen.add(entry.id)
  }
}

// The ClueCross geometry invariant for generated puzzles: derived playable
// entries must EQUAL authored answers — a one-to-one match by exact span
// and direction, with no incidental runs and no unrecoverable answers.
// Placement legality (validateCandidate's side-contact and authored-run-
// extension checks) is what actually prevents violations; this is the
// final, geometry-only backstop so a future placement-rule change can't
// silently reintroduce accidental entries. Matching is by placement
// identity (span + direction), never by text: a run whose letters happen
// to spell some other pool word is still incidental.
//
// derivePlayableEntries/assignEntryIds themselves stay permissive, since
// they also describe hand-authored geometry (e.g. the Space puzzle's
// "rasa") and power the incidental-entry diagnostic metric.
export interface AuthoredEntryMatchSuccess {
  ok: true
}

export interface AuthoredEntryMatchFailure {
  ok: false
  /** Derived runs that no authored answer spans exactly. */
  incidentalRuns: DerivedRun[]
  /** Authored answers that aren't exactly one derived run. */
  unmatchedAnswers: PlacedAnswer[]
}

export type AuthoredEntryMatchResult = AuthoredEntryMatchSuccess | AuthoredEntryMatchFailure

export function matchDerivedEntriesToAuthored(
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
): AuthoredEntryMatchResult {
  const cellAt = buildCellAt(positions)
  const runs = derivePlayableEntries(positions)

  const runSignatures = new Set(runs.map((run) => runSignature(run.direction, run.cellIds)))
  const authoredSignatures = new Set<string>()
  const unmatchedAnswers: PlacedAnswer[] = []
  for (const answer of placedAnswers) {
    const signature = runSignature(answer.direction, answerCellIds(answer, cellAt))
    // A second answer on an already-claimed span can't be one-to-one.
    if (!runSignatures.has(signature) || authoredSignatures.has(signature)) unmatchedAnswers.push(answer)
    authoredSignatures.add(signature)
  }
  const incidentalRuns = runs.filter((run) => !authoredSignatures.has(runSignature(run.direction, run.cellIds)))

  if (incidentalRuns.length > 0 || unmatchedAnswers.length > 0 || runs.length !== placedAnswers.length) {
    return { ok: false, incidentalRuns, unmatchedAnswers }
  }
  return { ok: true }
}

// Step 2: matches each derived run against the authored answers by exact
// cell-span equality (same direction, same cells, in the same order —
// not merely the same letters), assigning ids and verifying every
// authored answer is recoverable.
export function assignEntryIds(
  runs: DerivedRun[],
  placedAnswers: PlacedAnswer[],
  positions: Record<CellId, Position>,
): EntryAssignmentResult {
  const cellAt = buildCellAt(positions)

  const runSignatures = new Set(runs.map((run) => runSignature(run.direction, run.cellIds)))
  const idBySignature = new Map<string, string>()
  const unrecoverableAnswers: PlacedAnswer[] = []

  for (const answer of placedAnswers) {
    const cellIds = answerCellIds(answer, cellAt)
    const signature = runSignature(answer.direction, cellIds)
    if (!runSignatures.has(signature)) {
      unrecoverableAnswers.push(answer)
      continue
    }
    const id = answeredEntryId(answer.word)
    const existingId = idBySignature.get(signature)
    if (existingId !== undefined && existingId !== id) {
      // Two different authored answers resolving to the same cell span
      // would otherwise silently overwrite one another below. Phase 1's
      // same-direction-overlap rule already prevents this in real search
      // output (two distinct answers can never legally occupy the same
      // span), so this is a defensive guard against a violated upstream
      // invariant, not an expected outcome.
      throw new Error(
        `Internal error: authored answers "${existingId}" and "${id}" both resolve to ` +
          `the same cell span; Phase 1's same-direction-overlap rule should have prevented this.`,
      )
    }
    idBySignature.set(signature, id)
  }

  if (unrecoverableAnswers.length > 0) {
    return { ok: false, unrecoverableAnswers }
  }

  const entries: DerivedEntry[] = runs.map((run) => {
    const signature = runSignature(run.direction, run.cellIds)
    const id = idBySignature.get(signature) ?? synthesizedEntryId(run.direction, positions[run.cellIds[0]])
    return { id, direction: run.direction, cellIds: run.cellIds }
  })

  assertUniqueEntryIds(entries)

  return { ok: true, entries }
}
