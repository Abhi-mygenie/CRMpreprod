# IMPLEMENTATION PLAN — CR-2026-09-12-004
# (CORS hybrid allow-list + auth rate-limit + security headers + middleware)

**Role:** Planning (Role 2) · Stage: Implementation Plan · No code written in this document.
**Date:** 2026-09-13
**Prerequisite gate:** IA approved by owner 2026-09-12 · IA Gate closed 2026-09-13
**Build slot:** 3rd in Wave 1a (after CR-005 P1 + CR-007 F-07)
**Risk:** CRITICAL — touches `server.py` (CRITICAL hotspot per Alpha v0.1 Part C)
**Follows Alpha v0.1 §8 Role 2 output contract.**

---

## 0. Pre-implementation checks (Role 3 must verify these before touching any file)

| Check | Expected | How to verify |
|---|---|---|
| CR-005 P1 snapshots exist | Yes | `ls /app/backend/tests/fixtures/snapshots/*.json` → files present |
| CR-005 contract tests pass | Yes | `pytest -m contract backend/tests/` → 0 failures |
| CR-007 F-07 CLOSED | Yes | `cat /app/backend/.env.example` exists; `grep GOOGLE_MAPS_API_KEY /app/backend/.env` → 0 |
| `slowapi` NOT in requirements.txt | Absent | `grep slowapi /app/backend/requirements.txt` → no match |
| `CORS_ORIGIN_REGEX` NOT in backend/.env | Absent | `grep CORS_ORIGIN_REGEX /app/backend/.env` → no match |
| Exact CORS block location | Lines ~1805–1812 | `grep -n 'CORSMiddleware\|allow_origins\|allow_credentials' /app/backend/server.py` |
| Auth route line numbers | Confirmed | `grep -n 'def send_otp\|def login\|def verify_password\|def reset_password\|def pos_auth' /app/backend/server.py` |

---

## 1. Files that WILL change (complete list)

| # | Path | Action | Risk |
|---|---|---|---|
| 1 | `/app/backend/requirements.txt` | **APPEND** only — add `slowapi==0.1.10` | LOW |
| 2 | `/app/backend/.env` | **APPEND** 2 new keys (CORS_ORIGIN_REGEX, RATE_LIMIT_AUTH) | LOW |
| 3 | `/app/backend/.env.example` | **UPDATE** — uncomment the TODO lines added by F-07 | LOW |
| 4 | `/app/backend/server.py` | **SURGICAL EDITS** — 6 targeted changes (see §2) | CRITICAL |
| 5 | `/app/backend/tests/fixtures/snapshots/*.json` | **REGENERATE** once (new security headers appear) | MEDIUM |

**Total: 2 appended + 1 .env.example update + surgical server.py edits + snapshot regen.**

## 1.1 Files that WILL NOT be touched (scope lock)

- All `/app/frontend/src/**` — no frontend changes (CORS is server-side; frontend calls stay identical)
- `/app/frontend/.env` — unchanged
- Any other backend route handler — **only the middleware/CORS/rate-limit layer is touched**
- `/app/.emergent/*` — platform-managed
- Router include block (lines ~1719–1727) — untouched

---

## 2. Edit sequence — `server.py` surgical changes

**Ground rule (Alpha v0.1 R2 + Wave 1 handover rule):** No wholesale rewrite of `server.py`. Every edit is surgical — add/replace a specific, clearly bounded block.

### server.py Edit A — Add imports (top of file, after existing imports)

**Location:** After line 17 (`import asyncio`) — the last existing import.

**Add these lines:**

```python
# CR-2026-09-12-004: rate-limit + security-header imports
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import re
```

---

### server.py Edit B — CORS fail-fast validation + limiter init

**Location:** After the `POS_LOGIN_PASSWORD` fail-fast block (approx line 62), before `app = FastAPI(...)`.

**Add this block:**

```python
# CR-2026-09-12-004: CORS fail-fast — refuse to start if wildcard+credentials combo
_cors_origins_raw = os.environ.get('CORS_ORIGINS', '*')
if '*' in _cors_origins_raw.split(',') and True:  # allow_credentials is always True below
    raise ValueError(
        "CRITICAL: CORS_ORIGINS='*' is not allowed when allow_credentials=True. "
        "Set CORS_ORIGINS to explicit origin(s) in backend/.env."
    )

# CR-2026-09-12-004: rate limiter (in-memory, single-worker)
limiter = Limiter(key_func=get_remote_address)
```

> **NOTE for Role 3:** The fail-fast check will break the currently-running pod if `CORS_ORIGINS` is set to `*`. Before implementing this edit, verify the current value of `CORS_ORIGINS` in `backend/.env` and ensure it is already set to explicit origins. If it is still `*`, update `.env` first (Edit 2b below).

---

### server.py Edit C — Register limiter + exception handler on `app`

**Location:** The line after `app = FastAPI(title="Customer App API")` (approx line 65).

**Add:**

