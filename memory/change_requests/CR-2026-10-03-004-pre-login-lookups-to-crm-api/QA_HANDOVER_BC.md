# QA HANDOVER — CR-2026-10-03-004 Parts B+C

**Written by:** Role 3 — Implementation Agent  
**Date:** 2026-10-09  
**Status:** Self-test complete — ready for QA  
**Risk:** CRITICAL

---

## Self-test results

| ST | Test | Result |
|---|---|---|
| ST1 | `grep -c "db\.loyalty_settings\|db\.customers" server.py` | **0** ✅ |
| ST2 | `curl GET /api/loyalty-settings/478` | **404** ✅ |
| ST3 | `curl GET /api/customer-lookup/478?phone=9579504871` | **404** ✅ |
| ST4 | No flat `redemption_value` in changed files | **Clean** ✅ |
| ST5 | Backend running | **RUNNING pid 49** ✅ |
| ST6 | `pytest -m smoke` | **46 passed, 1 skipped** ✅ |
| ST7 | `pytest -m contract --snapshot-update` | **14 passed, 2 stale snapshots deleted** ✅ |
| ST8 | `yarn build` | **Clean, 0 errors** ✅ |

---

## What changed — files and edits

| Edit | File | Change |
|---|---|---|
| E1 | `frontend/src/api/services/crmService.js` | Added `crmGetLoyaltyRules(restaurantId)` — calls CRM `GET /scan/loyalty-rules/{rid}`, returns null on 404 |
| E2 | `frontend/src/pages/ReviewOrder.jsx` | Added import for `crmGetLoyaltyRules` |
| E3 | `frontend/src/pages/ReviewOrder.jsx:141–155` | Replaced `fetchWithTimeout(…/api/loyalty-settings/…)` with `crmGetLoyaltyRules` call |
| E5 | `frontend/src/pages/ReviewOrder.jsx:859–874` | `handleUsePoints`: per-tier redemption value (G1) + G3 caps (min_redemption_points, max_redemption_percent, max_redemption_amount) |
| E6 | `frontend/src/pages/ReviewOrder.jsx:~1851` | Inline "worth ₹X" display: per-tier `_redemption_value` |
| E7 | `frontend/src/pages/ReviewOrder.jsx:400–438` | Deleted customer-lookup debounce effect (Part C, F2=a) |
| E8 | `frontend/src/components/LoyaltyRewardsSection/LoyaltyRewardsSection.jsx:34` | Variant 1: per-tier `${tier}_redemption_value` |
| E9 | `frontend/src/components/LoyaltyRewardsSection/LoyaltyRewardsSection.jsx:91` | Variant 3 guest: `bronze_redemption_value` |
| E10 | `backend/server.py` | Deleted `GET /loyalty-settings/{restaurant_id}` route |
| E11 | `backend/server.py` | Deleted `GET /customer-lookup/{restaurant_id}` route |
| E12 | `backend/tests/smoke/test_cr_2026_10_03_001.py` | Flipped to expect 404; `db.customers` count → 0, added `db.loyalty_settings` count → 0 |
| E13 | `backend/tests/contracts/test_public_config.py` | Flipped both contract tests to expect 404; stale snapshots deleted |

---

## QA test cases

### Part B — loyalty-rules swap

| T | Scenario | Expected | How to verify |
|---|---|---|---|
| T1 | Restaurant **689** — ReviewOrder loads, diner unauthenticated | LoyaltySection shows generic earn prompt (Variant 3, bronze earn rate). Network tab shows call to CRM `/scan/loyalty-rules/689` — **NOT** to `/api/loyalty-settings/689` | Browser DevTools → Network |
| T2 | Restaurant **689** — diner authenticated as **Gold** tier | Earn preview uses `gold_earn_percent`; "Worth ₹X" uses `gold_redemption_value` (₹3/pt). E.g. 100 pts → "Worth ₹300", not ₹25 | Browser + DevTools |
| T3 | Restaurant **689** — diner has 500 points, clicks "Use" | Discount capped at ₹110 (`max_redemption_amount`). `min_redemption_points` floor respected. "Using X points (-₹Y)" shows capped value | Browser + DevTools |
| T4 | Restaurant **478** — ReviewOrder loads | Loyalty section hidden (`loyalty_enabled: false` on CRM — but D1=POS only, so this only hides if `restaurant.is_loyalty !== 'Yes'` on POS for 478) | Browser |
| T5 | Restaurant with no loyalty-rules on CRM (404) | Loyalty section hidden (`loyaltySettings = null` → Variants 1+3 don't render) | Browser |
| T6 | `curl GET $BACKEND_URL/api/loyalty-settings/689` | **404** | curl |
| T7 | Backend smoke: `pytest -m smoke -n 0 tests/smoke/ -q` | 46 passed, 1 skipped | pytest |
| T8 | Backend contract: `pytest -m contract -n 0 tests/contracts/ -q` | 14 passed | pytest |

### Part C — customer-lookup retirement

| T | Scenario | Expected |
|---|---|---|
| T9 | ReviewOrder: type a phone number in the customer phone field (non-auth user) | Name field does **NOT** auto-fill from lookup. If name was entered at LandingPage, it is already pre-populated from sessionStorage/guestCustomer |
| T10 | `curl GET $BACKEND_URL/api/customer-lookup/689?phone=9579504871` | **404** |
| T11 | Non-auth user: points/tier block | Not shown (F2=a). No error toast, no console error |

### Regression

| T | Scenario | Expected |
|---|---|---|
| T12 | Full order placement — dine-in, restaurant 689, authenticated | Order places successfully. Payload unchanged. `yarn build` clean |
| T13 | `grep -c "db\.loyalty_settings\|db\.customers" backend/server.py` | **0** |

---

## Code markers used

```javascript
// CR-2026-10-03-004 Part B: …
// CR-2026-10-03-004 Part C: …
```

---

## Registry update needed

Status: **IMPLEMENTATION** → **QA**

```
QA command: pytest -m "smoke or contract" -n 0 backend/tests/ -q
Build: cd /app/frontend && yarn build
```
