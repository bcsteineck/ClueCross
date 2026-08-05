# ClueCross

## Project Goal

ClueCross is a daily crossword-inspired word puzzle.

The project values simplicity, accessibility, and polish over adding features.

When making changes, preserve the existing architecture unless specifically asked to redesign it.

---

## Priorities

In order of importance:

1. Preserve game functionality.
2. Preserve accessibility.
3. Match the Figma design.
4. Keep code simple and maintainable.
5. Avoid unnecessary abstractions.

---

## Scope Control

Complete only the work requested.

Avoid making unrelated improvements while working on a task.

If you notice bugs, code smells, or opportunities for improvement outside the requested scope, mention them in the final summary instead of fixing them automatically.

---

## Game Rules

Do not change game mechanics unless explicitly requested.

Examples:

- Do not change puzzle logic.
- Do not change reveal-letter behavior.
- Do not change budget calculations.
- Do not change navigation behavior.
- Do not change puzzle completion logic.
- Do not add gameplay features.

---

## UI Implementation

Figma is the visual source of truth.

The existing application is the behavioral source of truth.

Implement:

- spacing
- typography
- colors
- borders
- component sizing
- layout
- component variants

Do not invent styling when Figma already defines it.

If the Figma design appears to conflict with the current application behavior, ask before changing the implementation.

---

## Puzzle Grid

The Figma file contains a complete square layout grid for design purposes. The puzzle can live within a maximum of a 20x20 grid made of cells. The puzzle grid should appear as close to visually centered as possible. So, the amount of rows and columns can be adjusted to visually center the puzzle within the puzzle container as long as the cell sizes remain the same and it fits within what the maximum height and witdh of a 20x20 grid would have been.

The application should continue rendering **only actual puzzle cells** from puzzle data.

Do not render placeholder cells.

---

## Accessibility

Accessibility is required.

Preserve:

- keyboard navigation
- roving tabindex
- screen reader labels
- focus states
- semantic HTML

Never remove accessibility features for visual reasons.

---

## React

Prefer modifying existing components.

Avoid replacing working components.

Avoid unnecessary component creation.

---

## Styling

Use existing Sass architecture.

Avoid inline styles.

Avoid CSS duplication.

Prefer design tokens.

---

## Dependencies

Do not introduce new npm packages unless requested.

---

## Refactoring

Do not perform large refactors while implementing UI.

If an architectural improvement is discovered:

- explain it
- recommend it
- wait for approval

---

## Before Coding

Briefly summarize:

- files that will change
- assumptions
- questions

---

## After Coding

Always:

- run typecheck
- run tests
- summarize changes
- mention any assumptions made