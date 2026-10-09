# INTAKE DOC — CR-2026-09-15-002

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-15-002 |
| **Title** | Remove dead `skip-otp` 409 / 429 / `Retry-After` handling (CRM never emits them) — OD-3 = accept behaviour |
| **Classification** | CLEANUP (dead code) |
| **Date Registered** | 2026-09-15 |
| **Reported By** | INV-2026-09-15-001 gap **G7**; owner decision **OD-3: accept** that skip-otp logs in password customers without password |
| **Severity** | P3 |
| **Risk** | **HIGH** by file — `LandingPage.jsx` is an addendum §6.7 hotspot (customer entry). Logic removal only, but no Fast Lane. |
| **Status** | 📝 REGISTERED (Role 1 done) — **PARKED** behind CR-2026-09-15-001; schedule with CR-2026-09-12-013 (landing decomposition) if that lands first |
| **Parent** | CR-2026-09-12-001 (Wave 2) |
| **Blast radius** | SMALL — 2 FE files, one code path (customer capture → skip-otp) |

## 1. Problem (code truth)
- `LandingPage.jsx:474-486`: `status === 409` → navigate to `/password-setup`. CRM contract §1.1: skip-otp **never returns 409**. Dead branch; the "phone locked to OTP" (Q1=b) design no longer exists.
- `crmSkipOtpRetry.js:25-26,60-61`: treats 429 as retriable and honours `retryAfterMs`. CRM: **no rate limit, no `Retry-After`** on skip-otp. Retry loop still useful for 5xx/network → **keep the wrapper**, remove only 409/429-specific comments and `retryAfterMs` handling (or keep as harmless; Planning decides).
- `crmService.js:136-144` `Retry-After` parsing in `crmFetch` is generic (also used by CRM OTP 429) → **out of scope**.

## 2. Scope
IN: delete/simplify the 409 branch in `LandingPage.jsx`; update comments in `crmSkipOtpRetry.js`; update `PasswordSetup.jsx` navigation-state contract if the 409 branch was its only producer of `hasPassword` (verify in Planning).
OUT: any change to CRM; any new guard on skip-otp (owner accepted risk); `crmFetch` Retry-After parsing.

## 3. Duplicate check
| Item | Verdict |
|---|---|
| CR-2026-05-30-001 (built the retry wrapper) | RELATED — this trims it |
| CR-2026-09-12-013 (landing/delivery/ordersuccess decomposition) | RELATED — same file; sequence to avoid conflict |
| CR-2026-09-14-001 (OTP quarantine) | DISTINCT |

## 4. Code exists? FULL (removal only).

## 5. Files
Will change: `frontend/src/pages/LandingPage.jsx`, `frontend/src/api/services/crmSkipOtpRetry.js` (+ possibly `PasswordSetup.jsx` state contract).
Will NOT touch: `crmService.js`, `AuthContext.jsx`, backend.

## 6. Security note recorded (owner-accepted)
Anyone with a phone number + restaurant_id obtains a 24 h customer token for that phone via skip-otp, including for customers who set a password. **Owner accepted this risk on 2026-09-15 (OD-3).** Revisit if CRM ships P-4.

```text
Intake complete: CR-2026-09-15-002
Classification: CLEANUP
Severity: P3
Risk: HIGH (hotspot file), logic removal only
Duplicate check: RELATED (CR-2026-05-30-001, CR-2026-09-12-013) — DISTINCT
Evidence: captured (CRM contract §1.1, code refs)
Blast radius: SMALL
Docs updated: this file, ../README.md
Next: Planning — after CR-2026-09-15-001; coordinate with CR-013
```
