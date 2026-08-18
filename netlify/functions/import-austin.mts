import { calculateProfile } from '../../src/features/restaurants/score.ts'
import { groupCanonicalInspectionScores } from '../../scripts/lib/canonicalRestaurants.ts'
import { supabaseRequest } from './_shared/supabase.mts'

const sourceUrl = 'https://data.austintexas.gov/resource/ecmv-9xxi.json'

interface AustinRow {
  restaurant_name: string
  zip_code?: string
  inspection_date: string
  score: string
  address: string
  facility_id: string
  process_description: string
}

interface StoredRestaurant { id: string; facility_id: string }
interface StoredDuplicateRule { duplicate_facility_id: string; canonical_facility_id: string }

async function fetchAustinRows() {
  const allRows: AustinRow[] = []
  const pageSize = 5000
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ '$limit': String(pageSize), '$offset': String(offset), '$order': 'inspection_date DESC' })
    const response = await fetch(`${sourceUrl}?${query}`)
    if (!response.ok) throw new Error(`Austin data request failed (${response.status})`)
    const page = await response.json() as AustinRow[]
    allRows.push(...page)
    if (page.length < pageSize) break
  }
  return allRows
}

const chunks = <T,>(values: T[], size = 500) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size))

export default async () => {
  const startedAt = new Date().toISOString()
  try {
    const rows = (await fetchAustinRows()).filter((row) => row.facility_id && row.restaurant_name && Number(row.score) >= 0 && Number(row.score) <= 100)
    const latestByFacility = new Map<string, AustinRow>()
    for (const row of rows) if (!latestByFacility.has(row.facility_id)) latestByFacility.set(row.facility_id, row)
    console.log(`Austin import fetched ${rows.length} inspections for ${latestByFacility.size} restaurants`)

    const storedRestaurants: StoredRestaurant[] = []
    for (const batch of chunks([...latestByFacility.values()])) {
      const response = await supabaseRequest('restaurants?on_conflict=facility_id&select=id,facility_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(batch.map((row) => ({
          facility_id: row.facility_id, city_code: 'AUS', name: row.restaurant_name,
          address: row.address, zip_code: row.zip_code ?? null, source_updated_at: startedAt,
        }))),
      })
      storedRestaurants.push(...await response.json() as StoredRestaurant[])
    }
    const restaurantIds = new Map(storedRestaurants.map((restaurant) => [restaurant.facility_id, restaurant.id]))

    for (const batch of chunks(rows)) {
      await supabaseRequest('inspections?on_conflict=source_row_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(batch.map((row) => ({
          restaurant_id: restaurantIds.get(row.facility_id),
          source_row_id: [row.facility_id, row.inspection_date, row.score, row.process_description].join(':'),
          inspection_date: row.inspection_date.slice(0, 10), official_score: Number(row.score),
          process_description: row.process_description, source_payload: row,
        }))),
      })
    }

    const duplicateRulesResponse = await supabaseRequest('restaurant_duplicate_rules?select=duplicate_facility_id,canonical_facility_id')
    const duplicateRules = await duplicateRulesResponse.json() as StoredDuplicateRule[]
    const canonicalScores = groupCanonicalInspectionScores(
      rows.map((row) => ({
        facilityId: row.facility_id,
        inspectionDate: row.inspection_date.slice(0, 10),
        score: Number(row.score),
      })),
      duplicateRules.map((rule) => ({
        duplicateFacilityId: rule.duplicate_facility_id,
        canonicalFacilityId: rule.canonical_facility_id,
      })),
    )
    const profiles = [...canonicalScores].map(([facilityId, scores]) => {
      const profile = calculateProfile(scores)
      return {
        restaurant_id: restaurantIds.get(facilityId), profile_score: profile.score, confidence: profile.confidence,
        weighted_history_score: profile.weightedHistoryScore, consistency_adjustment: profile.consistencyAdjustment,
        trend_adjustment: profile.trendAdjustment, inspection_count: scores.length,
        calculated_at: startedAt, algorithm_version: 'v1',
      }
    })
    for (const batch of chunks(profiles)) {
      await supabaseRequest('inspection_profiles?on_conflict=restaurant_id', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch),
      })
    }
    await supabaseRequest('data_sources', {
      method: 'POST', body: JSON.stringify({ source_name: 'City of Austin Food Establishment Inspection Scores', source_url: sourceUrl, retrieved_at: startedAt, row_count: rows.length, status: 'success' }),
    })
    console.log(`Austin import completed: ${rows.length} inspections, ${latestByFacility.size} restaurants`)
    return Response.json({ importedRows: rows.length, restaurants: latestByFacility.size, calculatedProfiles: profiles.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed'
    console.error(`Austin import failed: ${message}`)
    return Response.json({ error: message }, { status: 500 })
  }
}

export const config = { schedule: '0 7 * * *' }
