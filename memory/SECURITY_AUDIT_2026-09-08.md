# MyGenie CRM — Security Audit (Phase 0)

> **Date**: 2026-09-08 · **Role**: PRE-RELEASE AUDIT (read-only — no code changed)
> **Branch**: `main` (pulled 2026-09-08) · **Pod**: see `frontend/.env` `REACT_APP_BACKEND_URL`
> **Method**: every finding is verified against the live checkout (file:line), the running pod `.env` (values redacted), the remote MongoDB (read-only queries), and `pip-audit` of the installed environment. Findings from `ARCHITECTURE_AUDIT.md` v1.1 (2026-07-06) are re-verified and marked **RE-CONFIRMED / REMEDIATED / NEW**.
> **Scope**: backend API, auth/session, tenant isolation, secrets, webhooks, OTP flows, data exposure, logging, dependencies, frontend storage. Out of scope: infra hardening of the Mongo host itself (owner-managed), Meta/AuthKey account security.

---

## 0. Executive summary

| Severity | Count | Action window |
|---|---|---|
| 🔴 **P0 — Critical** | 6 | Fix before any further tenant onboarding |
| 🟠 **P1 — High** | 7 | Fix this sprint |
| 🟡 **P2 — Medium** | 7 | Schedule next sprint |
| 🟢 **P3 — Low / hygiene** | 4 | Backlog |

**Top 5 facts**
1. **Two authentication bypasses exist on the customer (scan & order) surface**: `POST /api/scan/auth/skip-otp` mints a full customer token for *any phone number with no verification*, and `POST /api/scan/auth/request-otp` **returns the OTP in the HTTP response** (`dev_otp`). Anyone can impersonate any customer of any restaurant.
2. **Staff password-reset OTP is also returned in the response** (`routers/auth.py:640-656`, commented "remove in production") — full account-takeover path for every staff account given only an email.
3. **Third-party secrets are served to the browser**: `GET /api/auth/me` returns `meta_access_token`; `GET /api/whatsapp/settings` returns `authkey_api_key` in clear. Combined with 24-hour non-revocable JWTs in `localStorage`, any XSS = tenant WhatsApp/Meta account takeover.
4. **No throttling anywhere**; `CORS_ORIGINS=*` with credentials; AuthKey webhook HMAC still dormant (`AUTHKEY_WEBHOOK_SECRET` empty in pod `.env`).
5. **Improvements since the July audit**: JWT hardcoded fallback removed (fail-fast `os.environ['JWT_SECRET']`); all 25+ config values moved to `.env` (CR-027); the `READ_ME_TO_RECOVER_YOUR_DATA` ransomware DB is **no longer present** on the Mongo host (databases now: `mygenie`, `mygenie_partners`). Mongo is still on a public IP without TLS.

**Regression-safety warning for the baseline**: the pytest suites the docs rely on (`backend/tests/` — "142+ tests, 20 files") are **not present in this checkout** (`/app/tests/` contains only `__init__.py`). Any security fix in `core/coupon.py`, `core/loyalty.py`, `routers/pos.py` currently has **no automated regression net**. See `PROJECT_BASELINE` §INC-01.

---

## 1. Findings

### 🔴 P0 — Critical

#### SEC-P0-01 · Customer auth bypass: `skip-otp` issues tokens without verification — **NEW**
- **Evidence**: `backend/routers/scan.py:303-349` — `skip_otp_login()` finds-or-creates a customer by `(phone, restaurant_id)` and returns `create_customer_token(...)` with **no OTP, password, or secret**. Route is public (no dependency).
- **Impact**: Anyone can obtain a valid customer JWT for any phone at any restaurant → read loyalty balance, points history, orders, addresses (`/scan/profile`, `/scan/orders`, `/scan/addresses`), redeem coupons, submit feedback, spam `call-waiter`/`request-bill`. Also creates junk customer records (7,503 customers today) polluting analytics and campaign audiences.
- **Fix**: Remove the route, or gate it behind a server-side feature flag that is **off by default** AND requires a POS/kiosk `X-API-Key`. Add an audit entry for every token minted this way.

#### SEC-P0-02 · Customer OTP returned in API response (`dev_otp`) and logged — **NEW**
- **Evidence**: `backend/routers/scan.py:225` `logger.info(f"[DEV] OTP for {req.phone} ...: {otp}")`; `scan.py:227` response includes `"dev_otp": otp`. No SMS/WhatsApp send is implemented ("DEV MODE").
- **Impact**: OTP flow is a no-op security control; identical impact to P0-01. OTPs also land in supervisor logs.
- **Fix**: Never return the OTP; deliver via AuthKey WhatsApp (`trigger_whatsapp_event`) or SMS; remove the log line; add attempt counter (max 3) and single-use invalidation on `customer_otps`.

