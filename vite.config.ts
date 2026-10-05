import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { puzzleApiPlugin } from './server/puzzles/vitePuzzleApiPlugin'
import { testToolsEnabledFor } from './src/state/testTools'

// https://vite.dev/config/
//
// Local dev/preview also serve the read-only puzzle API (/api/calendar,
// /api/puzzle) via server/puzzles — the same handlers as the Vercel
// Functions in api/. PUZZLES_READ_DATABASE_URL is read here, server-side
// only; it is not VITE_-prefixed and never reaches browser code.
//
// Manual-testing tools (src/state/testTools.ts) are compiled in only for
// the dev server, Vitest, and Vercel Preview builds — Vercel sets
// VERCEL_ENV at build time; a Production or plain local build gets false.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const puzzleApiEnv = () => ({
    PUZZLES_READ_DATABASE_URL: process.env.PUZZLES_READ_DATABASE_URL ?? fileEnv.PUZZLES_READ_DATABASE_URL,
  })

  return {
    plugins: [react(), puzzleApiPlugin(puzzleApiEnv)],
    define: {
      __CLUECROSS_TEST_TOOLS__: JSON.stringify(testToolsEnabledFor(mode, process.env.VERCEL_ENV)),
    },
    test: {
      environment: 'node',
    },
  }
})
