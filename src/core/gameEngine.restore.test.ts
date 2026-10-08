import { describe, expect, it } from 'vitest'
import {
  createInitialGameState,
  getLockedCellIds,
  isPuzzleComplete,
  progressFromState,
  restoreGameState,
  revealLetter,
  setCellValue,
} from './gameEngine'
import type { GameState, PuzzleProgress } from './gameEngine'
import { getLetterCost } from './letterCosts'
import type { PuzzleDefinition } from './types'

// "SEES" across and "SPA" down, sharing the first S: S appears three times,
// E twice, P and A once. Costs: S 130, E 170, P 90, A 160, Q 30.
const PUZZLE: PuzzleDefinition = {
  id: 'sees',
  clue: 'Test',
  unlockBudget: 2000,
  cells: {
    r0c0: { id: 'r0c0', correctLetter: 'S' },
    r0c1: { id: 'r0c1', correctLetter: 'E' },
    r0c2: { id: 'r0c2', correctLetter: 'E' },
    r0c3: { id: 'r0c3', correctLetter: 'S' },
    r1c0: { id: 'r1c0', correctLetter: 'P' },
    r2c0: { id: 'r2c0', correctLetter: 'A' },
    r3c0: { id: 'r3c0', correctLetter: 'S' },
  },
  entries: [
    { id: 'sees', cellIds: ['r0c0', 'r0c1', 'r0c2', 'r0c3'] },
    { id: 'spas', cellIds: ['r0c0', 'r1c0', 'r2c0', 'r3c0'] },
  ],
}

/** Save → JSON (as localStorage would hold it) → restore. */
function roundTrip(state: GameState): GameState | null {
  const saved = JSON.parse(JSON.stringify(progressFromState(state))) as PuzzleProgress
  return restoreGameState(PUZZLE, saved)
}

function expectFaithful(state: GameState) {
  const restored = roundTrip(state)
  expect(restored).not.toBeNull()
  expect(restored!.values).toEqual(state.values)
  expect(restored!.revealedLetters).toEqual(state.revealedLetters)
  expect(restored!.score).toBe(state.score)
  expect(restored!.freeRevealsRemaining).toBe(state.freeRevealsRemaining)
  expect(restored!.revealHistory).toEqual(state.revealHistory)
  expect(getLockedCellIds(restored!)).toEqual(getLockedCellIds(state))
}

const play = (...steps: ((state: GameState) => GameState)[]) =>
  steps.reduce((state, step) => step(state), createInitialGameState(PUZZLE))
const type = (cellId: string, letter: string) => (state: GameState) => setCellValue(state, cellId, letter)
const reveal = (letter: string) => (state: GameState) => revealLetter(state, letter)

describe('progressFromState', () => {
  it('keeps only non-empty values and the reveal order, oldest first', () => {
    const state = play(type('r1c0', 'P'), type('r2c0', 'X'), type('r2c0', ''), reveal('E'), reveal('Q'))
    expect(progressFromState(state)).toEqual({
      values: { r1c0: 'P', r0c1: 'E', r0c2: 'E' },
      reveals: ['E', 'Q'],
    })
  })
})

