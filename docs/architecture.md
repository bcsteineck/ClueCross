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

- **`draft`** is the durable working draft. It holds the clue, the active mode, the manual word text, the sourcing settings and reviewed pool (with include choices), each mode's Priority Words, the generation count (batch N uses seed `workshop-generation-N`), Saved Candidates, and the Final Puzzle (a copy of the approved saved candidate, its position in Saved Candidates when approved, ID and clue, and its dev-calendar publication record, if any). It is plain JSON-compatible data, saved and restored as described below.
- **`session`** is workflow state that changes in the same transitions but never outlives the session: the unsaved batch, the Candidates tab and each tab's selection, the last Generate errors, the Priority Word limit notice, and the result of re-checking a restored publication record.
- **Outside the reducer:** the current workspace (the URL hash; see below), sourcing in-flight state and its error, candidate saves and removals being written (and their errors), focus bookkeeping, and everything inside `PublishSection`, `ProductionPublishSection`, and `ProductionSchedule` (previews, confirmations, request status).
- **Derived, never stored:** the active pool's analysis (`analyzeActivePool`), Priority Word diagnostics, whether Generate is allowed, candidate fingerprints, and positions in the batch or in Saved Candidates.

## Workshop candidate workflow

Current Batch → Saved Candidates → Final Puzzle → Publish, for one puzzle at a time. Saved Candidates is a shortlist for the puzzle being authored, not an archive: New Puzzle clears it.

