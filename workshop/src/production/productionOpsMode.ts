// Whether this Workshop build was started in Production-operations mode
// (`npm run workshop:production-ops`). vite.workshop.config.ts bakes the
// decision in as __WORKSHOP_PRODUCTION_OPS__; plain `npm run workshop`,
// the static `workshop:build`, and tests get false. It only decides whether
// the Production UI is shown — the server refuses Production operations on
// its own unless it was started in that mode.

declare const __WORKSHOP_PRODUCTION_OPS__: boolean | undefined

export const PRODUCTION_OPS_ENABLED: boolean =
  typeof __WORKSHOP_PRODUCTION_OPS__ !== 'undefined' && __WORKSHOP_PRODUCTION_OPS__ === true
