// Puzzle IDs that can never be published. Not a calendar or registry —
// published puzzles live only in the database, whose primary key keeps every
// real ID unique. These IDs have pre-existing meaning instead:
//   - dogs, space, fruit, magic, flower: the legacy pre-calendar development
//     puzzles (players' local result history used these IDs; dogs, space and
//     flower remain as test fixtures in src/testing/fixtures);
//   - sample: the minimal validator test fixture.
export const RESERVED_PUZZLE_IDS: readonly string[] = ['dogs', 'space', 'fruit', 'magic', 'flower', 'sample']
