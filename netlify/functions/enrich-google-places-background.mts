import { findGooglePlaceMatch } from '../../scripts/lib/googlePlaces.ts'
import { supabaseRequest } from './_shared/supabase.mts'

interface RestaurantCandidate {
  id: string
  route_number: number
  name: string
  address: string
  latitude: number | null
  longitude: number | null
}

// Coordinates are populated separately by /api/geocode-census (free, no
// coverage/cost limit). Google Places is used only for community ratings,
// so a restaurant with no coordinates yet can still get a rating.

export default async (request: Request) => {
  const secret = process.env.IMPORT_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return Response.json({ error: 'GOOGLE_PLACES_API_KEY is required' }, { status: 503 })

  const requestUrl = new URL(request.url)
  const requestedLimit = Number(requestUrl.searchParams.get('limit') ?? 50)
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 50))
  const requestedAfter = Number(requestUrl.searchParams.get('after') ?? 0)
  const after = Math.max(0, Number.isFinite(requestedAfter) ? requestedAfter : 0)
  const response = await supabaseRequest(`restaurants_needing_rating?route_number=gt.${after}&order=route_number.asc&limit=${limit}`)
  const candidates = await response.json() as RestaurantCandidate[]
  let matched = 0
  let reviewRequired = 0
  const decisions: Array<{ routeNumber: number; restaurant: string; confidence: number | null; matched: boolean }> = []

  for (const candidate of candidates) {
    const match = await findGooglePlaceMatch({
      name: candidate.name,
      address: candidate.address,
      latitude: candidate.latitude ?? undefined,
      longitude: candidate.longitude ?? undefined,
    }, apiKey)
    const place = match?.place
    if (!match || !place || match.requiresReview) {
      reviewRequired += 1
      decisions.push({ routeNumber: candidate.route_number, restaurant: candidate.name, confidence: match?.confidence ?? null, matched: false })
      continue
    }
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
    decisions.push({ routeNumber: candidate.route_number, restaurant: candidate.name, confidence: match.confidence, matched: true })
  }

  const lastRouteNumber = candidates.at(-1)?.route_number ?? after
  console.log(JSON.stringify({ attempted: candidates.length, matched, reviewRequired, after, lastRouteNumber, decisions }))
  return Response.json({ attempted: candidates.length, matched, reviewRequired, after, lastRouteNumber })
}

export const config = { path: '/api/enrich-google-places' }
