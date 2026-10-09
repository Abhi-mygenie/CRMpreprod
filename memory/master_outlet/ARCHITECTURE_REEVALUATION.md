# Multi-Outlet Discovery Layer — Architecture Re-evaluation

Date: 2026-06 (session after 2026-09-10 handover)
Role: Investigation / Discovery (no code)
Status: PROPOSAL — awaiting owner decisions (Section 9)
Inputs: `FRONTEND_MASTER_OUTLET_INTEGRATION.md`, `postman_master_outlet_collection.json` (suggestions, not contract),
live preprod responses (478 group), customer-app source.

---

## 1. What the feature actually is

A **routing pre-step** in front of the existing single-outlet ordering flow:

```
[Brand entry]  →  [Where are you?]  →  [Which outlets can serve you?]  →  [Existing /:restaurantId flow]
```

Everything to the right of the last arrow is live, revenue-bearing, and must not change behaviour (R6/R10).
The discovery layer therefore has exactly three jobs:

1. Identify the **group** (brand).
2. Capture a **location** (not a full deliverable address).
3. Produce a **truthful, comparable** outlet list and hand the customer off with zero re-entry.

---

## 2. Architecture principles (the part that must not change even if the API does)

| # | Principle | Why |
|---|---|---|
| P1 | Discovery is additive; single-outlet flow untouched | Live project. Regression surface must be near zero. |
| P2 | **One eligibility engine.** Whatever says "outlet X delivers to you for ₹Y" at discovery must be the *same logic* the outlet flow uses at address/checkout | Two engines = customer told yes then no. Fatal for trust and conversion. |
| P3 | **Frontend owns navigation, backend owns data.** Backend returns *identity* (id / slug / hostname); frontend builds the route | Backend cannot know which origin the customer is standing on, and a URL in a payload is unreviewable navigation. |
| P4 | **Handoff is URL-based, not storage-based** | Survives origin change, reload, incognito/ITP, sharing. The app already does this for `orderType` (`useScannedTable`). |
| P5 | Group identity resolves via the *same* mechanism as restaurant identity (path or hostname) | Reuses `useRestaurantId` resolver pattern; no second routing system. |
| P6 | Public endpoints expose public fields only (allow-list) | Live preprod `GET /master-outlet/478` currently leaks `crm_token`, `upi_id`, `email`, payment flags. |
| P7 | Contract is adapted at the service layer (`api/transformers`), never consumed raw in pages | Contract *will* change; pages must not. |

---

## 3. Current-state findings that shape the design (evidence from live preprod)

| Finding | Evidence | Impact |
|---|---|---|
| `redirect_url` host = master's tenant subdomain, not group domain | `domain: "master-outlet-478.local"` but `redirect_url: "https://18march.mygenie.online/510"` | Cross-origin jump whenever discovery is not hosted on that exact host → storage handoff lost. |
| `18march.mygenie.online` already resolves to restaurant 478 | `useRestaurantId.js` `getSubdomain()` → `getRestaurantDetails(hostname)` | `/` on that host is taken; group landing needs its own namespace. |
| Two eligibility engines | verify-location: `delivery_match{pincode,radius_km:6}`; outlet flow: `manage…/config/distance-api-new` using `per_km_shipping_charge`, `free_delivery_km`, `free_delivery_amt`, `maximum_shipping_charge` | Discovery "yes" ≠ checkout "yes". No fee to compare outlets. |
| 510 stored at Surat coords, "delivers" to Delhi 110001 (1,544 km) | verify-location + distance-api-new both returned yes | Pincode table is manually curated and can be wrong; radius shown next to 1,544 km is nonsense to a customer. |
| Delivery in outlet flow requires login + saved CRM address | `DeliveryAddress.jsx` L121: no `crmToken` → back to landing; address object has house/floor/contact | Discovery must hand off a **location hint**, not a cart address. Writing `delivery_<rid>` directly (earlier plan) is wrong — it bypasses login and creates an incomplete address in cart. |
| Order type already flows via URL | `useScannedTable` reads `?orderType=delivery|takeaway` → `sessionStorage scanned_table_<rid>` | Exact mechanism to extend for location hint. |
| Public group endpoint leaks vendor secrets | `master_restaurant.crm_token: dp_live_…`, `upi_id`, `live_payment` | Blocker for backend regardless of frontend work. |

