import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { sourcingApiPlugin } from './workshop/server/sourcingApiPlugin'

// ClueCross Workshop: a private, internal authoring tool, deliberately a
// separate Vite app from the player-facing game (vite.config.ts). The
// game's build only ever sees the root index.html -> src/main.tsx graph,
// so nothing under workshop/ or tools/generator/ can reach its bundle;
// this config builds the Workshop on its own into workshop/dist.
//
//   npm run workshop        (dev server)
//   npm run workshop:build  (standalone build)
//
// Live candidate sourcing: the dev/preview server also serves
// POST /api/sourcing (workshop/server), which calls Anthropic with
// ANTHROPIC_API_KEY / ANTHROPIC_MODEL read server-side from the repo-root
// .env.local (or the process environment). Only those two variables are
// read, only into this Node process — they are not VITE_-prefixed, so Vite
// never exposes them to browser code.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const sourcingConfig = () => ({
    apiKey: process.env.ANTHROPIC_API_KEY ?? fileEnv.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? fileEnv.ANTHROPIC_MODEL,
  })

  return {
    root: 'workshop',
    plugins: [react(), sourcingApiPlugin(sourcingConfig)],
    server: {
      port: 5174,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
