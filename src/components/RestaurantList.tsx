import type { Restaurant } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'

interface RestaurantListProps {
  restaurants: Restaurant[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function RestaurantList({ restaurants, selectedId, onSelect }: RestaurantListProps) {
  if (!restaurants.length) return <div className="empty-state">No restaurants match these filters.</div>
  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  return (
    <div className="restaurant-list">
      {restaurants.map((restaurant) => (
        <button key={restaurant.id} className={`restaurant-row ${selectedId === restaurant.id ? 'selected' : ''}`} onClick={() => onSelect(restaurant.id)}>
          <i className={`row-dot ${scoreTone(restaurant.profile.score)}`} aria-hidden="true" />
          <span className="row-copy"><strong>{restaurant.name}</strong><small>Official {restaurant.inspections[0].score} · {monthFormatter.format(new Date(restaurant.inspections[0].date))}</small></span>
          <span className={`row-score ${scoreTone(restaurant.profile.score)}`}><strong>{restaurant.profile.score}</strong><small>profile</small></span>
        </button>
      ))}
    </div>
  )
}
