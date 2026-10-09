# IMPACT ANALYSIS — CR-2026-09-14-001
# Comment out broken OTP SMS path — frontend, backend, admin config

**Role:** Planning (Role 2) — Impact Analysis
**Date:** 2026-09-14
**Risk:** LOW — comment-out only, fully reversible
**Follows Alpha v0.1 §8 Role 2 output contract.**

---

## 0. Code reality verification

All 8 files inspected on 2026-09-14. Key findings that deviate from the intake doc:

| Finding | Impact on scope |
|---|---|
| `forgotMode` flow in PasswordSetup.jsx is already dead — `setForgotMode(true)` is NEVER called. Line 687 already replaced the "Forgot password?" button with `toast('Password reset coming soon')`. | `handleSendOtp`, `handleResetPassword`, `forgotMode` state, `otp`/`otpSent`/`sendingOtp`/`devOtp` state vars, and the entire `forgotMode` render block (lines 294–376) are ALL unreachable dead code. |
| UX-GAP-01 `useEffect` (lines 112–119) auto-routes away from `authMethod='choose'` on mount. `customerExists=true+hasPassword=true` → 'password'; `customerExists=true+hasPassword=false` → 'set-password'. New customers (`isNewCustomer=true`) hit the new-customer block before reaching 'choose'. | State A ('choose') showing "Login with OTP" as primary button is practically unreachable via normal LandingPage flow. Still exists in code and must be commented. |
| State A2 ('set-password', line 483) has "Use OTP instead" link (line 549) going to `setAuthMethod('choose')` | Must be commented — leads to broken OTP path |
| State C ('password', line 642) has "Use OTP instead" link (line 699) going to `setAuthMethod('choose')` | Must be commented — same reason |
| `crmForgotPassword` and `crmResetPassword` already have v2 console warnings in crmService.js ("HELD ON v1") | Confirms broken status. Still need to be commented per scope. |

---

## 1. Files that WILL change (exact list)

| # | File | Change type | Risk |
|---|---|---|---|
| 1 | `frontend/src/pages/PasswordSetup.jsx` | Comment out OTP + dead forgot-password code | LOW |
| 2 | `frontend/src/api/services/crmService.js` | Comment out 4 function bodies | LOW |
| 3 | `frontend/src/context/AuthContext.jsx` | Comment out `sendOTP()` body | LOW |
| 4 | `frontend/src/pages/admin/AdminVisibilityPage.jsx` | Comment out skipOtp* admin section | LOW |
| 5 | `frontend/src/components/AdminSettings/VisibilityTab.jsx` | Comment out otpRequired* toggle rows | LOW |
| 6 | `backend/server.py` | Comment out otp_store, functions, endpoint, model, config fields | LOW |
| 7 | `backend/tests/smoke/test_auth_flows.py` | Comment out `test_smoke_otp_echo_present` | LOW |
| 8 | `backend/tests/contracts/__snapshots__/test_config_nonexistent_defaults.json` | Regen — otpRequired* keys removed from backend model | LOW |

---

## 2. Files that WILL NOT be touched (scope lock)

- `frontend/src/api/services/crmSkipOtpRetry.js` — working frictionless path
- `frontend/src/utils/otpPolicy.js` — evaluates `skipOtp*` for /password-setup gate
- `frontend/src/context/RestaurantConfigContext.jsx` — `skipOtp*` defaults and normalisation
- `frontend/src/context/AdminConfigContext.jsx` — `skipOtp*` defaults
- `frontend/src/pages/LandingPage.jsx` — `silentSkipOtpAndNavigate`, `mustShowOtpPage` logic
- `frontend/src/pages/PasswordSetup.jsx` — password login, set-password, skip-for-now, `handleSkip`, `handleLogin`, `handleSetPassword`
- `backend/server.py` — `skipOtp*` fields in config model (lines 259–264)
- All 7 backend test files (except `test_smoke_otp_echo_present`)
- All contract snapshots except `test_config_nonexistent_defaults.json`
- `.env` files, `package.json`, `requirements.txt`
- `.emergent/*`

---

## 3. Detailed change map per file

### File 1 — `frontend/src/pages/PasswordSetup.jsx` (712 lines)

**Import line (line 5) — partial comment:**
```js
// BEFORE:
import { crmRegister, crmLogin, crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp, crmSkipOtp, buildUserId } from '../api/services/crmService';

// AFTER (keep working imports, comment broken ones):
import { crmRegister, crmLogin, /* OTP-DEFERRED CR-2026-09-14-001: crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp, */ crmSkipOtp, buildUserId } from '../api/services/crmService';
```

