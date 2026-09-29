// Candidate Sourcing v1: the provider-independent contract between the
// Workshop and whatever proposes candidate answers for a clue (today a
// deterministic fixture; later possibly an AI provider). The provider is a
// candidate researcher, not a puzzle constructor: it proposes answers with
// a rationale and category. Deterministic code checks mechanical facts,
// the author makes semantic judgments, and the generator constructs.

export type ProperNounSetting = 'allow' | 'exclude'
export type AbbreviationSetting = 'allow' | 'exclude'

export interface CandidateSourcingRequest {
  clue: string
  /** Optional author-only clarification. Never player-facing. */
  context?: string
  /** A target, not a quota: fewer strong candidates beat padding. */
  targetCount: number
  options: {
    properNouns: ProperNounSetting
    abbreviations: AbbreviationSetting
  }
}

/** What a provider is asked to return. Normalized forms, lengths, validity and scores are never requested. */
export interface SourcedCandidate {
  /** Human-readable answer, e.g. "Great Dane"; not assumed normalized. */
  answer: string
  /** One sentence explaining the direct relationship to the clue. */
  rationale: string
  /** Short informational label; no fixed taxonomy, never a validity rule. */
  category: string
}

export interface CandidateSourcingResponse {
  candidates: SourcedCandidate[]
}

/**
 * A candidate source. Its output is untrusted structured input, so it
 * resolves to `unknown` and is always run through parseSourcingResponse
 * rather than being trusted to match CandidateSourcingResponse.
 */
export interface CandidateSource {
  generate(request: CandidateSourcingRequest): Promise<unknown>
}

export const DEFAULT_TARGET_COUNT = 60
// Both default to Exclude: explicit author choices, never inferred from the clue.
export const DEFAULT_PROPER_NOUNS: ProperNounSetting = 'exclude'
export const DEFAULT_ABBREVIATIONS: AbbreviationSetting = 'exclude'

export interface SourcingRequestInput {
  clue: string
  context?: string
  properNouns?: ProperNounSetting
  abbreviations?: AbbreviationSetting
  targetCount?: number
}

export type SourcingRequestResult = { ok: true; request: CandidateSourcingRequest } | { ok: false; error: string }

export function createSourcingRequest(input: SourcingRequestInput): SourcingRequestResult {
  const clue = input.clue.trim()
  if (clue.length === 0) return { ok: false, error: 'Enter a clue.' }

  const context = input.context?.trim()
  return {
    ok: true,
    request: {
      clue,
      ...(context ? { context } : {}),
      targetCount: input.targetCount ?? DEFAULT_TARGET_COUNT,
      options: {
        properNouns: input.properNouns ?? DEFAULT_PROPER_NOUNS,
        abbreviations: input.abbreviations ?? DEFAULT_ABBREVIATIONS,
      },
    },
  }
}
