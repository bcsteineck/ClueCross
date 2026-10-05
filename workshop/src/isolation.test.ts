// Architecture-level isolation checks between the player-facing game and
// the Workshop, asserted on source structure rather than on minified
// bundle strings:
//
// - The game's production build has exactly one entry (index.html ->
//   src/main.tsx), and the static import graph reachable from it never
//   leaves src/ — so neither workshop/ nor tools/generator/ can end up in
//   the game bundle.
// - The Workshop has its own separate entry and config.
// - Workshop code never imports production puzzle data or persistence/
//   filesystem APIs, so approval can't write puzzle data. Its one read of
//   reserved puzzle ids is the dependency-free src/publishing/
//   reservedPuzzleIds.ts, used to reject ids with pre-existing meaning.

import { describe, expect, it } from 'vitest'
import gameIndexHtml from '/index.html?raw'
import gameViteConfig from '/vite.config.ts?raw'
import workshopIndexHtml from '/workshop/index.html?raw'
import workshopViteConfig from '/vite.workshop.config.ts?raw'
import packageJsonText from '/package.json?raw'

const gameSources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
const serverSources = import.meta.glob<string>('/server/**/*.ts', { query: '?raw', import: 'default', eager: true })
const apiSources = import.meta.glob<string>('/api/**/*.ts', { query: '?raw', import: 'default', eager: true })
const workshopSources = import.meta.glob<string>('/workshop/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const IMPORT_PATTERN = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? match[2])
}

function resolveSource(path: string): string | undefined {
  const candidates = [path, `${path}.ts`, `${path}.tsx`, path.replace(/\.js$/, '.ts'), path.replace(/\.js$/, '.tsx')]
  return candidates.find((candidate) => candidate in gameSources)
}

// Walks every relative import reachable from src/main.tsx, returning each
// resolved import path (code or asset) that the walk encountered.
function gameImportGraph(): { reachedSources: Set<string>; resolvedImports: Set<string> } {
  const reachedSources = new Set<string>()
  const resolvedImports = new Set<string>()
  const queue = ['/src/main.tsx']
  while (queue.length > 0) {
    const file = queue.pop()!
    if (reachedSources.has(file)) continue
    reachedSources.add(file)
    for (const specifier of importSpecifiers(gameSources[file])) {
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) continue // package import
      const resolved = new URL(specifier, `file://${file}`).pathname
      resolvedImports.add(resolved)
      const source = resolveSource(resolved)
      if (source) queue.push(source)
    }
  }
  return { reachedSources, resolvedImports }
}