**State vars to comment out (lines 32–46):**
- `forgotMode`, `otp`, `otpSent`, `sendingOtp`, `devOtp` (forgot-password — dead)
- `otpDigits`, `otpLoginSent`, `otpLoginSending`, `otpLoginDevOtp`, `resendTimer`, `resendIntervalRef` (OTP login)

**Timer cleanup `useEffect` (lines 100–105):** Comment out (only used by resend timer)

**Handlers to comment out:**
- `handleLoginSendOtp` (lines 122–145)
- `handleLoginVerifyOtp` (lines 147–174)
- `handleResendOtp` (lines 176–183)
- `startResendTimer` (lines 84–98)
- `handleSendOtp` (lines 244–259) — forgot-password, already dead
- `handleResetPassword` (lines 261–292) — forgot-password, already dead

**Render blocks to comment out:**
- `forgotMode` render block (lines 294–376) — already dead, confirm by commenting
- State A ('choose') render block (lines 447–481) — entire block: "Login with OTP" as primary button
- State B ('otp') render block (lines 562–640) — OTP entry screen
- "Use OTP instead" link in State A2 (lines 546–551)
- "Use OTP instead" link in State C (lines 695–700)

**UX change after commenting:**
- Existing customer WITH password → State C (password login) — same as today ✅
- Existing customer WITHOUT password → State A2 (set-password) — same as today ✅
- New customer → new-customer block (set password / skip) — same as today ✅
- **The only difference:** customers can no longer choose OTP login or forgot-password. They can still "Skip for now" on every remaining screen. ✅

---

### File 2 — `frontend/src/api/services/crmService.js`

Comment out the **bodies** of 4 functions with markup. Keep the export signature so any stray import doesn't cause a build error.

```js
// OTP-DEFERRED: CR-2026-09-14-001 — CRM SMS not in production. Uncomment when live.
export const crmSendOtp = async (phone, userId, countryCode = '91') => {
  /* OTP-DEFERRED CR-2026-09-14-001
  ... existing body ...
  */
  throw new Error('OTP-DEFERRED: crmSendOtp disabled — see CR-2026-09-14-001');
};
```

Same pattern for: `crmVerifyOtp`, `crmForgotPassword`, `crmResetPassword`.

**Why keep the signatures:** The import in PasswordSetup.jsx will be commented out too, but keeping stubs prevents hard build failures if any stray reference is missed.

---

### File 3 — `frontend/src/context/AuthContext.jsx`

Comment out `sendOTP()` body (lines 214–239). Already dead code — nothing calls it.

```js
// OTP-DEFERRED: CR-2026-09-14-001 — kept for signature compat only
const sendOTP = async (phone, restaurantContext = null) => {
  /* OTP-DEFERRED CR-2026-09-14-001 — unused, CRM SMS not in production
  ... existing body ...
  */
  throw new Error('OTP-DEFERRED: sendOTP disabled — see CR-2026-09-14-001');
};
```

---

### File 4 — `frontend/src/pages/admin/AdminVisibilityPage.jsx`

Comment out the entire "Skip OTP / Password Setup" section (lines 102–117).

```jsx
{/* OTP-DEFERRED: CR-2026-09-14-001 — skipOtp* admin toggles hidden until SMS is live
<div className="admin-section" data-testid="admin-section-skip-otp">
  ...6 ToggleSwitch items...
</div>
*/}
```

**Why comment, not delete:** The `skipOtp*` config flags still exist in the DB and are still read by `otpPolicy.js` / `crmSkipOtp` frictionless path. Admin just can't edit them via UI. Existing DB values remain in effect.

---

### File 5 — `frontend/src/components/AdminSettings/VisibilityTab.jsx`

Comment out the 5 `otpRequired*` toggle rows (lines 131–135). Already documented as LEGACY/DEAD.

```jsx
{/* OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* flags are legacy dead flags
<ToggleRow field="otpRequiredDineIn" ... />
...
*/}
```

---

### File 6 — `backend/server.py`

**6a. `otp_store` dict (line 385):**
```python
# OTP-DEFERRED: CR-2026-09-14-001
# otp_store = {}
```

**6b. `generate_otp()` function (lines 387–390):**
Comment out entire function with markup.

