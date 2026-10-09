# INTAKE DOC — CR-2026-10-03-004

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-03-004 |
| **Title** | Move the 3 pre-login reads off CRM's tables onto CRM's API — `check-customer` → `POST /scan/auth/lookup`, `loyalty-settings` → `GET /scan/loyalty-rules/{rid}`, retire `customer-lookup` |
| **Classification** | CR — architecture / contract alignment (removes the last 3 live direct reads of CRM tables outside admin auth) |
| **Date Registered** | 2026-10-03 |
| **Reported By** | INV-2026-09-15-003 §5 class **C** · owner decision **O6** (2026-09-15: all pre-login lookups via CRM API) · CRM INV-022 B1/B3 |
| **Severity** | **P1** — blocks closing the boundary rule and signing the ownership map |
| **Risk** | **CRITICAL by file** — `LandingPage.jsx` (customer entry, addendum §6.7) and `ReviewOrder.jsx` (addendum §6.1, Part C CRITICAL). **No Fast Lane.** |
| **Status** | 📝 REGISTERED (Role 1 done) — **BLOCKED on CRM shipping CR-093 + CR-094** |
| **Parent** | INV-2026-09-15-003 · owner O6 |
| **Blast radius** | **MEDIUM** — 2 hotspot FE pages + `crmService.js`, 3 BE routes deleted |

## 1. Problem (code truth, verified on `3oct` 2026-10-03)

| # | Our code today | Collection read | What it powers | CRM replacement |
|---|---|---|---|---|
| C2 | `LandingPage.jsx:86` + `:607` → `POST /api/auth/check-customer` → `server.py:494 db.customers.find_one` | `customers` | "Welcome back" — name auto-fill when a known phone is typed (debounced) | **`POST /scan/auth/lookup {phone, restaurant_id}` → `{exists, name}`** — CRM **CR-093**, not yet built |
| L1 | `ReviewOrder.jsx:145` → `GET /api/loyalty-settings/{rid}` → `server.py:1496 db.loyalty_settings.find_one` | `loyalty_settings` | "You will earn N points" calculator at checkout, before login | **`GET /scan/loyalty-rules/{rid}` (public)** — CRM **CR-094**, not yet built |
| C10 | `ReviewOrder.jsx:418` → `GET /api/customer-lookup/{rid}?phone=` → `server.py:1539 db.customers.find_one` | `customers` | name + **points / tier / wallet** preview at checkout for a diner with no token | **none, and none is coming** — CRM B2: personal data is login-gated, anyone could type any phone. Owner **F2 = option (a)**: leave it blank, no retry, no message |

All three run on the **pre-login** path, which is why `/scan/*` (token-gated) had no equivalent until
CRM agreed to build CR-093 and CR-094 in reply INV-022.

## 1a. Contract-frozen details confirmed by CRM's sign-off (2026-10-03)

| # | Detail | Impact on this CR |
|---|---|---|
| **`exists` → `found`** | CRM's `POST /scan/auth/lookup` (CR-093) returns `{exists, name}`. Our retiring `/api/customer-lookup` returns `found`, and `found` drives **more than the greeting**: `LoyaltyRewardsSection.jsx:36` computes `isNewCustomer = lookedUpCustomer && !lookedUpCustomer.found`, which controls the **first-visit-bonus line** at checkout. `ReviewOrder.jsx:423` and `:1867` also read it. | **MANDATORY mapping: `exists` → `found`.** If missed, `!undefined === true` makes **every** diner look new and the first-visit bonus shows for everyone. Owner decision F2=(a) covered losing the *points/tier* preview — it never covered the bonus line, and the bonus line does **not** have to be lost |
| **CR-094 is per-tier** | CRM returns **four** earn percentages (`bronze/silver/gold/platinum_earn_percent`, `schemas.py:1007-1010`) plus `redemption_value`, `min_order_value`, `first_visit_bonus_enabled`, `first_visit_bonus_points`, `points_monetary_value` | **No adapter work.** Verified field-for-field against our route (`server.py:1505-1520`) and our UI (`LoyaltyRewardsSection.jsx:29` already reads `${tier}_earn_percent` with a bronze fallback) → **URL swap only** |
| **`found` flag on loyalty-settings** | our `/api/loyalty-settings` returns a `found` boolean; CRM's CR-094 does not | Harmless — **no consumer**. Our UI reads only the value fields, each with an inline default. Confirm at Planning and drop it |
| **rid form** | `/scan/loyalty-rules/{rid}` takes the **short** form (`689`); CRM normalises internally. Our route builds `pos_0001_restaurant_{rid}` itself (`server.py:1495`) — identical result | ✅ no change to how we pass the id |

## 2. Scope

