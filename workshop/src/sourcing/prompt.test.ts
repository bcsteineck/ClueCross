import { describe, expect, it } from 'vitest'
import { createSourcingRequest, DEFAULT_TARGET_COUNT } from './contract'
import type { CandidateSourcingRequest } from './contract'
import { buildSourcingPrompt, semanticRules } from './prompt'

function request(input: Parameters<typeof createSourcingRequest>[0]): CandidateSourcingRequest {
  const result = createSourcingRequest(input)
  if (!result.ok) throw new Error(result.error)
  return result.request
}

describe('createSourcingRequest', () => {
  it('defaults to a 60-candidate target with proper nouns and abbreviations excluded', () => {
    expect(DEFAULT_TARGET_COUNT).toBe(60)
    expect(request({ clue: ' Dogs ' })).toEqual({
      clue: 'Dogs',
      targetCount: 60,
      options: { properNouns: 'exclude', abbreviations: 'exclude' },
    })
  })

  it('requires a clue', () => {
    expect(createSourcingRequest({ clue: '   ' })).toEqual({ ok: false, error: 'Enter a clue.' })
  })

  it('keeps optional context only when supplied, and takes settings explicitly', () => {
    expect(request({ clue: 'Dogs', context: '  ' })).not.toHaveProperty('context')
    expect(request({ clue: 'Car Brands', context: ' makers only ', properNouns: 'allow', abbreviations: 'allow' })).toEqual({
      clue: 'Car Brands',
      context: 'makers only',
      targetCount: 60,
      options: { properNouns: 'allow', abbreviations: 'allow' },
    })
  })
})

describe('buildSourcingPrompt', () => {
  const dogs = request({ clue: 'Dogs' })

  it('is deterministic for the same request', () => {
    expect(buildSourcingPrompt(dogs)).toBe(buildSourcingPrompt(request({ clue: 'Dogs' })))
  })

  it('includes the clue, the target as a target (not a quota), and author context when supplied', () => {
    const prompt = buildSourcingPrompt(request({ clue: 'Dogs', context: 'Pet dogs, not wild canines' }))
    expect(prompt).toContain('Clue: Dogs')
    expect(prompt).toContain('Author context (for your understanding only): Pet dogs, not wild canines')
    expect(prompt).toMatch(/about 60 strong candidates\. This is a target, not a quota: return fewer/)
    expect(buildSourcingPrompt(dogs)).not.toContain('Author context')
  })

  it('represents the proper-noun and abbreviation settings explicitly', () => {
    expect(buildSourcingPrompt(dogs)).toContain('Proper nouns: EXCLUDED.')
    expect(buildSourcingPrompt(dogs)).toContain('Abbreviations: EXCLUDED.')
    expect(buildSourcingPrompt(dogs)).toContain('do not return "Lab" as a shortened form of "Labrador"')
    const allowed = buildSourcingPrompt(request({ clue: 'Musical Artists', properNouns: 'allow', abbreviations: 'allow' }))
    expect(allowed).toContain('Proper nouns: ALLOWED.')
    expect(allowed).toContain('Abbreviations: ALLOWED. Only propose established, recognizable shortened forms.')
  })

  it('states all eight semantic rules', () => {
    expect(semanticRules(dogs).map((rule) => rule.id)).toEqual([
      'multi-word',
      'proper-nouns',
      'abbreviations',
      'singular-plural',
      'related-variants',
      'direct-relevance',
      'obscurity',
      'category-diversity',
    ])
    const prompt = buildSourcingPrompt(dogs)
    for (const rule of semanticRules(dogs)) expect(prompt).toContain(rule.text)
    expect(prompt).toContain('Do not remove spaces or punctuation.')
    expect(prompt).toContain('Do not return both the singular and plural form of the same concept.')
    expect(prompt).toMatch(/"Pup" and "Puppy" should not both be included/)
    expect(prompt).toMatch(/Exclude loose chains of association/)
    expect(prompt).toMatch(/prefer the more recognizable one/)
    expect(prompt).toMatch(/If the clue is narrow, stay within it/)
  })

  it('sets the priority order, quality over construction convenience, and the 3-letter floor', () => {
    const prompt = buildSourcingPrompt(dogs)
    const order = ['1. Direct semantic relevance', '2. Conceptual breadth', '3. Familiar, defensible', '4. Useful variety in answer length', '5. The target candidate count']
    const positions = order.map((line) => prompt.indexOf(line))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(prompt).toContain('never invent questionable short answers')
    expect(prompt).toContain('at least 3 letters once spaces and punctuation are ignored')
  })

  it('asks only for answer, rationale and category — never construction data or scores', () => {
    const prompt = buildSourcingPrompt(dogs)
    expect(prompt).toContain('{ "candidates": [ { "answer": string, "rationale": string, "category": string } ] }')
    expect(prompt).not.toMatch(/normalized|score|valid"|duplicate"|intersection|selected|length":/i)
  })
})
