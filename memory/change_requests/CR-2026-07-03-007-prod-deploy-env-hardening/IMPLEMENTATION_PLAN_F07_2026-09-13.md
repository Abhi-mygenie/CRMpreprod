# IMPLEMENTATION PLAN — CR-2026-07-03-007 F-07
# (`.env.example` files + dead-key purge + rotation checklist)

**Role:** Planning (Role 2) · Stage: Implementation Plan · No code written in this document.
**Date:** 2026-09-13
**Prerequisite gate:** IA approved by owner 2026-09-12 · IA Gate closed 2026-09-13
**Build slot:** 2nd in Wave 1a (after CR-005 P1 — snapshot suite must exist first)
**Risk:** LOW
**Follows Alpha v0.1 §8 Role 2 output contract.**

---

## 0. Pre-implementation checks (Role 3 must verify these before touching any file)

| Check | Expected | How to verify |
|---|---|---|
| `backend/.env.example` | Does NOT exist | `ls /app/backend/.env.example` → "No such file" |
| `frontend/.env.example` | Does NOT exist | `ls /app/frontend/.env.example` → "No such file" |
| `backend/.env` has orphan key | `GOOGLE_MAPS_API_KEY=...` present | `grep GOOGLE_MAPS_API_KEY /app/backend/.env` → match |
| `.gitignore` has no `!*.env.example` lines yet | Absent | `grep 'env.example' /app/.gitignore` → no match |
| Parked patches present | Yes | `ls /app/memory/v2/phase3_*.patch` → 3 files |
| CR-005 P1 status | CLOSED (tests passing) | `pytest -m contract backend/tests/` → 0 fail |

---

## 1. Files that WILL change (complete list)

| # | Path | Action | Note |
|---|---|---|---|
| 1 | `/app/backend/.env.example` | **CREATE** | Template; no real values; based on parked patch + D-007 decisions |
| 2 | `/app/frontend/.env.example` | **CREATE** | Template; no real values; based on parked patch + D-007 decisions |
| 3 | `/app/.gitignore` | **APPEND** 4 lines | Allow `!*.env.example` lines (per A-3); addendum rule — append only |
| 4 | `/app/memory/change_requests/CR-2026-07-03-007-prod-deploy-env-hardening/ROTATION_CHECKLIST.md` | **CREATE** | Placeholder team assignments (per A-2) |
| 5 | `/app/backend/.env` | **DELETE one line** only | Remove `GOOGLE_MAPS_API_KEY=<value>` (D-007-4: orphan, 0 code refs confirmed) |

**Total: 4 new/created + 1 append + 1 single-line deletion = 6 changes.**

## 1.1 Files that WILL NOT be touched (scope lock)

- `/app/backend/server.py` — untouched
- All `/app/frontend/src/**` — no source code changes (CR-016 handles dead-ref deletion, Wave 3)
- `/app/frontend/.env` — values unchanged; we only create `.env.example`
- `/app/backend/.env` — only the `GOOGLE_MAPS_API_KEY` orphan line deleted; all other keys untouched
- `/app/.emergent/*` — platform-managed

---

## 2. Edit sequence (Role 3 executes in this exact order)

### Edit 1 — CREATE `/app/backend/.env.example`

**Source:** `memory/v2/phase3_backend_env_example.patch` as starting point, hand-edited per decisions below.

**Decisions applied:**
- D-007-4: `GOOGLE_MAPS_API_KEY` OMITTED (0 backend code refs confirmed — no backend file reads it)
- D-007-3: Include TODO comments for future CR-003 + CR-004 keys
- A-5: Add file header comment with CR ID and date
- Add `MYGENIE_POS_LOGIN_PHONE` + `MYGENIE_POS_LOGIN_PASSWORD` (added post-July; present in live `.env`)

**Exact file content to create:**

