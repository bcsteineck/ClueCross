// Manual-testing tools (currently: Reset Test State) exist only in local
// development, tests, and Vercel Preview builds. vite.config.ts bakes the
// decision into the build as the constant __CLUECROSS_TEST_TOOLS__; in a
// Production build it is `false`, so every `TEST_TOOLS_ENABLED && …` branch
// — including the control's markup and label — is removed by the minifier.

declare const __CLUECROSS_TEST_TOOLS__: boolean | undefined

/** Build-time rule: Vite dev server, Vitest, or a Vercel Preview build. Never Production. */
export function testToolsEnabledFor(mode: string, vercelEnv: string | undefined): boolean {
  if (vercelEnv === 'production') return false
  return mode === 'development' || mode === 'test' || vercelEnv === 'preview'
}

export const TEST_TOOLS_ENABLED: boolean =
  typeof __CLUECROSS_TEST_TOOLS__ !== 'undefined' && __CLUECROSS_TEST_TOOLS__ === true
