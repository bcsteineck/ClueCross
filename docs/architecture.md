# Architecture

ClueCross has two apps in one repository:

- the **player**, a Vite + React SPA deployed on Vercel;
- the private **Workshop**, a separate Vite app that runs only locally.

Puzzles reach players through a published calendar in Neon Postgres. The player bundle contains no puzzle data.

## Publishing (write path)

Workshop Final Puzzle → server-side validation → publishing service → Neon `published_puzzles`.

- **The Workshop server does all writes.** It re-assembles and re-validates the puzzle, computes the content fingerprint, and assigns the next permanent `publishDate`.
- **Writes use SERIALIZABLE transactions** with at most three fresh attempts.
- **Code:** `workshop/server/publishing/` (writes) and `src/publishing/` (shared pure rules).
- **Released rows are permanent.** A released puzzle (its release instant has passed by database time) is never edited, moved, replaced, or removed. The same ID with the same content is an idempotent success; with different content it is a conflict.
- **Scheduled rows are a future queue.** New puzzles append at the next date. An unreleased puzzle may be deliberately removed; every later scheduled puzzle then moves forward one day, in order, in the same transaction (`workshop/server/publishing/scheduleManagement.ts`). The delete and each move re-check the release guard against `statement_timestamp()`, so a released row can never change, and moves run in ascending date order so the unique `publish_date` constraint never collides.
- **No public write endpoint exists**, and the Workshop is not deployed.

## Production operations (Workshop)

`npm run workshop:production-ops` starts the Workshop on port 5175 with Production Preview / Publish in Final Puzzle and a **Production Schedule** view (release status, removal with backfill). Plain `npm run workshop` (port 5174) has none of this: every `/api/production/*` request answers "disabled".

Workshop browser → `/api/production/*` (same-origin, JSON, typed puzzle-ID confirmation) → `vercel env run -e production -- node workshop/server/production/runner.mjs` (one short-lived child per operation; the operation on stdin) → identity check → the existing publishing/schedule services → one sanitized result line → child exits.

- **Credentials:** only the child process has Production's `DATABASE_URL_UNPOOLED`, injected by the Vercel CLI. The Workshop server, the browser, `.env.local`, command lines, and logs never hold it. The Workshop's own publishing store stays on `dev`.
- **Identity:** the runner refuses unless the `cluecross_production_calendar` marker table exists (`db/migrations/0003`, applied to `main` only) and the test branch's `cluecross_test_branch` marker does not.
- **Exact content:** Production Preview and Publish send the approved `{ construction, id, clue }` from Final Puzzle. Publish also sends the previewed fingerprint; `publishFinalPuzzle` refuses different content before writing.
- **Privacy:** the schedule is metadata only (ID, clue, date, release instant, status, fingerprint) and never passes through the player's `api/`. `cluecross_reader` is unchanged and still sees released rows only.
- **Out of scope:** correcting or replacing a released (live) puzzle, editing a scheduled puzzle in place, reordering, and any removal history.

## Release and read path

Neon `published_puzzles` → `released_puzzles` view → `cluecross_reader` → `PUZZLES_READ_DATABASE_URL` → `/api/calendar`, `/api/puzzle?date=` → player.

- **`released_puzzles`** is a security-barrier view (`db/migrations/0002`). It exposes only rows whose release instant has passed by database time.
- **`cluecross_reader`** can `SELECT` that view and nothing else.
- **`server/puzzles/`** holds framework-free handlers that re-check every row against the release rule. `api/` holds thin Vercel Function adapters, and `vite.config.ts` serves the same routes locally.
- **Responses:**
  - a gap and an unreleased date return identical 404s;
  - released puzzles are cached as immutable;
  - the calendar's CDN cache expires before the next release.

## Release rule

- Official timezone: **America/New_York**.
- A puzzle dated D releases at **10:00 PM Eastern on D − 1**.
- Status is derived from database time. There is no stored status flag and no cron job.

## Player

- **The server decides the current puzzle:** the released puzzle with the greatest `publishDate`. The browser clock never authorizes availability.
- **"Today's Clue"** labels the current puzzle, even between 10 PM and midnight Eastern, when its date is the next civil day.
- **The Archive** lists released dates only; gaps stay unavailable.
- **Opening the Archive** refreshes the calendar. An active puzzle is never replaced when a release passes; a reload or new visit gets the new current puzzle.
- **No data:** if the calendar is loading, fails, or is empty, the player shows a loading, error-with-Retry, or no-puzzle state. It never falls back to a bundled puzzle.

## Persistence

- **Completed results** stay in `localStorage` (`cluecross:completed-dates`, `cluecross:puzzle-results`), keyed by `${publishDate}:${puzzleId}`.
- **Unfinished progress** is saved in `localStorage` too (`cluecross:puzzle-progress`, same key), so a refresh or a later visit continues the same game, including its spent free reveals. Each entry stores only the non-empty cell values and the order of revealed letters (`src/core/puzzleProgress.ts`). Score, free reveals left, Reveal History, and locked cells are rebuilt by replaying those reveals through the game engine (`restoreGameState`), and a save that doesn't replay exactly is discarded.
- **Load order:** this page's in-memory session, then a completed result (authoritative), then saved unfinished progress, then a fresh game. Completing a puzzle removes its unfinished entry.
- **Players can't reset a puzzle.** The only reset is the dev/Preview-only Reset Test State, which also clears the puzzle's unfinished progress.
- Everything is per browser and device. It stops a casual refresh from handing back free reveals; it doesn't stop someone from clearing site data or replaying on another device. There are no accounts and no cross-device sync.

## Environments

| Context | Database access |
| --- | --- |
| Local Workshop | Neon `dev` branch, read-write (`PUBLISHING_DATABASE_URL`) |
| Automated destructive DB tests | Neon `test` branch, which needs the `cluecross_test_branch` marker (`PUBLISHING_TEST_DATABASE_URL`, `PUBLISHING_TEST_READER_DATABASE_URL`) |
| Local player dev server | `dev` reader (`PUZZLES_READ_DATABASE_URL` in `.env.local`) |
| Vercel Preview player | `dev` reader (Preview-only `PUZZLES_READ_DATABASE_URL`) |
| Vercel Production player | `main`'s `cluecross_reader` (Production-only `PUZZLES_READ_DATABASE_URL`) |
| Workshop Production operations | `main`, read-write, only inside a short-lived `vercel env run -e production` child (`DATABASE_URL_UNPOOLED`); requires the `0003` marker on `main` |

## Test fixtures and reserved IDs

- **Fixtures:** the legacy hand-authored puzzles (`dogs`, `space`, `flower`) and `sample` live in `src/testing/fixtures/` as test fixtures only. Isolation tests keep them out of the player runtime.
- **Reserved IDs:** `src/publishing/reservedPuzzleIds.ts` reserves those IDs, plus the retired `fruit` and `magic`, so they can never be published.
- **Developer Export** in the Workshop is a debug/fallback tool. It is not a release path.
