# ScoreScout — Implementation Handoff

## Purpose

Build a map-first Austin restaurant-inspection explorer. The product presents the **latest official Austin Public Health inspection score** alongside an explainable, derived **Inspection History Profile**.

Do not frame the product as deciding whether a restaurant is safe or clean. It summarizes available inspection history; routine inspections are snapshots.

## Recommended stack

| Area | Choice |
| --- | --- |
| Web app | React + Vite + TypeScript |
| Styling | CSS modules, Tailwind, or a small token-based CSS system |
| Map | Leaflet + OpenStreetMap initially |
| Data store | Supabase PostgreSQL + PostGIS |
| Data import / scoring | Scheduled TypeScript or Python job |
| API | Supabase queries or a small server API layer |
| Deployment | Vercel for the web app; Supabase for data/services |

Use Next.js instead of Vite only if server-rendered, search-indexed restaurant pages, authentication, or an integrated server layer become immediate priorities.

## Data source

Primary source: [City of Austin Food Establishment Inspection Scores](https://data.austintexas.gov/Health-and-Community-Services/Food-Establishment-Inspection-Scores/ecmv-9xxi).

Important source fields:

- `facility_id` — canonical inspection-history identity; never use name alone for grouping
- `restaurant_name`
- `address`, `zip_code`
- `inspection_date`
- `score` — official inspection score
- `process_description`

The public dataset contains individual inspection scores. Do not claim individual violations, critical findings, or food-safety conclusions unless an official report-level source has been separately integrated and retained.

## Product language

Use these labels consistently:

- **Latest official inspection:** `96 / 100`, plus inspection date
- **Inspection History Profile:** `92 / 100`
- **Confidence:** `Limited`, `Moderate`, `Good`, or `High`

Avoid calling the derived number a “Health Score” in the first release. It can be reconsidered after validation and legal/product review.

## Scoring contract (v1)

The profile is derived only from the most recent available official scores for the facility.

1. Take up to four most-recent inspections.
2. Apply recency weights of 50%, 30%, 15%, and 5%. Renormalize the weights when fewer than four inspections exist.
3. Apply a small, capped consistency adjustment based on score standard deviation.
4. Apply a small, capped recent-trend adjustment based on change over the available series.
5. Clamp the final result to 0–100 and round to a whole number.

Suggested reference implementation:

```ts
const weights = [0.5, 0.3, 0.15, 0.05];

export function calculateProfile(scoresNewestFirst: number[]) {
  const values = scoresNewestFirst.slice(0, 4);
  const activeWeights = weights.slice(0, values.length);
  const totalWeight = activeWeights.reduce((sum, value) => sum + value, 0);

  const weightedAverage = values.reduce(
    (sum, score, index) => sum + score * activeWeights[index],
    0,
  ) / totalWeight;

  const mean = values.reduce((sum, score) => sum + score, 0) / values.length;
  const standardDeviation = Math.sqrt(
    values.reduce((sum, score) => sum + (score - mean) ** 2, 0) / values.length,
  );
  const consistencyAdjustment = -Math.min(5, standardDeviation * 0.25);

  const rawTrend = values.length > 1
    ? (values[0] - values.at(-1)!) / (values.length - 1)
    : 0;
  const trendAdjustment = Math.max(-3, Math.min(3, rawTrend * 0.65));

  return Math.round(Math.max(0, Math.min(100,
    weightedAverage + consistencyAdjustment + trendAdjustment,
  )));
}
```

Store every component used in a calculation. That makes the number explainable and lets the algorithm evolve without losing auditability.

Confidence rules:

| Available inspection history | Confidence |
| --- | --- |
| 1 inspection | Limited |
| 2 inspections | Moderate |
| 3–4 inspections | Good |
| 5+ inspections | High |

Add an inspection-age downgrade later (for example, if the latest record is old).

## Database model

```text
restaurants
  id (UUID PK)
  facility_id (unique)
  name
  address
  zip_code
  latitude
  longitude
  location (PostGIS geography point)
  active
  source_updated_at

inspections
  id (UUID PK)
  restaurant_id (FK)
  inspection_date
  official_score
  process_description
  source_row_id / source_payload
  imported_at

inspection_profiles
  restaurant_id (FK)
  profile_score
  confidence
  weighted_history_score
  consistency_adjustment
  trend_adjustment
  inspection_count
  calculated_at
  algorithm_version

profile_calculation_events
  profile_id (FK)
  input_inspection_ids
  input_scores
  calculation_payload

data_sources
  id
  source_name
  source_url
  retrieved_at
  checksum / version
```

Use `facility_id` as the data identity. Restaurant-name and address matching is only a temporary enrichment fallback.

## Suggested project structure

```text
src/
  api/
    restaurants.ts
  components/
    MapView.tsx
    RestaurantList.tsx
    RestaurantDetail.tsx
    ScoreBadge.tsx
    InspectionHistory.tsx
    ScoreExplanation.tsx
    Filters.tsx
  features/restaurants/
    types.ts
    score.ts
    selectors.ts
  hooks/
    useRestaurants.ts
    useMapSelection.ts
  pages/
    ExplorePage.tsx
  styles/
    tokens.css
  App.tsx

scripts/
  import-austin-inspections.ts
  calculate-profiles.ts
```

## First UI release

### Explore map

- Current map viewport drives the restaurant query.
- Markers use the derived inspection-profile color: green 90–100, amber 70–89, red below 70.
- Filter by minimum profile, distance, and optional cuisine after enrichment data exists.
- Search by restaurant name and address.
- Marker and list selections stay synchronized.

### Restaurant detail panel/page

- Restaurant name and address
- Derived Inspection History Profile
- Latest official inspection score and date
- Confidence label with inspection-count explanation
- Four most-recent official scores as a chart/list
- A short explanation generated from deterministic score components, not AI
- Link to the source dataset and, when available, the official inspection report

## Import job

Run daily or weekly.

1. Download/query the Austin dataset.
2. Validate dates, score ranges, and required facility IDs.
3. Upsert restaurants by `facility_id`.
4. Insert new inspections idempotently.
5. Recalculate profiles for changed facilities.
6. Record source timestamp and calculation version.
7. Alert/log rows that cannot be matched or geocoded.

Geocode facility addresses once and retain the source, precision, and last-verified time. Do not geocode on every user request.

## Build sequence

1. Create the Vite React TypeScript project and establish shared types.
2. Build the map, list, selection state, and detail panel against local fixture data.
3. Add the scoring unit tests before connecting it to live data.
4. Create Supabase tables, indexes, and PostGIS geographic queries.
5. Implement the importer and profile recalculation job.
6. Connect the UI to restaurant/profile/inspection endpoints.
7. Verify 50–100 facilities manually against the source dataset before public release.

## Definition of done for MVP

- A user can search Austin restaurants, filter a map, and open a restaurant detail view.
- Every derived profile exposes its official latest score, history, confidence, and calculation explanation.
- Each displayed restaurant location has documented provenance.
- The import is repeatable and idempotent.
- No UI text implies that the product independently determines food safety.
