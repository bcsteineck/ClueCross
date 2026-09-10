# ClueCross

## Project Goal

ClueCross is a daily crossword-inspired word puzzle.

The project values simplicity, accessibility, and polish over adding features.

When making changes, preserve the existing architecture unless specifically
asked to redesign it.

---

## Priorities

In order of importance:

1. Preserve game functionality and explicitly specified release behavior.
2. Preserve accessibility.
3. Match the Figma design.
4. Keep code simple and maintainable.
5. Avoid unnecessary abstractions.

---

## Source of Truth

For release-specific work, read the relevant specification in `/docs`.

Current release specification:

`docs/cluecross-v0.2.0-spec.md`

Use the following hierarchy:

- Release specification = product behavior and requirements for that release.
- Figma = visual design and component-state source of truth.
- Existing application = source of truth for behavior not explicitly changed
  by the release specification.
- Existing codebase = source of truth for current architecture and reusable
  implementation.

When the release specification explicitly changes existing behavior, follow
the specification.

Otherwise, preserve existing behavior.

If these sources appear to conflict in a way the specification does not
resolve, ask before implementing the conflicting behavior.

---

## Scope Control

Complete only the work requested.

Avoid making unrelated improvements while working on a task.

If you notice bugs, code smells, or opportunities for improvement outside
the requested scope, mention them in the final summary instead of fixing
them automatically.

---

## Game Rules

Do not change game mechanics unless explicitly requested by the current task
or release specification.

This includes:

- puzzle logic
- reveal-letter behavior
- scoring and reveal costs
- navigation behavior
- puzzle completion logic
- persistence
- gameplay features

For v0.2.0, the release specification intentionally changes some of these
systems. Those changes are authorized only to the extent described by the
specification.

Preserve existing behavior everywhere else.

---

## UI Implementation

Figma is the visual source of truth.

Implement:

- spacing
- typography
- colors
- borders
- component sizing
- layout
- component variants and states

Do not invent styling when Figma already defines it.

Figma dimensions are design references, not automatically literal CSS
dimensions.

Translate the relationships represented in Figma into responsive behavior.
For example, an element that fills the available width in Figma should
generally remain fluid rather than receiving the exact pixel width shown in
the mockup.

Use appropriate responsive techniques such as:

- CSS Grid
- Flexbox
- percentages
- `fr`
- `minmax()`
- intrinsic sizing
- `aspect-ratio`

Preserve explicit semantic component states defined in Figma.

Do not redesign the product without approval.

---

## Puzzle Grid

The Figma file contains a complete square layout grid for design purposes.

The puzzle can live within a maximum 20x20 grid made of cells.

The puzzle should appear as visually centered as practical within its
container. The effective row/column positioning may be adjusted to visually
center the puzzle as long as:

- cell sizes remain consistent
- the puzzle remains within the maximum dimensions of a 20x20 grid
- puzzle relationships and layout are preserved

The application should render **only actual puzzle cells** from puzzle data.

Do not render placeholder cells.

The puzzle container should remain responsive and preserve its intended
square aspect ratio.

---

## Accessibility

Accessibility is required.

Preserve:

- keyboard navigation
- roving tabindex
- screen reader labels
- focus states
- semantic HTML

Icon-only controls require accessible names.

Interactive states should not rely solely on color.

Drawers, overlays, and similar UI should manage focus appropriately.

Never remove accessibility features for visual reasons.

---

## React

Prefer modifying existing components.

Avoid replacing working components without a clear reason.

Avoid unnecessary component creation.

Keep game logic separate from presentation where practical.

Use existing TypeScript patterns and avoid unnecessary `any` or broad casts.

---

## Styling

Use existing Sass architecture.

Avoid inline styles.

Avoid CSS duplication.

Prefer existing design tokens.

Do not introduce a new styling system without approval.

---

## Dependencies

Do not introduce new npm packages unless requested or explicitly approved.

---

## Refactoring

Do not perform large refactors while implementing UI unless the requested
feature genuinely requires an architectural change.

If an architectural improvement is discovered:

- explain it
- recommend it
- wait for approval

Do not use v0.2.0 as justification for rewriting working systems that can
reasonably be extended.

---

## Testing

Gameplay changes should include or update tests where practical.

Do not remove or weaken existing tests simply to make a changed
implementation pass unless the test represents behavior intentionally
changed by the release specification.

Before considering work complete:

- run typecheck
- run tests
- run lint if configured
- run the production build if configured

---

## Before Coding

For substantial work, inspect the relevant existing implementation and tests
before editing.

Briefly summarize:

- files/systems expected to change
- implementation approach
- assumptions
- questions
- potential risks

If asked to create a plan only, do not modify application code.

---

## After Coding

Always:

- run the relevant validation commands
- summarize changes
- mention assumptions made
- mention unresolved issues or out-of-scope problems discovered