// Vite plugin that mounts the Workshop's local publishing endpoints on its
// own server (`npm run workshop` and `vite preview`), mirroring the
// sourcing plugin: transport checks here, publishing behavior in the pure
// handlers (publishingEndpoint.ts). Node only; nothing here reaches a
// browser bundle, and the static `workshop:build` output has no server.
//
// The PublicationStore is injected through getStore. Until the Neon store
// exists (Phase 4) the Workshop supplies none, so both endpoints answer
// `not-configured` — nothing is ever reported as published from memory.
//
// Transport hardening (local CSRF protection, not authentication): POST
// only, a JSON content type, a 64 KB body limit, and same-origin requests.

import type { Connect, Plugin } from 'vite'
import { PUBLISHING_PREVIEW_PATH, PUBLISHING_PUBLISH_PATH } from '../../src/publishing/contract'
import { BodyTooLargeError, hasJsonContentType, isSameOriginRequest, readBody, sendJson } from '../http'
import { handlePreviewRequest, handlePublishRequest } from './publishingEndpoint'
import type { PublicationStore } from './publicationStore'

export const MAX_PUBLISHING_BODY_BYTES = 64 * 1024

const HANDLERS = {
  [PUBLISHING_PREVIEW_PATH]: handlePreviewRequest,
  [PUBLISHING_PUBLISH_PATH]: handlePublishRequest,
} as const

const badRequest = (message: string) => ({ status: 'bad-request', message })

export function publishingMiddleware(getStore: () => PublicationStore | undefined): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (path !== PUBLISHING_PREVIEW_PATH && path !== PUBLISHING_PUBLISH_PATH) return next()
    const handler = HANDLERS[path]

    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      sendJson(res, 405, badRequest('Use POST.'))
      return
    }
    if (!isSameOriginRequest(req)) {
      sendJson(res, 403, badRequest('Cross-origin publishing requests are not allowed.'))
      return
    }
    if (!hasJsonContentType(req)) {
      sendJson(res, 415, badRequest('Send the request as application/json.'))
      return
    }

    readBody(req, MAX_PUBLISHING_BODY_BYTES, { drainOverflow: true })
      .then(async (text) => {
        let body: unknown
        try {
          body = JSON.parse(text)
        } catch {
          sendJson(res, 400, badRequest('Request body is not valid JSON.'))
          return
        }
        const result = await handler(body, { store: getStore() })
        sendJson(res, result.status, result.body)
      })
      .catch((error: unknown) => {
        if (res.headersSent) return
        if (error instanceof BodyTooLargeError) sendJson(res, 413, badRequest('Request body is too large.'))
        else sendJson(res, 400, badRequest('Request body could not be read.'))
      })
  }
}

export function publishingApiPlugin(getStore: () => PublicationStore | undefined): Plugin {
  return {
    name: 'cluecross-workshop-publishing-api',
    configureServer(server) {
      server.middlewares.use(publishingMiddleware(getStore))
    },
    configurePreviewServer(server) {
      server.middlewares.use(publishingMiddleware(getStore))
    },
  }
}
