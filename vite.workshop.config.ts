import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createNeonPublicationStore } from './workshop/server/publishing/neonPublicationStore'
import { publishingApiPlugin } from './workshop/server/publishing/publishingApiPlugin'
import { createProductionBridge } from './workshop/server/production/productionBridge'
import { productionOpsApiPlugin, productionOpsEnabled } from './workshop/server/production/productionOpsApiPlugin'
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
//
// Production operations (`npm run workshop:production-ops` only): the same
// server also serves /api/production/* (workshop/server/production), and
// listens on 5175 so a Production-operations tab is never confused with an
// ordinary one. Each operation runs in a short-lived child that `vercel env
// run -e production` starts; this process itself never holds a Production
// credential. The opt-in is read from the process environment only, never
// from .env files. Plain `npm run workshop` answers every
// /api/production/* request "disabled".
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

  const productionOps = productionOpsEnabled(process.env)

  return {
    root: 'workshop',
    plugins: [
      react(),
      sourcingApiPlugin(sourcingConfig),
      publishingApiPlugin(getPublicationStore),
      productionOpsApiPlugin({
        enabled: productionOps,
        run: productionOps ? createProductionBridge({ cwd: process.cwd() }) : undefined,
      }),
    ],
    define: {
      __WORKSHOP_PRODUCTION_OPS__: JSON.stringify(productionOps),
    },
    server: productionOps ? { port: 5175, strictPort: true } : { port: 5174 },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
