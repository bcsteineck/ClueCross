// Undo/Redo for one Editor session: whole layouts (words and pool), one
// entry per completed operation. Session-only — never saved, and started
// fresh whenever an edited version is opened or branched.

import type { EditorLayout } from './editorLayout'

export interface EditorHistory {
  /** Layouts before each completed operation, oldest first. */
  past: EditorLayout[]
  /** Layouts undone, most recently undone last. */
  future: EditorLayout[]
}

export const EMPTY_HISTORY: EditorHistory = { past: [], future: [] }

/** Records a completed operation that replaced `previous`; anything undone can no longer be redone. */
export function recordEdit(history: EditorHistory, previous: EditorLayout): EditorHistory {
  return { past: [...history.past, previous], future: [] }
}

export function undo(history: EditorHistory, current: EditorLayout): { history: EditorHistory; layout: EditorLayout } | null {
  const layout = history.past.at(-1)
  if (!layout) return null
  return { layout, history: { past: history.past.slice(0, -1), future: [...history.future, current] } }
}

export function redo(history: EditorHistory, current: EditorLayout): { history: EditorHistory; layout: EditorLayout } | null {
  const layout = history.future.at(-1)
  if (!layout) return null
  return { layout, history: { past: [...history.past, current], future: history.future.slice(0, -1) } }
}
