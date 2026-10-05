// GET /api/calendar — Vercel Function adapter for the released-puzzle
// calendar (server/puzzles/puzzleApi.ts).
import { webHandler } from '../server/puzzles/httpAdapters.js'
import { handleCalendarRequest } from '../server/puzzles/puzzleApi.js'

export default { fetch: webHandler(handleCalendarRequest, () => process.env) }
