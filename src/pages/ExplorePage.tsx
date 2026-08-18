import { useMemo, useState, type CSSProperties } from 'react'
import { MapView } from '../components/MapView'
import { RestaurantDetail } from '../components/RestaurantDetail'
import { RestaurantList } from '../components/RestaurantList'
import { restaurants } from '../data/restaurants'
import scoreScoutLogo from '../assets/scorescout-logo.png'

export function ExplorePage() {
  const [query, setQuery] = useState('')
  const [scoreLimit, setScoreLimit] = useState(69)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return restaurants.filter((restaurant) =>
      restaurant.profile.score <= scoreLimit &&
      (!normalized || `${restaurant.name} ${restaurant.address}`.toLowerCase().includes(normalized)),
    )
  }, [query, scoreLimit])
  const selected = restaurants.find((restaurant) => restaurant.id === selectedId) ?? null
  const sliderColor = scoreLimit >= 90 ? '#18724b' : scoreLimit >= 70 ? '#d28524' : '#b54735'
  const sliderProgress = (scoreLimit - 50) * 2

  return (
    <main className="app-shell">
      <section className="sidebar">
        <header className="brand"><img className="brand-mark" src={scoreScoutLogo} alt="" /><div><strong>ScoreScout</strong><small>Austin inspection explorer</small></div></header>
        <div className="intro"><p className="eyebrow">Explore Austin</p><h1>Restaurant inspection history, in context.</h1><p>Official scores, recent patterns, and clear explanations—all in one place.</p></div>
        <div className="filters">
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or address" /></label>
          <label className="score-filter" style={{ '--slider-color': sliderColor } as CSSProperties}>
            <span className="score-filter-label"><span>Maximum inspection profile</span><strong>{scoreLimit === 100 ? 'Any' : scoreLimit}</strong></span>
            <input type="range" min="50" max="100" step="1" value={scoreLimit} onChange={(event) => setScoreLimit(Number(event.target.value))} aria-label="Maximum inspection profile score" aria-valuetext={`${scoreLimit} or below`} style={{ '--score-progress': sliderProgress } as CSSProperties} />
          </label>
        </div>
        <div className="results-heading"><strong>{filtered.length} places</strong><span>Fixture preview</span></div>
        <RestaurantList restaurants={filtered} selectedId={selectedId} onSelect={setSelectedId} />
        <footer>Data source: City of Austin · Scores are not live yet</footer>
      </section>
      <section className="map-region"><MapView restaurants={filtered} selectedId={selectedId} onSelect={setSelectedId} /><div className="legend"><span><i className="dot high" />90–100</span><span><i className="dot medium" />70–89</span><span><i className="dot low" />Below 70</span></div></section>
      {selected && <RestaurantDetail restaurant={selected} onClose={() => setSelectedId(null)} />}
    </main>
  )
}