```dotenv
# =============================================================================
# backend/.env  — EXAMPLE TEMPLATE
# CR-2026-07-03-007 F-07 · Generated 2026-09-13
# -----------------------------------------------------------------------------
# Template only — never commit real secret values.
# Copy to backend/.env on each deploy and fill in real values.
# The real backend/.env is gitignored.
# =============================================================================

# --- Database (REQUIRED) -----------------------------------------------------
# MongoDB connection string. Backend raises ValueError on startup if missing.
# Format: mongodb://<user>:<password>@<host>:<port>/<db>
MONGO_URL=mongodb://<MONGO_USER>:<MONGO_PASSWORD>@<MONGO_HOST>:27017/<MONGO_DB>

# Database name (must match the DB in MONGO_URL).
DB_NAME=<MONGO_DB_NAME>

# --- Auth (REQUIRED) ---------------------------------------------------------
# HS256 JWT signing secret for admin sessions. Backend raises on startup if missing.
# Generate with: openssl rand -hex 32
JWT_SECRET=<GENERATE_A_STRONG_RANDOM_SECRET>

# --- External POS API (REQUIRED) ---------------------------------------------
# MyGenie POS base URL the backend proxies to.
# Example: https://preprod.mygenie.online/api/v1
MYGENIE_API_URL=<MYGENIE_POS_BASE_URL>

# POS service-account credentials for the /api/pos/auth-token proxy.
# Server-side only — these MUST NOT be in the frontend bundle.
MYGENIE_POS_LOGIN_PHONE=<POS_SERVICE_ACCOUNT_PHONE>
MYGENIE_POS_LOGIN_PASSWORD=<POS_SERVICE_ACCOUNT_PASSWORD>

# --- CORS (OPTIONAL) ---------------------------------------------------------
# Comma-separated list of explicitly allowed origins.
# PRODUCTION: never use "*". Enumerate real app origins.
# Example: https://app.mygenie.online,https://18march.mygenie.online
CORS_ORIGINS=https://<your-app-origin>

# Regex pattern for wildcard subdomain matching (e.g. tenant subdomains).
# TODO(CR-2026-09-12-004): this key is added by CR-004 (CORS lockdown).
# Example: ^https://.*\.mygenie\.online$
# CORS_ORIGIN_REGEX=^https://.*\.mygenie\.online$

# Rate-limit override for /api/auth/* endpoints (default: 10/minute).
# TODO(CR-2026-09-12-004): this key is added by CR-004 (rate-limit).
# RATE_LIMIT_AUTH=10/minute

# --- OTP (FUTURE) ------------------------------------------------------------
# TODO(CR-2026-09-12-003): OTP_TEST_MODE and SMS provider keys added by CR-003.
# OTP_TEST_MODE=false
# OTP_SMS_PROVIDER_KEY=<SMS_PROVIDER_API_KEY>
```

---

### Edit 2 — CREATE `/app/frontend/.env.example`

**Source:** `memory/v2/phase3_frontend_env_example.patch` as starting point, hand-edited per decisions.

**Decisions applied:**
- D-007-2: `REACT_APP_CRM_API_KEY` and `REACT_APP_RESTAURANT_ID` are OMITTED — dead source refs; CR-016 (Wave 3) handles code-side cleanup
- A-1: `WDS_SOCKET_PORT` + `ENABLE_HEALTH_CHECK` included with platform comment
- A-5: Add file header comment with CR ID and date
- Include `REACT_APP_LOGIN_PHONE` + `REACT_APP_LOGIN_PASSWORD` (present in live `.env`; used by app; kept until CR-002/GAP-002 removes them)
- `REACT_APP_BACKEND_URL`: included — required field

**Exact file content to create:**

