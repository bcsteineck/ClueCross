# ClueCross v0.2.0 Product & Implementation Specification

## 1. Purpose

ClueCross v0.2.0 is a substantial UI, UX, and gameplay refinement based on
user feedback and continued design exploration.

This release updates:

- Desktop and mobile application layouts
- Reveal Letter interaction
- Free reveals
- Scoring presentation
- Puzzle progress
- Reveal history
- Archive presentation
- Mobile navigation
- Keyboard/input behavior
- Auto-advance behavior
- Instructional content
- Responsive behavior

The existing puzzle rules and core game logic should be preserved unless
explicitly changed by this specification.

---

## 2. Sources of Truth

Implementation should reconcile three sources:

### This specification
Authoritative for:

- Product behavior
- Game rules
- Interaction states
- Navigation
- Responsive intent
- Feature requirements

### Figma designs
Authoritative for:

- Visual hierarchy
- Typography
- Colors
- Borders
- Radii
- Shadows
- Iconography
- Component appearance
- Component variants/states
- Relative spacing and alignment
- General proportions
- Desktop/mobile visual composition

### Existing codebase
Authoritative for:

- Existing architecture
- Puzzle data structures
- Existing game rules not changed here
- Reusable logic/components
- Tests
- Established project conventions

Do not unnecessarily rewrite working game logic simply because the UI is
changing.

---

## 3. Figma Interpretation

Figma dimensions are visual references, not literal CSS requirements.

Do not mechanically translate dimensions such as:

- 390px mobile viewport
- fixed card widths
- fixed button widths
- desktop column pixel widths
- viewport heights

into hard-coded application dimensions.

Instead, determine the relationship represented by the design.

For example:

- A 358px-wide button inside a 390px Figma viewport likely means the button
  fills the available content width.
- A 358x358 puzzle means the puzzle maintains a 1:1 aspect ratio and fills
  its available container.
- Desktop columns communicate relative proportions rather than immutable
  pixel dimensions.

Prefer appropriate responsive techniques such as:

- percentages
- CSS Grid
- Flexbox
- `fr`
- `minmax()`
- `auto`
- `aspect-ratio`
- responsive padding
- intrinsic sizing

Minor deviations from Figma dimensions are acceptable when required for:

- responsive behavior
- accessibility
- content fit
- maintaining intended visual hierarchy

Do not change the fundamental design or interaction model without flagging
the issue for review.

When Figma defines explicit component states, preserve their semantic
differences rather than approximating them with generic styles.

---

# 4. Application Views

The primary application views are:

- Puzzle
- Reveal Letter
- Archive
- Stats
- How to Play

Settings remains an overlay/drawer rather than a primary application view.

Moving between secondary views must preserve the current puzzle session.

---

# 5. Desktop Layout

## Header

Persistent desktop header containing:

- ClueCross logo
- Archive button
- Settings button

## Main Content

Use a responsive three-column layout:

Secondary / Primary / Secondary

Approximate intended relationship:

1fr / 2fr / 1fr

This ratio is not absolute.

The center puzzle column has priority. Side-column widths may adjust when
necessary to preserve a usable puzzle size and balanced composition.

### Left column

Contains:

1. Today's Clue / Puzzle Clue
2. Your Score
3. Progress

### Center column

Contains the primary interactive content.

Depending on application state, this area displays:

- Puzzle board
- Reveal Letter selector
- Archive

The Puzzle and Reveal Letter content should use the same 1:1 primary
footprint so switching between them does not cause unnecessary layout
movement.

### Right column

Contains:

1. Reveal Letter action
2. Reveal History
3. How It Works

Cards should flow naturally rather than use hard-coded coordinates.

## Footer

Minimal footer containing centered ClueCross copyright text.

---

# 6. Mobile / Tablet Layout

Mobile is not simply the desktop layout stacked vertically.

Desktop is an information-rich dashboard.

Mobile is a focused single-task game interface with secondary information
available on demand.

