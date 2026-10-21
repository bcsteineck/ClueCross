import type { DraftSaveStatus } from './draft/draftSaver'

interface DraftStatusProps {
  status: DraftSaveStatus
  onRetry: () => void
  onReload: () => void
  onOverwrite: () => void
}

// The working draft's save state. Routine states are a quiet polite live
// region; a failed save or a conflict means changes aren't saved, so those
// are alerts with explicit next steps. Nothing here retries on its own.
export function DraftStatus({ status, onRetry, onReload, onOverwrite }: DraftStatusProps) {
  if (status.kind === 'failed') {
    return (
      <div className="ws-errors ws-draft-status ws-draft-status--problem" role="alert">
        <p>
          <strong>Draft not saved.</strong> {status.message} Your changes are kept in this window.
        </p>
        <button type="button" className="ws-button ws-button--secondary" onClick={onRetry}>
          Retry Saving
        </button>
      </div>
    )
  }
  if (status.kind === 'conflict') {
    return (
      <div className="ws-errors ws-draft-status ws-draft-status--problem" role="alert">
        <p>
          <strong>Draft not saved.</strong> The working draft was changed in another Workshop window or mode. Your
          recent changes here are kept in this window but not saved.
        </p>
        <div className="ws-draft-status__actions">
          <button type="button" className="ws-button ws-button--secondary" onClick={onReload}>
            Load Saved Draft (Discard Changes Here)
          </button>
          <button type="button" className="ws-button ws-button--secondary" onClick={onOverwrite}>
            Keep My Changes (Replace Saved Draft)
          </button>
        </div>
      </div>
    )
  }
  return (
    <p className="ws-muted ws-draft-status" aria-live="polite">
      {status.kind === 'saved' ? 'Draft saved' : 'Saving draft…'}
    </p>
  )
}
