# Netlify → Cloudflare Workers migration plan

## Why
Browser traffic to `scorescout.org` (and `highlandlakelevels.org`) is being silently
dropped on at least one managed device, traced to Netlify's shared edge IPs
(`18.208.88.157` / `98.84.224.111`) getting caught in an IP-reputation block —
collateral damage from other tenants sharing those IPs, invisible in local
Defender history, likely enforced via org policy. Filed with UT IT, but not
expecting a fast (or any) fix, so moving off shared Netlify infra to reduce
recurrence risk.

## Target architecture
Single Cloudflare Worker using **Workers with static assets** (not classic
Pages) — Pages Functions don't support Cron Triggers, and a unified Worker
keeps the SPA, the API routes, and the scheduled import in one deployable
project instead of a Pages+separate-Worker split.

Verified during scoping: all four current functions and their shared
helpers (`scripts/lib/canonicalRestaurants.ts`, `classifyFacility.ts`,
`googlePlaces.ts`, `src/features/restaurants/score.ts`) use only Web-standard
APIs (`fetch`, `Request`/`Response`, `URL`, `URLSearchParams`) plus
`process.env` — no Node built-ins, no Netlify SDK. Logic ports over close to
verbatim.

## Mapping

| Netlify today | Cloudflare equivalent |
|---|---|
| `netlify.toml` SPA redirect (`/*` → `/index.html`) | `not_found_handling = "single-page-application"` in `[assets]` config |
| `restaurants.mts` (`config.path = '/api/restaurants'`) | Worker route `/api/restaurants` |
| `geocode-census-background.mts` (`/api/geocode-census`) | Worker route `/api/geocode-census`, same bearer-secret auth |
| `enrich-google-places-background.mts` (`/api/enrich-google-places`) | Worker route `/api/enrich-google-places` |
| `import-austin.mts` (`config.schedule = '0 7 * * *'`) | `scheduled()` handler + `[triggers] crons = ["0 7 * * *"]` in `wrangler.toml` |
| Netlify env vars (dashboard) | `wrangler secret put` — SUPABASE_URL, SUPABASE_SECRET_KEY, IMPORT_SECRET, GOOGLE_PLACES_API_KEY |

Frontend needs **no changes** — `src/api/restaurants.ts` already calls
`/api/restaurants` etc. as relative, same-origin paths.

## Cost
- Workers Free plan (100k req/day, 1 cron trigger, free custom domain once
  DNS is on Cloudflare) covers the `/api/*` routes fine, but has a **10ms
  CPU-time budget per invocation** — the daily `import-austin` job does real
  CPU work (paging thousands of Austin inspection rows, classification,
  canonical grouping, scoring) and will likely exceed that.
- Plan for the **Workers Paid plan ($5/mo)**: 10M requests/month, much higher
  CPU budget (30s+, configurable). Realistic tier for the cron job to run
  reliably. Can try free first and see if it errors on CPU limit before
  upgrading.
- No bandwidth/egress charges either way (unlike the AWS S3+CloudFront route
  considered and rejected).

## Steps

### 1. Inventory current DNS records (before touching anything)
- Pull current DNS records for `scorescout.org` from the registrar/current
  DNS host (MX, TXT — especially SPF/DKIM/DMARC if email is set up on this
  domain, CNAME, any other A/AAAA records beyond the Netlify ones).
- This is the one step with real blast radius (breaking email or other
  services) — confirm the full record list with the user before any
  nameserver change.

### 2. Set up Cloudflare
- Add `scorescout.org` as a site in Cloudflare (free plan).
- Recreate the non-Netlify DNS records from step 1 in Cloudflare's DNS
  before switching nameservers, so nothing drops during cutover.
- Update nameservers at the registrar to Cloudflare's.
- Wait for propagation/activation before proceeding.

### 3. Scaffold the Worker project
- `npm create cloudflare@latest` (or add `wrangler` directly) alongside the
  existing Vite app — same repo, new `worker/` directory for the Worker
  entrypoint, keep `src/` as-is for the Vite SPA.
- `wrangler.toml`:
  - `main = "worker/index.ts"`
  - `[assets] directory = "dist"`, `not_found_handling = "single-page-application"`
  - `[triggers] crons = ["0 7 * * *"]`
  - `compatibility_date` set to current date, no `nodejs_compat` flag needed
    (confirmed no Node built-ins in use).

### 4. Port the functions
- `worker/index.ts` fetch handler: route `/api/restaurants`,
  `/api/geocode-census`, `/api/enrich-google-places` to ported versions of
  the current `.mts` handlers (logic unchanged, just reshaped into
  Worker-style routing — a small router like `itty-router` or a manual
  switch on `url.pathname` both work given only 3 routes).
- `scheduled()` handler: port `import-austin.mts`'s default export logic
  directly — no HTTP request/response shape needed, just run the import.
- Reuse `scripts/lib/*` and `src/features/restaurants/score.ts` as-is via
  relative imports (already Workers-compatible).
- Env var access: `process.env.X` → `env.X` passed into the fetch/scheduled
  handler (Workers convention — no global `process.env`).

### 5. Secrets
- `wrangler secret put SUPABASE_URL`
- `wrangler secret put SUPABASE_SECRET_KEY`
- `wrangler secret put IMPORT_SECRET`
- `wrangler secret put GOOGLE_PLACES_API_KEY`

### 6. Build + deploy pipeline
- Build step stays `npm run build` (Vite → `dist/`).
- `wrangler deploy` publishes the Worker + static assets together.
- Decide on CI (GitHub Actions with `wrangler-action`) vs. manual deploys —
  matches whatever Netlify's current deploy trigger was (check if this was
  git-push-to-deploy on Netlify; replicate with a Cloudflare GitHub
  integration or a simple Actions workflow).

### 7. Test on `*.workers.dev` before cutting over
- Deploy and fully exercise the app on the free `*.workers.dev` subdomain
  Cloudflare assigns automatically — confirm SPA routing, all three API
  routes, and manually trigger the scheduled import handler
  (`wrangler dev --test-scheduled` or a manual invoke) before touching the
  real domain.

### 8. Cut over the custom domain
- Add `scorescout.org` / `www.scorescout.org` as a Worker custom domain
  (only possible once the zone is active on Cloudflare from step 2).
- Verify site loads correctly, including on the machine currently affected
  by the Netlify IP block.

### 9. Decommission Netlify
- Confirm Cloudflare is stable for a few days (including the next 07:00 UTC
  scheduled import) before removing the Netlify site/functions.
- Clean up Netlify env vars / site if fully migrated.

## Open questions for the user
- Confirm current DNS records at the registrar (step 1) before proceeding —
  need the actual list, not guessed from this repo.
- Confirm whether Netlify deploys are currently git-push-triggered, to
  replicate the same CI behavior on Cloudflare.
- `highlandlakelevels.org` is a separate project/repo — same fix would apply
  there but is out of scope for this plan unless requested.
