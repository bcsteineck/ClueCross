// Vite plugin that mounts POST /api/sourcing on the Workshop's own server
// (`npm run workshop` and `vite preview`). It runs in Node only: nothing
// here is imported by browser code, so neither this file, the Anthropic
// adapter, nor the configured credential can reach a browser bundle. The
// static `workshop:build` output has no server, so live sourcing is only
// available while the Workshop runs locally.

import type { Connect, Plugin } from 'vite'
import { readBody, sendJson } from './http'
import { handleSourcingRequest } from './sourcingEndpoint'
import type { SourcingServerConfig } from './sourcingEndpoint'

export const SOURCING_ENDPOINT_PATH = '/api/sourcing'
const MAX_BODY_BYTES = 16 * 1024

export function sourcingMiddleware(getConfig: () => SourcingServerConfig): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.url?.split('?')[0] !== SOURCING_ENDPOINT_PATH) return next()
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: { category: 'request', message: 'Use POST.' } })
      return
    }
    readBody(req, MAX_BODY_BYTES)
      .then(async (text) => {
        let body: unknown
        try {
          body = JSON.parse(text)
        } catch {
          sendJson(res, 400, { error: { category: 'request', message: 'Request body is not valid JSON.' } })
          return
        }
        const result = await handleSourcingRequest(body, getConfig())
        sendJson(res, result.status, result.body)
      })
      .catch(() => {
        if (!res.headersSent) sendJson(res, 400, { error: { category: 'request', message: 'Request body could not be read.' } })
      })
  }
}

export function sourcingApiPlugin(getConfig: () => SourcingServerConfig): Plugin {
  return {
    name: 'cluecross-workshop-sourcing-api',
    configureServer(server) {
      server.middlewares.use(sourcingMiddleware(getConfig))
    },
    configurePreviewServer(server) {
      server.middlewares.use(sourcingMiddleware(getConfig))
    },
  }
}
