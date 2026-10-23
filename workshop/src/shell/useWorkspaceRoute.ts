// Workspace navigation through the URL hash (#/author, #/candidates,
// #/final, #/publish, and #/schedule in Production-operations mode). The
// route is view state only: it never enters the working draft, so a
// refresh restores the workspace from the URL and the draft from its file.
//
// Unknown routes, and #/schedule outside Production-operations mode, are
// replaced with #/author (no extra history entry), so a URL alone can never
// reach a Production-only view. Back and Forward work through hashchange.
//
// Candidates also has a detail screen on narrow workspaces:
// #/candidates/<key> for a candidate in the current (session-only) batch,
// and #/candidates/saved/<key> for one in Saved Candidates, where <key> is
// candidateKey() of the candidate's fingerprint. Opening it from the gallery adds one
// history entry; Previous/Next replace that entry; All Candidates goes back
// to the gallery entry it came from (or replaces the detail entry when
// there is none). Whether a key names a candidate is up to the Candidates
// workspace, which replaces an unknown or stale one with #/candidates.

import { useCallback, useEffect, useMemo, useState } from 'react'

export type Workspace = 'author' | 'candidates' | 'final' | 'publish' | 'schedule'

export const WORKSPACE_HASH: Record<Workspace, string> = {
  author: '#/author',
  candidates: '#/candidates',
  final: '#/final',
  publish: '#/publish',
  schedule: '#/schedule',
}

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  author: 'Author',
  candidates: 'Candidates',
  final: 'Final Puzzle',
  publish: 'Publish',
  schedule: 'Production Schedule',
}

export const DEFAULT_WORKSPACE: Workspace = 'author'

const CANDIDATE_DETAIL_PREFIX = `${WORKSPACE_HASH.candidates}/`

/** The detail-route hash for a candidate key. */
export function candidateDetailHash(key: string): string {
  return CANDIDATE_DETAIL_PREFIX + key
}

/**
 * A short, URL-safe key for a candidate, derived from its identity
 * signature (cyrb53), so a key from an earlier batch can only ever name the
 * same crossword layout, never whichever candidate now sits at a position.
 */
export function candidateKey(identitySignature: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < identitySignature.length; i++) {
    const code = identitySignature.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export interface WorkspaceRoute {
  workspace: Workspace
  /** The candidate key in #/candidates/<key> (possibly empty or malformed), else null. */
  candidateDetail: string | null
}

/** The workspace a hash names, or null when it names none available in this mode. */
export function parseWorkspaceHash(hash: string, { production }: { production: boolean }): Workspace | null {
  const match = (Object.entries(WORKSPACE_HASH) as [Workspace, string][]).find(([, value]) => value === hash)
  if (!match) return null
  if (match[0] === 'schedule' && !production) return null
  return match[0]
}

/** The route a hash names, or null when it names none available in this mode. */
export function parseRouteHash(hash: string, { production }: { production: boolean }): WorkspaceRoute | null {
  if (hash.startsWith(CANDIDATE_DETAIL_PREFIX)) {
    return { workspace: 'candidates', candidateDetail: hash.slice(CANDIDATE_DETAIL_PREFIX.length) }
  }
  const workspace = parseWorkspaceHash(hash, { production })
  return workspace ? { workspace, candidateDetail: null } : null
}

const DEFAULT_ROUTE: WorkspaceRoute = { workspace: DEFAULT_WORKSPACE, candidateDetail: null }

function currentRoute(production: boolean): WorkspaceRoute {
  return parseRouteHash(window.location.hash, { production }) ?? DEFAULT_ROUTE
}

function replaceHash(workspace: Workspace): void {
  window.history.replaceState(window.history.state, '', WORKSPACE_HASH[workspace])
}

// Marks a detail entry that was pushed on top of the gallery's entry, so
// All Candidates can return to that entry instead of adding another.
interface CandidateDetailHistoryState {
  wsCandidateDetailFromGallery: true
}

function isFromGallery(state: unknown): state is CandidateDetailHistoryState {
  return typeof state === 'object' && state !== null && 'wsCandidateDetailFromGallery' in state
}

export interface CandidateDetailNavigation {
  /** From the gallery: adds one history entry for the detail screen. */
  open: (key: string) => void
  /** Previous/Next (or a stale key): replaces the current detail entry. */
  show: (key: string) => void
  /** All Candidates: back to the gallery entry, or replaces this one with #/candidates. */
  close: () => void
  /** A key that names no current candidate: replaced with #/candidates, never followed back. */
  discard: () => void
}

export function useWorkspaceRoute(production: boolean): WorkspaceRoute & {
  navigate: (workspace: Workspace) => void
  candidateDetailNavigation: CandidateDetailNavigation
} {
  const [route, setRoute] = useState<WorkspaceRoute>(() => currentRoute(production))

  useEffect(() => {
    // Normalize a missing or unknown hash without adding a history entry.
    if (parseRouteHash(window.location.hash, { production }) === null) replaceHash(DEFAULT_WORKSPACE)
    const onHashChange = () => {
      const next = parseRouteHash(window.location.hash, { production })
      if (next === null) replaceHash(DEFAULT_WORKSPACE)
      setRoute(next ?? DEFAULT_ROUTE)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [production])

  const navigate = useCallback((next: Workspace) => {
    setRoute({ workspace: next, candidateDetail: null })
    if (window.location.hash !== WORKSPACE_HASH[next]) window.location.hash = WORKSPACE_HASH[next]
  }, [])

  // pushState/replaceState don't fire hashchange, so the route is set here too.
  const candidateDetailNavigation = useMemo<CandidateDetailNavigation>(
    () => ({
      open: (key) => {
        const state: CandidateDetailHistoryState = { wsCandidateDetailFromGallery: true }
        window.history.pushState(state, '', candidateDetailHash(key))
        setRoute({ workspace: 'candidates', candidateDetail: key })
      },
      show: (key) => {
        window.history.replaceState(window.history.state, '', candidateDetailHash(key))
        setRoute({ workspace: 'candidates', candidateDetail: key })
      },
      close: () => {
        if (isFromGallery(window.history.state)) {
          // The hashchange from going back sets the route.
          window.history.back()
          return
        }
        window.history.replaceState(null, '', WORKSPACE_HASH.candidates)
        setRoute({ workspace: 'candidates', candidateDetail: null })
      },
      discard: () => {
        window.history.replaceState(null, '', WORKSPACE_HASH.candidates)
        setRoute({ workspace: 'candidates', candidateDetail: null })
      },
    }),
    [],
  )

  return { ...route, navigate, candidateDetailNavigation }
}
