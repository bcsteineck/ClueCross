import { useEffect, useState } from 'react'

const STORAGE_KEY = 'cluecross:reduce-motion'

function readInitial(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// Persists to localStorage and applies a data attribute on <html> that
// index.scss uses to globally disable transitions/animations — kept as a
// single always-mounted hook (used from App) so the applied attribute
// doesn't depend on the Settings modal's own mount lifecycle.
export function useReducedMotionPreference() {
  const [enabled, setEnabled] = useState(readInitial)

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(enabled)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(enabled))
    } catch {
      // Storage unavailable — preference just won't persist this session.
    }
  }, [enabled])

  return [enabled, setEnabled] as const
}
