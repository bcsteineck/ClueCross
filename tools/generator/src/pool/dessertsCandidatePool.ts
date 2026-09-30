// Desserts regression fixture: the full 65-answer pool from a live
// low-effort "Desserts" Candidate Sourcing run (claude-sonnet-5), transcribed
// from the author's Workshop screenshots of one 11-answer candidate — its 11
// "Selected answers" plus 54 "Unselected candidate words". A deterministic,
// naturally difficult construction pool for generator tests and future
// generator investigations only.
//
// Provenance limits, stated so results aren't over-read:
// - This is the full sourced pool, NOT the author's curated ~40-word pool
//   (that list wasn't recoverable).
// - Words are the Workshop's construction forms (spaces/hyphens already
//   removed), because the screenshots show construction forms.
// - The Workshop displays them alphabetically, so the model's original
//   order is unknown; alphabetical order is used here. Pool order feeds the
//   seeded subset shuffle, so the author's exact Workshop batches can't be
//   replayed — only the same pool under deterministic test seeds.
export const DESSERTS_CANDIDATE_POOL: string[] = [
  'BAKEDAPPLE',
  'BAKLAVA',
  'BEIGNET',
  'BLANCMANGE',
  'BREADPUDDING',
  'BRITTLE',
  'BROWNIE',
  'CAKE',
  'CANNOLI',
  'CARAMEL',
  'CHEESECAKE',
  'CHOCOLATE',
  'CHURRO',
  'COBBLER',
  'COMPOTE',
  'COOKIE',
  'CREMEBRULEE',
  'CRISP',
  'CROISSANT',
  'CRUMBLE',
  'CUPCAKE',
  'CUSTARD',
  'DOUGHNUT',
  'ECLAIR',
  'FLAN',
  'FRITTER',
  'FROZENYOGURT',
  'FRUITSALAD',
  'FUDGE',
  'GELATO',
  'GINGERBREAD',
  'GULABJAMUN',
  'HALVA',
  'ICECREAM',
  'MACARON',
  'MARSHMALLOW',
  'MERINGUE',
  'MOCHI',
  'MOUSSE',
  'MUFFIN',
  'NOUGAT',
  'PANCAKE',
  'PANNACOTTA',
  'PARFAIT',
  'PASTRY',
  'PAVLOVA',
  'PIE',
  'POPSICLE',
  'PRALINE',
  'PUDDING',
  'RICEPUDDING',
  'SCONE',
  'SEMIFREDDO',
  'SHORTCAKE',
  'SORBET',
  'SOUFFLE',
  'STRUDEL',
  'SUNDAE',
  'TAFFY',
  'TART',
  'TIRAMISU',
  'TOFFEE',
  'TRIFLE',
  'TRUFFLE',
  'WAFFLE',
]

/** The 11 answers of the author's observed 11-answer Workshop candidate (a known-constructible subset). */
export const DESSERTS_OBSERVED_11: string[] = [
  'BEIGNET',
  'CROISSANT',
  'DOUGHNUT',
  'ECLAIR',
  'FLAN',
  'MERINGUE',
  'MOCHI',
  'PRALINE',
  'SOUFFLE',
  'SUNDAE',
  'TRIFLE',
]
