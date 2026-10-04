// Vite plugin that serves /api/calendar and /api/puzzle on the local player
// dev and preview servers through the same handlers as the Vercel
// Functions. Node only: the reader credential (PUZZLES_READ_DATABASE_URL)
// is read server-side and never reaches browser code or a bundle.
import type { Plugin } from 'vite'
import { puzzleApiMiddleware } from './httpAdapters'

export function puzzleApiPlugin(getEnv: () => Record<string, string | undefined>): Plugin {
  return {
    name: 'cluecross-puzzle-api',
    configureServer(server) {
      server.middlewares.use(puzzleApiMiddleware(getEnv))
    },
    configurePreviewServer(server) {
      server.middlewares.use(puzzleApiMiddleware(getEnv))
    },
  }
}