---

## 4. Target architecture

### 4.1 Identity & routing

```
Path mode      /g/:groupIdentifier            → GroupLanding   (location entry)
               /g/:groupIdentifier/outlets    → GroupOutlets   (results)
Hostname mode  brandx.com  /                  → GroupLanding   (resolver says type=group)
               brandx.com  /outlets           → GroupOutlets
               brandx.com  /510               → existing outlet flow (path always wins — unchanged)
```

- `g` becomes a **reserved first segment** in `useRestaurantId` (never treated as a restaurant id).
- Hostname resolution becomes **typed**: `resolve(host) → { type: 'group' | 'restaurant', id }`.
  Backend: one endpoint (or extend `restaurant-info`) that answers for both. Cached module-level like today.
- Group identifier accepted: numeric master id, slug, hostname — mirrors restaurant resolver.
- No change to `/:restaurantId/*` routes. Group pages do **not** mount `CartProvider`/`RestaurantConfigContext` for a restaurant (guard: `restaurantId === 'g'` → skip).

### 4.2 Location capture (GroupLanding)

Inputs, in priority order: GPS ("Use my location") → Google Places autocomplete → pincode.
Output is a normalised **LocationHint**:

```ts
{ lat: number, lng: number, pincode?: string, label: string, source: 'gps'|'places'|'pincode' }
```

- Pincode-only input is geocoded client-side (Places/Geocoding) to lat/lng *before* calling backend, so the backend
  always receives coordinates. Pincode is sent as an optional hint, never as the sole key (P2).
- Mode toggle **Delivery / Pickup** at this step (same vocabulary as outlet LandingPage). Pickup skips serviceability
  and lists all active outlets by distance.
- Persist hint in `sessionStorage group_location_<gid>` so back-navigation and reload keep it.
- Reuse geolocation-denied UX pattern from `DeliveryAddress` (permission pre-check + inline help). Implement as a **new**
  hook `useGeoLocation` in phase 1; do not touch `DeliveryAddress.jsx` (high-risk file). Consolidate later under its own CR.

### 4.3 Outlet list (GroupOutlets)

Card = logo (placeholder if null) · name · address · distance · open/closed + next opening · min order ·
**delivery fee / free-above** · ETA · cuisine · CTA.

Sorting: deliverable → open → distance. Non-deliverable outlets are shown greyed with "Pickup only" **only if** owner
approves (Decision D2). Empty state shows nearest outlet + distance + "Change location".

Pagination via `total_size/limit/offset` with "Load more" (realistically < 20 outlets, but built properly).

### 4.4 Handoff (the critical piece)

On CTA:

```
target = outlet.hostname && outlet.hostname !== location.hostname
           ? `https://${outlet.hostname}/${outlet.id}`
           : `/${outlet.id}`

query  = ?orderType=delivery|takeaway
         &src=group&gid=<groupId>
         &lat=<lat>&lng=<lng>&pin=<pincode>&loc=<urlencoded label>

