import type { Restaurant } from '../features/restaurants/types'

interface RestaurantResponse {
  restaurants: Restaurant[]
  source: 'live'
}

export async function fetchRestaurants(query?: string, signal?: AbortSignal) {
  const url = query ? `/api/restaurants?q=${encodeURIComponent(query)}` : '/api/restaurants'
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Restaurant API returned ${response.status}`)
  const payload = await response.json() as RestaurantResponse
  return payload.restaurants
}
