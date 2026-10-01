import { useEffect, useRef, useState } from 'react'
import type {
  PreviewResponseBody,
  PublicationSummary,
  PublishRequest,
  PublishResponseBody,
  PublishValidationErrors,
} from './publishing/contract'
import { formatPublishDate, formatReleaseInstant } from './publishing/formatPublication'
import type { PublishingClient } from './publishing/publishingClient'

/** A durable publication confirmed by the server for this Final Puzzle. */
export interface PublishedState {
  kind: 'created' | 'existing'
  publication: PublicationSummary
}

interface PublishSectionProps {
  request: PublishRequest
  publisher: PublishingClient
  published: PublishedState | null
  onPublished: (state: PublishedState) => void
}

export const PREVIEW_DELAY_MS = 300

type PreviewState = { kind: 'loading' } | { kind: 'result'; body: PreviewResponseBody } | { kind: 'failed' }

type PublishState =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'publishing' }
  | { kind: 'result'; body: PublishResponseBody }
  | { kind: 'failed' }

const IRREVERSIBLE = 'Published puzzles can’t be edited, rescheduled, or removed in v1.'
const NOT_CONFIGURED =
  'Publishing isn’t configured on this Workshop server, so nothing can be published yet. Developer export below still works.'

function conflictMessage(existing: { puzzleId: string; publishDate: string }): string {
  return (
    `Puzzle ID “${existing.puzzleId}” is already scheduled for ${formatPublishDate(existing.publishDate)} with ` +
    `different content. Published puzzles can’t be changed; choose a new ID.`
  )
}

