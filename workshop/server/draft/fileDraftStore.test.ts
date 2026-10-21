import { chmod, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDraftEnvelope } from '../../src/draft/draftSchema'
import { createInitialDraft } from '../../src/state/workshopReducer'
import { DraftLockTimeoutError } from './draftStore'
import { DRAFT_FILE_NAME, createFileDraftStore } from './fileDraftStore'
import { fullDraft } from './testDrafts'

// Every test uses its own temporary directory: never the real draft.
let directory: string
const draftFile = () => path.join(directory, DRAFT_FILE_NAME)
const lockFile = () => path.join(directory, 'working-draft.lock')
const store = (options: { lockTimeoutMs?: number; staleLockMs?: number } = {}) =>
  createFileDraftStore({ directory, now: () => new Date('2026-10-19T12:00:00.000Z'), ...options })

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'cluecross-draft-'))
})

afterEach(async () => {
  await chmod(directory, 0o700).catch(() => {})
  await rm(directory, { recursive: true, force: true })
})

describe('file draft store: reading', () => {
  it('reports no draft when the directory or file does not exist', async () => {
    expect(await createFileDraftStore({ directory: path.join(directory, 'missing') }).read()).toEqual({ kind: 'empty' })
    expect(await store().read()).toEqual({ kind: 'empty' })
  })

  it('reports malformed JSON, invalid drafts, and unsupported versions as invalid, leaving the file alone', async () => {
    for (const [text, message] of [
      ['{ not json', /not valid JSON/],
      [JSON.stringify({ schemaVersion: 1, revision: 1, savedAt: 'x', draft: { clue: 1 } }), /^draft\.sourcing must be an object/],
      [JSON.stringify({ schemaVersion: 9, revision: 1, savedAt: 'x', draft: {} }), /schema version 9/],
    ] as const) {
      await writeFile(draftFile(), text)
      const result = await store().read()
      expect(result.kind).toBe('invalid')
      if (result.kind === 'invalid') expect(result.message).toMatch(message)
      expect(await readFile(draftFile(), 'utf8')).toBe(text)
    }
  })
})

describe('file draft store: writing', () => {
  it('creates the directory, writes revision 1, then increments on each write', async () => {
    const nested = path.join(directory, 'workshop', '.local')
    const drafts = createFileDraftStore({ directory: nested })
    expect(await drafts.write({ baseRevision: 0, draft: createInitialDraft() })).toMatchObject({ kind: 'saved', revision: 1 })
    expect(await drafts.write({ baseRevision: 1, draft: fullDraft() })).toMatchObject({ kind: 'saved', revision: 2 })

    const saved = await drafts.read()
    expect(saved.kind).toBe('ok')
    if (saved.kind === 'ok') {
      expect(saved.envelope.revision).toBe(2)
      expect(saved.envelope.draft).toEqual(fullDraft())
    }
    // The file on disk is a valid envelope, and no temporary or lock file is left.
    const text = await readFile(path.join(nested, DRAFT_FILE_NAME), 'utf8')
    expect(parseDraftEnvelope(JSON.parse(text)).ok).toBe(true)
    expect(await readdir(nested)).toEqual([DRAFT_FILE_NAME])
  })

  it('rejects a stale write and leaves the newer draft in place', async () => {
    const drafts = store()
    await drafts.write({ baseRevision: 0, draft: createInitialDraft() })
    await drafts.write({ baseRevision: 1, draft: fullDraft() })
    const before = await readFile(draftFile(), 'utf8')
    expect(await drafts.write({ baseRevision: 1, draft: createInitialDraft() })).toEqual({ kind: 'conflict', revision: 2 })
    expect(await drafts.write({ baseRevision: 0, draft: createInitialDraft() })).toEqual({ kind: 'conflict', revision: 2 })
    expect(await readFile(draftFile(), 'utf8')).toBe(before)
  })

  it('a failed write keeps the previous file intact and leaves no partial file', async () => {
    const drafts = store()
    await drafts.write({ baseRevision: 0, draft: fullDraft() })
    const before = await readFile(draftFile(), 'utf8')
    await chmod(directory, 0o500) // the temporary file can't be created
    await expect(drafts.write({ baseRevision: 1, draft: createInitialDraft() })).rejects.toThrow()
    await chmod(directory, 0o700)
    expect(await readFile(draftFile(), 'utf8')).toBe(before)
    expect((await readdir(directory)).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })

  it('never overwrites an unreadable file unless explicitly replacing it, and then moves it aside', async () => {
    await writeFile(draftFile(), '{ broken')
    const drafts = store()
    expect(await drafts.write({ baseRevision: 0, draft: createInitialDraft() })).toEqual({
      kind: 'invalid-existing',
      message: 'The saved working draft is not valid JSON.',
    })
    expect(await readFile(draftFile(), 'utf8')).toBe('{ broken')

    expect(await drafts.write({ baseRevision: 0, draft: createInitialDraft(), replaceInvalid: true })).toMatchObject({
      kind: 'saved',
      revision: 1,
    })
    const files = await readdir(directory)
    const setAside = files.find((name) => name.startsWith('working-draft.invalid-'))!
    expect(setAside).toBe('working-draft.invalid-2026-10-19T12-00-00-000Z.json')
    expect(await readFile(path.join(directory, setAside), 'utf8')).toBe('{ broken')
    expect((await drafts.read()).kind).toBe('ok')
  })

  it('ignores replaceInvalid when the saved draft is valid', async () => {
    const drafts = store()
    await drafts.write({ baseRevision: 0, draft: fullDraft() })
    expect(await drafts.write({ baseRevision: 0, draft: createInitialDraft(), replaceInvalid: true })).toEqual({
      kind: 'conflict',
      revision: 1,
    })
  })
})

describe('file draft store: concurrency across processes', () => {
  it('two independent stores (as two Workshop servers) writing from the same revision: exactly one succeeds', async () => {
    await store().write({ baseRevision: 0, draft: createInitialDraft() })
    // Separate instances share nothing in memory; only the file system coordinates them.
    for (let round = 1; round <= 5; round++) {
      const results = await Promise.all([
        store().write({ baseRevision: round, draft: fullDraft() }),
        store().write({ baseRevision: round, draft: createInitialDraft() }),
        store().write({ baseRevision: round, draft: fullDraft({ published: true }) }),
      ])
      expect(results.filter((result) => result.kind === 'saved')).toHaveLength(1)
      expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(2)
      const saved = await store().read()
      expect(saved.kind === 'ok' && saved.envelope.revision).toBe(round + 1)
    }
  })

  it('waits for a lock held by another process, then writes', async () => {
    await writeFile(lockFile(), '999 held')
    const pending = store().write({ baseRevision: 0, draft: createInitialDraft() })
    setTimeout(() => void rm(lockFile()), 100)
    expect(await pending).toMatchObject({ kind: 'saved', revision: 1 })
  })

  it('times out rather than writing while another process holds the lock', async () => {
    await writeFile(lockFile(), '999 held')
    await expect(store({ lockTimeoutMs: 80 }).write({ baseRevision: 0, draft: createInitialDraft() })).rejects.toBeInstanceOf(
      DraftLockTimeoutError,
    )
    expect(await store().read()).toEqual({ kind: 'empty' })
  })

  it('breaks a lock left behind by a crashed process', async () => {
    await writeFile(lockFile(), '999 crashed')
    const old = new Date(Date.now() - 60_000)
    await utimes(lockFile(), old, old)
    expect(await store({ staleLockMs: 30_000 }).write({ baseRevision: 0, draft: createInitialDraft() })).toMatchObject({
      kind: 'saved',
    })
  })
})