#### SEC-P0-03 · Staff password-reset OTP returned in API response — **NEW**
- **Evidence**: `backend/routers/auth.py:640-656` — both branches of `request_forgot_password_otp()` return `"otp": otp` (comment: "Only for testing - remove in production"). `verify-otp` (`auth.py:659`) has expiry check but **no attempt limit**; OTP compared with plain equality.
- **Impact**: Full account takeover of **any staff/tenant account** knowing only the email: request OTP → read it from response → `verify-otp` → `reset` → new password. Because login is MyGenie SSO pass-through, the attacker also gains whatever the CRM password grants downstream.
- **Fix**: Strip `otp` from both responses immediately (1-line each). Add per-email + per-IP throttle (see P1-01), max 3 attempts, constant-time compare, TTL index on `otp_tokens`.

#### SEC-P0-04 · Third-party secrets exposed to the browser — **NEW**
- **Evidence**:
  - `backend/models/schemas.py:219` `UserResponse.meta_access_token`; `routers/auth.py` `get_me()` populates it (line ~186).
  - `backend/routers/whatsapp.py:142-153` `GET /whatsapp/settings` returns `authkey_api_key` and `meta_access_token` unmasked (CR-009 added a *visibility toggle* in UI, but the value still travels in clear).
- **Impact**: Any XSS, malicious extension, browser cache or HAR file leaks the tenant's Meta WABA token and AuthKey key → attacker can send WhatsApp to the tenant's whole customer base at the tenant's cost, or submit/delete Meta templates.
- **Fix**: Remove `meta_access_token` from `UserResponse`. Return masked values (`••••last4`) from `/whatsapp/settings`; accept full values only on `PUT`. Add a `has_authkey_key: bool` flag for UI state.

#### SEC-P0-05 · Public MongoDB, no TLS, admin-scoped app user — **RE-CONFIRMED (partially remediated)**
- **Evidence**: `backend/.env` `MONGO_URL` → public IP `52.66.232.149:27017`, no `tls=true`. App user is `mygenie_admin`. `list_database_names()` from the pod succeeds (`mygenie`, `mygenie_partners`) — ransomware artifact **gone** since July audit.
- **Impact**: Credential brute-force / data theft of 39 tenants, 7.5k customer PII, all per-tenant AuthKey/Meta tokens (stored plaintext in `users`, 10 tenants have `authkey_api_key`).
- **Fix**: VPC/security-group restrict to app egress IPs; enable TLS; rotate `mygenie_admin`; create least-privilege `readWrite@mygenie` app user; enable auditing; verify backups.

#### SEC-P0-06 · Cross-tenant privileged action: any staff user can run the loyalty cron for ALL tenants — **NEW**
- **Evidence**: `backend/routers/cron.py:69-73` — `POST /api/cron/trigger-all-users` only requires `get_current_user` (any tenant), then runs `daily_loyalty_jobs()` across every user. Docstring says "admin-level" but no admin role exists (addendum §9: "There is no admin/super-admin role").
- **Impact**: Any tenant can repeatedly fire financial jobs (birthday points, tier evaluation, expiry) for competitors' restaurants → duplicate point grants / WhatsApp sends to other tenants' customers.
- **Fix**: Remove from the public router or gate behind an `INTERNAL_ADMIN_TOKEN` header + IP allowlist; make `daily_loyalty_jobs` idempotent per `(user_id, date)`.

### 🟠 P1 — High

#### SEC-P1-01 · No rate limiting / brute-force protection — **RE-CONFIRMED**
- **Evidence**: `grep -rn slowapi|Limiter` → 0 hits. Unthrottled: `/auth/login`, `/auth/mygenie-login`, `/auth/forgot-password/*`, `/scan/auth/*`, `/whatsapp/status-callback`. `scan.request_otp` has a soft `recent_count` check only.
- **Fix**: `slowapi` — login 5/min/IP, OTP verify 3 attempts then lockout, webhook 60/min/IP.

