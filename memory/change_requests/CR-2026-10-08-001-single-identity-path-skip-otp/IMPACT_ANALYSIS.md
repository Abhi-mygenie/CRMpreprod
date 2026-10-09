# IMPACT ANALYSIS — CR-2026-10-08-001 Step 1
## Single diner identity path = `skip-otp` (minimal, before w/c 13 Oct)

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Based on:** Code inspection of `7oct` branch + INTAKE_DOC.md + SESSION_HANDOVER_2026-10-08

---

## 1. What Step 1 must do (from INTAKE_DOC §3)

| # | Change |
|---|---|
| S1 | Landing: always call `silentSkipOtpAndNavigate` — remove the `skipOtp*` gate entirely |
| S2 | `/password-setup` route → redirect to `/<rid>` (make the page unreachable from old links) |
| S3 | 409 from `skip-otp` → toast error, stay on landing (no fallback to password-setup) |
| S4 | 429 + `Retry-After` → wait-time toast, stay on landing (folds CR-2026-09-15-002) |

**Out of scope for Step 1:** deleting `PasswordSetup.jsx`, `otpPolicy.js`, `crmRegister`/`crmLogin`, retiring `skipOtp*` from server.py/contexts/admin — all Step 2.

---

## 2. Code reality — where the gate lives today

### 2a. The gate in `LandingPage.jsx` (lines 630–710)

```
handleDiningMenuClick()
  └─ POST /api/auth/check-customer (debounced background fetch)
  └─ pickOtpFlag({ selectedMode, scannedOrderType, scannedRoomOrTable, scannedTableId })
     → returns one of: skipOtpDineIn | skipOtpTakeaway | skipOtpDineInWithTable |
                       skipOtpWalkIn | skipOtpRoomOrders | skipOtpDelivery
  └─ shouldShowOtpPage(flagName, { skipOtp* from RestaurantConfigContext })
     → returns TRUE unless config[flagName] === true (explicit boolean)
  └─ if mustShowOtpPage === true  → navigate('/:rid/password-setup', { state })
     if mustShowOtpPage === false → silentSkipOtpAndNavigate(...)
```

**Step 1 change:** Delete the `mustShowOtpPage` gate. Always call `silentSkipOtpAndNavigate`. Both branches (`data.exists` and `!data.exists`) are affected — they have the identical pattern.

### 2b. `silentSkipOtpAndNavigate` — 409 handler today (lines 474–488)

```javascript
if (status === 409) {
  navigate(`/${rid}/password-setup`, { state: { ... } });  // ← MUST CHANGE
  return;
}
```

**Step 1 change:** Replace with `toast.error(...)` + `return` (stay on landing). The destination that the 409 was routing to is the page we are making unreachable.

### 2c. `silentSkipOtpAndNavigate` — 429 exhausted path today (lines 496–501)

```javascript
// Retries exhausted, transport error, 5xx, 429 etc → degraded guest
logger.order(`[crmSkipOtp] retries exhausted ... — degrading to guest`);
const guestData = { ... };
localStorage.setItem('guestCustomer', JSON.stringify(guestData));
toast('Continuing as guest');
navigateAfterSkip();
```

**Step 1 change (CR-2026-09-15-002 fold):** When `status === 429`, extract `err.retryAfterMs` (already set by `crmService.js:136-142` from the `Retry-After` header), show a wait-time toast, and **stay on landing** (do NOT navigate as guest). For other exhausted errors, the current degraded-guest path is unchanged.

`crmSkipOtpRetry.js` already retries 429 up to 3 times honouring `Retry-After`. This change only affects what the caller does when all 3 retries fail.

### 2d. NEW CODE FINDING — Delivery path bug (D3 related)

**Present in code today, masked by the gate:**

```javascript
// silentSkipOtpAndNavigate — navigateAfterSkip closure (lines 443–458)
const navigateAfterSkip = () => {
  if (orderMode === 'delivery' && !isAuthenticated) {
    toast.error('Please login to use delivery');  // ← fires even after successful skip-otp
    return;
  }
  ...
};

// Success path (lines 461–471):
const result = await crmSkipOtpWithRetry(phone, userId);
if (result?.token) {
  setCrmAuth(result.token, customerProfile, rid);  // React setState — async
}
navigateAfterSkip();   // isAuthenticated is STILL FALSE in this closure snapshot
```

