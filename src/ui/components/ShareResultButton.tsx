import { Share } from 'lucide-react'
import { useShareResult } from '../../state/useShareResult'
import './ShareResultButton.scss'

/** Marks the completed puzzle's persistent Share Result control, so the completion modal can return focus to it. */
export const PERSISTENT_SHARE_ATTRIBUTE = 'data-share-result'

// Takes the Reveal Letter action's place once a puzzle is complete (desktop
// right column, mobile bottom action), with the same Reveal button styling
// — a disabled Reveal Letter there was a dead end. It shares immediately;
// it never reopens the completion modal. The status line is always
// mounted, so "Copied!" and errors are announced when they appear.
export function ShareResultButton() {
  const { share, message } = useShareResult()
  return (
    <div className="reveal-button-group">
      <button
        type="button"
        className="reveal-button reveal-button--default share-result-button"
        onClick={share}
        {...{ [PERSISTENT_SHARE_ATTRIBUTE]: 'persistent' }}
      >
        <Share className="share-result-button__icon" aria-hidden="true" />
        <span className="reveal-button__label">Share Result</span>
      </button>
      <span role="status" className="reveal-button__sublabel share-result-button__status">
        {message}
      </span>
    </div>
  )
}
