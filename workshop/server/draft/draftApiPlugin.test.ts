import { describe, expect, it } from 'vitest'
import { DRAFT_PATH } from '../../src/draft/contract'
import { createInitialDraft } from '../../src/state/workshopReducer'
import { MAX_DRAFT_BODY_BYTES, draftMiddleware } from './draftApiPlugin'
import type { DraftStore } from './draftStore'
import { createMemoryDraftStore } from './memoryDraftStore'
import { envelopeOf, fullDraft } from './testDrafts'

const SAME_ORIGIN = { host: 'localhost:5174', origin: 'http://localhost:5174', 'sec-fetch-site': 'same-origin' }
const JSON_TYPE = { 'content-type': 'application/json' }

interface CallResult {
  status?: number
  body?: unknown
  next: boolean
}

// Drives the middleware with minimal Node request/response doubles.
function call(
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string; remoteAddress?: string },
  store: DraftStore = createMemoryDraftStore(),
): Promise<CallResult> {
  const {
    method = 'PUT',
    url = DRAFT_PATH,
    headers = { ...SAME_ORIGIN, ...JSON_TYPE },
    body = '',
    remoteAddress = '127.0.0.1',
  } = options
  const handler = draftMiddleware(store)
  return new Promise((resolve) => {
    const listeners: Record<string, ((arg?: unknown) => void)[]> = {}
    const req = {
      method,
      url,
      headers,
      socket: { remoteAddress },
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
      const bytes = Buffer.from(body)
      for (let offset = 0; offset < bytes.length; offset += 16 * 1024) {
        for (const fn of listeners.data ?? []) fn(bytes.subarray(offset, offset + 16 * 1024))
      }
      for (const fn of listeners.end ?? []) fn()
    })
  })
}

const saveBody = (baseRevision = 0, draft: unknown = createInitialDraft()) => JSON.stringify({ baseRevision, draft })

describe('draft middleware: routing and transport', () => {
  it('passes other paths through', async () => {
    expect(await call({ url: '/api/publishing/preview' })).toEqual({ next: true })
    expect(await call({ url: '/src/main.tsx', method: 'GET' })).toEqual({ next: true })
  })

  it('never serves the draft directory as a file, from the Vite root or /@fs/', async () => {
    for (const url of [
      '/.local/working-draft.json',
      '/.local/',
      '/%2Elocal/working-draft.json',
      '/@fs/Users/author/ClueCross/workshop/.local/working-draft.json',
    ]) {
      expect(await call({ url, method: 'GET' }), url).toMatchObject({ status: 404 })
    }
  })

  it('answers only loopback clients', async () => {
    expect(await call({ method: 'GET', remoteAddress: '192.168.1.20' })).toMatchObject({ status: 403 })
    for (const remoteAddress of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      expect(await call({ method: 'GET', remoteAddress })).toMatchObject({ status: 200 })
    }
  })

  it('rejects cross-origin browser requests, including another local port', async () => {
    const otherPort = { ...JSON_TYPE, host: 'localhost:5174', origin: 'http://localhost:5175', 'sec-fetch-site': 'same-site' }
    expect(await call({ method: 'GET', headers: otherPort })).toMatchObject({ status: 403 })
    expect(await call({ headers: otherPort, body: saveBody() })).toMatchObject({ status: 403 })
  })

  it('allows only GET and PUT, and PUT only as JSON within the size limit', async () => {
    expect(await call({ method: 'POST', body: saveBody() })).toMatchObject({ status: 405 })
    expect(await call({ method: 'DELETE' })).toMatchObject({ status: 405 })
    expect(await call({ headers: SAME_ORIGIN, body: saveBody() })).toMatchObject({ status: 415 })
    expect(await call({ body: '{' })).toMatchObject({ status: 400, body: { message: 'Request body is not valid JSON.' } })
    const huge = JSON.stringify({ baseRevision: 0, draft: { ...createInitialDraft(), poolText: 'A'.repeat(MAX_DRAFT_BODY_BYTES) } })
    expect(await call({ body: huge })).toMatchObject({ status: 413 })
  })
})

describe('draft middleware: load and save', () => {
  it('loads empty, then the saved envelope', async () => {
    const store = createMemoryDraftStore()
    expect(await call({ method: 'GET' }, store)).toMatchObject({ status: 200, body: { status: 'empty' } })
    expect(await call({ body: saveBody(0, fullDraft()) }, store)).toMatchObject({ status: 200, body: { status: 'saved', revision: 1 } })
    const loaded = await call({ method: 'GET' }, store)
    expect(loaded).toMatchObject({ status: 200, body: { status: 'ok', envelope: { revision: 1, schemaVersion: 1 } } })
  })

  it('reports an unreadable saved draft without changing it, and refuses to overwrite it', async () => {
    const store = createMemoryDraftStore({ kind: 'invalid', message: 'The saved working draft is not valid JSON.' })
    expect(await call({ method: 'GET' }, store)).toMatchObject({ body: { status: 'invalid' } })
    expect(await call({ body: saveBody() }, store)).toMatchObject({ status: 409, body: { status: 'invalid-existing' } })
    expect(store.current().kind).toBe('invalid')
  })

  it('validates the draft and the request fields before writing anything', async () => {
    const store = createMemoryDraftStore()
    const cases = [
      JSON.stringify([]),
      JSON.stringify({ draft: createInitialDraft() }),
      JSON.stringify({ baseRevision: -1, draft: createInitialDraft() }),
      JSON.stringify({ baseRevision: 0, draft: createInitialDraft(), replaceInvalid: 'yes' }),
      saveBody(0, { ...createInitialDraft(), poolSource: 'neither' }),
    ]
    for (const body of cases) expect(await call({ body }, store), body).toMatchObject({ status: 400, body: { status: 'bad-request' } })
    expect(store.writes).toEqual([])
  })

  it('rejects a stale revision with 409 and the current revision', async () => {
    const store = createMemoryDraftStore({ kind: 'ok', envelope: envelopeOf(fullDraft(), 4) })
    expect(await call({ body: saveBody(3) }, store)).toMatchObject({ status: 409, body: { status: 'conflict', revision: 4 } })
    expect(await call({ body: saveBody(4) }, store)).toMatchObject({ status: 200, body: { status: 'saved', revision: 5 } })
  })

  it('reports storage failures as unavailable without internal details', async () => {
    const failing: DraftStore = {
      read: () => Promise.reject(new Error('EACCES: /secret/path')),
      write: () => Promise.reject(new Error('EACCES: /secret/path')),
    }
    const load = await call({ method: 'GET' }, failing)
    const save = await call({ body: saveBody() }, failing)
    expect(load).toMatchObject({ status: 500, body: { status: 'unavailable' } })
    expect(save).toMatchObject({ status: 503, body: { status: 'unavailable' } })
    expect(JSON.stringify([load.body, save.body])).not.toMatch(/secret|EACCES/)
  })
})
