import { useRef } from 'react'
import type { PointerEvent } from 'react'

// Horizontal swipes on the candidate board: left for Next, right for
// Previous. Touch and pen only (a mouse has the buttons, and dragging with
// it selects text). The board's touch-action leaves vertical panning and
// pinch-zoom to the browser, which cancels the pointer when it takes over,
// so a scroll never navigates. One gesture, judged once when it ends, moves
// at most one candidate; a second finger cancels it.

/** Minimum horizontal travel, in CSS pixels, for a deliberate swipe. */
export const SWIPE_MIN_DISTANCE = 48
/** Horizontal travel must be at least this many times the vertical travel. */
export const SWIPE_DIRECTION_RATIO = 2

export type SwipeDirection = 'next' | 'previous'

export function classifySwipe(dx: number, dy: number): SwipeDirection | null {
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < SWIPE_DIRECTION_RATIO * Math.abs(dy)) return null
  return dx < 0 ? 'next' : 'previous'
}

export interface SwipeHandlers {
  onPointerDown: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
}

export function useSwipeNavigation(onSwipe: (direction: SwipeDirection) => void): SwipeHandlers {
  const start = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  return {
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse') return
      // A second finger (pinch-zoom) cancels the gesture in progress.
      start.current = event.isPrimary ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY } : null
    },
    onPointerUp: (event) => {
      const gesture = start.current
      if (!gesture || gesture.pointerId !== event.pointerId) return
      start.current = null
      const direction = classifySwipe(event.clientX - gesture.x, event.clientY - gesture.y)
      if (direction) onSwipe(direction)
    },
    onPointerCancel: () => {
      start.current = null
    },
  }
}
