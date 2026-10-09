# IMPACT ANALYSIS — CR-2026-09-12-003 (OTP echo removal + persistent throttled OTP store)

**Role:** Planning (Role 2) · Stage: Impact Analysis
**Date:** 2026-09-12 · **Parent:** CR-2026-09-12-001 (Wave 1)
**Severity:** P0 · **Risk:** CRITICAL (auth logic, `server.py` CRITICAL hotspot per Alpha v0.1 Part C)

> **⏸ STATUS UPDATE — 2026-09-13: DEFERRED TO WAVE 2**
> Owner decision (2026-09-13): Wave 1 split — this CR is Wave 1b → **Wave 2**.
> **Why it cannot proceed:** Removing `otp_for_testing` from the response without a working SMS path would break all customer logins immediately in production. CR-2026-09-12-017 (CRM SMS) must close first.
> CR-017 is itself blocked on owner-side regulatory prerequisites (DLT registration, CRM API contract, SMS template).
> **No further Planning or Implementation on this CR until CR-017 is CLOSED.**
> See `OWNER_DECISIONS_2026-09-12.md` addendum 2026-09-13.

## 1. Item registered

INTAKE_DOC.md present. GAP-003 mapped 1:1.

## 2. Code reality (2026-09-12)

| Fact | Source |
|---|---|
| `otp_store = {}` — in-memory dict, lost on restart, not multi-worker-safe | `server.py:366` |
| OTP write: `otp_store[phone] = {"otp": otp, "expires": ... +300}` — plaintext in memory | `server.py:370` |
| OTP verify: `stored = otp_store.get(phone)`; deletes on success or expiry | `server.py:373–385` |
| **THE LEAK** — response returns `{..., "otp_for_testing": otp}` | `server.py:466` |
| No attempt counter — unlimited guesses | `server.py:373–385` |
| `verify_otp()` helper is also used by password-reset (`/auth/reset-password`) | `server.py:743` |
| FE has separate `debug_otp` from CRM (out of scope — CRM-owned) | `PasswordSetup.jsx:130,250` |

## 3. Conflict check

| CR | Overlap | Verdict |
|---|---|---|
| CR-2026-09-12-004 (CORS + rate-limit) | Adds IP rate-limit on `/auth/*` (this CR adds phone-attempt limit — different key) | Complementary, not conflict |
| CR-2026-09-12-005 (contract snapshots) | Snapshots `POST /api/auth/send-otp` today expecting `otp_for_testing` key; **this CR intentionally breaks that snapshot** | Deliberate — the ordering (CR-005 first, then this) is correct per EXECUTION_PLAN Point 3 |
| CR-2026-09-12-010 (config defaults) | Unrelated | Distinct |

## 4. Risk verification

Intake said CRITICAL. **Concur** — touches `server.py` (CRITICAL per Part C), touches auth logic, contract-changing.

## 5. Files that WILL change

| # | Path | Change |
|---|---|---|
| 1 | `backend/server.py` | REMOVE `otp_for_testing` echo (line 466). REPLACE in-memory `otp_store` (line 366) with Mongo `otp_codes` collection ops. ADD attempt counter with 5-attempt cap → 429. ADD test-mode env-gated `OTP_TEST_MODE` that logs server-side only (never in response). |
| 2 | `backend/.env` + `backend/.env.example` | ADD `OTP_TEST_MODE=false` (default off). Doc key in `.env.example` (that file lands via CR-007 F-07). |
| 3 | **NEW Mongo collection** `otp_codes` | schema: `{phone, restaurant_id, otp_hash, expires_at, attempts, created_at}` + TTL index on `expires_at` |
| 4 | `backend/tests/smoke/test_auth_flows.py` (from CR-005) | UPDATE the `send-otp` smoke assertion — `otp_for_testing` MUST be absent |
| 5 | SMS-provider integration (only if D-OTP-new-provider chosen) | NEW `backend/sms_provider.py` + provider SDK dep in `requirements.txt` |

**Schema addition → Owner Decision 4 requires explicit approval** per OWNER_DECISIONS_2026-09-12.md.

## 5.1 Files that WILL NOT touch

- All frontend src (customer OTP UX unchanged — same shape response minus one key; front-end never USED `otp_for_testing` in customer path — testing agent did)
- `AuthContext.jsx`, `CartContext.js`, `ReviewOrder.jsx`, `RestaurantConfigContext.jsx` (all CRITICAL hotspots)
- CRM `debug_otp` path — CRM-owned, out of scope

## 6. Owner decisions — FROZEN 2026-09-12 (some deferred to next Planning gate)

