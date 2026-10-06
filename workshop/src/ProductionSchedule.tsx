import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ProductionRemoveBody,
  ProductionRemovePreviewBody,
  Schedule,
  ScheduleEntry,
  ScheduleStatus,
} from './production/contract'
import type { ProductionClient } from './production/productionClient'
import { formatPublishDate, formatReleaseInstant } from './publishing/formatPublication'

interface ProductionScheduleProps {
  client: ProductionClient
}

type LoadState = { kind: 'loading' } | { kind: 'ready'; schedule: Schedule } | { kind: 'failed'; message: string }

type RemovalState =
  | { kind: 'previewing'; puzzleId: string }
  | { kind: 'preview'; body: ProductionRemovePreviewBody; puzzleId: string }
  | { kind: 'removing'; puzzleId: string }
  | { kind: 'result'; body: ProductionRemoveBody | null; puzzleId: string }

const STATUS_LABEL: Record<ScheduleStatus, string> = { released: 'Released', current: 'Current', scheduled: 'Scheduled' }

// The Production calendar as the operator manages it: released history,
// the current puzzle, and the scheduled future queue. Statuses come from
// the server's database time. Only scheduled puzzles can be removed; the
// server re-checks that inside the removal transaction.
export function ProductionSchedule({ client }: ProductionScheduleProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' })
  const [removal, setRemoval] = useState<RemovalState | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const inFlight = useRef(false)
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)

  const refresh = useCallback(async () => {
    setLoad({ kind: 'loading' })
    const result = await client.schedule()
    if (result.ok && result.body.status === 'ok') setLoad({ kind: 'ready', schedule: result.body.schedule })
    else if (result.ok && result.body.status !== 'ok') setLoad({ kind: 'failed', message: result.body.message })
    else setLoad({ kind: 'failed', message: 'Couldn’t reach the Production operations server.' })
  }, [client])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (removal?.kind === 'preview' || removal?.kind === 'result') panelHeadingRef.current?.focus()
  }, [removal?.kind])

  async function startRemoval(entry: ScheduleEntry) {
    setConfirmText('')
    setRemoval({ kind: 'previewing', puzzleId: entry.puzzleId })
    const result = await client.previewRemoval(entry.puzzleId)
    setRemoval(
      result.ok
        ? { kind: 'preview', body: result.body, puzzleId: entry.puzzleId }
        : { kind: 'result', body: null, puzzleId: entry.puzzleId },
    )
  }

  async function confirmRemoval() {
    if (removal?.kind !== 'preview' || removal.body.status !== 'removable' || inFlight.current) return
    const { target } = removal.body
    if (confirmText !== target.puzzleId) return
    inFlight.current = true
    setRemoval({ kind: 'removing', puzzleId: target.puzzleId })
    try {
      const result = await client.remove({
        puzzleId: target.puzzleId,
        expectedPublishDate: target.publishDate,
        expectedFingerprint: target.contentFingerprint,
        confirmPuzzleId: confirmText,
      })
      setRemoval({ kind: 'result', body: result.ok ? result.body : null, puzzleId: target.puzzleId })
    } finally {
      inFlight.current = false
    }
    await refresh() // always show the authoritative schedule afterwards
  }

  const busy = removal?.kind === 'previewing' || removal?.kind === 'removing'

  return (
    <section className="ws-panel ws-schedule" aria-labelledby="ws-schedule-heading">
      <div className="ws-schedule__header">
        <h2 id="ws-schedule-heading" className="ws-panel__heading">
          Production Schedule
        </h2>
        <button type="button" className="ws-button ws-button--secondary" onClick={() => void refresh()} disabled={load.kind === 'loading' || busy}>
          {load.kind === 'loading' ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div role="status">
        {load.kind === 'loading' && <p className="ws-muted">Reading the Production calendar…</p>}
        {load.kind === 'failed' && <p className="ws-publish__problem">{load.message}</p>}
      </div>

      {load.kind === 'ready' && (
        <>
          <ScheduleSummaryView schedule={load.schedule} />
          <table className="ws-schedule__table">
            <caption className="ws-visually-hidden">Production calendar, oldest first</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Puzzle</th>
                <th scope="col">Status</th>
                <th scope="col">Releases</th>
                <th scope="col">
                  <span className="ws-visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {load.schedule.entries.map((entry) => (
                <tr key={entry.puzzleId} className={`ws-schedule__row ws-schedule__row--${entry.status}`}>
                  <td>{formatPublishDate(entry.publishDate)}</td>
                  <td>
                    {entry.clue} <span className="ws-muted-inline">{entry.puzzleId}</span>
                  </td>
                  <td>
                    <span className={`ws-status ws-status--${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                  </td>
                  <td>{formatReleaseInstant(entry.releaseInstant)}</td>
                  <td>
                    {entry.removable && (
                      <button
                        type="button"
                        className="ws-button ws-button--secondary"
                        onClick={() => void startRemoval(entry)}
                        disabled={busy || load.kind !== 'ready'}
                        aria-label={`Remove ${entry.clue} (${entry.puzzleId}) from the schedule…`}
                      >
                        Remove from Schedule…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {load.schedule.entries.length === 0 && <p className="ws-muted">The Production calendar is empty.</p>}
        </>
      )}

      {removal && (
        <div className="ws-publish__confirm ws-schedule__removal" role="group" aria-labelledby="ws-removal-heading">
          <h3 id="ws-removal-heading" className="ws-detail__subheading" ref={panelHeadingRef} tabIndex={-1}>
            Remove from Schedule
          </h3>
          {removal.kind === 'previewing' && <p className="ws-muted">Checking what removal would change…</p>}
          {removal.kind === 'removing' && <p className="ws-muted">Removing from the Production schedule…</p>}
          {removal.kind === 'preview' && (
            <RemovalPreview
              body={removal.body}
              confirmText={confirmText}
              onConfirmTextChange={setConfirmText}
              onConfirm={() => void confirmRemoval()}
            />
          )}
          {removal.kind === 'result' && <RemovalResult body={removal.body} />}
          <button type="button" className="ws-button ws-button--secondary" onClick={() => setRemoval(null)} disabled={busy}>
            {removal.kind === 'result' ? 'Close' : 'Cancel'}
          </button>
        </div>
      )}
    </section>
  )
}

function ScheduleSummaryView({ schedule }: { schedule: Schedule }) {
  const { summary } = schedule
  return (
    <dl className="ws-detail__summary ws-schedule__summary">
      <div>
        <dt>Current</dt>
        <dd>{summary.currentDate ? formatPublishDate(summary.currentDate) : 'None released yet'}</dd>
      </div>
      <div>
        <dt>Filled through</dt>
        <dd>
          {summary.filledThrough ? `${formatPublishDate(summary.filledThrough)} (${summary.daysAhead} ${summary.daysAhead === 1 ? 'day' : 'days'} ahead)` : '—'}
        </dd>
      </div>
      <div>
        <dt>Scheduled</dt>
        <dd>
          {summary.scheduledCount}
          {summary.lastScheduledDate ? `, last ${formatPublishDate(summary.lastScheduledDate)}` : ''}
        </dd>
      </div>
      <div>
        <dt>Gaps</dt>
        <dd>{summary.gaps.length === 0 ? 'None' : summary.gaps.map(formatPublishDate).join(', ')}</dd>
      </div>
      <div>
        <dt>As of</dt>
        <dd>{formatReleaseInstant(schedule.asOf)}</dd>
      </div>
    </dl>
  )
}

function RemovalPreview({
  body,
  confirmText,
  onConfirmTextChange,
  onConfirm,
}: {
  body: ProductionRemovePreviewBody
  confirmText: string
  onConfirmTextChange: (value: string) => void
  onConfirm: () => void
}) {
  if (body.status !== 'removable') return <RemovalResult body={body} />
  const { target, moves } = body
  return (
    <>
      <p>
        <strong>
          Removing: {target.clue} ({target.puzzleId}) — {formatPublishDate(target.publishDate)}
        </strong>
      </p>
      {moves.length > 0 ? (
        <>
          <p>Schedule changes:</p>
          <ul className="ws-schedule__moves">
            {moves.map((move) => (
              <li key={move.puzzleId}>
                {move.clue} ({move.puzzleId}): {formatPublishDate(move.from)} → {formatPublishDate(move.to)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No later puzzles move.</p>
      )}
      <p className="ws-muted">Released puzzles will not change. The server re-checks everything when you confirm.</p>
      <div className="ws-field">
        <label htmlFor="ws-removal-confirm">Type the puzzle ID ({target.puzzleId}) to confirm</label>
        <input
          id="ws-removal-confirm"
          type="text"
          value={confirmText}
          onChange={(event) => onConfirmTextChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <button type="button" className="ws-button ws-button--production" onClick={onConfirm} disabled={confirmText !== target.puzzleId}>
        Remove from Schedule
      </button>
    </>
  )
}

function RemovalResult({ body }: { body: ProductionRemovePreviewBody | ProductionRemoveBody | null }) {
  if (body === null) {
    return (
      <p className="ws-publish__problem">
        The request didn’t complete, so the puzzle may or may not have been removed. The schedule below is refreshed from Production.
      </p>
    )
  }
  switch (body.status) {
    case 'removed':
      return (
        <p role="status">
          <strong>
            Removed {body.removed.clue} ({body.removed.puzzleId}).
          </strong>{' '}
          {body.moves.length === 0 ? 'No later puzzles moved.' : `${body.moves.length} later ${body.moves.length === 1 ? 'puzzle' : 'puzzles'} moved forward one day.`}
        </p>
      )
    case 'removable':
      return null
    case 'released':
      return (
        <p className="ws-publish__problem">
          {body.target.clue} ({body.target.puzzleId}) has released and can no longer be removed. Nothing was changed.
        </p>
      )
    case 'stale':
      return (
        <p className="ws-publish__problem">
          The schedule changed since the preview ({body.current.puzzleId} is now {formatPublishDate(body.current.publishDate)}). Nothing was
          changed; review it again.
        </p>
      )
    case 'not-found':
      return <p className="ws-publish__problem">That puzzle isn’t in the Production schedule (it may already have been removed). Refresh the schedule.</p>
    case 'busy':
    case 'unavailable':
    case 'bad-request':
      return <p className="ws-publish__problem">{body.message}</p>
    case 'production-unavailable':
      return (
        <p className="ws-publish__problem">
          {body.reason === 'uncertain'
            ? 'The request didn’t complete, so the puzzle may or may not have been removed. The schedule below is refreshed from Production.'
            : body.message}
        </p>
      )
  }
}
