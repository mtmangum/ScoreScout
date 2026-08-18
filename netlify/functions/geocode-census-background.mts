import { supabaseRequest } from './_shared/supabase.mts'

interface GeocodeCandidate {
  id: string
  route_number: number
  name: string
  address: string
  zip_code: string | null
}

interface CensusMatch {
  coordinates: { x: number; y: number }
  matchedAddress: string
}

interface CensusResponse {
  result: { addressMatches: CensusMatch[] }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function geocode(address: string) {
  const query = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' })
  const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${query}`)
  if (!response.ok) throw new Error(`Census geocoder request failed (${response.status})`)
  const payload = await response.json() as CensusResponse
  return payload.result.addressMatches[0] ?? null
}

export default async (request: Request) => {
  const secret = process.env.IMPORT_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestUrl = new URL(request.url)
  const requestedLimit = Number(requestUrl.searchParams.get('limit') ?? 100)
  const limit = Math.max(1, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 100))
  const requestedAfter = Number(requestUrl.searchParams.get('after') ?? 0)
  const after = Math.max(0, Number.isFinite(requestedAfter) ? requestedAfter : 0)

  const response = await supabaseRequest(`restaurants_needing_geocode?route_number=gt.${after}&order=route_number.asc&limit=${limit}`)
  const candidates = await response.json() as GeocodeCandidate[]
  let matched = 0
  let noMatch = 0
  const decisions: Array<{ routeNumber: number; restaurant: string; matched: boolean }> = []

  for (const candidate of candidates) {
    const fullAddress = `${candidate.address}, Austin, TX${candidate.zip_code ? ` ${candidate.zip_code}` : ''}`
    let match: CensusMatch | null = null
    try {
      match = await geocode(fullAddress)
    } catch (error) {
      console.error(`Census geocode failed for ${candidate.name}: ${error instanceof Error ? error.message : error}`)
    }
    if (!match) {
      noMatch += 1
      decisions.push({ routeNumber: candidate.route_number, restaurant: candidate.name, matched: false })
      await sleep(120)
      continue
    }
    await supabaseRequest(`restaurants?id=eq.${candidate.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ latitude: match.coordinates.y, longitude: match.coordinates.x }),
    })
    matched += 1
    decisions.push({ routeNumber: candidate.route_number, restaurant: candidate.name, matched: true })
    await sleep(120)
  }

  const lastRouteNumber = candidates.at(-1)?.route_number ?? after
  console.log(JSON.stringify({ attempted: candidates.length, matched, noMatch, after, lastRouteNumber, decisions }))
  return Response.json({ attempted: candidates.length, matched, noMatch, after, lastRouteNumber })
}

export const config = { path: '/api/geocode-census' }
