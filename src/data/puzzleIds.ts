// Every production puzzle id, as registered in archivePuzzles.ts, whose
// PUZZLES registry must have exactly these keys (TypeScript rejects a
// missing or extra one). Kept in its own dependency-free module so tools
// that must never reuse an id — the Workshop's Final Puzzle stage — can
// read the list without importing the puzzle data itself. A puzzle's id is
// part of players' saved-result keys, so ids are permanent.
export const PUZZLE_IDS = ['dogs', 'space', 'fruit', 'magic', 'flower'] as const

export type PuzzleId = (typeof PUZZLE_IDS)[number]
