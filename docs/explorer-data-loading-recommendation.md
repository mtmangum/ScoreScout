# Explorer Data Loading Recommendation

> **Status: implemented in `1.1.0` (2026-08-20), with one deliberate deviation.** The map/detail split, the removal of the arbitrary row cap, and on-demand full-record fetching all shipped as described below. The list-pagination design in "Paginated result list" (server-side `page`/`pageSize`/`total`/`hasMore`, a stable tie-breaker sort) was **not** built — at this table size (~6,500 rows), the same complete lightweight summary used for the map also serves the list directly, sorted/filtered client-side, with no pagination API surface at all. Simpler, and every acceptance criterion below is still met; revisit real pagination only if a measured summary-listing payload size actually requires it, matching this doc's own "measure before adding complexity" reasoning for viewport loading. See `docs/current-state.md`'s "`GET /api/restaurants`" section for what actually shipped, including a Supabase `max-rows`-setting discovery this doc didn't anticipate — the client can't just raise `limit=` past 1,000; the fix pages through `Range` headers and required a stable `id` sort tiebreaker.

## Decision summary

Replace the explorer's arbitrary 1,000-restaurant response with two purpose-built data flows:

1. Load all matching map locations as lightweight marker records and continue clustering them in the browser with Supercluster.
2. Load the results list as server-filtered, server-sorted pages, fetching a restaurant's complete record only when its detail panel is opened.

At ScoreScout's current Austin-area scale of roughly 6,500 facilities, this offers complete map coverage without retaining thousands of inspection histories and community-rating records in browser memory. Viewport-based map loading should remain a later option if the dataset grows substantially.

The map should retain one consistent clustering model. The initial Austin overview should look approximately as it does today; as the user zooms in, the same Supercluster index should naturally split groups and expose progressively more individual restaurant pins. This recommendation does not introduce separate clustering modes or change clustering behavior based on how the data was loaded.

## Current problem

`GET /api/restaurants` currently returns at most 1,000 rows for an unscoped browse request, with no deterministic ordering. The frontend treats that response as the available browse dataset and performs score filtering and sorting locally.

As a result:

- The map does not represent every matching Austin location.
- Result counts describe the loaded subset rather than the total matching population.
- Highest score, lowest score, newest inspection, and name sorting apply only to the subset.
- Score-range filtering can omit valid matches outside the subset.
- The subset may change as the database and query plan change.

Simply removing the limit from the existing endpoint would correct completeness but would also send full restaurant records, inspection arrays, and optional rating data for thousands of facilities. That is unnecessary for map rendering and would increase transfer size, parsing work, and retained memory.

## Recommended architecture

### Lightweight map data

Add a map-oriented API response containing only the fields needed to create a marker, cluster it, select it, and construct its canonical route.

```ts
interface RestaurantMapPoint {
  id: string
  routeId: string
  cityCode: string
  name: string
  latitude: number
  longitude: number
  profileScore: number
}
```

The map response should:

- Return all locations matching the active search, profile-score range, and facility scope.
- Exclude inspection histories, community ratings, addresses, calculation details, and other detail-only fields.
- Use deterministic ordering so responses and cache behavior are stable.
- Keep the existing CDN cache strategy, with query parameters included in the cache key.
- Continue feeding the complete lightweight collection to client-side Supercluster.
- Use one fixed clustering configuration across zoom levels; rely on Supercluster's normal expansion behavior rather than application-defined cluster modes.
- Tune the existing radius and maximum cluster zoom against the complete production point set so the initial overview remains visually close to the current map while additional restaurants emerge naturally during zoom.

An initial implementation can use a mode on the existing endpoint:

```text
GET /api/restaurants?view=map&query=...&scoreMin=50&scoreMax=100&includeAll=false
```

A separate `/api/restaurant-map-points` endpoint is also reasonable if it produces cleaner server code. The important boundary is the response shape, not the URL.

### Paginated result list

The normal list response should be filtered and sorted by the server and return a small page of summary records.

```text
GET /api/restaurants?page=1&pageSize=50&sort=inspection-desc&query=...&scoreMin=50&scoreMax=100&includeAll=false
```

Suggested response metadata:

```json
{
  "restaurants": [],
  "page": 1,
  "pageSize": 50,
  "total": 6183,
  "hasMore": true
}
```

List summaries should contain only what each visible row needs, for example:

- Canonical identity and route fields
- Name and short address
- Coordinates if list-to-map selection needs them immediately
- Inspection History Profile score
- Latest official inspection score and date
- Favorite hydration fields, if required

All ordering must happen before pagination. The API should add a stable unique tie-breaker after the selected sort to prevent rows from moving between pages.

The UI can use conventional pagination or incremental loading. Incremental loading better preserves the current scroll-oriented experience, provided the browser retains only a bounded number of pages.

### On-demand restaurant details

