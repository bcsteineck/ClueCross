// Transport glue for the pure puzzle API handlers (puzzleApi.ts): Web
// Request/Response for the Vercel Functions in api/, and Node's
// IncomingMessage/ServerResponse for the local Vite dev server. No API
// behavior lives here — only translation.

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readerFromEnvironment } from './neonReleasedPuzzleReader.js'
import type { ApiRequest, ApiResponse, PuzzleApiDeps } from './puzzleApi'
import { handleCalendarRequest, handlePuzzleRequest } from './puzzleApi.js'

export type PuzzleApiHandler = (request: ApiRequest, deps: PuzzleApiDeps) => Promise<ApiResponse>

export const PUZZLE_API_ROUTES: Record<string, PuzzleApiHandler> = {
  '/api/calendar': handleCalendarRequest,
  '/api/puzzle': handlePuzzleRequest,
}

export function toWebResponse(result: ApiResponse): Response {
  return new Response(JSON.stringify(result.body), { status: result.status, headers: result.headers })
}

/** A Vercel Function `fetch` handler; the reader comes from PUZZLES_READ_DATABASE_URL only. */
export function webHandler(handler: PuzzleApiHandler, getEnv: () => Record<string, string | undefined>) {
  return async (request: Request): Promise<Response> =>
    toWebResponse(await handler({ method: request.method, url: request.url }, { reader: readerFromEnvironment(getEnv()) }))
}

/** Node middleware for the local Vite dev/preview server, serving the same routes. */
export function puzzleApiMiddleware(getEnv: () => Record<string, string | undefined>) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const handler = PUZZLE_API_ROUTES[req.url?.split('?')[0] ?? '']
    if (!handler) {
      next()
      return
    }
    handler({ method: req.method ?? 'GET', url: req.url ?? '/' }, { reader: readerFromEnvironment(getEnv()) })
      .then((result) => {
        res.statusCode = result.status
        for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value)
        res.end(JSON.stringify(result.body))
      })
      .catch(() => {
        // The handlers never reject; this is a last-resort guard.
        if (!res.headersSent) {
          res.statusCode = 503
          res.setHeader('Cache-Control', 'no-store')
          res.end()
        }
      })
  }
}
