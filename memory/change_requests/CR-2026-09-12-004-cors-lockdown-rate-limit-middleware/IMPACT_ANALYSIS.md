# IMPACT ANALYSIS — CR-2026-09-12-004 (CORS lockdown + rate-limit + middleware stack)

**Role:** Planning (Role 2) · Stage: Impact Analysis
**Date:** 2026-09-12 · **Parent:** CR-2026-09-12-001 (Wave 1)
**Severity:** P0 (CORS) / P2 (middleware) · **Risk:** CRITICAL (security, `server.py` CRITICAL hotspot)

## 1. Item registered

INTAKE_DOC.md present. GAP-005 (wildcard CORS + credentials) and GAP-004 (missing middleware stack) mapped.

## 2. Code reality (2026-09-12)

| Fact | Source |
|---|---|
| CORS block: `CORSMiddleware, allow_origins=os.environ.get('CORS_ORIGINS','*').split(',')` with `allow_credentials=True` | `server.py:1805–1809` |
| `.env` currently has `CORS_ORIGINS` set (Wave 0 preflight — value REDACTED) — but the fallback `'*'` remains a landmine if env is ever unset | same |
| **No rate-limit library** in `requirements.txt` (`slowapi`, `limits` both missing) | grep |
| **No exception handler**, **no security headers**, **no request-id** middleware exist | `server.py` middleware section |
| Auth endpoints unthrottled: `send-otp`, `login`, `verify-password`, `reset-password` | server.py:437, 502, 698, 743 |

## 3. Conflict check

| CR | Overlap | Verdict |
|---|---|---|
| CR-2026-09-12-003 (OTP throttle) | Adds phone-based attempt cap; this CR adds IP-based rate-limit | Complementary — 2-key limiter |
| CR-2026-07-03-009 (F-13 observability + LB probe) | Request logging overlaps request-id logging here | Confirm at Planning; don't double-log |
| CR-2026-09-12-005 (snapshots) | This CR may add security headers → new headers appear in responses → contract snapshots update once (owner-approved) | Deliberate one-time delta |
| CR-2026-09-12-006 (backend split) | Middleware moves into `app/core/middleware.py` | Later refactor, no conflict now |

## 4. Risk verification

Intake said CRITICAL. **Concur** — CORS lockdown is a **LARGE blast radius** because every FE→own-API call from every hostname/subdomain must be enumerated.

## 5. Files that WILL change

| # | Path | Change |
|---|---|---|
| 1 | `backend/server.py` | REPLACE `CORSMiddleware` config: fail-fast if `CORS_ORIGINS` contains `*` while credentials on. ADD **dynamic allow-list** (from DB) OR `allow_origin_regex` for wildcard-subdomain (per G0.4 = "grows daily"). ADD `slowapi.Limiter` on `/auth/*`. ADD `SecurityHeadersMiddleware` (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy). ADD global `HTTPException` + 500 handler returning `{error, request_id}`. ADD request-id middleware. |
| 2 | `backend/requirements.txt` | APPEND `slowapi` (rate-limit) + `starlette-context` OR native middleware for request-id (choose at Planning; native preferred to avoid dep) |
| 3 | `backend/.env` + `backend/.env.example` | DOCUMENT `CORS_ORIGINS` intended format + optional `CORS_ORIGIN_REGEX` + `RATE_LIMIT_AUTH` (e.g. `10/minute`). `.env.example` lands via CR-007 F-07. |
| 4 | **NEW Mongo collection** (only if dynamic allow-list chosen) `allowed_origins` or reuse `customer_app_config.host` field | schema TBD at Planning; needs Owner Decision 4 explicit approval |
| 5 | `backend/tests/contracts/*` (CR-005) | Snapshots regenerated once — new security headers appear |

**Schema addition (if allowlist collection) → Owner Decision 4 requires explicit approval** per OWNER_DECISIONS_2026-09-12.md.

## 5.1 Files that WILL NOT touch

