# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- The sidebar list now only shows restaurants within the map's current viewport, staying in sync as the map is panned or zoomed, instead of always listing the full (up to ~4871-row) matching population regardless of what's actually visible. A search bypasses this scoping entirely so a match off-screen never silently disappears, and favorites/the open detail panel's restaurant are likewise always kept. The results count reads "N places in view" when the list is viewport-scoped.
- Added a "Reset" button next to the map's locate control that flies back to the default Austin view; it only appears once the map has actually been panned or zoomed away from that default.
- Added a slim top-of-page loading bar, driven by the same loading state already used for the "Loading Austin data…" label, so an in-progress data fetch (initial load, or after clearing a search) reads as "still working" instead of looking hung.
- Added compliance-tier context (e.g. "Excellent Compliance", "Marginal Compliance") to the restaurant detail panel's score hero, based on Austin's official 90/80/70 inspection score bands. The tier label sits under the score; clicking it expands a one-line explanation of what that tier means.

### Fixed

- Stripped leading permit-record prefixes (`OOB - `, `PF - `, `BC - `) from facility names in the list, favorite button label, and detail modal. These come straight from Austin's source feed and misleadingly read as status codes (e.g. "OOB" as "out of business") even for open, trading restaurants. Matching, search, sorting, and URL slugs still use the raw name.
- Fixed noticeable input lag when typing in the search box: the restaurant list and map weren't memoized, so every keystroke re-rendered thousands of list rows and rebuilt the map's marker clustering even though the underlying data hadn't changed yet (the search query is debounced before it triggers a real fetch).
- Fixed the viewport-scoped list going permanently empty on mobile after switching from the Map tab to the List tab (and, more generally, on any device where the map container is measured before its layout has settled). Hiding the map via `display:none` collapses Leaflet's reported bounds to a degenerate rectangle; that bad reading is now dropped at the source instead of overwriting the last known-good viewport, so the list keeps showing whatever it last correctly had in view.
- Fixed the detail panel's "How this was calculated" explanation text rendering nearly illegible in dark mode: it used a hardcoded light-mode gray instead of a theme-aware color.

## [1.1.0] - 2026-08-20

### Added

- Added reviewed duplicate-facility rules that retain Austin source identities while presenting linked records as one canonical establishment.
- Seeded the former and current Titaya's Thai Cuisine facility IDs as the first reviewed canonical group.
- Added canonical-aware inspection profile calculation, community-rating reuse, alias search, and legacy deep-link resolution.
- Added conservative school/healthcare classification with confidence metadata, protected manual overrides, and import-time refresh.
- Added a secondary “Show all inspected facilities” checkbox inside the existing “About scores & data” disclosure.

### Changed

