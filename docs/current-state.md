# ScoreScout — Current State and Agent Handoff

Last updated: 2026-08-17 (America/Chicago), Claude session

This document is the current operational handoff for ScoreScout. Read it before changing the product, data pipeline, Supabase schema, or Netlify configuration. Update it whenever behavior, infrastructure, or known constraints materially change.

## Product summary

ScoreScout is a map-first explorer for Austin-area food-establishment inspections. It combines:

- The latest official Austin Public Health inspection score.
- A derived, explainable Inspection History Profile based on recent official scores.
- Google Places community ratings when a high-confidence match exists.
- Search, score filtering, sorting, shareable detail routes, and browser-local favorites.

Do not describe the profile as a food-safety verdict or independently claim that a restaurant is safe, clean, unsafe, or dirty. Inspections are point-in-time observations.

## Production services

- Website: <https://www.scorescout.org>
- Netlify site name: `scorescout`
- Netlify site ID: `ef9c25ab-7069-4d35-8e85-7333cf418a3f`
- Supabase project: `scorescout-production`
- Supabase project ref: `luvttiuwntsvdlkpolup`
- Primary branch: `main`
- Repository deployment: pushing `main` triggers the production Netlify deploy.

Netlify CLI and Supabase CLI are installed, authenticated, and linked to this workspace. Prefer their CLIs over their web dashboards when the CLI supports the task.

Never place secret values in source control, Markdown, chat, screenshots, commands that echo them, or logs.

## Repository state at this handoff

