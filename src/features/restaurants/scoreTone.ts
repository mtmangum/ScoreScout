export function scoreTone(score: number) {
  if (score >= 90) return 'high'
  if (score >= 80) return 'satisfactory'
  if (score >= 70) return 'marginal'
  return 'low'
}
