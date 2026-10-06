# Decisions

## 2026-10-05

### Production publishing and the scheduled queue

Publishing to Production no longer needs a captured browser request or a hand-started Production server. A Workshop started with `npm run workshop:production-ops` adds Production Preview / Publish to Final Puzzle and a Production Schedule view. Each operation runs in its own short-lived child process that `vercel env run -e production` starts. The Workshop server itself never holds a Production credential, and plain `npm run workshop` cannot reach Production at all.

The calendar invariant changes for unreleased rows only:

- **Released puzzles are immutable history.** No Workshop operation edits, moves, replaces, or removes one. Correcting a live puzzle stays out of scope.
- **Scheduled puzzles are a future queue.** New puzzles still append through `publishFinalPuzzle`'s date assignment. A scheduled puzzle may be removed; every later scheduled puzzle moves forward one day, in order, in one SERIALIZABLE transaction, so the queue never has an internal gap. A removed puzzle is simply deleted: there is no removal history, and its ID may be reused.

Removability is decided by database time inside the removal transaction, never by the browser. The confirmation carries the previewed date and fingerprint plus the typed puzzle ID, and a mismatch changes nothing. The puzzle ID is the removal identity, so retrying a completed removal reports "not found" rather than removing the puzzle that moved into its date. Moves run in ascending date order, which keeps the non-deferrable `UNIQUE (publish_date)` constraint valid without a schema change.

Production Publish sends the previewed content fingerprint, and the existing service refuses changed content before writing. Validation, fingerprinting, idempotency, and date assignment stay in `publishFinalPuzzle`.

Before any operation, the Production runner requires a `cluecross_production_calendar` marker table (`db/migrations/0003`, applied to `main` only) and the absence of the test marker. Until 0003 is applied to `main`, every Production operation is refused.

The older notes below that describe dates as never moving refer to released history and to v1 before this change. Migrations 0001 and 0002 are unchanged.

---

## 2026-10-02

### Player publishing cutover

The player now reads only from the published calendar: `/api/calendar` and `/api/puzzle?date=`, served from the release-gated `released_puzzles` view as the read-only `cluecross_reader` role (see `docs/architecture.md`). The server decides the current puzzle and which dates are available. The browser clock never does.

This supersedes the static player data:

- `archivePuzzles.ts`, the relative `offsetDays` schedule, `puzzleIds.ts`, and the Dogs fallback are removed.
- Dogs, Space, Flower, and Sample are kept as test fixtures in `src/testing/fixtures/`. Fruit and Magic are deleted.
- All six legacy IDs stay reserved (`src/publishing/reservedPuzzleIds.ts`). Published IDs are kept unique by the database.

Developer Export no longer describes manual registry integration. It is a debug and fallback tool only; publishing is the release path.

Completed results keep the `${publishDate}:${puzzleId}` localStorage contract. Old development history is not migrated. Accounts and cross-device history are future work.

Production rollout is a separate, later step. It covers applying `0002` and creating the reader on `main`, the Production `PUZZLES_READ_DATABASE_URL`, and the first real publication. Until then, Preview uses the `dev` reader.

---

## 2026-09-30

### Publishing v1

A validated Final Puzzle is published from the Workshop to Neon Postgres, which is provisioned through the Vercel-managed integration and accessed with `@neondatabase/serverless`. Publishing runs only on the local Workshop server, over a direct (unpooled) connection. Browser code never receives database credentials, and there is no public write endpoint.

Neon branches are separated by purpose:

- `main` is the permanent production puzzle calendar. It is empty and stays untouched until the first real publication.
- `dev` is for local Workshop development.
- `test` is for destructive automated tests, which refuse to run without that branch's marker table.

The five legacy puzzles are development fixtures and are not migrated.

A publication is identified by `puzzleId`, `fingerprintVersion`, and `contentFingerprint`:

- the same ID with the same fingerprint is an idempotent success;
- the same ID with a different fingerprint is a conflict, and the stored record is never overwritten.

Dates are permanent and unique. A new puzzle takes the next eligible future date after the latest one and never shifts existing dates. A puzzle dated D releases at 10:00 PM America/New_York on D−1, judged by trusted database time. Status is derived from that rule, never stored.

Publishing runs in SERIALIZABLE transactions with at most three fresh attempts. Database constraints back this up: uniqueness, plus a guard that rejects any date whose release has already passed. Developer Export remains the fallback.