| # | Decision | Owner answer |
|---|---|---|
| **Q1** | Is production live? | **P — production is LIVE with real customer logins.** No bypass acceptable. SMS delivery must be functional before ship. |
| **Q2-gate** | Any SMS provider must be fully documented + tested end-to-end before ship | **Confirmed as quality gate.** |
| **Q2-choice** | SMS delivery path | **(E) Reorder Wave 1** — finish CRM SMS integration as its own separate CR first; then CR-003 rides on top of a working CRM SMS. See §6.1 below. |
| **D-003-1** | SMS provider | Superseded by Q2-choice = E. Prereq CR delivers a working CRM SMS path; CR-003 then calls it from `send_otp()`. |
| **D-003-2** | SMS provider API key | Determined at prereq CR Planning. If CRM requires a key, add via `CRM_API_KEY` env var (already exists per `crmService.js`). |
| **D-003-3** | Store OTPs in Mongo `otp_codes`? | **still-approve** — Mongo storage with SHA-256 hash + salt + 5-min TTL + 3-attempt cap. Schema locked. |
| **D-003-4** | Attempt cap | **(b) 3 attempts** — stricter; more support noise accepted |
| **D-003-5** | Hash algorithm | **(a) SHA-256 with per-record salt** |
| **D-003-6** | `OTP_TEST_MODE` env-gated toggle | **approve** — log-only, never in response, default false in prod |
| **D-003-7** | Backward compat for in-flight OTPs at deploy | Not yet answered — defer to next Planning gate (owner directive: *"lot of things we will need to decide during this CR"*) |
| **A-1..A-7** | Design assumptions (OTP format/TTL/collection sharing/counter reset/429/alerting/snapshot regen) | **Deferred to next Planning gate** per owner directive |

## 6.1 Wave 1 reorder — new prereq CR required

Owner directive: *"E — Reorder Wave 1: finish CRM as its own CR first, then CR-003"*.

**Implication:**
- A new CR must be filed **before CR-003 can move to Implementation.**
- Provisional ID: **CR-2026-09-12-017** (016 already reserved for the dead-code deletion CR flagged by D-007-2)
- Provisional title: **"Finalize CRM SMS integration for OTP delivery (customer login path)"**
- Scope of prereq CR: complete the CRM SMS pipeline (`POST /customer/send-otp` end-to-end); provide full endpoint documentation; prove SMS delivery in UAT with test phone numbers; hand off a stable contract for CR-003 to call.
- Placement: Wave 1 (before CR-003 in the build order). Wave 1 build order revises to: CR-005 P1 → CR-007 F-07 → **CR-017 (new CRM SMS finalization)** → CR-003 → CR-004 → (CR-015 as Phase 2 whenever git access clears).
- **Owner drives Role 1 (INTAKE)** to file CR-017 in a follow-up gate — same pattern as CR-015. Not filed in this Planning session.

## 6.2 Status of CR-003 itself

- **Impact Analysis: FROZEN** — decisions on disk are locked. Deferred items (D-003-7, A-1..A-7) will be answered during the next Planning gate (Implementation Plan drafting), AFTER CR-017 CLOSES.
- **CR overall status: BLOCKED pending CR-2026-09-12-017 (CRM SMS finalization) CLOSED.**
- No Implementation Plan will be written until:
  1. CR-017 exists (owner Role 1 gate)
  2. CR-017 Planning + Implementation + QA all CLOSE
  3. Owner re-opens Role 2 for CR-003 Implementation Plan (with deferred A-1..A-7 + D-003-7 decisions supplied)

## 7. Compact Planning output — UPDATED 2026-09-12

```text
Planning complete: CR-2026-09-12-003 · Stage: Impact Analysis
Impact Analysis: PARTIALLY FROZEN 2026-09-12 (Q1, Q2-gate, Q2-choice, D-003-3..6 locked)
Deferred to next Planning gate: D-003-7, A-1..A-7 (owner: "we will decide during this CR")
CR overall status: BLOCKED — pending prereq CR-2026-09-12-017 (CRM SMS finalization) CLOSED
Owner literals recorded:
  Q1: "P — we need final fix what is required no by pass"
  Q2-gate: "all end poinst needs to be provided and tested this will be blocker other wise correct"
  Q2-choice: "E — Reorder Wave 1: finish CRM as its own CR first, then CR-003"
  A-1..A-7: "lot of things we will need to decide during this CR"
Risk: CRITICAL (unchanged)
Wave 1 build order revised: CR-005 P1 → CR-007 F-07 → CR-017 (new) → CR-003 → CR-004 → CR-015
Owner action queue: (1) File CR-017 via Role 1 INTAKE; (2) Drive CR-017 to CLOSED; (3) Re-open CR-003 Planning
Docs updated: this file, README.md, OWNER_DECISIONS_2026-09-12.md, PRD.md
GATE DISCIPLINE: no plan, no code, no CR-017 intake filed by me (owner drives it).
```
