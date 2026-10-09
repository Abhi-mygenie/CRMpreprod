# IMPLEMENTATION PLAN — CR-2026-10-08-001 Step 1
## Single diner identity path = `skip-otp` (minimal, before w/c 13 Oct)

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Gate:** Gate 2 accepted (D1–D4 all confirmed)  
**Risk:** HIGH  
**Files changing:** `frontend/src/pages/LandingPage.jsx` · `frontend/src/App.js`  
**Files NOT touched:** `PasswordSetup.jsx` · `otpPolicy.js` · `crmService.js` · `crmSkipOtpRetry.js` · `RestaurantConfigContext.jsx` · `AuthContext.jsx` · `AdminVisibilityPage.jsx` · `backend/server.py`

---

## Decisions locked

| D | Decision |
|---|---|
| D1 | Two steps — Step 1 minimal now, Step 2 cleanup after CR-098 CONFIRMED |
| D2 | Leave `skipOtp*` in DB documents (ignored); drop with contract v2 |
| D3 | Token from `skip-otp` is sufficient for delivery — fix `navigateAfterSkip` delivery guard |
| D4 | 409 from `skip-otp` → degrade to guest mode + proceed to menu (same as retry-exhausted path) |

---

## Edits — exact and ordered

### E1 · `LandingPage.jsx` line 17 — remove unused import

**Remove** the entire line:
```javascript
import { pickOtpFlag, shouldShowOtpPage } from '../utils/otpPolicy';
```
The file `otpPolicy.js` is NOT deleted (Step 2). Only the import in LandingPage is removed.

Code marker to add as comment on the line above where it was:
```javascript
// CR-2026-10-08-001 Step 1: otpPolicy gate removed — skip-otp is always called
```

---

### E2 · `LandingPage.jsx` line 43 — remove unused destructured config vars

The `useRestaurantConfig()` destructure is a long single line. Remove these 6 keys from it:
```
skipOtpDineIn, skipOtpTakeaway, skipOtpDineInWithTable, skipOtpWalkIn, skipOtpRoomOrders, skipOtpDelivery,
```

**Before (excerpt of line 43):**
```javascript
  const { fetchConfig, ..., skipOtpDineIn, skipOtpTakeaway, skipOtpDineInWithTable, skipOtpWalkIn, skipOtpRoomOrders, skipOtpDelivery, allowNonQrOrders,
```

**After:**
```javascript
  const { fetchConfig, ..., allowNonQrOrders,
```
(all other keys between `fetchConfig` and `allowNonQrOrders` are unchanged)

---

### E3 · `LandingPage.jsx` lines 443–459 — fix `navigateAfterSkip` signature (D3)

**Before:**
```javascript
    const navigateAfterSkip = () => {
      if (orderMode === 'delivery' && !isAuthenticated) {
        // setCrmAuth happens before this in success path; for guest fallback,
        // delivery still requires explicit login → keep current UX.
        toast.error('Please login to use delivery');
        return;
      }
      if (orderMode === 'delivery') {
        navigate(`/${rid}/delivery-address`);
        return;
      }
      if (isMultipleMenu(restaurant)) {
        navigate(`/${rid}/stations`);
      } else {
        navigate(`/${rid}/menu`);
      }
    };
```

**After:**
```javascript
    // CR-2026-10-08-001 Step 1: hasJustAuthenticated added (D3) — isAuthenticated is stale
    // at call time (React state not flushed yet); pass token result to unblock delivery.
    const navigateAfterSkip = ({ hasJustAuthenticated = false } = {}) => {
      if (orderMode === 'delivery' && !hasJustAuthenticated && !isAuthenticated) {
        toast.error('Please login to use delivery');
        return;
      }
      if (orderMode === 'delivery') {
        navigate(`/${rid}/delivery-address`);
        return;
      }
      if (isMultipleMenu(restaurant)) {
        navigate(`/${rid}/stations`);
      } else {
        navigate(`/${rid}/menu`);
      }
    };
```

---

### E4 · `LandingPage.jsx` line 471 — update success-path call to `navigateAfterSkip`

**Before:**
```javascript
      navigateAfterSkip();
```
(the call on line 471, inside the `try` block after `localStorage.setItem`)

