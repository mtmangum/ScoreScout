import type { Confidence, ProfileBreakdown } from './types'

const weights = [0.5, 0.3, 0.15, 0.05]

export function confidenceForCount(count: number): Confidence {
  if (count <= 1) return 'Limited'
  if (count === 2) return 'Moderate'
  if (count <= 4) return 'Good'
  return 'High'
}

export function calculateProfile(scoresNewestFirst: number[]): ProfileBreakdown {
  if (scoresNewestFirst.length === 0) {
    throw new Error('At least one inspection score is required')
  }
  if (scoresNewestFirst.some((score) => score < 0 || score > 100)) {
    throw new Error('Inspection scores must be between 0 and 100')
  }

  const values = scoresNewestFirst.slice(0, 4)
  const activeWeights = weights.slice(0, values.length)
  const totalWeight = activeWeights.reduce((sum, value) => sum + value, 0)
  const weightedHistoryScore = values.reduce(
    (sum, score, index) => sum + score * activeWeights[index],
    0,
  ) / totalWeight
  const mean = values.reduce((sum, score) => sum + score, 0) / values.length
  const standardDeviation = Math.sqrt(
    values.reduce((sum, score) => sum + (score - mean) ** 2, 0) / values.length,
  )
  const consistencyAdjustment = -Math.min(5, standardDeviation * 0.25)
  const rawTrend = values.length > 1
    ? (values[0] - values.at(-1)!) / (values.length - 1)
    : 0
  const trendAdjustment = Math.max(-3, Math.min(3, rawTrend * 0.65))
  const score = Math.round(Math.max(0, Math.min(
    100,
    weightedHistoryScore + consistencyAdjustment + trendAdjustment,
  )))

  return {
    score,
    confidence: confidenceForCount(scoresNewestFirst.length),
    weightedHistoryScore,
    consistencyAdjustment,
    trendAdjustment,
  }
}
