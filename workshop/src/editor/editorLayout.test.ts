import { describe, expect, it } from 'vitest'
import type { Direction } from '../../../tools/generator/src/types.js'
import {
  addManualWord,
  addWord,
  checkPlacement,
  layoutIssues,
  moveWord,
  nextWordId,
  numberWords,
  orderedWords,
  removeWord,
  replaceWord,
  selectAt,
  suggestedStarts,
  suggestionCount,
  toConstruction,
  unusedWords,
  wordCells,
  wordsFromConstruction,
} from './editorLayout'
import type { EditorLayout, EditorWord } from './editorLayout'

const w = (id: string, word: string, direction: Direction, x: number, y: number): EditorWord => ({
  id,
  word,
  direction,
  start: { x, y },
})

// CAT across from (0,0); TIE down through CAT's T at (2,0).
const CAT = w('w1', 'CAT', 'across', 0, 0)
const TIE = w('w2', 'TIE', 'down', 2, 0)

function layout(words: EditorWord[], extra: string[] = []): EditorLayout {
  const pool = [...words.map((word) => word.word), ...extra].map((word) => ({ word, source: 'pool' as const }))
  return { words, pool }
}

const at = (word: string, direction: Direction, x: number, y: number) => ({ word, direction, start: { x, y } })

describe('placement validation', () => {
  it('accepts a valid intersection and reports how many words it crosses', () => {
    expect(checkPlacement([CAT], at('TIE', 'down', 2, 0))).toEqual({ ok: true, crossings: 1 })
    // TAG down crosses both CAT (T) and DOG (G).
    const DOG = w('w3', 'DOG', 'across', 0, 2)
    expect(checkPlacement([CAT, DOG], at('TAG', 'down', 2, 0))).toEqual({ ok: true, crossings: 2 })
  })

  it('refuses conflicting letters', () => {
    const result = checkPlacement([CAT], at('DOG', 'down', 2, 0))
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/would put D where T already is \(row 1, column 3\)/) })
  })

  it('refuses side-by-side contact (invalid adjacency)', () => {
    const result = checkPlacement([CAT], at('DOG', 'across', 0, 1))
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/touch another word side by side/) })
  })

  it('refuses a placement that matches a letter but breaks another rule', () => {
    // ARE crosses CAT at its A, but its R would sit beside TIE's I.
    const result = checkPlacement([CAT, TIE], at('ARE', 'down', 1, 0))
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/ARE would touch another word side by side at row 2, column 2/) })
    // TOP across would start right after CAT's T, extending CAT's run.
    expect(checkPlacement([CAT], at('TOP', 'across', 3, 0))).toEqual({ ok: false, reason: expect.stringMatching(/run straight into/) })
    // OAK down from just under CAT's C would make one run C-O-A-K.
    expect(checkPlacement([CAT], at('OAK', 'down', 0, 1))).toEqual({ ok: false, reason: expect.stringMatching(/run straight into/) })
  })

  it('refuses same-direction overlap', () => {
    // ATE across from CAT's A shares A and T in the same direction.
    const result = checkPlacement([CAT], at('ATE', 'across', 1, 0))
    expect(result).toEqual({ ok: false, reason: 'ATE would overlap CAT in the same direction.' })
  })

  it('refuses out-of-bounds placements', () => {
    expect(checkPlacement([], at('CAT', 'across', 10, 0))).toEqual({
      ok: false,
      reason: 'CAT doesn’t fit inside the 12 × 12 board there.',
    })
    expect(checkPlacement([], at('CAT', 'down', 0, -1)).ok).toBe(false)
    expect(checkPlacement([], at('CAT', 'down', 0, 9))).toEqual({ ok: true, crossings: 0 })
  })

  it('refuses a duplicate answer (case-insensitively), but not the word being moved', () => {
    expect(checkPlacement([CAT], at('CAT', 'across', 0, 5))).toEqual({
      ok: false,
      reason: 'CAT is already on the board. Each answer can appear only once.',
    })
    expect(checkPlacement([w('w1', 'cat', 'across', 0, 0)], at('CAT', 'across', 0, 5)).ok).toBe(false)
    expect(checkPlacement([CAT], at('CAT', 'across', 0, 5), 'w1')).toEqual({ ok: true, crossings: 0 })
  })

  it('allows a structurally valid disconnected placement by hand', () => {
    expect(checkPlacement([CAT, TIE], at('DOG', 'across', 6, 8))).toEqual({ ok: true, crossings: 0 })
  })
})

