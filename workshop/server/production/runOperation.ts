// One Production operation, run inside a short-lived child process that
// `vercel env run -e production` started with the Production environment
// (see productionBridge.ts and runner.mjs). The order is fixed:
//
//   1. parse the single JSON operation from stdin (no database access yet);
//   2. read ONLY the Production direct connection variable;
//   3. prove the database is the Production calendar: the
//      cluecross_production_calendar marker (db/migrations/0003) must exist
//      and the test branch's cluecross_test_branch marker must not;
//   4. run the operation through productionOperations.ts;
//   5. return one sanitized result.
//
// Nothing returned here ever contains a connection string, host, user,
// password, or driver error text: every failure is a fixed message.

import { neon } from '@neondatabase/serverless'
import { createNeonPublicationStore } from '../publishing/neonPublicationStore'
import type { PublicationStore } from '../publishing/publicationStore'
import { TEST_BRANCH_MARKER_TABLE } from '../publishing/testDatabaseGuard'
import { parseProductionOperation, runProductionOperation } from './productionOperations'
import type { ProductionOperationBody } from './productionOperations'

/** The Vercel Neon integration's direct (unpooled) Production connection — the only variable read. */
export const PRODUCTION_DATABASE_URL_VARIABLE = 'DATABASE_URL_UNPOOLED'
export const PRODUCTION_MARKER_TABLE = 'cluecross_production_calendar'
/** Prefixes the one result line on stdout, so CLI noise around it is ignored. */
export const RESULT_PREFIX = 'CLUECROSS_PRODUCTION_RESULT '

/** 'uncertain' comes only from the bridge: the child gave no result, so a change may or may not have happened. */
export type RunnerFailure = 'bad-request' | 'not-configured' | 'identity' | 'unavailable' | 'uncertain'

export type RunnerResponse =
  | { ok: true; body: ProductionOperationBody }
  | { ok: false; error: RunnerFailure; message: string }

export interface DatabaseIdentity {
  productionMarker: boolean
  testMarker: boolean
}

export interface RunnerDeps {
  checkIdentity: (url: string) => Promise<DatabaseIdentity>
  createStore: (url: string) => PublicationStore
}

export const IDENTITY_SQL = 'SELECT to_regclass($1) IS NOT NULL AS production, to_regclass($2) IS NOT NULL AS test'

const defaultDeps: RunnerDeps = {
  async checkIdentity(url) {
    const [row] = (await neon(url).query(IDENTITY_SQL, [`public.${PRODUCTION_MARKER_TABLE}`, `public.${TEST_BRANCH_MARKER_TABLE}`])) as {
      production: boolean
      test: boolean
    }[]
    return { productionMarker: row?.production === true, testMarker: row?.test === true }
  },
  createStore: (url) => createNeonPublicationStore(url),
}

const failure = (error: RunnerFailure, message: string): RunnerResponse => ({ ok: false, error, message })

export async function runOperation(
  input: string,
  env: Record<string, string | undefined>,
  deps: RunnerDeps = defaultDeps,
): Promise<RunnerResponse> {
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    return failure('bad-request', 'The Production operation was not valid JSON.')
  }
  const parsed = parseProductionOperation(value)
  if (!parsed.ok) return failure('bad-request', parsed.message)

  const url = env[PRODUCTION_DATABASE_URL_VARIABLE]?.trim()
  if (!url) {
    return failure('not-configured', 'The Production database connection is not available to this operation. Nothing was read or changed.')
  }

  let identity: DatabaseIdentity
  try {
    identity = await deps.checkIdentity(url)
  } catch {
    return failure('unavailable', 'Couldn’t reach the Production database to verify it. Nothing was read or changed.')
  }
  if (identity.testMarker || !identity.productionMarker) {
    return failure(
      'identity',
      'This database could not be verified as the ClueCross Production calendar (marker missing or test marker present). Nothing was read or changed.',
    )
  }

  try {
    return { ok: true, body: await runProductionOperation(parsed.operation, deps.createStore(url)) }
  } catch {
    return failure('unavailable', 'The Production operation failed. Nothing was changed unless the schedule shows otherwise; refresh it.')
  }
}
