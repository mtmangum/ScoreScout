# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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

### Changed

- Removed the map's satellite/hybrid basemap toggle — back to a single default street map.
- Closing a restaurant's detail panel no longer recenters the map; it stays where you left it.
- Selecting a restaurant buried inside a map cluster now eases the camera in smoothly instead of snapping straight to the target zoom.
- Removed the "Save restaurant" button from the detail panel — the list row's star already covers favoriting.
- Tightened the sidebar introduction copy, then removed it to maximize result-list space.
- Shrunk map pins and cluster bubbles so they take up less of the map.

### Fixed

- Restaurant list clicks and deep links could open the wrong restaurant: the Supabase view derived each restaurant's route id by zero-padding to 2 digits, which silently truncates (rather than just pads) any 3+ digit id — collapsing hundreds of restaurants sharing a leading two-digit prefix onto the same id once the dataset grew past ~100 restaurants. Fixed at the data layer; the URL-matching logic was also extracted into a standalone, unit-tested function (`resolveSelectedRestaurant`).
- Deep-link restaurant matching could resolve to the wrong restaurant when one facility ID was a suffix of another, and was case-sensitive against facility IDs embedded in a URL slug.
- A restaurant opened via deep link outside the current score filter now appears in the sidebar list and results count, not just the map.
- A search query itself could still silently truncate results at very high match counts, since search re-used the same 1,000-row limit as the unscoped browse query; search now gets its own, much higher cap.
- The dark mode theme toggle's sun/moon icon was slightly off-center in its circle button.
- The brand logo (a transparent PNG with dark artwork) visually disappeared against the dark mode background; given a light backdrop chip in dark mode.
