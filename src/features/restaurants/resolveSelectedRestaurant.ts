export interface SelectionParams {
  facilityId?: string
  cityCode?: string
  restaurantKey?: string
}

interface Routable {
  facilityId: string
  cityCode: string
  routeId: string
  routeAliases?: string[]
  facilityAliases?: string[]
}

/**
 * Resolves the restaurant a URL points at, across the route formats the app
 * supports: `/restaurants/:facilityId`, `/:cityCode/:restaurantKey` (routeId
 * suffix), and the legacy `/r/:restaurantKey` (facilityId suffix, no separate
 * param). Order matters: facilityId is exact and checked first; the legacy
 * key match is fuzzy (endsWith) and checked last, sorted longest-facilityId
 * first so a shorter facilityId can't shadow a longer one that ends with it.
 */
export function resolveSelectedRestaurant<T extends Routable>(restaurants: T[], { facilityId, cityCode, restaurantKey }: SelectionParams): T | null {
  const normalizedFacilityId = facilityId?.toUpperCase()
  if (normalizedFacilityId) {
    const byFacilityId = restaurants.find((restaurant) =>
      [restaurant.facilityId, ...(restaurant.facilityAliases ?? [])]
        .some((candidate) => candidate.toUpperCase() === normalizedFacilityId),
    )
    if (byFacilityId) return byFacilityId
  }
  if (cityCode && restaurantKey) {
    const byRoute = restaurants.find((restaurant) =>
      cityCode.toUpperCase() === restaurant.cityCode &&
      [restaurant.routeId, ...(restaurant.routeAliases ?? [])]
        .some((routeId) => restaurantKey.endsWith(`-${routeId}`)),
    )
    if (byRoute) return byRoute
  }
  if (restaurantKey) {
    const normalizedKey = restaurantKey.toLowerCase()
    const byLegacyKey = restaurants
      .flatMap((restaurant) => [restaurant.facilityId, ...(restaurant.facilityAliases ?? [])]
        .map((candidateFacilityId) => ({ restaurant, candidateFacilityId })))
      .sort((a, b) => b.candidateFacilityId.length - a.candidateFacilityId.length)
      .find(({ candidateFacilityId }) => normalizedKey.endsWith(`-${candidateFacilityId.toLowerCase()}`))
    if (byLegacyKey) return byLegacyKey.restaurant
  }
  return null
}
