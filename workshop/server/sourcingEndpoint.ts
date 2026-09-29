// POST /api/sourcing: the Workshop's server-side sourcing boundary.
// Browser → this handler → Anthropic adapter → Anthropic API. The browser
// sends the existing CandidateSourcingRequest and receives the provider's
// untrusted payload (or a categorized error) — never the key or provider
// request details.

import { createSourcingRequest } from '../src/sourcing/contract'
import type { CandidateSourcingRequest, SourcingErrorCategory } from '../src/sourcing/contract'
import { sourceWithAnthropic } from './anthropicSourcer'

export interface SourcingServerConfig {
  apiKey?: string
  model?: string
}

export type EndpointBody =
  | { payload: unknown }
  | { error: { category: SourcingErrorCategory; message: string } }

export interface EndpointResult {
  status: number
  body: EndpointBody
}

export interface EndpointDeps {
  fetchImpl?: typeof fetch
  log?: (line: string) => void
  now?: () => number
}

const SETTINGS = new Set(['allow', 'exclude'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Validates the untrusted browser request and rebuilds it through the
// existing createSourcingRequest, so defaults and trimming stay identical.
export function parseEndpointRequest(body: unknown): { ok: true; request: CandidateSourcingRequest } | { ok: false; message: string } {
  if (!isRecord(body)) return { ok: false, message: 'Request body must be a JSON object.' }
  const { clue, context, targetCount, options } = body
  if (typeof clue !== 'string') return { ok: false, message: 'clue must be a string.' }
  if (context !== undefined && typeof context !== 'string') return { ok: false, message: 'context must be a string.' }
  if (typeof targetCount !== 'number' || !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 200) {
    return { ok: false, message: 'targetCount must be an integer from 1 to 200.' }
  }
  if (!isRecord(options) || !SETTINGS.has(options.properNouns as string) || !SETTINGS.has(options.abbreviations as string)) {
    return { ok: false, message: 'options.properNouns and options.abbreviations must be "allow" or "exclude".' }
  }
  const result = createSourcingRequest({
    clue,
    context,
    targetCount,
    properNouns: options.properNouns as 'allow' | 'exclude',
    abbreviations: options.abbreviations as 'allow' | 'exclude',
  })
  return result.ok ? { ok: true, request: result.request } : { ok: false, message: result.error }
}

export async function handleSourcingRequest(
  body: unknown,
  config: SourcingServerConfig,
  deps: EndpointDeps = {},
): Promise<EndpointResult> {
  const log = deps.log ?? ((line: string) => console.info(line))
  const now = deps.now ?? (() => Date.now())
  const fail = (status: number, category: SourcingErrorCategory, message: string): EndpointResult => ({
    status,
    body: { error: { category, message } },
  })

  // Only presence is checked; values are never echoed or logged.
  if (!config.apiKey) return fail(503, 'configuration', 'ANTHROPIC_API_KEY is not set for the Workshop server (.env.local).')
  if (!config.model) return fail(503, 'configuration', 'ANTHROPIC_MODEL is not set for the Workshop server (.env.local).')

  const parsed = parseEndpointRequest(body)
  if (!parsed.ok) return fail(400, 'request', parsed.message)

  const started = now()
  log(`[sourcing] started model=${config.model} clue=${JSON.stringify(parsed.request.clue)}`)
  const result = await sourceWithAnthropic(parsed.request, {
    apiKey: config.apiKey,
    model: config.model,
    fetchImpl: deps.fetchImpl,
  })
  const duration = now() - started
  if (!result.ok) {
    log(`[sourcing] failed model=${config.model} category=${result.category} status=${result.httpStatus} duration=${duration}ms`)
    return fail(result.httpStatus, result.category, result.message)
  }
  log(`[sourcing] completed model=${config.model} candidates=${result.candidateCount ?? 'unknown'} duration=${duration}ms`)
  return { status: 200, body: { payload: result.payload } }
}
