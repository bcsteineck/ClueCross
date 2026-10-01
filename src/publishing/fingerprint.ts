// Content fingerprint v1: SHA-256 over a canonical JSON form of exactly the
// published puzzle content. Excluded by construction (only the listed fields
// are copied): publishDate, createdAt, status, and any Workshop, generator,
// or sourcing metadata. Sorting applies only where the contract says so —
// cells, entries, and cellPositions — while entry cellIds and
// navigationOrder keep their stored order. String values are never
// normalized. Uses Web Crypto, available in browsers and Node.

import type { PuzzleDefinition } from '../core/types'
import type { LayoutDefinition } from '../layout/types'
import type { FingerprintVersion } from './types'

export const FINGERPRINT_VERSION: FingerprintVersion = 1

export interface CanonicalPuzzleContentV1 {
  puzzle: {
    id: string
    clue: string
    unlockBudget: number
    cells: { id: string; correctLetter: string }[]
    entries: { id: string; cellIds: string[] }[]
  }
  layout: {
    id: string
    puzzleId: string
    cellPositions: { cellId: string; x: number; y: number }[]
    navigationOrder: string[]
  }
}

// Code-unit order, independent of locale.
function byKey<T>(key: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => {
    const left = key(a)
    const right = key(b)
    return left < right ? -1 : left > right ? 1 : 0
  }
}

/** Builds the canonical object in the contract's exact property order. */
export function canonicalPuzzleContentV1(puzzle: PuzzleDefinition, layout: LayoutDefinition): CanonicalPuzzleContentV1 {
  return {
    puzzle: {
      id: puzzle.id,
      clue: puzzle.clue,
      unlockBudget: puzzle.unlockBudget,
      cells: Object.values(puzzle.cells)
        .map((cell) => ({ id: cell.id, correctLetter: cell.correctLetter }))
        .sort(byKey((cell) => cell.id)),
      entries: puzzle.entries
        .map((entry) => ({ id: entry.id, cellIds: [...entry.cellIds] }))
        .sort(byKey((entry) => entry.id)),
    },
    layout: {
      id: layout.id,
      puzzleId: layout.puzzleId,
      cellPositions: Object.entries(layout.cellPositions)
        .map(([cellId, position]) => ({ cellId, x: position.x, y: position.y }))
        .sort(byKey((position) => position.cellId)),
      navigationOrder: [...layout.navigationOrder],
    },
  }
}

/** Compact JSON of the canonical content: the exact bytes that are hashed (as UTF-8). */
export function canonicalPuzzleJsonV1(puzzle: PuzzleDefinition, layout: LayoutDefinition): string {
  return JSON.stringify(canonicalPuzzleContentV1(puzzle, layout))
}

/** Lowercase hex SHA-256 of `text`'s UTF-8 bytes. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function computeFingerprintV1(puzzle: PuzzleDefinition, layout: LayoutDefinition): Promise<string> {
  return sha256Hex(canonicalPuzzleJsonV1(puzzle, layout))
}