same-origin  → navigate(target + query)          (SPA, no reload)
cross-origin → window.location.assign(target + query)
```

Receiving side (minimal, additive changes):

- `useScannedTable` already parses `orderType`. Extend it to also parse `lat/lng/pin/loc/gid` into the same
  `scanned_table_<rid>` session object as `location_hint` and `group_id`. One file, additive keys.
- `DeliveryAddress`: if `location_hint` present and no saved address selected → centre map/marker on hint and
  pre-select a saved CRM address within ~200 m if one exists. Customer still confirms house/floor/contact and login is
  still required — cart address remains owned by the outlet flow (P1, R6). Distance/charge call runs exactly as today.
- `LandingPage`: if `group_id` present, show "← All outlets" back-link to `/g/<gid>/outlets` (or brand host).

Why not `localStorage` handoff: origin-bound, pollutes other restaurants' keys, not reload/share safe, and would
short-circuit the login + address confirmation that delivery legitimately requires.

### 4.5 Eligibility & fee (P2 — the backend ask that matters most)

`verify-location` must compute `delivery.available` and `delivery.charge` by calling the **same service function**
that backs `config/distance-api-new` (radius, per-km slab, min/max, free-delivery threshold, time window). The
manually curated pincode table may remain as a *coarse pre-filter* or be dropped; it must never be the final answer.

Until backend aligns, frontend compensates: after `verify-location`, fan out `distance-api-new` per returned outlet
(≤ ~5, `Promise.all`) and render fee/availability from that. This is removed the day backend returns the fields
(adapter change only, P7).

### 4.6 Proposed data shape (suggestion for backend — not binding)

```jsonc
// GET /api/v1/master-outlet/{identifier}   (public, allow-listed)
{ "id": 1, "name": "…", "slug": "…", "hostname": "brandx.mygenie.online" | null,
  "logo_url": "…", "cover_url": "…", "theme": { "primary": "#…" },
  "master_restaurant_id": 478, "supports": { "delivery": true, "takeaway": true },
  "restaurants_count": 3 }

// POST /api/v1/master-outlet/{identifier}/verify-location
// req
{ "latitude": 28.61, "longitude": 77.20, "pincode": "110001", "address": "…",
  "order_type": "delivery" | "takeaway", "order_value": 0, "limit": 20, "offset": 0 }
// res
{ "service_available": true, "total_size": 2, "limit": 20, "offset": 0,
  "nearest": { "id": 510, "distance_km": 12.4 },          // present when none deliverable
  "restaurants": [{
     "id": 510, "slug": "mygenie-dev", "hostname": "18march.mygenie.online" | null,
     "name": "…", "logo_url": null, "address": "…", "latitude": 15.04, "longitude": 73.99,
     "distance_km": 3.2, "open": true, "opens_at": "10:00", "closes_at": "23:00",
     "minimum_order": 0, "cuisine": [],
     "delivery": { "available": true, "charge": 40, "free_delivery_amt": 300, "eta_minutes": 35, "reason": null },
     "takeaway": { "available": true }
  }] }
