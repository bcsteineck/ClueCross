import { describe, expect, it } from 'vitest'
import type { PublishedPuzzle } from '../../../src/publishing/types'
import { MemoryPublicationStore } from './memoryPublicationStore'
import { buildPreviewContent, previewStoredPuzzle } from './puzzlePreview'
import { batsRequest, catsRequest, construct, publicationFor } from './testFixtures'

const NOON_OCT_6 = new Date('2026-10-06T16:00:00.000Z') // EDT

// ELEPHANT across, TIGER down from its T, RHINO across from TIGER's R.
const zooRequest = () =>
  catsRequest({
    id: 'zoo',
    clue: 'At the Zoo',
    construction: construct([
      { word: 'ELEPHANT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIGER', direction: 'down', start: { x: 7, y: 0 } },
      { word: 'RHINO', direction: 'across', start: { x: 7, y: 4 } },
    ]),
  })

/** The same stored puzzle with every position shifted, as a non-normalized layout would be. */
function shifted(record: PublishedPuzzle, dx: number, dy: number): PublishedPuzzle {
  const cellPositions = Object.fromEntries(Object.entries(record.layout.cellPositions).map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]))
  return { ...record, layout: { ...record.layout, cellPositions } }
}

function grid(board: { width: number; height: number; cells: Record<string, string>; positions: Record<string, { x: number; y: number }> }) {
  const rows = Array.from({ length: board.height }, () => Array.from({ length: board.width }, () => '.'))
  for (const [cellId, letter] of Object.entries(board.cells)) rows[board.positions[cellId].y][board.positions[cellId].x] = letter
  return rows.map((row) => row.join(''))
}

describe('buildPreviewContent', () => {
  it('renders the stored letters at their stored positions, with intersections and empty cells', async () => {
    const content = buildPreviewContent(await publicationFor(zooRequest(), '2026-10-07'))
    expect(content && grid(content.board)).toEqual([
      'ELEPHANT....',
      '.......I....',
      '.......G....',
      '.......E....',
      '.......RHINO',
    ])
    expect(content?.board).toMatchObject({ width: 12, height: 5 })
    expect(Object.keys(content?.board.cells ?? {})).toHaveLength(16) // the two crossings share cells
  })

  it('lists every stored answer in entry order, with its direction', async () => {
    const record = await publicationFor(zooRequest(), '2026-10-07')
    const content = buildPreviewContent(record)
    expect(content?.answers.map((answer) => answer.word).sort()).toEqual(['ELEPHANT', 'RHINO', 'TIGER'])
    // Exactly the stored entries, in their stored order.
    expect(content?.answers.map((answer) => answer.word)).toEqual(
      record.puzzle.entries.map((entry) => entry.cellIds.map((id) => record.puzzle.cells[id].correctLetter).join('')),
    )
    expect(Object.fromEntries(content!.answers.map((a) => [a.word, a.direction]))).toEqual({ ELEPHANT: 'across', TIGER: 'down', RHINO: 'across' })
  })

  it('shifts a nontrivial offset to the top-left without changing the shape', async () => {
    const record = await publicationFor(zooRequest(), '2026-10-07')
    const plain = buildPreviewContent(record)
    const offset = buildPreviewContent(shifted(record, 4, 9))
    expect(offset?.board).toEqual(plain?.board)
    expect(offset?.answers).toEqual(plain?.answers)
  })

  it('returns null for malformed stored content rather than guessing', async () => {
    const record = await publicationFor(catsRequest(), '2026-10-07')
    const firstCell = Object.keys(record.puzzle.cells)[0]
    const { [firstCell]: _removed, ...positions } = record.layout.cellPositions
    expect(buildPreviewContent({ ...record, layout: { ...record.layout, cellPositions: positions } })).toBeNull()
    expect(buildPreviewContent({ ...record, puzzle: { ...record.puzzle, entries: [{ id: 'x', cellIds: ['nope'] }] } })).toBeNull()
    expect(buildPreviewContent({ puzzle: null as unknown as PublishedPuzzle['puzzle'], layout: record.layout })).toBeNull()
  })

  it('carries only the fields the preview renders', async () => {
    const content = buildPreviewContent(await publicationFor(catsRequest(), '2026-10-07'))
    expect(Object.keys(content!).sort()).toEqual(['answers', 'board'])
    expect(Object.keys(content!.board).sort()).toEqual(['cells', 'height', 'positions', 'width'])
  })
})

