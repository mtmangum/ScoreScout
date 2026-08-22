import { memo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RestaurantSummary } from '../features/restaurants/types'
import { scoreTone } from '../features/restaurants/scoreTone'
import { formatFacilityName } from '../features/restaurants/facilityName'

interface RestaurantListProps {
  restaurants: RestaurantSummary[]
  selectedId: string | null
  favoriteIds: ReadonlySet<string>
  favoritesOnly: boolean
  onSelect: (id: string) => void
  onToggleFavorite: (id: string) => void
}

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

// Matches the row's rendered height (12px vertical padding + a 17px name line +
// a 13px detail line + a 3px gap between them) — used only as react-virtual's
// starting estimate; measureElement corrects it from the real DOM afterward.
const estimatedRowHeight = 65

// Memoized: this list can hold thousands of rows, so it should only re-render
// when its own props actually change — not on every parent re-render caused
// by unrelated state, like a keystroke in the search box before it debounces.
export const RestaurantList = memo(function RestaurantList({ restaurants, selectedId, favoriteIds, favoritesOnly, onSelect, onToggleFavorite }: RestaurantListProps) {
  const favoriteRestaurants = restaurants.filter(({ id }) => favoriteIds.has(id))
  const otherRestaurants = restaurants.filter(({ id }) => !favoriteIds.has(id))
  const pinFavorites = !favoritesOnly && favoriteRestaurants.length > 0 && otherRestaurants.length > 0
  const scrolledRestaurants = pinFavorites ? otherRestaurants : restaurants

  const scrollElementRef = useRef<HTMLDivElement>(null)
  // Only the rows within the scroll viewport (plus overscan) ever exist in the
  // DOM — this list's own row+favorite-button count was the single largest
  // contributor to the page's DOM/accessibility-tree size at full result counts.
  const rowVirtualizer = useVirtualizer({
    count: scrolledRestaurants.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
  })

  if (!restaurants.length) return <div className="empty-state">No restaurants match these filters.</div>

  const restaurantRow = (restaurant: RestaurantSummary) => (
    <div className={`restaurant-row ${selectedId === restaurant.id ? 'selected' : ''}`}>
      <button className="restaurant-row-main" onClick={() => onSelect(restaurant.id)}>
        <i className={`row-dot ${scoreTone(restaurant.profileScore)}`} aria-hidden="true" />
        <span className="row-copy"><strong>{formatFacilityName(restaurant.name)}</strong><small>Official {restaurant.latestInspection.score} · {monthFormatter.format(new Date(restaurant.latestInspection.date))}</small></span>
        <span className={`row-score ${scoreTone(restaurant.profileScore)}`}><strong>{restaurant.profileScore}</strong><small>profile</small></span>
      </button>
      <button className={`favorite-button ${favoriteIds.has(restaurant.id) ? 'active' : ''}`} type="button" onClick={() => onToggleFavorite(restaurant.id)} aria-pressed={favoriteIds.has(restaurant.id)} aria-label={`${favoriteIds.has(restaurant.id) ? 'Remove' : 'Save'} ${formatFacilityName(restaurant.name)}`}><span aria-hidden="true">{favoriteIds.has(restaurant.id) ? '★' : '☆'}</span></button>
    </div>
  )

  return (
    <div className="restaurant-list">
      {pinFavorites && <div className="pinned-restaurants" aria-label="Saved restaurants">{favoriteRestaurants.map((restaurant) => <div key={restaurant.id}>{restaurantRow(restaurant)}</div>)}</div>}
      <div className="restaurant-list-scroll" ref={scrollElementRef}>
        <div style={{ position: 'relative', width: '100%', height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const restaurant = scrolledRestaurants[virtualRow.index]
            return (
              <div
                key={restaurant.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
              >
                {restaurantRow(restaurant)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
