import { useCallback, useEffect, useRef, useState } from 'react'
import { isPuzzleComplete } from '../core/gameEngine'
import type { GameState } from '../core/gameEngine'
import { formatShareResult } from '../core/shareResult'
import { usePuzzleSession } from './PuzzleSessionContext'

export type ShareStatus = 'idle' | 'copied' | 'share-error' | 'copy-error'

export const SHARE_STATUS_MESSAGES: Record<Exclude<ShareStatus, 'idle'>, string> = {
  copied: 'Copied!',
  'share-error': 'Couldn’t share. Try again.',
  'copy-error': 'Couldn’t copy. Try again.',
}

/** How long a status stays visible before clearing. */
export const STATUS_DISPLAY_MS = { copied: 2500, error: 5000 } as const

/**
 * Phones and tablets get the OS share sheet; desktops copy instead, even
 * when the browser offers navigator.share (macOS Safari, Windows Chrome).
 * "Mobile" means a coarse primary pointer — a touchscreen device — not a
 * narrow window, so a small desktop window still copies. A device without
 * Web Share (e.g. Firefox for Android) copies too.
 */
export function prefersNativeShare(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

/** The result text for a completed puzzle, or null if there's nothing to share. */
export function shareTextFor(state: GameState, publishDate: string): string | null {
  if (!isPuzzleComplete(state) || !Number.isFinite(state.score)) return null
  return formatShareResult({
    publishDate,
    score: state.score,
    maxScore: state.puzzle.unlockBudget,
    // Every Reveal action records one entry (free, paid, or a letter absent
    // from the puzzle). A malformed stored result gets no invented count.
    revealCount: Array.isArray(state.revealHistory) ? state.revealHistory.length : null,
  })
}

// By name, not `instanceof Error`: a DOMException isn't guaranteed to be an
// Error instance in every engine.
function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

// One share behavior for every Share Result control (the completion modal
// and the completed puzzle's persistent control), so both always share the
// same text. The text is built synchronously, and navigator.share is called
// directly inside the click handler, before any await, so mobile browsers
// keep the user gesture that native sharing requires.
export function useShareResult() {
  const { state, publishDate } = usePuzzleSession()
  const [status, setStatus] = useState<ShareStatus>('idle')
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const text = shareTextFor(state, publishDate)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current)
    }
  }, [])

  const show = useCallback((next: ShareStatus) => {
    clearTimeout(timer.current)
    setStatus(next)
    if (next === 'idle') return
    const duration = next === 'copied' ? STATUS_DISPLAY_MS.copied : STATUS_DISPLAY_MS.error
    timer.current = setTimeout(() => {
      if (mounted.current) setStatus('idle')
    }, duration)
  }, [])

  const share = useCallback(() => {
    if (text === null || inFlight.current) return
    inFlight.current = true
    const finish = (next: ShareStatus) => {
      inFlight.current = false
      if (mounted.current) show(next)
    }

    if (prefersNativeShare()) {
      let pending: Promise<void>
      try {
        pending = navigator.share({ text }) // text only: it already ends with the URL
      } catch {
        finish('share-error')
        return
      }
      // Dismissing the share sheet is not an error.
      pending.then(
        () => finish('idle'),
        (error: unknown) => finish(isAbort(error) ? 'idle' : 'share-error'),
      )
      return
    }

    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      finish('copy-error')
      return
    }
    let pending: Promise<void>
    try {
      pending = clipboard.writeText(text)
    } catch {
      finish('copy-error')
      return
    }
    pending.then(
      () => finish('copied'),
      () => finish('copy-error'),
    )
  }, [text, show])

  return {
    share,
    /** False until the puzzle is complete (or if its result can't be shared). */
    canShare: text !== null,
    status,
    message: status === 'idle' ? '' : SHARE_STATUS_MESSAGES[status],
  }
}
