import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

// Which candidate-inspection experience is showing: the gallery beside the
// inspector ('columns'), or the gallery and a candidate's detail as separate
// screens ('screens'). The stylesheet decides, with the same container query
// that lays out the columns ($ws-candidates-columns), and publishes the
// answer as --ws-candidates-layout; this reads it, so CSS and React can
// never disagree about the breakpoint. It's re-read whenever the workspace
// (the query's container) or the window changes size.

export type CandidatesLayout = 'columns' | 'screens'

const LAYOUT_PROPERTY = '--ws-candidates-layout'

// The last layout read. The workspace remounts whenever it's revisited, and
// starting from this (not from 'columns') means its first render already
// has the right controls in it, for focus that lands on them at once (Back
// from Final Puzzle returns focus to the Approve button or card).
let lastLayout: CandidatesLayout = 'columns'

function readLayout(element: Element): CandidatesLayout {
  lastLayout = getComputedStyle(element).getPropertyValue(LAYOUT_PROPERTY).trim() === 'screens' ? 'screens' : 'columns'
  return lastLayout
}

export function useCandidatesLayout(ref: RefObject<HTMLElement | null>): CandidatesLayout {
  const [layout, setLayout] = useState<CandidatesLayout>(() => lastLayout)

  // A layout effect, so the first paint already shows the right experience.
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setLayout(readLayout(element))
    update()
    const container = element.closest('.ws-app')
    const observer = container && typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
    if (container) observer?.observe(container)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [ref])

  return layout
}
