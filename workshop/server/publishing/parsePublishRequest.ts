// Shape validation of an untrusted publish/preview request body. It checks
// only structure — that `construction`, `id`, and `clue` have the types the
// Final Puzzle preparation expects — and rebuilds a clean copy, so unknown
// fields (including any browser-assembled `puzzle`/`layout`) are dropped and
// never reach assembly. Whether the content is a valid puzzle is decided
// afterward by the existing Final Puzzle validation, not here.

import type { PublishRequest } from '../../src/publishing/contract'
import { ShapeError, parseConstruction, requireRecord, requireString } from '../../src/publishing/parseConstruction'

export type ParsePublishRequestResult = { ok: true; request: PublishRequest } | { ok: false; message: string }

export function parsePublishRequest(body: unknown): ParsePublishRequestResult {
  try {
    const record = requireRecord(body, 'Request body')
    return {
      ok: true,
      request: {
        construction: parseConstruction(record.construction),
        id: requireString(record.id, 'id'),
        clue: requireString(record.clue, 'clue'),
      },
    }
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, message: error.message }
    throw error
  }
}
