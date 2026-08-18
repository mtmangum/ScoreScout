import type { Restaurant } from '../features/restaurants/types'

interface RestaurantResponse {
  restaurants: Restaurant[]
  source: 'live'
}

export interface RestaurantTarget {
  routeId?: string
  facilityId?: string
}

export async function fetchRestaurants(query?: string, includeAllFacilities = false, target: RestaurantTarget = {}, signal?: AbortSignal) {
  const search = new URLSearchParams()
  if (query) search.set('q', query)
  if (includeAllFacilities) search.set('includeAll', 'true')
  if (target.routeId) search.set('targetRoute', target.routeId)
  if (target.facilityId) search.set('targetFacility', target.facilityId)
  const url = `/api/restaurants${search.size ? `?${search}` : ''}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Restaurant API returned ${response.status}`)
  const payload = await response.json() as RestaurantResponse
  return payload.restaurants
}
