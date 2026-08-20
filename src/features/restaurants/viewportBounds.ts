export interface ViewportBounds { north: number; south: number; east: number; west: number }

export function isWithinBounds(restaurant: { latitude: number; longitude: number }, bounds: ViewportBounds) {
  return restaurant.latitude <= bounds.north && restaurant.latitude >= bounds.south
    && restaurant.longitude >= bounds.west && restaurant.longitude <= bounds.east
}
