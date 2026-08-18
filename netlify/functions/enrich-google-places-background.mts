import { findGooglePlaceMatch } from '../../scripts/lib/googlePlaces.ts'
import { supabaseRequest } from './_shared/supabase.mts'

interface RestaurantCandidate {
  id: string
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

export default async (request: Request) => {
  const secret = process.env.IMPORT_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return Response.json({ error: 'GOOGLE_PLACES_API_KEY is required' }, { status: 503 })

  const requestedLimit = Number(new URL(request.url).searchParams.get('limit') ?? 50)
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 50))
  const response = await supabaseRequest(`restaurants?select=id,name,address,latitude,longitude&or=(latitude.is.null,longitude.is.null)&limit=${limit}`)
  const candidates = await response.json() as RestaurantCandidate[]
  let matched = 0
  let reviewRequired = 0

  for (const candidate of candidates) {
    const match = await findGooglePlaceMatch({ name: candidate.name, address: candidate.address }, apiKey)
    const place = match?.place
    const latitude = place?.location?.latitude
    const longitude = place?.location?.longitude
    if (!match || !place || match.requiresReview || latitude == null || longitude == null) {
      reviewRequired += 1
      continue
    }
    await supabaseRequest(`restaurants?id=eq.${candidate.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ latitude, longitude }),
    })
    await supabaseRequest('community_ratings?on_conflict=restaurant_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        restaurant_id: candidate.id,
        source: 'Google Places',
        source_business_id: place.id,
        rating: place.rating,
        review_count: place.userRatingCount,
        source_url: place.googleMapsUri,
        match_confidence: match.confidence,
        matched_at: new Date().toISOString(),
        refreshed_at: new Date().toISOString(),
      }),
    })
    matched += 1
  }

  return Response.json({ attempted: candidates.length, matched, reviewRequired })
}

export const config = { path: '/api/enrich-google-places' }
