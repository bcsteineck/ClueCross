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
- **Writes are permanent.** A date is unique and never moves. The same ID with the same content is an idempotent success; with different content it is a conflict.
- **No public write endpoint exists**, and the Workshop is not deployed.

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
- **In-progress state** lives in page-session memory only.
- There are no accounts and no cross-device sync.

## Environments

| Context | Database access |
| --- | --- |
| Local Workshop | Neon `dev` branch, read-write (`PUBLISHING_DATABASE_URL`) |
| Automated destructive DB tests | Neon `test` branch, which needs the `cluecross_test_branch` marker (`PUBLISHING_TEST_DATABASE_URL`, `PUBLISHING_TEST_READER_DATABASE_URL`) |
| Local player dev server | `dev` reader (`PUZZLES_READ_DATABASE_URL` in `.env.local`) |
| Vercel Preview player | `dev` reader (Preview-only `PUZZLES_READ_DATABASE_URL`) |
| Vercel Production player | **Not configured yet.** It will be `main`'s `cluecross_reader`, after migration `0002` is applied to `main` |

**Production rollout has not happened.** `main` holds no published puzzles, and production still serves the previous player.

## Test fixtures and reserved IDs

- **Fixtures:** the legacy hand-authored puzzles (`dogs`, `space`, `flower`) and `sample` live in `src/testing/fixtures/` as test fixtures only. Isolation tests keep them out of the player runtime.
- **Reserved IDs:** `src/publishing/reservedPuzzleIds.ts` reserves those IDs, plus the retired `fruit` and `magic`, so they can never be published.
- **Developer Export** in the Workshop is a debug/fallback tool. It is not a release path.
