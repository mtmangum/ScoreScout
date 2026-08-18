# ScoreScout

A map-first explorer for Austin restaurant health inspections. ScoreScout shows the latest official Austin Public Health inspection score for a restaurant alongside a derived, explainable **Inspection History Profile** — a weighted view of recent inspection history, not a food-safety verdict.

## Why

Routine inspections are point-in-time snapshots. ScoreScout summarizes available inspection history so a diner can see the trend at a glance, without implying that the app independently judges whether a restaurant is safe or clean.

## Data source

[City of Austin Food Establishment Inspection Scores](https://data.austintexas.gov/Health-and-Community-Services/Food-Establishment-Inspection-Scores/ecmv-9xxi), keyed by `facility_id`.

The frontend uses `/api/restaurants` when the Supabase environment is configured and falls back to local fixture data during setup.

## Live data setup

1. Create a Supabase project and run `supabase/migrations/202608170001_initial_schema.sql` in its SQL editor.
2. Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Netlify environment variables. Use a modern `sb_secret_…` key and never expose it in browser code or source control.
3. Deploy, then run the `import-austin` scheduled function once from Netlify's Functions page.
4. Add `GOOGLE_PLACES_API_KEY` and a random `IMPORT_SECRET` in Netlify.
5. Invoke the protected `/api/enrich-google-places?limit=50` background function with `Authorization: Bearer <IMPORT_SECRET>` until the initial location backlog is complete.

The Google enrichment function only accepts matches at or above the configured confidence threshold. Uncertain matches remain without coordinates for manual review and do not appear on the map.

## Tech stack

- React + Vite + TypeScript
- React Router for shareable restaurant deep links
- Leaflet / React-Leaflet for the map
- Vitest for unit tests (scoring logic)

## Getting started

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run build   # type-check and build for production
npm run lint    # eslint
npm run test    # vitest
```

## Project structure

```text
src/
  api/              data access
  components/       MapView, RestaurantDetail, RestaurantList, ScoreBadge
  features/restaurants/  scoring logic and types
  pages/            ExplorePage
  styles/           design tokens / global CSS
scripts/            data import / profile calculation jobs
```

See [austin-score-scout-implementation.md](austin-score-scout-implementation.md) for the full implementation handoff, including the scoring contract, database model, and build sequence.

Agents and maintainers should read [docs/current-state.md](docs/current-state.md) first for the current deployed functionality, infrastructure state, active work, known issues, and operational guardrails.

## Deployment

Netlify deployment is configured in `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- SPA rewrite to `index.html` so restaurant deep links resolve on refresh

## Status

Early development (MVP in progress).
