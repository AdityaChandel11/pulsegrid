# PulseGrid — Modular Build Guide (Multi-Account)

Use `PulseGrid_Interface_Contract.ts` alongside this guide — every account below should have that file in its workspace before writing anything.

## Sequencing (don't fully parallelize)

Build in this order, not all three at once from a blank repo:

1. **Account C** builds the foundation alone: schema, types, synthetic data. Push to branch `foundation`.
2. **Account A** and **Account B** each branch *from* `foundation` (not from a blank repo) and work in parallel from there.
3. Merge `backend-engine` and `frontend-dashboard` into `main`, then run the final wiring pass.

This way A and B are both building against real, identical seed data from the start, instead of each inventing their own fake rows that don't line up later.

## Repo structure

```
/src/types.ts              <- the contract file, owned by Account C, read-only for A and B
/src/db/schema.sql          <- Account C
/src/db/seed.ts             <- Account C
/src/data/seed-export.json  <- Account C (a real example dataset A and B can both inspect)
/src/lib/                   <- Account A (engine logic)
/src/app/api/                <- Account A (route handlers)
/src/app/(dashboard)/         <- Account B
/src/components/            <- Account B
```

## Git workflow

```
git checkout -b foundation
# Account C works here, pushes

git checkout -b backend-engine foundation
# Account A works here, pushes

git checkout -b frontend-dashboard foundation
# Account B works here, pushes

git checkout main
git merge foundation
git merge backend-engine
git merge frontend-dashboard
```

Expect the real conflicts to show up in `package.json`, `tsconfig.json`, and `tailwind.config` if A and B each added dependencies — not in the logic files, since those don't overlap. Resolve those by hand or let the final wiring pass reconcile them.

---

## Account C prompt — Schema, Types, Synthetic Data

```
You are setting up the foundation for a project called PulseGrid — a health
supply-chain resilience dashboard. Your job is ONLY the data foundation, not
the engine and not the UI.

1. Scaffold a Next.js (TypeScript, App Router) project with better-sqlite3.
2. Copy the attached PulseGrid_Interface_Contract.ts into /src/types.ts exactly
   as given — do not modify the shapes.
3. Create a SQLite schema (/src/db/schema.sql) matching those types: Facility,
   Medicine, InventoryEvent, Bed, StaffRosterEntry, Prediction, CountrySignal.
4. Write a synthetic data generator (/src/db/seed.ts):
   - 3 country instances (india, brazil, south_africa), 15-20 facilities each,
     with real-sounding local names (e.g. India: "PHC Bareilly-North"; Brazil:
     "UBS Vila Nova"; South Africa: "Khayelitsha CHC").
   - 8-12 medicines per facility, including at least one emergency-relevant
     item (oxygen, IV fluids, anti-venom, or platelets) alongside routine ones
     (amoxicillin, ORS, paracetamol, insulin).
   - 45 days of daily DISPENSED history per facility-medicine pair with
     realistic noise, and a deliberate surge (a sharp jump well above normal
     variance) injected in the last 5-7 days for 2-3 pairs.
   - Stagger InventoryEvent.source and timestamps: roughly 50% "api" and
     recent, 30% "barcode" and semi-recent, 20% "manual" and 3-5 days stale.
5. Run the generator, commit the populated local database, and also export a
   flat JSON snapshot to /src/data/seed-export.json so other engineers can
   inspect real example rows without regenerating.
6. Do NOT write forecasting logic, API routes, or any UI. This branch is data
   and schema only.
7. Push to a branch named `foundation`.
```

---

## Account A prompt — Backend Engine