`setCrmAuth` is a React state setter. `isAuthenticated` in the `navigateAfterSkip` closure is the value from the **current render**, which is `false`. The state update does not flush before `navigateAfterSkip()` runs. So for any delivery order where skip-otp succeeds, the current code shows "Please login to use delivery" and does **not** navigate — the token is obtained but the diner is stuck.

**This bug exists today** for restaurants with `skipOtpDelivery=true`. Step 1 promotes every restaurant to this code path, making the bug universal.

**Fix:** Pass `hasJustAuthenticated` (derived from `result?.token`) into `navigateAfterSkip` as a parameter. The check becomes:
```javascript
if (orderMode === 'delivery' && !hasJustAuthenticated && !isAuthenticated) { ... }
```
This is the correct resolution of D3 ("is the token enough for delivery?" → yes, when we pass it correctly).

### 2e. `App.js` — password-setup route (line 85)

```javascript
<Route path="/:restaurantId/password-setup" element={<PasswordSetup />} />
```

**Step 1 change:** Replace `element={<PasswordSetup />}` with a redirect:
```javascript
<Route path="/:restaurantId/password-setup" element={<Navigate to={`/${restaurantId}`} replace />} />
```
This renders a `<Navigate>` component using the `:restaurantId` param. The correct pattern uses `useParams` inside a small wrapper or relies on `<Route>` render props. See Implementation Plan for exact pattern.

### 2f. `crmSkipOtpRetry.js` — no change needed

- 409 already in `NON_RETRIABLE_BUBBLE` → bubbles immediately to caller. ✅
- 429 already in `RETRIABLE` → retries up to 3× with Retry-After. ✅
- The 429-exhausted toast is added in the **caller** (LandingPage), not here.

### 2g. Admin toggles — already hidden, no change

`AdminVisibilityPage.jsx` lines 102–117: the entire skipOtp admin section is already inside a `{/* ... */}` comment block (OTP-DEFERRED marker). No change needed.

---

## 3. Files WILL change — Step 1

| File | What changes |
|---|---|
| `frontend/src/pages/LandingPage.jsx` | (a) Remove `pickOtpFlag`/`shouldShowOtpPage`/`mustShowOtpPage` gate from `handleDiningMenuClick`; both `data.exists` and `!data.exists` branches always call `silentSkipOtpAndNavigate`. (b) In `silentSkipOtpAndNavigate`: 409 → toast + stay on landing. (c) In `silentSkipOtpAndNavigate`: 429 exhausted → wait-time toast + stay on landing. (d) Fix delivery path: `navigateAfterSkip` takes `hasJustAuthenticated` param. |
| `frontend/src/App.js` | Replace `<Route path="/:restaurantId/password-setup" element={<PasswordSetup />} />` with a redirect wrapper. |

**Line count estimate:** ~30 lines changed / removed across 2 files.

---

## 4. Files WILL NOT change — Step 1

| File | Why untouched |
|---|---|
| `frontend/src/pages/PasswordSetup.jsx` | Still exists and still reachable via direct state injection if needed; deleted in Step 2 |
| `frontend/src/utils/otpPolicy.js` | Import removed from LandingPage; file kept for Step 2 cleanup |
| `frontend/src/api/services/crmService.js` | `crmRegister`/`crmLogin` untouched; `crmSkipOtp` already correct |
| `frontend/src/api/services/crmSkipOtpRetry.js` | No logic change; 409/429 already handled correctly at retry level |
| `frontend/src/context/RestaurantConfigContext.jsx` | `skipOtp*` fields still present; Step 2 removes |
| `frontend/src/context/AuthContext.jsx` | No change; `setCrmAuth` called as today |
| `frontend/src/context/AdminConfigContext.jsx` | No change |
| `frontend/src/pages/admin/AdminVisibilityPage.jsx` | skipOtp section already commented out |
| `backend/server.py` | No change; `skipOtp*` fields remain in config model for Step 2 |

---

## 5. Downstream consumers / regression scope

| Consumer | Impact |
|---|---|
| Every restaurant where `skipOtp*` was **false** (e.g. 478) | ✅ Now get `skip-otp` silently — no more password page |
| Every restaurant where `skipOtp*` was **true** | ✅ No change — already called `silentSkipOtpAndNavigate` |
| Delivery mode at any restaurant | ✅ Fixed — `hasJustAuthenticated` fix makes delivery navigate correctly after `skip-otp` |
| `/:restaurantId/password-setup` direct/bookmarked URL | ✅ Redirects to `/:restaurantId` landing |
| `PasswordSetup.handleSkip` (existing "Skip for now" button) | ✅ Unaffected — still calls `crmSkipOtp` directly; page is unreachable from landing but not deleted |
| `ReviewOrder.jsx` | ✅ Unaffected — reads `isAuthenticated`/CRM token from AuthContext; those set correctly |
| `CartContext` | ✅ Unaffected |
| Admin login (`/login`) | ✅ Unaffected — different auth path entirely |

