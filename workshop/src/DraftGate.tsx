import { useState } from 'react'
import type { DraftPhase } from './draft/useWorkingDraft'
import type { ReplaceResult } from './draft/draftSaver'

interface DraftGateProps {
  phase: Exclude<DraftPhase, { kind: 'ready' }>
  onRetry: () => void
  onReplaceInvalid: () => Promise<ReplaceResult>
}

// Shown instead of authoring until the working draft has loaded, so nothing
// editable (and nothing that could save over the draft) appears early. An
// unreadable saved file is never replaced without explicit confirmation,
// and even then it is moved aside, not deleted.
export function DraftGate({ phase, onRetry, onReplaceInvalid }: DraftGateProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (phase.kind === 'loading') {
    return (
      <p className="ws-panel ws-muted" aria-live="polite">
        Loading the working draft…
      </p>
    )
  }

  if (phase.kind === 'load-failed') {
    return (
      <section className="ws-panel ws-draft-gate" aria-labelledby="ws-draft-gate-heading">
        <h2 id="ws-draft-gate-heading" className="ws-panel__heading">
          Working draft not loaded
        </h2>
        <div className="ws-errors" role="alert">
          {phase.message} Nothing has been changed or saved. Authoring stays unavailable until the draft loads, so a
          saved draft can’t be overwritten.
        </div>
        <button type="button" className="ws-button" onClick={onRetry}>
          Retry
        </button>
      </section>
    )
  }

  async function replace() {
    setBusy(true)
    setError(null)
    const result = await onReplaceInvalid()
    setBusy(false)
    if (!result.ok) setError(result.message)
  }

  return (
    <section className="ws-panel ws-draft-gate" aria-labelledby="ws-draft-gate-heading">
      <h2 id="ws-draft-gate-heading" className="ws-panel__heading">
        The saved working draft can’t be opened
      </h2>
      <div className="ws-errors" role="alert">
        {phase.message}
      </div>
      <p>
        The file <code>workshop/.local/working-draft.json</code> has been left exactly as it is, so it can be inspected
        or fixed by hand. Retry after fixing it, or set it aside and start a new draft.
      </p>
      <div className="ws-publish__actions">
        <button type="button" className="ws-button ws-button--secondary" onClick={onRetry} disabled={busy}>
          Retry
        </button>
        {!confirming && (
          <button type="button" className="ws-button ws-button--secondary" onClick={() => setConfirming(true)}>
            Set Aside and Start a New Draft…
          </button>
        )}
      </div>
      {confirming && (
        <div className="ws-publish__confirm" role="group" aria-labelledby="ws-draft-replace-heading">
          <p id="ws-draft-replace-heading">
            <strong>Start a new working draft?</strong>
          </p>
          <p className="ws-muted">
            The unreadable file is renamed to <code>working-draft.invalid-&lt;time&gt;.json</code> in the same folder, not
            deleted. A new, empty draft takes its place.
          </p>
          {error && (
            <p className="ws-publish__problem" role="alert">
              Nothing was changed. {error}
            </p>
          )}
          <div className="ws-publish__actions">
            <button type="button" className="ws-button" onClick={() => void replace()} disabled={busy}>
              {busy ? 'Starting…' : 'Set Aside and Start New Draft'}
            </button>
            <button type="button" className="ws-button ws-button--secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
