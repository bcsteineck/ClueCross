import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createNeonPublicationStore } from './workshop/server/publishing/neonPublicationStore'
import { publishingApiPlugin } from './workshop/server/publishing/publishingApiPlugin'
import type { PublicationStore } from './workshop/server/publishing/publicationStore'
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
//
// Publishing: the same server serves POST /api/publishing/preview and
// /api/publishing/publish (workshop/server/publishing), backed by Neon
// Postgres when PUBLISHING_DATABASE_URL — a DIRECT (unpooled) connection
// string, server-only like the Anthropic variables — is set; without it
// both endpoints answer `not-configured`. During development it points at
// the Neon `dev` branch, never `main` (the permanent calendar).
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const sourcingConfig = () => ({
    apiKey: process.env.ANTHROPIC_API_KEY ?? fileEnv.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? fileEnv.ANTHROPIC_MODEL,
  })

  let publicationStore: PublicationStore | undefined
  const getPublicationStore = () => {
    const url = process.env.PUBLISHING_DATABASE_URL ?? fileEnv.PUBLISHING_DATABASE_URL
    if (!url) return undefined
    publicationStore ??= createNeonPublicationStore(url)
    return publicationStore
  }

  return {
    root: 'workshop',
    plugins: [react(), sourcingApiPlugin(sourcingConfig), publishingApiPlugin(getPublicationStore)],
    server: {
      port: 5174,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
