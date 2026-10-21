// Autosave for the working draft, independent of React so its timing can be
// tested directly.
//
// - One save at a time. A save always sends the newest draft; edits made
//   while a save is in flight are sent by the next one, so an older draft
//   can never land after a newer one, whatever order responses arrive in.
// - Typed edits wait DRAFT_SAVE_DEBOUNCE_MS after the last change; discrete
//   actions (approving, Priority Words, Pool Review choices, a new sourced
//   pool) save at once. Either way the same queue is used, so order holds.
// - Every save names the revision it is based on. A conflict (the saved
//   draft moved on in another Workshop window or mode) stops autosaving
//   until the author chooses how to resolve it; it is never retried or
//   overwritten automatically.
// - A failed save keeps the draft in memory and reports it. Nothing retries
//   on a timer: the next edit, or Retry, tries again.

import type { WorkshopDraft } from '../state/workshopReducer'
import type { DraftClient } from './draftClient'

/** Long enough to batch typing, short enough that a pause is almost always saved. */
export const DRAFT_SAVE_DEBOUNCE_MS = 750

export type DraftSaveStatus =
  | { kind: 'saved' }
  /** Changes are waiting for the debounce. */
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'failed'; message: string }
  /** The saved draft is now at `revision`, written elsewhere. Autosave is paused. */
  | { kind: 'conflict'; revision: number }

export type ReplaceResult = { ok: true } | { ok: false; message: string }

const UNREACHABLE = 'Couldn’t reach the Workshop server.'

export class DraftSaver {
  private revisionValue: number
  /** The draft as last durably saved (or loaded). */
  private saved: WorkshopDraft
  /** The newest draft the app has. */
  private latest: WorkshopDraft
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<void> | null = null
  private conflictRevision: number | null = null
  /** A replaceWith is writing; edits are recorded but not saved until it settles. */
  private replacing = false
  private disposed = false

  private readonly client: DraftClient
  private readonly onStatus: (status: DraftSaveStatus) => void
  private readonly debounceMs: number

  constructor(
    client: DraftClient,
    revision: number,
    saved: WorkshopDraft,
    onStatus: (status: DraftSaveStatus) => void,
    debounceMs = DRAFT_SAVE_DEBOUNCE_MS,
  ) {
    this.client = client
    this.onStatus = onStatus
    this.debounceMs = debounceMs
    this.revisionValue = revision
    this.saved = saved
    this.latest = saved
  }

  get revision(): number {
    return this.revisionValue
  }

  hasUnsavedChanges(): boolean {
    return this.latest !== this.saved
  }

  /** Records the app's newest draft and schedules saving it. */
  update(draft: WorkshopDraft, { immediate }: { immediate: boolean }): void {
    if (this.disposed || draft === this.latest) return
    this.latest = draft
    if (this.conflictRevision !== null || this.replacing) return // paused; the draft stays in memory
    if (!this.hasUnsavedChanges()) {
      this.clearTimer()
      if (!this.running) this.setStatus({ kind: 'saved' })
      return
    }
    if (immediate) {
      void this.flush()
      return
    }
    if (!this.running) this.setStatus({ kind: 'pending' })
    this.clearTimer()
    this.timer = setTimeout(() => void this.flush(), this.debounceMs)
  }

  /** Saves now (also Retry). Resolves once nothing more can be saved. */
  flush(): Promise<void> {
    this.clearTimer()
    if (this.disposed || this.conflictRevision !== null || this.replacing) return Promise.resolve()
    this.running ??= this.run().finally(() => {
      this.running = null
    })
    return this.running
  }

  /**
   * Durably replaces the saved draft (New Puzzle). Waits for any save in
   * flight first. On failure nothing changes: the current draft stays and
   * remains unsaved or saved exactly as before.
   */
  async replaceWith(draft: WorkshopDraft): Promise<ReplaceResult> {
    if (this.conflictRevision !== null) {
      return { ok: false, message: 'Resolve the save conflict before starting a new puzzle.' }
    }
    this.clearTimer()
    this.replacing = true
    try {
      await this.running
      if (this.conflictRevision !== null) {
        return { ok: false, message: 'The saved draft was changed in another Workshop window or mode.' }
      }
      const result = await this.client.save({ baseRevision: this.revisionValue, draft })
      if (!result.ok) return { ok: false, message: UNREACHABLE }
      const { body } = result
      if (body.status === 'saved') {
        // Edits made while the reset was writing belonged to the old puzzle.
        this.revisionValue = body.revision
        this.saved = draft
        this.latest = draft
        this.setStatus({ kind: 'saved' })
        return { ok: true }
      }
      if (body.status === 'conflict') {
        this.pauseForConflict(body.revision)
        return { ok: false, message: 'The saved draft was changed in another Workshop window or mode.' }
      }
      return { ok: false, message: body.message }
    } finally {
      this.replacing = false
      // A failed reset leaves the current draft in place; keep saving it.
      if (this.hasUnsavedChanges() && this.conflictRevision === null) void this.flush()
    }
  }

  /** Conflict resolution: keep this window's draft, replacing the newer saved one. */
  overwriteAfterConflict(): Promise<void> {
    if (this.conflictRevision === null) return Promise.resolve()
    this.revisionValue = this.conflictRevision
    this.conflictRevision = null
    return this.flush()
  }

  /** Best effort while the page unloads: the request may or may not complete. */
  flushOnPageHide(): void {
    if (this.disposed || this.running || this.conflictRevision !== null || !this.hasUnsavedChanges()) return
    void this.client.save({ baseRevision: this.revisionValue, draft: this.latest }, { keepalive: true })
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
  }

  private async run(): Promise<void> {
    // A pending reset takes over once the save in flight finishes.
    while (!this.disposed && this.conflictRevision === null && !this.replacing && this.hasUnsavedChanges()) {
      const snapshot = this.latest
      this.setStatus({ kind: 'saving' })
      const result = await this.client.save({ baseRevision: this.revisionValue, draft: snapshot })
      if (this.disposed) return
      if (!result.ok) {
        this.setStatus({ kind: 'failed', message: UNREACHABLE })
        return
      }
      const { body } = result
      if (body.status === 'conflict') {
        this.pauseForConflict(body.revision)
        return
      }
      if (body.status !== 'saved') {
        this.setStatus({ kind: 'failed', message: body.message })
        return
      }
      this.revisionValue = body.revision
      this.saved = snapshot
    }
    if (!this.disposed && this.conflictRevision === null && !this.replacing) this.setStatus({ kind: 'saved' })
  }

  private pauseForConflict(revision: number): void {
    this.clearTimer()
    this.conflictRevision = revision
    this.setStatus({ kind: 'conflict', revision })
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private setStatus(status: DraftSaveStatus): void {
    this.onStatus(status)
  }
}