```python
# CR-2026-09-12-004: attach limiter state and rate-limit exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

---

### server.py Edit D — Rate-limit decorators on auth endpoints

**Location:** Add `@limiter.limit(...)` decorator immediately above each matching `@<router>.post(...)` decorator, in this order:

| Endpoint function | Route | Limit (D-004-3 + A-1) |
|---|---|---|
| `send_otp` | `@auth_router.post("/send-otp")` | `@limiter.limit("10/minute")` |
| `login` | `@auth_router.post("/login")` | `@limiter.limit("5/minute")` |
| `verify_password` | `@auth_router.post("/verify-password")` | `@limiter.limit("5/minute")` |
| `reset_password` | `@auth_router.post("/reset-password")` | `@limiter.limit("3/minute")` |
| `pos_auth_token` (function for `/api/pos/auth-token`) | `@api_router.post("/pos/auth-token")` | `@limiter.limit("5/minute")` |

**Each decorated function must also receive `request: Request` as its first parameter** (required by slowapi). If the function already has `request: Request`, no change needed. If it does not, add it.

**Marker comment on each:** `# CR-2026-09-12-004: rate-limit`

---

### server.py Edit E — Security headers middleware + request-id middleware + global 500 handler

**Location:** Add this block BEFORE `app.include_router(api_router)` (currently approx line 1803).

```python
# CR-2026-09-12-004: security headers + request-id middleware
@app.middleware("http")
async def security_and_request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    # Security headers (D-004-5)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"
    response.headers["X-Request-ID"] = request_id
    return response

# CR-2026-09-12-004: global 500 handler (D-004-6)
@app.exception_handler(Exception)
async def global_500_handler(request: Request, exc: Exception):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    logger.error(f"Unhandled exception [request_id={request_id}]: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "type": type(exc).__name__,
                "message": "An unexpected error occurred."
            },
            "request_id": request_id
        }
    )
```

---

### server.py Edit F — Replace CORSMiddleware block

**Location:** Find and replace the existing block (approx lines 1805–1812):

```python
# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Replace with:**

```python
# CR-2026-09-12-004: CORS hybrid allow-list (D-004-1 — static list + optional regex)
_cors_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()]
_cors_origin_regex = os.environ.get('CORS_ORIGIN_REGEX', None) or None
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 2b. `.env` edits (Edits 1 and 2 from the file list above)

### Edit 1 — APPEND to `/app/backend/requirements.txt`

```
slowapi==0.1.10
```

Command: `echo "slowapi==0.1.10" >> /app/backend/requirements.txt`

---

### Edit 2 — APPEND to `/app/backend/.env`

Append these two lines to the end of the file:

```dotenv
# CR-2026-09-12-004: CORS regex pattern for wildcard subdomain matching (optional)
CORS_ORIGIN_REGEX=^https://.*\.mygenie\.online$
# CR-2026-09-12-004: rate-limit per auth endpoint (slowapi format)
RATE_LIMIT_AUTH=10/minute
```

> **CRITICAL check:** Also verify that `CORS_ORIGINS` in `.env` is already set to explicit origins (not `*`) before implementing server.py Edit B. If it is still `*`, change it to the actual Emergent preview URL first.
>
> Current value check: `grep CORS_ORIGINS /app/backend/.env`
> If value is `*` → update to the actual frontend origin(s) (e.g., `CORS_ORIGINS=https://react-customer-app-2.preview.emergentagent.com,https://*.mygenie.online`) before proceeding.

---

### Edit 3 — UPDATE `/app/backend/.env.example` (uncomment TODO lines)

The F-07 plan added TODO comment lines for these keys. Now that CR-004 is being implemented, update `.env.example` to uncomment and document them:

- Uncomment `CORS_ORIGIN_REGEX=...` (remove the `# ` prefix and the TODO comment)
- Uncomment `RATE_LIMIT_AUTH=10/minute` (same)

---

## 3. Post-edit: snapshot regeneration

After server.py changes are live and backend restarts clean:

```bash
cd /app && pytest -m contract --snapshot-update backend/tests/
```

This updates the frozen JSON snapshots to include the new security headers (`X-Request-ID`, `X-Content-Type-Options`, etc.) that now appear in every response. **Commit the updated snapshot files.** This is the one-time intentional delta (A-6 in IA).

Verify the delta is ONLY new headers — not changed response bodies:
```bash
git diff backend/tests/fixtures/snapshots/
```
Expected: only additions of header keys in snapshot JSON files. No response body key changes.

---

## 4. Restart and smoke test sequence (Role 3 must execute in this order)

```bash
# 1. Install slowapi
pip install slowapi==0.1.10

# 2. Restart backend
sudo supervisorctl restart backend
sleep 10

# 3. Check startup (must NOT show ValueError)
tail -10 /var/log/supervisor/backend.err.log
# Expected: "INFO: Application startup complete."

# 4. Quick smoke
curl -I localhost:8001/api/healthz
# Expected: HTTP 200 + X-Content-Type-Options: nosniff + X-Request-ID: <uuid> in headers

# 5. Rate-limit smoke (send >5 rapid logins, expect 429 on 6th)
for i in {1..6}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:8001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"9999999999","password":"wrong","restaurant_id":478}'; done
# Expected: first 5 → 401 (wrong creds), 6th → 429 (rate limited)

# 6. Run full test suite
cd /app && pytest backend/tests/ -v
```