```dotenv
# =============================================================================
# frontend/.env  — EXAMPLE TEMPLATE
# CR-2026-07-03-007 F-07 · Generated 2026-09-13
# -----------------------------------------------------------------------------
# Template only — never commit real secret values.
# NOTE: anything prefixed REACT_APP_ is compiled into the PUBLIC JS bundle.
# Do NOT put private secrets here — they will be visible to end users.
# =============================================================================

# --- Own FastAPI backend (REQUIRED) ------------------------------------------
# Base URL of THIS project's FastAPI backend (no trailing /api).
# Example: https://app.mygenie.online
REACT_APP_BACKEND_URL=https://<your-fastapi-backend-host>

# --- MyGenie POS / ordering API (REQUIRED) -----------------------------------
# Example: https://preprod.mygenie.online/api/v1
REACT_APP_API_BASE_URL=<MYGENIE_POS_BASE_URL>/api/v1

# --- MyGenie CRM API (REQUIRED for customer auth/loyalty) --------------------
# Example: https://crm.mygenie.online/api
REACT_APP_CRM_URL=<MYGENIE_CRM_BASE_URL>/api
REACT_APP_CRM_API_VERSION=v2

# --- Image CDN (REQUIRED for menu/product images) ----------------------------
# Example: https://preprod.mygenie.online
REACT_APP_IMAGE_BASE_URL=<IMAGE_CDN_BASE_URL>

# --- Google Maps (REQUIRED for delivery-address map) -------------------------
# Restrict this key by HTTP referrer in Google Cloud console.
REACT_APP_GOOGLE_MAPS_API_KEY=<GOOGLE_MAPS_API_KEY>

# --- POS service-account login (LEGACY — to be removed in future CR) --------
# Used to obtain a POS order token. Shipped in public bundle — not truly secret.
REACT_APP_LOGIN_PHONE=<POS_LOGIN_PHONE>
REACT_APP_LOGIN_PASSWORD=<POS_LOGIN_PASSWORD>

# --- Preview / webpack-dev-server plumbing — keep as-is ----------------------
# Do NOT change these values; they are set by the Emergent platform.
WDS_SOCKET_PORT=443
ENABLE_HEALTH_CHECK=false
```

---

### Edit 3 — APPEND to `/app/.gitignore`

**Action:** Append the following block to the END of `/app/.gitignore`. Do NOT modify any existing line.

```gitignore

# Allow committing EXAMPLE/TEMPLATE env files (placeholders only, no secrets)
# CR-2026-07-03-007 F-07 · 2026-09-13
!.env.example
!*.env.example
!backend/.env.example
!frontend/.env.example
```

**Verify after append:** `grep 'env.example' /app/.gitignore` → 4 lines returned.

---

### Edit 4 — CREATE `/app/memory/change_requests/CR-2026-07-03-007-prod-deploy-env-hardening/ROTATION_CHECKLIST.md`

**Content spec (per A-2 — placeholder team assignments):**

```markdown
# Credential Rotation Checklist — CR-2026-07-03-007 F-07
# CR-2026-07-03-007 F-07 · 2026-09-13
# Owner replaces team names and ticks boxes after each rotation.

## How to use
1. When a credential is rotated, tick the box and record the date.
2. Update the corresponding .env file on the deployed pod.
3. Restart the backend: `sudo supervisorctl restart backend`
4. Smoke test: `curl localhost:8001/api/healthz` → {"ok":true}

## Credentials to rotate

| Credential | Key name | Team responsible | Last rotated | Status |
|---|---|---|---|---|
| MongoDB password | `MONGO_URL` (password field) | DBA / Database team | [date TBD] | ❌ Pending (May 2026 leak — see D-007-1a) |
| POS service-account password | `MYGENIE_POS_LOGIN_PASSWORD` | Security / Ops team | [date TBD] | ❌ Pending (D-007-1b) |
| JWT signing secret | `JWT_SECRET` | Backend team | [date TBD] | ❌ Pending (D-007-1c) |
| Google Maps API key | `REACT_APP_GOOGLE_MAPS_API_KEY` | Ops / DevOps team | [date TBD] | ❌ Pending (D-007-1d); also restrict by HTTP referrer in GCP console |

## After rotation
- Update `.env` files on all deployed pods.
- Do NOT commit real values to git — `.env` is gitignored.
- Verify `.env.example` reflects any new key names (but not values).
```

---

### Edit 5 — DELETE orphan line from `/app/backend/.env`

**Action:** Remove the single line `GOOGLE_MAPS_API_KEY=<value>` from `/app/backend/.env`.

**Verification before:** `grep GOOGLE_MAPS_API_KEY /app/backend/.env` → 1 match
**Verification after:** `grep GOOGLE_MAPS_API_KEY /app/backend/.env` → 0 matches

