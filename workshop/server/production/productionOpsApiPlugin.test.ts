import { describe, expect, it, vi } from 'vitest'
import { PRODUCTION_PATHS } from '../../src/production/contract'
import { catsRequest } from '../publishing/testFixtures'
import type { RunProductionOperation } from './productionBridge'
import { MAX_PRODUCTION_BODY_BYTES, productionOpsEnabled, productionOpsMiddleware } from './productionOpsApiPlugin'

const SAME_ORIGIN = { host: 'localhost:5175', origin: 'http://localhost:5175', 'sec-fetch-site': 'same-origin' }
const JSON_TYPE = { 'content-type': 'application/json' }

interface CallResult {
  status?: number
  body?: Record<string, unknown>
  next: boolean
}

function call(
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string },
  middleware: ReturnType<typeof productionOpsMiddleware>,
): Promise<CallResult> {
  const { method = 'POST', url = PRODUCTION_PATHS.schedule, headers = { ...SAME_ORIGIN, ...JSON_TYPE }, body = '{}' } = options
  return new Promise((resolve) => {
    const listeners: Record<string, ((arg?: unknown) => void)[]> = {}
    const req = {
      method,
      url,
      headers,
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
    middleware(req as never, res as never, () => resolve({ next: true }))
    queueMicrotask(() => {
      const bytes = Buffer.from(body)
      for (let offset = 0; offset < bytes.length; offset += 16 * 1024) {
        for (const fn of listeners.data ?? []) fn(bytes.subarray(offset, offset + 16 * 1024))
      }
      for (const fn of listeners.end ?? []) fn()
    })
  })
}

function enabled(run?: RunProductionOperation) {
  const spy = vi.fn<RunProductionOperation>(run ?? (async () => ({ ok: true, body: { status: 'ok' } as never })))
  return { spy, middleware: productionOpsMiddleware({ enabled: true, run: spy }) }
}

const removeBody = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ puzzleId: 'animals', expectedPublishDate: '2026-10-07', expectedFingerprint: 'a'.repeat(64), confirmPuzzleId: 'animals', ...overrides })

describe('Production-operations mode', () => {
  it('is enabled only by WORKSHOP_PRODUCTION_OPS=1', () => {
    expect(productionOpsEnabled({ WORKSHOP_PRODUCTION_OPS: '1' })).toBe(true)
    for (const value of [undefined, '', '0', 'true', 'yes', ' 1']) {
      expect(productionOpsEnabled({ WORKSHOP_PRODUCTION_OPS: value })).toBe(false)
    }
  })

  it('plain Workshop: every /api/production/* request is disabled and nothing runs', async () => {
    const run = vi.fn<RunProductionOperation>()
    const middleware = productionOpsMiddleware({ enabled: false, run })
    for (const url of [...Object.values(PRODUCTION_PATHS), '/api/production', '/api/production/anything']) {
      const result = await call({ url }, middleware)
      expect(result).toMatchObject({ status: 404, body: { status: 'production-unavailable', reason: 'disabled' } })
    }
    expect(run).not.toHaveBeenCalled()
    // Enabled without a runner is still disabled.
    expect(await call({}, productionOpsMiddleware({ enabled: true }))).toMatchObject({ status: 404, body: { reason: 'disabled' } })
  })

  it('leaves every other path to the rest of the server', async () => {
    const { middleware } = enabled()
    expect(await call({ url: '/api/publishing/publish' }, middleware)).toEqual({ next: true })
    expect(await call({ url: '/api/productionx' }, middleware)).toEqual({ next: true })
  })
})

