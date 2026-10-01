// Safety gate for the destructive Neon contract tests. They clear
// published_puzzles, so they may only ever run against the dedicated `test`
// branch: never main (the permanent calendar) and never dev (the Workshop's
// working database). The test branch is recognized by a marker table that
// exists only there.

export const TEST_BRANCH_MARKER_TABLE = 'cluecross_test_branch'

export type TestDatabaseDecision =
  | { run: false; reason: string }
  | { run: true; url: string }

/** Static checks, before any connection. A missing test URL skips; anything suspicious refuses. */
export function decideTestDatabase(env: { testUrl?: string; workshopUrl?: string }): TestDatabaseDecision {
  const testUrl = env.testUrl?.trim()
  if (!testUrl) return { run: false, reason: 'PUBLISHING_TEST_DATABASE_URL is not set.' }
  if (env.workshopUrl?.trim() === testUrl) {
    throw new Error('Refusing destructive tests: PUBLISHING_TEST_DATABASE_URL equals PUBLISHING_DATABASE_URL.')
  }
  return { run: true, url: testUrl }
}

/** Run against the connected database before any destructive statement. */
export function assertTestBranchMarker(markerPresent: boolean): void {
  if (!markerPresent) {
    throw new Error(
      `Refusing destructive tests: the ${TEST_BRANCH_MARKER_TABLE} marker table is missing, so this is not the test branch.`,
    )
  }
}