describe('placement suggestions', () => {
  it('suggests only connected placements once the board has words', () => {
    // DOG shares no letter with CAT, so nothing connected is suggested — though it fits by hand.
    expect(suggestedStarts([CAT], 'DOG', 'across')).toEqual([])
    expect(suggestedStarts([CAT], 'DOG', 'down')).toEqual([])
    expect(suggestionCount([CAT], 'DOG')).toBe(0)
    expect(checkPlacement([CAT], at('DOG', 'down', 8, 4)).ok).toBe(true)
  })

  it('counts real valid placements in each orientation, not just matching letters', () => {
    const board = [w('w1', 'CAT', 'across', 4, 4)]
    // TIE's T matches CAT's T: Across would overlap CAT, so only Down is valid.
    expect(suggestedStarts(board, 'TIE', 'across')).toEqual([])
    expect(suggestedStarts(board, 'TIE', 'down')).toEqual([{ x: 6, y: 4 }])
    expect(suggestionCount(board, 'TIE')).toBe(1)
    // Every suggestion crosses, and is valid.
    for (const start of suggestedStarts([CAT, TIE], 'TAG', 'down')) {
      const check = checkPlacement([CAT, TIE], { word: 'TAG', direction: 'down', start })
      expect(check.ok && check.crossings).toBeGreaterThan(0)
    }
  })

  it('places the first word anywhere it fits on an empty board', () => {
    expect(suggestedStarts([], 'CAT', 'across')).toHaveLength(10 * 12)
    expect(suggestedStarts([], 'CAT', 'down')).toHaveLength(12 * 10)
    // Moving the only word: the board without it is empty.
    expect(suggestedStarts([CAT], 'CAT', 'down', 'w1')).toHaveLength(120)
  })
})

describe('numbering and selection', () => {
  it('numbers start cells row by row, sharing a number where Across and Down start together', () => {
    const COT = w('w3', 'COT', 'down', 0, 0)
    const numbers = numberWords([TIE, CAT, COT])
    expect(numbers.get('w1')).toBe(1)
    expect(numbers.get('w3')).toBe(1)
    expect(numbers.get('w2')).toBe(2)
    expect(orderedWords([TIE, COT, CAT]).map((word) => word.word)).toEqual(['CAT', 'COT', 'TIE'])
  })

  it('toggles between the Across and Down word at an intersection, deterministically', () => {
    const words = [CAT, TIE]
    expect(selectAt(words, 2, 0, null)).toBe('w1')
    expect(selectAt(words, 2, 0, 'w1')).toBe('w2')
    expect(selectAt(words, 2, 0, 'w2')).toBe('w1')
    // A cell with one word selects it; clicking it again keeps it.
    expect(selectAt(words, 0, 0, 'w2')).toBe('w1')
    expect(selectAt(words, 0, 0, 'w1')).toBe('w1')
    expect(selectAt(words, 2, 2, null)).toBe('w2')
    expect(selectAt(words, 7, 7, 'w1')).toBeNull()
  })
})

describe('editing operations', () => {
  it('adds a word, putting a new answer in the pool', () => {
    const result = addWord(layout([CAT]), at('TIE', 'down', 2, 0), 'w2')
    if (!result.ok) throw new Error(result.reason)
    expect(result.layout.words).toEqual([CAT, TIE])
    expect(result.layout.pool.map((entry) => entry.word)).toEqual(['CAT', 'TIE'])
  })

  it('moves a word atomically, changing its orientation, with its old cells not counted', () => {
    const start = layout([CAT])
    const turned = moveWord(start, 'w1', 'down', { x: 5, y: 5 })
    expect(turned).toEqual({ ok: true, layout: { ...start, words: [w('w1', 'CAT', 'down', 5, 5)] } })
    // One cell over: it would overlap itself if its own cells counted.
    expect(moveWord(start, 'w1', 'across', { x: 1, y: 0 }).ok).toBe(true)
    // A refused move leaves the original layout as it was (it's never mutated).
    const board = layout([CAT, TIE])
    const refused = moveWord(board, 'w2', 'across', { x: 0, y: 1 })
    expect(refused.ok).toBe(false)
    expect(board.words).toEqual([CAT, TIE])
  })

  it('moving keeps the word’s id; renumbering follows its new place', () => {
    const DOG = w('w3', 'DOG', 'down', 8, 0)
    const result = moveWord(layout([CAT, TIE, DOG]), 'w3', 'down', { x: 8, y: 6 })
    if (!result.ok) throw new Error(result.reason)
    expect(result.layout.words.map((word) => word.id)).toEqual(['w1', 'w2', 'w3'])
    const before = numberWords([CAT, TIE, DOG])
    const after = numberWords(result.layout.words)
    expect(before.get('w3')).toBe(3)
    expect(after.get('w3')).toBe(3)
    const moveCat = moveWord(layout([CAT, DOG]), 'w1', 'across', { x: 0, y: 9 })
    if (!moveCat.ok) throw new Error(moveCat.reason)
    expect(numberWords(moveCat.layout.words).get('w3')).toBe(1)
    expect(numberWords(moveCat.layout.words).get('w1')).toBe(2)
  })

  it('replaces a word in place with a different length, returning the old answer to the unused words', () => {
    const board = layout([CAT, TIE], ['CUTE', 'COAT'])
    const result = replaceWord(board, 'w1', 'CUTE', 'w3')
    if (!result.ok) throw new Error(result.reason)
    expect(result.layout.words).toEqual([w('w3', 'CUTE', 'across', 0, 0), TIE])
    expect(unusedWords(result.layout).map((entry) => entry.word)).toEqual(['CAT', 'COAT'])
    // A replacement that doesn't fit changes nothing.
    const refused = replaceWord(board, 'w1', 'COAT', 'w3')
    expect(refused).toEqual({ ok: false, reason: expect.stringMatching(/would put A where T already is.*Try Move Word/) })
  })

  it('removes a word, keeping letters other words still use', () => {
    const result = removeWord(layout([CAT, TIE]), 'w1')
    if (!result.ok) throw new Error(result.reason)
    expect(result.layout.words).toEqual([TIE])
    expect(wordCells(TIE)[0]).toEqual({ x: 2, y: 0, letter: 'T' })
    expect(unusedWords(result.layout).map((entry) => entry.word)).toEqual(['CAT'])
    // Everything can be removed.
    const empty = removeWord(result.layout, 'w2')
    expect(empty.ok && empty.layout.words).toEqual([])
  })

  it('adds a typed answer to the pool in construction form, refusing invalid and duplicate ones', () => {
    const result = addManualWord(layout([CAT]), ' Great Dane ')
    expect(result).toMatchObject({ ok: true, word: 'GREATDANE' })
    if (!result.ok) throw new Error(result.reason)
    expect(result.layout.pool.at(-1)).toEqual({ word: 'GREATDANE', source: 'manual' })
    expect(addManualWord(layout([CAT]), 'ab')).toEqual({ ok: false, reason: expect.stringMatching(/too short/) })
    expect(addManualWord(layout([CAT]), 'cat')).toEqual({ ok: false, reason: 'CAT is already in this candidate’s word pool.' })
  })

  it('never reuses a word id within a version', () => {
    expect(nextWordId([CAT, TIE])).toBe('w3')
    expect(nextWordId([TIE], [CAT, w('w7', 'DOG', 'across', 0, 5)])).toBe('w8')
    expect(nextWordId([])).toBe('w1')
  })
})

