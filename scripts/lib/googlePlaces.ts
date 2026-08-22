export interface PlaceMatchInput {
  name: string
  address: string
  latitude?: number
  longitude?: number
}

export interface GooglePlace {
  id: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  googleMapsUri?: string
}

export const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

function similarity(left: string, right: string) {
  const a = normalize(left)
  const b = normalize(right)
  if (a === b) return 1
  if (!a || !b) return 0
  if (a.includes(b) || b.includes(a)) return 0.85
  const pairs = new Set(Array.from({ length: Math.max(0, a.length - 1) }, (_, index) => a.slice(index, index + 2)))
  const otherPairs = Array.from({ length: Math.max(0, b.length - 1) }, (_, index) => b.slice(index, index + 2))
  return otherPairs.length ? otherPairs.filter((pair) => pairs.has(pair)).length / Math.max(pairs.size, otherPairs.length) : 0
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const dLat = radians(lat2 - lat1)
  const dLon = radians(lon2 - lon1)
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function scoreGooglePlaceMatch(input: PlaceMatchInput, place: GooglePlace) {
  const nameScore = similarity(input.name, place.displayName?.text ?? '')
  const addressScore = similarity(input.address, place.formattedAddress ?? '')
  let locationScore = 0.5
  const latitude = place.location?.latitude
  const longitude = place.location?.longitude
  if (input.latitude != null && input.longitude != null && latitude != null && longitude != null) {
    const distance = distanceMeters(input.latitude, input.longitude, latitude, longitude)
    locationScore = distance <= 75 ? 1 : distance <= 250 ? 0.8 : distance <= 750 ? 0.4 : 0
  }
  return Number((nameScore * 0.5 + addressScore * 0.3 + locationScore * 0.2).toFixed(3))
}

export async function findGooglePlaceMatch(input: PlaceMatchInput, apiKey: string) {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is required')
  const locationBias = input.latitude != null && input.longitude != null ? {
    circle: { center: { latitude: input.latitude, longitude: input.longitude }, radius: 750 },
  } : undefined
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri',
    },
    body: JSON.stringify({ textQuery: `${input.name}, ${input.address}`, locationBias, maxResultCount: 5 }),
  })
  if (!response.ok) throw new Error(`Google Places search failed (${response.status})`)
  const payload = await response.json() as { places?: GooglePlace[] }
  const best = (payload.places ?? [])
    .filter((place) => place.rating != null && place.userRatingCount != null)
    .map((place) => ({ place, confidence: scoreGooglePlaceMatch(input, place) }))
    .sort((a, b) => b.confidence - a.confidence)[0]
  return best ? { ...best, requiresReview: best.confidence < 0.85 } : null
}
