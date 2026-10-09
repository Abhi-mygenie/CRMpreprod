# QA HANDOVER — CR-2026-10-08-001 Step 1

**Written by:** Role 3 — Implementation Agent  
**Date:** 2026-10-08  
**Branch:** `7oct` (live on preview pod)  
**Build:** CLEAN — `yarn build` 49s, 0 new errors/warnings  
**Self-test:** 7/7 PASS (see below)

---

## What was changed

| Edit | File | What |
|---|---|---|
| E1 | `LandingPage.jsx` | Removed `pickOtpFlag / shouldShowOtpPage` import |
| E2 | `LandingPage.jsx` | Removed 6 `skipOtp*` vars from `useRestaurantConfig()` destructure |
| E3 | `LandingPage.jsx` | `navigateAfterSkip` now accepts `{ hasJustAuthenticated }` param (D3 delivery fix) |
| E4 | `LandingPage.jsx` | Success path passes `hasJustAuthenticated: !!result?.token` |
| E5 | `LandingPage.jsx` | 409 → degrade to guest + proceed to menu (D4) |
| E6 | `LandingPage.jsx` | 429 exhausted → wait-time toast + stay on landing (CR-2026-09-15-002 folded) |
| E7 | `LandingPage.jsx` | `mustShowOtpPage` gate removed — always calls `silentSkipOtpAndNavigate` |
| E8a | `App.js` | Added `useParams` to react-router-dom import |
| E8b | `App.js` | `PasswordSetup` import commented out |
| E8c | `App.js` | `PasswordSetupRedirect` component added |
| E8d | `App.js` | `/:restaurantId/password-setup` route → `<PasswordSetupRedirect />` |

**Files NOT touched:** `PasswordSetup.jsx` · `otpPolicy.js` · `crmService.js` · `crmSkipOtpRetry.js` · `RestaurantConfigContext.jsx` · `AuthContext.jsx` · `AdminVisibilityPage.jsx` · `backend/server.py`

---

## Self-test results (Role 3)

| ST | Test | Result |
|---|---|---|
| ST1 | `yarn build` | ✅ PASS — clean, 0 new errors |
| ST2 | `grep pickOtpFlag/shouldShowOtpPage/mustShowOtpPage LandingPage.jsx` | ✅ PASS — 0 results |
| ST3 | `grep skipOtpDineIn/skipOtpTakeaway LandingPage.jsx` | ✅ PASS — 0 results |
| ST4 | 409 handler present + uses `navigateAfterSkip({ hasJustAuthenticated: false })` | ✅ PASS |
| ST5 | 429 handler present + uses `err?.retryAfterMs` | ✅ PASS |
| ST6 | Gate removal confirmed — `silentSkipOtpAndNavigate` called in both `data.exists` branches | ✅ PASS |
| ST7 | `PasswordSetupRedirect` in App.js, route wired, `PasswordSetup` import commented out | ✅ PASS |

---

## QA test cases — execute all 12

| T | Scenario | Setup | Expected |
|---|---|---|---|
| T1 | **Core: skipOtp* all false → menu** | Use restaurant 478 (skipOtpDineIn=false). Enter phone `9579504871`, tap Browse Menu | `skip-otp` fires silently; CRM token set in localStorage (`crm_token_478`); navigate to menu. No `/password-setup` |
| T2 | **Previously working restaurant (skipOtpDineIn=true)** | Any restaurant with a `skipOtp*` flag true (e.g. 689). Enter phone, Browse Menu | Unchanged — navigates to menu as before |
| T3 | **Direct URL redirect** | Navigate browser to `/<rid>/password-setup` directly | Redirect to `/<rid>` landing page |
| T4 | **409 from skip-otp → guest proceeds** | Simulate 409: use a test phone that triggers it, or mock via devtools. | "Continuing as guest" toast; navigate to menu. No crash, no stuck landing |
| T5 | **429 exhausted → wait toast** | Simulate 429 with `Retry-After: 30` header. | Toast "Too many attempts. Please try again in 30 seconds."; stay on landing (no navigation) |
| T6 | **Delivery mode + successful skip-otp** | Restaurant with delivery enabled. Enter phone, select delivery, Browse Menu | Navigate to `/:rid/delivery-address` (D3 fix — must NOT show "Please login to use delivery") |
| T7 | **Delivery mode + guest fallback** | Delivery + skip-otp fails (all retries exhausted, non-429) | "Please login to use delivery" toast; stay on landing |
| T8 | **No phone + Browse Menu** | Leave phone field empty, tap Browse Menu | Straight to menu (unchanged) |
| T9 | **Authenticated user + Browse Menu** | Log in as admin or diner first | Straight to menu, no skip-otp call (unchanged) |
| T10 | **yarn build** | `cd /app/frontend && yarn build` | Clean — no new errors |
| T11 | **BUG-2026-10-06-001 regression** | Run the BUG-001 smoke flow (non-QR block telemetry) | Unaffected — telemetry still records correctly |
| T12 | **CR-2026-10-03-003 regression** | Run the CR-003 smoke flow (feedback → CRM) | Unaffected — feedback still posts to CRM |

---

## Test credentials

- Diner phone (restaurant 478/689): `9579504871`  
- Admin: `owner@18march.com` / `Qplazm@10` / rid `478`  
- CRM skip-otp: `POST https://preprod-crm-app-1.preview.emergentagent.com/api/scan/auth/skip-otp`  
  body: `{"phone":"9579504871","restaurant_id":"689"}`

---

## Known pre-existing warnings (NOT introduced by this CR)

- `Profile.jsx` line 51: useEffect missing deps
- `ReviewOrder.jsx` lines 301/353: useEffect missing deps

---

## Registry

- `CR-2026-10-08-001`: `INTAKE → IMPLEMENTATION` ✅
- `CR-2026-09-15-002`: `INTAKE → CLOSED` (folded) ✅

---

## Next after QA PASS

1. Role 8: write `SMOKE_BRIEF.md` + render `SMOKE_BRIEF.pdf`
2. Owner smoke: `Smoke PASS CR-2026-10-08-001`
3. Step 2 planning (after CRM CR-098 CONFIRMED): delete `PasswordSetup.jsx`, `otpPolicy.js`, `crmRegister`/`crmLogin`, retire `skipOtp*` from server.py/contexts/admin
