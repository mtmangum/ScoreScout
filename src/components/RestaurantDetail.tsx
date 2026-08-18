import type { Restaurant } from '../features/restaurants/types'
import { ScoreBadge } from './ScoreBadge'

interface RestaurantDetailProps { restaurant: Restaurant; favorite: boolean; onToggleFavorite: () => void; onClose: () => void }

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function RestaurantDetail({ restaurant, favorite, onToggleFavorite, onClose }: RestaurantDetailProps) {
  const latest = restaurant.inspections[0]
  const profile = restaurant.profile
  const trendWord = profile.trendAdjustment > 0.2 ? 'improving' : profile.trendAdjustment < -0.2 ? 'declining' : 'steady'
  const chartInspections = restaurant.inspections.slice(0, 4).reverse()
  const chartMinimum = Math.min(60, Math.floor(Math.min(...chartInspections.map(({ score }) => score)) / 10) * 10)
  const chartLeft = 32
  const chartRight = 308
  const chartTop = 18
  const chartBottom = 124
  const chartX = (index: number) => chartInspections.length === 1
    ? (chartLeft + chartRight) / 2
    : chartLeft + index * (chartRight - chartLeft) / (chartInspections.length - 1)
  const chartY = (score: number) => chartTop + (100 - score) * (chartBottom - chartTop) / (100 - chartMinimum)
  const chartPoints = chartInspections.map(({ score }, index) => `${chartX(index)},${chartY(score)}`).join(' ')
  const communitySourceUrl = restaurant.communityRating?.sourceBusinessId.startsWith('fixture-')
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name}, ${restaurant.address}`)}`
    : restaurant.communityRating?.sourceUrl
  return (
    <aside className="detail-panel" aria-label={`${restaurant.name} details`}>
      <button className="close-button" onClick={onClose} aria-label="Close details">×</button>
      <p className="eyebrow">Inspection history</p>
      <h2>{restaurant.name}</h2>
      <p className="address">{restaurant.address}</p>
      <button className={`detail-favorite ${favorite ? 'active' : ''}`} type="button" onClick={onToggleFavorite} aria-pressed={favorite}><span aria-hidden="true">{favorite ? '★' : '☆'}</span> {favorite ? 'Saved' : 'Save restaurant'}</button>

      <div className="profile-hero">
        <ScoreBadge score={profile.score} size="large" />
        <div><span>Inspection History Profile</span><strong>{profile.score} / 100</strong></div>
      </div>

      <div className="facts">
        <div><span>Latest official inspection</span><strong>{latest.score} / 100</strong><small>{dateFormatter.format(new Date(latest.date))}</small></div>
        <div><span>Confidence</span><strong>{profile.confidence}</strong><small>{restaurant.inspections.length} inspection{restaurant.inspections.length === 1 ? '' : 's'} available</small></div>
      </div>

      {restaurant.communityRating && (
        <section className="community-card">
          <div>
            <p className="eyebrow">Community rating</p>
            <strong><span aria-hidden="true">★</span> {restaurant.communityRating.rating.toFixed(1)} / 5</strong>
            <small>Based on {restaurant.communityRating.reviewCount.toLocaleString()} Google reviews</small>
          </div>
          <a href={communitySourceUrl} target="_blank" rel="noreferrer">View place ↗</a>
        </section>
      )}

      <section>
        <h3>Recent official scores</h3>
        <div className="score-chart">
          <svg viewBox="0 0 340 158" role="img" aria-label={`Official inspection scores over time: ${chartInspections.map(({ score }) => score).join(', ')}`}>
            <rect className="chart-band chart-high" x={chartLeft} y={chartY(100)} width={chartRight - chartLeft} height={chartY(90) - chartY(100)} />
            <rect className="chart-band chart-medium" x={chartLeft} y={chartY(90)} width={chartRight - chartLeft} height={chartY(70) - chartY(90)} />
            {chartMinimum < 70 && <rect className="chart-band chart-low" x={chartLeft} y={chartY(70)} width={chartRight - chartLeft} height={chartY(chartMinimum) - chartY(70)} />}
            {[100, 90, 70, chartMinimum].filter((value, index, values) => values.indexOf(value) === index).map((value) => (
              <g key={value}><line className="chart-grid" x1={chartLeft} x2={chartRight} y1={chartY(value)} y2={chartY(value)} /><text className="chart-axis" x={chartLeft - 7} y={chartY(value) + 3}>{value}</text></g>
            ))}
            {chartInspections.length > 1 && <polyline className="chart-line" points={chartPoints} />}
            {chartInspections.map((inspection, index) => (
              <g key={inspection.id}>
                <circle className="chart-point" cx={chartX(index)} cy={chartY(inspection.score)} r="5" />
                <text className="chart-score" x={chartX(index)} y={chartY(inspection.score) - 10}>{inspection.score}</text>
                <text className="chart-date" x={chartX(index)} y="145">{dateFormatter.format(new Date(inspection.date)).replace(/ \d{1,2},/, '')}</text>
              </g>
            ))}
          </svg>
          <div className="chart-legend"><span><i className="dot high" />90–100</span><span><i className="dot medium" />70–89</span><span><i className="dot low" />Below 70</span></div>
        </div>
      </section>

      <section className="explanation">
        <h3>How this was calculated</h3>
        <p>Recent inspections carry more weight. This location's recent pattern is {trendWord}; score variation adjusted the profile by {profile.consistencyAdjustment.toFixed(1)} points and the recent trend by {profile.trendAdjustment >= 0 ? '+' : ''}{profile.trendAdjustment.toFixed(1)}.</p>
      </section>
      <a className="source-link" href="https://data.austintexas.gov/Health-and-Community-Services/Food-Establishment-Inspection-Scores/ecmv-9xxi" target="_blank" rel="noreferrer">View official source ↗</a>
    </aside>
  )
}