#### SEC-P1-02 · `CORS_ORIGINS=*` with `allow_credentials=True` — **RE-CONFIRMED**
- **Evidence**: `backend/server.py:199-205`; pod `.env` `CORS_ORIGINS=*`.
- **Fix**: explicit origin list per env; fail startup when `*` and `ENV=production`.

#### SEC-P1-03 · AuthKey delivery webhook unauthenticated (HMAC dormant) — **RE-CONFIRMED**
- **Evidence**: `backend/routers/whatsapp.py:2071` route; HMAC block `:2150-2158` only runs if `AUTHKEY_WEBHOOK_SECRET` set; pod `.env` has the key present but **empty**.
- **Fix**: Set secret (CR-041-F3), reject unknown `logid`, rate-limit.

#### SEC-P1-04 · JWT in `localStorage`, 24 h, no revocation/refresh — **RE-CONFIRMED**
- **Evidence**: `core/auth.py:13` `JWT_EXPIRATION_HOURS = 24`; `AuthContext.jsx:59,71,87` `localStorage.setItem("token")`; no `token_version` check in `get_current_user`; no axios 401 interceptor found in `AuthContext.jsx`.
- **Fix**: 15-min access + rotating refresh (httpOnly cookie); `token_version` per user bumped on password change/logout-all.

#### SEC-P1-05 · Plaintext password persisted in `localStorage` ("Remember me") — **RE-CONFIRMED**
- **Evidence**: `frontend/src/pages/LoginPage.jsx:37,51`. Password is also the tenant's **MyGenie POS password** (SSO pass-through, `auth.py:360-420`).
- **Fix**: remember email only; delete lines 37 & 51 logic; migrate existing keys on next load.

#### SEC-P1-06 · Per-tenant third-party credentials stored in plaintext in `users` — **RE-CONFIRMED**
- **Evidence**: DB probe — `users` docs carry `authkey_api_key`, `meta_access_token`, `mygenie_token`, `api_key`, `pos_crm_token_response` in clear. 10/39 tenants have AuthKey keys.
- **Fix**: application-layer envelope encryption (Fernet, master key in env/KMS); mask in all reads.

#### SEC-P1-07 · POS `X-API-Key` stored & compared in plaintext, no rotation window — **RE-CONFIRMED**
- **Evidence**: `core/auth.py:101` `db.users.find_one({"api_key": x_api_key})`; key generation is strong (`secrets.token_urlsafe(32)`, `core/auth.py:46`), storage is not. CR-028 added regenerate-only (hard cutover).
- **Fix**: store SHA-256 hash + `key_prefix`; dual-key grace window; per-key usage log (enable `POS_REQUEST_LOGGING_ENABLED` in prod with masking — masks already configured).

### 🟡 P2 — Medium

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| SEC-P2-01 | **Open self-registration** creates a full tenant with API key | `routers/auth.py:117-153` `POST /auth/register` public; issues `api_key` | Disable or invite-only (`REGISTRATION_ENABLED=false` default); CR-015C removed demo login but left registration open |
| SEC-P2-02 | **Vulnerable dependencies** (22 CVEs / 3 pkgs) | `pip-audit`: `starlette 0.37.2` (9 advisories, incl. DoS PYSEC-2026-1941/1943 — fix ≥0.47.2), `litellm 1.80.0` (12 — platform-injected, not imported by app code), `ecdsa 0.19.2` | Bump FastAPI/Starlette to a supported line after regression; drop `litellm` if unused; run `pip-audit` in CI |
| SEC-P2-03 | **No security headers** (CSP/HSTS/X-Frame/nosniff) | `grep` server.py/core → 0 hits | Add header middleware or set at ingress |
| SEC-P2-04 | **PII / payload debug logging** | `core/whatsapp.py:87` logs full AuthKey `bodyValues` (customer names, amounts) tagged `# DEBUG CR-069`; 6 log lines include phone numbers | Remove debug line; mask phones (`+91••••1234`) in a log filter |
| SEC-P2-05 | **Error detail leakage** | 10 occurrences of `detail=str(e)` in `routers/` | Generic 500 message; log the exception server-side with request id |
| SEC-P2-06 | **Tenant-unscoped secondary reads** | e.g. `routers/pos_coupons.py:205`, `routers/coupons.py:302`, `services/feedback_service.py:33` fetch `customers` by `id` only (ids originate from tenant-scoped rows, so risk is IDOR-by-guess only) | Add `user_id` to every `find_one` as defence-in-depth; add a lint rule |
| SEC-P2-07 | **Secrets in flat `.env`, no manager, no rotation** | `backend/.env` holds AWS keys, Mongo admin, JWT secret (26 chars) | Secrets manager at deploy; 64-byte random JWT secret; rotation runbook |
| SEC-P2-08 | **Credentials committed to GitHub in test suites** (found 2026-09-08 during test restore) — treat as **P1** | `backend/tests/test_cr033_034_037_sprint_closure.py:25` Mongo **admin** URL with password; `test_cr036_b2_media_missing.py:36` former `JWT_SECRET`; tenant password `Qplazm@10` in 12 files; POS API key in `test_cr079_081_080.py:10` | Rotate Mongo admin password + all 4 tenant passwords + JWT secret; tests read from env / `test_credentials.md`; add secret scanning (gitleaks) to CI (CR-052); purge history if repo is ever made public |