**Why safe:** Full grep audit on 2026-09-12 confirmed 0 backend code references to `GOOGLE_MAPS_API_KEY`. Only frontend uses it via `REACT_APP_GOOGLE_MAPS_API_KEY`.

**Runtime impact:** NONE. Backend does not read this key.

**After deletion, restart backend to confirm clean startup:**
`sudo supervisorctl restart backend && sleep 5 && tail -5 /var/log/supervisor/backend.err.log`
Expected: `INFO: Application startup complete.` — no ValueError.

---

## 3. Verification matrix (Role 3 self-test — all must PASS before QA handover)

| ID | Test | Command | Expected |
|---|---|---|---|
| VS-1 | backend/.env.example created | `cat /app/backend/.env.example` | Shows template with placeholder values, no real secrets |
| VS-2 | frontend/.env.example created | `cat /app/frontend/.env.example` | Shows template; WDS_SOCKET_PORT + ENABLE_HEALTH_CHECK present |
| VS-3 | .gitignore allow-lines added | `grep 'env.example' /app/.gitignore` | 4 lines found |
| VS-4 | ROTATION_CHECKLIST.md created | `ls /app/memory/change_requests/CR-2026-07-03-007-*/ROTATION_CHECKLIST.md` | File exists |
| VS-5 | Orphan key deleted from backend/.env | `grep GOOGLE_MAPS_API_KEY /app/backend/.env` | 0 matches |
| VS-6 | Backend starts cleanly after .env edit | `sudo supervisorctl restart backend && sleep 8 && curl localhost:8001/api/healthz` | `{"ok":true,"mongo":"up"}` |
| VS-7 | No real secrets in .env.example files | `grep -E '[a-zA-Z0-9]{20,}' /app/backend/.env.example /app/frontend/.env.example` | 0 matches (placeholders only) |
| VS-8 | No source code files changed | `git diff --name-only` | Only `.env.example` files, `.gitignore`, `ROTATION_CHECKLIST.md`, `backend/.env` |
| VS-9 | CR-005 tests still pass after .env change | `pytest -m smoke backend/tests/` | 0 failures |

---

## 4. Code markers

Each new file must include in its header: `# CR-2026-07-03-007 F-07 · <date>`
The `.gitignore` append must include a comment line: `# CR-2026-07-03-007 F-07 · 2026-09-13`

---

## 5. Rollback plan

- `.env.example` files: delete them → no runtime impact.
- `.gitignore` append: remove the 4 appended lines → no runtime impact.
- `ROTATION_CHECKLIST.md`: delete → no runtime impact.
- `backend/.env` orphan deletion: restore `GOOGLE_MAPS_API_KEY=<value>` → no runtime impact (0 code refs).
- **No DB migration, no schema change, no server restart needed** (except the one smoke-check restart for VS-6).

---

## 6. Compact Planning output (Alpha v0.1 §8 Role 2)

```
Planning complete: CR-2026-07-03-007 F-07
Stage: Implementation Plan — WRITTEN 2026-09-13
Risk: LOW
Files WILL change: 5 (2 .env.example new, .gitignore append, ROTATION_CHECKLIST.md new, backend/.env 1-line orphan delete)
Files WILL NOT touch: server.py, all frontend src, frontend/.env values, .emergent/*
Owner decisions: ALL frozen from IA (D-007-1..4 + Q-F07-A/B + A-1..5)
Verification matrix: 9 checks (VS-1..VS-9)
Rollback: delete created files; restore .gitignore append; restore backend/.env orphan line — zero runtime impact
Prerequisite: CR-005 P1 CLOSED (VS-9 depends on test suite existing)
Docs: this file
Next gate: OWNER APPROVAL REQUIRED before Role 3 (Implementation) may start.
```

---

## OWNER APPROVAL GATE

```
OWNER APPROVAL REQUIRED
Reason: Implementation Plan complete. Role 3 (Implementation) may not start until owner approves.
Risk: LOW
Proposed next step: Owner says "go" on CR-007 F-07 → Role 3 implements in the exact edit order above.
Prerequisite: CR-005 P1 must be CLOSED first.
I will not proceed until owner approves.
```
