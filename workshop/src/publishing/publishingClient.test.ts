import { describe, expect, it, vi } from 'vitest'
import { PUBLISHING_PREVIEW_PATH, PUBLISHING_PUBLISH_PATH } from './contract'
import type { PublishRequest } from './contract'
import { createPublishingClient, isPublishingResponseBody } from './publishingClient'

const request = { construction: { ok: true }, id: 'cats', clue: 'Cats' } as unknown as PublishRequest
const publication = {
  puzzleId: 'cats',
  publishDate: '2026-10-04',
  releaseInstant: '2026-10-04T02:00:00.000Z',
  contentFingerprint: 'a'.repeat(64),
  fingerprintVersion: 1,
}

function respond(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { client: createPublishingClient(fetchImpl), calls }
}

describe('publishing client', () => {
  it('POSTs the request contract as JSON to the fixed paths', async () => {
    const { client, calls } = respond(201, { status: 'created', publication })
    expect(await client.publish(request)).toEqual({ ok: true, body: { status: 'created', publication } })
    const preview = respond(200, { status: 'estimate', estimate: { publishDate: '2026-10-04', releaseInstant: 'x', contentFingerprint: 'f' } })
    await preview.client.preview(request)

    expect(calls[0].url).toBe(PUBLISHING_PUBLISH_PATH)
    expect(preview.calls[0].url).toBe(PUBLISHING_PREVIEW_PATH)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(String(calls[0].init.body))).toEqual(request)
  })

  it('returns server publishing outcomes, including error statuses, as valid results', async () => {
    const outcomes: [number, unknown][] = [
      [200, { status: 'existing', publication }],
      [409, { status: 'conflict', message: 'm', existing: { puzzleId: 'cats', publishDate: '2026-10-04', releaseInstant: 'x' } }],
      [422, { status: 'invalid', errors: { metadata: [{ field: 'id', message: 'm' }], production: [], export: ['e'] } }],
      [503, { status: 'busy', message: 'm' }],
      [503, { status: 'unavailable', message: 'm' }],
      [503, { status: 'not-configured', message: 'm' }],
      [400, { status: 'bad-request', message: 'm' }],
    ]
    for (const [status, body] of outcomes) {
      expect(await respond(status, body).client.publish(request)).toEqual({ ok: true, body })
    }
  })

  it('distinguishes transport failures from publishing outcomes', async () => {
    const offline = createPublishingClient(vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch)
    expect(await offline.publish(request)).toEqual({ ok: false, failure: 'network' })
    expect(await respond(502, '<html>Bad gateway</html>').client.publish(request)).toEqual({ ok: false, failure: 'response' })
    expect(await respond(200, { status: 'published!' }).client.publish(request)).toEqual({ ok: false, failure: 'response' })
    expect(await respond(201, { status: 'created', publication: { puzzleId: 'cats' } }).client.publish(request)).toEqual({
      ok: false,
      failure: 'response',
    })
  })

  it('only accepts statuses that belong to each operation', () => {
    expect(isPublishingResponseBody({ status: 'created', publication }, 'preview')).toBe(false)
    expect(isPublishingResponseBody({ status: 'busy', message: 'm' }, 'preview')).toBe(false)
    expect(isPublishingResponseBody({ status: 'estimate', estimate: { publishDate: 'd', releaseInstant: 'r', contentFingerprint: 'f' } }, 'publish')).toBe(false)
  })
})
