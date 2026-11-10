import { useEffect, useRef, useState } from 'react'
import type {
  MissedDate,
  ProductionBackfillBody,
  ProductionBackfillPreviewBody,
  ProductionPublishBody,
  ProductionPublishPreviewBody,
} from './production/contract'
import type { ProductionClient } from './production/productionClient'
import type { PublishRequest } from './publishing/contract'
import { formatLocalInstant, formatPublishDate, formatReleaseInstant } from './publishing/formatPublication'

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

type DateMode = 'next' | 'missed'

// Publish to Production, by one of two explicit modes: the next available
// date (the normal flow, unchanged) or one missed past date (a backfill).
// Switching mode discards the other mode's preview and confirmation.
export function ProductionPublishSection({ request, client }: ProductionPublishSectionProps) {
  const [mode, setMode] = useState<DateMode>('next')
  return (
    <div className="ws-production-publish">
      <fieldset className="ws-field ws-source">
        <legend>Production date</legend>
        <label>
          <input type="radio" name="ws-production-date-mode" checked={mode === 'next'} onChange={() => setMode('next')} />{' '}
          Next available date
        </label>
        <label>
          <input type="radio" name="ws-production-date-mode" checked={mode === 'missed'} onChange={() => setMode('missed')} />{' '}
          A missed past date
        </label>
      </fieldset>
      {mode === 'next' ? (
        <NextDatePublish request={request} client={client} />
      ) : (
        <MissedDatePublish request={request} client={client} />
      )}
    </div>
  )
}

// The next available date: a deliberate, two-step action. Preview reads the
// Production calendar (never writes) and returns the next date and the
// content fingerprint; Publish sends the same request with that fingerprint
// and the typed puzzle ID, and the server refuses if the content changed.
// Any edit to the request discards the preview.
function NextDatePublish({ request, client }: ProductionPublishSectionProps) {
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

type BackfillPreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; body: ProductionBackfillPreviewBody }
  | { kind: 'failed' }

type BackfillState = { kind: 'idle' } | { kind: 'publishing' } | { kind: 'result'; body: ProductionBackfillBody } | { kind: 'failed' }

/** "November 7 at 10:00 PM ET (November 7 at 7:00 PM PST, your time)" */
function releaseInBothZones(iso: string): string {
  return `${formatReleaseInstant(iso)} (${formatLocalInstant(iso)}, your time)`
}

