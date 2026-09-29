import { describe, expect, it } from 'vitest'
import { renderAscii } from './renderAscii'
import type { ConstructionSuccess } from '../types'

// CAT (across, (0,0)) crossing TIE (down, (2,0)) at CAT's 'T'.
function crossingFixture(): ConstructionSuccess {
  return {
    ok: true,
    placedAnswers: [
      { word: 'CAT', direction: 'across', start: { x: 0, y: 0 } },
      { word: 'TIE', direction: 'down', start: { x: 2, y: 0 } },
    ],
    cells: { r0c0: 'C', r0c1: 'A', r0c2: 'T', r1c2: 'I', r2c2: 'E' },
    positions: {
      r0c0: { x: 0, y: 0 },
      r0c1: { x: 1, y: 0 },
      r0c2: { x: 2, y: 0 },
      r1c2: { x: 2, y: 1 },
      r2c2: { x: 2, y: 2 },
    },
    width: 3,
    height: 3,
    attemptsUsed: 1,
  }
}

describe('renderAscii', () => {
  it('renders letters exactly, with a default "·" placeholder for empty cells', () => {
    const output = renderAscii(crossingFixture(), { showLetters: true })
    expect(output).toBe(['C A T', '· · I', '· · E'].join('\n'))
  })

  it('renders a block placeholder for every occupied cell when letters are hidden', () => {
    const output = renderAscii(crossingFixture(), { showLetters: false })
    expect(output).toBe(['█ █ █', '· · █', '· · █'].join('\n'))
  })

  it('preserves the actual normalized bounding dimensions (non-square)', () => {
    const construction: ConstructionSuccess = {
      ok: true,
      placedAnswers: [{ word: 'CAT', direction: 'across', start: { x: 0, y: 0 } }],
      cells: { a: 'C', b: 'A', c: 'T' },
      positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, c: { x: 2, y: 0 } },
      width: 3,
      height: 1,
      attemptsUsed: 1,
    }
    const output = renderAscii(construction, { showLetters: true })
    expect(output.split('\n')).toHaveLength(1)
    expect(output).toBe('C A T')
  })

  it('supports custom empty/block characters', () => {
    const output = renderAscii(crossingFixture(), { showLetters: false, emptyChar: '.', blockChar: '#' })
    expect(output).toBe(['# # #', '. . #', '. . #'].join('\n'))
  })

  it('is deterministic across repeated calls', () => {
    const construction = crossingFixture()
    expect(renderAscii(construction, { showLetters: true })).toBe(
      renderAscii(construction, { showLetters: true }),
    )
  })
})
