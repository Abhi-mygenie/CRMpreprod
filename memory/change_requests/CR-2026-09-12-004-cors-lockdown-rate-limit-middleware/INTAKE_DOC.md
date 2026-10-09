# INTAKE DOC — CR-2026-09-12-004

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-004 |
| **Title** | CORS lockdown (explicit origins, no `*`+credentials) + rate-limit on `/api/auth/*` + minimal middleware stack (security headers, global exception handler, request-id logging) |
| **Classification** | CR — Security / Production-risk fix (GAP-005 + GAP-004) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner + GAP-005/GAP-004 |
| **Severity** | **P0** (GAP-005) / P2 (GAP-004 middleware) |
| **Risk** | CRITICAL (security; `server.py`) |
| **Status** | INTAKE ✅ — blocked on owner G0.4 (production origins list) |
| **Parent** | CR-2026-09-12-001 (Wave 1) |

---

## 1. Problem

| Evidence | Location |
|---|---|
| `allow_credentials=True` with `allow_origins=CORS_ORIGINS or '*'`; `.env` has `*` | `server.py:1806-1809` |
| No throttling on `send-otp`, `login`, `verify-password`, `reset-password` | absence; `slowapi` not in requirements |
| Only `CORSMiddleware`; no exception handler, no security headers, no request-id | `server.py` middleware section |

## 2. Scope

**IN:** fail-fast if `CORS_ORIGINS` contains `*` while credentials on; per-IP + per-phone limiter on `/auth/*`; `SecurityHeadersMiddleware`; global `HTTPException`/500 handler returning `{error, request_id}`; structured request log.
**OUT:** RBAC, refresh tokens (GAP-012), WAF/infra.

## 3. Classification

Bug (security) + hardening · **Final: CR — Security fix**

## 4. Duplicate Check

| Item | Relationship |
|---|---|
| GAP-005, GAP-004 | Execution of both |
| CR-2026-07-03-009 observability + LB probe | RELATED — request logging here must not duplicate CR-009 probe work |
| v2 Correction Plan Phase 6 (middleware) | Reuse design |

**Verdict: DISTINCT.**

## 5. Blast Radius

LARGE for CORS (every FE→own-API call from every hostname; preview + prod + per-restaurant subdomains). Planning must enumerate all serving hostnames (subdomain-per-restaurant model per `useRestaurantId.js`) — a wildcard-subdomain regex may be needed (`allow_origin_regex`).

## 6. Regression required (CRITICAL)

Admin login, customer OTP login, config CRUD, upload, from preview host; foreign-origin request has no ACAO header; 11th `send-otp`/min → 429; 500 path returns request_id.

## 7. Owner decisions

G0.4 — exact production origins / subdomain pattern.

---

```text
Intake complete: CR-2026-09-12-004
Classification: CR (Security fix)
Severity: P0
Risk: CRITICAL
Duplicate check: DISTINCT
Evidence: captured (§1)
Blast radius: LARGE
Docs updated: this file; README.md
Next: Planning (after G0.4)
```