---

## 6. Owner decisions — confirm before Gate 3

| Decision | Question | Recommendation | Status |
|---|---|---|---|
| D1 | Two steps (Step 1 minimal now, Step 2 cleanup after CR-098 CONFIRMED) vs one shot? | Two steps ✅ | Owner settled 2026-10-08 per handover §2 |
| D2 | Leave `skipOtp*` fields in DB documents (ignored) or propose field drop to DevOps now? | Leave — drop with contract v2 | Owner settled 2026-10-08 per handover §2 |
| **D3** | Delivery path: token from `skip-otp` sufficient for delivery navigation? | **YES** — Fix `navigateAfterSkip` to use `hasJustAuthenticated` | **Needs explicit confirmation; code finding above shows current bug** |
| **D4** | 409 from `skip-otp`: toast text? Suggest: _"Could not continue. Please try again."_ | Use generic message (phone lock is a CRM-internal state, not user-actionable) | **New — needs owner confirmation** |

---

## 7. Risk

| Area | Rating | Reason |
|---|---|---|
| Overall | **HIGH** | Hotspot files; every diner sign-in path at every restaurant |
| `LandingPage.jsx` | HIGH | Project addendum §6.7 hotspot; changing the sign-in entry branch |
| `App.js` | MEDIUM | Routing change; redirect must preserve `:restaurantId` param |
| Delivery fix | MEDIUM | Pre-existing bug fix — closes a failure mode that Step 1 would make universal |
| Regression scope | HIGH | §5.1 (auth) + §5.2 (order placement) regression mandatory |

No Fast Lane. No CRITICAL-level changes (no auth tokens changed, no payment, no DB write, no localStorage key renamed).

---

## 8. Verification matrix (for Implementation Plan)

| # | Test | Expected |
|---|---|---|
| T1 | Restaurant 478 (`skipOtp*` all false): phone + Browse Menu | Token obtained, navigate to menu — no password-setup |
| T2 | Restaurant with `skipOtpDineIn=true` (previously working): phone + Browse Menu | Unchanged — still navigates to menu |
| T3 | Navigate directly to `/:rid/password-setup` URL | Redirect to `/:rid` |
| T4 | `skip-otp` returns 409 | Toast error, stay on landing, no crash |
| T5 | `skip-otp` exhausts retries on 429 with Retry-After header | Wait-time toast ("try again in Xs"), stay on landing |
| T6 | Delivery mode + successful `skip-otp` | Navigate to `/:rid/delivery-address` (D3 fix) |
| T7 | Delivery mode + guest fallback (skip-otp fails → degraded) | "Please login to use delivery" toast (unchanged) |
| T8 | No phone captured + Browse Menu | Goes straight to menu (unchanged) |
| T9 | Authenticated user + Browse Menu | Goes straight to menu (unchanged) |
| T10 | `yarn build` | Clean (no new ESLint errors) |
| T11 | Smoke: BUG-2026-10-06-001 + CR-2026-10-03-003 flows unaffected | Both still pass |

---

## 9. Planning output

```
Planning complete: CR-2026-10-08-001 Step 1
Stage: Impact Analysis
Code reality: FULL — all 4 change sites confirmed with exact line numbers
Risk: HIGH
Files WILL change: LandingPage.jsx · App.js
Files WILL NOT touch: PasswordSetup.jsx · otpPolicy.js · crmService.js · crmSkipOtpRetry.js
                       RestaurantConfigContext.jsx · AuthContext.jsx · AdminConfigContext.jsx
                       AdminVisibilityPage.jsx · backend/server.py
Owner decisions:
  D1 = two steps (settled 2026-10-08)
  D2 = leave skipOtp* in DB (settled 2026-10-08)
  D3 = CONFIRM: token sufficient for delivery? (code finding: current bug exposed by Step 1)
  D4 = CONFIRM: 409 toast text
Docs: memory/change_requests/CR-2026-10-08-001-single-identity-path-skip-otp/IMPACT_ANALYSIS.md
Next: Owner confirms D3 + D4 → "Gate 2 accepted for CR-2026-10-08-001" → Implementation Plan
```
