// Workspace navigation through the URL hash (#/author, #/candidates,
// #/final, #/publish, and #/schedule in Production-operations mode). The
// route is view state only: it never enters the working draft, so a
// refresh restores the workspace from the URL and the draft from its file.
//
// Unknown routes, and #/schedule outside Production-operations mode, are
// replaced with #/author (no extra history entry), so a URL alone can never
// reach a Production-only view. Back and Forward work through hashchange.

import { useCallback, useEffect, useState } from 'react'

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

/** The workspace a hash names, or null when it names none available in this mode. */
export function parseWorkspaceHash(hash: string, { production }: { production: boolean }): Workspace | null {
  const match = (Object.entries(WORKSPACE_HASH) as [Workspace, string][]).find(([, value]) => value === hash)
  if (!match) return null
  if (match[0] === 'schedule' && !production) return null
  return match[0]
}

function currentWorkspace(production: boolean): Workspace {
  return parseWorkspaceHash(window.location.hash, { production }) ?? DEFAULT_WORKSPACE
}

function replaceHash(workspace: Workspace): void {
  window.history.replaceState(window.history.state, '', WORKSPACE_HASH[workspace])
}

export function useWorkspaceRoute(production: boolean): { workspace: Workspace; navigate: (workspace: Workspace) => void } {
  const [workspace, setWorkspace] = useState<Workspace>(() => currentWorkspace(production))

  useEffect(() => {
    // Normalize a missing or unknown hash without adding a history entry.
    if (parseWorkspaceHash(window.location.hash, { production }) === null) replaceHash(DEFAULT_WORKSPACE)
    const onHashChange = () => {
      const next = parseWorkspaceHash(window.location.hash, { production })
      if (next === null) replaceHash(DEFAULT_WORKSPACE)
      setWorkspace(next ?? DEFAULT_WORKSPACE)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [production])

  const navigate = useCallback((next: Workspace) => {
    setWorkspace(next)
    if (window.location.hash !== WORKSPACE_HASH[next]) window.location.hash = WORKSPACE_HASH[next]
  }, [])

  return { workspace, navigate }
}
