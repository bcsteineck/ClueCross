import { describe, expect, it, vi } from 'vitest'
import { analyzeCandidatePool } from '../src/poolDiagnostics'
import { createSourcingRequest } from '../src/sourcing/contract'
import type { CandidateSourcingRequest } from '../src/sourcing/contract'
import { FIXTURE_SOURCING_RESPONSE, fixtureCandidateSource } from '../src/sourcing/fixtureSource'
import { createLiveCandidateSource, SOURCING_ENDPOINT } from '../src/sourcing/liveSource'
import { buildSourcingPrompt } from '../src/sourcing/prompt'
import { poolReviewEntries } from '../src/sourcing/reviewPool'
import { sourceCandidates } from '../src/sourcing/sourceCandidates'
import { ANTHROPIC_MESSAGES_URL, SOURCING_RESPONSE_SCHEMA } from './anthropicSourcer'
import { handleSourcingRequest } from './sourcingEndpoint'
import { sourcingMiddleware } from './sourcingApiPlugin'

// A placeholder credential for tests only — never a real key.
const TEST_KEY = 'test-credential-placeholder'
const CONFIG = { apiKey: TEST_KEY, model: 'configured-model-id' }

function request(input: Parameters<typeof createSourcingRequest>[0]): CandidateSourcingRequest {
  const result = createSourcingRequest(input)
  if (!result.ok) throw new Error(result.error)
  return result.request
}

// A mocked Anthropic Messages API: records calls, returns a canned response.
function mockProvider(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const messagesResponse = (payload: unknown, stop_reason = 'end_turn') => ({
  type: 'message',
  content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
  stop_reason,
})

const quiet = { log: () => {} }

describe('sourcing endpoint: configuration', () => {
  it('refuses to run without the server credential or model, without echoing configuration values', async () => {
    const provider = mockProvider(200, messagesResponse(FIXTURE_SOURCING_RESPONSE))
    const body = request({ clue: 'Dogs' })
    expect(await handleSourcingRequest(body, { model: 'm' }, { ...quiet, fetchImpl: provider.fetchImpl })).toEqual({
      status: 503,
      body: { error: { category: 'configuration', message: 'ANTHROPIC_API_KEY is not set for the Workshop server (.env.local).' } },
    })
    expect(await handleSourcingRequest(body, { apiKey: TEST_KEY }, { ...quiet, fetchImpl: provider.fetchImpl })).toEqual({
      status: 503,
      body: { error: { category: 'configuration', message: 'ANTHROPIC_MODEL is not set for the Workshop server (.env.local).' } },
    })
    expect(provider.calls).toHaveLength(0)
  })

  it('rejects malformed browser requests at the boundary', async () => {
    const provider = mockProvider(200, messagesResponse(FIXTURE_SOURCING_RESPONSE))
    const bad = [null, { clue: 5 }, { clue: 'Dogs', targetCount: 0, options: { properNouns: 'exclude', abbreviations: 'exclude' } }, { clue: 'Dogs', targetCount: 60, options: { properNouns: 'maybe', abbreviations: 'exclude' } }, { clue: '  ', targetCount: 60, options: { properNouns: 'exclude', abbreviations: 'exclude' } }]
    for (const body of bad) {
      const result = await handleSourcingRequest(body, CONFIG, { ...quiet, fetchImpl: provider.fetchImpl })
      expect(result.status).toBe(400)
      expect(result.body).toMatchObject({ error: { category: 'request' } })
    }
    expect(provider.calls).toHaveLength(0)
  })
})

describe('sourcing endpoint: provider request', () => {
  it('sends the existing deterministic prompt to the configured model with structured output', async () => {
    const provider = mockProvider(200, messagesResponse(FIXTURE_SOURCING_RESPONSE))
    const sent = request({ clue: 'Car Brands', context: 'Manufacturers only', properNouns: 'allow', abbreviations: 'allow', targetCount: 45 })
    await handleSourcingRequest(sent, CONFIG, { ...quiet, fetchImpl: provider.fetchImpl })

    expect(provider.calls).toHaveLength(1)
    const { url, init } = provider.calls[0]
    expect(url).toBe(ANTHROPIC_MESSAGES_URL)
    expect(init.headers).toMatchObject({ 'x-api-key': TEST_KEY, 'anthropic-version': '2023-06-01' })
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('configured-model-id')
    expect(body.messages).toEqual([{ role: 'user', content: buildSourcingPrompt(sent) }])
    expect(body.messages[0].content).toContain('Author context (for your understanding only): Manufacturers only')
    expect(body.messages[0].content).toContain('Proper nouns: ALLOWED.')
    expect(body.messages[0].content).toContain('Abbreviations: ALLOWED.')
    expect(body.messages[0].content).toContain('about 45 strong candidates')
    // Low effort, with the structured-output format unchanged.
    expect(body.output_config).toEqual({ effort: 'low', format: { type: 'json_schema', schema: SOURCING_RESPONSE_SCHEMA } })
    // The rest of the contract is unchanged: no thinking override, no tools,
    // no caching, same token limit, nothing else in the body.
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'output_config'])
    expect(body.max_tokens).toBe(16000)
    expect(body).not.toHaveProperty('thinking')
    expect(JSON.stringify(body)).not.toContain('cache_control')
    expect(Object.keys(SOURCING_RESPONSE_SCHEMA.properties.candidates.items.properties)).toEqual(['answer', 'rationale', 'category'])
  })

  it('returns the provider payload untouched and never returns or logs the credential', async () => {
    const provider = mockProvider(200, messagesResponse(FIXTURE_SOURCING_RESPONSE))
    const lines: string[] = []
    let t = 1000
    const result = await handleSourcingRequest(request({ clue: 'Dogs' }), CONFIG, {
      fetchImpl: provider.fetchImpl,
      log: (line) => lines.push(line),
      now: () => (t += 250),
    })
    expect(result).toEqual({ status: 200, body: { payload: FIXTURE_SOURCING_RESPONSE } })
    expect(lines).toEqual([
      '[sourcing] started model=configured-model-id clue="Dogs"',
      '[sourcing] completed model=configured-model-id candidates=36 duration=250ms',
    ])
    expect(JSON.stringify(result) + lines.join('\n')).not.toContain(TEST_KEY)
  })
})

