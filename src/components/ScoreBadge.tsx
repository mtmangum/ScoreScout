import { scoreTone } from '../features/restaurants/scoreTone'

interface ScoreBadgeProps { score: number; size?: 'small' | 'large' }

export function ScoreBadge({ score, size = 'small' }: ScoreBadgeProps) {
  const tone = scoreTone(score)
  return <span className={`score-badge score-${tone} score-${size}`}>{score}</span>
}
