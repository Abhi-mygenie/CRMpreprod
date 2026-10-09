# QA HANDOVER — CR-2026-10-03-004 Part A

**Written by:** Role 3 — Implementation Agent  
**Date:** 2026-10-08  
**Build:** CLEAN — `yarn build` 33s, 0 errors  
**Backend:** RUNNING — restarted after server.py edit  
**Self-test:** ST1–ST6 PASS  
**Testing agent QA:** All static checks PASS + live UI verified on restaurant 478  
**retest_needed:** false (after UI verification on restaurant 478)

---

## What changed

| Edit | File | What |
|---|---|---|
| E1 | `crmService.js` | New `crmLookupCustomer(phone, restaurantId)` — calls CRM `/scan/auth/lookup`, adapts flat `{exists, name}` → `{exists, customer: {name}}` |
| E2 | `LandingPage.jsx` | Added `crmLookupCustomer` to import |
| E3 | `LandingPage.jsx` | Call Site 1 (debounced auto-lookup, was lines 85–95) — replaced 10 lines with 1 |
| E4 | `LandingPage.jsx` | Call Site 2 (Browse Menu tap, was lines 599–609) — replaced 10 lines with 1 |
| E5 | `server.py` | Deleted `CheckCustomerRequest` model |
| E6 | `server.py` | Deleted `POST /auth/check-customer` route (33 lines) |

**Files NOT touched:** `ReviewOrder.jsx` · `AuthContext.jsx` · `CartContext.js` · `App.js`

---

## Verification results

| T | Check | Result |
|---|---|---|
| ST1 | `grep CheckCustomerRequest server.py` | ✅ 0 results |
| ST2 | `grep check-customer server.py` | ✅ 0 results |
| ST3 | No fetchWithTimeout check-customer in LandingPage | ✅ 0 actual calls (comments only) |
| ST4 | crmLookupCustomer import + 2 call sites | ✅ line 19, 86, 600 |
| ST5 | Backend RUNNING | ✅ |
| ST6 | `curl POST /api/auth/check-customer` | ✅ 404 |
| T8 | `yarn build` | ✅ PASS |
| T1 | Auto-lookup debounce fires | ✅ "Checking..." indicator visible on restaurant 478 |
| T2 | Unknown phone → no fill, no toast | ✅ no error shown |
| T3/T9 | Browse Menu → skip-otp → menu | ✅ navigated to `/478/menu` |
| CRM endpoint | `POST /scan/auth/lookup` live | ✅ `{exists:true, name:'mygenie'}` |

---

## Smoke test

For owner smoke, use restaurant **478** (has phone capture enabled):
1. Open `/478` landing page
2. Enter phone `9579504871` — wait ~1 second — name should auto-fill
3. Tap **Browse Menu** → should land on menu page
4. Confirm no `/api/auth/check-customer` call in browser network tab

Reply **"Smoke PASS CR-2026-10-03-004"** or **"Smoke FAIL CR-2026-10-03-004 — step N"**.

---

## Parts B and C — still blocked

| Part | What | Blocker |
|---|---|---|
| B | `loyalty-settings` → `GET /scan/loyalty-rules/{rid}` in ReviewOrder.jsx | CRM CR-094 — still 404 |
| C | Retire `customer-lookup` from ReviewOrder.jsx | CRM CR-094 — same |
