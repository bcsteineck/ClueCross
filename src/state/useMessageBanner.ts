import { useCallback, useEffect, useRef, useState } from 'react'

// General-purpose, single-message banner: showing a new message replaces
// whatever's currently showing and restarts the auto-dismiss timer, so
// only one message is ever on screen at a time.
const AUTO_DISMISS_MS = 20_000

export interface UseMessageBannerResult {
  message: string | null
  showMessage: (text: string) => void
  dismiss: () => void
}

export function useMessageBanner(): UseMessageBannerResult {
  const [message, setMessage] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearPendingTimeout()
    setMessage(null)
  }, [clearPendingTimeout])

  const showMessage = useCallback(
    (text: string) => {
      clearPendingTimeout()
      setMessage(text)
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        setMessage(null)
      }, AUTO_DISMISS_MS)
    },
    [clearPendingTimeout],
  )

  useEffect(() => clearPendingTimeout, [clearPendingTimeout])

  return { message, showMessage, dismiss }
}