### 🟢 P3 — Low / hygiene

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| SEC-P3-01 | Public invoice URLs are unguessable (uuid4 hex) but never expire | `services/invoice_generator.py:206,621,690` | Optional TTL / tenant-configurable expiry |
| SEC-P3-02 | Logo & app-config endpoints public by `user_id`/`restaurant_id` | `auth.py:311`, `scan.py:717,772` | Acceptable (public assets); ensure no PII in `customer_app_config` |
| SEC-P3-03 | `.env` files not tracked (good) but `.gitignore` lacks an explicit `.env` rule | `git ls-files` → 0; `.gitignore` has no `.env` line | Add `*.env` / `.env*` to `.gitignore` |
| SEC-P3-04 | Upload validation good on logo (`content_type` allowlist, 512 KB cap) — confirm parity on media-header chunk path | `auth.py:281-286` vs `whatsapp.py:330-420` | Verify MIME sniffing + total-size cap on chunked path |

---

## 2. What improved since ARCHITECTURE_AUDIT v1.1 (2026-07-06)

| July finding | Status now | Evidence |
|---|---|---|
| JWT_SECRET hardcoded fallback | ✅ REMEDIATED | `core/auth.py:11` `os.environ['JWT_SECRET']` (fail-fast), CR-027 |
| 22 hardcoded config values | ✅ REMEDIATED | 30+ keys in `backend/.env`, CR-027 QA 28/28 |
| Ransomware artifact DB on Mongo host | ✅ GONE | `list_database_names()` → `['mygenie','mygenie_partners']` |
| Local disk file staging | ✅ REMEDIATED | S3-only for logos, media chunks, invoices (2026-09-08) |
| POS request logging masks | ✅ CONFIGURED (disabled) | `.env` mask lists present; `ENABLED=false` |
| CORS `*`, webhook HMAC, localStorage password, JWT lifecycle, rate limiting, plaintext tenant keys | ❌ OPEN | see P1 table |

---

## 3. Recommended remediation order (owner approval required — all touch CRITICAL areas)

| Order | Items | Effort | Risk | Regression required |
|---|---|---|---|---|
| **R1 — same day, 6 edits** | P0-02, P0-03 (strip OTP from responses + log), P0-04 (drop `meta_access_token` from `/me`, mask `/whatsapp/settings`), P0-06 (gate cron-all) | ~1 h | LOW (removals) | Login → `/me`; Settings page loads; forgot-password happy path |
| **R2 — this week** | P0-01 (skip-otp gate), P1-05 (remember-me), P1-02 (CORS list), P1-03 (webhook secret), P1-01 (slowapi) | ~1 day | MEDIUM | Scan flow, login, webhook callback replay, campaign send |
| **R3 — infra (owner)** | P0-05 Mongo VPC + TLS + least-privilege user + backups | owner | HIGH | Full smoke |
| **R4 — next sprint** | P1-04 refresh tokens, P1-06 credential encryption, P1-07 hashed POS keys, P2-01 registration gate, P2-02 dependency bump, P2-03 headers | 3–4 days | HIGH | Full suite (once tests are restored) |

**Pre-condition for R2–R4**: restore or rebuild the automated test suites (see baseline INC-01) so hotspot files have a regression net.

---

## 4. Audit output block

```text
Pre-release audit complete (SECURITY)
Result: ISSUES
Blockers: 6 P0 (SEC-P0-01 … 06)
Security: FAIL
Registry integrity: N/A (this audit registers no CRs; owner to convert R1–R4 into CR/BUG IDs)
Report: /app/memory/SECURITY_AUDIT_2026-09-08.md
Next: Phase 1 baseline consolidation → owner decision on R1 fast-track
```
