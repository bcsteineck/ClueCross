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
