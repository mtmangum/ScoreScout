export function scoreTone(score: number) {
  if (score >= 90) return 'high'
  if (score >= 70) return 'medium'
  return 'low'
}
