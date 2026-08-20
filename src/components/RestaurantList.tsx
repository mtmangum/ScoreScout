import type { RestaurantSummary } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'

interface RestaurantListProps {
  restaurants: RestaurantSummary[]
  selectedId: string | null
  favoriteIds: ReadonlySet<string>
  favoritesOnly: boolean
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
}

export function RestaurantList({ restaurants, selectedId, favoriteIds, favoritesOnly, onSelect, onToggleFavorite }: RestaurantListProps) {
  if (!restaurants.length) return <div className="empty-state">No restaurants match these filters.</div>
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const favoriteRestaurants = restaurants.filter(({ id }) => favoriteIds.has(id))
  const otherRestaurants = restaurants.filter(({ id }) => !favoriteIds.has(id))
  const pinFavorites = !favoritesOnly && favoriteRestaurants.length > 0 && otherRestaurants.length > 0
  const restaurantRow = (restaurant: RestaurantSummary) => (
    <div key={restaurant.id} className={`restaurant-row ${selectedId === restaurant.id ? 'selected' : ''}`}>
      <button className="restaurant-row-main" onClick={() => onSelect(restaurant.id)}>
        <i className={`row-dot ${scoreTone(restaurant.profileScore)}`} aria-hidden="true" />
        <span className="row-copy"><strong>{restaurant.name}</strong><small>Official {restaurant.latestInspection.score} · {monthFormatter.format(new Date(restaurant.latestInspection.date))}</small></span>
        <span className={`row-score ${scoreTone(restaurant.profileScore)}`}><strong>{restaurant.profileScore}</strong><small>profile</small></span>
      </button>
      <button className={`favorite-button ${favoriteIds.has(restaurant.id) ? 'active' : ''}`} type="button" onClick={() => onToggleFavorite(restaurant.id)} aria-pressed={favoriteIds.has(restaurant.id)} aria-label={`${favoriteIds.has(restaurant.id) ? 'Remove' : 'Save'} ${restaurant.name}`}><span aria-hidden="true">{favoriteIds.has(restaurant.id) ? '★' : '☆'}</span></button>
    </div>
  )
  return (
    <div className="restaurant-list">
      {pinFavorites && <div className="pinned-restaurants" aria-label="Saved restaurants">{favoriteRestaurants.map(restaurantRow)}</div>}
      <div className="restaurant-list-scroll">{(pinFavorites ? otherRestaurants : restaurants).map(restaurantRow)}</div>
    </div>
  )
}
