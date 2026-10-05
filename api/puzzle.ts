// GET /api/puzzle?date=YYYY-MM-DD — Vercel Function adapter for one
// released puzzle (server/puzzles/puzzleApi.ts).
import { webHandler } from '../server/puzzles/httpAdapters.js'
import { handlePuzzleRequest } from '../server/puzzles/puzzleApi.js'

export default { fetch: webHandler(handlePuzzleRequest, () => process.env) }