Tablet may use either composition depending on available space and
usability. Do not introduce a separate tablet design unless necessary.

Breakpoints should be determined by when the layout can no longer
comfortably support the intended composition rather than arbitrary device
categories.

## Persistent Header

The mobile header remains present across primary views and contains:

- ClueCross logo
- How to Play / Info icon
- Settings icon
- Archive icon

The existing hamburger menu is removed.

## Puzzle View

Contains:

1. Info/navigation bar
2. 1:1 puzzle
3. Reveal Letter button
4. Native operating-system keyboard when puzzle input is active

For today's puzzle, the info bar displays:

TODAY'S CLUE
[clue]

and a Stats control.

For archived puzzles, replace "TODAY'S CLUE" with the puzzle publication
date.

Example:

SEPTEMBER 2, 2026
Dogs

## Reveal Letter View

Contains:

1. Same puzzle information/navigation bar
2. 1:1 Reveal Letter selector
3. Cancel Reveal button

The Reveal selector occupies the same primary footprint as the puzzle so
switching Puzzle -> Reveal does not cause the main content above/beside it
to jump.

The native keyboard is dismissed while Reveal Letter is active.

Do not render or simulate a disabled native keyboard.

## Stats View

Contains:

1. Back to Puzzle navigation
2. Your Score
3. Progress
4. Reveal History

Content may scroll vertically.

## Archive View

Contains:

1. Back to Puzzle navigation
2. Month/year selection
3. Archive calendar
4. Optional minimal copyright footer

The Archive should size naturally vertically on mobile. It does not need
to conform to the puzzle's 1:1 aspect ratio.

## How to Play View

Contains:

1. Back to Puzzle navigation
2. Full game instructions

Content may scroll vertically.

## Settings

Settings opens the existing slide-out drawer.

Opening Settings:

- preserves the current puzzle
- dismisses the mobile keyboard
- does not change the underlying active view

Closing Settings returns the user to the previous state.

---

# 7. Reveal Letter

Reveal Letter is a single-action interaction, not a persistent mode.

Flow:

1. User selects Reveal Letter.
2. Reveal Letter view opens.
3. User selects one available letter.
4. Every occurrence of that letter is revealed and locked.
5. Reveal History is updated.
6. A free reveal is consumed OR the normal score cost is applied.
7. Reveal Letter view automatically closes.
8. User returns to Puzzle view.

To reveal another letter, the user must intentionally select Reveal Letter
again.

## Cancel

Cancel Reveal closes the Reveal Letter view without:

- revealing a letter
- consuming a free reveal
- reducing score
- modifying Reveal History

Cancel exists only for users who enter Reveal Letter and then decide not
to reveal anything.

---

# 8. Reveal Letter States

Figma defines separate visual states for Reveal Letter buttons.

These states have different semantic meanings and must remain distinct.

## Default

The letter has not been revealed and can be selected.

## Revealed

The letter has previously been selected through Reveal Letter.

It:

- is non-interactive
- uses the Figma Revealed visual state
- must NOT use the Disabled visual state

## Disabled

Reserved for situations where Reveal Letter functionality itself is
unavailable.

Do not describe or implement previously revealed letters as visually
"disabled."

---

# 9. Letters Not Present in Puzzle

Do NOT disable letters simply because they do not occur in the puzzle.

The uncertainty is intentional game strategy.

All unrevealed A-Z letters remain selectable regardless of whether they
exist in the solution.

Selecting a letter that occurs zero times:

- still counts as a reveal
- consumes a free reveal if one remains
- otherwise applies the normal letter cost
- creates a Reveal History entry
- marks that letter as Revealed
- automatically returns to Puzzle

Example history:

Q — Free — 0 cells

or:

Q — 50 — 0 cells

This prevents the Reveal interface from giving the player free information
about which letters do or do not occur in the puzzle.

---

# 10. Free Reveals

