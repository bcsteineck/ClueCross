// The one working draft, stored as a versioned JSON file in a fixed,
// server-chosen directory (workshop/.local by default). Node only.
//
// Writes are compare-and-swap on the revision: a write names the revision
// it was based on, and is refused (conflict) unless that is still the saved
// revision. Two Workshop servers (the regular one and Production-operations
// mode) are separate processes sharing this file, so coordination is
// file-system level, not in memory: each write holds an exclusive lock file
// (created with O_EXCL) while it reads the current revision, writes the new
// envelope to a temporary file in the same directory, and renames it over
// the draft. Rename within a directory is atomic, so a reader sees the old
// or the new file, never a partial one.
//
// A lock left behind by a crashed process is broken after staleLockMs.
// Breaking it is not itself atomic; two processes breaking the same stale
// lock at the same instant could both proceed. That needs a crash followed
// by simultaneous writes from both Workshops, and is accepted for one
// local author.
//
// An unreadable saved file is never overwritten or deleted by a normal
// write. Only an explicit replaceInvalid write moves it aside (to
// working-draft.invalid-<time>.json) and starts again at revision 1.

import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { DRAFT_SCHEMA_VERSION, parseDraftEnvelope } from '../../src/draft/draftSchema'
import type { DraftEnvelope } from '../../src/draft/draftSchema'
import { DraftLockTimeoutError } from './draftStore'
import type { DraftReadResult, DraftStore, DraftWriteRequest, DraftWriteResult } from './draftStore'

export const DRAFT_FILE_NAME = 'working-draft.json'
const LOCK_FILE_NAME = 'working-draft.lock'

export interface FileDraftStoreOptions {
  directory: string
  now?: () => Date
  lockTimeoutMs?: number
  staleLockMs?: number
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function createFileDraftStore({
  directory,
  now = () => new Date(),
  lockTimeoutMs = 5_000,
  staleLockMs = 30_000,
}: FileDraftStoreOptions): DraftStore {
  const draftPath = path.join(directory, DRAFT_FILE_NAME)
  const lockPath = path.join(directory, LOCK_FILE_NAME)

  async function read(): Promise<DraftReadResult> {
    let text: string
    try {
      text = await readFile(draftPath, 'utf8')
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return { kind: 'empty' }
      throw error
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return { kind: 'invalid', message: 'The saved working draft is not valid JSON.' }
    }
    const parsed = parseDraftEnvelope(json)
    return parsed.ok ? { kind: 'ok', envelope: parsed.value } : { kind: 'invalid', message: parsed.message }
  }

  async function acquireLock(): Promise<() => Promise<void>> {
    const deadline = Date.now() + lockTimeoutMs
    for (;;) {
      try {
        const handle = await open(lockPath, 'wx')
        await handle.writeFile(`${process.pid} ${now().toISOString()}\n`)
        await handle.close()
        return () => rm(lockPath, { force: true })
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error
      }
      try {
        const { mtimeMs } = await stat(lockPath)
        if (Date.now() - mtimeMs > staleLockMs) {
          await rm(lockPath, { force: true })
          continue
        }
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue // released meanwhile
        throw error
      }
      if (Date.now() >= deadline) throw new DraftLockTimeoutError()
      await sleep(20)
    }
  }

  async function writeAtomically(envelope: DraftEnvelope): Promise<void> {
    const tempPath = path.join(directory, `${DRAFT_FILE_NAME}.${process.pid}.${randomUUID()}.tmp`)
    try {
      const handle = await open(tempPath, 'wx')
      try {
        await handle.writeFile(`${JSON.stringify(envelope, null, 2)}\n`)
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(tempPath, draftPath)
    } catch (error) {
      await rm(tempPath, { force: true })
      throw error
    }
  }

  async function write({ baseRevision, draft, replaceInvalid = false }: DraftWriteRequest): Promise<DraftWriteResult> {
    await mkdir(directory, { recursive: true })
    const release = await acquireLock()
    try {
      const current = await read()
      let currentRevision = 0
      if (current.kind === 'invalid') {
        if (!replaceInvalid) return { kind: 'invalid-existing', message: current.message }
        const stamp = now().toISOString().replace(/[:.]/g, '-')
        await rename(draftPath, path.join(directory, `working-draft.invalid-${stamp}.json`))
      } else if (current.kind === 'ok') {
        currentRevision = current.envelope.revision
      }
      if (baseRevision !== currentRevision) return { kind: 'conflict', revision: currentRevision }

      const envelope: DraftEnvelope = {
        schemaVersion: DRAFT_SCHEMA_VERSION,
        revision: currentRevision + 1,
        savedAt: now().toISOString(),
        draft,
      }
      await writeAtomically(envelope)
      return { kind: 'saved', revision: envelope.revision, savedAt: envelope.savedAt }
    } finally {
      await release()
    }
  }

  return { read, write }
}