---

## 5. Verification matrix (Role 3 self-test — all must PASS before QA handover)

| ID | Test | Expected |
|---|---|---|
| VS-1 | Backend starts without ValueError | `tail -5 /var/log/supervisor/backend.err.log` → "Application startup complete." |
| VS-2 | Security headers present | `curl -I localhost:8001/api/healthz` → `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `X-Request-ID: <uuid>` |
| VS-3 | HSTS header present | `curl -I localhost:8001/api/healthz` → `Strict-Transport-Security: max-age=31536000` |
| VS-4 | Rate-limit triggers on 6th rapid auth call | 6th POST → HTTP 429 |
| VS-5 | CORS allows real frontend origin | `curl -H 'Origin: https://react-customer-app-2.preview.emergentagent.com' localhost:8001/api/healthz -I` → `Access-Control-Allow-Origin` header present |
| VS-6 | 500 handler returns request_id | Trigger intentional 500 (or unit-test mock) → response has `{"error":{...}, "request_id":"<uuid>"}` |
| VS-7 | Contract tests pass (after snapshot regen) | `pytest -m contract backend/tests/` → 0 failures |
| VS-8 | Smoke tests pass | `pytest -m smoke backend/tests/` → 0 failures |
| VS-9 | No frontend source file changed | `git diff --name-only` → no `frontend/src/**` paths |
| VS-10 | Snapshot delta is headers-only | `git diff backend/tests/fixtures/snapshots/` → only new header keys, no body key changes |
| VS-11 | `requirements.txt` append-only | `tail -3 /app/backend/requirements.txt` → `slowapi==0.1.10` at end |

---

## 6. Code markers

Every edit in `server.py` must include: `# CR-2026-09-12-004: <brief reason>`
Every appended line in `.env` must include: `# CR-2026-09-12-004: ...`

---

## 7. Rollback plan

- `server.py` edits: `git revert <commit>` OR manually revert each surgical edit (bounded blocks, easy to identify by `# CR-2026-09-12-004` markers).
- `requirements.txt` append: remove `slowapi==0.1.10` line.
- `.env` appends: remove `CORS_ORIGIN_REGEX` + `RATE_LIMIT_AUTH` lines.
- Snapshot regen: `git revert` restores previous snapshots.
- **After rollback:** `pip uninstall slowapi` + `sudo supervisorctl restart backend`.
- **Runtime data impact:** NONE — middleware only; no DB changes.

---

## 8. Downstream impact

| Consumer | Effect |
|---|---|
| All frontend API calls | Unchanged — same URLs, same auth headers. CORS headers now explicit. |
| CR-2026-09-12-005 snapshots | One-time delta for new security headers — handled by snapshot regen in §3. |
| CR-2026-09-12-006 (backend split) | Middleware moves to `app/core/middleware.py` — no logic change. |
| CR-2026-09-12-003 (OTP echo) | Rate-limit on `send-otp` is already set here (10/min/IP). CR-003 adds phone-based attempt cap on top. |

---

## 9. Compact Planning output (Alpha v0.1 §8 Role 2)

```
Planning complete: CR-2026-09-12-004
Stage: Implementation Plan — WRITTEN 2026-09-13
Risk: CRITICAL (server.py CRITICAL hotspot; CORS misconfiguration = full auth bypass)
Files WILL change: 5
  - backend/requirements.txt (append slowapi==0.1.10)
  - backend/.env (append CORS_ORIGIN_REGEX + RATE_LIMIT_AUTH)
  - backend/.env.example (uncomment TODO lines from F-07)
  - backend/server.py (6 surgical edits — A through F)
  - backend/tests/fixtures/snapshots/*.json (one-time regen)
Files WILL NOT touch: all frontend src, frontend/.env, .emergent/*, router include block
Owner decisions: ALL frozen from IA (D-004-1..8 + A-1..7)
Verification matrix: 11 checks (VS-1..VS-11)
Critical pre-check: CORS_ORIGINS in .env must NOT be "*" before server.py Edit B runs
Rollback: git revert + pip uninstall slowapi + supervisorctl restart — zero data impact
Prerequisites: CR-005 P1 CLOSED, CR-007 F-07 CLOSED
Docs: this file
Next gate: OWNER APPROVAL REQUIRED before Role 3 (Implementation) may start.
```

---

## OWNER APPROVAL GATE

```
OWNER APPROVAL REQUIRED
Reason: Implementation Plan complete. This CR touches server.py (CRITICAL hotspot).
        Role 3 (Implementation) may not start until owner approves.
Risk: CRITICAL
Proposed next step: Owner says "go" on CR-004 → Role 3 implements surgical edits A–F
                   in exact order, then runs 5-step restart + smoke sequence.
Prerequisites: CR-005 P1 CLOSED + CR-007 F-07 CLOSED.
I will not proceed until owner approves.
```
