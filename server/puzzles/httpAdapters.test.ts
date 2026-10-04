import { describe, expect, it } from 'vitest'
import calendarFunction from '../../api/calendar'
import puzzleFunction from '../../api/puzzle'
import { puzzleApiMiddleware, toWebResponse, webHandler } from './httpAdapters'
import { handlePuzzleRequest } from './puzzleApi'

describe('Web Response adapter', () => {
  it('carries the status, every header, and the JSON body unchanged', async () => {
    const response = toWebResponse({
      status: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'x', 'Vercel-CDN-Cache-Control': 'y' },
      body: { error: 'not-found' },
    })
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('x')
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('y')
    expect(await response.json()).toEqual({ error: 'not-found' })
  })

  it('the api/ entry points return the handler contracts (405 with Allow, 400, 503 without a reader)', async () => {
    const post = await calendarFunction.fetch(new Request('https://example.test/api/calendar', { method: 'POST' }))
    expect(post.status).toBe(405)
    expect(post.headers.get('Allow')).toBe('GET')
    expect(post.headers.get('Cache-Control')).toBe('no-store')

    const bad = await puzzleFunction.fetch(new Request('https://example.test/api/puzzle?date=2026-02-30'))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'invalid-date', message: 'Use ?date=YYYY-MM-DD with a real calendar date.' })

    const unconfigured = await webHandler(handlePuzzleRequest, () => ({ DATABASE_URL: 'postgresql://owner@x/db' }))(
      new Request('https://example.test/api/puzzle?date=2026-10-01'),
    )
    expect(unconfigured.status).toBe(503)
    expect(unconfigured.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('local Vite middleware', () => {
  function call(url: string, method = 'GET') {
    return new Promise<{ next: boolean; status?: number; headers?: Record<string, string>; body?: unknown }>((resolve) => {
      const headers: Record<string, string> = {}
      const res = {
        statusCode: 0,
        headersSent: false,
        setHeader: (name: string, value: string) => {
          headers[name] = value
        },
        end: (text: string) => resolve({ next: false, status: res.statusCode, headers, body: JSON.parse(text) }),
      }
      puzzleApiMiddleware(() => ({}))({ url, method } as never, res as never, () => resolve({ next: true }))
    })
  }

  it('serves only the two routes, through the same handlers', async () => {
    expect(await call('/')).toEqual({ next: true })
    expect(await call('/api/sourcing')).toEqual({ next: true })
    const bad = await call('/api/puzzle?date=nope')
    const direct = await handlePuzzleRequest({ method: 'GET', url: '/api/puzzle?date=nope' }, { reader: undefined })
    expect(bad).toEqual({ next: false, status: direct.status, headers: direct.headers, body: direct.body })
    const post = await call('/api/calendar', 'POST')
    expect(post.status).toBe(405)
    expect(post.headers?.Allow).toBe('GET')
    expect((await call('/api/calendar')).status).toBe(503) // no reader configured
  })
})