- **Current Batch** is the latest generation, session-only. Its only action is Save Candidate. A new batch replaces it (unsaved candidates are gone, with no confirmation) and opens Current Batch; Saved Candidates and the Final Puzzle stay.
- **Saved Candidates** (`draft.savedCandidates`) is one list, oldest first, with no limit and no grouping by batch. Each entry is an unchanging snapshot: `{ fingerprint, candidate, origin: { batchSeed, number, clue }, savedAt, publication }` (origin fields are `null` when unknown; `publication` is described under "Publication records" below). Saved candidates offer Approve as Final Puzzle and Remove from Saved; the approved one offers Open Final Puzzle and can't be removed.
- **Identity:** a candidate is its fingerprint (`workshop/src/candidateFingerprint.ts`): the layout's bounding size plus every answer's word, direction, and start cell, translated so the top-left cell is 0,0, sorted, prefixed `v1`. The same crossword from any batch, seed, or clue has one fingerprint, so it's recognized as Saved or Approved and never saved twice; the same answers placed differently (including a rotation, which swaps Across and Down) are different candidates. Clues, seeds, timestamps, and gallery positions aren't part of it. The saved fingerprint is checked against its construction whenever a draft is read or written.
- **Approval** is only from Saved Candidates. It copies the saved candidate into `finalPuzzle` with an ID and clue suggested from the Author clue as it is now (not the clue it was generated under), and opens Final Puzzle. Approving another replaces it at once; clearing it (Final Puzzle → Clear Final Puzzle) removes only the approval. Invariant: the Final Puzzle is always one of Saved Candidates; the reducer can't remove the approved entry, and the schema refuses a draft that breaks the rule.
- **Publication records:** publishing is independent of approval. The durable record of a dev-calendar publication is the dev calendar's own; the Workshop never changes or removes it except through Publish (approval, Clear Final Puzzle, removing a saved candidate, and New Puzzle make no publishing requests). The draft keeps a copy, which locks the Final Puzzle's ID and clue, and that copy belongs to the candidate that was published: approving another candidate or clearing the Final Puzzle moves it, with the ID and clue it was published with, into that candidate's Saved Candidates entry (`publication: { inputs, published }`, otherwise `null`; the Final Puzzle's own entry never has one). The newly approved candidate starts unpublished. Approving the published candidate again restores its ID, clue, and lock, and re-checks the record with the dev calendar as a restored draft does. A publish that completes after the author approved another candidate is recorded on the candidate that published. Saved Candidates shows a kept record in that candidate's detail. Removing the candidate, or New Puzzle, discards the copy only.
- **Writes:** Save and Remove change the draft at once and go through the autosave queue with every other edit (so neither overwrites the other), but are shown as done only when a write containing them succeeds (`DraftSaver.waitUntilSaved`). Until then the candidate reads Saving… or Removing… (a save isn't listed or counted in Saved Candidates yet; a removal still is), its actions are `aria-disabled`, Start New Puzzle waits, and leaving the page shows the browser's own prompt. If the write fails (or conflicts, or the draft is replaced), the change is undone in the draft — a removal goes back where it was — and an alert beside the action explains it; the action can be tried again.
- **Candidates workspace:** both tabs share the gallery, inspector, and narrow detail screen; the active tab decides the actions and which candidates Previous/Next and swipes go through. Tabs show counts and follow the ARIA tabs pattern. Each tab remembers its selection; Saved Candidates starts on the oldest, and after a removal selects the candidate that took its place (on a narrow detail screen, it moves there, or back to the empty gallery after the last one).

## Workshop navigation

The Workshop is an application shell (`workshop/src/shell/`) around five workspaces (`workshop/src/workspaces/`, plus `FinalPuzzle` and `ProductionSchedule`):

| Route | Workspace | Contains |
| --- | --- | --- |
| `#/author` | Author | Authoring inputs (clue, authoring mode, manual words or sourcing and Pool Review) beside Generation (Priority Words, pool diagnostics, Generate) |
| `#/candidates` | Candidates | Generate, and the Current Batch and Saved Candidates tabs (gallery beside the inspector, with the tab's actions under the board) |
| `#/candidates/<key>`, `#/candidates/saved/<key>` | Candidates | Narrow workspaces only: one candidate's detail screen, in Current Batch or Saved Candidates (see "Narrow Candidates" below) |
| `#/final` | Final Puzzle | The approved board beside its ID and clue, validation, and answers |
| `#/publish` | Publish | One column: Readiness, Publishing actions (the dev calendar, then Production in Production-operations mode only), and the developer export under Advanced |
| `#/schedule` | Production Schedule | Production-operations mode only |

- **Routing:** a small hash router (`useWorkspaceRoute`). The route is view state only and never enters the working draft, so a refresh restores the workspace from the URL and the draft from its file. Back and Forward work. An unknown route, or `#/schedule` outside Production-operations mode, is replaced with `#/author`, so a URL alone never reaches a Production-only view.
- **State across workspaces:** `WorkshopApp` stays mounted and owns the reducer, the working draft, and every side effect, so moving between workspaces never resets the batch, the selection, or an in-flight sourcing request, and never saves anything. Local state inside the publishing components (a preview, a confirmation, a typed Production ID) resets when Publish is left, as it did when leaving Final Puzzle before.
- **Flow:** Generate (from Author or Candidates, one handler) shows the new batch in Current Batch; Save keeps the author where they are; Approve (in Saved Candidates) opens Final Puzzle; Back returns to Saved Candidates with focus on the approved candidate's Open control (on narrow workspaces, its card); New Puzzle returns to Author with focus on the clue. A failed Generate stays where it was, with the error.
- **Empty states:** Current Batch without a batch (for example after a refresh) says so and links to the Final Puzzle; an empty Saved Candidates offers View Current Batch; Final Puzzle and Publish explain what's missing. Publishing is offered only for a valid Final Puzzle, however Publish is reached.
- **Layouts:** each workspace's columns respond to the width of the content area (a container query on `<main>`), not the viewport, so the sidebar is accounted for. Author splits at 860px of content (about 65/35), Candidates at 760px (about 60/40), and Final Puzzle at 720px (the board, capped at 640px, then details). Below those, columns stack in DOM order, which is also the reading and Tab order; nothing is reordered visually. Nothing is sticky and no panel scrolls on its own: the inspector and both Author panels move with the page. Publish is a single column capped at 800px.
- **Narrow Candidates:** below 760px of content, the gallery and a candidate's detail are separate screens rather than stacked. The same container query sets `--ws-candidates-layout`, which `useCandidatesLayout` reads (re-read when the workspace or window resizes), so there is one breakpoint for CSS and React. The gallery is compact (board, number, answer count; two columns on phones from 360px, one on narrower ones). A card opens `#/candidates/<key>` (or `#/candidates/saved/<key>` in Saved Candidates), where the key is a hash of the candidate's fingerprint, so a key from an earlier batch can only name the same layout. The detail screen replaces the gallery's list tabs and note too (they return with the gallery), and is open rather than a panel so the board lines up with the page gutter. It is the inspector plus All Candidates, the position ("Candidate 3 of 20"), and Previous/Next, which also work by swiping the board (touch and pen; `touch-action: pan-y pinch-zoom` keeps vertical scrolling and zoom with the browser). History: opening a detail adds one entry; Previous/Next and swipes replace it; All Candidates goes back to the gallery's entry (or replaces the detail entry if there isn't one), so Back never reopens it, and Forward does. The gallery's scroll position is kept in its history entry's state (never the draft) and restored before paint, with focus on the card that was open. A detail key that names nothing in its collection (a refresh of the session-only batch, a replaced batch, a malformed URL) is replaced with `#/candidates`; a Saved detail URL survives a refresh, since Saved Candidates are in the draft. The detail route selects its candidate in that tab's selection, so widening shows that candidate in the inspector and narrowing again honours the URL.
- **Shell:** at 1024px and wider, a persistent 200px sidebar with labelled links (the current one has `aria-current="page"` and a visible bar). Below that, a top bar whose Menu opens the same links in a modal drawer: focus moves in, Tab stays inside, the rest of the page is `inert`, Escape or a choice closes it, and focus returns to Menu (or, after choosing another workspace, to its heading). Moving to a workspace focuses its heading. The Production-operations banner and the draft status bar (save status, New Puzzle) sit above every workspace.

## Workshop working draft

One working draft persists across refreshes, Workshop restarts, and switches between the regular Workshop (port 5174) and Production-operations mode (port 5175).

- **Where:** `workshop/.local/working-draft.json`, written only by the Workshop's own Vite server (`GET`/`PUT /api/draft`, `workshop/server/draft/`). The path is fixed and resolved from `vite.workshop.config.ts`, never taken from a request, so both modes share one file. Browser storage isn't used: the two modes are different origins and couldn't share it.
- **Format:** a versioned envelope `{ schemaVersion: 2, revision, savedAt, draft }`. Only the reducer's `draft` is saved. The server validates every write, and the browser validates what it loads, with the same schema (`workshop/src/draft/draftSchema.ts`). Candidate metrics are recomputed from the saved construction rather than trusted, saved fingerprints must match their constructions, and the Final Puzzle must be one of Saved Candidates.
- **Migration:** a version 1 file (before Saved Candidates) is migrated as it's read: its Final Puzzle, which always embeds the complete candidate, becomes the only saved candidate (origin unknown), and everything else is kept as is. The file is rewritten as version 2 by the next save. A version 1 file that fails validation stays unreadable, as before, rather than half-migrated. An older Workshop can't read a version 2 file (it reports an unsupported version and leaves the file alone).
- **Revisions:** each successful write increases the revision by one. A write names the revision it was based on and is refused if the file has moved on, so neither mode silently overwrites the other. The author then chooses to load the saved draft or to keep their own.
- **Atomic writes across processes:** a write holds an exclusive lock file (created with `O_EXCL`), re-reads the revision, writes a temporary file in the same directory, `fsync`s it, and renames it over the draft. A lock older than 30 seconds is treated as left by a crash and broken; breaking a stale lock isn't itself atomic, which is accepted for one local author.
- **Autosave:** text typed into the clue, word list, author context, and Final Puzzle ID/clue saves 750 ms after the last change; every other change saves at once. One save is in flight at a time and always sends the newest draft. The header shows Draft saved / Saving draft… / Draft not saved. A failed save keeps the draft in memory and offers Retry; nothing retries on a timer. On page hide, unsaved changes are sent with `keepalive` as a best effort, so an edit made just before abruptly closing the browser may not be saved. Leaving the page while a save has failed or conflicted asks first.
- **Startup:** authoring stays hidden until the draft has loaded, so nothing can save an empty draft over a saved one. With no file, the Workshop starts empty and writes nothing until the first edit. A file that can't be read is reported and left untouched. The author can set it aside (renamed to `working-draft.invalid-<time>.json`, never deleted) and start a new draft, after confirming.
- **Session-only:** the generated batch and the tab selections aren't saved. A refresh keeps the inputs, Priority Words, generation count, Saved Candidates, and Final Puzzle, but drops unsaved candidates. The candidate list says so.
- **Restored Final Puzzle:** it opens from Final Puzzle (or from the empty Candidates batch) without its original batch.
- **New Puzzle:** after confirmation (which names the working draft, the current batch, Saved Candidates, and the Final Puzzle), an empty draft is saved first, and the Workshop resets only once that write succeeds. It waits while a candidate save or removal is being written; a change still queued when the reset is written is never saved afterwards. If the write fails, the current draft stays. A draft epoch drops any sourcing or publish response that arrives after the reset. Generation is synchronous, so it can't straddle one. New Puzzle never calls publishing or schedule endpoints.
- **Restored publications:** the dev-calendar publication that locks a Final Puzzle's ID and clue is saved with it (or, for a saved candidate that isn't the Final Puzzle, with its Saved Candidates entry; see "Publication records"). On restore it stays locked and is re-checked with the existing preview endpoint. If the dev calendar still has that ID with the same fingerprint, it stays locked. If the calendar has no puzzle with that ID, the record is cleared and the inputs unlock. If the calendar can't confirm (unreachable, or different content), the lock stays. Production publishing is unchanged; its own preview, typed-ID confirmation, and fingerprint check still apply.
- **Local-only:** the endpoint answers loopback clients and same-origin browser requests only, accepts JSON bodies up to 8 MB (room for over a thousand saved candidates at about 6 KB each), and never serves `workshop/.local` as a static file (middleware and Vite's `server.fs.deny`). The directory is gitignored, isn't part of either build, and the player never mounts the endpoint.

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