describe('sourcing endpoint: provider and response failures', () => {
  const run = async (fetchImpl: typeof fetch) => {
    const lines: string[] = []
    const result = await handleSourcingRequest(request({ clue: 'Dogs' }), CONFIG, { fetchImpl, log: (l) => lines.push(l) })
    expect(JSON.stringify(result) + lines.join('\n')).not.toContain(TEST_KEY)
    return result
  }
  const errorBody = (type: string, message: string) => ({ type: 'error', error: { type, message } })

  it.each([
    [401, {}, 502, 'The provider rejected the credentials (HTTP 401). Check ANTHROPIC_API_KEY.'],
    [404, {}, 502, 'The provider could not find model "configured-model-id" (HTTP 404). Check ANTHROPIC_MODEL.'],
    [429, { 'retry-after': '30' }, 429, 'The provider is rate limiting requests (HTTP 429); retry after 30s. Try again later.'],
    [529, {}, 502, 'The provider is temporarily overloaded (HTTP 529). Try again shortly.'],
    [500, {}, 502, 'The provider had an internal error (HTTP 500).'],
  ])('HTTP %i → provider error', async (status, headers, httpStatus, message) => {
    const provider = mockProvider(status, errorBody('some_error', 'details'), headers)
    expect(await run(provider.fetchImpl)).toEqual({ status: httpStatus, body: { error: { category: 'provider', message } } })
  })

  it('maps network failures and timeouts to provider errors', async () => {
    const network = vi.fn(() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch
    expect(await run(network)).toEqual({
      status: 502,
      body: { error: { category: 'provider', message: 'Could not reach the provider (network error).' } },
    })
    const timeout = vi.fn(() => Promise.reject(new DOMException('timed out', 'TimeoutError'))) as unknown as typeof fetch
    expect(await run(timeout)).toEqual({
      status: 504,
      body: { error: { category: 'provider', message: 'The provider did not respond in time.' } },
    })
  })

  it('maps refusals to provider errors, and truncated or non-JSON output to response errors', async () => {
    expect((await run(mockProvider(200, messagesResponse('', 'refusal')).fetchImpl)).body).toEqual({
      error: { category: 'provider', message: 'The model declined this sourcing request (refusal).' },
    })
    expect((await run(mockProvider(200, messagesResponse('{"candidates": [', 'max_tokens')).fetchImpl)).body).toEqual({
      error: { category: 'response', message: 'The model’s response was cut off at the token limit.' },
    })
    expect((await run(mockProvider(200, messagesResponse('not json')).fetchImpl)).body).toEqual({
      error: { category: 'response', message: 'The model’s response was not valid JSON.' },
    })
  })
})

describe('live CandidateSource → endpoint → provider → existing pipeline', () => {
  // Routes the browser source's fetch to the real endpoint handler, whose
  // provider fetch is mocked — the whole server boundary without a network.
  function wire(providerFetch: typeof fetch, config = CONFIG) {
    const browserFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(SOURCING_ENDPOINT)
      const result = await handleSourcingRequest(JSON.parse(String(init?.body)), config, { fetchImpl: providerFetch, ...quiet })
      return new Response(JSON.stringify(result.body), { status: result.status })
    }) as unknown as typeof fetch
    return createLiveCandidateSource(browserFetch)
  }

  it('produces exactly the same review pool and diagnostics as the same payload from the fixture', async () => {
    const dogs = request({ clue: 'Dogs' })
    const live = await sourceCandidates(wire(mockProvider(200, messagesResponse(FIXTURE_SOURCING_RESPONSE)).fetchImpl), dogs)
    const fixture = await sourceCandidates(fixtureCandidateSource, dogs)
    if (!live.ok || !fixture.ok) throw new Error('sourcing failed')
    expect(live.pool).toEqual(fixture.pool)
    const analysis = analyzeCandidatePool(poolReviewEntries(live.pool.candidates))
    expect(analysis.usableAnswers).toHaveLength(33)
    expect(analysis.canGenerate).toBe(true)
  })

  it('surfaces categorized failures to the Workshop, never a fixture fallback', async () => {
    const dogs = request({ clue: 'Dogs' })
    expect(await sourceCandidates(wire(mockProvider(200, messagesResponse({ answers: [] })).fetchImpl), dogs)).toEqual({
      ok: false,
      category: 'response',
      error: 'Sourcing response has no candidates array.',
    })
    expect(await sourceCandidates(wire(mockProvider(429, {}).fetchImpl), dogs)).toEqual({
      ok: false,
      category: 'provider',
      error: 'The provider is rate limiting requests (HTTP 429). Try again later.',
    })
    expect(await sourceCandidates(wire(mockProvider(200, {}).fetchImpl, { apiKey: '', model: 'm' }), dogs)).toEqual({
      ok: false,
      category: 'configuration',
      error: 'ANTHROPIC_API_KEY is not set for the Workshop server (.env.local).',
    })
  })

  it('keeps candidate-level invalidity separate from response errors', async () => {
    const payload = { candidates: [{ answer: 'OX', rationale: 'A draft animal.', category: 'Animals' }] }
    const result = await sourceCandidates(wire(mockProvider(200, messagesResponse(payload)).fetchImpl), request({ clue: 'Farm' }))
    if (!result.ok) throw new Error(result.error)
    expect(result.pool.candidates[0]).toMatchObject({ sourceAnswer: 'OX', validity: 'invalid' })
    expect(result.pool.issues).toEqual([])
  })

  it('reports an unreachable Workshop server as a provider error', async () => {
    const offline = createLiveCandidateSource(vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch)
    expect(await sourceCandidates(offline, request({ clue: 'Dogs' }))).toEqual({
      ok: false,
      category: 'provider',
      error: 'Could not reach the Workshop sourcing endpoint. Is the Workshop server running (npm run workshop)?',
    })
  })
})