describe('restoreGameState reproduces the exact game', () => {
  it('typed letters only', () => expectFaithful(play(type('r0c1', 'E'), type('r2c0', 'Z'))))

  it.each([1, 2, 3])('after %i free reveal(s)', (count) => {
    const state = play(...['E', 'P', 'A'].slice(0, count).map(reveal))
    expect(state.freeRevealsRemaining).toBe(3 - count)
    expectFaithful(state)
  })

  it('after paid reveals: score includes the deductions', () => {
    const state = play(reveal('Q'), reveal('X'), reveal('Z'), reveal('E'), reveal('P'))
    expect(state.score).toBe(2000 - getLetterCost('E') - getLetterCost('P'))
    expect(state.revealHistory.map((entry) => entry.cost)).toEqual([90, 170, 'Free', 'Free', 'Free'])
    expectFaithful(state)
  })

  it('after a zero-cell reveal, which still counts and uses a free reveal', () => {
    const state = play(reveal('Q'))
    expect(state.revealHistory).toEqual([{ letter: 'Q', cost: 'Free', cellsRevealed: 0 }])
    expectFaithful(state)
  })

  it('the correct letter typed before revealing it', () => {
    const state = play(type('r0c0', 'S'), type('r0c3', 'S'), reveal('S'))
    expect(state.revealHistory[0].cellsRevealed).toBe(3)
    expectFaithful(state)
  })

  it('a wrong letter typed in a cell before revealing its letter', () => {
    const state = play(type('r0c1', 'X'), type('r0c2', 'Y'), reveal('E'))
    expect(state.values.r0c1).toBe('E')
    expectFaithful(state)
  })

  it('a revealed letter in several cells stays locked in all of them', () => {
    const state = play(reveal('S'), type('r1c0', 'P'))
    const restored = roundTrip(state)!
    expect(['r0c0', 'r0c3', 'r3c0'].every((cellId) => getLockedCellIds(restored)[cellId])).toBe(true)
    expect(setCellValue(restored, 'r0c0', 'Z').values.r0c0).toBe('S') // still locked
    expectFaithful(state)
  })

  it('free and paid reveals mixed with typing in between', () => {
    expectFaithful(
      play(type('r2c0', 'B'), reveal('Q'), type('r1c0', 'P'), reveal('S'), reveal('X'), type('r2c0', ''), reveal('E'), type('r2c0', 'B')), // unfinished: r2c0 holds B, not A
    )
  })

  it('every unfinished state across 300 random games (typing, clearing, revealing)', () => {
    let seed = 20261008
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31
      return seed / 2 ** 31
    }
    const cellIds = Object.keys(PUZZLE.cells)
    const letters = 'SEPAQXZ'
    let checked = 0
    for (let game = 0; game < 300; game++) {
      let state = createInitialGameState(PUZZLE)
      for (let step = 0; step < 14 && !isPuzzleComplete(state); step++) {
        const roll = random()
        if (roll < 0.35) state = revealLetter(state, letters[Math.floor(random() * letters.length)])
        else if (roll < 0.45) state = setCellValue(state, cellIds[Math.floor(random() * cellIds.length)], '')
        else state = setCellValue(state, cellIds[Math.floor(random() * cellIds.length)], letters[Math.floor(random() * letters.length)])
        if (!isPuzzleComplete(state)) {
          expectFaithful(state)
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
  })
})

describe('restoreGameState rejects anything it cannot reproduce faithfully', () => {
  const base: PuzzleProgress = { values: { r1c0: 'P' }, reveals: ['E'] }

  it.each<[string, PuzzleProgress]>([
    ['an unknown cell', { ...base, values: { nope: 'A' } }],
    ['a lowercase or multi-letter value', { ...base, values: { r1c0: 'p' } }],
    ['an empty-string value', { ...base, values: { r1c0: '' } }],
    ['a non-letter value', { ...base, values: { r1c0: '7' } }],
    ['a repeated reveal', { ...base, reveals: ['E', 'E'] }],
    ['an invalid reveal', { ...base, reveals: ['é'] }],
    ['more than 26 reveals', { ...base, reveals: Array.from({ length: 27 }, (_, i) => String.fromCharCode(65 + (i % 26))) }],
    ['a value that contradicts a reveal (wrong letter in a revealed cell)', { values: { r0c1: 'X' }, reveals: ['E'] }],
    ['a reveal whose cells are missing from the values', { values: {}, reveals: ['E'] }],
  ])('%s', (_label, progress) => {
    expect(restoreGameState(PUZZLE, progress)).toBeNull()
  })

  it('a board that would already be complete', () => {
    const values = Object.fromEntries(Object.values(PUZZLE.cells).map((cell) => [cell.id, cell.correctLetter]))
    expect(restoreGameState(PUZZLE, { values, reveals: [] })).toBeNull()
  })

  it('accepts the untouched empty progress as a fresh game', () => {
    expect(restoreGameState(PUZZLE, { values: {}, reveals: [] })).toEqual(createInitialGameState(PUZZLE))
  })
})
