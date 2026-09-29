# Decisions

## 2026-09-28

### Minimum Answer Length

ClueCross authored answers must contain at least 3 playable letters.

2-letter answers are invalid generator input. Existing puzzles are unaffected; none use 2-letter answers.

In the Workshop, a 2-letter candidate is an invalid entry: it is excluded before duplicate handling and pool statistics, so the candidate-pool length bands are 3–5 / 6–8 / 9+.

There is no maximum answer length.

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

No live AI provider is integrated yet; the Workshop uses a deterministic fixture source.

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