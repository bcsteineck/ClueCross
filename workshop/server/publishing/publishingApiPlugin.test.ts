import { describe, expect, it } from 'vitest'
import { PUBLISHING_PREVIEW_PATH, PUBLISHING_PUBLISH_PATH } from '../../src/publishing/contract'
import { MemoryPublicationStore } from './memoryPublicationStore'
import { MAX_PUBLISHING_BODY_BYTES, publishingMiddleware } from './publishingApiPlugin'
import type { PublicationStore } from './publicationStore'
import { NOON_SEPT_30, catsRequest } from './testFixtures'

const SAME_ORIGIN = { host: 'localhost:5174', origin: 'http://localhost:5174', 'sec-fetch-site': 'same-origin' }
const JSON_TYPE = { 'content-type': 'application/json' }

interface CallResult {
  status?: number
  body?: unknown
  next: boolean
}

// Drives the middleware with minimal Node request/response doubles.
function call(
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string },
  store?: PublicationStore,
): Promise<CallResult> {
  const { method = 'POST', url = PUBLISHING_PUBLISH_PATH, headers = { ...SAME_ORIGIN, ...JSON_TYPE }, body = '' } = options
  const handler = publishingMiddleware(() => store)
  return new Promise((resolve) => {
    const listeners: Record<string, ((arg?: unknown) => void)[]> = {}
    let destroyed = false
    const req = {
      method,
      url,
      headers,
      on: (event: string, fn: (arg?: unknown) => void) => {
        ;(listeners[event] ??= []).push(fn)
        return req
      },
      destroy: () => {
        destroyed = true
      },
    }
    const res = {
      statusCode: 0,
      headersSent: false,
      setHeader: () => {},
      end: (text: string) => resolve({ status: res.statusCode, body: JSON.parse(text), next: false }),
    }
    handler(req as never, res as never, () => resolve({ next: true }))
    queueMicrotask(() => {
      // Deliver in 16 KB chunks, as a socket would.
      const bytes = Buffer.from(body)
      for (let offset = 0; offset < bytes.length && !destroyed; offset += 16 * 1024) {
        for (const fn of listeners.data ?? []) fn(bytes.subarray(offset, offset + 16 * 1024))
      }
      if (!destroyed) for (const fn of listeners.end ?? []) fn()
    })
  })
}

const validBody = () => JSON.stringify(catsRequest())

describe('publishing middleware: routing and transport', () => {
  it('handles only the two fixed paths', async () => {
    expect(await call({ url: '/api/sourcing' })).toEqual({ next: true })
    expect(await call({ url: '/api/publishing' })).toEqual({ next: true })
    expect(await call({ url: '/api/publishing/publish/extra' })).toEqual({ next: true })
    expect(PUBLISHING_PREVIEW_PATH).toBe('/api/publishing/preview')
    expect(PUBLISHING_PUBLISH_PATH).toBe('/api/publishing/publish')
  })

  it('accepts POST only', async () => {
    for (const method of ['GET', 'PUT', 'OPTIONS']) {
      expect(await call({ method, body: validBody() }), method).toEqual({
        status: 405,
        body: { status: 'bad-request', message: 'Use POST.' },
        next: false,
      })
    }
  })

  it('requires a JSON content type', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
      const result = await call({ headers: { ...SAME_ORIGIN, 'content-type': type }, body: validBody() })
      expect(result, type).toMatchObject({ status: 415, body: { status: 'bad-request' } })
    }
    const withCharset = await call({ headers: { ...SAME_ORIGIN, 'content-type': 'application/json; charset=utf-8' }, body: validBody() })
    expect(withCharset.status).toBe(503) // reached the handler: not configured
  })

  it('rejects malformed JSON and oversized bodies', async () => {
    expect(await call({ body: '{"id":' })).toEqual({
      status: 400,
      body: { status: 'bad-request', message: 'Request body is not valid JSON.' },
      next: false,
    })
    expect(await call({ body: 'x'.repeat(MAX_PUBLISHING_BODY_BYTES + 1) })).toEqual({
      status: 413,
      body: { status: 'bad-request', message: 'Request body is too large.' },
      next: false,
    })
    // A real Final Puzzle request is far below the limit.
    expect(validBody().length).toBeLessThan(MAX_PUBLISHING_BODY_BYTES / 10)
  })
})

describe('publishing middleware: same-origin hardening', () => {
  const forbidden = { status: 403, body: { status: 'bad-request', message: 'Cross-origin publishing requests are not allowed.' }, next: false }

  it('rejects cross-origin and same-site (other localhost port) browser requests', async () => {
    const cases: Record<string, string>[] = [
      { host: 'localhost:5174', origin: 'http://localhost:3000' },
      { host: 'localhost:5174', origin: 'https://evil.example' },
      { host: 'localhost:5174', origin: 'null' },
      { host: 'localhost:5174', 'sec-fetch-site': 'cross-site' },
      { host: 'localhost:5174', 'sec-fetch-site': 'same-site' },
      { host: 'localhost:5174', origin: 'http://localhost:5174', 'sec-fetch-site': 'cross-site' },
    ]
    for (const headers of cases) {
      expect(await call({ headers: { ...headers, ...JSON_TYPE }, body: validBody() }), JSON.stringify(headers)).toEqual(forbidden)
    }
  })

  it('accepts same-origin browser requests and non-browser clients without browser headers', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    expect((await call({ body: validBody() }, store)).status).toBe(201)
    expect((await call({ headers: { host: 'localhost:5174', ...JSON_TYPE }, body: validBody() }, store)).status).toBe(200)
  })
})

describe('publishing middleware: behavior', () => {
  it('reports not-configured when no store is supplied — never a fake publication', async () => {
    for (const url of [PUBLISHING_PREVIEW_PATH, PUBLISHING_PUBLISH_PATH]) {
      expect(await call({ url, body: validBody() })).toEqual({
        status: 503,
        body: { status: 'not-configured', message: 'Publishing is not configured on this Workshop server.' },
        next: false,
      })
    }
  })

  it('delegates to the pure handlers with the injected store', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    const preview = await call({ url: PUBLISHING_PREVIEW_PATH, body: validBody() }, store)
    expect(preview).toMatchObject({ status: 200, body: { status: 'estimate', estimate: { publishDate: '2026-10-01' } } })
    expect(store.records()).toEqual([])

    const publish = await call({ body: validBody() }, store)
    expect(publish).toMatchObject({ status: 201, body: { status: 'created', publication: { publishDate: '2026-10-01' } } })
    expect(store.records()).toHaveLength(1)
  })

  it('sanitizes store failures', async () => {
    const store = new MemoryPublicationStore({ now: NOON_SEPT_30 })
    store.failNextTransaction(new Error('ECONNREFUSED postgres://u:s3cret@db.internal'))
    const result = await call({ body: validBody() }, store)
    expect(result).toEqual({
      status: 503,
      body: { status: 'unavailable', message: 'Publishing is unavailable right now. Nothing was published; try again.' },
      next: false,
    })
  })
})