describe('validation summary', () => {
  it('blocks an empty board, a single word, and words that don’t cross', () => {
    expect(layoutIssues([]).blocking).toEqual(['The board is empty. Place at least two crossing words.'])
    expect(layoutIssues([CAT]).blocking).toEqual(['Only one word is placed. A crossword needs at least two crossing words.'])
    const apart = layoutIssues([CAT, w('w2', 'DOG', 'across', 0, 4)]).blocking
    expect(apart).toEqual([
      'No words cross. A crossword needs at least one intersection.',
      expect.stringMatching(/^The words form 2 separate groups/),
    ])
  })

  it('blocks disconnected groups even when each group crosses', () => {
    const DOG = w('w3', 'DOG', 'across', 6, 8)
    const GUM = w('w4', 'GUM', 'down', 8, 8)
    expect(layoutIssues([CAT, TIE, DOG, GUM]).blocking).toEqual([
      'The words form 2 separate groups. Connect them into one crossword (for example, CAT, TIE).',
    ])
  })

  it('passes one connected crossword, with answer-count and Priority Word warnings that never block', () => {
    const issues = layoutIssues([CAT, TIE], ['TIE', 'POODLE'])
    expect(issues.blocking).toEqual([])
    expect(issues.advisory).toEqual(['2 answers; generated puzzles have 10–16.', 'Missing Priority Word: POODLE.'])
  })

  it('reports legacy geometry and duplicates read from a file', () => {
    const stacked = [CAT, w('w2', 'CAR', 'across', 0, 1)]
    expect(layoutIssues(stacked).blocking).toContain(
      'Some words touch or overlap in a way the crossword rules don’t allow, forming letter runs that aren’t answers.',
    )
    expect(layoutIssues([CAT, w('w2', 'CAT', 'across', 0, 4)]).blocking[0]).toBe('CAT appears more than once.')
    expect(layoutIssues([w('w1', 'CAT', 'across', 11, 0)]).blocking[0]).toBe('CAT runs outside the 12 × 12 board.')
  })
})

describe('constructions', () => {
  it('translates the words so the top-left cell is 0,0, and back onto the board centered', () => {
    const construction = toConstruction([w('w1', 'CAT', 'across', 4, 5), w('w2', 'TIE', 'down', 6, 5)])!
    expect(construction.placedAnswers).toEqual([
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ])
    expect([construction.width, construction.height]).toEqual([3, 3])
    expect(Object.keys(construction.cells)).toHaveLength(5)
    expect(toConstruction([])).toBeNull()
    expect(wordsFromConstruction(construction)).toEqual([w('w1', 'CAT', 'across', 4, 4), w('w2', 'TIE', 'down', 6, 4)])
  })
})
