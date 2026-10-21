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

## Workshop authoring state

The Workshop's authoring workflow runs through one pure reducer, `workshopReducer` (`workshop/src/state/workshopReducer.ts`). `WorkshopApp` runs the side effects (sourcing requests, generation, publishing) and dispatches their results.

- **`draft`** is the durable working draft. It holds the clue, the active mode, the manual word text, the sourcing settings and reviewed pool (with include choices), each mode's Priority Words, the generation count (batch N uses seed `workshop-generation-N`), and the Final Puzzle (approved candidate, batch number, ID and clue, and its dev-calendar publication record, if any). It is plain JSON-compatible data, saved and restored as described below.
- **`session`** is workflow state that changes in the same transitions but never outlives the session: the unsaved batch, the selected candidate, the last Generate errors, the review/final stage, the Priority Word limit notice, and the result of re-checking a restored publication record.
- **Outside the reducer:** sourcing in-flight state and its error, the Authoring / Production Schedule view, focus bookkeeping, and everything inside `FinalPuzzle`, `PublishSection`, `ProductionPublishSection`, and `ProductionSchedule` (previews, confirmations, request status).
- **Derived, never stored:** the active pool's analysis (`analyzeActivePool`), Priority Word diagnostics, whether Generate is allowed, and the selected or approved candidate's position in the batch.
- **Behavior a later phase will change:** a new batch still clears the selection, the Final Puzzle, and its publication record, and `finalPuzzle` still embeds the candidate it was approved from.

## Workshop working draft

One working draft persists across refreshes, Workshop restarts, and switches between the regular Workshop (port 5174) and Production-operations mode (port 5175).

- **Where:** `workshop/.local/working-draft.json`, written only by the Workshop's own Vite server (`GET`/`PUT /api/draft`, `workshop/server/draft/`). The path is fixed and resolved from `vite.workshop.config.ts`, never taken from a request, so both modes share one file. Browser storage isn't used: the two modes are different origins and couldn't share it.
- **Format:** a versioned envelope `{ schemaVersion: 1, revision, savedAt, draft }`. Only the reducer's `draft` is saved. The server validates every write, and the browser validates what it loads, with the same schema (`workshop/src/draft/draftSchema.ts`). Candidate metrics are recomputed from the saved construction rather than trusted.
- **Revisions:** each successful write increases the revision by one. A write names the revision it was based on and is refused if the file has moved on, so neither mode silently overwrites the other. The author then chooses to load the saved draft or to keep their own.
- **Atomic writes across processes:** a write holds an exclusive lock file (created with `O_EXCL`), re-reads the revision, writes a temporary file in the same directory, `fsync`s it, and renames it over the draft. A lock older than 30 seconds is treated as left by a crash and broken; breaking a stale lock isn't itself atomic, which is accepted for one local author.
- **Autosave:** text typed into the clue, word list, author context, and Final Puzzle ID/clue saves 750 ms after the last change; every other change saves at once. One save is in flight at a time and always sends the newest draft. The header shows Draft saved / Saving draft… / Draft not saved. A failed save keeps the draft in memory and offers Retry; nothing retries on a timer. On page hide, unsaved changes are sent with `keepalive` as a best effort, so an edit made just before abruptly closing the browser may not be saved. Leaving the page while a save has failed or conflicted asks first.
- **Startup:** authoring stays hidden until the draft has loaded, so nothing can save an empty draft over a saved one. With no file, the Workshop starts empty and writes nothing until the first edit. A file that can't be read is reported and left untouched. The author can set it aside (renamed to `working-draft.invalid-<time>.json`, never deleted) and start a new draft, after confirming.
- **Session-only:** the generated batch and its selection aren't saved. A refresh keeps the inputs, Priority Words, generation count, and Final Puzzle, but drops unapproved candidates. The candidate list says so.
- **Restored Final Puzzle:** it can be opened from a "Final Puzzle" panel without its original batch.
- **New Puzzle:** after confirmation, an empty draft is saved first, and the Workshop resets only once that write succeeds. If the write fails, the current draft stays. A draft epoch drops any sourcing or publish response that arrives after the reset. Generation is synchronous, so it can't straddle one. New Puzzle never calls publishing or schedule endpoints.
- **Restored publications:** the dev-calendar publication that locks a Final Puzzle's ID and clue is saved with it. On restore it stays locked and is re-checked with the existing preview endpoint. If the dev calendar still has that ID with the same fingerprint, it stays locked. If the calendar has no puzzle with that ID, the record is cleared and the inputs unlock. If the calendar can't confirm (unreachable, or different content), the lock stays. Production publishing is unchanged; its own preview, typed-ID confirmation, and fingerprint check still apply.
- **Local-only:** the endpoint answers loopback clients and same-origin browser requests only, accepts JSON bodies up to 1 MB, and never serves `workshop/.local` as a static file (middleware and Vite's `server.fs.deny`). The directory is gitignored, isn't part of either build, and the player never mounts the endpoint.

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
- **"Not Quite There!"** is not persisted. It is transient UI state in `PuzzleSessionProvider` (`justFilledIncorrectly`), shown only when play fills the last empty cell while a letter is wrong, so a restored full-but-incorrect board loads quietly.

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
