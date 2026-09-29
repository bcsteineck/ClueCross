// Deterministic sourcing instructions: the same request always produces the
// same text. Encodes the eight locked semantic rules and the priority order;
// never asks for construction data (normalized forms, lengths, validity,
// scores, board layout), which belongs to deterministic code or the author.

import type { CandidateSourcingRequest } from './contract'

export type SemanticRuleId =
  | 'multi-word'
  | 'proper-nouns'
  | 'abbreviations'
  | 'singular-plural'
  | 'related-variants'
  | 'direct-relevance'
  | 'obscurity'
  | 'category-diversity'

export function semanticRules(request: CandidateSourcingRequest): { id: SemanticRuleId; text: string }[] {
  const { properNouns, abbreviations } = request.options
  return [
    {
      id: 'multi-word',
      text:
        'Multi-word answers are allowed. Write every answer in its normal human-readable form, with its ' +
        'usual spaces and punctuation (for example "Great Dane" or "Dog Park"). Do not remove spaces or ' +
        'punctuation.',
    },
    {
      id: 'proper-nouns',
      text:
        properNouns === 'exclude'
          ? 'Proper nouns: EXCLUDED. Do not include people, characters, brands, organizations, named ' +
            'places, titled works, or any other proper nouns.'
          : 'Proper nouns: ALLOWED. Proper nouns may be included when they are directly relevant to the clue.',
    },
    {
      id: 'abbreviations',
      text:
        abbreviations === 'exclude'
          ? 'Abbreviations: EXCLUDED. Do not use abbreviations, acronyms, initialisms, clipped names, or ' +
            'shortened forms in place of complete answers (for example, do not return "Lab" as a shortened ' +
            'form of "Labrador").'
          : 'Abbreviations: ALLOWED. Only propose established, recognizable shortened forms.',
    },
    {
      id: 'singular-plural',
      text:
        'Do not return both the singular and plural form of the same concept. Use whichever form is most ' +
        'natural for the clue; plural answers are fine on their own.',
    },
    {
      id: 'related-variants',
      text:
        'Genuinely distinct related terms may both appear, but do not pad the list with synonyms, ' +
        'morphological variants, or alternate forms that add no new concept (for example, "Dog" and ' +
        '"Puppy" can both belong; "Pup" and "Puppy" should not both be included just to add answers).',
    },
    {
      id: 'direct-relevance',
      text:
        'Every answer must have a direct, readily explainable relationship to the clue. Exclude loose ' +
        'chains of association (for "Dogs", "Leash" is direct; "Grass" is not, because it only connects ' +
        'through dogs → parks → grass). The rationale must explain the relationship directly from the clue.',
    },
    {
      id: 'obscurity',
      text:
        'Less-common answers are allowed when they are legitimate and directly related, but when two ' +
        'answers are otherwise equally useful, prefer the more recognizable one. Never add obscure ' +
        'terminology just to reach the target count.',
    },
    {
      id: 'category-diversity',
      text:
        'If the clue is broad, deliberately explore several directly related subcategories, without quotas ' +
        '(for "Dogs": breeds, anatomy, behavior, training, care, equipment). If the clue is narrow, stay ' +
        'within it (for "Dog Breeds": breeds only). Do not artificially broaden a narrow clue.',
    },
  ]
}

// The acceptable spread around the target (50–70 for the default 60). This
// is guidance for the model only: responses outside it are still processed.
export function targetRange(targetCount: number): { low: number; high: number } {
  return { low: Math.round((targetCount * 5) / 6), high: Math.round((targetCount * 7) / 6) }
}

export function buildSourcingPrompt(request: CandidateSourcingRequest): string {
  const { low, high } = targetRange(request.targetCount)
  const lines: string[] = [
    'You are researching candidate answers for a ClueCross word puzzle. You propose candidates only; you do not build the puzzle.',
    '',
    `Clue: ${request.clue}`,
  ]
  if (request.context) lines.push(`Author context (for your understanding only): ${request.context}`)

  lines.push(
    '',
    `Target: about ${request.targetCount} strong candidates. Roughly ${low}–${high} is a good result when the clue supports that many; ` +
      `do not go beyond ${high} just to offer extra options. This is a target, not a quota: return fewer, even fewer than ${low}, ` +
      'if reaching it would require weak, repetitive, loosely related, or obscure-for-the-sake-of-count answers. Quality matters more than the number.',
    '',
    'Priorities, in order:',
    '1. Direct semantic relevance to the clue.',
    '2. Conceptual breadth appropriate to the clue.',
    '3. Familiar, defensible terminology.',
    '4. Useful variety in answer length, when it arises naturally.',
    '5. The target candidate count.',
    'Semantic quality outranks construction convenience: never invent questionable short answers because short answers are easier to place.',
    '',
    'Rules:',
    ...semanticRules(request).map((rule, index) => `${index + 1}. ${rule.text}`),
    '',
    'Construction eligibility (a physical requirement; check it before proposing an answer):',
    '- Every answer must be 3 to 12 letters long once spaces, hyphens, and apostrophes are removed; those characters do not count toward the length.',
    '- After removing them, only the letters A–Z may remain.',
    '- Examples: "Great Dane" → GREATDANE (9 letters, eligible); "Border Collie" → BORDERCOLLIE (12, eligible); ' +
      '"Central Processing Unit" → CENTRALPROCESSINGUNIT (21, not eligible).',
    '- Omit any answer that is not eligible. Do not truncate, abbreviate, invent, rewrite, or weaken an answer to make it fit.',
  )
  if (request.options.abbreviations === 'exclude') {
    lines.push(
      '- Because abbreviations are excluded, never substitute an abbreviation for an answer that is too long: omit "Central Processing Unit" rather than returning "CPU".',
    )
  }
  lines.push(
    '',
    'Length variety: seek a healthy, natural mix of short (3–5 letters), medium (6–8), and longer (9–12) eligible answers. ' +
      'Actively look for strong short and medium answers when the clue genuinely supports them; longer answers remain fully valid and useful. ' +
      'Never manufacture short answers, use weak associations, or use shortened forms the rules above exclude just to change the mix. ' +
      'Semantic relevance always outranks any preferred length distribution.',
    '',
    'Respond with JSON only, in exactly this shape:',
    '{ "candidates": [ { "answer": string, "rationale": string, "category": string } ] }',
    '- answer: the human-readable answer.',
    '- rationale: one concise sentence explaining its direct relationship to the clue.',
    '- category: a short descriptive label for organizing the list.',
  )
  return lines.join('\n')
}
