// Small HTTP helpers shared by the Workshop's local server endpoints
// (sourcing, publishing). Node only; never imported by browser code.

import type { IncomingMessage, ServerResponse } from 'node:http'

export class BodyTooLargeError extends Error {
  constructor() {
    super('too large')
    this.name = 'BodyTooLargeError'
  }
}

/**
 * Reads the request body as UTF-8, rejecting with BodyTooLargeError past
 * `maxBytes`. By default the oversized request is destroyed (the sourcing
 * endpoint's behavior); with `drainOverflow` the rest is read and discarded
 * instead, so the caller can still send a 413 response.
 */
export function readBody(req: IncomingMessage, maxBytes: number, options: { drainOverflow?: boolean } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    let overflowed = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      if (overflowed) return
      size += chunk.length
      if (size > maxBytes) {
        overflowed = true
        chunks.length = 0
        reject(new BodyTooLargeError())
        if (!options.drainOverflow) req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

/** True when the request declares a JSON body (parameters such as charset allowed). */
export function hasJsonContentType(req: IncomingMessage): boolean {
  return /^application\/json\s*(;|$)/i.test(header(req, 'content-type')?.trim() ?? '')
}

/**
 * Local CSRF hardening, not authentication: rejects browser requests that
 * declare another origin. Browsers send Origin on POST and Sec-Fetch-Site on
 * fetches; another localhost port is "same-site" but not same-origin, so it
 * is rejected too. Requests with neither header (non-browser clients such
 * as curl or tests) are allowed — they can't carry a victim's browser
 * context.
 */
export function isSameOriginRequest(req: IncomingMessage): boolean {
  const fetchSite = header(req, 'sec-fetch-site')
  if (fetchSite !== undefined && fetchSite !== 'same-origin') return false

  const origin = header(req, 'origin')
  if (origin === undefined) return true
  const host = header(req, 'host')
  if (!host) return false
  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.host === host
  } catch {
    return false
  }
}
