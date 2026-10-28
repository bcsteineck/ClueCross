import { useEffect, useRef, useState } from 'react'
import type { Ref } from 'react'
import { formatPublishDate } from './publishing/formatPublication'
import type { SavedPublication } from './state/workshopReducer'

/** A candidate's place in the workflow, as shown on its card and in its detail. */
export type CandidateStatus = 'unsaved' | 'saving' | 'saved' | 'removing' | 'approved'

interface BatchCandidateActionsProps {
  status: CandidateStatus
  /** Why the last save of this candidate didn't happen, if it failed. */
  error: string | null
  onSave: () => void
}

const BATCH_LABEL: Record<CandidateStatus, string> = {
  unsaved: 'Save Candidate',
  saving: 'Saving…',
  saved: 'Saved',
  removing: 'Saved',
  approved: 'Approved',
}

// Current Batch: Save is the only action (approval happens in Saved
// Candidates). One button carries all three states — Save Candidate,
// Saving…, Saved — so focus stays put while the save completes; once saving
// starts it is aria-disabled, never a second Save. "Saved" appears only
// after the working draft is written.
export function BatchCandidateActions({ status, error, onSave }: BatchCandidateActionsProps) {
  const available = status === 'unsaved'
  return (
    <div className="ws-detail__approve">
      <button
        type="button"
        className={available ? 'ws-button' : 'ws-button ws-button--secondary'}
        aria-disabled={!available}
        onClick={() => available && onSave()}
      >
        {(status === 'saved' || status === 'approved') && <span aria-hidden="true">✓ </span>}
        {BATCH_LABEL[status]}
      </button>
      {error && (
        <p className="ws-errors" role="alert">
          {error}
        </p>
      )}
      <p className="ws-muted">
        {status === 'approved'
          ? 'This layout is the approved Final Puzzle, and is kept in Saved Candidates.'
          : 'Saving keeps this layout in Saved Candidates (part of the working draft), where you can approve it as the Final Puzzle. Unsaved candidates are lost when you generate again or refresh.'}
      </p>
    </div>
  )
}

interface SavedCandidateActionsProps {
  status: CandidateStatus
  error: string | null
  /** The Author clue the Final Puzzle will use. */
  currentClue: string
  /** Its dev-calendar publication, if it was published while it was the Final Puzzle. */
  publication: SavedPublication | null
  /** Set for an edited version: removing it asks first, and only it is deleted. */
  edited?: boolean
  /** Edit Candidate opens this entry itself (an unlocked edited version) rather than a new copy. */
  editsInPlace?: boolean
  /** A new edited copy is being saved before the Editor opens. */
  opening?: boolean
  /** Why it can't be approved now (an edited layout's blocking issues); empty when it can. */
  approvalIssues?: string[]
  onApprove: () => void
  onOpenFinal: () => void
  onRemove: () => void
  onEdit?: () => void
  /** Approve (or Open Final Puzzle): focus returns here from the Final Puzzle. */
  approveButtonRef?: Ref<HTMLButtonElement>
}

