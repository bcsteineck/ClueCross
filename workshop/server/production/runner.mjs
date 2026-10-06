// Child-process entry point for ONE Production operation. Started only by
// productionBridge.ts as `vercel env run -e production ... -- node runner.mjs`,
// so the Production environment exists in this short-lived process alone.
// The operation arrives on stdin (never argv); exactly one result line,
// prefixed with RESULT_PREFIX, is written to stdout; then the process exits.
//
// Plain JavaScript so Node can start it directly: it uses Vite's SSR loader
// (already a dependency) to run the TypeScript runner without a build step.
// Vite logging is silenced, and nothing else is ever printed.

import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Must equal RESULT_PREFIX in runOperation.ts (asserted by a test).
const RESULT_PREFIX = 'CLUECROSS_PRODUCTION_RESULT '
const root = fileURLToPath(new URL('../../../', import.meta.url))

function write(response) {
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify(response)}\n`)
}

async function readStdin() {
  let input = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) input += chunk
  return input
}

let vite
try {
  const input = await readStdin()
  vite = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const { runOperation } = await vite.ssrLoadModule('/workshop/server/production/runOperation.ts')
  write(await runOperation(input, process.env))
} catch {
  write({ ok: false, error: 'unavailable', message: 'The Production operation could not start. Nothing was changed.' })
} finally {
  await vite?.close().catch(() => {})
  process.exit(0)
}
