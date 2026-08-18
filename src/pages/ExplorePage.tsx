import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MapView } from '../components/MapView'
import { RestaurantDetail } from '../components/RestaurantDetail'
import { RestaurantList } from '../components/RestaurantList'
import { useFavorites } from '../hooks/useFavorites'
import { useRestaurants } from '../hooks/useRestaurants'
import scoreScoutLogo from '../assets/scorescout-logo.png'

type RestaurantSort = 'score-desc' | 'score-asc' | 'inspection-desc' | 'name-asc'

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function ExplorePage() {
  const navigate = useNavigate()
  const { restaurants, source, loading } = useRestaurants()
  const { favoriteIds, toggleFavorite } = useFavorites()
  const { facilityId, restaurantKey, cityCode } = useParams<{ facilityId: string; restaurantKey: string; cityCode: string }>()
  const [query, setQuery] = useState('')
  const [scoreMinimum, setScoreMinimum] = useState(50)
  const [scoreMaximum, setScoreMaximum] = useState(100)
  const [sortBy, setSortBy] = useState<RestaurantSort>('score-desc')
  const [showFavorites, setShowFavorites] = useState(false)
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return restaurants.filter((restaurant) =>
      restaurant.profile.score >= scoreMinimum && restaurant.profile.score <= scoreMaximum &&
      (!showFavorites || favoriteIds.has(restaurant.id)) &&
      (!normalized || `${restaurant.name} ${restaurant.address}`.toLowerCase().includes(normalized)),
    )
  }, [restaurants, query, scoreMinimum, scoreMaximum, showFavorites, favoriteIds])
  const selected = useMemo(() => {
    const normalizedFacilityId = facilityId?.toUpperCase()
    if (normalizedFacilityId) {
      const byFacilityId = restaurants.find((restaurant) => restaurant.facilityId === normalizedFacilityId)
      if (byFacilityId) return byFacilityId
    }
    if (cityCode && restaurantKey) {
      const byRoute = restaurants.find((restaurant) =>
        cityCode.toUpperCase() === restaurant.cityCode && restaurantKey.endsWith(`-${restaurant.routeId}`),
      )
      if (byRoute) return byRoute
    }
    if (restaurantKey) {
      // Legacy /r/:restaurantKey links encode facilityId as a suffix (no separate
      // param), so match against the longest facilityId first to avoid a shorter
      // facilityId that happens to be a suffix of another one winning instead.
      const normalizedKey = restaurantKey.toLowerCase()
      const byLegacyKey = [...restaurants]
        .sort((a, b) => b.facilityId.length - a.facilityId.length)
        .find((restaurant) => normalizedKey.endsWith(`-${restaurant.facilityId.toLowerCase()}`))
      if (byLegacyKey) return byLegacyKey
    }
    return null
  }, [restaurants, facilityId, cityCode, restaurantKey])
  const selectedId = selected?.id ?? null
  const visibleRestaurants = useMemo(() => selected && !filtered.some(({ id }) => id === selected.id)
    ? [...filtered, selected]
    : filtered, [filtered, selected])
  const sortedRestaurants = useMemo(() => {
    return [...visibleRestaurants].sort((a, b) => {
      const favoriteOrder = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id))
      if (favoriteOrder) return favoriteOrder
      if (sortBy === 'score-desc') return b.profile.score - a.profile.score || a.name.localeCompare(b.name)
      if (sortBy === 'score-asc') return a.profile.score - b.profile.score || a.name.localeCompare(b.name)
      if (sortBy === 'inspection-desc') return new Date(b.inspections[0].date).getTime() - new Date(a.inspections[0].date).getTime() || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
  }, [visibleRestaurants, sortBy, favoriteIds])
  const scoreColor = (score: number) => score >= 90 ? '#18724b' : score >= 70 ? '#d28524' : '#b54735'
  const minimumProgress = (scoreMinimum - 50) * 2
  const maximumProgress = (scoreMaximum - 50) * 2
  const selectRestaurant = (id: string) => {
    const restaurant = restaurants.find((candidate) => candidate.id === id)
    if (restaurant) navigate(`/${restaurant.cityCode}/${slugify(restaurant.name)}-${restaurant.routeId}`)
  }

  return (
    <main className="app-shell">
      <section className="sidebar">
        <header className="brand"><img className="brand-mark" src={scoreScoutLogo} alt="" /><div><strong>ScoreScout</strong><small>Austin inspection explorer</small></div></header>
        <div className="filters">
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or address" /></label>
          <div className="score-filter">
            <span className="score-filter-label"><span>Inspection profile range</span><strong>{scoreMinimum === 50 && scoreMaximum === 100 ? 'Any' : `${scoreMinimum}–${scoreMaximum}`}</strong></span>
            <div className="dual-range" style={{ '--range-start': minimumProgress, '--range-end': maximumProgress, '--range-color': scoreColor(scoreMaximum) } as CSSProperties}>
              <span className="dual-range-track" />
              <input className="range-minimum" type="range" min="50" max="100" step="1" value={scoreMinimum} onChange={(event) => setScoreMinimum(Math.min(Number(event.target.value), scoreMaximum - 1))} aria-label="Minimum inspection profile score" aria-valuetext={`${scoreMinimum} or above`} />
              <input className="range-maximum" type="range" min="50" max="100" step="1" value={scoreMaximum} onChange={(event) => setScoreMaximum(Math.max(Number(event.target.value), scoreMinimum + 1))} aria-label="Maximum inspection profile score" aria-valuetext={`${scoreMaximum} or below`} />
            </div>
          </div>
        </div>
        <div className="results-heading">
          <div className="results-meta"><strong>{visibleRestaurants.length} places</strong><span>{loading ? 'Loading Austin data…' : source === 'live' ? 'Live Austin data' : 'Showing sample data'}</span></div>
          <div className="results-controls">
            <button className={`saved-filter ${showFavorites ? 'active' : ''}`} type="button" onClick={() => setShowFavorites((current) => !current)} aria-pressed={showFavorites} aria-label={`${showFavorites ? 'Show all restaurants' : 'Show saved restaurants'}; ${favoriteIds.size} saved`}><span aria-hidden="true">★</span> {favoriteIds.size}</button>
            <select className="sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value as RestaurantSort)} aria-label="Sort restaurants">
              <option value="score-desc">Highest score</option>
              <option value="score-asc">Lowest score</option>
              <option value="inspection-desc">Newest inspection</option>
              <option value="name-asc">Name A–Z</option>
            </select>
          </div>
        </div>
        <RestaurantList restaurants={sortedRestaurants} selectedId={selectedId} favoriteIds={favoriteIds} onSelect={selectRestaurant} onToggleFavorite={toggleFavorite} />
        <footer>
          <details>
            <summary>About scores &amp; data</summary>
            <p>Inspection results are snapshots of conditions observed by Austin Public Health. The profile summarizes available history and is not an independent food-safety determination.</p>
            <p>Community ratings reflect customer sentiment and are separate from official inspections. Preview ratings are fixture data until Google Places is connected.</p>
          </details>
          <span>{source === 'live' ? 'Data source: City of Austin' : 'Live data unavailable · Sample restaurants shown'}</span>
        </footer>
      </section>
      <section className="map-region"><MapView restaurants={visibleRestaurants} selectedId={selectedId} onSelect={selectRestaurant} /><div className="legend"><span><i className="dot high" />90–100</span><span><i className="dot medium" />70–89</span><span><i className="dot low" />Below 70</span></div></section>
      {selected && <RestaurantDetail restaurant={selected} favorite={favoriteIds.has(selected.id)} onToggleFavorite={() => toggleFavorite(selected.id)} onClose={() => navigate('/')} />}
    </main>
  )
}
