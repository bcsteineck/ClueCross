import { useEffect, useRef, useState } from 'react'
import type { ProductionPublishBody, ProductionPublishPreviewBody } from './production/contract'
import type { ProductionClient } from './production/productionClient'
import type { PublishRequest } from './publishing/contract'
import { formatPublishDate, formatReleaseInstant } from './publishing/formatPublication'

interface ProductionPublishSectionProps {
  /** Exactly the request the dev Publish section sends: the approved Final Puzzle. */
  request: PublishRequest
  client: ProductionClient
}

type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; body: ProductionPublishPreviewBody }
  | { kind: 'failed' }

type PublishState = { kind: 'idle' } | { kind: 'publishing' } | { kind: 'result'; body: ProductionPublishBody } | { kind: 'failed' }

const UNCERTAIN =
  'The Production request didn’t complete, so it may or may not have been published. Check the Production Schedule. Publishing again is safe: identical content is never published twice.'

// Publish to Production: a deliberate, two-step action. Preview reads the
// Production calendar (never writes) and returns the next date and the
// content fingerprint; Publish sends the same request with that fingerprint
// and the typed puzzle ID, and the server refuses if the content changed.
// Any edit to the request discards the preview.
export function ProductionPublishSection({ request, client }: ProductionPublishSectionProps) {
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' })
  const [publishState, setPublishState] = useState<PublishState>({ kind: 'idle' })
  const [confirmText, setConfirmText] = useState('')
  const inFlight = useRef(false)
  const { construction, id, clue } = request

  useEffect(() => {
    setPreview({ kind: 'idle' })
    setPublishState({ kind: 'idle' })
    setConfirmText('')
  }, [construction, id, clue])

  async function runPreview() {
    setPreview({ kind: 'loading' })
    setPublishState({ kind: 'idle' })
    setConfirmText('')
    const result = await client.previewPublish({ construction, id, clue })
    setPreview(result.ok ? { kind: 'result', body: result.body } : { kind: 'failed' })
  }

  const previewBody = preview.kind === 'result' ? preview.body : null
  const estimate = previewBody?.status === 'estimate' ? previewBody.estimate : null
  const published =
    publishState.kind === 'result' && (publishState.body.status === 'created' || publishState.body.status === 'existing')
      ? publishState.body
      : null

  async function publish() {
    if (!estimate || inFlight.current || confirmText !== id) return
    inFlight.current = true
    setPublishState({ kind: 'publishing' })
    try {
      const result = await client.publish({
        request: { construction, id, clue },
        expectedFingerprint: estimate.contentFingerprint,
        confirmPuzzleId: confirmText,
      })
      setPublishState(result.ok ? { kind: 'result', body: result.body } : { kind: 'failed' })
      if (result.ok && result.body.status === 'content-changed') setPreview({ kind: 'idle' })
    } finally {
      inFlight.current = false
    }
  }

  if (published && (published.status === 'created' || published.status === 'existing')) {
    const { publication } = published
    return (
      <div className="ws-publish ws-production" role="status">
        <p className="ws-publish__outcome">
          <strong>
            {published.status === 'created' ? 'Published to Production' : 'Already in the Production schedule'}: “{clue.trim()}”
            ({publication.puzzleId}) — {formatPublishDate(publication.publishDate)}
          </strong>
        </p>
        <p className="ws-muted">Releases {formatReleaseInstant(publication.releaseInstant)}.</p>
        <p className="ws-muted ws-fingerprint">Fingerprint {publication.contentFingerprint}</p>
      </div>
    )
  }

  const publishing = publishState.kind === 'publishing'
  const cellCount = Object.keys(construction.cells).length

  return (
    <div className="ws-publish ws-production">
      <p className="ws-muted">
        Adds this puzzle to the live ClueCross calendar. The server assigns the next date; released puzzles never change.
      </p>
      <button type="button" className="ws-button ws-button--secondary" onClick={() => void runPreview()} disabled={preview.kind === 'loading' || publishing}>
        {preview.kind === 'loading' ? 'Checking Production…' : estimate ? 'Preview Again' : 'Production Preview'}
      </button>

      <div role="status" className="ws-publish__preview">
        {preview.kind === 'failed' && <p className="ws-publish__problem">Couldn’t reach the Production operations server.</p>}
        {previewBody && <ProductionPreviewMessage body={previewBody} />}
      </div>

      {estimate && (
        <div className="ws-publish__confirm" role="group" aria-labelledby="ws-production-confirm-heading">
          <p id="ws-production-confirm-heading">
            <strong>Production preview</strong>
          </p>
          <dl className="ws-production__facts">
            <div>
              <dt>Puzzle ID</dt>
              <dd>{id}</dd>
            </div>
            <div>
              <dt>Clue</dt>
              <dd>{clue.trim()}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {construction.width} × {construction.height}
              </dd>
            </div>
            <div>
              <dt>Cells</dt>
              <dd>{cellCount}</dd>
            </div>
            <div>
              <dt>Answers</dt>
              <dd>{construction.placedAnswers.length}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>Passed on the server</dd>
            </div>
            <div>
              <dt>Next Production date</dt>
              <dd>{formatPublishDate(estimate.publishDate)}</dd>
            </div>
            <div>
              <dt>Releases</dt>
              <dd>{formatReleaseInstant(estimate.releaseInstant)}</dd>
            </div>
            <div>
              <dt>Fingerprint</dt>
              <dd className="ws-fingerprint">{estimate.contentFingerprint}</dd>
            </div>
          </dl>
          <p className="ws-muted">
            This enters the Production schedule. The date is an estimate until the server assigns it at publish time.
          </p>
          <div className="ws-field">
            <label htmlFor="ws-production-confirm">Type the puzzle ID ({id}) to confirm</label>
            <input
              id="ws-production-confirm"
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={publishing}
            />
          </div>
          <button type="button" className="ws-button ws-button--production" onClick={() => void publish()} disabled={confirmText !== id || publishing}>
            {publishing ? 'Publishing to Production…' : 'Publish to Production'}
          </button>
        </div>
      )}

      <div role="status" className="ws-publish__result">
        {publishState.kind === 'failed' && <p className="ws-publish__problem">{UNCERTAIN}</p>}
        {publishState.kind === 'result' && <ProductionPublishMessage body={publishState.body} />}
      </div>
    </div>
  )
}

