import type { Restaurant } from '../features/restaurants/types'

interface RestaurantResponse {
  restaurants: Restaurant[]
  source: 'live'
}

export interface RestaurantTarget {
  routeId?: string
  facilityId?: string
}

const favoriteLookupBatchSize = 50

export async function fetchRestaurants(query?: string, includeAllFacilities = false, target: RestaurantTarget = {}, signal?: AbortSignal) {
  const search = new URLSearchParams()
  if (query) search.set('q', query)
  if (includeAllFacilities) search.set('includeAll', 'true')
  if (target.routeId) search.set('targetRoute', target.routeId)
  if (target.facilityId) search.set('targetFacility', target.facilityId)
  const queryString = search.toString()
  const url = `/api/restaurants${queryString ? `?${queryString}` : ''}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Restaurant API returned ${response.status}`)
  const payload = await response.json() as RestaurantResponse
  return payload.restaurants
}

export async function fetchRestaurantsByIds(ids: string[], signal?: AbortSignal) {
  const uniqueIds = [...new Set(ids)]
  const batches = Array.from({ length: Math.ceil(uniqueIds.length / favoriteLookupBatchSize) }, (_, index) =>
    uniqueIds.slice(index * favoriteLookupBatchSize, (index + 1) * favoriteLookupBatchSize))
  const responses = await Promise.all(batches.map(async (batch) => {
    const search = new URLSearchParams({ ids: batch.join(',') })
    const response = await fetch(`/api/restaurants?${search}`, { signal })
    if (!response.ok) throw new Error(`Favorite restaurant API returned ${response.status}`)
    return (await response.json() as RestaurantResponse).restaurants
  }))
  return responses.flat()
}
