export interface ViewportBounds { north: number; south: number; east: number; west: number }

export function isWithinBounds(restaurant: { latitude: number; longitude: number }, bounds: ViewportBounds) {
  return restaurant.latitude <= bounds.north && restaurant.latitude >= bounds.south
    && restaurant.longitude >= bounds.west && restaurant.longitude <= bounds.east
}

// A map container measured before it reaches its final on-screen size (mobile
// browser chrome settling, web fonts reflowing the layout, a hidden tab
// becoming visible) can hand back a collapsed or zero-area LatLngBounds. Filtering
// the list against that would wipe it out for a reason with no on-screen cause,
// so treat it the same as "no bounds yet" rather than trusting it.
export function isValidBounds(bounds: ViewportBounds) {
  return Number.isFinite(bounds.north) && Number.isFinite(bounds.south)
    && Number.isFinite(bounds.east) && Number.isFinite(bounds.west)
    && bounds.north > bounds.south && bounds.east > bounds.west
}