**6c. `verify_otp()` function (lines 392–401):**
Comment out entire function with markup.

**6d. `OTPRequest` Pydantic model (lines 114–117):**
Comment out entire model with markup.

**6e. `otp` field in `LoginRequest` (line 102):**
```python
# OTP-DEFERRED: CR-2026-09-14-001
# otp: Optional[str] = None
```

**6f. `POST /api/auth/send-otp` endpoint (lines 456–486):**
Comment out entire endpoint including decorator.

**6g. OTP branch in `unified_login()` (lines 557–568):**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — body.otp path disabled
# if body.otp:
#     phone = customer.get("phone")
#     if not verify_otp(phone, body.otp):
#         raise HTTPException(...)
# elif body.password:
# ... becomes just:
if body.password:
```

Wait — this branch needs careful surgical handling. The current code is:
```python
if body.otp:
    ...verify_otp...
elif body.password:
    ...verify_password...
else:
    raise HTTPException(...)
```
After commenting `body.otp` branch, becomes:
```python
# OTP-DEFERRED: CR-2026-09-14-001
# if body.otp: ... (commented)
if body.password:
    ...verify_password...
else:
    raise HTTPException(...)
```

**6h. `POST /api/auth/reset-password` endpoint (lines 743–777):**
Comment out entire endpoint including decorator.

**6i. `otpRequired*` fields in `RestaurantConfig` model (lines 253–257):**
Comment out all 5 fields with markup.

**6j. `otpRequired*` defaults in config fallback dict (lines 1163–1167):**
Comment out all 5 defaults with markup.

---

### File 7 — `backend/tests/smoke/test_auth_flows.py`

Comment out `test_smoke_otp_echo_present` (lines 20–37):

```python
# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/send-otp endpoint commented out.
# Restore this test when CR-003 is implemented.
# @pytest.mark.smoke
# def test_smoke_otp_echo_present(http_client): ...
```

**Effect on test count:** 22 tests → 21 tests. All 21 pass.

---

### File 8 — `backend/tests/contracts/__snapshots__/test_config_nonexistent_defaults.json`

After removing `otpRequired*` from the backend config model defaults, the `/api/config/9999` response will no longer include these 5 keys. Snapshot must be regenerated:
```bash
cd /app && pytest backend/tests/contracts/test_public_config.py::test_config_nonexistent_defaults -n 0 --snapshot-update
```

**Delta expected:** Removal of 5 keys from the snapshot JSON:
- `otpRequiredDineIn`
- `otpRequiredTakeaway`
- `otpRequiredDineInWithTable`
- `otpRequiredWalkIn`
- `otpRequiredRoomOrders`

No other snapshot files are affected.

---

## 4. Downstream consumer analysis

| Consumer | Effect |
|---|---|
| Customer login (password / set-password / skip) | ✅ ZERO — UX-GAP-01 routes directly to 'password' or 'set-password'; OTP path was practically unreachable anyway |
| Admin login | ✅ ZERO — uses `/api/auth/login` with password only |
| `crmSkipOtp()` frictionless path | ✅ ZERO — not touched |
| `otpPolicy.js` + `skipOtp*` LandingPage logic | ✅ ZERO — not touched; `mustShowOtpPage` still gates /password-setup correctly |
| Admin panel OTP toggles | ✅ HIDDEN but DB values unchanged; `skipOtp*` flags still applied at runtime |
| `/api/auth/reset-password` endpoint | Commented out — frontend never called it; zero customer impact |
| `LoginRequest.otp` field | Commented out — no caller sends it; admin login is password-only |
| `otpRequired*` in config API response | Removed from model — keys disappear from `/api/config/{id}` response; frontend RestaurantConfigContext already ignores them at runtime (documented as dead) |
| Contract snapshot for nonexistent restaurant | Needs regen (5 keys removed) — handled in §3 File 8 |
| CR-005 test suite | 21 tests remain; 1 commented (tripwire test for dead endpoint) |
| CR-2026-09-12-003 | Part A (echo removal) is now superseded by File 6 §6f (send-otp endpoint commented) |

---

## 5. Risk assessment

| Risk area | Level | Mitigation |
|---|---|---|
| Working customer path broken | **NONE** — UX-GAP-01 routes away from OTP before it renders | — |
| Build failure from import removal | LOW — crmService stubs remain; import commented | Verify `yarn build` compiles clean |
| Backend startup failure | LOW — verify_otp is called in 2 places; both commented atomically | Run backend + check `/api/healthz` |
| Snapshot drift | LOW — known 5-key removal; handled by targeted regen | `pytest --snapshot-update` |
| Reversibility | **ZERO risk** — every change is a comment with markup, not a deletion | `grep OTP-DEFERRED` finds everything |

**Overall risk: LOW**

---

## 6. Verification matrix (Role 3 must pass all before QA handover)

| ID | Test | How |
|---|---|---|
| VM-1 | Frontend compiles with 0 errors | `yarn build` (or webpack compiled in dev server logs) |
| VM-2 | `/478/password-setup` — existing customer with password → password login screen | Browser manual test |
| VM-3 | `/478/password-setup` — existing customer without password → set-password screen | Browser manual test |
| VM-4 | `/478/password-setup` — "Skip for now" works → navigates to menu | Browser manual test |
| VM-5 | No "Login with OTP" button visible anywhere on /password-setup | Browser manual test |
| VM-6 | No "Forgot Password" / "Use OTP instead" link visible | Browser manual test |
| VM-7 | Backend starts cleanly — no import errors | `tail -5 /var/log/supervisor/backend.err.log` → "Application startup complete." |
| VM-8 | `/api/healthz` → `{"ok":true,"mongo":"up"}` | `curl localhost:8001/api/healthz` |
| VM-9 | `/api/auth/send-otp` → 404 or 405 (endpoint commented out) | `curl -X POST localhost:8001/api/auth/send-otp` |
| VM-10 | `/api/auth/reset-password` → 404 or 405 | `curl -X POST localhost:8001/api/auth/reset-password` |
| VM-11 | Admin login still works | `curl POST /api/auth/login` with email + password → 200 |
| VM-12 | `pytest backend/tests/ -v` → 21 passed, 0 failed | `cd /app && pytest backend/tests/ -v` |
| VM-13 | `grep -rn "OTP-DEFERRED: CR-2026-09-14-001"` finds all 8 files | `grep -rn "OTP-DEFERRED" /app/frontend/src /app/backend` |
| VM-14 | `git diff --name-only` matches exactly the 8 files in §1 | `git -C /app diff --name-only` |

---

## 7. Owner decisions needed before Planning can close

None. All decisions made by owner during investigation session (2026-09-14):
- ✅ Approach: comment-out with markup (not deletion)
- ✅ Scope: full removal across all 8 files
- ✅ `skipOtp*` system is PRESERVED (working frictionless path)
- ✅ Wave 2 placement confirmed

---

## 8. Compact Planning output (Alpha v0.1 §8 Role 2)

```
Planning complete: CR-2026-09-14-001
Stage: Impact Analysis — WRITTEN 2026-09-14
Code reality: FULL (all 8 files inspected, line-level accuracy)
Risk: LOW (comment-out only, fully reversible, zero working path affected)
Files WILL change: 8
  1. frontend/src/pages/PasswordSetup.jsx
  2. frontend/src/api/services/crmService.js
  3. frontend/src/context/AuthContext.jsx
  4. frontend/src/pages/admin/AdminVisibilityPage.jsx
  5. frontend/src/components/AdminSettings/VisibilityTab.jsx
  6. backend/server.py
  7. backend/tests/smoke/test_auth_flows.py
  8. backend/tests/contracts/__snapshots__/test_config_nonexistent_defaults.json (regen)
Files WILL NOT touch: crmSkipOtpRetry.js, otpPolicy.js, LandingPage.jsx,
  RestaurantConfigContext.jsx, AdminConfigContext.jsx, all other backend routes,
  all other snapshots, .env files, skipOtp* fields in backend config model
Owner decisions: ALL supplied (2026-09-14 session)
Verification matrix: 14 checks (VM-1..VM-14)
Additional finding: forgotMode flow already dead (setForgotMode never called);
  State A ('choose') practically unreachable via UX-GAP-01 auto-routing
Next gate: OWNER APPROVAL REQUIRED for Role 3 (Implementation)
```

---

## OWNER APPROVAL GATE

```
OWNER APPROVAL REQUIRED
Reason: Impact Analysis complete. Ready for Role 3 (Implementation).
Risk: LOW
Proposed next step: Owner says "go" → Role 3 implements comment-out
                   in exact order across 8 files, then runs 14-check VM matrix.
Prerequisites: Wave 1a CLOSED (CR-004 QA + owner smoke) OR owner
               explicitly waives this prerequisite.
```
