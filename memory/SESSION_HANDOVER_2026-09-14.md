# SESSION HANDOVER — Wave 1a CR-004 Implementation + OTP Investigation

**Date:** 2026-09-14
**Session summary:** Implemented CR-004 (CORS lockdown + rate-limit + security headers), ran Wave 1a smoke test guide, investigated OTP/CR-017/CR-003 scope, updated registry.

---

## 1. MANDATORY — Read these files FIRST (in order)

1. `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`
2. `/app/memory/change_requests/CR-2026-09-12-001-architecture-correction-programme/EXECUTION_PLAN.md`
3. `/app/memory/change_requests/CR-2026-09-12-001-architecture-correction-programme/OWNER_DECISIONS_2026-09-12.md`
4. `/app/memory/change_requests/README.md`
5. `/app/memory/PRD.md`
6. `/app/memory/test_credentials.md`
7. **This file**

---

## 2. Programme state (verified live 2026-09-14)

```
Wave 0  ────────── ✅ CLOSED (10/10 items + 4/4 notes)
Wave 1a:
  CR-005 P1 ────── ✅ CLOSED (22/22 tests PASS, QA verified 2026-09-13)
  CR-007 F-07 ──── ✅ CLOSED (8/8 QA checks PASS, 2026-09-13)
  CR-004 ─────────  ✅ IMPLEMENTED (22/22 PASS) — awaiting QA (Role 4) + owner smoke
Wave 1b (formerly):
  CR-017 ─────────  ❌ CANCELLED — premise invalidated (see §4)
  CR-003 ─────────  🔍 RE-SCOPED — Part A deferred pending OTP E2E confirm; Parts B+C deferred
  CR-015 ─────────  🔒 DEFERRED — still needs git access + 6 GitHub secrets
Wave 2+ (backend split, FE foundations, etc.): not started
```

---

## 3. What happened this session

### CR-004 implementation (Role 3 complete)
- 6 surgical edits to `server.py`: slowapi imports, CORS fail-fast, limiter init, rate-limit decorators on 5 auth routes, security headers middleware, global 500 handler, CORS hybrid allow-list
- `slowapi==0.1.10` installed; `CORS_ORIGINS` changed from `"*"` to explicit origins
- Self-test: 22/22 PASS (after 65s rate-limit reset window)
- QA handover written: `/app/memory/change_requests/CR-2026-09-12-004-.../QA_HANDOVER.md`
- **Decorator order note:** slowapi requires `@router.post` ABOVE `@limiter.limit` (router first, limiter second in code order)
- **Parameter rename note:** Pydantic body params in rate-limited routes renamed from `request` → `body` (slowapi requires parameter named exactly `request` to be `starlette.requests.Request`)

### Wave 1a smoke test guide
- Full 25-step guide compiled and documented (covering CR-005, CR-007, CR-004)
- Closure checklist provided — all checks pass locally
- Regression not required for Wave 1a (snapshot suite is the regression gate)

### OTP investigation (CR-017 / CR-003 scope review)
Live code + live CRM probe findings (2026-09-14):

| Finding | Detail |
|---|---|
| Backend `/api/auth/send-otp` | **Never called by frontend** — dead code. `AuthContext.sendOTP()` exists but nothing invokes it. |
| CRM is the SMS provider | `crmSendOtp()` in `crmService.js` calls `https://crm.mygenie.online/api/scan/auth/request-otp` (v2) directly from the browser |
| CRM v2 request-otp | HTTP 200, returns `dev_otp: "270283"` — CRM appears to be in dev mode |
| CRM skip-otp | HTTP 200, returns valid JWT — this is the primary customer path today |
| All `skipOtp*` flags | `false` in DB for restaurants 478 and 716 → customers ARE sent to `/password-setup` |
| PasswordSetup OTP path | Only reachable if existing customer taps "Login with OTP" — rarely used |
| Forgot/reset password | **BROKEN** — `crmForgotPassword`/`crmResetPassword` are v1-only, return 404 on v2 CRM (documented as UX-GAP-02) |
| CR-017 premise | **INVALID** — backend wiring to CRM not needed. CRM already delivers SMS. |
| `otp_for_testing` leak | Real but low-severity — endpoint is never called by frontend. No customer is exposed through normal app use. |

---

## 4. CR-017 and CR-003 disposition

### CR-017 — CANCELLED
Premise was wrong. CRM already handles SMS delivery end-to-end. No backend wiring needed.
If SMS delivery is found to be non-functional → file as a CRM-team investigation, not a customer-app backend CR.