**IN**
- **A — lookup swap.** `LandingPage.jsx` (both call sites) → `crmService.crmLookupCustomer(phone, rid)` → `POST /scan/auth/lookup`. Keep the existing debounce, cache and "welcome back" UI. Delete `POST /api/auth/check-customer` + its `db.customers` read (server.py L494).
- **B — loyalty-rules swap.** `ReviewOrder.jsx:145` → `GET /scan/loyalty-rules/{rid}`. Map CRM's field names onto what the points calculator reads (`*_earn_percent`, `redemption_value`, `min_order_value`, `first_visit_bonus_*` — CRM's list is a superset). Delete `GET /api/loyalty-settings/{rid}` (server.py L1492-1496).
- **C — retire `customer-lookup`.** Remove the `ReviewOrder.jsx:418` / `:860` no-token points-preview path per owner **F2 = (a)**: when there is no CRM token the points/tier block is simply not rendered — **no error toast, no "CRM is down" message, no retry**. Name pre-fill continues to come from (A). Delete `GET /api/customer-lookup/{rid}` (server.py L1527-1539).
- One shared **phone normaliser** applied in front of every `crmService` call (CRM matches on an exact 10-digit string — INV-022 §0 / INV-018 GAP-14).

**OUT**
- Non-Indian phone handling → CR-2026-09-15-003 (**PARKED**, India-only).
- Profile tab endpoints → CR-2026-09-15-001.
- Admin `users` reads → CR-2026-10-03-002 / CR-2026-09-15-004.
- The 14 dead sites → CR-2026-10-03-001.
- Any change to CRM; any request that CRM return points for an unauthenticated phone (**already refused**, B2 — do not re-ask).

**GREY ZONE (Planning decides)** — whether `/scan/loyalty-rules` is cached (it is public and per-restaurant, so it could join the config cache) and what the checkout block shows in the blank state (nothing at all vs. an empty placeholder).

## 3. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-15-001 | Also edits `crmService.js`, but different functions (profile tabs) | RELATED — no conflict, can run in parallel |
| CR-2026-09-15-002 | Same file `LandingPage.jsx` (dead 409 branch) | **RELATED — sequence together** to avoid conflict on a hotspot file |
| CR-2026-09-12-013 | Landing-page decomposition, same file | RELATED — sequence |
| CR-2026-09-12-009 | `+91` / `pos_id` hardcoding in the same helpers | RELATED — the shared normaliser should be agreed once across both |

## 4. Code exists? **PARTIAL** — our own routes exist and work; the CRM calls do not exist in `crmService.js`, and CRM has not shipped the two endpoints.

## 5. Files

| Will change | Will NOT touch |
|---|---|
| `frontend/src/pages/LandingPage.jsx` · `frontend/src/pages/ReviewOrder.jsx` · `frontend/src/api/services/crmService.js` · `backend/server.py` (delete 3 routes) | `AuthContext.jsx` · `CartContext.js` · `RestaurantConfigContext.jsx` · order payload builder · `.env` |

## 6. Acceptance criteria

1. On rid **689**, typing a known phone on the landing page still auto-fills the name — sourced from `POST /scan/auth/lookup`, confirmed in the network tab.
2. Typing an unknown phone shows no name and **no error toast**.
3. Checkout still shows "you will earn N points" with the same number as before the swap, sourced from `/scan/loyalty-rules/{rid}`.
4. A diner **with** a CRM token still sees points / tier at checkout (via `/scan/loyalty`, unchanged).
5. A diner **without** a token sees the points block absent and nothing broken — no toast, no console error, order placement unaffected (F2 = a).
6. `grep "db.customers\|db.loyalty_settings" backend/server.py` returns **nothing**.
7. **First-visit-bonus line survives the swap**: a diner whose phone is unknown to CRM still sees the first-visit bonus, and a known diner does not — driven by `exists` from `/scan/auth/lookup` (see §1a). This is the criterion most likely to be missed.
8. Order placement regression passes for dine-in, takeaway and delivery (hotspot files touched).
9. `yarn build` clean (no `CI=true`).

## 7. Prerequisites / blockers
1. **CRM must ship CR-093 (`POST /scan/auth/lookup`) and CR-094 (`GET /scan/loyalty-rules/{rid}`)** and send the refreshed OpenAPI / contract v2.1. Requested in `REPLY_TO_CRM_INV_022.md` (approved to send 2026-10-03).
2. R7 (verify APIs before wiring): probe both endpoints on UAT and capture real response shapes at Planning — the OpenAPI response schemas are untyped `{}`.
3. Owner approval of the Implementation Plan (two Part-C CRITICAL files).

```text
Intake complete: CR-2026-10-03-004
Classification: CR — architecture / contract alignment
Severity: P1
Risk: CRITICAL (LandingPage.jsx + ReviewOrder.jsx hotspots)
Duplicate check: DISTINCT (related: CR-2026-09-15-001/-002, CR-2026-09-12-009/-013)
Evidence: captured (LandingPage.jsx:86,607 · ReviewOrder.jsx:145,418 · server.py:494,1496,1539 · CRM INV-022 B1/B2/B3)
Blast radius: MEDIUM
Docs updated: this file, ../README.md, ../../PRD.md
Next: BLOCKED — CRM CR-093 + CR-094 → probe endpoints → Planning
```
