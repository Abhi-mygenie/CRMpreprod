# INTAKE DOC — CR-2026-10-07-002

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-07-002 |
| **Title** | Permanently delete the OTP-DEFERRED code (31 markers, 8 files) and retire the "restore when live" condition of CR-2026-09-14-001; confirm to CRM (CR-084) on exit |
| **Classification** | **CR** — dead-code removal following an upstream decision (CRM CR-084 / CR-090: OTP will never exist) |
| **Date Registered** | 2026-10-07 |
| **Reported By** | Owner, on reading `inbox/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS_2026-10-07.md` — "we are removing entire otp process … we will register new CR … we will delete and confirm CRM" |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Priority** | P2 |
| **Risk** | **LOW** in logic (everything removed is already commented out or throws) · **process HIGH** because 3 of the 8 files are hotspots (`server.py` CRITICAL, `AuthContext.jsx`, `PasswordSetup.jsx`) — minimum regression §5.1 (customer login/skip-otp) + §5.2 (order placement) applies |
| **Status** | 📝 REGISTERED (Role 1 done) — needs Planning |
| **Supersedes** | the exit condition of **CR-2026-09-14-001** ("Restore when live"). That CR stays SMOKE/CLOSED as the quarantine; this CR is the burial |

## 1. In one sentence

CR-2026-09-14-001 quarantined the OTP path "until CRM SMS goes live"; CRM has now deleted its OTP
routes (404) and closed OTP delivery as never-to-be-built, so the quarantined code can never be
restored and should be deleted outright.

## 2. Evidence — read from source this session

`grep -rn "OTP-DEFERRED"` → **31 markers in 8 files**:

| File | Markers | What is behind them |
|---|---|---|
| `frontend/src/api/services/crmService.js` | 8 (`:291-373`) | `crmSendOtp`, `crmVerifyOtp`, `crmForgotPassword`, `crmResetPassword` — each throws `OTP-DEFERRED`, original body in comment. Their CRM targets are now **404** (CR-084) or never existed in v2 |
| `frontend/src/pages/PasswordSetup.jsx` | 11 (`:5-373`) | commented imports, `handleLoginVerifyOtp`, `handleSendOtp`, `handleResetPassword`, resend timer, 'choose'/'otp' auth states, two "Use OTP instead" buttons |
| `frontend/src/context/AuthContext.jsx` | 2 (`:213, :227`) | `sendOTP` helper + its context export |
| `frontend/src/components/AdminSettings/VisibilityTab.jsx` | 1 (`:122`) | commented `auth` sub-tab (otpRequired* toggles) |
| `frontend/src/pages/admin/AdminVisibilityPage.jsx` | 1 (`:102`) | same, admin page variant |
| `backend/server.py` | 7 (`:115, :254, :398, :470, :560, :770, :1158`) | `OTPRequest` model, `otpRequired*` model fields, `otp_store`/`generate_otp`/`verify_otp`, `POST /auth/send-otp`, OTP branch in login, `POST /auth/reset-password`, `otpRequired*` defaults |
| — | — | **Not quarantined, still live:** `skipOtp*` config flags (`server.py:261-266`, `LandingPage.jsx`, `pickOtpFlag`/`shouldShowOtpPage`) — these gate the **password page**, not OTP. See §4 |

Upstream facts (CRM wave log, 2026-10-08 rows): `POST /scan/auth/request-otp` + `verify-otp` → 404 (CR-084, CONFIRMED). CR-090 closed OBSOLETE: "CRM will not build an OTP delivery channel or customer password reset." Unchanged: `skip-otp`, `register`, `login`.

## 3. Scope (for Planning to confirm)

**In:** delete every block behind the 31 markers; delete the four dead `crmService` exports and any import of them; remove the `sendOTP` remnants from `AuthContext`; remove the commented admin `auth` sub-tab; update contract v1.0 row (line 126) from "quarantined" to "removed both sides"; **exit step: owner sends a confirmation note to CRM for CR-084** ("no residual calls; code deleted; evidence").

**Out (explicitly):** the live `skipOtp*` config flags and the `/password-setup` page itself. Renaming or defaulting those is a product/identity decision — owner has chosen to **ask CRM for validation first** (see `inbox/OUTBOUND_DRAFT_CRM_QUESTIONS_2026-10-07.md`). Changing config keys is HIGH-risk per addendum (config write-lock, OD-7) and would be its own CR.

## 4. Why `skipOtp*` stays untouched here

The flags are read by `LandingPage.jsx` (`pickOtpFlag` → `shouldShowOtpPage`) to decide "silent `skip-otp` login" vs "show the password page". They are live config at 13 restaurants. Their *name* is now misleading, their *behaviour* is not. Mixing a rename into a dead-code deletion would turn a LOW-logic CR into a config migration.

## 5. Acceptance (draft for Planning)

1. `grep -rn "OTP-DEFERRED\|send-otp\|verify-otp\|request-otp\|otp_store\|generate_otp" frontend/src backend/` → 0.
2. `yarn build` clean; pytest smoke + contract clean (public-config snapshot must not change — `otpRequired*` were already out of defaults).
3. §5.1 regression: landing phone → password page (skipOtp off) and silent login (skipOtp on) both unchanged; admin login unchanged.
4. Contract v1.0 row updated; CRM confirmation note drafted for owner.
5. CR-2026-09-14-001 `notes` gets "superseded by CR-2026-10-07-002 — restoration impossible (CRM CR-090)".

## 6. Owner decision needed at Planning

- D1: delete the commented admin `auth` sub-tab entirely, or leave the panel shell for a future "identity" tab? (rec: delete)

```text
Intake complete: CR-2026-10-07-002
Classification: CR · P2 · LOW logic / HIGH process (hotspot files)
Supersedes: exit condition of CR-2026-09-14-001
Blocked on: none to start
Related: CR-2026-09-14-001 · CR-2026-10-07-001 · CRM CR-084, CR-090
Next: Planning (Role 2) on owner instruction
```
