# INTAKE DOC — CR-2026-09-12-003

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-003 |
| **Title** | Remove `otp_for_testing` echo from `/api/auth/send-otp` + move OTP store from in-memory dict to persistent, throttled store |
| **Classification** | CR — Security bug fix (GAP-003) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner ("fix all high and critical bugs") + GAP-003 |
| **Severity** | **P0** — auth bypass (OTP readable in network tab) |
| **Risk** | CRITICAL (auth logic, `server.py` CRITICAL per Part C) |
| **Status** | INTAKE ✅ — owner already approved removal (v2/PHASE0_OWNER_DECISIONS G0.5). Planning may open after D-OTP answered. |
| **Parent** | CR-2026-09-12-001 (Wave 1) |

---

## 1. Problem

| Evidence | Location |
|---|---|
| `otp_store = {}` — in-memory, lost on restart, not multi-worker safe | `backend/server.py:366` |
| `return {"success": True, "message": "OTP sent successfully", "otp_for_testing": otp}` | `backend/server.py:466` |
| No attempt counter; unlimited guesses | `verify_otp()` `server.py:373-385` |
| FE also consumes CRM `debug_otp` (dev mode) | `frontend/src/pages/PasswordSetup.jsx:130,250` — **out of scope here** (CRM-owned), flag to CRM team |

## 2. Scope

**IN:** delete `otp_for_testing` key; new Mongo collection `otp_codes {phone, restaurant_id, otp_hash, expires_at, attempts}` with TTL index; max 5 attempts then 429; unit tests.
**OUT:** SMS provider integration (D-OTP), CRM `debug_otp`, rate-limiting by IP (CR-004).

## 3. Classification

Bug (security) · **Final: CR — Security fix**

## 4. Duplicate Check

| Item | Relationship |
|---|---|
| GAP-003 (`v2/PROJECT_GAP_REGISTER.md`) | Same finding — this CR is its execution |
| v2 Correction Plan Phase 4 (persistent OTP + RBAC) | Reuse design; RBAC stays out of scope |
| CR-2026-09-12-004 | Sibling — IP rate-limit lives there |

**Verdict: DISTINCT (first CR for GAP-003).**

## 5. Blast Radius

MEDIUM — customer OTP login, password-reset flow (`/auth/reset-password` uses `verify_otp`), any tester relying on echoed OTP (test scripts / testing agent must switch to a test-mode hook — Planning must define one, e.g. env-gated `OTP_TEST_MODE` that logs server-side only, never in response).

## 6. Regression required (CRITICAL)

Customer OTP login · reset-password via OTP · backend restart mid-flow · 6th wrong attempt → 429 · `otp_for_testing` absent in response (contract snapshot intentionally changed).

## 7. Owner decisions

D-OTP (delivery channel after echo removal). Default: CRM SMS path only.

---

```text
Intake complete: CR-2026-09-12-003
Classification: CR (Security fix)
Severity: P0
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (§1)
Blast radius: MEDIUM
Docs updated: this file; README.md
Next: Planning (after D-OTP)
```
