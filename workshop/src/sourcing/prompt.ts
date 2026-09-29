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

export function buildSourcingPrompt(request: CandidateSourcingRequest): string {
  const lines: string[] = [
    'You are researching candidate answers for a ClueCross word puzzle. You propose candidates only; you do not build the puzzle.',
    '',
    `Clue: ${request.clue}`,
  ]
  if (request.context) lines.push(`Author context (for your understanding only): ${request.context}`)

  lines.push(
    '',
    `Target: about ${request.targetCount} strong candidates. This is a target, not a quota: return fewer if reaching it ` +
      'would require weak, repetitive, loosely related, or obscure-for-the-sake-of-count answers.',
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
    'Every answer must contain at least 3 letters once spaces and punctuation are ignored.',
    '',
    'Respond with JSON only, in exactly this shape:',
    '{ "candidates": [ { "answer": string, "rationale": string, "category": string } ] }',
    '- answer: the human-readable answer.',
    '- rationale: one concise sentence explaining its direct relationship to the clue.',
    '- category: a short descriptive label for organizing the list.',
  )
  return lines.join('\n')
}
