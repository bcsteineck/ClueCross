import { X } from 'lucide-react'
import './MessageBanner.scss'

export interface MessageBannerProps {
  message: string | null
  onDismiss: () => void
}

// General-purpose bottom banner, not specific to any one message — callers
// just provide the current text (or null to render nothing).
export function MessageBanner({ message, onDismiss }: MessageBannerProps) {
  if (!message) return null

  return (
    <div className="message-banner" role="alert">
      <div className="message-banner__content">
        <p className="message-banner__text">{message}</p>
        <button
          type="button"
          className="message-banner__close"
          aria-label="Dismiss message"
          onClick={onDismiss}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
