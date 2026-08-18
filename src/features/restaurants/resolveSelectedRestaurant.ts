import type { Restaurant } from './types'

export interface SelectionParams {
  facilityId?: string
  cityCode?: string
  restaurantKey?: string
}

/**
 * Resolves the restaurant a URL points at, across the route formats the app
 * supports: `/restaurants/:facilityId`, `/:cityCode/:restaurantKey` (routeId
 * suffix), and the legacy `/r/:restaurantKey` (facilityId suffix, no separate
 * param). Order matters: facilityId is exact and checked first; the legacy
 * key match is fuzzy (endsWith) and checked last, sorted longest-facilityId
 * first so a shorter facilityId can't shadow a longer one that ends with it.
 */
export function resolveSelectedRestaurant(restaurants: Restaurant[], { facilityId, cityCode, restaurantKey }: SelectionParams): Restaurant | null {
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
    const normalizedKey = restaurantKey.toLowerCase()
    const byLegacyKey = [...restaurants]
      .sort((a, b) => b.facilityId.length - a.facilityId.length)
      .find((restaurant) => normalizedKey.endsWith(`-${restaurant.facilityId.toLowerCase()}`))
    if (byLegacyKey) return byLegacyKey
  }
  return null
}
