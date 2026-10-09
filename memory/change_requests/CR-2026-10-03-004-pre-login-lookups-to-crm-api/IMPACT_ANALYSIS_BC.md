# IMPACT ANALYSIS — CR-2026-10-03-004 Parts B+C

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-09  
**Based on:** INTAKE_DOC · IMPLEMENTATION_PLAN (Part A, shipped) · ReviewOrder.jsx (exact lines) · LoyaltyRewardsSection.jsx (exact lines) · crmService.js (exact lines) · server.py (exact lines, 1368-line post-001 state) · VALIDATION_OF_CRM_CR094_CR096_NOTE_2026-10-09 (G1–G7) · test_cr_2026_10_03_001.py · contracts/test_public_config.py  
**Scope:** Part B — `loyalty-settings` → CRM `loyalty-rules` swap + G1-G4 gap fixes. Part C — `customer-lookup` retirement (F2=a).  
**Predecessor:** Part A shipped (LandingPage check-customer → crmLookupCustomer). `db.customers` direct read count = 1 (customer-lookup). `db.loyalty_settings` direct read count = 1 (loyalty-settings).  
**Blocker cleared:** CRM CR-094 live as of 2026-10-09. 7/7 + 4 edge case probes PASS.

---

## 1. What Parts B+C do

**Part B** replaces the backend `GET /api/loyalty-settings/{rid}` route (which reads `db.loyalty_settings` directly) with a direct CRM call to `GET /scan/loyalty-rules/{rid}`. Simultaneously fixes four gaps exposed by diffing the live CRM response against current UI code (G1 per-tier redemption, G2 loyalty_enabled flag, G3 redemption caps, G4 404 → hide section).

**Part C** removes the backend `GET /api/customer-lookup/{rid}` route (which reads `db.customers` directly) and the corresponding debounce effect in ReviewOrder.jsx, per owner ruling F2=(a): when no CRM token, the points/tier block is not rendered — no toast, no retry.

After both parts: `grep "db\.loyalty_settings\|db\.customers" backend/server.py` → **0 hits** (from current 2). Dead-touch boundary grep reaches 0.

---

## 2. CRM `/scan/loyalty-rules/{rid}` — confirmed live contract

Source: VALIDATION probe 2026-10-09 against `REACT_APP_CRM_URL`.

`crmFetch` unwraps `{success, message, data}` envelope → caller receives `data` directly.

| Field (in `data`) | 689 value | 478 value | Notes |
|---|---|---|---|
| `loyalty_enabled` | true | **false** | G2: hide all loyalty copy when false |
| `bronze_earn_percent` | 5.0 | present | |
| `silver_earn_percent` | 7.0 | present | |
| `gold_earn_percent` | 10.0 | present | |
| `platinum_earn_percent` | 15.0 | present | |
| `bronze_redemption_value` | **1.0** | present | G1: authoritative per-tier — do not fall back to flat |
| `silver_redemption_value` | **2.0** | present | |
| `gold_redemption_value` | **3.0** | present | |
| `platinum_redemption_value` | **4.0** | present | |
| `min_order_value` | 100.0 | present | |
| `first_visit_bonus_enabled` | true | present | |
| `first_visit_bonus_points` | 50 | present | |
| `min_redemption_points` | TBC | present | G3 cap — floor before any redemption |
| `max_redemption_percent` | TBC | present | G3 cap — % of subtotal |
| `max_redemption_amount` | **110.0** | null (no cap) | G3 cap — absolute ₹ ceiling |
| `points_expiry_months` | 2 | present | informational only; no UI change needed |
| 404 for unknown rid | — | — | G4: `crmGetLoyaltyRules` catches → returns null |

`min_redemption_points` and `max_redemption_percent` exact values not confirmed in probe summary — treat as present and read defensively (`|| 0` / `|| 100`).

---

## 3. Current code state — exact touch points

### 3a. Part B touch points