// Saved Candidates: Approve as Final Puzzle, Edit Candidate, and Remove
// from Saved, or, for the approved candidate, Open Final Puzzle and Edit a
// Copy, and no Remove (approve another or clear the Final Puzzle first).
// While a removal or a new edited copy is being saved, the actions are
// aria-disabled, so nothing can act on a candidate mid-write. An edited
// version whose layout isn't a complete crossword can't be approved; the
// reasons are listed beside the action. Deleting an edited version asks
// first (inline, like New Puzzle) and deletes only that version.
export function SavedCandidateActions({
  status,
  error,
  currentClue,
  publication,
  edited = false,
  editsInPlace = false,
  opening = false,
  approvalIssues = [],
  onApprove,
  onOpenFinal,
  onRemove,
  onEdit,
  approveButtonRef,
}: SavedCandidateActionsProps) {
  const [confirming, setConfirming] = useState(false)
  const deleteRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const removing = status === 'removing'
  const busy = removing || opening
  const blocked = approvalIssues.length > 0
  const clue = currentClue.trim()

  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
    else if (restoreFocus.current) {
      restoreFocus.current = false
      deleteRef.current?.focus()
    }
  }, [confirming])

  function cancelDelete() {
    restoreFocus.current = true
    setConfirming(false)
  }

  const editButton = onEdit && (
    <button type="button" className="ws-button ws-button--secondary" aria-disabled={busy} onClick={() => !busy && onEdit()}>
      {opening ? 'Opening Editor…' : editsInPlace ? 'Continue Editing' : status === 'approved' || publication ? 'Edit a Copy' : 'Edit Candidate'}
    </button>
  )
  const errorMessage = error && (
    <p className="ws-errors" role="alert">
      {error}
    </p>
  )

  if (status === 'approved') {
    return (
      <div className="ws-detail__approve">
        <div className="ws-detail__actions">
          <button type="button" className="ws-button" onClick={onOpenFinal} ref={approveButtonRef}>
            Open Final Puzzle
          </button>
          {editButton}
        </div>
        {errorMessage}
        <p className="ws-muted">
          This is the approved Final Puzzle. To remove it from Saved Candidates, approve another candidate or clear the
          Final Puzzle first. Editing makes a new copy; the Final Puzzle stays as it is.
        </p>
      </div>
    )
  }
  return (
    <div className="ws-detail__approve">
      <div className="ws-detail__actions">
        <button
          type="button"
          className="ws-button"
          aria-disabled={busy || blocked}
          aria-describedby={blocked ? 'ws-approve-blocked' : undefined}
          onClick={() => !busy && !blocked && onApprove()}
          ref={approveButtonRef}
        >
          Approve as Final Puzzle
        </button>
        {editButton}
        <button
          type="button"
          className="ws-button ws-button--secondary"
          aria-disabled={busy}
          aria-expanded={edited ? confirming : undefined}
          ref={deleteRef}
          onClick={() => {
            if (busy) return
            if (edited) setConfirming(true)
            else onRemove()
          }}
        >
          {removing ? 'Removing…' : edited ? 'Delete Version' : 'Remove from Saved'}
        </button>
      </div>
      {confirming && !removing && (
        <div
          className="ws-publish__confirm"
          role="group"
          aria-labelledby="ws-delete-version-heading"
          onKeyDown={(event) => event.key === 'Escape' && cancelDelete()}
        >
          <p id="ws-delete-version-heading">
            <strong>Delete this edited version?</strong>
          </p>
          <p className="ws-muted">
            Only this version is deleted. The candidate it came from and every other version stay in Saved Candidates.
          </p>
          <div className="ws-publish__actions">
            <button
              type="button"
              className="ws-button ws-button--danger"
              onClick={() => {
                setConfirming(false)
                onRemove()
              }}
            >
              Delete Version
            </button>
            <button type="button" className="ws-button ws-button--secondary" onClick={cancelDelete} ref={cancelRef}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {errorMessage}
      {blocked && (
        <div id="ws-approve-blocked" className="ws-errors">
          <p>
            <strong>Can’t be approved yet.</strong> Fix the layout in the Editor:
          </p>
          <ul>
            {approvalIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {publication ? (
        <p className="ws-muted">
          Published to the dev calendar as “{publication.published.publication.puzzleId}”, scheduled for{' '}
          {formatPublishDate(publication.published.publication.publishDate)}. Approving makes this the Final Puzzle
          again with the ID and clue it was published with. Removing it from Saved Candidates doesn’t unpublish it.
        </p>
      ) : (
        <p className="ws-muted">
          Approving makes this the Final Puzzle with the current Author clue
          {clue ? ` (“${clue}”)` : ''}. It stays in Saved Candidates; nothing is published.
          {!edited && ' Edit Candidate makes an edited copy; this candidate stays as it is.'}
        </p>
      )}
    </div>
  )
}
