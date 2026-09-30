import { describe, expect, it } from 'vitest'
import { createSourcingRequest, DEFAULT_TARGET_COUNT } from './contract'
import type { CandidateSourcingRequest } from './contract'
import { buildSourcingPrompt, semanticRules, targetRange } from './prompt'

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
    expect(prompt).toMatch(/about 60 strong candidates\./)
    expect(prompt).toContain('This is a target, not a quota')
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

  it('sets the priority order and quality over construction convenience', () => {
    const prompt = buildSourcingPrompt(dogs)
    const order = ['1. Direct semantic relevance', '2. Conceptual breadth', '3. Familiar, defensible', '4. Useful variety in answer length', '5. The target candidate count']
    const positions = order.map((line) => prompt.indexOf(line))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(prompt).toContain('never invent questionable short answers')
  })

  it('states the 3–12 letter construction eligibility, how it is measured, and that ineligible answers are omitted, not forced', () => {
    const prompt = buildSourcingPrompt(dogs)
    expect(prompt).toContain('3 to 12 letters long once spaces, hyphens, and apostrophes are removed')
    expect(prompt).toContain('those characters do not count toward the length')
    expect(prompt).toContain('only the letters A–Z may remain')
    expect(prompt).toContain('"Border Collie" → BORDERCOLLIE (12, eligible)')
    expect(prompt).toContain('"Central Processing Unit" → CENTRALPROCESSINGUNIT (21, not eligible)')
    expect(prompt).toContain('Omit any answer that is not eligible. Do not truncate, abbreviate, invent, rewrite, or weaken an answer to make it fit.')
    // Nothing about board construction itself.
    expect(prompt).not.toMatch(/intersect|grid|placement|density|geometry|letter frequency/i)
  })

  it('forbids abbreviations as a way around the length limit only when abbreviations are excluded', () => {
    const exclude = buildSourcingPrompt(dogs)
    expect(exclude).toContain('never substitute an abbreviation for an answer that is too long: omit "Central Processing Unit" rather than returning "CPU"')
    const allow = buildSourcingPrompt(request({ clue: 'Computers', abbreviations: 'allow' }))
    expect(allow).not.toContain('never substitute an abbreviation')
    expect(allow).toContain('Abbreviations: ALLOWED. Only propose established, recognizable shortened forms.')
  })

  it('asks for natural short/medium/long variety without quotas, with relevance first', () => {
    const prompt = buildSourcingPrompt(dogs)
    expect(prompt).toContain('short (3–5 letters), medium (6–8), and longer (9–12)')
    expect(prompt).toContain('Actively look for strong short and medium answers when the clue genuinely supports them')
    expect(prompt).toContain('longer answers remain fully valid and useful')
    expect(prompt).toContain('Never manufacture short answers, use weak associations')
    expect(prompt).toContain('Semantic relevance always outranks any preferred length distribution')
    expect(prompt).not.toMatch(/\d+%|at least \d+ short|exactly \d+/)
  })

  it('aims near the target, with an acceptable range, no padding, and fewer allowed', () => {
    expect(targetRange(60)).toEqual({ low: 50, high: 70 })
    const prompt = buildSourcingPrompt(dogs)
    expect(prompt).toContain('Target: about 60 strong candidates. Roughly 50–70 is a good result when the clue supports that many')
    expect(prompt).toContain('do not go beyond 70 just to offer extra options')
    expect(prompt).toContain('return fewer, even fewer than 50')
    expect(prompt).toContain('Quality matters more than the number.')
    expect(buildSourcingPrompt(request({ clue: 'Dogs', targetCount: 45 }))).toContain('Roughly 38–53 is a good result')
  })

  it('asks only for answer, rationale and category — never construction data or scores', () => {
    const prompt = buildSourcingPrompt(dogs)
    expect(prompt).toContain('{ "candidates": [ { "answer": string, "rationale": string, "category": string } ] }')
    expect(prompt).not.toMatch(/normalized|score|valid"|duplicate"|intersection|selected|length":/i)
  })
})