function ValidationErrorList({ errors }: { errors: PublishValidationErrors }) {
  const items = [...errors.metadata.map((issue) => issue.message), ...errors.production, ...errors.export]
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

// Statuses after which publishing this exact input can't succeed.
const BLOCKING_PREVIEW = new Set(['conflict', 'invalid', 'bad-request', 'not-configured'])

// Publish: the normal, durable way to schedule a valid Final Puzzle. The
// preview date is an estimate; the server assigns the real date. A new
// publication needs explicit confirmation, and a ref guard stops a second
// request before React re-renders the disabled button.
export function PublishSection({ request, publisher, published, onPublished }: PublishSectionProps) {
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' })
  const [publishState, setPublishState] = useState<PublishState>({ kind: 'idle' })
  const inFlight = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const publishButtonRef = useRef<HTMLButtonElement>(null)
  const { construction, id, clue } = request

  // Debounced preview for the current inputs; a stale response is dropped.
  useEffect(() => {
    if (published) return
    let current = true
    setPreview({ kind: 'loading' })
    setPublishState((state) => (state.kind === 'publishing' ? state : { kind: 'idle' }))
    const timer = setTimeout(() => {
      void publisher.preview({ construction, id, clue }).then((result) => {
        if (current) setPreview(result.ok ? { kind: 'result', body: result.body } : { kind: 'failed' })
      })
    }, PREVIEW_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [publisher, construction, id, clue, published])

  useEffect(() => {
    if (publishState.kind === 'confirming') cancelRef.current?.focus()
  }, [publishState.kind])

  async function publish() {
    if (inFlight.current) return
    inFlight.current = true
    setPublishState({ kind: 'publishing' })
    try {
      const result = await publisher.publish({ construction, id, clue })
      if (result.ok && (result.body.status === 'created' || result.body.status === 'existing')) {
        onPublished({ kind: result.body.status, publication: result.body.publication })
      }
      setPublishState(result.ok ? { kind: 'result', body: result.body } : { kind: 'failed' })
    } finally {
      inFlight.current = false
    }
  }

  function cancel() {
    setPublishState({ kind: 'idle' })
    // Wait for the button to re-render before returning focus to it.
    setTimeout(() => publishButtonRef.current?.focus(), 0)
  }

  if (published) {
    const { publication } = published
    return (
      <div className="ws-publish" role="status">
        <p className="ws-publish__outcome">
          <strong>
            {published.kind === 'created' ? 'Scheduled for' : 'Already scheduled for'}{' '}
            {formatPublishDate(publication.publishDate)}
          </strong>
        </p>
        <p className="ws-muted">Releases {formatReleaseInstant(publication.releaseInstant)}.</p>
        <p className="ws-muted">{IRREVERSIBLE} The ID and clue are locked.</p>
      </div>
    )
  }

  const previewBody = preview.kind === 'result' ? preview.body : null
  const estimate = previewBody?.status === 'estimate' ? previewBody.estimate : null
  const alreadyPublished = previewBody?.status === 'existing'
  const blocked = previewBody !== null && BLOCKING_PREVIEW.has(previewBody.status)
  const publishing = publishState.kind === 'publishing'
  const confirming = publishState.kind === 'confirming' || (publishing && !alreadyPublished)
  const title = clue.trim() || id.trim()

  return (
    <div className="ws-publish">
      <div role="status" className="ws-publish__preview">
        {preview.kind === 'loading' && <p className="ws-muted">Checking the publishing schedule…</p>}
        {preview.kind === 'failed' && <p className="ws-muted">Couldn’t check the publishing schedule right now.</p>}
        {previewBody?.status === 'estimate' && (
          <>
            <p>
              <strong>Expected: Scheduled for {formatPublishDate(previewBody.estimate.publishDate)}</strong>
            </p>
            <p className="ws-muted">Releases {formatReleaseInstant(previewBody.estimate.releaseInstant)}.</p>
            <p className="ws-muted">Estimate only. The final date is assigned when you publish.</p>
          </>
        )}
        {previewBody?.status === 'existing' && (
          <p>
            <strong>Already scheduled for {formatPublishDate(previewBody.publication.publishDate)}.</strong> Confirm
            to lock this Final Puzzle to that publication; nothing new is published.
          </p>
        )}
        {previewBody?.status === 'conflict' && <p className="ws-publish__problem">{conflictMessage(previewBody.existing)}</p>}
        {previewBody?.status === 'not-configured' && <p className="ws-publish__problem">{NOT_CONFIGURED}</p>}
        {previewBody?.status === 'unavailable' && (
          <p className="ws-muted">Couldn’t check the publishing schedule right now.</p>
        )}
        {(previewBody?.status === 'bad-request') && <p className="ws-publish__problem">{previewBody.message}</p>}
        {previewBody?.status === 'invalid' && (
          <div className="ws-publish__problem">
            <p>The publishing server rejected this puzzle:</p>
            <ValidationErrorList errors={previewBody.errors} />
          </div>
        )}
      </div>

      {confirming ? (
        <div className="ws-publish__confirm" role="group" aria-labelledby="ws-publish-confirm-heading">
          <p id="ws-publish-confirm-heading">
            <strong>
              Publish “{title}”{estimate ? ` for ${formatPublishDate(estimate.publishDate)}` : ''}?
            </strong>
          </p>
          <p className="ws-muted">
            {estimate ? 'That date is an estimate; the server assigns the final date when you publish. ' : ''}
            {IRREVERSIBLE}
          </p>
          <div className="ws-publish__actions">
            <button type="button" className="ws-button" onClick={() => void publish()} disabled={publishing}>
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
            <button
              type="button"
              className="ws-button ws-button--secondary"
              onClick={cancel}
              disabled={publishing}
              ref={cancelRef}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="ws-button"
          ref={publishButtonRef}
          disabled={blocked || publishing}
          onClick={() => (alreadyPublished ? void publish() : setPublishState({ kind: 'confirming' }))}
        >
          {publishing ? 'Publishing…' : alreadyPublished ? 'Confirm Existing Publication' : 'Publish Puzzle'}
        </button>
      )}

      <div role="status" className="ws-publish__result">
        {publishState.kind === 'failed' && (
          <p className="ws-publish__problem">
            The publish request didn’t complete, so it may or may not have been published. Publishing again is safe:
            an identical puzzle is never published twice.
          </p>
        )}
        {publishState.kind === 'result' && <PublishResultMessage body={publishState.body} />}
      </div>
    </div>
  )
}

function PublishResultMessage({ body }: { body: PublishResponseBody }) {
  switch (body.status) {
    case 'created':
    case 'existing':
      return null // shown by the published view
    case 'conflict':
      return <p className="ws-publish__problem">{conflictMessage(body.existing)}</p>
    case 'invalid':
      return (
        <div className="ws-publish__problem">
          <p>The publishing server rejected this puzzle:</p>
          <ValidationErrorList errors={body.errors} />
        </div>
      )
    case 'busy':
      return <p className="ws-publish__problem">Publishing is busy. Nothing was published; try again.</p>
    case 'not-configured':
      return <p className="ws-publish__problem">{NOT_CONFIGURED}</p>
    case 'unavailable':
    case 'bad-request':
      return <p className="ws-publish__problem">{body.message}</p>
  }
}
