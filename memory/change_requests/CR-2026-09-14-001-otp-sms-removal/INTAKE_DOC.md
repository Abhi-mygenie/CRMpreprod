# INTAKE DOC — CR-2026-09-14-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-14-001 |
| **Title** | Comment out broken OTP SMS path — frontend, backend, admin config |
| **Classification** | CR — Code quality / Dead-code quarantine |
| **Date Registered** | 2026-09-14 |
| **Reported By** | Owner — 2026-09-14 investigation session |
| **Severity** | **P2** — Not broken for customers (broken path is invisible unless tapped). No urgency but causes code confusion and test noise. |
| **Risk** | **LOW** — Comment-out only; no deletion; fully reversible by uncommenting. No working customer path is touched. |
| **Status** | 📝 REGISTERED — Role 1 INTAKE done |
| **Wave** | **Wave 2** — after Wave 1a QA closure |
| **Parent** | CR-2026-09-12-001 (Architecture Correction Programme) |
| **Blocks** | Nothing |
| **Blocked by** | Wave 1a must be fully CLOSED first (CR-004 QA + owner smoke) |

---

## 1. Problem

Investigation (Role 6, 2026-09-14) confirmed:

1. **CRM has no production SMS mode active.** `POST /scan/auth/request-otp` returns HTTP 200 but includes `dev_otp` in the response body, indicating the CRM is running in dev/test mode. No SMS is physically delivered to the phone.

2. **The broken UI is visible to customers.** On `/password-setup`, existing customers see a "Login with OTP" button and a "Forgot Password" link. Both call CRM paths that either don't send SMS or hit a 404 (v1 endpoint on v2 CRM).

3. **The backend `/api/auth/send-otp` endpoint is dead code.** The frontend never calls it. It generates an OTP, stores it in memory, and echoes it in the response — but no page triggers it.

4. **Admin config contains OTP-related toggles that control nothing useful.** `otpRequired*` flags (5) are documented as LEGACY/DEAD in the code. `skipOtp*` flags (6) control the working frictionless bypass (`crmSkipOtp`) — these are NOT part of this CR.

**Business impact:** Customers who tap "Login with OTP" or "Forgot Password" get a broken experience. Code is confusing for future developers. One test (`test_smoke_otp_echo_present`) is a noise-tripwire for a dead endpoint.

---

## 2. Approach — Comment-out with markup, NOT deletion

All broken OTP code will be **commented out** with a standard markup tag:

```
// OTP-DEFERRED: CR-2026-09-14-001 — SMS not working in production.
//               Uncomment when CRM production SMS is confirmed live.
```

This means:
- Code is fully reversible — uncomment to restore
- Git history stays clean
- Future developer immediately knows why it is commented and what CR owns it
- Cleanup (actual deletion) is a separate follow-up CR filed when SMS goes live

---

## 3. Scope

### IN — what gets commented out

#### Frontend — PasswordSetup.jsx
- "Login with OTP" button and click handler (`handleLoginSendOtp`)
- OTP entry screen (`authMethod === 'otp'` render block)
- Resend OTP button and countdown timer (`handleResendOtp`, `resendTimer`)
- "Forgot Password" link and handlers (`handleForgotPassword`, `handleResetPassword`)
- Related state vars: `otpDigits`, `otpLoginSent`, `otpLoginSending`, `otpLoginDevOtp`, `resendTimer`
- Imports no longer needed: `crmForgotPassword`, `crmResetPassword`, `crmSendOtp`, `crmVerifyOtp`

