// Local-only "has the player seen onboarding" flag, kept in localStorage —
// same approach as completionTracking.ts. Drives whether the Onboarding
// modal auto-opens on first load.
const STORAGE_KEY = 'cluecross:has-completed-onboarding'

export function hasCompletedOnboarding(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    // Storage unavailable (private browsing, quota, disabled) — treat
    // onboarding as already seen rather than force an interrupting modal
    // on every load with no way to permanently dismiss it.
    return true
  }
}

export function markOnboardingCompleted(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // Storage unavailable — the choice just won't persist this session.
  }
}
