import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { MemoryPublicationStore } from '../publishing/memoryPublicationStore'
import { catsRequest, publicationFor } from '../publishing/testFixtures'
import { PRODUCTION_DATABASE_URL_VARIABLE, PRODUCTION_MARKER_TABLE, RESULT_PREFIX, runOperation } from './runOperation'
import type { DatabaseIdentity, RunnerDeps } from './runOperation'

const SECRET_URL = 'postgresql://neondb_owner:s3cret-pass@ep-main-host.example/neondb?sslmode=require'
const SCHEDULE = JSON.stringify({ operation: 'schedule' })

async function deps(identity: DatabaseIdentity | Error) {
  const store = new MemoryPublicationStore({
    now: new Date('2026-10-06T16:00:00.000Z'),
    records: [await publicationFor(catsRequest({ id: 'outerspace', clue: 'Outer Space' }), '2026-10-06')],
  })
  const checkIdentity = vi.fn<RunnerDeps['checkIdentity']>(async () => {
    if (identity instanceof Error) throw identity
    return identity
  })
  const createStore = vi.fn<RunnerDeps['createStore']>(() => store)
  return { checkIdentity, createStore, store }
}

const PRODUCTION: DatabaseIdentity = { productionMarker: true, testMarker: false }

describe('Production runner', () => {
  it('runs one operation against a verified Production database', async () => {
    const d = await deps(PRODUCTION)
    const result = await runOperation(SCHEDULE, { [PRODUCTION_DATABASE_URL_VARIABLE]: SECRET_URL }, d)
    expect(result).toMatchObject({ ok: true, body: { status: 'ok', schedule: { summary: { currentDate: '2026-10-06' } } } })
    expect(d.checkIdentity).toHaveBeenCalledWith(SECRET_URL)
    expect(d.createStore).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('s3cret')
  })

  it('refuses without the Production marker, before creating a store', async () => {
    const d = await deps({ productionMarker: false, testMarker: false })
    expect(await runOperation(SCHEDULE, { [PRODUCTION_DATABASE_URL_VARIABLE]: SECRET_URL }, d)).toMatchObject({ ok: false, error: 'identity' })
    expect(d.createStore).not.toHaveBeenCalled()
  })

  it('refuses any database with the test marker, even if it also has the Production marker', async () => {
    const d = await deps({ productionMarker: true, testMarker: true })
    expect(await runOperation(SCHEDULE, { [PRODUCTION_DATABASE_URL_VARIABLE]: SECRET_URL }, d)).toMatchObject({ ok: false, error: 'identity' })
    expect(d.createStore).not.toHaveBeenCalled()
  })

  it('reads only the Production direct connection variable', async () => {
    const d = await deps(PRODUCTION)
    const others = { DATABASE_URL: SECRET_URL, POSTGRES_URL: SECRET_URL, PUBLISHING_DATABASE_URL: SECRET_URL, PUZZLES_READ_DATABASE_URL: SECRET_URL }
    expect(await runOperation(SCHEDULE, others, d)).toMatchObject({ ok: false, error: 'not-configured' })
    expect(d.checkIdentity).not.toHaveBeenCalled()
  })

  it('rejects malformed input before touching the database', async () => {
    const d = await deps(PRODUCTION)
    for (const input of ['not json', '{"operation":"drop-table"}', JSON.stringify({ operation: 'remove', puzzleId: 'x' })]) {
      expect(await runOperation(input, { [PRODUCTION_DATABASE_URL_VARIABLE]: SECRET_URL }, d)).toMatchObject({ ok: false, error: 'bad-request' })
    }
    expect(d.checkIdentity).not.toHaveBeenCalled()
  })

  it('never echoes driver or connection errors', async () => {
    const d = await deps(new Error(`connect failed for ${SECRET_URL}`))
    const result = await runOperation(SCHEDULE, { [PRODUCTION_DATABASE_URL_VARIABLE]: SECRET_URL }, d)
    expect(result).toMatchObject({ ok: false, error: 'unavailable' })
    expect(JSON.stringify(result)).not.toMatch(/s3cret|neondb_owner|ep-main-host|postgresql/)
  })

  it('the launcher writes the same result prefix and reads its operation from stdin, never argv', () => {
    const launcher = readFileSync(new URL('./runner.mjs', import.meta.url), 'utf8')
    expect(launcher).toContain(`const RESULT_PREFIX = '${RESULT_PREFIX}'`)
    expect(launcher).toMatch(/process\.stdin/)
    expect(launcher).not.toMatch(/process\.argv/)
    expect(launcher).toMatch(/logLevel: 'silent'/)
  })

  it('names the marker created by migration 0003', () => {
    const migration = readFileSync(new URL('../../../db/migrations/0003_production_marker.sql', import.meta.url), 'utf8')
    expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${PRODUCTION_MARKER_TABLE}`)
  })
})