#### Frontend — crmService.js
- `crmSendOtp()` function body — **keep the export signature, comment the implementation** (so import in PasswordSetup doesn't break if we forget to remove the import)
- `crmVerifyOtp()` function body
- `crmForgotPassword()` function body
- `crmResetPassword()` function body

#### Frontend — AuthContext.jsx
- `sendOTP()` function body (already dead — comment for clarity)

#### Frontend — AdminVisibilityPage.jsx
- Entire "Skip OTP / Password Setup" section (6 `skipOtp*` toggles)
- **Note:** The `skipOtp*` flags in config are KEPT — they control the working `crmSkipOtp` frictionless path. Only the admin UI toggles for these flags are commented out (admin can't accidentally turn on a broken feature).

#### Frontend — VisibilityTab.jsx (legacy AdminSettings)
- 5 `otpRequired*` toggle rows (already legacy/dead)

#### Backend — server.py
- `otp_store = {}` dict
- `generate_otp()` function
- `verify_otp()` function
- `OTPRequest` Pydantic model
- `POST /api/auth/send-otp` entire endpoint
- `otp: Optional[str]` field in `LoginRequest`
- OTP branch inside `unified_login()` (`if body.otp:` block)
- `POST /api/auth/reset-password` entire endpoint
- `otpRequired*` fields from `RestaurantConfig` model
- `otpRequired*` default values in config fallback dict

#### Tests
- `test_smoke_otp_echo_present` — comment out entire test with markup note

### OUT — what is NOT touched

| Item | Reason |
|---|---|
| `crmSkipOtp()`, `crmSkipOtpRetry.js` | Working frictionless login — KEEP |
| `skipOtp*` flags in RestaurantConfigContext / AdminConfigContext | Drive working `crmSkipOtp` path — KEEP |
| `otpPolicy.js` (`pickOtpFlag`, `shouldShowOtpPage`) | Evaluates `skipOtp*` flags for /password-setup gate — KEEP |
| `LandingPage.jsx` — `silentSkipOtpAndNavigate`, `mustShowOtpPage` logic | Working bypass path — KEEP |
| PasswordSetup.jsx — password login, set-password, skip-for-now | All working — KEEP |
| `skipOtp*` fields in backend config model + DB | Config storage for working feature — KEEP |
| AdminVisibilityPage — all non-OTP sections | Untouched |
| All 21 remaining backend tests | Untouched |
| Contract snapshots | May need `otpRequired*` keys removed — regen after backend model change |

---

## 4. Duplicate check

| Related item | Relationship |
|---|---|
| CR-2026-09-12-003 (OTP echo removal) | Re-scoped 2026-09-14 — Part A (delete `otp_for_testing`) now covered by this CR's backend scope. Parts B+C (Mongo store) remain deferred. This CR supersedes CR-003 Part A. |
| CR-2026-09-12-017 (CRM SMS wiring) | Cancelled 2026-09-14 — premise invalid. This CR makes the cancellation visible in code. |

**Verdict: DISTINCT** — first CR to quarantine the broken SMS path. Supersedes CR-003 Part A.

---

## 5. Blast radius

**SMALL.** No working customer path is affected.

| Consumer | Effect |
|---|---|
| Customer login (password / set-password / skip) | ✅ Zero |
| Admin login | ✅ Zero |
| Order placement, menu, cart | ✅ Zero |
| `crmSkipOtp` frictionless path | ✅ Zero — not touched |
| `skipOtp*` admin config | ✅ Zero — toggles hidden but flags still stored and read |
| Test suite | 21/22 tests unaffected; `test_smoke_otp_echo_present` commented out (was a tripwire, not a real test) |
| Contract snapshots | `otpRequired*` keys removed from snapshot after backend model change — 1 regen needed |

---

## 6. Evidence

| Fact | Source |
|---|---|
| CRM returns `dev_otp` in response — no SMS delivered | Live probe 2026-09-14, owner device test |
| `crmForgotPassword` / `crmResetPassword` return 404 on v2 CRM | Live probe 2026-09-14 |
| `AuthContext.sendOTP()` never called by any page | `grep -rn "sendOTP"` → 0 callers |
| `crmSendOtp` / `crmVerifyOtp` called only from PasswordSetup.jsx | `grep -rn "crmSendOtp|crmVerifyOtp"` → 1 file |
| Backend `/api/auth/send-otp` never called by frontend | Full codebase grep confirms |
| `otpRequired*` flags documented as "LEGACY — DEAD FLAGS" in RestaurantConfigContext.jsx | Line 114 |
| `skipOtp*` flags drive working `crmSkipOtp()` path — separate system | LandingPage.jsx + investigation |

---

## 7. Files that WILL change (complete list for Planning)

| # | File | Action |
|---|---|---|
| 1 | `frontend/src/pages/PasswordSetup.jsx` | Comment out OTP + ForgotPassword UI and handlers |
| 2 | `frontend/src/api/services/crmService.js` | Comment out 4 function bodies |
| 3 | `frontend/src/context/AuthContext.jsx` | Comment out `sendOTP()` body |
| 4 | `frontend/src/pages/admin/AdminVisibilityPage.jsx` | Comment out skipOtp* toggle section |
| 5 | `frontend/src/components/AdminSettings/VisibilityTab.jsx` | Comment out otpRequired* toggle rows |
| 6 | `backend/server.py` | Comment out otp_store, generate_otp, verify_otp, OTPRequest, send-otp endpoint, otp field in LoginRequest, otp branch in unified_login, reset-password endpoint, otpRequired* in config model + defaults |
| 7 | `backend/tests/smoke/test_auth_flows.py` | Comment out `test_smoke_otp_echo_present` |
| 8 | `backend/tests/contracts/__snapshots__/test_config_nonexistent_defaults.json` | Regen after backend model change |

## 8. Files that WILL NOT be touched

- All `frontend/src/api/services/crmSkipOtpRetry.js`
- `frontend/src/utils/otpPolicy.js`
- `frontend/src/context/RestaurantConfigContext.jsx` (skipOtp* and all other flags stay)
- `frontend/src/context/AdminConfigContext.jsx` (skipOtp* stays)
- `frontend/src/pages/LandingPage.jsx`
- All other frontend pages and components
- `backend/server.py` — `skipOtp*` fields in config model

---

## 9. Exit criteria

CR closed when:
1. All items in §3 are commented out with `OTP-DEFERRED: CR-2026-09-14-001` markup
2. `pytest backend/tests/ -v` → 21 passed, 0 failed (`test_smoke_otp_echo_present` skipped/commented)
3. Frontend compiles with 0 errors
4. Customer can still: enter phone → password-setup → login with password / set password / skip-for-now
5. Admin can still: login, access admin panel, all non-OTP toggles work
6. `git diff --name-only` matches exactly the 8 files in §7

---

## 10. Compact Role 1 output

```
Intake complete: CR-2026-09-14-001
Classification: CR — Dead-code quarantine (comment-out)
Severity: P2
Risk: LOW (comment-out only, fully reversible)
Duplicate check: DISTINCT — supersedes CR-003 Part A
Evidence: captured (§6 — 7 code-truth facts from investigation)
Blast radius: SMALL — 0 working customer paths affected
Wave: 2
Docs updated: INTAKE_DOC.md, README.md, PRD.md
Next: Wave 1a CLOSED first → then Planning (Role 2) → Implementation (Role 3)
GATE DISCIPLINE: no plan, no code.
```