**After:**
```javascript
      navigateAfterSkip({ hasJustAuthenticated: !!result?.token });
```

---

### E5 · `LandingPage.jsx` lines 474–488 — replace 409 handler (D4)

**Before:**
```javascript
      if (status === 409) {
        // Phone is locked to OTP — must use password-setup (Q1=b)
        logger.order('[crmSkipOtp] 409 — falling through to password-setup');
        navigate(`/${rid}/password-setup`, {
          state: {
            phone,
            name,
            restaurantId: rid,
            customerExists: !!data?.exists,
            hasPassword: data?.customer?.has_password || false,
            customerName: data?.customer?.name || '',
            orderMode,
          },
        });
        return;
      }
```

**After:**
```javascript
      if (status === 409) {
        // CR-2026-10-08-001 Step 1: password path removed (CRM CR-098).
        // Degrade to guest so diner can still order (D4).
        logger.order('[crmSkipOtp] 409 — password path removed, degrading to guest');
        const guestData = { name, phone, restaurantId: rid };
        localStorage.setItem('guestCustomer', JSON.stringify(guestData));
        toast('Continuing as guest');
        navigateAfterSkip({ hasJustAuthenticated: false });
        return;
      }
```

---

### E6 · `LandingPage.jsx` lines 496–501 — add 429 toast, update catch-all `navigateAfterSkip` call (CR-2026-09-15-002 fold)

**Before:**
```javascript
      // Retries exhausted, transport error, 5xx, 429 etc → degraded guest (D=b)
      logger.order(`[crmSkipOtp] retries exhausted (status=${status || 'network'}) — degrading to guest`);
      const guestData = { name, phone, restaurantId: rid };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
      toast('Continuing as guest');
      navigateAfterSkip();
```

**After:**
```javascript
      if (status === 429) {
        // CR-2026-09-15-002 (folded): 429 exhausted — show wait time, stay on landing
        const waitSecs = err?.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : 0;
        const msg = waitSecs > 0
          ? `Too many attempts. Please try again in ${waitSecs} seconds.`
          : 'Too many attempts. Please try again shortly.';
        logger.order(`[crmSkipOtp] 429 exhausted — staying on landing (retryAfterMs=${err?.retryAfterMs})`);
        toast.error(msg);
        return;
      }
      // Retries exhausted, transport error, 5xx → degraded guest (D=b)
      logger.order(`[crmSkipOtp] retries exhausted (status=${status || 'network'}) — degrading to guest`);
      const guestData = { name, phone, restaurantId: rid };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
      toast('Continuing as guest');
      navigateAfterSkip({ hasJustAuthenticated: false });
```

---

### E7 · `LandingPage.jsx` lines 630–709 — remove the `skipOtp*` gate, always call `silentSkipOtpAndNavigate`

This is the largest change. The entire block from the comment on line 630 to line 709 is replaced.

