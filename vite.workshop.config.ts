import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ClueCross Workshop: a private, internal authoring tool, deliberately a
// separate Vite app from the player-facing game (vite.config.ts). The
// game's build only ever sees the root index.html -> src/main.tsx graph,
// so nothing under workshop/ or tools/generator/ can reach its bundle;
// this config builds the Workshop on its own into workshop/dist.
//
//   npm run workshop        (dev server)
//   npm run workshop:build  (standalone build)
export default defineConfig({
  root: 'workshop',
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