Every puzzle begins with:

3 free letter reveals

Free reveals belong to the individual puzzle.

## While free reveals remain

All available Reveal Letter buttons display:

Free

instead of their normal point cost.

Selecting a letter:

- consumes one free reveal
- deducts 0 points
- does not lower the player's star rating

Example:

A player may use all three free reveals and still finish with:

2000 / 2000
★★★

## After free reveals are exhausted

Reveal Letter buttons display their normal point costs.

Existing reveal-cost/scoring behavior resumes.

## Remaining free reveals

The primary Reveal Letter action displays remaining credits.

Example:

Reveal Letter
3 free reveals remaining

The value updates dynamically.

The Reveal Letter view also displays the number of remaining free reveals.

---

# 11. Scoring

The existing numerical scoring model remains in place.

Example:

1500 / 2000

v0.2.0 replaces the Gold / Silver / Bronze / Bust presentation with a
three-star system.

Mapping:

Gold   -> ★★★
Silver -> ★★☆
Bronze -> ★☆☆
Bust   -> ☆☆☆

Do not unnecessarily rewrite existing scoring thresholds if they already
correctly represent these tiers.

Star rating updates dynamically as the player's remaining score changes.

Free reveals deduct zero points and therefore do not directly affect star
rating.

---

# 12. Puzzle Completion

Preserve existing completion behavior.

- Incorrect letters may be entered while solving.
- Do not validate every cell immediately.
- Revealed letters are always correct and locked.
- Puzzle completion is determined by the existing final validation logic.
- Puzzle completes only when all cells are filled correctly.

Once completed:

- final numerical score is stored
- final star rating is stored/derived
- Archive displays the completed result
- revisiting the completed puzzle restores its completed state/result

---

# 13. Progress

Add a Progress feature representing puzzle completion by cell occupancy.

Calculate:

filled playable cells / total playable cells

Display:

- Cells Filled
- Percentage
- Progress bar

Example:

42 / 109
39%

All three displays derive from the same underlying progress value.

## Rules

A cell counts as filled when it contains a value.

This includes:

- manually entered letters
- revealed letters

Correctness does not affect Progress.

Therefore a puzzle can display 100% cells filled while still containing
incorrect answers.

Progress updates immediately when:

- a cell is filled
- a cell is cleared
- Reveal Letter populates cells

Only playable puzzle cells count toward the total.

Desktop location:
Left column Progress card.

Mobile location:
Stats view.

---

# 14. Reveal History

Reveal History belongs to the current puzzle.

Entries are ordered newest first.

Each entry contains:

- revealed letter
- cost
- number of cells revealed/locked

Example:

A | Free | 6 cells
E | Free | 11 cells
R | 200 | 7 cells

## Cost

If a free reveal was used, persist/display:

Free

Do not later replace that value with the letter's normal cost after free
reveals have been exhausted.

Paid reveals display the actual cost applied at the time of the reveal.

## Cells Revealed

"Cells revealed" means:

The total number of puzzle cells containing that letter that become
locked/revealed as a result of selecting the letter.

It is NOT limited to previously empty cells.

Example:

A occurs six times.

Two A cells already contain manually entered correct A values.

User reveals A.

Reveal History still records:

A — Free — 6 cells

because all six A cells are now revealed/locked.

A letter absent from the puzzle records:

Q — Free — 0 cells

## Display

Default view shows the three most recent entries.

If more than three exist, show a Show All control.

Show All expands to full history.

When expanded, provide Show Less.

Desktop location:
Right column.

Mobile location:
Stats view.

---

# 15. Archive

Archive retains the fundamental behavior of the existing ClueCross
calendar while adopting the new Figma styling.

Features:

- Month/year selection
- Published puzzle dates
- Completed puzzle states
- Star results
- Disabled/unpublished dates

Selecting a published puzzle:

1. Makes it the active puzzle.
2. Restores its existing saved state if previously played.
3. Closes Archive.
4. Returns to Puzzle view.

