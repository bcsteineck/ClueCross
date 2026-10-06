// Workshop-only endpoints for Production operations (/api/production/*).
// They exist ONLY on the local Workshop dev server, and only when it was
// deliberately started in Production-operations mode
// (`npm run workshop:production-ops`, which sets WORKSHOP_PRODUCTION_OPS=1
// in the process environment — never read from .env files). Otherwise every
// /api/production/* request answers a fixed "disabled" 404 and no child
// process is ever started. Nothing here is part of the player's api/.
//
// Transport hardening matches the publishing endpoints: POST only,
// same-origin, JSON, and a body limit. The operation is validated (shape,
// formats, typed confirmation) BEFORE a child is started, and again inside
// the child.

import type { Connect, Plugin } from 'vite'
import { PRODUCTION_PATHS } from '../../src/production/contract'
import type { ProductionUnavailableBody } from '../../src/production/contract'
import { BodyTooLargeError, hasJsonContentType, isSameOriginRequest, readBody, sendJson } from '../http'
import type { RunProductionOperation } from './productionBridge'
import { parseProductionOperation } from './productionOperations'
import type { ProductionOperationName } from './productionOperations'

export const PRODUCTION_OPS_ENV = 'WORKSHOP_PRODUCTION_OPS'
export const MAX_PRODUCTION_BODY_BYTES = 64 * 1024

const OPERATION_BY_PATH: Record<string, ProductionOperationName> = {
  [PRODUCTION_PATHS.schedule]: 'schedule',
  [PRODUCTION_PATHS.publishPreview]: 'publish-preview',
  [PRODUCTION_PATHS.publish]: 'publish',
  [PRODUCTION_PATHS.removePreview]: 'remove-preview',
  [PRODUCTION_PATHS.remove]: 'remove',
}

/** Production-operations mode: an explicit process-environment opt-in, exactly "1". */
export function productionOpsEnabled(env: Record<string, string | undefined>): boolean {
  return env[PRODUCTION_OPS_ENV] === '1'
}

const unavailable = (reason: ProductionUnavailableBody['reason'], message: string): ProductionUnavailableBody => ({
  status: 'production-unavailable',
  reason,
  message,
})

const DISABLED = unavailable(
  'disabled',
  'Production operations are not enabled on this Workshop server. Start it with npm run workshop:production-ops.',
)
const badRequest = (message: string) => ({ status: 'bad-request', message })

export interface ProductionOpsMiddlewareOptions {
  enabled: boolean
  /** Runs one operation in a short-lived Production child; required when enabled. */
  run?: RunProductionOperation
}

export function productionOpsMiddleware({ enabled, run }: ProductionOpsMiddlewareOptions): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    if (path !== '/api/production' && !path.startsWith('/api/production/')) return next()
    if (!enabled || !run) {
      sendJson(res, 404, DISABLED)
      return
    }
    const operation = OPERATION_BY_PATH[path]
    if (!operation) {
      sendJson(res, 404, badRequest('Unknown Production operation.'))
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      sendJson(res, 405, badRequest('Use POST.'))
      return
    }
    if (!isSameOriginRequest(req)) {
      sendJson(res, 403, badRequest('Cross-origin Production requests are not allowed.'))
      return
    }
    if (!hasJsonContentType(req)) {
      sendJson(res, 415, badRequest('Send the request as application/json.'))
      return
    }

    readBody(req, MAX_PRODUCTION_BODY_BYTES, { drainOverflow: true })
      .then(async (text) => {
        let body: unknown
        try {
          body = text.trim() === '' ? {} : JSON.parse(text)
        } catch {
          sendJson(res, 400, badRequest('Request body is not valid JSON.'))
          return
        }
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          sendJson(res, 400, badRequest('Request body must be a JSON object.'))
          return
        }
        // The path names the operation; a body can't choose a different one.
        const parsed = parseProductionOperation({ ...body, operation })
        if (!parsed.ok) {
          sendJson(res, 400, badRequest(parsed.message))
          return
        }
        const response = await run(parsed.operation)
        if (response.ok) {
          sendJson(res, 200, response.body)
        } else if (response.error === 'bad-request') {
          sendJson(res, 400, badRequest(response.message))
        } else {
          sendJson(res, 503, unavailable(response.error, response.message))
        }
      })
      .catch((error: unknown) => {
        if (res.headersSent) return
        if (error instanceof BodyTooLargeError) sendJson(res, 413, badRequest('Request body is too large.'))
        else sendJson(res, 503, unavailable('unavailable', 'The Production operation could not run. Nothing was changed.'))
      })
  }
}

export function productionOpsApiPlugin(options: ProductionOpsMiddlewareOptions): Plugin {
  return {
    name: 'cluecross-workshop-production-ops',
    configureServer(server) {
      server.middlewares.use(productionOpsMiddleware(options))
    },
    configurePreviewServer(server) {
      server.middlewares.use(productionOpsMiddleware(options))
    },
  }
}
