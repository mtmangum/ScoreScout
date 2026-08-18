import type { Restaurant } from '../features/restaurants/types'

interface RestaurantResponse {
  restaurants: Restaurant[]
  source: 'live'
}

export async function fetchRestaurants(signal?: AbortSignal) {
  const response = await fetch('/api/restaurants', { signal })
  if (!response.ok) throw new Error(`Restaurant API returned ${response.status}`)
  const payload = await response.json() as RestaurantResponse
  return payload.restaurants
}
