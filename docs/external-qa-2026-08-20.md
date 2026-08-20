# ScoreScout — external QA pass

**Date:** 2026-08-20
**Tester:** Claude (separate session; no repo access — black-box only)
**Build:** `assets/index-Df8e-2iR.js`, served from Netlify
**Method:** live browsing of https://www.scorescout.org + direct calls to `/api/restaurants`

Context: this pass was done while scoping a launch post for r/austinfood, so it's
weighted toward "what breaks in front of a skeptical stranger who clicks a link,"
not code quality. Severity reflects that framing.

Two things I want to flag up front because I got them wrong on a first pass and
corrected them on a second: **deep links work** and **search works**. Earlier notes
to the contrary were my own truncated reads. Everything below was re-verified.

---

## P0 — reputational

### 1. Sample-data fallback presents fabricated venues as real

Observed once, after a client-side navigation from the list into a profile. The app
dropped into a fallback state and rendered:

```
5 places · Showing sample data
Live data unavailable · Sample restaurants shown

Violet Crown Tacos      Official 98 · Jul 2026    98
Juniper Table           Official 96 · Jun 2026    94
Barton Bakehouse        Official 89 · May 2026    90
North Loop Noodles      Official 78 · Apr 2026    78
South Congress Kitchen  Official 67 · Mar 2026    68
```

These are invented names carrying invented health scores, rendered in the same
visual treatment as real data. The only distinction is one line of small text.

Why this is P0 and not P2: the product's entire value is "this is the public
record." A screenshot of `scorescout.org` showing "South Congress Kitchen — 67"
is indistinguishable from a real failing score to anyone who doesn't read the
fallback banner. r/austinfood specifically has a rule (Rule 9) requiring public
records to back negative claims about businesses; this fallback manufactures
exactly the kind of artifact that rule exists to prevent.

**Suggested fix:** never render sample venues in the production build. On data
failure, show an empty state with a retry. If sample data is needed for local dev,
gate it behind an env flag that cannot be set in the production bundle.

**Repro:** intermittent. Load `/`, click a card to open a profile, observe. Did not
reproduce on hard load of a profile URL. Likely the client-side route transition
has a data-fetch path that fails open instead of failing closed.

---

### 2. `OOB - ` prefix leaks into the UI as part of the venue name

The card, the modal heading, and the page all display:

> **OOB - Shoal Creek Saloon** · 909 N Lamar Blvd Austin

Shoal Creek Saloon is open and trading — its GM was posting on r/austinfood about
its inspection score a week ago. "OOB" reads as *out of business* to a normal
reader. Same pattern on `OOB - Best Western Plus Austin Airport`.

Other prefixes in the feed that are almost certainly permit-record artifacts rather
than names: `PF - Starbucks Coffee #14446`, `PF - Torchys Tacos`, `BC - Vivel Crepes
& Coffee Express`.

**Suggested fix:** strip known prefixes (`OOB - `, `PF - `, `BC - `) for display,
keep the raw string for matching. If the prefix carries meaning worth surfacing,
render it as an explicit badge with a tooltip, not as part of the name.

Telling a working restaurant's customers it's out of business is the kind of error
that generates an angry email rather than a bug report.

---

## P1 — acquisition and trust

### 3. Search is punctuation-sensitive, and fails on how people actually type

| query | results |
|---|---|
| `chilantro` | **0** |
| `chi'lantro` | 8 |
| `lantro` | 8 |
| `neworldeli` | **0** |
| `world deli` | 1 (New World Deli) |
| `barrett` | 2 |
| `torchy` | 12 |

The data is present in every case — the matcher just won't bridge the apostrophe or
the missing space. `chilantro` returning nothing is a bad failure because that's the
spelling a person reaches for first, and the visible result is "this site doesn't
have my restaurant," not "try different punctuation."

**Suggested fix:** normalize both the query and the indexed name — casefold, strip
non-alphanumerics, collapse whitespace — and match on that. A cheap fuzzy pass
(trigram or Levenshtein ≤2) on top would catch `neworldeli` → `New World Deli`.

### 4. No SSR and no per-page metadata

The document served for every route is a 980-byte shell with a single static
`<title>ScoreScout — Austin inspection history</title>`. No per-restaurant title,
no description, no Open Graph or Twitter tags.

Consequences, both directly relevant if you're planning to seed links:

- A link pasted into Reddit, iMessage, or Slack renders no preview card. Next to a
  link that does, it reads as less legitimate.
- Zero organic search surface. "shoal creek saloon health score" is precisely the
  query this site should own, and right now nothing is indexable — the content only
  exists after JS runs and a fetch resolves.

**Suggested fix:** prerender the profile routes at build time, or add an edge
function that injects per-route `<title>`/`<meta>`/OG tags. Netlify supports both.
For a data site whose main organic channel is long-tail venue-name searches, this
is likely the highest-leverage item in this document.

### 5. Search returns stale results while a profile modal is open