| # | File | Lines | What today | Gap |
|---|---|---|---|---|
| B1 | `ReviewOrder.jsx` | 141–155 | `fetchWithTimeout(.../api/loyalty-settings/${numericRestaurantId})` → `setLoyaltySettings(data)` | Replace with `crmGetLoyaltyRules` call |
| B2 | `ReviewOrder.jsx` | 489–498 | `showLoyalty`: `restaurant.is_loyalty === 'Yes' && isCustomerDetailsFilled && configShowLoyaltyPoints` | G2: no check on `loyalty_enabled` |
| B3 | `ReviewOrder.jsx` | 859–874 | `handleUsePoints`: only caps by `subtotal`; uses `loyaltySettings?.redemption_value` (flat) | G1 + G3 |
| B4 | `ReviewOrder.jsx` | 1874 | `const rdv = loyaltySettings?.redemption_value \|\| 0` (inline "worth ₹X" display) | G1 |
| B5 | `LoyaltyRewardsSection.jsx` | 34 | `const redemptionValue = loyaltySettings.redemption_value \|\| 0.25` | G1: flat, wrong tier |
| B6 | `LoyaltyRewardsSection.jsx` | 91 | `const redemptionValue = loyaltySettings.redemption_value \|\| 0.25` (guest variant) | G1: should use bronze |
| B7 | `crmService.js` | after 338 | `crmGetLoyaltyRules` does not exist | New function needed |
| B8 | `server.py` | 971–1004 | `GET /loyalty-settings/{rid}` reads `db.loyalty_settings` | Delete route + no model to delete (no dedicated Pydantic model found) |

### 3b. Part C touch points

| # | File | Lines | What today | Action |
|---|---|---|---|---|
| C1 | `ReviewOrder.jsx` | 400–438 | Debounce effect: calls `/api/customer-lookup/${rid}?phone=`, sets `lookedUpCustomer` + auto-fills `customerName` | Delete entirely |
| C2 | `server.py` | 1006–1041 | `GET /customer-lookup/{rid}` reads `db.customers` | Delete route |

### 3c. Tests that guard the routes being deleted

| File | Test | Current assertion | Must become |
|---|---|---|---|
| `smoke/test_cr_2026_10_03_001.py:64–66` | `test_live_crm_boundary_routes_untouched` | 200 for both routes | 404 for both |
| `smoke/test_cr_2026_10_03_001.py:71` | `test_static_no_dead_touches` | `db.customers` count == 1 | count == 0 (also add `db.loyalty_settings` == 0) |
| `contracts/test_public_config.py:72–76` | `test_loyalty_settings_478` | status 200 + snapshot | 404 (no snapshot) |
| `contracts/test_public_config.py:80–90` | `test_customer_lookup_478` | status 200 + snapshot | 404 (no snapshot) |

---

## 4. G-gap resolution plan

| Gap | Where fixed | Resolution |
|---|---|---|
| G1: single `redemption_value` → per-tier | `LoyaltyRewardsSection.jsx:34,91`, `ReviewOrder.jsx:861,1874` | Read `loyaltySettings[`${tier}_redemption_value`]`; bronze for guest/fallback. Never fall back to flat `redemption_value`. |
| G2: `loyalty_enabled` flag (D1 — decision required) | `ReviewOrder.jsx:489–498` | See §5 D1 |
| G3: no redemption caps | `ReviewOrder.jsx:859–874` | `handleUsePoints` enforces `min_redemption_points` floor, `max_redemption_percent` %, `max_redemption_amount` ₹ ceiling — all three independently, whichever is most restrictive wins |
| G4: 404 unknown rid → hide section | `crmGetLoyaltyRules` catch + null state | `loyaltySettings = null` → LoyaltyRewardsSection Variants 1+3 both gate on `loyaltySettings` truthy → nothing rendered for guest; Variant 2 (identified, no settings) still shows "X points" for auth users with existing balance — acceptable |
| G5: response shape adapter | `crmGetLoyaltyRules` | `crmFetch` already unwraps `{success, message, data}` → data returned flat; no extra adapter |
| G6: first-visit bonus copy only | Already correct | No change |
| G7: 60/min limiter | No change | One call per ReviewOrder mount — fine |

---

## 5. Owner decision — RESOLVED

### D1 — G2: which flag gates the loyalty section?

**Decision (owner, 2026-10-09): POS flag only. `showLoyalty` stays as-is.**

`restaurant.is_loyalty === 'Yes'` remains the sole gate. CRM's `loyalty_enabled` field is fetched as part of the 33-key loyalty-rules response but is not used for section gating.

**Rationale:** POS flag is the single admin-controlled source of truth for all loyalty features across the app, as it has always been. CRM's `loyalty_enabled` is a CRM-internal configuration detail. If the two are ever out of sync, the fix belongs at the data layer, not in the UI. Adding a CRM AND-condition would also introduce a timing edge case (loyalty-rules loading slowly → section flickers) and add `loyaltySettings` to the `showLoyalty` dependency array unnecessarily.

**Plan impact:** E4 is **dropped**. `showLoyalty` memo in ReviewOrder.jsx is not touched. Plan is now 12 edits.

