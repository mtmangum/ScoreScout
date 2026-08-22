import { supabaseRequest } from '../netlify/functions/_shared/supabase.mts'
import { normalize } from './lib/googlePlaces.ts'

interface Restaurant {
  id: string
  facility_id: string
  route_number: number
  name: string
  address: string
  active: boolean
}

interface DuplicateRule {
  duplicate_facility_id: string
  canonical_facility_id: string
}

interface Inspection {
  restaurant_id: string
  inspection_date: string
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const response = await supabaseRequest(path, { headers: { Range: `${offset}-${offset + pageSize - 1}` } })
    const page = await response.json() as T[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

const restaurants = await fetchAll<Restaurant>(
  'restaurants?select=id,facility_id,route_number,name,address,active&order=route_number.asc',
)
const rules = await fetchAll<DuplicateRule>(
  'restaurant_duplicate_rules?select=duplicate_facility_id,canonical_facility_id',
)
const alreadyRuled = new Set(rules.map((rule) => rule.duplicate_facility_id))

const groups = new Map<string, Restaurant[]>()
for (const restaurant of restaurants) {
  if (!restaurant.active) continue
  const key = `${normalize(restaurant.name)}|${normalize(restaurant.address)}`
  groups.set(key, [...(groups.get(key) ?? []), restaurant])
}

const candidates = [...groups.values()]
  .filter((group) => group.length > 1)
  .sort((a, b) => a[0].name.localeCompare(b[0].name))

const candidateIds = candidates.flat().map((r) => r.id)
const inspections = await fetchAll<Inspection>(
  `inspections?select=restaurant_id,inspection_date&restaurant_id=in.(${candidateIds.join(',')})&order=inspection_date.asc`,
)
const historyByRestaurant = new Map<string, string[]>()
for (const inspection of inspections) {
  historyByRestaurant.set(inspection.restaurant_id, [...(historyByRestaurant.get(inspection.restaurant_id) ?? []), inspection.inspection_date])
}

for (const group of candidates) {
  console.log(`${group[0].name} — ${group[0].address}`)
  const withHistory = group.map((restaurant) => {
    const dates = historyByRestaurant.get(restaurant.id) ?? []
    return { restaurant, dates, first: dates[0], last: dates[dates.length - 1] }
  })
  const [canonical, ...duplicates] = [...withHistory].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))
  for (const entry of withHistory) {
    const tag = alreadyRuled.has(entry.restaurant.facility_id) ? ' [already ruled]' : ''
    const role = entry.restaurant.facility_id === canonical.restaurant.facility_id ? 'canonical' : 'duplicate'
    console.log(`  route ${entry.restaurant.route_number}  facility_id ${entry.restaurant.facility_id}  ${entry.dates.length} inspections (${entry.first ?? '—'} to ${entry.last ?? '—'})  → ${role}${tag}`)
  }
  const overlaps = duplicates.some((dup) => dup.first && canonical.first && dup.last! >= canonical.first! && canonical.last! >= dup.first!)
  if (overlaps) console.log('  ⚠ inspection history overlaps in time — verify before merging')
}

console.log(`\n${restaurants.length} active restaurants scanned`)
console.log(`${candidates.length} name+address groups with more than one facility_id`)

if (process.argv.includes('--sql')) {
  console.log('\n-- Suggested restaurant_duplicate_rules rows (non-overlapping groups only):')
  for (const group of candidates) {
    const withHistory = group.map((restaurant) => {
      const dates = historyByRestaurant.get(restaurant.id) ?? []
      return { restaurant, dates, first: dates[0], last: dates[dates.length - 1] }
    })
    const [canonical, ...duplicates] = [...withHistory].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))
    const overlaps = duplicates.some((dup) => dup.first && canonical.first && dup.last! >= canonical.first! && canonical.last! >= dup.first!)
    if (overlaps) continue
    for (const dup of duplicates) {
      const reason = `Same establishment: normalized name and address match. Facility ${dup.restaurant.facility_id} was last inspected ${dup.last ?? 'never'}; facility ${canonical.restaurant.facility_id} has been inspected since ${canonical.first ?? 'unknown'} with no date overlap.`
      console.log(`  ('${dup.restaurant.facility_id}', '${canonical.restaurant.facility_id}', '${reason.replace(/'/g, "''")}', 'name-address-scan'),`)
    }
  }
}
