import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CandidateBoard } from './CandidateBoard'
import type { ProductionPuzzlePreviewBody, PuzzlePreview, ScheduleEntry } from './production/contract'
import type { ProductionClient } from './production/productionClient'
import type { PuzzlePreviewCache } from './production/puzzlePreviewCache'
import { formatPublishDate, formatReleaseInstant } from './publishing/formatPublication'

interface PuzzlePreviewDialogProps {
  entry: ScheduleEntry
  client: ProductionClient
  cache: PuzzlePreviewCache
  onClose: () => void
}

type PreviewFailure = Exclude<ProductionPuzzlePreviewBody, { status: 'ok' }>

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'ready'; preview: PuzzlePreview }
  /** body is null when the request didn't complete at all. */
  | { kind: 'failed'; body: PreviewFailure | null }

const STATUS_LABEL: Record<ScheduleEntry['status'], string> = { released: 'Released', current: 'Released (current)', scheduled: 'Scheduled' }

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A read-only look at one scheduled or released puzzle: its stored grid with
// every letter shown, and its answers. The content is fetched only when the
// operator opens it (the schedule itself is metadata only) and reused from
// the session cache while its fingerprint is unchanged. A modal dialog over
// the still-mounted schedule: the rest of the page is inert and can't
// scroll, Tab stays inside, Escape / Close / the backdrop close it, and
// focus returns to the Preview button that opened it.
export function PuzzlePreviewDialog({ entry, client, cache, onClose }: PuzzlePreviewDialogProps) {
  const cached = cache.get(entry.puzzleId, entry.contentFingerprint)
  const [state, setState] = useState<PreviewState>(cached ? { kind: 'ready', preview: cached } : { kind: 'loading' })
  const layerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Captured once (stable across StrictMode's extra mount), like ResultModal.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  const request = useRef(0)

  const load = useCallback(async () => {
    const id = ++request.current
    setState({ kind: 'loading' })
    const result = await cache.load(entry.puzzleId, entry.contentFingerprint, () =>
      client.previewPuzzle({ puzzleId: entry.puzzleId, expectedFingerprint: entry.contentFingerprint }),
    )
    if (id !== request.current) return // closed, or retried, meanwhile
    if (!result.ok) setState({ kind: 'failed', body: null })
    else if (result.body.status === 'ok') setState({ kind: 'ready', preview: result.body.preview })
    else setState({ kind: 'failed', body: result.body })
  }, [cache, client, entry.contentFingerprint, entry.puzzleId])

  useEffect(() => {
    const requests = request
    if (!cache.get(entry.puzzleId, entry.contentFingerprint)) void load()
    return () => {
      requests.current++ // ignore a response that arrives after closing
    }
  }, [cache, entry.contentFingerprint, entry.puzzleId, load])

  // Background inert and unscrollable while open; both restored, then focus
  // returned to the opener (without scrolling), when it closes.
  useEffect(() => {
    const layer = layerRef.current
    const made: HTMLElement[] = []
    for (const element of document.body.children) {
      if (element !== layer && element instanceof HTMLElement && !element.inert) {
        element.inert = true
        made.push(element)
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    titleRef.current?.focus()
    return () => {
      for (const element of made) element.inert = false
      document.body.style.overflow = previousOverflow
      opener?.focus({ preventScroll: true })
    }
  }, [opener])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const inList = focusable.includes(document.activeElement as HTMLElement)
    if (event.shiftKey && (document.activeElement === first || !inList)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="ws-modal" ref={layerRef}>
      <div className="ws-modal__backdrop" aria-hidden="true" onClick={onClose} />
      <div
        className="ws-modal__dialog ws-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-preview-title"
        aria-describedby="ws-preview-meta"
        ref={dialogRef}
        onKeyDown={handleKeyDown}
      >
        <div className="ws-modal__header">
          <div className="ws-preview__heading">
            <h2 id="ws-preview-title" className="ws-preview__title" ref={titleRef} tabIndex={-1}>
              {entry.clue}
            </h2>
            <p id="ws-preview-meta" className="ws-preview__meta">
              <span className="ws-preview__id">{entry.puzzleId}</span>
              <span>{formatPublishDate(entry.publishDate)}</span>
              <span className={`ws-status ws-status--${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
            </p>
          </div>
          <button type="button" className="ws-button ws-button--secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="ws-modal__body">
          <div role="status">
            {state.kind === 'loading' && <p className="ws-muted">Loading the puzzle from Production…</p>}
          </div>
          {state.kind === 'failed' && <PreviewProblem body={state.body} onRetry={() => void load()} />}
          {state.kind === 'ready' && <PreviewContent preview={state.preview} entry={entry} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function PreviewContent({ preview, entry }: { preview: PuzzlePreview; entry: ScheduleEntry }) {
  const { board, answers } = preview
  return (
    <>
      {preview.publishDate !== entry.publishDate && (
        <p className="ws-publish__problem">
          Production now has this puzzle on {formatPublishDate(preview.publishDate)} (released {formatReleaseInstant(preview.releaseInstant)}).
          Refresh the schedule.
        </p>
      )}
      <p className="ws-muted">Read-only preview of the stored puzzle, with every answer shown.</p>
      <div className="ws-preview__body">
        <div className="ws-preview__board">
          <CandidateBoard construction={board} label={`Puzzle grid, ${board.width} by ${board.height}, with every letter filled in.`} />
        </div>
        <section className="ws-preview__answers" aria-labelledby="ws-preview-answers-heading">
          <h3 id="ws-preview-answers-heading" className="ws-detail__subheading">
            Answers ({answers.length})
          </h3>
          <ul className="ws-preview__answer-list">
            {answers.map((answer, index) => (
              <li key={index}>
                <span className="ws-preview__word">{answer.word}</span>
                {answer.direction && <span className="ws-muted-inline">{answer.direction === 'across' ? 'Across' : 'Down'}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

function problemText(body: PreviewFailure | null): string {
  if (body === null) return 'Couldn’t reach the Production operations server. Nothing was changed.'
  switch (body.status) {
    case 'not-found':
      return 'This puzzle is no longer in the Production schedule (it may have been removed). Refresh the schedule.'
    case 'changed':
      return 'This puzzle ID now holds different content than the schedule listed, so it isn’t shown. Refresh the schedule.'
    case 'production-unavailable':
      // A preview never writes, so an uncertain result only means nothing came back.
      return body.reason === 'uncertain' ? 'The preview didn’t complete. Nothing was changed; try again.' : body.message
    case 'unavailable':
    case 'bad-request':
      return body.message
  }
}

function PreviewProblem({ body, onRetry }: { body: PreviewFailure | null; onRetry: () => void }) {
  // Retrying can't help when the puzzle is gone or replaced; the schedule needs a refresh.
  const retryable = body === null || !['not-found', 'changed'].includes(body.status)
  return (
    <div className="ws-preview__problem" role="alert">
      <p className="ws-publish__problem">{problemText(body)}</p>
      {retryable && (
        <button type="button" className="ws-button ws-button--secondary" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  )
}