---

## 6. What customer-lookup removal does NOT break (Part C safety)

| Concern | Verdict |
|---|---|
| `customerName` auto-fill | Name already comes from `sessionStorage` (SESSION_CUSTOMER_KEY, set by LandingPage) and `localStorage` (`guestCustomer`). The ReviewOrder name fill from line 423 only fired for phones typed directly in ReviewOrder. Loss is acceptable per F2=(a). |
| `isNewCustomer` first-visit bonus | `isNewCustomer = lookedUpCustomer && !lookedUpCustomer.found`. With `lookedUpCustomer = null`: `isNewCustomer = false` → bonus line hidden for non-auth users. For auth users: bonus is awarded by CRM server-side at order time; the UI preview was nice-to-have. |
| `pts` in inline display (ReviewOrder.jsx:1871) | `pts = lookedUpCustomer?.found ? ... : (isAuthenticated ? user?.total_points : 0)`. Non-auth → `pts = 0` → "Use" button disabled. Correct per F2=(a). |
| Order placement payload | `customerName` and `customerPhone` are already pre-filled via sessionStorage/localStorage from LandingPage. Payload unaffected. |
| `LoyaltyRewardsSection` guest variant | `isGuest = !isAuthenticated && !lookedUpCustomer`. With `lookedUpCustomer = null` and non-auth: `isGuest = true` → Variant 3 renders generic earn prompt. No regression. |

---

## 7. Files WILL change

| File | Changes |
|---|---|
| `frontend/src/api/services/crmService.js` | Add `crmGetLoyaltyRules` (~18 lines) |
| `frontend/src/pages/ReviewOrder.jsx` | B1 (fetch effect), B2 (showLoyalty D1), B3 (handleUsePoints G1+G3), B4 (rdv inline), C1 (delete lookup effect) |
| `frontend/src/components/LoyaltyRewardsSection/LoyaltyRewardsSection.jsx` | B5 (Variant 1 rdv), B6 (Variant 3 rdv) |
| `backend/server.py` | Delete `loyalty-settings` route (L971–1004) + `customer-lookup` route (L1006–1041) |
| `backend/tests/smoke/test_cr_2026_10_03_001.py` | Flip 2 assertions (L65–66 → 404, L71 customers count → 0 + add loyalty_settings count == 0) |
| `backend/tests/contracts/test_public_config.py` | Flip 2 contract tests → 404, remove snapshot assertions |

## 8. Files WILL NOT touch

`AuthContext.jsx` · `CartContext.js` · `RestaurantConfigContext.jsx` · `App.js` · `LandingPage.jsx` · order payload builder · `handlePlaceOrder` · any other server.py route · `.env`

---

## 9. Risk

| Area | Rating | Reason |
|---|---|---|
| Overall | **CRITICAL** | ReviewOrder.jsx is the highest-risk file in the codebase; server.py is entire backend |
| G1 per-tier redemption | HIGH | Three independent reads of `redemption_value` must all be updated; missing one shows wrong value silently |
| G3 caps in handleUsePoints | HIGH | Wrong cap logic allows over-redemption (CRM may reject at order time) or under-redemption (diner cheated) |
| Backend route deletion | HIGH | Irreversible; two active routes deleted; tests must be updated in same pass |
| G2 (D1) | MEDIUM | Option A is safe addition; Option B is a gating change |
| `crmGetLoyaltyRules` 404 handling | MEDIUM | If 404 throws uncaught, loyaltySettings never sets → null → section hidden (safe failure mode) |

No Fast Lane. CRITICAL — owner Gate 3 required before Role 3.

---

```
Planning complete: CR-2026-10-03-004 Parts B+C
Stage: Impact Analysis
Code reality: FULL — all 10 touch points confirmed with exact line numbers
Risk: CRITICAL
Files WILL change: crmService.js · ReviewOrder.jsx · LoyaltyRewardsSection.jsx · server.py · test_cr_2026_10_03_001.py · test_public_config.py
Files WILL NOT touch: AuthContext.jsx · CartContext.js · RestaurantConfigContext.jsx · App.js · LandingPage.jsx
Owner decisions: D1 RESOLVED 2026-10-09 — POS flag only; showLoyalty unchanged; E4 dropped
Docs: IMPACT_ANALYSIS_BC.md · IMPLEMENTATION_PLAN_BC.md
Next: "Gate 3 accepted for CR-2026-10-03-004 Parts B+C" → Role 3
```