The player's switch to reading from the database is a separate milestone. Until then the player is unchanged and the Workshop stays connected to `dev`. Deploying the Workshop and adding authentication are out of scope.

---

### Final Puzzle v1

Approving a Workshop candidate opens a session-only Final Puzzle stage: the author sets the puzzle ID and clue, and the Workshop assembles, validates, and exports the puzzle. There is no new persisted format. The artifact is the existing `{ PuzzleDefinition, LayoutDefinition }` pair, built by the generator's `buildPuzzle` with `DEFAULT_REVEAL_BUDGET`.

Export is gated by two validation layers:

- The unchanged production `validatePuzzleDefinition`.
- Workshop export validation, which covers:
  - metadata: a slug ID of `a–z0–9` starting with a letter, not already a production ID or a reserved module name (`sample`, the fixture), and a non-empty clue;
  - single `A–Z` letters;
  - non-negative integer coordinates with a 0,0 origin and no shared positions;
  - a board no larger than 20×20;
  - full cell coverage, contiguous entries, and a connected board;
  - the generator's zero-incidental-entry invariant, via `checkGeometryInvariant`.

These stricter rules apply only to new generated puzzles. They stay out of the production validator because existing data (Space's "rasa") does not meet them. Subjective quality is never validated.

Export is a temporary developer fallback, not the intended authoring workflow. It produces the two TypeScript modules people write by hand today (`src/data/<id>Puzzle.ts` and `src/layout/<id>PuzzleLayout.ts`) as browser downloads, plus a copyable registry snippet (`PUZZLE_IDS` line, imports, and `PUZZLES` entry). Adding the puzzle to the registry and the validator test, and committing, stay manual. The Workshop never writes production files.

Publishing and scheduling are deliberately excluded and will be a separate milestone. In the intended model, approved puzzles get stable calendar dates, assigned in queue order, so adding a puzzle never shifts previously published ones. The current relative `offsetDays` schedule is known technical debt, and Final Puzzle doesn't tell authors to use it.

`buildPuzzle` boundary: `tools/generator/src/assemble` imports production types from `src/`, which use extensionless imports and sit outside the generator's `rootDir`. The generator's standalone NodeNext build therefore keeps excluding it; no generator CLI needs assembly. It is typechecked under bundler resolution by `tsconfig.workshop.json`, which now includes it explicitly, and that config belongs to the Workshop, its runtime caller. This avoids editing production imports and duplicating production types or constants.

Production IDs: the Workshop must not import puzzle data. `src/data/puzzleIds.ts` is a dependency-free list of production IDs. `archivePuzzles.ts` keys its registry with `satisfies Record<PuzzleId, ArchiveEntry>`, so TypeScript rejects any drift between the list and the registry. The cost is one extra manual line per new puzzle.

Editing (moving, replacing, or removing answers; editing letters) and publishing remain out of scope until real usage shows what is needed. An author who dislikes a board goes back and approves a different candidate.

---

## 2026-09-29

### Deterministic Construction Restarts

Single long construction searches often got trapped behind early placement choices: stretching one search from 10,000 to 20,000 or 50,000 attempts rescued few subsets. An equal-budget comparison (1×10k, 2×5k, 5×2k, 10×1k) tested restarting instead.

Decision: each Workshop subset trial runs up to 5 deterministic construction restarts of 2,000 attempts (10,000 maximum, unchanged). Every restart searches the same subset from scratch with its own seed — restart 0 keeps the existing construction seed, later restarts append `:restart:<k>` — and the trial stops at the first success.

Evidence: on 300 fresh Desserts subsets, 5×2k built 30 vs 17 for 1×10k (+76%), improving at both 10 and 11 answers; it rescued 19 subsets 1×10k missed and lost 6 it found, at about 8% more runtime, with unchanged geometry. 10×1k was too short for many viable searches (successes typically need just over 1,000 attempts).

Manual Workshop testing with real curated pools was satisfactory, and the strategy was accepted.

Caveat: the evidence comes mainly from one difficult pool. Restarts fix search trajectory only — not answer-count pressure, long answers, compactness/density, or the fixed-subset architecture. Pool-aware construction remains a future experiment.

---

## 2026-09-28

### Minimum Answer Length

ClueCross authored answers must contain at least 3 playable letters.

2-letter answers are invalid generator input. Existing puzzles are unaffected; none use 2-letter answers.

In the Workshop, a 2-letter candidate is an invalid entry: it is excluded before duplicate handling and pool statistics, so the candidate-pool length bands are 3–5 / 6–8 / 9+.

The maximum is 12 letters (see Construction Eligibility below).

---

### Construction Eligibility

The current authoring envelope is 12×12, so an answer's construction form must be 3–12 A–Z letters inclusive; a longer answer can never be placed. Longer answers are ineligible, never truncated or rewritten. This one generator rule applies to manual and sourced candidate pools alike.

The sourcing prompt states the limit so the model omits ineligible answers (never abbreviating to fit when abbreviations are excluded). It asks for a natural mix of short, medium, and longer answers without quotas; semantic relevance remains primary. The target stays about 60 (roughly 50–70 is a good result); it is guidance, not a quota or a validation limit.

---

### Construction Normalization

An answer's construction form removes spaces, hyphens, and apostrophes, then uppercases ("Great Dane", "great-dane" → GREATDANE). Every other non-letter (digits, periods, accents) stays invalid rather than being silently rewritten.

This is one generator rule used by both manual Workshop input and candidate sourcing, so multi-word answers are valid and answers that differ only by those separators are exact duplicates. The human-readable form is kept alongside the construction form.

---

### Candidate Sourcing v1

A sourcing provider is a candidate researcher, not a puzzle constructor: it proposes answers, each with a one-sentence rationale and a category. Deterministic code checks mechanical facts, the author makes semantic judgments in Pool Review, and the generator constructs.

Requests carry the clue, optional author-only context, and explicit author settings for proper nouns and for abbreviations/shortened forms (both default to Exclude; never inferred from the clue). The target is about 60 candidates, and quality outranks the count.

Sourcing rules: multi-word answers are allowed in their normal written form; no singular and plural of the same concept; no synonym or morphological padding; every answer directly related to the clue; legitimate uncommon terms allowed, but the recognizable term preferred when otherwise equal; broad clues explore directly related subcategories, narrow clues stay focused.

Deterministic cleanup covers response structure, construction normalization and validity, and exact duplicates by construction form. Conservative singular/plural and -ING/-ED variant detection only raises review flags; nothing is removed automatically. Synonymy, relevance, obscurity, proper nouns, and abbreviations remain author judgments.

The Workshop also keeps a deterministic fixture source for tests and credential-free development.

---

### Live Candidate Sourcing

Live sourcing uses one provider (Anthropic) and one server-configured model (`ANTHROPIC_MODEL`), with no provider or model selection in the UI.

The API key is server-side only. The Workshop browser calls its own `POST /api/sourcing` endpoint, served by the Workshop's Vite server; that endpoint builds the existing deterministic sourcing prompt, calls the provider, and returns the provider's payload, which the browser validates with the existing response parser. Credentials come from `.env.local` and are never `VITE_`-prefixed, so they never reach a bundle. Live sourcing is therefore available only while the Workshop runs locally.

Failures are reported as configuration, provider, or response errors; the previous Pool Review is kept, nothing retries automatically, the fixture is never substituted, and generation never starts on its own. No caching or streaming.

---

### Sourcing Effort

Candidate Sourcing sends Anthropic `effort: "low"`. Adaptive thinking stays implicit: the request sends no `thinking` field and does not disable it.

In a controlled comparison (one live "Desserts" request each, `claude-sonnet-5`, same prompt and settings):

| | Input tokens | Output tokens | Thinking tokens | Duration | Candidates |
|---|---|---|---|---|---|
| Default effort (high) | 1,807 | 9,261 | 6,078 | 78.5 s | 65 |
| Low effort | 1,807 | 2,665 | 0 | 19.7 s | 65 |

Low effort cut output tokens by about 71% and latency by about 75%. Manual review found candidate quality comparable, and the low-effort pool produced valid puzzle candidates. This is a single comparison, not a general benchmark; revisit if sourcing quality degrades.

---

## 2026-07-31

### Puzzle Rendering

The Figma file contains a complete square or rectangular grid for layout purposes.

The application only renders actual puzzle cells from puzzle data.

Placeholder cells should never be rendered.

---

### Keyboard Navigation

The board uses spatial navigation instead of linear navigation.

Arrow keys move to the nearest valid cell in the selected direction.

---

### Reveal Letter

Purchasing a letter reveals every occurrence of that letter in the puzzle.

Revealed cells become locked and cannot be edited.

Manual entries remain editable until revealed or the puzzle is completed.

---

### Completion

The board becomes read-only when the puzzle is complete.