- `main` and `origin/main` point to commit `ca3a93c` (`Fix logo still disappearing in dark mode`).
- The Census geocoding backfill (see "Why production currently shows only a small subset" above) has finished; check current match counts before assuming the numbers there are still current.
- No known uncommitted work is pending as of this handoff.
- All three migrations (`202608170001_initial_schema.sql`, `202608172200_geocoding_views.sql`, `202608180001_fix_route_id_truncation.sql`) **have been applied** directly to `scorescout-production` via `supabase db query --linked -f <file>` (not via `supabase db push` — the CLI's migration ledger does not track any of them as applied since the initial schema was originally run through the SQL editor; `supabase migration list` shows all as `remote: ""` even though the objects exist. Repairing the ledger requires `supabase migration repair`, which the auto-mode classifier blocks as a risky action — ask the user to run it, or keep applying new migrations directly with `db query -f` as this session did).
- A one-off Census geocoding backfill script (not committed — it duplicates `geocode-census-background.mts`'s logic but runs synchronously from the agent's shell using the production `SUPABASE_URL`/`SUPABASE_SECRET_KEY` pulled via `netlify env:get`, since Netlify's `-background` functions return `202` with an empty body immediately, making progress untrackable from the HTTP response alone) was started against the ~6,494-restaurant backlog. Check whether it has finished; if still running, do not start a second copy — it would double up on Census requests and race PATCH writes to the same rows.

Before editing, always run:

```bash
git status --short --branch
git diff -- <files you plan to touch>
```

Do not reset, checkout, overwrite, or otherwise discard unrelated working-tree changes.

## Current frontend functionality

### Explorer layout

- Desktop uses a fixed left sidebar and a full-height Leaflet map.
- The sidebar flows directly from the ScoreScout brand header into search, score filtering, results, and the data disclosure footer.
- The earlier introductory marketing block was removed to maximize result-list space.
- Mobile uses the map in the upper portion and the sidebar/results below it. The full desktop brand header is currently hidden below 800 px.

### Search and filtering

- Search is server-side: `useRestaurants(searchQuery)` debounces (300ms) and re-fetches `/api/restaurants?q=<query>`, which searches the full table rather than the capped 1,000-row unordered snapshot the app otherwise loads. Fixes a real bug: a restaurant outside whatever arbitrary 1,000 rows the no-search fetch happened to return was invisible to search even though it matched, once the dataset grew past the cap (e.g. Titaya's Thai Cuisine). Score/favorites filtering still happens client-side on top of whatever `restaurants` the query returned.
- `restaurants.mts` uses a different `limit` depending on whether `q` is set: `1000` for the unscoped browse/map query (unchanged, still no `order`), `5000` for a search query (comfortably above the ~6,500-restaurant table so a name/address search can't itself silently truncate), plus `order=name.asc` for determinism. Don't let a future edit collapse these back to one shared limit.
- The search box has a clear (×) button, shown only when there's text in it.
- The dual range control filters Inspection History Profile scores from 50 through 100.
- Slider handles use a neutral dark brand color; the active track remains score-colored.
- A selected deep-linked restaurant is kept visible even when outside the active filter.

### Sorting

The left list supports:

- Newest inspection (default)
- Highest score
- Lowest score
- Name A–Z

Alphabetical name order breaks score/date ties.

### Favorites

- A star is available on every list row (the detail panel's own save button was removed as redundant).
- Favorite IDs persist in browser `localStorage` under `scorescout-favorite-restaurants`.
- Favorites do not require an account and do not sync between browsers/devices.
- In the normal results view, favorites appear in a fixed saved section that does not move when the regular-result list scrolls.
- The fixed section is height-capped and becomes independently scrollable when many items are saved.
- The star counter can switch to a saved-only view; that view scrolls normally.
- Saved and unsaved groups preserve the selected sort order internally.

### Theme

- Light/dark toggle (sun/moon icon, top-right of the brand header). `useTheme` persists the choice to `localStorage` (`scorescout-theme`) and defaults to `prefers-color-scheme` when nothing is stored; `document.documentElement.dataset.theme` drives CSS. An inline script in `index.html` sets the attribute before React hydrates, to avoid a flash of the wrong theme on load.
- CSS is token-based (`--ink`, `--muted`, `--paper`, `--cream`, `--line`, `--surface`, `--surface-hover`, `--surface-highlight`, plus `--green`/`--amber`/`--red`) with a `:root[data-theme="dark"]` override block in `src/styles/index.css`. Most of the app follows the tokens automatically; a handful of accent surfaces that were still hardcoded hex (community rating card, pinned-restaurants highlight, score chart band/line/grid colors, the map's floating score legend) needed explicit `:root[data-theme="dark"] .selector {}` overrides — check there before assuming a new colored surface will "just work" in dark mode.
- The map has no dark tile provider; dark mode applies a CSS `filter` (`invert(1) hue-rotate(180deg) ...`) to `.leaflet-tile-pane` instead. This was called out as a known compromise vs. switching to a proper dark tile set (e.g. CARTO dark) — cheaper to ship, but tiles read slightly muddy/desaturated compared to a real dark basemap. Revisit if dark mode gets real usage.
- This was explicitly scoped as a prototype, not a full design pass — don't assume every future colored UI element will automatically theme correctly; check it against `[data-theme="dark"]` when adding one.
- The brand logo (`assets/scorescout-logo.png`) is a transparent PNG with the pin shape and drop-shadow drawn in near-black — it visually disappeared against the dark background. Fixed with a light backdrop chip, but the first attempt used `background: var(--cream)`, which is silently wrong in dark mode: `--cream` is the page-background token and is itself redefined to a *dark* color (`#121512`) under `[data-theme="dark"]`, so it gave zero contrast. The working fix uses a fixed, non-token light color (`#f5f1e8`) that deliberately does not flip with the theme, since the chip's whole job is to stay light regardless — `:root[data-theme="dark"] .brand-mark { background: #f5f1e8; padding: 3px }`. Any other transparent asset with dark-only artwork will have the same problem in dark mode; when patching one, don't reach for a theme token that's meant to flip.
- `public/favicon.png` had the identical problem (same source artwork, transparent background, dark-only pin) — likely invisible in a dark-themed browser tab bar. Regenerated `favicon.png`, `favicon.ico`, and `apple-touch-icon.png` (`public/`) composited onto a solid `#f5f1e8` rounded-square backdrop (script used `sharp` + `png-to-ico`, not committed — regenerate similarly from `src/assets/scorescout-logo.png` if the source art changes). Also fixed a second, unrelated favicon bug while at it: `netlify.toml`'s SPA catch-all rewrite (`/* → /index.html`) was swallowing requests to `/favicon.ico` specifically, since no such file existed — browsers/tools that fall back to that implicit path got back an HTML document (`content-type: text/html`) instead of an icon. Having a real file at `public/favicon.ico` resolves this because Netlify serves an existing static file before falling through to the rewrite.

### Map

- Leaflet with React-Leaflet.
- Default center: Austin (`30.2747, -97.7404`), zoom 12.5 (was 12, briefly 15 — see the tuning history below).
- Score markers use green for 90–100, amber for 70–89, and red below 70. Individual pins are 34px (42px selected); cluster bubbles are 33/39/45px by size tier. The JS `size` in `scorePin`/`clusterPin` (`MapView.tsx`) and the CSS fixed px in `.map-score-pin`/`.map-score-pin.selected` (`index.css`) are two separate numbers kept in sync by hand — change both together.
- Selecting a marker opens the detail route/panel and enlarges the marker.
- Desktop selection pans the map to compensate for the right-side detail panel.
- Basemap control is a three-way Map/Satellite/Hybrid switcher (top-right of the map). Satellite and Hybrid use Esri World Imagery; Hybrid layers Esri's boundary/place-labels reference tiles on top.
- Zoom controls are currently disabled.
- `MapResize` (in `MapView.tsx`) attaches a `ResizeObserver` to the Leaflet container and calls `map.invalidateSize()` on every resize. Leaflet caches its container's pixel size at creation time and never notices later layout changes on its own (sidebar reflow, fonts loading async, breakpoint changes) — without this, tiles could be requested for a stale viewport and only partially load. Verified by comparing Leaflet's own `map.getSize()` against the container's actual `getBoundingClientRect()` after resizing across the mobile breakpoint — stays in sync now.
- Client-side marker clustering (`supercluster`, MIT-licensed, no React/Leaflet peer-dependency coupling) groups nearby restaurants into circular bubbles colored by the worst (lowest) score inside the cluster, using the same green/amber/red bands as individual pins. Bubbles carry **no count number** — a digit on a colored circle reads as a score, not a count; the circular shape (vs. individual pins' teardrop shape) is the only "this is a group" signal. Clusters split into sub-clusters and eventually individual pins as you zoom in or click a cluster (`getClusterExpansionZoom`); implementation in `src/components/MapView.tsx` (`ClusterMarkers`, `useRestaurantClusterIndex`). `clusterRadius`/`clusterMaxZoom` constants control density/threshold. Selecting a restaurant buried in a cluster uses `map.flyTo()` (not `setView`) so a large zoom jump eases smoothly rather than snapping — a plain `setView` felt disorienting for jumps of several zoom levels.
- `clusterRadius` is 100 (raised from an initial 60), tuned against the real production dataset (~1,000 restaurants from `/api/restaurants`), not synthetic test data. At the default zoom (12) against real Austin density, radius 60 produced 233 markers on screen (159 clusters + 74 individual) — visibly cluttered, with some individual pins overlapping without merging. Radius 100 brings that to 140 (109 clusters + 31 individual). Tuning method: fetch real coordinates, run `supercluster` locally in Node across candidate radius values and report marker counts per zoom — much faster than iterating via browser screenshots. See `scratchpad` history if re-tuning; the same approach (not guesswork) should be used again if density complaints resurface, since synthetic/small test data doesn't reveal real-world density problems.
- Default zoom/radius went through several rounds of user-driven iteration, each verified against real production data (fetch real coordinates, run `supercluster` locally in Node, or simulate the actual `.map-region` viewport bounds per zoom via Web Mercator math — not guesswork, not synthetic test data):
  1. `radius: 60` (original) → felt cluttered at the whole-metro default zoom (12): 233 markers, only 7% individual.
  2. `radius: 100`, same zoom 12 → 140 markers, but now *mostly cluster blobs* (13 individual of 89 markers) — user feedback: this broke the "self-evident, pins tied to the list" feel. Verified this wasn't a radius problem: even radius 20 at zoom 12 still leaves 73% of restaurants clustered, because showing ~1,000 real restaurants at once structurally can't read as readable individual pins at *any* radius. The earlier self-evident feel came from low data volume (fixtures/early partial geocoding), not from clustering settings.
  3. Zoom 12 → 15 (same `radius: 100`, same center) → 44% individual markers, but user observed downtown (the default center) is the single densest restaurant area in the city — confirmed empirically (other real neighborhoods hit 50-77% individual at the same zoom) — so zooming in further on *this* center gives diminishing returns; there's a density cliff around zoom 16→17 (57 restaurants → 4).
  4. `radius: 40` at zoom 12.5 → user explicitly prefers more individual pins over a fully decluttered map ("I don't mind if a few pins overlap"): 51% individual markers (272 total) vs. 29% individual (138 total) at radius 100/zoom 12.5.
  5. Settled/current: zoom `12.5`, `radius: 15`. To land here, a temporary live radius slider (`.debug-radius-slider`, since removed) was added to `MapView.tsx` so the user could drag-test values against real production data with zero redeploys, via `netlify dev` on `localhost:8888` (proxies the real Netlify Functions to the linked Supabase project — plain `npm run dev` on 5173 can't reach `/api/restaurants` and falls back to fixture data, useless for density tuning). If radius/zoom tuning is needed again, recreate that slider rather than redeploying repeatedly to test each value — the user explicitly asked to be conservative about pushes/deploys for exploratory work like this.
  If density complaints resurface, re-run the same real-data tuning approach rather than guessing — and consider that the *center point*, not just zoom/radius, materially changes the achievable individual-pin ratio (downtown is the worst case; North Loop/East Austin/Far North all do meaningfully better at the same zoom).
- Single basemap only — the Map/Satellite/Hybrid toggle was tried and then explicitly removed at the user's request. Don't reintroduce a basemap switcher without asking first.
- Closing the detail panel does **not** recenter the map back to `defaultCenter` — that used to happen and was removed because it was disorienting when zoomed in. `SelectionPan` only reacts to a restaurant becoming selected now; it deliberately no-ops on deselect.
- Non-obvious ordering constraint: `<ClusterMarkers>` must mount before `<SelectionPan>` in the JSX. A large deep-link-driven zoom jump fires Leaflet's `moveend` synchronously inside `setView()`; sibling effects run in JSX order, so if `SelectionPan`'s effect (which calls `setView`) ran first, `ClusterMarkers`'s `moveend` listener wouldn't be subscribed yet and would miss the event, leaving stale clusters on screen. Verified with a production build (dev-mode React StrictMode's double-effect-invoke can mask/alter this race, so always retest ordering changes against `npm run build && vite preview`, not just `npm run dev`).
- Viewport-based *data loading* (fetching only what's in view from the API) is still not implemented — clustering here only reduces rendered markers from whatever `restaurants` array the page already has in memory.

### Restaurant details

- Shareable routes are supported by `src/App.tsx`, including the canonical `/:cityCode/:restaurantKey` route and legacy formats.
- The detail panel shows:
  - Restaurant/facility name and address
  - Save/favorite control
  - Inspection History Profile
  - Latest official inspection score and date
  - Confidence and available inspection count
  - Google community rating and source link, when available
  - Recent official score chart
  - Deterministic explanation of the profile calculation
  - Link to the official City of Austin source

### Live-data fallback

- `useRestaurants` requests `/api/restaurants`.
- If live loading fails or returns no rows, the UI retains local fixture data.
- User-facing fallback copy says `Showing sample data` and `Live data unavailable · Sample restaurants shown`; do not reintroduce the developer term “fixture” in user-facing UI.

## Data and backend state

### Official Austin source

Source: <https://data.austintexas.gov/Health-and-Community-Services/Food-Establishment-Inspection-Scores/ecmv-9xxi>

The source contains individual inspections from roughly the latest three years. It represents food establishments, not only consumer-facing restaurants; schools, grocery/prepared-food departments, convenience stores, hospitals, care facilities, and other permitted operations are included.

Last checked on 2026-08-17:

- Official API: 6,518 distinct facilities and 20,964 inspection rows.
- Most recent completed ScoreScout import: 6,511 facilities and 20,911 inspection rows.

The dataset does not contain a reliable establishment-type field. A classification step is required before claiming that all imported facilities are restaurants.

### Why production currently shows only a small subset

`netlify/functions/restaurants.mts` requests rows from `restaurant_explorer` with both `latitude` and `longitude` required and a hard limit of 1,000. The Austin inspection source does not supply coordinates. Coordinates were previously added only when the Google Places enrichment accepted a match, so the public API exposed only successfully Google-matched facilities — 17 rows on the last verification, out of roughly 6,500 imported facilities.

**Fix implemented (chosen direction: free geocoder, Google as optional rating-only enrichment):**

- `netlify/functions/geocode-census-background.mts` (new) geocodes restaurants via the free, keyless US Census Bureau geocoder (`onelineaddress` endpoint, `Public_AR_Current` benchmark) and writes `latitude`/`longitude` directly. No API key, no cost, no documented hard rate limit; the function paces itself with a 120 ms delay between requests as a courtesy. Reads candidates from the new `restaurants_needing_geocode` view.
- `netlify/functions/enrich-google-places-background.mts` no longer writes coordinates and no longer gates on missing coordinates. It now reads candidates from the new `restaurants_needing_rating` view (restaurants with no `community_ratings` row yet) and only upserts a Google Places community rating. When coordinates already exist (from Census), they're passed to `findGooglePlaceMatch` for location-bias scoring.
- New migration: `supabase/migrations/202608172200_geocoding_views.sql` adds `restaurants_needing_geocode` and `restaurants_needing_rating`.

**Status: code complete, not yet applied to production.** Still needed:
1. Apply the migration to `scorescout-production` (`supabase db push` or equivalent).
2. Deploy (push to `main`).
3. Run `/api/geocode-census` across the ~6,500-facility backlog (paginated via `limit`/`after`, same pattern as the Google enrichment endpoint) to backfill coordinates.
4. Google enrichment can then run independently/opportunistically for ratings — still subject to the existing "ask before materially increasing Google Places usage/cost" rule.

Do not simply remove the coordinate filter and pass null coordinates into `MapView`.

## Server functions

### `GET /api/restaurants`

File: `netlify/functions/restaurants.mts`

- Reads the `restaurant_explorer` Supabase view.
- Requires non-null latitude and longitude.
- Limits the query to 1,000 rows.
- Returns profiles, five recent inspections, and optional Google community ratings.
- Uses `Cache-Control: public, max-age=60, s-maxage=300`.

### Austin import

File: `netlify/functions/import-austin.mts`

- Scheduled daily at `0 7 * * *` UTC.
- Fetches the Socrata dataset in 5,000-row pages.
- Upserts restaurants by `facility_id`.
- Inserts inspections idempotently using a derived `source_row_id`.
- Recalculates profiles using algorithm version `v1`.
- Records successful runs in `data_sources`.

### Census geocoding

File: `netlify/functions/geocode-census-background.mts`

- Protected by `Authorization: Bearer <IMPORT_SECRET>`.
- Accepts `limit` (default 100, max 200) and an `after` route-number cursor.
- Selects from the `restaurants_needing_geocode` view (active restaurants with null latitude/longitude).
- Calls the free US Census Bureau geocoder (no API key); writes `latitude`/`longitude` on a match.
- No cost and no known hard rate limit; self-paced with a 120 ms delay between requests.

### Google Places enrichment

File: `netlify/functions/enrich-google-places-background.mts`

- Protected by `Authorization: Bearer <IMPORT_SECRET>`.
- Accepts `limit` from 1 through 100 and an `after` route-number cursor.
- Selects from the `restaurants_needing_rating` view (active restaurants with no `community_ratings` row yet) — no longer gated on missing coordinates.
- Searches Google Places (New), scores name/address/location similarity (using existing coordinates for location bias when available), and accepts only confidence `>= 0.85`.
- Accepted matches upsert a Google Places community rating only; it no longer writes `latitude`/`longitude` (Census geocoding owns coordinates now).
- Rejected/uncertain matches are logged for review.
- Matching code and tests live in `scripts/lib/googlePlaces.ts` and `scripts/lib/googlePlaces.test.ts`.

Recent controlled enrichment (pre-decoupling) used about 120 Google calls and produced 17 accepted matches. Many plausible matches scored around `0.78`; tune matching carefully before scaling. Google Places usage can incur cost. Do not run large enrichment batches or exceed the agreed free allowance without explicit user approval.

## Inspection History Profile v1

Implementation: `src/features/restaurants/score.ts`

- Uses up to four newest scores.
- Recency weights: 50%, 30%, 15%, 5%, renormalized for shorter histories.
- Consistency adjustment: negative, capped at -5.
- Trend adjustment: capped to ±3.
- Final score is clamped to 0–100 and rounded.
- Confidence:
  - 1 inspection: Limited
  - 2: Moderate
  - 3–4: Good
  - 5+: High

## Supabase schema

Migrations:

- `supabase/migrations/202608170001_initial_schema.sql`
- `supabase/migrations/202608172200_geocoding_views.sql`
- `supabase/migrations/202608180001_fix_route_id_truncation.sql` — see "Fixed incidents worth knowing about" above

Main objects:

- `restaurants`
- `inspections`
- `inspection_profiles`
- `community_ratings`
- `data_sources`
- `set_restaurant_location()` trigger function
- `restaurant_explorer` security-invoker view
- `restaurants_needing_geocode`, `restaurants_needing_rating` security-invoker views

PostGIS stores restaurant locations as geography points. Public read-only RLS policies exist on the four user-facing tables. Anonymous/authenticated roles receive select access to those tables and `restaurant_explorer`. Server-side writes use the Supabase secret key.

## Environment variables

Required Netlify server variables:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `GOOGLE_PLACES_API_KEY`
- `IMPORT_SECRET`

All key/secret values are already managed outside source control. Treat the Google key, Supabase secret key, and import secret as secrets. Public Supabase URL/publishable values may exist locally, but the current browser app uses the Netlify API rather than connecting directly to Supabase.

## Local commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm test
```

Before committing application changes, run at minimum:

```bash
npm run build
npm run lint
npm test
git diff --check
```

Recent baseline: 3 Vitest files, 18 tests passing (added `src/features/restaurants/resolveSelectedRestaurant.test.ts`, extracted from inline logic in `ExplorePage.tsx`).

## Fixed incidents worth knowing about

- **`route_id` truncation → wrong restaurant on click/deep-link (fixed 2026-08-18).** `restaurant_explorer` derived `route_id` via `lpad(route_number::text, 2, '0')`. Postgres's `lpad` *truncates* (from the right) when the input is longer than the target width, not just pads short ones. With route_number now in the thousands, every route_number sharing a leading two-digit prefix (e.g. 180, 181, ..., 189, 1800-1899) collapsed onto the same `route_id`, so clicking a restaurant in the list or opening a deep link frequently opened a different, wrong restaurant. Verified against production: 8/8 sampled list clicks opened the wrong card before the fix. Fixed in `supabase/migrations/202608180001_fix_route_id_truncation.sql` by dropping the padding entirely (`route_number::text`, already unique, no truncation risk at any size) — verified 0 duplicate `route_id` values afterward and 0/8 mismatches on re-test. **Lesson: any lpad/rpad/substring-style formatting applied to an identifier must be re-checked against realistic scale, not just the original small fixture set** — this one was fine at 5 restaurants and silently broke at ~6,500. If similar cosmetic formatting shows up elsewhere (zip codes, ids, slugs), check whether it can truncate, not just whether it looks right today.
- CDN caching gotcha encountered while verifying the above: `/api/restaurants` has `s-maxage=300`, and different Netlify edge POPs cache independently — after applying the SQL fix, some requests (e.g. `curl` from one network path) saw the fresh response immediately while others (a headless-browser test) kept serving a stale, pre-fix response for several more minutes until that edge's own TTL expired. When verifying a backend fix against `scorescout.org`, check the response's `Age` header before concluding a fix didn't work — a high `Age` means you're looking at a cached pre-fix response, not a live bug.

## Known UX and technical issues

Highest priority:

1. Production list/map previously only exposed geocoded Google matches. Fix is deployed (Census geocoding); migration applied to production and a backfill of the ~6,494-restaurant backlog is in progress/may have completed — check "Repository state" above for current status before assuming either way.
2. Marker clustering is implemented (see Map section above) and solves rendering thousands of markers at once. Viewport-based *data loading* is still not implemented — `/api/restaurants` still returns up to 1,000 rows regardless of what's visible, which interacts with known issue #9 below.
3. The source needs classification so schools, stores, hospitals, and other facilities are not presented indiscriminately as restaurants.
4. Amber text/markers have insufficient contrast in some contexts and should be darkened.
5. Search removes the native focus outline without a replacement; consistent `:focus-visible` styling is needed.
6. The detail panel behaves like a modal but lacks dialog semantics, focus management, Escape handling, and focus restoration.
7. Mobile hides the ScoreScout brand and needs a better map/list navigation pattern.
8. Favorites are browser-local only; account-backed synchronization would require authentication and a user-favorites table.
9. The API hard limit is 1,000 and there is no pagination or viewport query.
10. The README and older implementation handoff contain some early-stack recommendations that no longer reflect the deployed Netlify/Supabase implementation; use this document as the current source of truth.

## Recent product decisions

- Prefer Netlify CLI and Supabase CLI over their dashboards.
- Keep the sidebar focused on utility; the redundant intro/marketing block was removed.
- Use plain-language `sample data`, never user-facing `fixture preview`.
- Slider handles are neutral; score meaning stays on the active track and score elements.
- Favorites should remain visible while regular results scroll.
- Google Places matching must favor avoiding false matches over maximizing coverage.
- Ask before materially increasing Google Places usage/cost.
- Coordinate coverage comes from a free Census Bureau geocoder, not Google; Google Places is optional rating-only enrichment decoupled from map/list coverage.
- Cluster bubbles are colored by worst-score-in-cluster (not a neutral count badge or averaged score) — deliberate choice for a health-inspection app to surface risk rather than hide it inside an average.
- Keep the map to a single basemap; the satellite/hybrid toggle was removed at the user's request.
- The map should not recenter itself when the user closes the detail panel.

## Recent commits

```text
7f0a814 Fix wrong-restaurant clicks, remove cluster count labels, ease big zooms
f621203 Add score-aware marker clustering to the map
b7c5c39 Remove save button from the restaurant detail panel
7e1babb Decouple coordinate coverage from Google Places, add Census geocoding
645f725 Add hybrid basemap mode, update handoff doc
ed44dcc Ignore local agent notes (AGENTS.md, PROJECT_STATE.md)
e1e99c3 Add satellite basemap toggle to the map
e546366 Keep saved restaurants visible while scrolling
84bbe3b Pin saved restaurants to top
ff5361b Add saved restaurant favorites
ffddce9 Add restaurant list sorting
6c65251 Use neutral score range handles
```

## Agent handoff checklist

When continuing work:

1. Read this document and `README.md`.
2. Inspect `git status` and preserve other agents’/the user’s edits.
3. Recheck live counts instead of assuming the last recorded values are current.
4. Never reveal or log secret values.
5. Use CLI workflows by default.
6. Test changes proportionally; run build, lint, and tests before commit/push.
7. Update this document when current behavior or operational state changes.
