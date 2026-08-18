interface ScoreBadgeProps { score: number; size?: 'small' | 'large' }

export function ScoreBadge({ score, size = 'small' }: ScoreBadgeProps) {
  const tone = score >= 90 ? 'high' : score >= 70 ? 'medium' : 'low'
  return <span className={`score-badge score-${tone} score-${size}`}>{score}</span>
}