```

Removed vs current: `redirect_url`, `web_url`, `delivery_match.radius_km`, `master_restaurant` blob.
Changed: `offset` 0-based (industry default; current brief uses 1), coordinates as numbers not strings.

### 4.7 Frontend module map (new files only, phase 1)

```
src/pages/group/GroupLanding.jsx
src/pages/group/GroupOutlets.jsx
src/components/group/LocationPicker.jsx        (GPS / Places / pincode → LocationHint)
src/components/group/OutletCard.jsx
src/components/group/ModeToggle.jsx            (Delivery / Pickup)
src/context/GroupContext.jsx                   (group meta + LocationHint, sessionStorage-backed)
src/hooks/useGeoLocation.js
src/hooks/useGroupIdentifier.js                (path | hostname → group id)
src/api/services/masterOutletService.js
src/api/transformers/masterOutletTransformer.js (contract → internal Outlet model; fan-out compensation lives here)
```

Touched existing files (additive, small): `App.js` (routes), `utils/useRestaurantId.js` (reserve `g`, typed resolver),
`hooks/useScannedTable.js` (parse hint), `pages/DeliveryAddress.jsx` (consume hint — guarded, optional),
`pages/LandingPage.jsx` (back-link — optional).

---

## 5. Non-functional requirements (live-project bar)

- **Truthfulness**: nothing shown on a card may contradict the outlet flow (P2). Test: same lat/lng → card fee ==
  ReviewOrder fee for a given `order_value`.
- **Resilience**: verify-location failure → retry state, never blank; geolocation denied → manual path; Places quota
  error → pincode path.
- **Performance**: group meta cached in `sessionStorage`; verify-location only on explicit submit/mode change; fan-out
  parallel with 3 s timeout per outlet.
- **Security**: public allow-list (P6); rate-limit verify-location; no tokens in discovery layer.
- **Observability**: `src=group&gid=` on the handoff URL lets POS attribute orders later (adding `group_id` to
  place-order payload is a separate CR — critical payload, R6).
- **Branding**: group logo/name/theme drive GroupLanding; outlet pages keep their own branding (unchanged).
- **Accessibility/mobile**: single-column, thumb-reach CTA, same design tokens as outlet LandingPage.
- **SEO**: group landing is indexable (brand page); outlets page is not.

---

## 6. What changes vs. the previous gap analysis

| Earlier position | Re-evaluated position | Reason |
|---|---|---|
| Write address to `localStorage delivery_<rid>` before redirect | **URL handoff of a LocationHint** consumed by `useScannedTable`/`DeliveryAddress` | Cross-origin safe; respects login + address-confirmation invariants; cart address stays owned by outlet flow. |
| Ask backend to add `delivery_charge` to delivery-areas | Ask backend to **reuse the distance engine** inside verify-location; frontend fan-out until then | A number in a table is not the same as the rule the checkout enforces. |
| Override `redirect_url` to local route | Ask backend for `hostname` (nullable); frontend builds route; tolerate `redirect_url` via adapter | Removes navigation from payload permanently instead of patching it. |
| Route prefix `/g/` | `/g/` **plus** typed hostname resolution | Brand domains are the real production case. |

---

## 7. Backend asks (ordered by importance)

1. **Security**: strip `master_restaurant` blob from public group GET; allow-list fields. (Blocker.)
2. **Eligibility**: `verify-location` returns `delivery.{available, charge, free_delivery_amt, eta_minutes}` computed by
   the same engine as `config/distance-api-new`; accepts `order_type`, `order_value`. Coordinates required, pincode optional.
3. **Identity**: return `hostname` (nullable) instead of `redirect_url`; `slug` per restaurant.
4. **Resolver**: hostname → `{type, id}` for both groups and restaurants (or confirm `restaurant-info` can answer for a group host).
5. **Ergonomics**: 0-based offset, numeric lat/lng, `nearest` when nothing deliverable, drop `radius_km` from public payload.

None of these block frontend phase 1 (adapter + fan-out cover 2–3); item 1 blocks *release*.

---

## 8. Release sequencing (all production-grade; no MVP)

| Phase | Scope | Depends on |
|---|---|---|
| 1 | Group routing (`/g/`), GroupLanding, GroupOutlets, LocationHint URL handoff, `useScannedTable` hint parsing, adapter with fan-out compensation | Nothing backend-side except the two public endpoints that already exist |
| 2 | `DeliveryAddress` hint consumption, back-link, typed hostname resolver | Backend resolver (ask 4) |
| 3 | Remove fan-out; consume backend `delivery.*`; group theming | Backend asks 2–3 |

---

## 9. Owner decisions required

| ID | Question | Recommendation |
|---|---|---|
| D1 | Hosting model for groups: brand hostname, `/g/` path, or both? | Both (hostname for brands, `/g/` for shared hosts/testing). |
| D2 | Show non-deliverable outlets as "Pickup only"? | Yes when group `supports.takeaway`; greyed, sorted last. |
| D3 | Offer Delivery/Pickup toggle at discovery? | Yes — mirrors outlet landing; pickup needs no serviceability. |
| D4 | Can outlets in one group live on different hostnames? | Assume yes → URL handoff is mandatory (already designed). |
| D5 | Backend appetite for unifying eligibility engine (ask 2) vs. long-term frontend fan-out? | Unify. Fan-out is compensation, not architecture. |
| D6 | Should `group_id` be added to the place-order payload for attribution? | Separate CR later (critical payload). |