function ProductionPreviewMessage({ body }: { body: ProductionPublishPreviewBody }) {
  switch (body.status) {
    case 'estimate':
      return null // shown in the confirmation panel
    case 'existing':
      return (
        <p>
          <strong>Already in the Production schedule for {formatPublishDate(body.publication.publishDate)}.</strong> Nothing new to publish.
        </p>
      )
    case 'conflict':
      return <p className="ws-publish__problem">{body.message}</p>
    case 'invalid':
      return <p className="ws-publish__problem">The Production server rejected this puzzle. Fix the validation errors above.</p>
    case 'bad-request':
    case 'unavailable':
    case 'not-configured':
    case 'production-unavailable':
      return <p className="ws-publish__problem">{body.message}</p>
  }
}

function ProductionPublishMessage({ body }: { body: ProductionPublishBody }) {
  switch (body.status) {
    case 'created':
    case 'existing':
      return null
    case 'content-changed':
    case 'conflict':
    case 'busy':
    case 'unavailable':
    case 'bad-request':
    case 'not-configured':
      return <p className="ws-publish__problem">{body.message}</p>
    case 'invalid':
      return <p className="ws-publish__problem">The Production server rejected this puzzle. Nothing was published.</p>
    case 'production-unavailable':
      return <p className="ws-publish__problem">{body.reason === 'uncertain' ? UNCERTAIN : body.message}</p>
  }
}
