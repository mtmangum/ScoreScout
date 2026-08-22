import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MapView } from '../components/MapView'
import { RestaurantDetail } from '../components/RestaurantDetail'
import { RestaurantList } from '../components/RestaurantList'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useFavorites } from '../hooks/useFavorites'
import { useRestaurantDetail } from '../hooks/useRestaurantDetail'
import { useRestaurants } from '../hooks/useRestaurants'
import { useTheme } from '../hooks/useTheme'
import { resolveSelectedRestaurant } from '../features/restaurants/resolveSelectedRestaurant'
import { scoreTone } from '../features/restaurants/scoreTone'
import { composeRestaurantList, mergeRestaurantSources } from '../features/restaurants/favoriteRestaurants'
import { isValidBounds, isWithinBounds, type ViewportBounds } from '../features/restaurants/viewportBounds'
import scoreScoutLogo from '../assets/scorescout-logo.png'

type RestaurantSort = 'score-desc' | 'score-asc' | 'inspection-desc' | 'name-asc'
type MobileView = 'map' | 'list'

function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  if (theme === 'dark') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20.4 15.4A8.5 8.5 0 0 1 8.6 3.6a8.5 8.5 0 1 0 11.8 11.8Z" />
    </svg>
  )
}

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
  const { facilityId, restaurantKey, cityCode } = useParams<{ facilityId: string; restaurantKey: string; cityCode: string }>()
  const [query, setQuery] = useState('')
  // Debounced separately from `query` itself: the input stays instantly
  // responsive to every keystroke, while the fetch and the derived lists below
  // only redo their work once typing has settled (instant again once cleared).
  const debouncedQuery = useDebouncedValue(query, query.trim() ? 300 : 0)
  const [includeAllFacilities, setIncludeAllFacilities] = useState(false)
  const routeSuffix = restaurantKey?.match(/-(\d+)$/)?.[1]
  const target = cityCode ? { routeId: routeSuffix } : { facilityId: facilityId ?? routeSuffix }
  // A direct institutional link is included alongside the default category,
  // without broadening the whole list to every facility type.
  const { restaurants, source, loading } = useRestaurants(debouncedQuery, includeAllFacilities, target)
  const { favoriteIds, favoriteRestaurants, toggleFavorite } = useFavorites()
  const { theme, toggleTheme } = useTheme()
  const [scoreMinimum, setScoreMinimum] = useState(50)
  const [scoreMaximum, setScoreMaximum] = useState(100)
  const [sortBy, setSortBy] = useState<RestaurantSort>('inspection-desc')
  const [showFavorites, setShowFavorites] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('map')
  const [bounds, setBounds] = useState<ViewportBounds | null>(null)
  // The API returns every matching restaurant as a lightweight summary (see
  // useRestaurants), so score filtering and sorting below apply to the whole
  // matching population, not an arbitrary page of it. Saved snapshots are
  // merged separately so favorites cannot vanish with the current query.
  const allRestaurants = useMemo(() => mergeRestaurantSources(restaurants, favoriteRestaurants), [restaurants, favoriteRestaurants])
  const filtered = useMemo(() => restaurants.filter((restaurant) =>
    restaurant.profileScore >= scoreMinimum && restaurant.profileScore <= scoreMaximum,
  ), [restaurants, scoreMinimum, scoreMaximum])
  const savedRestaurants = useMemo(() => allRestaurants.filter(({ id }) => favoriteIds.has(id)), [allRestaurants, favoriteIds])
  const selected = useMemo(
    () => resolveSelectedRestaurant(allRestaurants, { facilityId, cityCode, restaurantKey }),
    [allRestaurants, facilityId, cityCode, restaurantKey],
  )
  // The list/map only ever hold lightweight summaries; a selected restaurant's
  // full record (inspection history, community rating, etc.) is fetched on
  // demand here so it isn't carried by every row just in case it gets opened.
  const { detail: selectedDetail } = useRestaurantDetail(selected, source)
  const selectedId = selected?.id ?? null
  const browseRestaurants = useMemo(() => selected && !filtered.some(({ id }) => id === selected.id)
    ? [...filtered, selected]
    : filtered, [filtered, selected])
  const mapRestaurants = useMemo(() => {
    const base = showFavorites ? savedRestaurants : browseRestaurants
    return selected && !base.some(({ id }) => id === selected.id) ? [...base, selected] : base
  }, [showFavorites, savedRestaurants, browseRestaurants, selected])
  // A map container measured before its layout has settled (mobile browser chrome,
  // web fonts reflowing, a hidden tab becoming visible) can report a collapsed
  // bounds. Treat that the same as "no bounds yet" rather than filtering the list
  // down to nothing for a reason with no on-screen cause.
  const validBounds = bounds && isValidBounds(bounds) ? bounds : null
  // Viewport filtering is suspended while a search is active, so a match
  // outside the current map view doesn't silently disappear from the list.
  const visibleBrowseRestaurants = useMemo(() => {
    if (!validBounds || debouncedQuery.trim()) return browseRestaurants
    return browseRestaurants.filter(
      (restaurant) => restaurant.id === selected?.id || isWithinBounds(restaurant, validBounds),
    )
  }, [browseRestaurants, validBounds, debouncedQuery, selected])
  const listRestaurants = useMemo(
    () => composeRestaurantList(savedRestaurants, visibleBrowseRestaurants, favoriteIds, showFavorites),
    [showFavorites, savedRestaurants, visibleBrowseRestaurants, favoriteIds],
  )
  const sortedRestaurants = useMemo(() => {
    return [...listRestaurants].sort((a, b) => {
      const favoriteOrder = Number(favoriteIds.has(b.id)) - Number(favoriteIds.has(a.id))
      if (favoriteOrder) return favoriteOrder
      if (sortBy === 'score-desc') return b.profileScore - a.profileScore || a.name.localeCompare(b.name)
      if (sortBy === 'score-asc') return a.profileScore - b.profileScore || a.name.localeCompare(b.name)
      if (sortBy === 'inspection-desc') return new Date(b.latestInspection.date).getTime() - new Date(a.latestInspection.date).getTime() || a.name.localeCompare(b.name)
      return a.name.localeCompare(b.name)
    })
  }, [listRestaurants, sortBy, favoriteIds])
  const scoreColorByTone = { high: 'var(--green)', satisfactory: 'var(--satisfactory)', marginal: 'var(--marginal)', low: 'var(--red)' } as const
  const scoreColor = (score: number) => scoreColorByTone[scoreTone(score)]
  const minimumProgress = (scoreMinimum - 50) * 2
  const maximumProgress = (scoreMaximum - 50) * 2
  // Memoized so RestaurantList/MapView (both React.memo'd, both expensive to
  // re-render across thousands of rows/markers) don't re-render on every
  // keystroke in the search box while the query itself is still debouncing.
  const selectRestaurant = useCallback((id: string) => {
    const restaurant = allRestaurants.find((candidate) => candidate.id === id)
    if (restaurant) navigate(`/${restaurant.cityCode}/${slugify(restaurant.name)}-${restaurant.routeId}`)
  }, [allRestaurants, navigate])
  const handleToggleFavorite = useCallback((id: string) => {
    const restaurant = allRestaurants.find((candidate) => candidate.id === id)
    if (restaurant) toggleFavorite(restaurant)
  }, [allRestaurants, toggleFavorite])

  return (
    <main className="app-shell" data-mobile-view={mobileView}>
      <div className={`load-bar ${loading ? 'active' : ''}`} aria-hidden="true" />
      <header className="mobile-header">
        <img className="brand-mark" src={scoreScoutLogo} alt="" />
        <div className="mobile-brand-copy"><strong>ScoreScout</strong><small>Austin inspection explorer</small></div>
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          <ThemeIcon theme={theme} />
        </button>
      </header>
      <div className="mobile-toolbar">
        <label className="search">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or address" aria-label="Search restaurants by name or address" />
          {query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </label>
        <div className="mobile-view-toggle" role="group" aria-label="Map or list view">
          <button type="button" className={mobileView === 'map' ? 'active' : undefined} onClick={() => setMobileView('map')} aria-pressed={mobileView === 'map'}>Map</button>
          <button type="button" className={mobileView === 'list' ? 'active' : undefined} onClick={() => setMobileView('list')} aria-pressed={mobileView === 'list'}>List</button>
        </div>
      </div>
      <section className="sidebar">
        <header className="brand">
          <img className="brand-mark" src={scoreScoutLogo} alt="" />
          <div><strong>ScoreScout</strong><small>Austin inspection explorer</small></div>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <ThemeIcon theme={theme} />
          </button>
        </header>
        <div className="filters">
          <label className="search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or address" aria-label="Search restaurants by name or address" />
            {query && <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
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
          <div className="results-meta"><strong>{sortedRestaurants.length} places{validBounds && !debouncedQuery.trim() && !showFavorites ? ' in view' : ''}</strong><span>{loading ? 'Loading Austin data…' : source === 'live' ? 'Live Austin data' : 'Showing sample data'}</span></div>
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
        <RestaurantList restaurants={sortedRestaurants} selectedId={selectedId} favoriteIds={favoriteIds} favoritesOnly={showFavorites} onSelect={selectRestaurant} onToggleFavorite={handleToggleFavorite} />
        <footer>
          <details>
            <summary>About scores &amp; data</summary>
            <p>Inspection results are snapshots of conditions observed by Austin Public Health. The profile summarizes available history and is not an independent food-safety determination.</p>
            <p>Community ratings reflect customer sentiment and are separate from official inspections. Preview ratings are fixture data until Google Places is connected.</p>
            <label className="footer-facility-toggle">
              <input type="checkbox" checked={includeAllFacilities} onChange={(event) => setIncludeAllFacilities(event.target.checked)} />
              <span><strong>Show all inspected facilities</strong><small>Includes identified schools, hospitals, nursing facilities, and similar institutional locations.</small></span>
            </label>
          </details>
          <span>{loading ? 'Loading Austin data…' : source === 'live' ? 'Data source: City of Austin' : 'Live data unavailable · Sample restaurants shown'}</span>
        </footer>
      </section>
      <section className="map-region"><MapView restaurants={mapRestaurants} selectedId={selectedId} onSelect={selectRestaurant} onBoundsChange={setBounds} /><div className="legend"><span><i className="dot high" />90–100</span><span><i className="dot satisfactory" />80–89</span><span><i className="dot marginal" />70–79</span><span><i className="dot low" />Below 70</span></div></section>
      {selected && <RestaurantDetail restaurant={selectedDetail} name={selected.name} onClose={() => navigate('/')} />}
    </main>
  )
}
