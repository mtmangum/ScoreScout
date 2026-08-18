# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Initial Vite + React + TypeScript project scaffold.
- Map explore page (`MapView`, `RestaurantList`, `RestaurantDetail`, `ScoreBadge`) backed by local fixture restaurant data.
- Inspection History Profile scoring logic (`features/restaurants/score.ts`) with unit tests.
- Implementation handoff document describing product scope, scoring contract, and data model.
- README and this changelog.
- Shareable restaurant links via `react-router-dom`, with support for `/:cityCode/:restaurantKey`, `/r/:restaurantKey`, and `/restaurants/:facilityId` URL formats, plus a Vercel rewrite so deep links resolve on refresh.
- Collapsible "About scores & data" disclosure in the sidebar footer.

### Fixed

- Deep-link restaurant matching could resolve to the wrong restaurant when one facility ID was a suffix of another, and was case-sensitive against facility IDs embedded in a URL slug.
- A restaurant opened via deep link outside the current score filter now appears in the sidebar list and results count, not just the map.