describe('previewStoredPuzzle', () => {
  async function store() {
    return new MemoryPublicationStore({
      now: NOON_OCT_6,
      records: [
        await publicationFor(catsRequest({ id: 'colors', clue: 'Colors' }), '2026-10-06'),
        await publicationFor(zooRequest(), '2026-10-07'),
      ],
    })
  }

  it('previews a scheduled puzzle with its stored content and database-time status', async () => {
    const memory = await store()
    const zoo = memory.records().find((r) => r.puzzleId === 'zoo')!
    const outcome = await previewStoredPuzzle(memory.reader(), 'zoo', zoo.contentFingerprint)
    expect(outcome).toMatchObject({
      kind: 'ok',
      preview: {
        puzzleId: 'zoo',
        clue: 'At the Zoo',
        publishDate: '2026-10-07',
        releaseInstant: '2026-10-07T02:00:00.000Z',
        status: 'scheduled',
        contentFingerprint: zoo.contentFingerprint,
      },
    })
  })

  it('previews a released puzzle, and the status follows the database clock', async () => {
    const memory = await store()
    const colors = memory.records().find((r) => r.puzzleId === 'colors')!
    expect(await previewStoredPuzzle(memory.reader(), 'colors', colors.contentFingerprint)).toMatchObject({ kind: 'ok', preview: { status: 'released' } })

    const zoo = memory.records().find((r) => r.puzzleId === 'zoo')!
    memory.setNow(new Date('2026-10-07T02:00:00.000Z')) // 10 PM ET Oct 6
    expect(await previewStoredPuzzle(memory.reader(), 'zoo', zoo.contentFingerprint)).toMatchObject({ kind: 'ok', preview: { status: 'released' } })
  })

  it('refuses a removed puzzle and a fingerprint that no longer matches', async () => {
    const memory = await store()
    expect(await previewStoredPuzzle(memory.reader(), 'gone', 'a'.repeat(64))).toEqual({ kind: 'not-found' })

    const replaced = await publicationFor(batsRequest({ id: 'zoo', clue: 'Bats Now' }), '2026-10-07')
    const colors = memory.records().find((r) => r.puzzleId === 'colors')!
    memory.replaceCommittedDirectly([colors, replaced])
    const outcome = await previewStoredPuzzle(memory.reader(), 'zoo', 'b'.repeat(64))
    expect(outcome).toEqual({
      kind: 'changed',
      current: {
        puzzleId: 'zoo',
        clue: 'Bats Now',
        publishDate: '2026-10-07',
        releaseInstant: '2026-10-07T02:00:00.000Z',
        contentFingerprint: replaced.contentFingerprint,
      },
    })
    expect(JSON.stringify(outcome)).not.toMatch(/"cells"|"entries"|"layout"/) // no content for a mismatch
  })

  it('reports unreadable stored content instead of showing it', async () => {
    const record = await publicationFor(catsRequest(), '2026-10-07')
    const memory = new MemoryPublicationStore({ now: NOON_OCT_6, records: [{ ...record, layout: { ...record.layout, cellPositions: {} } }] })
    expect(await previewStoredPuzzle(memory.reader(), 'cats', record.contentFingerprint)).toEqual({ kind: 'unreadable' })
  })

  it('never writes: the stored records are unchanged', async () => {
    const memory = await store()
    const before = JSON.stringify(memory.records())
    for (const record of memory.records()) await previewStoredPuzzle(memory.reader(), record.puzzleId, record.contentFingerprint)
    await previewStoredPuzzle(memory.reader(), 'zoo', 'c'.repeat(64))
    expect(JSON.stringify(memory.records())).toBe(before)
  })
})