describe('sourcing middleware', () => {
  function call(method: string, url: string, body = '') {
    const handler = sourcingMiddleware(() => ({}))
    return new Promise<{ status?: number; body?: unknown; next: boolean }>((resolve) => {
      const listeners: Record<string, ((arg?: unknown) => void)[]> = {}
      const req = {
        method,
        url,
        on: (event: string, fn: (arg?: unknown) => void) => {
          ;(listeners[event] ??= []).push(fn)
          return req
        },
        destroy: () => {},
      }
      const res = {
        statusCode: 0,
        headersSent: false,
        setHeader: () => {},
        end: (text: string) => resolve({ status: res.statusCode, body: JSON.parse(text), next: false }),
      }
      handler(req as never, res as never, () => resolve({ next: true }))
      queueMicrotask(() => {
        for (const fn of listeners.data ?? []) fn(Buffer.from(body))
        for (const fn of listeners.end ?? []) fn()
      })
    })
  }

  it('only handles POST /api/sourcing', async () => {
    expect(await call('GET', '/index.html')).toEqual({ next: true })
    expect(await call('GET', '/api/sourcing')).toEqual({ status: 405, body: { error: { category: 'request', message: 'Use POST.' } }, next: false })
    expect(await call('POST', '/api/sourcing', 'not json')).toEqual({
      status: 400,
      body: { error: { category: 'request', message: 'Request body is not valid JSON.' } },
      next: false,
    })
    expect(await call('POST', '/api/sourcing', JSON.stringify(request({ clue: 'Dogs' })))).toMatchObject({
      status: 503,
      body: { error: { category: 'configuration' } },
    })
  })
})
