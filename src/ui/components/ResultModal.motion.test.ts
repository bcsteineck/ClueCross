import { describe, expect, it } from 'vitest'

// Vitest replaces stylesheet imports (even ?raw) with empty modules, and the
// app tsconfig deliberately has no Node types — so this one test reads the
// files through a narrowly typed node:fs import.
const { readFileSync } = (await import(/* @vite-ignore */ 'node:fs' as string)) as {
  readFileSync: (path: URL, encoding: 'utf8') => string
}
const modalStyles = readFileSync(new URL('./ResultModal.scss', import.meta.url), 'utf8')
const indexStyles = readFileSync(new URL('../../index.scss', import.meta.url), 'utf8')

// jsdom can't evaluate media queries, so this checks the stylesheet itself:
// every completion-modal animation is gated on the OS motion preference,
// and the in-app Reduce motion setting still disables all animation.
describe('completion modal motion', () => {
  it('animates only inside prefers-reduced-motion: no-preference', () => {
    const gateStart = modalStyles.indexOf('@media (prefers-reduced-motion: no-preference) {')
    expect(gateStart).toBeGreaterThan(-1)
    const gateEnd = modalStyles.indexOf('\n}\n', gateStart)
    const outside = modalStyles.slice(0, gateStart) + modalStyles.slice(gateEnd)
    expect(outside).not.toMatch(/(^|\s)animation(-delay)?\s*:/)
    expect(modalStyles.slice(gateStart, gateEnd)).toMatch(/animation:/)
  })

  it('the in-app Reduce motion setting still turns every animation off', () => {
    expect(indexStyles).toMatch(/:root\[data-reduce-motion='true'\] \*\s*\{[^}]*animation: none !important/)
  })
})