describe('Production endpoints (enabled)', () => {
  it('runs the operation named by the path, ignoring any operation in the body', async () => {
    const { spy, middleware } = enabled()
    expect(await call({ body: JSON.stringify({ operation: 'remove' }) }, middleware)).toMatchObject({ status: 200, body: { status: 'ok' } })
    expect(spy).toHaveBeenCalledWith({ operation: 'schedule' })
    await call({ url: PRODUCTION_PATHS.removePreview, body: JSON.stringify({ puzzleId: 'animals' }) }, middleware)
    expect(spy).toHaveBeenLastCalledWith({ operation: 'remove-preview', puzzleId: 'animals' })
  })

  it('enforces method, origin, content type, and body size', async () => {
    const { spy, middleware } = enabled()
    expect(await call({ method: 'GET' }, middleware)).toMatchObject({ status: 405 })
    expect(await call({ headers: { ...JSON_TYPE, host: 'localhost:5175', origin: 'http://evil.example' } }, middleware)).toMatchObject({ status: 403 })
    expect(await call({ headers: { ...JSON_TYPE, 'sec-fetch-site': 'cross-site' } }, middleware)).toMatchObject({ status: 403 })
    expect(await call({ headers: { ...SAME_ORIGIN, 'content-type': 'text/plain' } }, middleware)).toMatchObject({ status: 415 })
    expect(await call({ body: 'x'.repeat(MAX_PRODUCTION_BODY_BYTES + 1) }, middleware)).toMatchObject({ status: 413 })
    expect(await call({ body: '{nope' }, middleware)).toMatchObject({ status: 400 })
    expect(await call({ body: '[]' }, middleware)).toMatchObject({ status: 400 })
    expect(await call({ url: '/api/production/drop' }, middleware)).toMatchObject({ status: 404 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('requires the typed confirmation before starting anything', async () => {
    const { spy, middleware } = enabled()
    expect(await call({ url: PRODUCTION_PATHS.remove, body: removeBody({ confirmPuzzleId: 'movies' }) }, middleware)).toMatchObject({ status: 400 })
    expect(
      await call(
        { url: PRODUCTION_PATHS.publish, body: JSON.stringify({ request: catsRequest(), expectedFingerprint: 'a'.repeat(64), confirmPuzzleId: '' }) },
        middleware,
      ),
    ).toMatchObject({ status: 400 })
    expect(spy).not.toHaveBeenCalled()
    expect(await call({ url: PRODUCTION_PATHS.remove, body: removeBody() }, middleware)).toMatchObject({ status: 200 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('maps runner failures to sanitized responses', async () => {
    const identity = enabled(async () => ({ ok: false, error: 'identity', message: 'Not verified. Nothing was read or changed.' }))
    expect(await call({}, identity.middleware)).toEqual({
      status: 503,
      next: false,
      body: { status: 'production-unavailable', reason: 'identity', message: 'Not verified. Nothing was read or changed.' },
    })
    const uncertain = enabled(async () => ({ ok: false, error: 'uncertain', message: 'May or may not have completed.' }))
    expect(await call({ url: PRODUCTION_PATHS.remove, body: removeBody() }, uncertain.middleware)).toMatchObject({
      status: 503,
      body: { reason: 'uncertain' },
    })
    const bad = enabled(async () => ({ ok: false, error: 'bad-request', message: 'Bad.' }))
    expect(await call({}, bad.middleware)).toMatchObject({ status: 400, body: { status: 'bad-request' } })
    const throwing = enabled(async () => {
      throw new Error('postgresql://owner:secret@host')
    })
    const crashed = await call({}, throwing.middleware)
    expect(crashed).toMatchObject({ status: 503, body: { reason: 'unavailable' } })
    expect(JSON.stringify(crashed)).not.toMatch(/secret|postgres/)
  })
})

describe('backfill routes', () => {
  const backfillBody = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ request: catsRequest(), publishDate: '2026-11-08', expectedFingerprint: 'a'.repeat(64), confirmPuzzleId: 'cats', ...overrides })

  it('route only through the Production-operations paths, by path, with the same transport checks', async () => {
    const { spy, middleware } = enabled()
    await call({ url: PRODUCTION_PATHS.backfillPreview, body: JSON.stringify({ request: catsRequest(), operation: 'publish' }) }, middleware)
    expect(spy).toHaveBeenLastCalledWith({ operation: 'backfill-preview', request: catsRequest() })
    await call({ url: PRODUCTION_PATHS.backfill, body: backfillBody({ operation: 'publish' }) }, middleware)
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'backfill', publishDate: '2026-11-08', confirmPuzzleId: 'cats' }))
    expect(
      await call({ url: PRODUCTION_PATHS.backfill, headers: { ...JSON_TYPE, host: 'localhost:5175', origin: 'http://evil.example' }, body: backfillBody() }, middleware),
    ).toMatchObject({ status: 403 })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('refuses a missing or wrong confirmation, or an invalid date, before starting anything', async () => {
    const { spy, middleware } = enabled()
    for (const body of [backfillBody({ confirmPuzzleId: 'dogs' }), backfillBody({ confirmPuzzleId: undefined }), backfillBody({ publishDate: '2026-11-31' })]) {
      expect(await call({ url: PRODUCTION_PATHS.backfill, body }, middleware)).toMatchObject({ status: 400 })
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('is disabled with the rest of Production operations in plain Workshop', async () => {
    const run = vi.fn<RunProductionOperation>()
    const middleware = productionOpsMiddleware({ enabled: false, run })
    expect(await call({ url: PRODUCTION_PATHS.backfill, body: backfillBody() }, middleware)).toMatchObject({ status: 404 })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('puzzle preview route', () => {
  const previewBody = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ puzzleId: 'animals', expectedFingerprint: 'a'.repeat(64), ...overrides })

  it('routes only by its Production-operations path, with the same transport checks', async () => {
    const { spy, middleware } = enabled()
    await call({ url: PRODUCTION_PATHS.puzzlePreview, body: previewBody({ operation: 'remove', confirmPuzzleId: 'animals' }) }, middleware)
    expect(spy).toHaveBeenLastCalledWith({ operation: 'puzzle-preview', puzzleId: 'animals', expectedFingerprint: 'a'.repeat(64) })
    expect(await call({ method: 'GET', url: PRODUCTION_PATHS.puzzlePreview, body: previewBody() }, middleware)).toMatchObject({ status: 405 })
    expect(
      await call({ url: PRODUCTION_PATHS.puzzlePreview, headers: { ...JSON_TYPE, host: 'localhost:5175', origin: 'http://evil.example' }, body: previewBody() }, middleware),
    ).toMatchObject({ status: 403 })
    expect(await call({ url: PRODUCTION_PATHS.puzzlePreview, headers: SAME_ORIGIN, body: previewBody() }, middleware)).toMatchObject({ status: 415 })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refuses a missing or malformed puzzle ID or fingerprint before starting anything', async () => {
    const { spy, middleware } = enabled()
    for (const body of [
      previewBody({ puzzleId: undefined }),
      previewBody({ puzzleId: 'Not An Id' }),
      previewBody({ expectedFingerprint: undefined }),
      previewBody({ expectedFingerprint: 'xyz' }),
    ]) {
      expect(await call({ url: PRODUCTION_PATHS.puzzlePreview, body }, middleware)).toMatchObject({ status: 400 })
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('is disabled with the rest of Production operations in plain Workshop', async () => {
    const run = vi.fn<RunProductionOperation>()
    const middleware = productionOpsMiddleware({ enabled: false, run })
    expect(await call({ url: PRODUCTION_PATHS.puzzlePreview, body: previewBody() }, middleware)).toMatchObject({
      status: 404,
      body: { status: 'production-unavailable', reason: 'disabled' },
    })
    expect(run).not.toHaveBeenCalled()
  })
})
