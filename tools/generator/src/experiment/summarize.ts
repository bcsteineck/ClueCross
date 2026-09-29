// Generic numeric distribution summary — min/max/mean/median over an
// arbitrary list of numbers. Used throughout the size experiment to
// aggregate a metric across a size's unique candidates without hand-
// writing this arithmetic repeatedly per field.
//
// Median is defined precisely: for an odd count, the middle sorted
// value; for an even count, the arithmetic mean of the two middle
// values. Returns null (not NaN/Infinity) for an empty input — there is
// no distribution to summarize when there are zero candidates, and null
// makes that explicit rather than producing a misleading number.
//
// Values are returned at raw floating-point precision; display rounding
// is a report-renderer concern, not this layer's.

export interface NumericSummary {
  min: number
  max: number
  mean: number
  median: number
  count: number
}

export function summarize(values: number[]): NumericSummary | null {
  if (values.length === 0) return null

  const sorted = values.slice().sort((a, b) => a - b)
  const count = sorted.length
  const min = sorted[0]
  const max = sorted[count - 1]

  let sum = 0
  for (const value of sorted) sum += value
  const mean = sum / count

  const middle = Math.floor(count / 2)
  const median = count % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2

  return { min, max, mean, median, count }
}
