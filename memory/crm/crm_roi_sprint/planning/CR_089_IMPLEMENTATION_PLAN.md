# CR-089 — Implementation Plan
## Rate-limit `POST /scan/auth/skip-otp` (the only diner identity path)

**Date**: 2026-10-09 · **Role**: Planning Agent · **Risk**: HIGH (sole identity path; new 429 on a public route = contract change)
**Impact Analysis**: `planning/CR_089_IMPACT_ANALYSIS.md` (gate closed 2026-10-09)
**Frozen decisions**: Q1 implement · Q2 moot · **D-1 IP 30/min, phone+restaurant 5 per 5 min** · **D-2 separate counters** (`so-ip:` / `so-ph:`)
**Effort**: ~45 min impl + 20 min QA
**Gate**: ⏸ OWNER APPROVAL REQUIRED before implementation.

## 0. Pre-flight
```bash
cd /app/backend
grep -n "_LOOKUP_IP_LIMIT\|_LOOKUP_PHONE_LIMIT\|def _client_ip\|async def _lookup_rate_limited" routers/scan.py   # 48, 49, 52, 57
grep -n '@router.post("/auth/skip-otp")\|async def skip_otp_login(req: SkipOTPRequest)' routers/scan.py        # 200, 201
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/api/scan/auth/skip-otp" -H 'Content-Type: application/json' -d '{}'   # 422 (alive, no 429 path yet)
```

## 1. Files WILL change / WILL NOT touch
**WILL change (1)**: `backend/routers/scan.py` — constants + `skip_otp_login` only.
**WILL NOT touch**: `_lookup_rate_limited`, `_client_ip`, `lookup`, find-or-create body, token TTL, response shape, `server.py` (indexes exist), frontend, DB docs.

## 2. Edits
**E1 — constants** (after L49):
```python
_SKIP_OTP_IP_LIMIT = (30, 60)      # CR-089 D-1: 30 per 60 s per IP (restaurant shared Wi-Fi)
_SKIP_OTP_PHONE_LIMIT = (5, 300)   # CR-089 D-1: 5 per 300 s per phone+restaurant
```
**E2 — signature** L201: `async def skip_otp_login(req: SkipOTPRequest):` → `async def skip_otp_login(req: SkipOTPRequest, request: Request):`
**E3 — limiter block** inserted after L203 (`full_restaurant_id = ...`), before `now = ...`:
```python
    # CR-089: rate-limit the only identity path. Separate buckets from lookup (D-2). Key normalised to digits; stored value untouched (CR-085).
    phone_key = re.sub(r"\D", "", req.phone or "")
    for key, (limit, window) in (
        (f"so-ip:{_client_ip(request)}", _SKIP_OTP_IP_LIMIT),
        (f"so-ph:{full_restaurant_id}:{phone_key}", _SKIP_OTP_PHONE_LIMIT),
    ):
        retry = await _lookup_rate_limited(key, limit, window)
        if retry:
            raise HTTPException(status_code=429, detail="Too many login attempts", headers={"Retry-After": str(retry)})
```
Nothing else in the function changes. `re`, `Request`, `HTTPException` already imported (CR-093).

## 3. Self-test (preview)
| # | Check | Expected |
|---|---|---|
| S1 | `{}` | 422 (validation before limiter — FastAPI) |
| S2 | valid existing phone, fresh IP | 200 + `data.token`, `is_new:false` (unchanged) |
| S3 | 31 calls, same `X-Forwarded-For`, 31 **existing** phones (no creates) | 30×200, 31st → 429, `Retry-After` int, detail "Too many login attempts" |
| S4 | 6 calls same existing phone+rid, 6 different IPs | 5×200, 6th → 429 |
| S5 | after S3, `lookup` from the same IP | 200 — counters separate (D-2) |
| S6 | `scan_lookup_attempts` keys | `so-ip:*`, `so-ph:*` present; lookup's `ip:`/`ph:` untouched |
| S7 | `customers` count before/after S2–S5 | unchanged (only existing phones used) |
| S8 | regression: `lookup` 200 · `/auth/me` 403 no-token · staff login 200 · `register`/`login` 404 |
| S9 | existing suites `backend/tests/test_cr084_cr097.py`, `test_cr098.py`, `test_cr093_lookup.py` | green (each ≤2 skip-otp calls) |
| S10 | backend err log clean; `supervisorctl` RUNNING |

## 4. Rollback
Remove E1–E3 (≈12 lines). Limiter rows expire via TTL.

## 5. Exit-gate deliverables
Dashboard row 089 → 🟢 + transition · `# CR-089` marker · `qa/CR_089_QA_HANDOVER.md` · change-log Wave 2 row "skip-otp now returns 429 + Retry-After (30/min/IP, 5/5min/phone)" CONFIRMED · consumer validation note to Scan & Order (rule 2026-10-08) · session handover.

## 6. Plain-English risk
| Risk | Level | Why OK |
|---|---|---|
| Real diners blocked on shared Wi-Fi | Low | 30/min/IP = a diner every 2 s at one counter; `lookup` has its own budget |
| One diner retrying | None | 5 per 5 min per phone; app does 1 call per visit |
| Behaviour of find-or-create / token | None | untouched; limiter runs before |
| Customer App surprise | Low | same 429 shape as `lookup` they already handle; validation note sent |

```text
OWNER APPROVAL REQUIRED
Reason: start implementation of CR-089; auth-adjacent; new 429 response on a public route (contract change)
Risk: HIGH
Proposed next step: Implementation role — scan.py E1–E3, restart, self-test S1–S10, QA, consumer note
I will not proceed until owner approves.
```
