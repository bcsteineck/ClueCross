// Server-side Anthropic adapter for candidate sourcing. Runs only in the
// Workshop's Node server (see sourcingApiPlugin.ts); the API key never
// leaves this process and never reaches a browser bundle.
//
// The prompt is the existing deterministic buildSourcingPrompt — there is
// one sourcing instruction contract. The model is asked for JSON matching
// the sourcing response shape via structured outputs, but the result is
// still treated as untrusted: this adapter only extracts and JSON-parses
// the model's text, and the browser runs the existing parseSourcingResponse
// on it like any other provider output.

import type { CandidateSourcingRequest, SourcingErrorCategory } from '../src/sourcing/contract'
import { buildSourcingPrompt } from '../src/sourcing/prompt'

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
// ~60 candidates with one-sentence rationales fit comfortably, with room for
// the model's own reasoning; non-streaming, so kept within HTTP timeouts.
const MAX_TOKENS = 16000
export const PROVIDER_TIMEOUT_MS = 120_000

// Mirrors CandidateSourcingResponse. Asks for nothing deterministic code or
// the author owns (normalized forms, validity, scores, inclusion).
export const SOURCING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          rationale: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['answer', 'rationale', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const

export type ProviderResult =
  | { ok: true; payload: unknown; candidateCount: number | null }
  | { ok: false; category: SourcingErrorCategory; message: string; httpStatus: number }

export interface AnthropicSourcerConfig {
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function providerFailure(status: number, retryAfter: string | null, detail: string, model: string): ProviderResult {
  const suffix = detail ? ` (${detail})` : ''
  switch (status) {
    case 401:
    case 403:
      return { ok: false, category: 'provider', httpStatus: 502, message: `The provider rejected the credentials (HTTP ${status}). Check ANTHROPIC_API_KEY.` }
    case 404:
      return { ok: false, category: 'provider', httpStatus: 502, message: `The provider could not find model "${model}" (HTTP 404). Check ANTHROPIC_MODEL.` }
    case 429:
      return {
        ok: false,
        category: 'provider',
        httpStatus: 429,
        message: `The provider is rate limiting requests (HTTP 429)${retryAfter ? `; retry after ${retryAfter}s` : ''}. Try again later.`,
      }
    case 529:
      return { ok: false, category: 'provider', httpStatus: 502, message: 'The provider is temporarily overloaded (HTTP 529). Try again shortly.' }
    default:
      return {
        ok: false,
        category: 'provider',
        httpStatus: 502,
        message: status >= 500 ? `The provider had an internal error (HTTP ${status}).` : `The provider rejected the request (HTTP ${status})${suffix}.`,
      }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function sourceWithAnthropic(
  request: CandidateSourcingRequest,
  config: AnthropicSourcerConfig,
): Promise<ProviderResult> {
  const fetchImpl = config.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: buildSourcingPrompt(request) }],
        output_config: { format: { type: 'json_schema', schema: SOURCING_RESPONSE_SCHEMA } },
      }),
      signal: AbortSignal.timeout(config.timeoutMs ?? PROVIDER_TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      category: 'provider',
      httpStatus: timedOut ? 504 : 502,
      message: timedOut ? 'The provider did not respond in time.' : 'Could not reach the provider (network error).',
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    // The provider's own error message is diagnostic, not secret; keep it short.
    const detail = isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string' ? body.error.message.slice(0, 200) : ''
    return providerFailure(response.status, response.headers.get('retry-after'), detail, config.model)
  }

  if (!isRecord(body) || !Array.isArray(body.content)) {
    return { ok: false, category: 'response', httpStatus: 502, message: 'The provider returned an unrecognized response.' }
  }
  if (body.stop_reason === 'refusal') {
    return { ok: false, category: 'provider', httpStatus: 502, message: 'The model declined this sourcing request (refusal).' }
  }
  if (body.stop_reason === 'max_tokens') {
    return { ok: false, category: 'response', httpStatus: 502, message: 'The model’s response was cut off at the token limit.' }
  }

  const text = body.content
    .filter((block): block is { type: 'text'; text: string } => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return { ok: false, category: 'response', httpStatus: 502, message: 'The model’s response was not valid JSON.' }
  }
  const candidateCount = isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates.length : null
  return { ok: true, payload, candidateCount }
}