- Default explorer requests now omit high-confidence school and healthcare facilities while preserving them through the opt-in filter and direct links.
- Replaced the arbitrary 1,000-row browse cap with a complete, lightweight summary listing (paginated server-side via Supabase's Range headers past its 1,000-row max-rows setting) shared by the map and results list, plus a separate on-demand fetch for a restaurant's full record (inspection history, profile breakdown, community rating) once its card is opened. The map now shows every matching restaurant instead of an arbitrary subset, and list sorting/filtering operate over the full matching population.
- Added a stable `id` tiebreaker to the browse query's sort order — needed once results were paginated across multiple requests, since rows tied on name alone aren't guaranteed the same order across separate query executions and could otherwise be duplicated or skipped at a page boundary. Added a regression test (`netlify/functions/_tests/restaurants.test.ts`) that simulates a production-scale, heavily-tied dataset to catch this class of bug without a live database connection.

### Fixed

- Fixed direct restaurant links failing to open their detail card: the API param used to fetch a specific restaurant was silently dropped on older WebKit browsers (iOS Safari pre-17, Chrome on iOS), and — independent of that — the browse query's unordered 1,000-row cap could truncate the result before the requested restaurant was reached even when the param arrived correctly. The row-cap side is now fixed structurally rather than worked around, by the summary-listing change above.
- Kept saved restaurants permanently pinned until explicitly unchecked, independent of search, score filters, facility categories, or the API's browse page; existing ID-only favorites migrate to locally cached, API-refreshed snapshots, and (as of this release) favorites saved by an older build in the previous full-record format migrate transparently to the new lightweight format too.
- Optimized canonical duplicate membership and alias search queries to avoid production statement timeouts, and made the duplicate-rule trigger safely idempotent.
- Improved amber contrast by separating amber backgrounds from theme-aware amber text colors.
- Added consistent keyboard focus indicators, including a visible focus treatment around search.
- Made the restaurant detail panel an accessible non-modal dialog with initial focus, Escape-to-close behavior, and focus restoration while keeping page controls available.

## [1.0.0] - 2026-08-18

### Added

- Initial Vite + React + TypeScript project scaffold.
- Map explore page (`MapView`, `RestaurantList`, `RestaurantDetail`, `ScoreBadge`).
- Inspection History Profile scoring logic (`features/restaurants/score.ts`) with unit tests.
- Implementation handoff document describing product scope, scoring contract, and data model.
- README, changelog, and an agent handoff doc (`docs/current-state.md`) covering current product/infra state, known issues, and operational guardrails.
- Shareable restaurant links via `react-router-dom`, with support for `/:cityCode/:restaurantKey`, `/r/:restaurantKey`, and `/restaurants/:facilityId` URL formats.
- Collapsible "About scores & data" disclosure in the sidebar footer.
- Live data: restaurants, inspections, and community ratings served from Supabase via `/api/restaurants`, backed by a daily Austin inspection import job (`netlify/functions/import-austin.mts`). The app falls back to local sample data if the live API is unavailable.
- Free, keyless Census Bureau geocoding pipeline for restaurant coordinates, decoupled from Google Places — Google Places now only supplies optional community ratings and no longer gates map/list coverage.
- Restaurant list sorting: highest/lowest score, newest inspection, name A–Z.
- Save/favorite restaurants (star toggle on each row and, previously, in the detail panel), persisted in the browser. Favorites stay pinned to the top of the list while scrolling, with a saved-only view.
- Score-aware marker clustering on the map (`supercluster`): nearby restaurants group into bubbles colored by the worst score in the group, splitting into sub-clusters and individual pins as you zoom in or click a cluster.
- Server-side search: the search box now queries the full restaurant dataset via the API's `q` parameter instead of only whatever single page of results was already loaded client-side.
- Clear (×) button in the search box, shown once you've typed something.
- Light/dark theme toggle (sidebar header), following system preference by default and persisting your choice.
- Mobile: a compact branded header plus a Map/List toggle switches between full-height map and full-height list views instead of the old fixed 53/47 split, with a persistent search field pinned above both.
- An accessible "locate me" button on the map centers and zooms to your current location on desktop and mobile, with locating and unavailable states.

### Changed

- Removed the map's satellite/hybrid basemap toggle — back to a single default street map.
- Closing a restaurant's detail panel no longer recenters the map; it stays where you left it.
- Selecting a restaurant buried inside a map cluster now eases the camera in smoothly instead of snapping straight to the target zoom.
- Removed the "Save restaurant" button from the detail panel — the list row's star already covers favoriting.
- Tightened the sidebar introduction copy, then removed it to maximize result-list space.
- Shrunk map pins and cluster bubbles so they take up less of the map.
- Restaurant list now defaults to newest inspection first (was highest score first).
- Retuned map clustering (radius and default zoom, both verified against real production data) so most of the default view reads as individual, readable score pins rather than cluster bubbles, while still showing a real chunk of the city.
- Replaced the map location glyph with a clearer crosshair icon and polished hover, focus, loading, and error feedback.

### Fixed

- Restaurant list clicks and deep links could open the wrong restaurant: the Supabase view derived each restaurant's route id by zero-padding to 2 digits, which silently truncates (rather than just pads) any 3+ digit id — collapsing hundreds of restaurants sharing a leading two-digit prefix onto the same id once the dataset grew past ~100 restaurants. Fixed at the data layer; the URL-matching logic was also extracted into a standalone, unit-tested function (`resolveSelectedRestaurant`).
- Deep-link restaurant matching could resolve to the wrong restaurant when one facility ID was a suffix of another, and was case-sensitive against facility IDs embedded in a URL slug.
- A restaurant opened via deep link outside the current score filter now appears in the sidebar list and results count, not just the map.
- A search query itself could still silently truncate results at very high match counts, since search re-used the same 1,000-row limit as the unscoped browse query; search now gets its own, much higher cap.
- Map tiles could partially load: Leaflet never noticed the map container resizing (sidebar reflow, fonts loading, breakpoint changes) and kept rendering against a stale viewport size. Now watched with a `ResizeObserver` that calls `invalidateSize()`.
- The dark mode theme toggle's sun/moon icon was slightly off-center in its circle button.
- The brand logo (a transparent PNG with dark artwork) visually disappeared against the dark mode background; given a light backdrop chip in dark mode.
- The favicon had the same invisible-in-dark-tab-bar problem as the logo, plus `/favicon.ico` was silently returning the app's HTML instead of an icon (caught by the SPA rewrite, since no file actually existed at that path). Regenerated `favicon.ico`/`favicon.png`/`apple-touch-icon.png` with a solid backdrop so they're visible in any browser theme.