## Archived puzzle clue

Today's puzzle displays:

TODAY'S CLUE

Archived puzzles instead display their publication date.

Example:

SEPTEMBER 2, 2026
Dogs

## Archive Stars

Completed puzzles display their earned star rating beneath the date.

The Figma design also uses low-contrast/muted star icons for unplayed or
disabled calendar cells to maintain consistent internal alignment.

These muted stars are structural placeholders.

They do NOT represent a zero-star score.

A completed 0-star result must remain visually distinguishable from an
unplayed/disabled placeholder state.

Use the explicit Figma calendar component variants as the visual source
of truth.

---

# 16. Puzzle Input

## Desktop

Remove the custom on-screen keyboard.

Desktop players use their physical keyboard.

Support:

- A-Z input
- Backspace/Delete
- existing appropriate navigation controls

Revealed/locked cells cannot be edited.

Existing validation/error behavior for attempting to enter an already
revealed letter should remain.

## Mobile

Remove the custom ClueCross keyboard.

Use the native operating-system keyboard for puzzle input.

Selecting/interacting with the puzzle should allow the native keyboard to
appear.

The application should accept only supported puzzle input such as:

- A-Z
- deletion

Do not depend on being able to customize individual keys on the native
keyboard.

The operating system ultimately controls the keyboard UI.

The native keyboard is dismissed when leaving Puzzle for:

- Reveal Letter
- Stats
- Archive
- How to Play
- Settings

Implementation details for bridging native keyboard input to the puzzle
should be chosen after inspecting the existing codebase.

---

# 17. Auto-Advance

Preserve convenient crossword-style auto-advance, but change the existing
global navigation behavior.

Current problem:

Because ClueCross uses a freeform grid, global navigation can cause the
active cell to jump unexpectedly to an unrelated/disconnected word.

New rule:

Auto-advance within the current contiguous entry/direction.

Never automatically jump to a disconnected entry.

## Direction

Maintain the user's current typing direction through intersections.

Example:

If the player is entering a horizontal word, reaching an intersection
does not automatically redirect them vertically.

The player explicitly selects another cell/entry to establish a new
direction.

## Revealed cells

Auto-advance should skip revealed/locked cells that occur along the same
contiguous entry.

It must not search for another unrelated editable cell elsewhere on the
board.

When the current contiguous entry has no further editable cells,
auto-advance stops.

---

# 18. Navigation State

Moving to:

- Stats
- Archive
- How to Play
- Settings

must not reset or mutate the active puzzle.

Returning to Puzzle should restore the same game session, including:

- entered letters
- revealed letters
- score
- free reveals
- reveal history
- progress
- active puzzle

Preserve the previously selected cell/direction when practical.

Reveal Letter is the exception because completing a reveal intentionally
changes puzzle state before returning to Puzzle.

---

# 19. How to Play & Onboarding

Remove the existing onboarding slideshow entirely.

Do not automatically interrupt first-time users with:

- onboarding slides
- walkthrough modals
- mandatory instructions

Instead use two levels of instruction.

## Contextual guidance

Provide concise guidance in relevant areas such as:

- Today's Clue
- Reveal Letter
- scoring/reveal information

## How to Play

Mobile Info icon opens a dedicated How to Play view.

Desktop may use the concise How It Works card and may provide access to
more detailed instructions where appropriate.

Full instructions should explain at minimum:

- Read the clue.
- Fill the interconnected words.
- Use Reveal Letter when stuck.
- Revealing a letter locks every occurrence of that letter.
- Every puzzle begins with three free reveals.
- Additional reveals reduce score according to letter cost.
- Higher remaining scores earn more stars.
- The 3/2/1/0-star performance system.
- Archive allows previously published puzzles to be played.

Exact instructional copy may be refined separately.

---

# 20. Responsive Requirements

ClueCross must remain fully responsive.

