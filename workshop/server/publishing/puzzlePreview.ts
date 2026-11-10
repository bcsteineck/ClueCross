// Read-only preview of one stored publication, for the Production Schedule's
// Preview action. It is the one place a scheduled (unreleased) puzzle's
// content leaves the database for the Workshop browser, and only for the
// puzzle the operator asked about: the schedule list itself stays metadata
// only, and the player API still serves released rows only.
//
// The request names the puzzle ID and the fingerprint the schedule showed.
// If that ID is gone, or now holds different content, nothing is shown —
// a stale schedule can never display a different puzzle than it listed.
// Nothing here writes; it uses the store's non-locking reader.

import { parseLayoutDefinition, parsePuzzleDefinition } from '../../../src/publishing/publishedContent'
import { releaseInstant } from '../../../src/publishing/releaseSchedule'
import { deriveEntryDirection } from '../../../src/layout/entryDirection'
import type { PreviewAnswer, PreviewBoard, PuzzlePreview, SchedulePuzzle } from '../../src/production/contract'
import type { PublishedPuzzle } from '../../../src/publishing/types'
import type { PublicationReader } from './publicationStore'

export type PuzzlePreviewOutcome =
  | { kind: 'ok'; preview: PuzzlePreview }
  | { kind: 'not-found' }
  | { kind: 'changed'; current: SchedulePuzzle }
  /** The stored content isn't a readable puzzle; nothing is shown. */
  | { kind: 'unreadable' }

/**
 * The stored puzzle as a grid and an answer list, or null if the stored
 * content is malformed. Pure: rebuilt from known fields only, using the
 * stored cells, positions, and entries as they are (nothing regenerated).
 */
export function buildPreviewContent(record: Pick<PublishedPuzzle, 'puzzle' | 'layout'>): { board: PreviewBoard; answers: PreviewAnswer[] } | null {
  const puzzle = parsePuzzleDefinition(record.puzzle)
  const layout = parseLayoutDefinition(record.layout)
  if (!puzzle || !layout) return null
  const cellIds = Object.keys(puzzle.cells)
  if (cellIds.length === 0 || cellIds.some((cellId) => !layout.cellPositions[cellId])) return null

  const positions = cellIds.map((cellId) => layout.cellPositions[cellId])
  const minX = Math.min(...positions.map((position) => position.x))
  const minY = Math.min(...positions.map((position) => position.y))
  const board: PreviewBoard = { width: 0, height: 0, cells: {}, positions: {} }
  for (const cellId of cellIds) {
    const { x, y } = layout.cellPositions[cellId]
    board.cells[cellId] = puzzle.cells[cellId].correctLetter
    board.positions[cellId] = { x: x - minX, y: y - minY }
    board.width = Math.max(board.width, x - minX + 1)
    board.height = Math.max(board.height, y - minY + 1)
  }

  const answers: PreviewAnswer[] = []
  for (const entry of puzzle.entries) {
    if (entry.cellIds.some((cellId) => !puzzle.cells[cellId])) return null
    answers.push({
      word: entry.cellIds.map((cellId) => puzzle.cells[cellId].correctLetter).join(''),
      direction: deriveEntryDirection(entry, layout),
    })
  }
  return { board, answers }
}

export async function previewStoredPuzzle(reader: PublicationReader, puzzleId: string, expectedFingerprint: string): Promise<PuzzlePreviewOutcome> {
  const record = await reader.findById(puzzleId)
  if (!record) return { kind: 'not-found' }
  const instant = releaseInstant(record.publishDate)
  if (record.contentFingerprint !== expectedFingerprint) {
    return {
      kind: 'changed',
      current: {
        puzzleId: record.puzzleId,
        clue: parsePuzzleDefinition(record.puzzle)?.clue ?? '',
        publishDate: record.publishDate,
        releaseInstant: instant.toISOString(),
        contentFingerprint: record.contentFingerprint,
      },
    }
  }
  const content = buildPreviewContent(record)
  const puzzle = parsePuzzleDefinition(record.puzzle)
  if (!content || !puzzle) return { kind: 'unreadable' }
  const now = await reader.now()
  return {
    kind: 'ok',
    preview: {
      puzzleId: record.puzzleId,
      clue: puzzle.clue,
      publishDate: record.publishDate,
      releaseInstant: instant.toISOString(),
      status: instant.getTime() <= now.getTime() ? 'released' : 'scheduled',
      contentFingerprint: record.contentFingerprint,
      ...content,
    },
  }
}
