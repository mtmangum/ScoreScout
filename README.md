# ScoreScout

A map-first explorer for Austin restaurant health inspections. ScoreScout shows the latest official Austin Public Health inspection score for a restaurant alongside a derived, explainable **Inspection History Profile** — a weighted view of recent inspection history, not a food-safety verdict.

## Why

Routine inspections are point-in-time snapshots. ScoreScout summarizes available inspection history so a diner can see the trend at a glance, without implying that the app independently judges whether a restaurant is safe or clean.

## Data source

[City of Austin Food Establishment Inspection Scores](https://data.austintexas.gov/Health-and-Community-Services/Food-Establishment-Inspection-Scores/ecmv-9xxi), keyed by `facility_id`.

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

## Deployment

`vercel.json` rewrites all paths to `index.html` so client-side routes (including deep links to a restaurant) resolve correctly on a direct load or refresh.

## Status

Early development (MVP in progress).