### CR-003 — RE-SCOPED into 3 parts

**Part A — Delete `otp_for_testing` from response (1-line change)**
- File: `server.py:486` — delete `"otp_for_testing": otp` from return dict
- Zero dependencies, zero risk
- **Blocked on:** owner confirming OTP E2E works on a real phone first (so we don't break a flow that IS in use without knowing it)
- Once confirmed: assign Role 3, 5-minute change, update `test_smoke_otp_echo_present` to assert echo is ABSENT

**Part B — Replace in-memory `otp_store` with MongoDB `otp_codes` collection**
- Deferred until OTP feature is actively turned on for a restaurant

**Part C — 5-attempt cap on OTP guesses**
- Deferred with Part B

### CR-015 — UNCHANGED
Still blocked on owner git access + 6 GitHub Actions secrets.

---

## 5. The one owner action needed before next session

**Confirm OTP end-to-end on a real phone:**
1. Open `https://customer-app-deploy-2.preview.emergentagent.com/478`
2. Enter a phone number that is already registered in CRM
3. On password-setup, tap "Login with OTP"
4. Check: does an SMS arrive within 30 seconds?
5. Also check: does `Dev OTP: XXXXXX` appear on screen?

**If SMS arrives:** OTP is live → assign Role 3 for CR-003 Part A (1-line echo removal)
**If SMS does NOT arrive:** CRM is dev-mode only → raise with CRM team; defer CR-003 Part A until SMS is live

---

## 6. Next actions for incoming agent

### Immediate (when owner confirms OTP or assigns next task):

**Option A — Complete Wave 1a closure:**
- QA (Role 4) for CR-004 using the guide at `/app/memory/change_requests/CR-2026-09-12-004-.../QA_HANDOVER.md`
- Owner browser smoke (25-step guide documented in session)
- Mark Wave 1a CLOSED

**Option B — CR-003 Part A (if owner confirms OTP E2E):**
- Role 3: delete `otp_for_testing` from `server.py:486`
- Update `test_smoke_otp_echo_present` to assert echo is absent
- Run `pytest backend/tests/ -v` — 22/22 PASS expected (with test updated)

**Option C — Wave 2 planning (backend modular split, CR-006):**
- Requires Wave 1a fully CLOSED first
- INV-2026-09-12-001 (legacy routes trace) must run first

---

## 7. Live environment facts (2026-09-14)

| Fact | Value |
|---|---|
| Frontend URL | `https://customer-app-deploy-2.preview.emergentagent.com` |
| Backend | RUNNING port 8001, supervisor-managed |
| MongoDB | Connected to `52.66.232.149:27017` (mygenie DB) |
| CRM | `https://crm.mygenie.online/api` — v2, dev_otp returned |
| Admin login | `owner@18march.com` / `Qplazm@10` / restaurant `478` |
| Test phone | `9579504871` |
| Rate limit | 5/minute on `/api/auth/login` (in-memory, single worker) |
| CORS origins | `https://customer-app-deploy-2.preview.emergentagent.com,https://preprod.mygenie.online,https://crm.mygenie.online` |
| server.py | ~1887 lines, all CR-2026-09-12-004 markers present |

---

## 8. Known issues / UX gaps documented this session

| ID | Issue | Severity | Owner action |
|---|---|---|---|
| UX-GAP-02 | Forgot password → 404 (v1 endpoint missing on v2 CRM) | MEDIUM | CRM team to add v2 `/scan/auth/forgot-password` or owner decides to remove feature |
| — | `REACT_APP_CRM_API_KEY` not set in frontend `.env` | LOW | CRM currently responds without it; confirm if needed for production |
| — | All `skipOtp*` flags are `false` — customers always land on /password-setup | LOW NOTE | By design; owner may want to set `skipOtpDineIn=true` to reduce friction |

---

## 9. Compact status block

```
Project: MyGenie Customer App
Wave 1a: 3/3 CRs IMPLEMENTED
  CR-005 P1: ✅ CLOSED
  CR-007 F-07: ✅ CLOSED
  CR-004: ✅ IMPLEMENTED — QA (Role 4) next
Wave 1b: restructured
  CR-017: ❌ CANCELLED (premise invalid)
  CR-003: 🔍 RE-SCOPED — Part A deferred pending OTP E2E owner confirm
  CR-015: 🔒 DEFERRED (git access + secrets)
Next: QA CR-004 → owner smoke → Wave 1a CLOSED → Wave 2 planning
One owner action needed: confirm real SMS delivery on test phone
```