**Before (lines 630–709):**
```javascript
        // CR-2026-05-30-001 Item 1: gate the password-setup navigation.
        // If the matching skipOtp* flag is explicitly `true`, skip the
        // /password-setup screen and silently call crmSkipOtp to attach
        // CRM identity, then go straight to menu.
        //
        // selectedMode default is 'takeaway' (L148 useState init), which is a
        // UI-only state for the OrderModeSelector (only shown when the QR
        // carries orderType=takeaway|delivery i.e. isTakeawayDeliveryMode).
        // For a no-QR / dine-in landing we MUST NOT thread that UI default
        // into pickOtpFlag — doing so causes the gate to evaluate
        // `skipOtpTakeaway` instead of `skipOtpDineIn`, breaking Item 1.
        const otpFlagName = pickOtpFlag({
          selectedMode: isTakeawayDeliveryMode ? selectedMode : undefined,
          scannedOrderType,
          scannedRoomOrTable,
          scannedTableId,
        });
        const otpConfigSnapshot = {
          skipOtpDineIn,
          skipOtpTakeaway,
          skipOtpDineInWithTable,
          skipOtpWalkIn,
          skipOtpRoomOrders,
          skipOtpDelivery,
        };
        const mustShowOtpPage = shouldShowOtpPage(otpFlagName, otpConfigSnapshot);

        if (data.exists) {
          // Auto-populate name from lookup
          const customerName = data.customer?.name || '';
          if (customerName && !capturedName.trim()) {
            setCapturedName(customerName);
          }
          if (mustShowOtpPage) {
            // Navigate to password setup (today's path — unchanged)
            navigate(`/${actualRestaurantId}/password-setup`, {
              state: {
                phone: capturedPhone,
                name: capturedName || customerName,
                restaurantId: actualRestaurantId,
                customerExists: true,
                hasPassword: data.customer?.has_password || false,
                customerName: customerName,
                orderMode: selectedMode,
              },
            });
          } else {
            await silentSkipOtpAndNavigate({
              phone: capturedPhone,
              name: capturedName || customerName,
              data,
              restaurantId: actualRestaurantId,
              orderMode: selectedMode,
            });
          }
        } else {
          // New customer
          if (mustShowOtpPage) {
            // New customer → password setup (today's path — unchanged)
            navigate(`/${actualRestaurantId}/password-setup`, {
              state: {
                phone: capturedPhone,
                name: capturedName,
                restaurantId: actualRestaurantId,
                customerExists: false,
                hasPassword: false,
                customerName: '',
                orderMode: selectedMode,
              },
            });
          } else {
            await silentSkipOtpAndNavigate({
              phone: capturedPhone,
              name: capturedName,
              data: { exists: false, customer: null },
              restaurantId: actualRestaurantId,
              orderMode: selectedMode,
            });
          }
        }
```

**After:**
```javascript
        // CR-2026-10-08-001 Step 1: skipOtp* gate removed — skip-otp is always the identity path.
        // CRM CR-098 deleted register/login; password page is unreachable. All diners go through
        // silentSkipOtpAndNavigate regardless of per-restaurant skipOtp* config flags.
        if (data.exists) {
          const customerName = data.customer?.name || '';
          if (customerName && !capturedName.trim()) {
            setCapturedName(customerName);
          }
          await silentSkipOtpAndNavigate({
            phone: capturedPhone,
            name: capturedName || customerName,
            data,
            restaurantId: actualRestaurantId,
            orderMode: selectedMode,
          });
        } else {
          await silentSkipOtpAndNavigate({
            phone: capturedPhone,
            name: capturedName,
            data: { exists: false, customer: null },
            restaurantId: actualRestaurantId,
            orderMode: selectedMode,
          });
        }
```

---

### E8 · `App.js` — 4 sub-edits

#### E8a — Add `useParams` to react-router-dom import (line 2)

**Before:**
```javascript
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
```

**After:**
```javascript
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
```

#### E8b — Comment out `PasswordSetup` import (line 20)

**Before:**
```javascript
import PasswordSetup from './pages/PasswordSetup';
```

**After:**
```javascript
// CR-2026-10-08-001 Step 1: PasswordSetup unreachable from routing; deleted in Step 2
// import PasswordSetup from './pages/PasswordSetup';
```

#### E8c — Add `PasswordSetupRedirect` component

Add the following block **after the last import line** (after line 24 `DocumentTitleManager`) and **before the `// Admin Layout` comment block (line 26)**:

```javascript
// CR-2026-10-08-001 Step 1: redirect old /password-setup links to restaurant landing
const PasswordSetupRedirect = () => {
  const { restaurantId } = useParams();
  return <Navigate to={`/${restaurantId}`} replace />;
};
```

#### E8d — Replace `password-setup` route element (line 85)

**Before:**
```javascript
              <Route path="/:restaurantId/password-setup" element={<PasswordSetup />} />
```

**After:**
```javascript
              <Route path="/:restaurantId/password-setup" element={<PasswordSetupRedirect />} />
```

---

## Edit summary