- All frontend src (assuming no ACAO breakage; verified at Implementation time)
- Hotspot files
- `.emergent/*`

## 6. Owner decisions — FROZEN 2026-09-12

All 8 blocking decisions + 7 assumptions locked in one Planning session.

| # | Decision | Owner answer |
|---|---|---|
| **D-004-1** | CORS allow-list source | **Hybrid: static list + regex** — `allow_origins=[<explicit hostnames>]` plus `allow_origin_regex=<subdomain pattern>`. Both stored as backend `.env` keys `CORS_ORIGINS` + `CORS_ORIGIN_REGEX`. Documented in CR-007 F-07's `.env.example` (per D-007-3). |
| **D-004-2** | Mongo `allowed_origins` collection | **(i) DROPPED** — not needed given D-004-1 = hybrid env-driven. No new collection. |
| **D-004-3** | Rate-limit thresholds on `/api/auth/*` | **Accept** — send-otp 10/min/IP · login 5/min/IP · verify-password 5/min/IP · reset-password 3/min/IP (all per-IP) |
| **D-004-4** | Rate-limit key | **(b) IP + phone** — separate buckets prevent shared-IP lockouts |
| **D-004-5** | Security headers | **Accept** all 5: `Strict-Transport-Security: max-age=31536000; includeSubDomains` · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy: geolocation=(self), microphone=(), camera=()` |
| **D-004-6** | 500 handler response shape | **Accept** — `{"error": {"type", "message"}, "request_id": "<uuid4>"}`. 4xx unchanged. |
| **D-004-7** | Fail-fast on `CORS_ORIGINS='*'` + credentials | **(a) Yes** — server refuses to start; ValueError raised before Mongo connect |
| **D-004-8** | Rate-limit backing store | **(a) In-memory** — matches single-worker supervisor config; swap to Mongo-backed when scaling |
| **A-1** | POS-auth proxy `/api/pos/auth-token` gets same rate-limit rules as `/auth/login` | ✅ ok — 5/min/IP+phone |
| **A-2** | Fail-fast CORS check runs BEFORE Mongo connect | ✅ ok |
| **A-3** | Request-id header format | ✅ ok — UUID v4 |
| **A-4** | Inbound `X-Request-ID` adoption | ✅ ok — adopt if present, otherwise generate |
| **A-5** | Rate-limit response envelope | ✅ ok — HTTP 429 + `Retry-After` header + `{error, request_id}` body |
| **A-6** | CR-005 snapshot regeneration | ✅ ok — one-time delta for new security headers |
| **A-7** | Single FastAPI worker assumption | ✅ ok — matches supervisor config today |

## 7. Compact Planning output — UPDATED 2026-09-12

```text
Planning complete: CR-2026-09-12-004 · Stage: Impact Analysis
Impact Analysis: ✅ APPROVED BY OWNER 2026-09-12
Wave 1a IA Gate: ✅ CLOSED 2026-09-13 (wave-split decision recorded)
Wave assignment: WAVE 1a — unblocked, proceed to IMPLEMENTATION_PLAN
Owner literal: "as suggested above for this CR" (approving CR-004 IA closure per prior message)
Role: Planning (Role 2)
Risk: CRITICAL (unchanged from intake — CORS + rate-limit misconfigs = full CORS bypass or lockout)
Files WILL change (when unblocked): 5
Files WILL NOT touch: all FE src, all hotspot files, .emergent/*
All 8 D-004-* + 7 A-N decisions locked in.
Wave 1a IA phase: ✅ 100% CLOSED — 3/3 Wave 1a IAs approved and IA gates closed 2026-09-13.
Wave 1b (CR-015, CR-017, CR-003): DEFERRED TO WAVE 2 — owner-side blockers; see OWNER_DECISIONS addendum 2026-09-13.
Next role/gate: Owner-driven Planning session (Role 2 again) for IMPLEMENTATION_PLAN drafting; then owner "go" gates entry to Role 3 (Implementation).
GATE DISCIPLINE: no plan, no code.
```
