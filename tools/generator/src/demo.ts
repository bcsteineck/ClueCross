// Minimal manual smoke test: constructs one tiny puzzle and prints its
// placed answers and cell coordinates as plain text. Not a renderer —
// just proof that the compiled engine runs end-to-end under Node. Run via:
//
//   npx tsc -p tools/generator/tsconfig.json
//   node tools/generator/dist/demo.js

import { constructFixedAnswerPuzzle } from './placement/backtrack.js'

const result = constructFixedAnswerPuzzle({
  mode: 'fixed-answer',
  answers: ['CAT', 'TIE', 'EAR', 'RUG'],
  maxWidth: 8,
  maxHeight: 8,
  seed: 'demo-seed',
})

if (!result.ok) {
  console.log(`Construction failed: ${result.reason}`)
  process.exit(1)
}

console.log(`Constructed a ${result.width}x${result.height} layout in ${result.attemptsUsed} attempt(s).`)
console.log('Placed answers:')
for (const answer of result.placedAnswers) {
  console.log(`  ${answer.word} (${answer.direction}) starting at (${answer.start.x}, ${answer.start.y})`)
}
console.log('Cells:')
for (const [cellId, letter] of Object.entries(result.cells)) {
  const position = result.positions[cellId]
  console.log(`  ${cellId}: '${letter}' at (${position.x}, ${position.y})`)
}