With the Shoal Creek profile modal open, searching `simply pho`, `neworldeli`, and
`barretts` each returned `1 places` — Shoal Creek — regardless of query. Closing the
modal and repeating the same searches returned the correct results (`0`, `0`, `2`).

The selected route appears to pin the result set. A user who opens a profile and
then searches for their next restaurant sees the previous one and concludes search
is broken.

**Suggested fix:** clear or bypass the pinned selection when the query changes.

---

## P2 — polish

### 6. Search latency ~4–6s with weak feedback

Queries consistently took 4–6 seconds to resolve. During that window the header
reads "Loading Austin data…" while the previous result set stays on screen, so the
page looks stale rather than busy. Consider a skeleton state on the list itself,
and client-side filtering of the already-loaded set as an instant first pass while
the server query is in flight.

### 7. Chart plots fewer inspections than the count claims

Shoal Creek's modal states **"5 inspections available"** and the API returns five
(`2026-05-05:63`, `2025-12-08:88`, `2025-04-24:80`, `2024-12-12:82`, `2024-08-19:83`),
but the chart plots four — the Aug 2024 `83` is absent.

Either plot all five or relabel the chart "recent 4." As it stands the two numbers
on the same panel disagree, which is a bad look on a site whose pitch is rigor.

### 8. Browse list caps at 1000; the counter says 999

> **Fixed in `1.1.0` (2026-08-20), same day as this report.** The 1,000-row cap was Supabase's PostgREST `max-rows` project setting silently overriding the API's `limit=` param — not fixable by just requesting more. Fixed by paging through `Range` headers server-side; the browse/search endpoint now returns every matching restaurant with no cap. This was also the root cause of a separate deep-link bug (a specific restaurant's card failing to open) fixed in the same release — see `docs/current-state.md`. The off-by-one ("999 places" for exactly 1000 rows) was likely `RestaurantList`'s pinned-favorite splitting or a similar client-side render quirk against the old capped response; worth a quick re-check now that the cap itself is gone, but not independently investigated here.

`/api/restaurants?targetRoute=30` returns exactly **1000** records; the UI header
reads **"999 places."** Two separate things:

- The off-by-one suggests a record is being dropped or filtered in the count.
- 1000 is a suspiciously round cap. KUT reported 5,752 inspections citywide, so the
  browse view is showing a slice. Search does reach beyond it (Chi'Lantro locations
  and Torchy's both surface venues absent from the browse list), so this is a
  browse-view limit, not a coverage gap — but the UI presents "999 places" as though
  it were the whole dataset.

**Suggested fix:** say "showing 1,000 of N" explicitly, and reconcile the count.

### 9. `/api/restaurants` ignores unknown filter params instead of erroring

- `?q=simply%20pho` → `200`, zero results
- `?search=simply%20pho` → `200`, all 1000 records, filter silently ignored

Both are misleading in opposite directions. Rejecting unknown params with a 400, or
documenting the real one, would save anyone poking at the API some confusion.

---

## Not bugs — verified working

Recorded because I initially reported these as broken and they are not:

- **Profile deep links.** `https://www.scorescout.org/AUS/oob-shoal-creek-saloon-369`
  hard-loads correctly and renders the full history modal. My earlier "deep links are
  broken" call was an artifact of reading only the first 1–2 KB of `innerText`; the
  modal is appended near the end of the DOM, below the list and map.
  > **Caveat found 2026-08-20, same day:** deep links were not actually reliable — a
  > restaurant outside the same arbitrary 1,000-row slice as #8 above would fail to
  > open at all (reported separately as an iOS-specific bug, but reproduced on every
  > platform once traced to the API, not the browser). This test case's restaurant
  > (route `369`) apparently just happened to fall inside that slice. Fixed in
  > `1.1.0` alongside #8 — see `docs/current-state.md`.
- **Search.** Works, server-side, subject to the normalization issue in #3.
- **Data freshness.** Newest inspection `2026-08-18` — two days old at time of
  testing. Range extends back to `2023-06-16`. This is genuinely good and is the
  thing the product should lead with.

---

## One product note

The strongest asset here isn't the map — KUT already shipped a map, and it's fine.
It's `weightedHistoryScore` + `consistencyAdjustment` + `trendAdjustment`.

The top-voted comments on both r/austinfood inspection threads are people distrusting
single scores: *"no way only six failing inspections out of 5,752,"* *"it's incredibly
easy to pass,"* *"I know a place with a 97 that has a roach infestation."* A
history-weighted score with an explicit trend term is a direct answer to that
skepticism, and nothing else in this space is doing it.

The "How this was calculated" explainer already reads well:

> Recent inspections carry more weight. This location's recent pattern is declining;
> score variation adjusted the profile by -2.3 points and the recent trend by -3.0.

That sentence is the product. It's currently buried at the bottom of a modal that
requires two clicks to reach and can't be linked to with a preview. Items #4 and #2
are what stand between it and an audience.
