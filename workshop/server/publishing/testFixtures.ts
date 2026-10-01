// Shared fixtures for the publishing tests. Not imported by runtime code.

import type { ConstructionSuccess, PlacedAnswer } from '../../../tools/generator/src/types.js'
import { computeFingerprintV1, FINGERPRINT_VERSION } from '../../../src/publishing/fingerprint'
import type { DateKey, PublishedPuzzle } from '../../../src/publishing/types'
import { prepareFinalPuzzle } from '../../src/finalPuzzle/finalPuzzle'
import type { PublishRequest } from '../../src/publishing/contract'

/** A ConstructionSuccess built the way the generator builds one: r{y}c{x} ids, normalized positions. */
export function construct(placedAnswers: PlacedAnswer[]): ConstructionSuccess {
  const cells: Record<string, string> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  for (const answer of placedAnswers) {
    for (let i = 0; i < answer.word.length; i++) {
      const x = answer.direction === 'across' ? answer.start.x + i : answer.start.x
      const y = answer.direction === 'across' ? answer.start.y : answer.start.y + i
      cells[`r${y}c${x}`] = answer.word[i]
      positions[`r${y}c${x}`] = { x, y }
    }
  }
  const xs = Object.values(positions).map((p) => p.x)
  const ys = Object.values(positions).map((p) => p.y)
  return { ok: true, placedAnswers, cells, positions, width: Math.max(...xs) + 1, height: Math.max(...ys) + 1, attemptsUsed: 1 }
}

/** CAT across crossing TIE down: valid under every Final Puzzle rule. */
export function catsRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    construction: construct([
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ]),
    id: 'cats',
    clue: 'Cats',
    ...overrides,
  }
}

/** BAT across crossing TEN down: different valid content. */
export function batsRequest(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    construction: construct([
      { word: 'BAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TEN', direction: 'down', start: { x: 2, y: 0 } },
    ]),
    id: 'bats',
    clue: 'Bats',
    ...overrides,
  }
}

/** The publication a store would hold for `request` on `publishDate`, with its real fingerprint. */
export async function publicationFor(
  request: PublishRequest,
  publishDate: DateKey,
  createdAt = '2026-09-01T12:00:00.000Z',
): Promise<PublishedPuzzle> {
  const { puzzle, layout } = prepareFinalPuzzle(request.construction, { id: request.id, clue: request.clue })
  if (!puzzle || !layout) throw new Error('fixture did not assemble')
  return {
    puzzleId: puzzle.id,
    publishDate,
    contentFingerprint: await computeFingerprintV1(puzzle, layout),
    fingerprintVersion: FINGERPRINT_VERSION,
    puzzle,
    layout,
    createdAt,
  }
}

// Instants around the Sept 30, 2026 cutoff (EDT, UTC−4).
export const NOON_SEPT_30 = new Date('2026-09-30T16:00:00.000Z')
export const BEFORE_CUTOFF_SEPT_30 = new Date('2026-10-01T01:59:59.999Z') // 21:59:59.999 ET
export const AT_CUTOFF_SEPT_30 = new Date('2026-10-01T02:00:00.000Z') // 22:00:00.000 ET
