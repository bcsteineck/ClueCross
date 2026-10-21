// Vite plugin that serves the working draft (GET/PUT /api/draft) from the
// Workshop's own server, in both `npm run workshop` and Production-
// operations mode. Both modes resolve the same directory, so they share one
// draft; the file's revision check keeps either from overwriting the other.
// Node only; the player app never loads this plugin.
//
// Transport hardening (local, not authentication): loopback clients only,
// same-origin browser requests, GET and PUT only, a JSON body for PUT, and
// a 1 MB limit. The draft directory itself is never served as a static file,
// even though it sits inside the Workshop's Vite root.

import type { Connect, Plugin } from 'vite'
import { DRAFT_PATH } from '../../src/draft/contract'
import { BodyTooLargeError, hasJsonContentType, isSameOriginRequest, readBody, sendJson } from '../http'
import { handleDraftLoad, handleDraftSave } from './draftEndpoint'
import type { DraftStore } from './draftStore'

export const MAX_DRAFT_BODY_BYTES = 1024 * 1024
/** The draft directory's name; any request path through it is refused. */
export const DRAFT_DIRECTORY_NAME = '.local'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

const badRequest = (message: string) => ({ status: 'bad-request', message })

function decodedPath(url: string | undefined): string {
  const pathname = (url ?? '').split('?')[0]
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

export function draftMiddleware(store: DraftStore): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = decodedPath(req.url)
    // Covers the Vite root and /@fs/ paths alike.
    if (path.split('/').includes(DRAFT_DIRECTORY_NAME)) {
      sendJson(res, 404, badRequest('Not found.'))
      return
    }
    if (path !== DRAFT_PATH) return next()

    if (!LOOPBACK.has(req.socket?.remoteAddress ?? '')) {
      sendJson(res, 403, badRequest('The working draft is only available on this computer.'))
      return
    }
    if (!isSameOriginRequest(req)) {
      sendJson(res, 403, badRequest('Cross-origin working-draft requests are not allowed.'))
      return
    }
    if (req.method === 'GET') {
      void handleDraftLoad(store).then((result) => sendJson(res, result.status, result.body))
      return
    }
    if (req.method !== 'PUT') {
      res.setHeader('allow', 'GET, PUT')
      sendJson(res, 405, badRequest('Use GET or PUT.'))
      return
    }
    if (!hasJsonContentType(req)) {
      sendJson(res, 415, badRequest('Send the request as application/json.'))
      return
    }

    readBody(req, MAX_DRAFT_BODY_BYTES, { drainOverflow: true })
      .then(async (text) => {
        let body: unknown
        try {
          body = JSON.parse(text)
        } catch {
          sendJson(res, 400, badRequest('Request body is not valid JSON.'))
          return
        }
        const result = await handleDraftSave(body, store)
        sendJson(res, result.status, result.body)
      })
      .catch((error: unknown) => {
        if (res.headersSent) return
        if (error instanceof BodyTooLargeError) sendJson(res, 413, badRequest('Request body is too large.'))
        else sendJson(res, 400, badRequest('Request body could not be read.'))
      })
  }
}

export function draftApiPlugin(getStore: () => DraftStore): Plugin {
  return {
    name: 'cluecross-workshop-draft-api',
    configureServer(server) {
      server.middlewares.use(draftMiddleware(getStore()))
    },
    configurePreviewServer(server) {
      server.middlewares.use(draftMiddleware(getStore()))
    },
  }
}
