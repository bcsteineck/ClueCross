import { describe, expect, it } from 'vitest'
import { createCompletedGameState, createInitialGameState, isPuzzleComplete, revealLetter } from './gameEngine'
import { formatRevealCount, formatShareDate, formatShareResult, SHARE_URL } from './shareResult'
import type { PuzzleDefinition } from './types'

const base = { publishDate: '2026-10-06', score: 1740, maxScore: 2000, revealCount: 5 }

describe('formatShareResult', () => {
  it('produces the exact four-line result', () => {
    expect(formatShareResult(base)).toBe('ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,740 / 2,000\n5 reveals\ncluecross.com')
  })

  it('always ends with the bare branded URL', () => {
    const lines = formatShareResult(base).split('\n')
    expect(lines).toHaveLength(4)
    expect(lines.at(-1)).toBe('cluecross.com')
    expect(SHARE_URL).toBe('cluecross.com')
    expect(lines.at(-1)).not.toMatch(/https?:|\?|\//) // no scheme, path, or query
  })

  it.each([
    ['2026-10-06', 'Oct 6, 2026'],
    ['2026-10-05', 'Oct 5, 2026'], // an archived puzzle: its own date, not today's
    ['2026-09-30', 'Sep 30, 2026'],
    ['2026-10-01', 'Oct 1, 2026'], // month boundary
    ['2025-12-31', 'Dec 31, 2025'], // year boundary
    ['2026-01-01', 'Jan 1, 2026'],
  ])('formats publish date %s as %s with no timezone shift', (publishDate, expected) => {
    expect(formatShareDate(publishDate)).toBe(expected)
    expect(formatShareResult({ ...base, publishDate }).split('\n')[0]).toBe(`ClueCross — ${expected}`)
  })

  it.each([
    [2000, '⭐⭐⭐ 2,000 / 2,000'],
    [1200, '⭐⭐⭐ 1,200 / 2,000'], // Gold threshold
    [1199, '⭐⭐☆ 1,199 / 2,000'], // Silver
    [600, '⭐⭐☆ 600 / 2,000'],
    [599, '⭐☆☆ 599 / 2,000'], // Bronze
    [0, '⭐☆☆ 0 / 2,000'],
    [-1, '☆☆☆ -1 / 2,000'], // Bust
    [-120, '☆☆☆ -120 / 2,000'], // negative scores are shared as earned
    [-1450, '☆☆☆ -1,450 / 2,000'],
  ])('score %i reads "%s" using the game\'s star rating', (score, expected) => {
    expect(formatShareResult({ ...base, score }).split('\n')[1]).toBe(expected)
  })

  it.each([
    [0, '0 reveals'],
    [1, '1 reveal'],
    [2, '2 reveals'],
    [5, '5 reveals'],
    [14, '14 reveals'],
    [26, '26 reveals'],
  ])('%i reveal actions read "%s"', (revealCount, expected) => {
    expect(formatRevealCount(revealCount)).toBe(expected)
    expect(formatShareResult({ ...base, revealCount }).split('\n')[2]).toBe(expected)
  })

  it('leaves the reveal line out rather than inventing a count when it is unknown', () => {
    expect(formatShareResult({ ...base, revealCount: null })).toBe('ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,740 / 2,000\ncluecross.com')
  })
})

// CAT across crossing TIE down. Letter costs: C 110, A 160, T 140, I 150, E 170.
const CATS: PuzzleDefinition = {
  id: 'cats',
  clue: 'Cats',
  unlockBudget: 2000,
  cells: {
    r0c0: { id: 'r0c0', correctLetter: 'C' },
    r0c1: { id: 'r0c1', correctLetter: 'A' },
    r0c2: { id: 'r0c2', correctLetter: 'T' },
    r1c2: { id: 'r1c2', correctLetter: 'I' },
    r2c2: { id: 'r2c2', correctLetter: 'E' },
  },
  entries: [
    { id: 'cat', cellIds: ['r0c0', 'r0c1', 'r0c2'] },
    { id: 'tie', cellIds: ['r0c2', 'r1c2', 'r2c2'] },
  ],
}

const shareOf = (state: ReturnType<typeof createInitialGameState>, publishDate = '2026-10-06') =>
  formatShareResult({ publishDate, score: state.score, maxScore: state.puzzle.unlockBudget, revealCount: state.revealHistory.length })

describe('reveal count from the game (revealHistory.length)', () => {
  it('counts free and paid reveals: 3 free + 2 paid = 5, including the reveal that completes the puzzle', () => {
    let state = createInitialGameState(CATS)
    for (const letter of ['C', 'A', 'T', 'I', 'E']) state = revealLetter(state, letter)
    expect(isPuzzleComplete(state)).toBe(true)
    expect(state.revealHistory.map((entry) => entry.cost)).toEqual([170, 150, 'Free', 'Free', 'Free'])
    expect(state.revealHistory).toHaveLength(5)
    expect(shareOf(state)).toBe('ClueCross — Oct 6, 2026\n⭐⭐⭐ 1,680 / 2,000\n5 reveals\ncluecross.com')
  })

  it('counts a reveal of a letter absent from the puzzle (zero cells)', () => {
    const state = revealLetter(createInitialGameState(CATS), 'Q')
    expect(state.revealHistory).toEqual([{ letter: 'Q', cost: 'Free', cellsRevealed: 0 }])
    expect(state.revealHistory).toHaveLength(1)
  })

  it('does not count re-revealing a letter that is already revealed', () => {
    let state = revealLetter(createInitialGameState(CATS), 'C')
    state = revealLetter(state, 'C')
    state = revealLetter(state, 'c')
    expect(state.revealHistory).toHaveLength(1)
  })

  it('a restored completed result keeps the same count, score, and text', () => {
    let state = createInitialGameState(CATS)
    // Q, C, A free; T 140 + I 150 + E 170 = 460 paid.
    for (const letter of ['Q', 'C', 'A', 'T', 'I', 'E']) state = revealLetter(state, letter)
    const restored = createCompletedGameState(CATS, { score: state.score, revealHistory: state.revealHistory })
    expect(restored.revealHistory).toHaveLength(6)
    expect(shareOf(restored, '2026-10-05')).toBe(shareOf(state, '2026-10-05'))
    expect(shareOf(restored, '2026-10-05')).toBe('ClueCross — Oct 5, 2026\n⭐⭐⭐ 1,540 / 2,000\n6 reveals\ncluecross.com')
  })

  it('never includes the clue, answers, or revealed letters', () => {
    let state = createInitialGameState(CATS)
    for (const letter of ['C', 'A', 'T', 'I', 'E']) state = revealLetter(state, letter)
    const text = shareOf(state)
    expect(text).not.toMatch(/Cats|CAT|TIE/)
    // Only the brand name contains capital letters; no answer letter stands alone.
    expect(text.replace(/ClueCross|Oct/g, '')).not.toMatch(/[A-Z]/)
  })
})
