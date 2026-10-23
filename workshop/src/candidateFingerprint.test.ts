import { describe, expect, it } from 'vitest'
import type { ConstructionSuccess, PlacedAnswer } from '../../tools/generator/src/types.js'
import { dogsBatch } from '../server/draft/testDrafts'
import { candidateFingerprint, constructionFingerprint } from './candidateFingerprint'

// A construction from its answers alone, offset anywhere on the plane.
function construction(answers: PlacedAnswer[]): ConstructionSuccess {
  const cells: Record<string, string> = {}
  const positions: Record<string, { x: number; y: number }> = {}
  for (const answer of answers) {
    ;[...answer.word].forEach((letter, i) => {
      const x = answer.direction === 'across' ? answer.start.x + i : answer.start.x
      const y = answer.direction === 'across' ? answer.start.y : answer.start.y + i
      cells[`${x},${y}`] = letter
      positions[`${x},${y}`] = { x, y }
    })
  }
  const xs = Object.values(positions).map((p) => p.x)
  const ys = Object.values(positions).map((p) => p.y)
  return {
    ok: true,
    placedAnswers: answers,
    cells,
    positions,
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  } as ConstructionSuccess
}

const BEAGLE_POODLE: PlacedAnswer[] = [
  { word: 'BEAGLE', direction: 'across', start: { x: 0, y: 2 } },
  { word: 'POODLE', direction: 'down', start: { x: 5, y: -3 } },
]

describe('candidate fingerprint', () => {
  it('is the same for the same layout wherever it sits, and whatever the answer order', () => {
    const shifted = BEAGLE_POODLE.map((answer) => ({ ...answer, start: { x: answer.start.x + 4, y: answer.start.y + 7 } }))
    expect(constructionFingerprint(construction(shifted))).toBe(constructionFingerprint(construction(BEAGLE_POODLE)))
    expect(constructionFingerprint(construction([...BEAGLE_POODLE].reverse()))).toBe(
      constructionFingerprint(construction(BEAGLE_POODLE)),
    )
  })

  it('distinguishes the same answers placed differently', () => {
    // POODLE now crosses BEAGLE's first E rather than its last.
    const crossingElsewhere: PlacedAnswer[] = [
      { word: 'BEAGLE', direction: 'across', start: { x: 0, y: 5 } },
      { word: 'POODLE', direction: 'down', start: { x: 1, y: 0 } },
    ]
    // Same shape turned a quarter: Across and Down swap, so it's a different puzzle.
    const turned: PlacedAnswer[] = [
      { word: 'BEAGLE', direction: 'down', start: { x: 2, y: 0 } },
      { word: 'POODLE', direction: 'across', start: { x: -3, y: 5 } },
    ]
    const base = constructionFingerprint(construction(BEAGLE_POODLE))
    expect(constructionFingerprint(construction(crossingElsewhere))).not.toBe(base)
    expect(constructionFingerprint(construction(turned))).not.toBe(base)
  })

  it('records the size, every answer, its direction, and its start', () => {
    expect(constructionFingerprint(construction(BEAGLE_POODLE))).toBe('v1;6x6;A0,5:BEAGLE|D5,0:POODLE')
  })

  it('matches a candidate from another batch or a restored draft, whatever its clue or seed', () => {
    const candidate = dogsBatch().candidates[0]
    const restored = JSON.parse(JSON.stringify({ ...candidate, identitySignature: 'other', representativeSeed: 'x' }))
    expect(candidateFingerprint(restored)).toBe(candidateFingerprint(candidate))
    // Distinct candidates in one batch never share a fingerprint.
    const all = dogsBatch().candidates.map(candidateFingerprint)
    expect(new Set(all).size).toBe(all.length)
  })
})
