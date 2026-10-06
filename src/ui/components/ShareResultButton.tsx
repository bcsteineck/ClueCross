import { Share } from 'lucide-react'
import { useShareResult } from '../../state/useShareResult'
import './ShareResultButton.scss'

/** Marks the completed puzzle's persistent Share Result control, so the completion modal can return focus to it. */
export const PERSISTENT_SHARE_ATTRIBUTE = 'data-share-result'

// Takes the Reveal Letter action's place once a puzzle is complete (desktop
// right column, mobile bottom action), with the same Reveal button styling
// — a disabled Reveal Letter there was a dead end. It shares immediately;
// it never reopens the completion modal. Status is announced through a
// visually hidden live region that is always mounted (so screen readers
// reliably announce "Copied!" and errors); the visible caption renders only
// while there's a message, so no empty line sits under the button.
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
      <span role="status" className="share-result-button__announcer">
        {message}
      </span>
      {message && (
        <span className="reveal-button__sublabel" aria-hidden="true">
          {message}
        </span>
      )}
    </div>
  )
}