```
You are building ONLY the backend logic for PulseGrid. Branch from
`foundation` — it already has /src/types.ts, the DB schema, and seeded data.
Do not modify /src/types.ts or the database schema; treat them as fixed.

Implement, as real runnable logic (never a hardcoded fake number):

1. Medicine forecasting: aggregate DISPENSED events into a daily series per
   facility-medicine pair. Compute a 14-day baseline mean/std, a 7-day trend
   multiplier, run a Monte Carlo simulation (300+ paths, fixed seed) to get
   p10/p50/p90 days-to-stockout.
2. Confidence scoring:
   confidence = 100 * sourceWeight * recencyDecay * spreadPenalty * accuracyMultiplier
   where sourceWeight is api:1.0/barcode:0.9/manual:0.6, recencyDecay decays
   to a floor of 0.1 by 96 hours stale, spreadPenalty shrinks as the p10-p90
   band widens relative to p50.
3. Surge detection: rolling z-score of daily dispensed qty vs baseline; z>2.5
   for 2 consecutive days sets surgeFlag=true, shrinks the baseline window to
   3-5 days, and lowers the redistribution trigger threshold.
4. Prediction accuracy tracking: log every p50 prediction; when its target
   date is reached (support a "step time forward" test endpoint), compare to
   actual depletion and compute a rolling accuracy score that feeds back into
   accuracyMultiplier above.
5. Redistribution recommendations: deterministic pre-filter (surplus >0 AND
   confidence >=60 as candidate sources), then call the Gemini API
   (GEMINI_API_KEY env var) for the final pick + a memo in the requested
   language. If no key is set, fall back to picking the nearest sufficient
   candidate and a templated memo — the route must never fail without a key.
6. Beds and staff: simple threshold rules only, no forecasting.
   occupancy>=90% -> warning, >=100% -> critical.
   staff deficit>=1 -> shortage, >=2 -> critical.
7. Cross-border signals: publish aggregated CountrySignal rows only — never
   facility-level or patient-level data in any cross-country response.

Expose ALL of this exactly through the API routes and response shapes defined
in /src/types.ts — do not deviate from those shapes even slightly, since
another team is building a frontend against that exact contract right now.

Push to a branch named `backend-engine`.
```

---

## Account B prompt — Officer Dashboard & Citizen Checker

```
You are building ONLY the frontend for PulseGrid. Branch from `foundation` —
it already has /src/types.ts and seeded data. Treat the API routes described
in /src/types.ts as the contract: call them by their documented shape. They
may not exist yet — if so, build against a local mock that returns EXACTLY
the example JSON payloads given in the contract's comments, so swapping the
mock for the real route later is a one-line change, not a rewrite.

Build:

1. A Leaflet + OpenStreetMap network view (no API key needed) with every
   facility as a node, colored by severity, pulsing gently — faster/brighter
   for emergency nodes.
2. A ranked at-risk list, sorted by p50 days-to-stockout weighted by
   confidence and surge status.
3. A facility detail panel (opens on node click): forecast chart with a
   visible p10-p90 band (Recharts), confidence score, source/freshness badge,
   and a "prediction track record" line from /api/predictions/track-record.
4. A redistribution recommendation card: source, quantity, distance, ETA, the
   memo text, and a one-tap Approve button that calls the approve route and
   animates a route line + node color transition on the map.
5. A KPI panel: stockout lead-time gained, an actually-timed
   seconds-to-action counter, network stockout-days reduced.
6. A public Citizen Checker: search facility or medicine, return status PLUS
   an explicit freshness statement — never a bare yes/no.
7. Design system: dark ops-room palette (deep slate-navy background, not
   black), Space Grotesk for headers, Inter for body, IBM Plex Mono for every
   numeric/tabular value. Signature element: an animated ECG-style pulse line
   in the header whose rhythm intensifies when any facility is in surge mode.
8. Include this line, verbatim, as persistent footer text and as a tooltip on
   every "Source" badge:
   "For this prototype, the hospital/e-Aushadhi event stream is simulated.
   The production architecture accepts the same events through an API."

Push to a branch named `frontend-dashboard`.
```

---

## Final wiring pass (run locally in Antigravity, after merging)

Once `backend-engine` and `frontend-dashboard` are both merged into `main`,
open the merged repo in Antigravity and give it this — short, because it can
read the file tree itself instead of you pasting code:

```
Module A (the real backend) is in /src/lib and /src/app/api. Module B (the
frontend) is in /src/app and /src/components, currently calling mock
responses shaped like /src/types.ts. Wire B's calls to A's real routes.
Where a response shape doesn't match exactly, /src/types.ts is the source of
truth — fix the mismatched side, don't change the contract. Then run through
this checklist and report any failures:

1. Map loads with 15+ pulsing nodes colored by severity.
2. Clicking a node opens a forecast chart with a visible p10-p90 band.
3. At least one facility is visibly in surge/emergency state.
4. Approving a recommendation animates the map and updates the KPI panel
   within 2 seconds.
5. A "Manual - stale" facility visibly shows lower confidence than an
   "API - fresh" one.
6. Switching country swaps the full dataset and language; the signal
   exchange panel shows only aggregated data for the other two countries.
7. The citizen checker always returns a freshness statement.
8. The data-honesty line appears in the UI.
9. Nothing blocks on a live network call longer than 2 seconds.
```