// A missed past date: publish to one date that already passed with no
// puzzle (a backfill). Find Missed Dates asks the server, at the database
// clock, which dates qualify (never the browser clock); the operator picks
// one, reviews it, and types the puzzle ID. The server re-checks that exact
// date and never substitutes another. The puzzle is released at once.
function MissedDatePublish({ request, client }: ProductionPublishSectionProps) {
  const [preview, setPreview] = useState<BackfillPreviewState>({ kind: 'idle' })
  const [selected, setSelected] = useState<MissedDate | null>(null)
  const [publishState, setPublishState] = useState<BackfillState>({ kind: 'idle' })
  const [confirmText, setConfirmText] = useState('')
  const inFlight = useRef(false)
  const { construction, id, clue } = request

  useEffect(() => {
    setPreview({ kind: 'idle' })
    setSelected(null)
    setPublishState({ kind: 'idle' })
    setConfirmText('')
  }, [construction, id, clue])

  async function runPreview() {
    setPreview({ kind: 'loading' })
    setSelected(null)
    setPublishState({ kind: 'idle' })
    setConfirmText('')
    const result = await client.previewBackfill({ construction, id, clue })
    setPreview(result.ok ? { kind: 'result', body: result.body } : { kind: 'failed' })
  }

  const previewBody = preview.kind === 'result' ? preview.body : null
  const missed = previewBody?.status === 'missed-dates' ? previewBody : null

  async function publish() {
    if (!missed || !selected || inFlight.current || confirmText !== id) return
    inFlight.current = true
    setPublishState({ kind: 'publishing' })
    try {
      const result = await client.backfill({
        request: { construction, id, clue },
        publishDate: selected.publishDate,
        expectedFingerprint: missed.contentFingerprint,
        confirmPuzzleId: confirmText,
      })
      setPublishState(result.ok ? { kind: 'result', body: result.body } : { kind: 'failed' })
      // The preview no longer describes Production: check again before another try.
      if (result.ok && (result.body.status === 'content-changed' || result.body.status === 'ineligible')) {
        setPreview({ kind: 'idle' })
        setSelected(null)
        setConfirmText('')
      }
    } finally {
      inFlight.current = false
    }
  }

  const done = publishState.kind === 'result' && publishState.body.status === 'created' ? publishState.body : null
  if (done) {
    const { publication } = done
    return (
      <div className="ws-publish ws-production" role="status">
        <p className="ws-publish__outcome">
          <strong>
            Published to Production and released: “{clue.trim()}” ({publication.puzzleId}) —{' '}
            {formatPublishDate(publication.publishDate)}
          </strong>
        </p>
        <p className="ws-muted">
          Its release time, {releaseInBothZones(publication.releaseInstant)}, has already passed, so players can open it now.
          The Archive lists it within about a minute.
        </p>
        <p className="ws-muted ws-fingerprint">Fingerprint {publication.contentFingerprint}</p>
      </div>
    )
  }

  const publishing = publishState.kind === 'publishing'

  return (
    <div className="ws-publish ws-production">
      <p className="ws-muted">
        Fills a date that already passed with no puzzle. The puzzle is released immediately; no other puzzle moves.
      </p>
      <button type="button" className="ws-button ws-button--secondary" onClick={() => void runPreview()} disabled={preview.kind === 'loading' || publishing}>
        {preview.kind === 'loading' ? 'Checking Production…' : previewBody ? 'Check Again' : 'Find Missed Dates'}
      </button>

      <div role="status" className="ws-publish__preview">
        {preview.kind === 'failed' && <p className="ws-publish__problem">Couldn’t reach the Production operations server.</p>}
        {previewBody && <BackfillPreviewMessage body={previewBody} />}
      </div>

      {missed && missed.dates.length > 0 && (
        <fieldset className="ws-field ws-missed-dates" disabled={publishing}>
          <legend>Missed date</legend>
          <p className="ws-muted">Only dates with no puzzle whose release time has passed are listed.</p>
          {missed.dates.map((date) => (
            <label key={date.publishDate}>
              <input
                type="radio"
                name="ws-production-missed-date"
                checked={selected?.publishDate === date.publishDate}
                onChange={() => {
                  setSelected(date)
                  setPublishState({ kind: 'idle' })
                }}
              />{' '}
              <span>
                {formatPublishDate(date.publishDate)}
                <span className="ws-missed-dates__release">Released {releaseInBothZones(date.releaseInstant)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {missed && selected && (
        <div className="ws-publish__confirm" role="group" aria-labelledby="ws-backfill-confirm-heading">
          <p id="ws-backfill-confirm-heading">
            <strong>Publish to a missed date</strong>
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
              <dt>Missed date</dt>
              <dd>{formatPublishDate(selected.publishDate)}</dd>
            </div>
            <div>
              <dt>Release time (Eastern)</dt>
              <dd>{formatReleaseInstant(selected.releaseInstant)}, the evening before</dd>
            </div>
            <div>
              <dt>Your time</dt>
              <dd>{formatLocalInstant(selected.releaseInstant)}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd>Passed on the server</dd>
            </div>
            <div>
              <dt>Fingerprint</dt>
              <dd className="ws-fingerprint">{missed.contentFingerprint}</dd>
            </div>
          </dl>
          <p>
            <strong>This puzzle becomes public immediately.</strong> Its release time has already passed, so players can
            open it as soon as it’s published. No other puzzle changes.
          </p>
          <div className="ws-field">
            <label htmlFor="ws-backfill-confirm">Type the puzzle ID ({id}) to confirm</label>
            <input
              id="ws-backfill-confirm"
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={publishing}
            />
          </div>
          <button type="button" className="ws-button ws-button--production" onClick={() => void publish()} disabled={confirmText !== id || publishing}>
            {publishing ? 'Publishing to Production…' : `Publish to ${formatPublishDate(selected.publishDate)}`}
          </button>
        </div>
      )}

      <div role="status" className="ws-publish__result">
        {publishState.kind === 'failed' && <p className="ws-publish__problem">{UNCERTAIN}</p>}
        {publishState.kind === 'result' && <BackfillMessage body={publishState.body} />}
      </div>
    </div>
  )
}

const MOVE_HINT =
  'If it’s still scheduled and belongs on a missed date, remove it in the Production Schedule first, then come back and publish it to that date. Released puzzles never move.'

const INELIGIBLE_TEXT: Record<Extract<ProductionBackfillBody, { status: 'ineligible' }>['reason'], (date: string) => string> = {
  'no-history': () => 'Nothing has been published to Production yet, so there is no missed date to fill.',
  'before-first': (date) => `${date} is before the first Production puzzle, so it can’t be filled.`,
  'not-released': (date) => `${date} hasn’t reached its release time yet, so it isn’t a missed date. Use Next available date instead.`,
  occupied: (date) => `${date} already has a puzzle.`,
}

function BackfillPreviewMessage({ body }: { body: ProductionBackfillPreviewBody }) {
  switch (body.status) {
    case 'missed-dates':
      if (body.firstPublishDate === null) {
        return <p>Nothing has been published to Production yet, so there are no past dates to fill.</p>
      }
      if (body.dates.length === 0) {
        return (
          <p>
            <strong>No missed dates.</strong> Every date from {formatPublishDate(body.firstPublishDate)} whose release time
            has passed already has a puzzle.
          </p>
        )
      }
      return null // listed as choices below
    case 'existing':
      return (
        <p>
          <strong>Already in the Production schedule for {formatPublishDate(body.publication.publishDate)}.</strong> {MOVE_HINT}
        </p>
      )
    case 'conflict':
      return <p className="ws-publish__problem">{body.message}</p>
    case 'invalid':
      return <p className="ws-publish__problem">The Production server rejected this puzzle. Fix the validation errors above.</p>
    case 'unavailable':
    case 'bad-request':
    case 'production-unavailable':
      return <p className="ws-publish__problem">{body.message}</p>
  }
}

function BackfillMessage({ body }: { body: ProductionBackfillBody }) {
  switch (body.status) {
    case 'created':
      return null
    case 'existing':
      return (
        <p className="ws-publish__problem">
          Nothing was published: this puzzle is already in the Production schedule for{' '}
          {formatPublishDate(body.publication.publishDate)}. {MOVE_HINT}
        </p>
      )
    case 'ineligible':
      return (
        <p className="ws-publish__problem">
          Nothing was published. {INELIGIBLE_TEXT[body.reason](formatPublishDate(body.publishDate))} Find missed dates
          again to see what’s available now.
        </p>
      )
    case 'content-changed':
    case 'conflict':
    case 'busy':
    case 'unavailable':
    case 'bad-request':
      return <p className="ws-publish__problem">{body.message}</p>
    case 'invalid':
      return <p className="ws-publish__problem">The Production server rejected this puzzle. Nothing was published.</p>
    case 'production-unavailable':
      return <p className="ws-publish__problem">{body.reason === 'uncertain' ? UNCERTAIN : body.message}</p>
  }
}