Do not optimize exclusively for the supplied Figma viewport dimensions.

The implementation should support:

- narrow mobile screens
- typical mobile screens
- larger phones
- tablets
- laptops
- desktop displays
- large desktop displays

Avoid horizontal application scrolling.

## Desktop

Use a centered responsive content container with:

- sensible maximum width
- responsive horizontal padding
- flexible three-column composition

Cards fill their available columns.

The puzzle remains 1:1.

## Mobile

App fills available viewport width.

Use consistent responsive horizontal padding.

Puzzle remains 1:1 and scales with available width.

Puzzle cells derive their size from the puzzle grid.

Letter typography should respond appropriately to cell size rather than
being tied to a single Figma font size.

Avoid unnecessary hard-coded viewport heights.

Account for:

- changing browser chrome
- native keyboard appearance/disappearance
- short/tall devices
- varying viewport dimensions

Views such as Stats, Archive, and How to Play may scroll vertically.

---

# 21. Accessibility

Preserve and improve the existing accessibility of ClueCross.

At minimum:

- Interactive controls must be keyboard accessible.
- Icon-only controls require accessible names.
- Focus states must remain visible.
- Revealed/Disabled/etc. states must not rely solely on color.
- Puzzle input must remain usable with keyboard navigation.
- Appropriate semantic elements should be used.
- Modal/drawer behavior must manage focus appropriately.
- Text and interactive states should maintain appropriate contrast.
- Reduced-motion preferences should be respected where animation exists.

Do not sacrifice accessibility to exactly reproduce a Figma composition.

---

# 22. Implementation Principles

This is a significant v0.2.0 overhaul, but avoid unnecessary rewrites.

Before implementation:

1. Inspect the existing architecture.
2. Identify reusable components and game logic.
3. Identify affected state/data models.
4. Identify existing tests protecting current game behavior.
5. Determine which systems genuinely require modification.

Prefer extending/refactoring existing working systems over replacing them
without reason.

Maintain:

- React + TypeScript architecture
- semantic HTML
- accessibility
- responsive behavior
- existing test coverage
- deterministic puzzle behavior

Do not add external UI dependencies unless clearly justified.

---

# 23. Suggested Implementation Phases

The exact plan should be determined after repository inspection, but the
expected high-level sequence is:

## Phase 1 — State & Data

- Free reveals
- Reveal History changes
- Star presentation/model changes
- Progress calculation/state
- persistence changes where necessary

## Phase 2 — Game Interaction

- Remove custom keyboard
- Native mobile input
- Desktop physical keyboard input
- Single-action Reveal flow
- Reveal Letter states
- Auto-advance changes
- Remove onboarding

## Phase 3 — Shared UI

Potential components include:

- StarRating
- Progress
- RevealHistory
- Clue card
- Reveal selector
- navigation controls

Reuse/refactor existing components where appropriate.

## Phase 4 — Desktop

Implement new:

- header
- three-column composition
- cards
- center-view switching
- footer

## Phase 5 — Mobile

Implement:

- persistent header
- Puzzle view
- Reveal view
- Stats
- How to Play
- navigation behavior
- responsive native-input behavior

## Phase 6 — Archive

Implement:

- new visual treatment
- calendar states
- star results
- archived puzzle clue/date behavior

## Phase 7 — Quality

- responsive testing
- keyboard testing
- accessibility
- regression tests
- game-state persistence
- mobile viewport testing
- final Figma comparison

---

# 24. Planning Requirement

Do not begin implementing v0.2.0 immediately after reading this document.

First:

1. Read the project's CLAUDE.md.
2. Read this specification in full.
3. Inspect the existing repository.
4. Inspect relevant existing tests.
5. Review the supplied Figma designs.
6. Identify conflicts or unclear requirements.
7. Produce a proposed implementation plan.
8. Identify affected files/systems.
9. Identify risks and potential regressions.
10. Identify tests that should be added or modified.

Present the plan for review before editing application code.