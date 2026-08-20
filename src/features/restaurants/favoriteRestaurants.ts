import type { RestaurantSummary } from './types'

export function mergeRestaurantSources(restaurants: RestaurantSummary[], favoriteSnapshots: RestaurantSummary[]) {
  const byId = new Map(favoriteSnapshots.map((restaurant) => [restaurant.id, restaurant]))
  restaurants.forEach((restaurant) => byId.set(restaurant.id, restaurant))
  return [...byId.values()]
}

export function composeRestaurantList(
  savedRestaurants: RestaurantSummary[],
  browseRestaurants: RestaurantSummary[],
  favoriteIds: ReadonlySet<string>,
  favoritesOnly: boolean,
) {
  if (favoritesOnly) return savedRestaurants
  return [...savedRestaurants, ...browseRestaurants.filter(({ id }) => !favoriteIds.has(id))]
}