Fetch the complete restaurant record when a user selects a list row, marker, or direct detail route.

```text
GET /api/restaurants/:id
```

The detail response can include:

- Full address
- Recent inspections
- Profile calculation and confidence fields
- Community rating
- Official-source links and other detail-only metadata

Canonical aliases and legacy routes must continue resolving through the existing reviewed-duplicate behavior. Exact-ID favorite hydration can remain separate from list pagination so saved restaurants do not disappear when they are outside the current page or filter.

## Shared filtering semantics

The map and list must use the same server-side filter definitions:

- Search query
- Minimum and maximum profile score
- Facility category scope
- Favorites-only mode, where applicable

Sorting affects only the list. The map receives the complete matching lightweight set because spatial position, rather than list order, determines its presentation.

The frontend should display the server-provided `total`, not `restaurants.length`, as the matching result count. Where useful, it can distinguish the two explicitly, such as `6,183 matches · 50 loaded`.

## Memory and performance controls

- Keep marker objects deliberately small and avoid embedding full `Restaurant` objects in Supercluster properties.
- Retain only the current list page or a bounded window of incrementally loaded pages.
- Cache only a bounded number of full detail records.
- Abort superseded map, list, and detail requests when filters or selection change.
- Debounce text search and score-range network updates.
- Avoid copying full records into separate map, list, selected, and favorites collections.
- Compress JSON responses at the CDN/function layer and preserve short shared-cache lifetimes.
- Measure the serialized and gzip sizes of the production map response before release.
- Profile a representative lower-memory mobile device with the full production marker set.

At approximately 6,500 points, a compact point collection should be practical for browser-side clustering. The current heavyweight restaurant shape—not the coordinate count itself—is the main avoidable memory and transfer cost.

Loading more source points will change cluster membership even when the clustering configuration is unchanged. Before release, the existing radius and maximum cluster zoom should therefore be tested against the complete production dataset. The target is not to preserve identical cluster membership; it is to preserve the current overview's approximate visual density and progressive disclosure. There should be no breakpoint, alternate mode, or abrupt clustering-policy change while zooming.

## Why not viewport loading yet?

Viewport-based requests can reduce the number of map points held at once, but they introduce additional complexity:

- Requests on every meaningful pan or zoom
- Debouncing and cancellation requirements
- Loading indicators while moving around the map
- Cluster discontinuities near viewport boundaries
- Expanded bounding boxes or server-side spatial clustering
- More difficult synchronization between the global result count, list, search, and map
- Re-fetching locations as users revisit areas

Those costs are justified for much larger or multi-region datasets. For the current Austin dataset, a lightweight complete map index is simpler and should remain comfortably usable. Viewport loading can be revisited if measured payload, indexing time, or mobile memory exceeds an agreed budget.

## Suggested rollout

### Phase 1: establish API contracts

- Add shared parsing and validation for search, profile range, facility scope, sort, page, and page size.
- Add the lightweight map response.
- Add paginated, deterministic list responses with a total count.
- Preserve exact-ID and canonical-route lookups.
- Add API tests for filtering, sorting, pagination boundaries, and aliases.

### Phase 2: update frontend state

- Split the current restaurant state into map points, list summaries, selected detail, and favorites.
- Drive the visible result count from the API total.
- Move score filtering and sorting to API parameters.
- Add pagination or bounded incremental loading.
- Keep selected deep-linked facilities visible without broadening the whole query.

### Phase 3: verify and tune

- Compare map and list totals for the same filters.
- Confirm searches find facilities beyond the former 1,000-row subset.
- Test rapid query and score-range changes for request races.
- Measure response sizes, parsing time, Supercluster indexing time, and memory on desktop and mobile.
- Tune one clustering configuration against the complete point set, checking that the initial Austin view remains familiar and that individual pins are exposed progressively as the user zooms.
- Verify direct routes, favorites, canonical aliases, dark mode, and mobile Map/List switching.

## Acceptance criteria

- Every matching geocoded facility can appear on the map; there is no arbitrary browse subset.
- The displayed match count comes from the complete server-side query.
- List sorting and filtering operate over all matching facilities before pagination.
- Initial and retained browser memory do not include full inspection histories for every map point.
- Selecting a location reliably loads its complete detail record.
- Favorites and direct/canonical detail routes continue to work outside the current list page.
- The production map response and Supercluster index meet measured mobile performance budgets.
- The map uses one consistent clustering model: the initial view has approximately the current visual density, and zooming progressively reveals more individual restaurant markers.
- The existing fallback language continues to distinguish live data from sample data.

## Future trigger for viewport loading

Reconsider bounding-box loading or server-side clustering when measurements—not facility count alone—show that the lightweight full-map approach no longer meets the product's budgets. Useful triggers include sustained regressions in compressed response size, map-index construction time, interaction latency, or memory on supported mobile devices.
