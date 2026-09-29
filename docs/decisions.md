# Decisions

## 2026-09-28

### Minimum Answer Length

ClueCross authored answers must contain at least 3 playable letters.

2-letter answers are invalid generator input. Existing puzzles are unaffected; none use 2-letter answers.

In the Workshop, a 2-letter candidate is an invalid entry: it is excluded before duplicate handling and pool statistics, so the candidate-pool length bands are 3–5 / 6–8 / 9+.

There is no maximum answer length.

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