| ID | File | Lines | What |
|---|---|---|---|
| E1 | `LandingPage.jsx` | 17 | Remove `pickOtpFlag, shouldShowOtpPage` import |
| E2 | `LandingPage.jsx` | 43 | Remove 6 `skipOtp*` vars from `useRestaurantConfig()` destructure |
| E3 | `LandingPage.jsx` | 443–459 | `navigateAfterSkip` accepts `{ hasJustAuthenticated }` param |
| E4 | `LandingPage.jsx` | 471 | Pass `hasJustAuthenticated: !!result?.token` to `navigateAfterSkip` |
| E5 | `LandingPage.jsx` | 474–488 | 409 handler → degrade to guest + proceed |
| E6 | `LandingPage.jsx` | 496–501 | Add 429 wait-time toast before degraded-guest block; update `navigateAfterSkip` call |
| E7 | `LandingPage.jsx` | 630–709 | Remove `mustShowOtpPage` gate; always call `silentSkipOtpAndNavigate` |
| E8a | `App.js` | 2 | Add `useParams` to react-router-dom import |
| E8b | `App.js` | 20 | Comment out `PasswordSetup` import |
| E8c | `App.js` | after 24 | Add `PasswordSetupRedirect` component |
| E8d | `App.js` | 85 | Change route element to `<PasswordSetupRedirect />` |

**Net lines changed/removed across 2 files: ~50 removed, ~25 added.**

---

## Self-test checklist (Role 3 must complete before QA handover)

| # | Test | How | Expected |
|---|---|---|---|
| ST1 | `yarn build` | `cd /app/frontend && yarn build` | Clean — no new ESLint errors or warnings |
| ST2 | Restaurant 478 (`skipOtp*` all false): phone + Browse Menu | Browser / curl | Token obtained, navigate to menu — no `/password-setup` |
| ST3 | Direct URL `/:rid/password-setup` | Browser | Redirect to `/:rid` |
| ST4 | Authenticated user + Browse Menu | Browser | Straight to menu (unchanged) |
| ST5 | No phone captured + Browse Menu | Browser | Straight to menu (unchanged) |
| ST6 | `grep -rn "pickOtpFlag\|shouldShowOtpPage\|mustShowOtpPage" frontend/src/pages/LandingPage.jsx` | bash | 0 results |
| ST7 | `grep -n "skipOtpDineIn\|skipOtpTakeaway" frontend/src/pages/LandingPage.jsx` | bash | 0 results |

---

## Code markers

Every changed block must carry:
```javascript
// CR-2026-10-08-001 Step 1: <brief reason>
```

---

## QA handover scope

QA must test:

| T | Scenario | Expected |
|---|---|---|
| T1 | Restaurant 478 (skipOtp* all false): phone → Browse Menu | Skip-otp fires silently; CRM token set; navigate to menu |
| T2 | Restaurant with `skipOtpDineIn=true` (was already working): same flow | Unchanged — still navigates to menu |
| T3 | Direct URL `/:rid/password-setup` (browser navigation bar) | Redirect to `/:rid` |
| T4 | Simulated 409 from skip-otp | Guest mode; "Continuing as guest" toast; navigate to menu |
| T5 | Simulated 429 exhausted from skip-otp with `Retry-After: 30` | Toast "Too many attempts. Please try again in 30 seconds."; stay on landing |
| T6 | Delivery mode + successful skip-otp | Navigate to `/:rid/delivery-address` |
| T7 | Delivery mode + skip-otp fails → guest fallback | "Please login to use delivery"; stay on landing |
| T8 | No phone + Browse Menu | Straight to menu (unchanged) |
| T9 | Authenticated user + Browse Menu | Straight to menu (unchanged) |
| T10 | `yarn build` | Clean |
| T11 | BUG-2026-10-06-001 smoke flow | Unaffected |
| T12 | CR-2026-10-03-003 smoke flow (feedback → CRM) | Unaffected |

---

## Registry update required (Role 3)

- `change_requests/index.yml`: CR-2026-10-08-001 status `INTAKE → IMPLEMENTATION`
- CR-2026-09-15-002: status `INTAKE → CLOSED` (folded into E6)

---

```
Planning complete: CR-2026-10-08-001 Step 1
Stage: Implementation Plan
Code reality: FULL — exact before/after for every edit
Risk: HIGH
Files WILL change: LandingPage.jsx (E1–E7) · App.js (E8a–E8d)
Files WILL NOT touch: 9 files listed above
Owner decisions: D1–D4 all confirmed
Docs: memory/change_requests/CR-2026-10-08-001-single-identity-path-skip-otp/IMPLEMENTATION_PLAN.md
Next: "Gate 3 accepted for CR-2026-10-08-001" → Role 3 Implementation
```
