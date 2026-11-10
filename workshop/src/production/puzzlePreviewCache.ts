import type { ProductionPuzzlePreviewBody, PuzzlePreview } from './contract'
import type { ProductionResult } from './productionClient'

type PreviewResult = ProductionResult<ProductionPuzzlePreviewBody>

// Previews fetched in this Workshop session, kept in memory only and gone
// when the page closes or reloads (never written to any browser store).
// Keyed by puzzle ID and content fingerprint: content with a given
// fingerprint never changes, and a new fingerprint for the same ID replaces
// the old entry, so a stale preview is never shown. Only successful previews
// are kept. A request already in flight for the same key is shared, so
// reopening (or React's development double mount) never starts a second
// Production process.
export interface PuzzlePreviewCache {
  get(puzzleId: string, contentFingerprint: string): PuzzlePreview | undefined
  load(puzzleId: string, contentFingerprint: string, fetchPreview: () => Promise<PreviewResult>): Promise<PreviewResult>
}

export function createPuzzlePreviewCache(): PuzzlePreviewCache {
  const previews = new Map<string, PuzzlePreview>()
  const inFlight = new Map<string, Promise<PreviewResult>>()
  return {
    get(puzzleId, contentFingerprint) {
      const preview = previews.get(puzzleId)
      return preview?.contentFingerprint === contentFingerprint ? preview : undefined
    },
    load(puzzleId, contentFingerprint, fetchPreview) {
      const key = `${puzzleId}:${contentFingerprint}`
      const pending = inFlight.get(key)
      if (pending) return pending
      const request = fetchPreview()
        .then((result) => {
          if (result.ok && result.body.status === 'ok') {
            const { preview } = result.body
            if (preview.puzzleId === puzzleId && preview.contentFingerprint === contentFingerprint) previews.set(puzzleId, preview)
          }
          return result
        })
        .finally(() => inFlight.delete(key))
      inFlight.set(key, request)
      return request
    },
  }
}
