import { useEffect, useState } from 'react'

// Kept in sync with $mobile-breakpoint in src/styles/_tokens.scss by hand —
// there's no existing mechanism in this project for sharing a value
// between Sass and TypeScript, and introducing one for a single constant
// isn't worth it.
const MOBILE_QUERY = '(max-width: 1024px)'

function matchesMobile(): boolean {
  // jsdom (the test environment) doesn't implement matchMedia, so tests
  // that don't explicitly stub it naturally get the desktop layout — this
  // is what keeps the existing desktop-oriented test suite unaffected by
  // this hook's introduction.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }
  return window.matchMedia(MOBILE_QUERY).matches
}

// Deliberately a JS breakpoint switch (which layout mounts), not a
// CSS-only show/hide of both — mounting both DesktopLayout and
// MobileLayout at once would double up on live puzzle-board input
// elements, ARIA landmarks, and focus targets.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(matchesMobile)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(MOBILE_QUERY)
    const handleChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
