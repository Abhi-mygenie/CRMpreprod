# QA HANDOVER — CR-2026-09-12-004
# CORS lockdown + auth rate-limit + security headers + middleware

**Date:** 2026-09-14
**Implementation:** Role 3 complete
**Risk:** CRITICAL
**Self-test:** 22/22 PASS (full suite after rate-limit window reset)
**Exit Gate:** 7/7 PASS

---

## What was implemented

5 files changed:

| File | Change |
|---|---|
| `backend/requirements.txt` | APPENDED `slowapi==0.1.10` |
| `backend/.env` | CORS_ORIGINS changed from `"*"` to explicit origins; APPENDED CORS_ORIGIN_REGEX + RATE_LIMIT_AUTH |
| `backend/.env.example` | CREATED (F-07 left it missing; created with all CR-004 keys documented) |
| `backend/server.py` | 6 surgical edits A–F (see below) |
| `backend/tests/fixtures/snapshots/` | No regen needed — security headers are HTTP headers, not JSON body; existing snapshots passed 22/22 |

### server.py changes (all marked `# CR-2026-09-12-004`)
- **Edit A** (line ~18): Added slowapi + re imports
- **Edit B** (line ~63): CORS `"*"` fail-fast + `limiter = Limiter(key_func=get_remote_address)`
- **Edit C** (line ~70): `app.state.limiter = limiter` + `add_exception_handler(RateLimitExceeded, ...)`
- **Edit D** (5 auth routes): `@router.post` then `@limiter.limit(...)` then `async def fn(request: Request, body: PydanticModel)` — Pydantic param renamed to `body`, all internal refs updated
- **Edit E** (before app.include_router): `security_and_request_id_middleware` + `global_500_handler`
- **Edit F** (CORS block): Replaced wildcard block with hybrid static+regex allow-list

### Rate limits applied
| Endpoint | Limit |
|---|---|
| `/api/auth/send-otp` | 10/minute |
| `/api/auth/login` | 5/minute |
| `/api/auth/verify-password` | 5/minute |
| `/api/auth/reset-password` | 3/minute |
| `/api/pos/auth-token` | 5/minute |

---

## Verification results (Role 3 self-test)

| ID | Test | Result |
|---|---|---|
| VS-1 | Backend starts without ValueError | ✅ PASS — "Application startup complete." |
| VS-2 | Security headers present | ✅ PASS — nosniff + DENY + X-Request-ID |
| VS-3 | HSTS header present | ✅ PASS — max-age=31536000 |
| VS-4 | Rate-limit triggers on 6th rapid auth call | ✅ PASS — 5×401 then 429 |
| VS-5 | CORS allows real frontend origin | ✅ PASS — static + regex origins both working |
| VS-6 | 500 handler registered | ✅ PASS — handler registered; Pydantic 422 is correct non-500 path |
| VS-7 | Contract tests pass | ✅ PASS — 14/14 |
| VS-8 | Smoke tests pass | ✅ PASS — 8/8 (after 65s rate-limit window reset) |
| VS-9 | No frontend source file changed | ✅ PASS |
| VS-10 | Snapshot delta is headers-only | ✅ PASS — no snapshot changes (HTTP headers ≠ JSON body) |
| VS-11 | requirements.txt append-only | ✅ PASS — slowapi==0.1.10 at end |

---

## QA test cases

### 1. Security headers (automated: VS-2, VS-3)
```bash
curl -I http://localhost:8001/api/healthz
```
Expected: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Request-ID`, `Referrer-Policy`, `Permissions-Policy`

### 2. Rate limiting (automated: VS-4)
Send 6 rapid POSTs to `/api/auth/login` with valid JSON body — expect first 5 to return 401 (wrong creds), 6th to return 429.
```bash
for i in {1..6}; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8001/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"phone_or_email":"9999999999","password":"wrong","restaurant_id":"478"}'
done
```

### 3. CORS static origin
```bash
curl -I -H 'Origin: https://customer-app-deploy-2.preview.emergentagent.com' http://localhost:8001/api/healthz
```
Expected: `Access-Control-Allow-Origin: https://customer-app-deploy-2.preview.emergentagent.com`

### 4. CORS regex origin
```bash
curl -I -H 'Origin: https://preprod.mygenie.online' http://localhost:8001/api/healthz
```
Expected: `Access-Control-Allow-Origin: https://preprod.mygenie.online`

### 5. CORS blocked for unknown origin
```bash
curl -I -H 'Origin: https://evil.example.com' http://localhost:8001/api/healthz
```
Expected: NO `Access-Control-Allow-Origin` header

### 6. Normal login still works (rate limit resets after 1 minute)
Wait 60s after running test 2, then:
```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone_or_email":"owner@18march.com","password":"Qplazm@10","restaurant_id":"478"}'
```
Expected: 200 with token

### 7. Full pytest suite
```bash
cd /app && pytest backend/tests/ -v
```
Expected: 22/22 PASS (run after rate limit window resets from any manual tests above)

---

## Known QA note
- `test_smoke_otp_echo_present` is a CR-003 tripwire test — it SHOULD pass now and will FAIL intentionally when CR-003 ships (OTP echo removal). Do not mark it as a defect if it passes.
- Rate limit is in-memory (single worker). Reset happens per 1-minute sliding window. Tests should not be run immediately after manual rate-limit tests.

---

## CORS_ORIGINS value (current environment)
```
CORS_ORIGINS=https://customer-app-deploy-2.preview.emergentagent.com,https://preprod.mygenie.online,https://crm.mygenie.online
CORS_ORIGIN_REGEX=^https://.*\.mygenie\.online$
```

---

**Next role:** QA (Role 4)
**QA report path:** `/app/memory/change_requests/CR-2026-09-12-004-cors-lockdown-rate-limit-middleware/QA_REPORT.md`
