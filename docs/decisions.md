# Decisions

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