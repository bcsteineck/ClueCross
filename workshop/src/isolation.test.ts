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
//   filesystem APIs, so approval can't write puzzle data.

import { describe, expect, it } from 'vitest'
import gameIndexHtml from '/index.html?raw'
import gameViteConfig from '/vite.config.ts?raw'
import workshopIndexHtml from '/workshop/index.html?raw'
import workshopViteConfig from '/vite.workshop.config.ts?raw'

const gameSources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
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

  it('the Workshop has its own entry and build config', () => {
    const scripts = [...workshopIndexHtml.matchAll(/<script[^>]*src="([^"]+)"/g)].map((match) => match[1])
    expect(scripts).toEqual(['/src/main.tsx'])
    expect(workshopIndexHtml).toMatch('<title>ClueCross Workshop</title>')
    expect(workshopViteConfig).toMatch(/root:\s*'workshop'/)
  })

  it('Workshop code never imports puzzle data, Node APIs, or browser storage', () => {
    for (const [path, source] of Object.entries(workshopSources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      const specifiers = importSpecifiers(source)
      expect(specifiers.filter((s) => /src\/data|^node:|^fs$|^path$/.test(s)), path).toEqual([])
      expect(source, path).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    }
  })

  it('Workshop candidate sourcing has no network access, provider SDK, or credentials (fixture only)', () => {
    for (const [path, source] of Object.entries(workshopSources)) {
      if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
      expect(source, path).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/)
      expect(source, path).not.toMatch(/openai|anthropic|api[_-]?key|secret|bearer/i)
    }
  })
})
