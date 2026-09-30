import { describe, expect, it } from 'vitest'
import { buildReviewCandidates } from './reviewPool'
import { lexicalWords, PLURAL_S_EXCEPTIONS, singularCandidates } from './variants'

// Flagged relationships among a pool of answers, as [answer, related answer, flag type].
function relations(answers: string[]): [string, string, string][] {
  const candidates = buildReviewCandidates(answers.map((answer) => ({ answer, rationale: 'r', category: 'c' })))
  const answerById = new Map(candidates.map((c) => [c.id, c.sourceAnswer]))
  return candidates.flatMap((candidate) =>
    candidate.flags.flatMap((flag) =>
      'relatedCandidateIds' in flag
        ? flag.relatedCandidateIds.map((id): [string, string, string] => [candidate.sourceAnswer, answerById.get(id)!, flag.type])
        : [],
    ),
  )
}

const flagged = (a: string, b: string, type: string) => {
  const found = relations([a, b])
  expect(found).toContainEqual([a, b, type])
  expect(found).toContainEqual([b, a, type])
}
const notFlagged = (...answers: string[]) => expect(relations(answers)).toEqual([])

describe('lexicalWords', () => {
  it('keeps word boundaries from the human-readable answer', () => {
    expect(lexicalWords('Dog Parks')).toEqual(['DOG', 'PARKS'])
    expect(lexicalWords('great-dane')).toEqual(['GREAT', 'DANE'])
    expect(lexicalWords('Dog’s  Bed')).toEqual(['DOGS', 'BED'])
  })
})

describe('singular/plural conflicts', () => {
  it('flags the supported single-word plural forms', () => {
    flagged('DOG', 'DOGS', 'singular-plural-conflict')
    flagged('BREED', 'BREEDS', 'singular-plural-conflict')
    flagged('PUPPY', 'PUPPIES', 'singular-plural-conflict')
    flagged('BOX', 'BOXES', 'singular-plural-conflict')
    flagged('CHURCH', 'CHURCHES', 'singular-plural-conflict')
    flagged('WISH', 'WISHES', 'singular-plural-conflict')
    flagged('BUS', 'BUSES', 'singular-plural-conflict')
  })

  it('flags multi-word plurals when the preceding words match exactly', () => {
    flagged('Dog Park', 'Dog Parks', 'singular-plural-conflict')
    flagged('Great Dane', 'Great Danes', 'singular-plural-conflict')
    flagged('City Bus', 'City Buses', 'singular-plural-conflict')
  })

  it('does not flag when preceding words differ', () => {
    notFlagged('Dog Park', 'City Parks')
  })

  it('never applies plural rules to the explicit exceptions', () => {
    expect([...PLURAL_S_EXCEPTIONS]).toEqual(['NEWS', 'SERIES', 'SPECIES'])
    notFlagged('NEWS', 'NEW')
    notFlagged('SERIES', 'SERIE', 'SERY')
    notFlagged('SPECIES', 'SPECIE', 'SPECY')
    for (const word of PLURAL_S_EXCEPTIONS) expect(singularCandidates(word)).toEqual([])
  })

  it('never applies the final-S rule to words ending in SS, US or IS', () => {
    notFlagged('GLASS', 'GLAS')
    notFlagged('BUS', 'BU')
    notFlagged('STATUS', 'STATU')
    notFlagged('ANALYSIS', 'ANALYSI')
    notFlagged('CRISIS', 'CRISI')
  })
})

describe('morphological variants', () => {
  it('flags exact -ING and -ED suffix removal', () => {
    flagged('WALK', 'WALKING', 'possible-morphological-variant')
    flagged('TRAIN', 'TRAINING', 'possible-morphological-variant')
    flagged('WALK', 'WALKED', 'possible-morphological-variant')
    flagged('TRAIN', 'TRAINED', 'possible-morphological-variant')
  })

  it('applies only to single-word answers', () => {
    notFlagged('Dog Walk', 'Dog Walking')
  })
})

describe('intentionally unsupported relationships produce no deterministic flag', () => {
  it.each([
    ['RUN', 'RUNNING'],
    ['MAKE', 'MAKING'],
    ['STOP', 'STOPPED'],
    ['TRAIN', 'TRAINER'],
    ['BIKE', 'BICYCLE'],
    ['PUP', 'PUPPY'],
    ['CAR', 'CARD'],
    ['DOG', 'DOGMA'],
  ])('%s / %s', (a, b) => notFlagged(a, b))
})