describe('production game / Workshop isolation', () => {
  it('the game has a single entry, src/main.tsx, and no Workshop references in its config', () => {
    const scripts = [...gameIndexHtml.matchAll(/<script[^>]*src="([^"]+)"/g)].map((match) => match[1])
    expect(scripts).toEqual(['/src/main.tsx'])
    expect(gameViteConfig).not.toMatch(/workshop|tools\/generator|rollupOptions|input/i)
  })

  it('the game import graph never leaves src/ (no Workshop or generator code)', () => {
    const { reachedSources, resolvedImports } = gameImportGraph()
    // Sanity check that the walk actually traversed the app.
    expect(reachedSources.size).toBeGreaterThan(20)
    expect(reachedSources.has('/src/App.tsx')).toBe(true)

    const outside = [...resolvedImports].filter((path) => !path.startsWith('/src/'))
    expect(outside).toEqual([])
  })

  it('no game source file references the Workshop or the generator', () => {
    const offenders = Object.entries(gameSources)
      .filter(([, source]) => importSpecifiers(source).some((s) => /workshop|tools\/generator/.test(s)))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('publishing rules in src/publishing are runtime-neutral (shared by the player and server)', () => {
    const files = Object.entries(gameSources).filter(
      ([path]) => path.startsWith('/src/publishing/') && !path.endsWith('.test.ts'),
    )
    expect(files.length).toBeGreaterThan(0)
    for (const [path, source] of files) {
      // Only sibling modules and the production core/layout types.
      expect(importSpecifiers(source).filter((s) => !/^\.\/|^\.\.\/(core|layout)\//.test(s)), path).toEqual([])
      expect(source, path).not.toMatch(/process\.env|DATABASE_URL|neon|postgres/i)
    }
  })

  it('the only database driver is Neon’s, and only server and test code import it', () => {
    const packageJson = JSON.parse(packageJsonText) as Record<'dependencies' | 'devDependencies', Record<string, string>>
    const names = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
    expect(names.filter((name) => /neon|postgres|^pg$|prisma|drizzle|kysely|^ws$/i.test(name))).toEqual(['@neondatabase/serverless'])
    for (const [path, source] of [...Object.entries(gameSources), ...Object.entries(workshopSources)]) {
      expect(importSpecifiers(source).filter((s) => /@neondatabase/.test(s)), path).toEqual([])
      expect(source, path).not.toMatch(/PUZZLES_READ_DATABASE_URL/)
    }
  })

  it('the player runtime reaches no legacy puzzle, static schedule, or test harness', () => {
    const reached = [...gameImportGraph().reachedSources]
    expect(reached).toContain('/src/data/puzzleCalendar.ts')
    expect(
      reached.filter((path) =>
        /\/src\/data\/(archivePuzzles|\w+Puzzle)\.ts$|\/src\/layout\/\w+PuzzleLayout\.ts$|\/src\/testing\/|\.test\.tsx?$/.test(path),
      ),
    ).toEqual([])
  })

  it('only the player calendar client fetches, and only the two read-only API routes', () => {
    for (const [path, source] of Object.entries(gameSources)) {
      if (/\.test\.tsx?$|\/src\/testing\//.test(path)) continue
      if (path === '/src/data/puzzleCalendar.ts') continue
      expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
    }
    const client = gameSources['/src/data/puzzleCalendar.ts']
    expect(client).toMatch(/CALENDAR_ENDPOINT = '\/api\/calendar'/)
    expect(client).toMatch(/PUZZLE_ENDPOINT = '\/api\/puzzle'/)
    expect(client.match(/https?:\/\//g)).toBeNull()
  })

  it('the player API read layer (server/) is never imported by player or Workshop browser code', () => {
    expect(Object.keys(serverSources).length).toBeGreaterThan(0)
    for (const [path, source] of [...Object.entries(gameSources), ...Object.entries(workshopSources)]) {
      expect(importSpecifiers(source).filter((s) => /(^|\/)server\//.test(s) && !/workshop\/server/.test(s)), path).toEqual([])
    }
    expect([...gameImportGraph().reachedSources].filter((path) => path.startsWith('/server/'))).toEqual([])
  })

  it('the player API reads only the release-gated view, configured only by PUZZLES_READ_DATABASE_URL', () => {
    for (const [path, source] of Object.entries(serverSources)) {
      if (path.endsWith('.test.ts')) continue
      // No owner/write credential, not even as a fallback.
      const variables = new Set(source.match(/\b[A-Z][A-Z0-9_]*(DATABASE_URL|POSTGRES_URL|PG(HOST|USER|PASSWORD|DATABASE))[A-Z0-9_]*\b/g) ?? [])
      const allowed = new Set(['PUZZLES_READ_DATABASE_URL', 'READER_DATABASE_URL_VARIABLE'])
      expect([...variables].filter((name) => !allowed.has(name)), path).toEqual([])
      expect(source, path).not.toMatch(/published_puzzles|process\.env|import\.meta\.env|VITE_/)
      expect(importSpecifiers(source).filter((s) => /workshop|tools\/generator/.test(s)), path).toEqual([])
    }
    // The Vercel entry points only hand process.env to the shared adapter.
    expect(Object.keys(apiSources).sort()).toEqual(['/api/calendar.ts', '/api/puzzle.ts'])
    for (const [path, source] of Object.entries(apiSources)) {
      expect(source, path).toMatch(/webHandler\(handle\w+Request, \(\) => process\.env\)/)
      expect(source, path).not.toMatch(/DATABASE_URL|POSTGRES|neon|released_puzzles|published_puzzles/i)
    }
    const reader = serverSources['/server/puzzles/neonReleasedPuzzleReader.ts']
    expect(reader).toMatch(/READER_DATABASE_URL_VARIABLE = 'PUZZLES_READ_DATABASE_URL'/)
    expect(reader).toMatch(/FROM released_puzzles/)
  })

  it('every runtime import reachable from the Vercel Functions carries an explicit .js extension', () => {
    // Vercel runs api/ as native Node ESM, which cannot resolve extensionless
    // relative imports (ERR_MODULE_NOT_FOUND). Type-only imports are erased.
    const allSources: Record<string, string> = { ...gameSources, ...serverSources, ...apiSources }
    const missing: string[] = []
    const queue = Object.keys(apiSources)
    const visited = new Set<string>()
    while (queue.length > 0) {
      const file = queue.pop()!
      if (visited.has(file)) continue
      visited.add(file)
      for (const match of allSources[file].matchAll(/^import\s+(?!type\s)[^'\n]*from\s+'(\.[^']+)'/gm)) {
        const specifier = match[1]
        if (!specifier.endsWith('.js')) missing.push(`${file} -> ${specifier}`)
        const resolved = new URL(specifier.replace(/\.js$/, '.ts'), `file://${file}`).pathname
        if (resolved in allSources) queue.push(resolved)
      }
    }
    expect(visited.size).toBeGreaterThan(8)
    expect(missing).toEqual([])
  })

  it('no source references the retired static schedule or its integration workflow', () => {
    for (const [path, source] of [
      ...Object.entries(gameSources),
      ...Object.entries(workshopSources),
      ...Object.entries(serverSources),
      ...Object.entries(apiSources),
    ]) {
      if (/\.test\.tsx?$/.test(path) || path === '/workshop/src/isolation.test.ts') continue
      expect(source, path).not.toMatch(/archivePuzzles|offsetDays|getArchiveEntryForDate|getArchiveEntries|\bPUZZLE_IDS\b|src\/data\/puzzleIds/)
    }
  })

  it('the reserved puzzle id list is pure data with no imports', () => {
    expect(importSpecifiers(gameSources['/src/publishing/reservedPuzzleIds.ts'])).toEqual([])
  })

  it('the Workshop has its own entry and build config', () => {
    const scripts = [...workshopIndexHtml.matchAll(/<script[^>]*src="([^"]+)"/g)].map((match) => match[1])
    expect(scripts).toEqual(['/src/main.tsx'])
    expect(workshopIndexHtml).toMatch('<title>ClueCross Workshop</title>')
    expect(workshopViteConfig).toMatch(/root:\s*'workshop'/)
  })

  it('Workshop code never imports puzzle data, Node APIs, or browser storage', () => {
    for (const [path, source] of Object.entries(workshopSources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      expect(importSpecifiers(source).filter((s) => /src\/data|src\/testing|^node:|^fs$|^path$/.test(s)), path).toEqual([])
      expect(source, path).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    }
  })

  it('Workshop browser code talks only to its own sourcing and publishing endpoints, never a provider or credential', () => {
    // The only allowed network calls: the live source's POST to /api/sourcing
    // and the publishing client's POSTs to /api/publishing/{preview,publish}.
    const fetchers = ['/workshop/src/sourcing/liveSource.ts', '/workshop/src/publishing/publishingClient.ts']
    for (const [path, source] of Object.entries(workshopSources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      if (!fetchers.includes(path)) {
        expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
      }
      expect(source, path).not.toMatch(/https?:\/\/|api\.anthropic\.com|openai/i)
      expect(source, path).not.toMatch(/anthropic|api[_-]?key|secret|bearer|x-api-key|import\.meta\.env/i)
      expect(importSpecifiers(source).filter((s) => /server/.test(s)), path).toEqual([])
    }
    const liveSource = workshopSources['/workshop/src/sourcing/liveSource.ts']
    expect(liveSource).toMatch(/SOURCING_ENDPOINT = '\/api\/sourcing'/)
    expect(liveSource.match(/fetch\w*\(/g)).toEqual(['fetch(', 'fetchImpl('])

    const contract = workshopSources['/workshop/src/publishing/contract.ts']
    expect(contract).toMatch(/PUBLISHING_PREVIEW_PATH = '\/api\/publishing\/preview'/)
    expect(contract).toMatch(/PUBLISHING_PUBLISH_PATH = '\/api\/publishing\/publish'/)
    const client = workshopSources['/workshop/src/publishing/publishingClient.ts']
    expect(client.match(/fetch\w*\(/g)).toEqual(['fetch(', 'fetchImpl('])
    expect(client).toMatch(/fetchImpl\(path,/)
    expect(client).toMatch(/post<PreviewResponseBody>\(PUBLISHING_PREVIEW_PATH,/)
    expect(client).toMatch(/post<PublishResponseBody>\(PUBLISHING_PUBLISH_PATH,/)
  })

  it('Workshop browser code never touches the database layer', () => {
    for (const [path, source] of Object.entries(workshopSources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      const specifiers = importSpecifiers(source)
      expect(specifiers.filter((s) => /@neondatabase|^pg$|postgres|workshop\/server|(^|\/)db\//.test(s)), path).toEqual([])
      expect(source, path).not.toMatch(/DATABASE_URL|@neondatabase/)
    }
  })

  it('credentials stay server-side: no VITE_ credential variables or config-time defines', () => {
    expect(workshopViteConfig).not.toMatch(/VITE_\w*(KEY|TOKEN|SECRET|MODEL)|\bdefine\s*:/)
    expect(workshopViteConfig).toMatch(/process\.env\.ANTHROPIC_API_KEY/)
  })
})
