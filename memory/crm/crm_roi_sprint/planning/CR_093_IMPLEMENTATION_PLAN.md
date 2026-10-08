# CR-093 — Implementation Plan (ships SECOND, after CR-098 closes)
## Public customer lookup `POST /scan/auth/lookup` → `{exists, name}`

**Date**: 2026-10-08 · **Role**: Planning Agent · **Risk**: HIGH (new public unauthenticated route; phone-enumeration surface mitigated by rate-limit) · **Effort**: ~2 h impl + 30 min QA
**Impact Analysis**: `planning/CR_093_IMPACT_ANALYSIS.md` (complete; all Q1–Q7 FINAL 2026-10-08)
**Gate**: ⏸ Plan written now per owner; **implementation gate opens only after CR-098 is CLOSED** (owner D-1: one after another). Line anchors below assume 098 has landed — re-verify in pre-flight.

## Frozen decisions (from IA §7/§8 — do not re-open)
| Q | Ruling |
|---|---|
| Q1 | Rate-limit **10/min per IP** and **5 per 5 min per (phone+rid)** → 429 + `Retry-After` |
| Q2 | Return full stored `name` (Customer App trims) |
| Q3 | Blank/missing stored name → `name: null` |
| Q4 | Duplicate `(user_id, phone, country_code)` → **oldest** (`created_at` asc) |
| Q5 | Limiter state in **Mongo** collection `scan_lookup_attempts` with TTL index (multi-replica safe) |
| Q6 | Add `customers {user_id:1, phone:1}` non-unique index at startup |
| Q7 | Request `{phone, country_code?, restaurant_id}`; normalise `phone` → digits only; `country_code` default `"+91"`, must match `^\+\d{1,4}$`; match `{user_id, phone, country_code}`; invalid → 400 |
| — | `is_blocked` customers → `exists: false` (never leak); `_resp` envelope; rid via `_normalize_restaurant_id`; marker `# CR-093:` |

## 0. Pre-flight
```bash
cd /app/backend
grep -n "^# CR-098:" routers/scan.py                       # 098 landed (2 markers)
grep -n "class SkipOTPRequest\|@router.post(\"/auth/skip-otp\")\|@router.get(\"/auth/me\")" routers/scan.py
grep -n "idx_customers_user_id" server.py                   # ~80 → anchor for new index
grep -n "x-forwarded-for" core/pos_request_logger.py        # 284 → IP extraction pattern to copy
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/api/scan/auth/lookup" -d '{}' -H 'Content-Type: application/json'   # 404 (not built)
```

## 1. Files WILL change / WILL NOT touch
| File | Change |
|---|---|
| `backend/routers/scan.py` | + `LookupRequest` model (Request Schemas block) · + `_client_ip(request)` helper · + `_check_lookup_rate_limit(ip, phone_key)` · + `POST /auth/lookup` route placed **after `/auth/me`** in C1 block |
| `backend/server.py` | + 2 startup `create_index` calls (wrapped like CR-078): `customers {user_id:1, phone:1}` name `idx_customers_user_phone`; `scan_lookup_attempts {expires_at:1}` `expireAfterSeconds=0` name `ttl_scan_lookup_attempts`; + `scan_lookup_attempts {key:1, created_at:1}` name `idx_lookup_key_created` |
**WILL NOT touch**: `skip-otp`, `/auth/me`, `/profile*`, `core/auth.py`, `models/schemas.py`, frontend, existing collections' documents, `.env`

## 2. Edits
**E1 `scan.py` — model** (Request Schemas block, after `SkipOTPRequest`):
```python
class LookupRequest(BaseModel):  # CR-093
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"
```
**E2 `scan.py` — helpers** (Helpers block):
```python
_LOOKUP_IP_LIMIT = (10, 60)        # CR-093 Q1: 10 per 60 s per IP
_LOOKUP_PHONE_LIMIT = (5, 300)     # CR-093 Q1: 5 per 300 s per phone+rid

def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() or (request.client.host if request.client else "unknown")

async def _lookup_rate_limited(key: str, limit: int, window_s: int) -> Optional[int]:
    """CR-093 Q5: Mongo-backed sliding window. Returns Retry-After seconds if over limit, else None."""
    now = datetime.now(timezone.utc)
    since = (now - timedelta(seconds=window_s)).isoformat()
    n = await db.scan_lookup_attempts.count_documents({"key": key, "created_at": {"$gte": since}})
    if n >= limit:
        oldest = await db.scan_lookup_attempts.find_one({"key": key, "created_at": {"$gte": since}}, {"_id": 0, "created_at": 1}, sort=[("created_at", 1)])
        retry = max(1, window_s - int((now - datetime.fromisoformat(oldest["created_at"])).total_seconds()))
        return retry
    await db.scan_lookup_attempts.insert_one({"key": key, "created_at": now.isoformat(), "expires_at": now + timedelta(seconds=window_s)})
    return None
```
(`timedelta` re-added to the datetime import; `Request` imported from fastapi; `Optional` already imported.)

**E3 `scan.py` — route** (C1 block, after `/auth/me`):
```python
@router.post("/auth/lookup")
async def lookup_customer(req: LookupRequest, request: Request):
    """CR-093: public, read-only existence check. Never creates, never returns a token."""
    phone = re.sub(r"\D", "", req.phone or "")
    cc = (req.country_code or "+91").strip()
    if not (6 <= len(phone) <= 15) or not re.fullmatch(r"\+\d{1,4}", cc):
        raise HTTPException(status_code=400, detail="Invalid phone or country_code")
    full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)
    for key, (limit, window) in ((f"ip:{_client_ip(request)}", _LOOKUP_IP_LIMIT),
                                 (f"ph:{full_restaurant_id}:{cc}{phone}", _LOOKUP_PHONE_LIMIT)):
        retry = await _lookup_rate_limited(key, limit, window)
        if retry:
            raise HTTPException(status_code=429, detail="Too many lookups", headers={"Retry-After": str(retry)})
    customer = await db.customers.find_one(
        {"user_id": full_restaurant_id, "phone": phone, "country_code": cc, "is_blocked": {"$ne": True}},
        {"_id": 0, "name": 1},
        sort=[("created_at", 1)],          # Q4 oldest
    )
    if not customer:
        return _resp(True, "Not found", {"exists": False, "name": None})
    name = (customer.get("name") or "").strip() or None   # Q3
    return _resp(True, "Found", {"exists": True, "name": name})
```
Note on `country_code` match: records missing the field (CSV-imported, see IA §9 G2) won't match until CR-085 backfills `country_code` — accepted; documented in change-log row.

**E4 `server.py` — indexes** (after CR-078 block ~L82):
```python
    # CR-093: lookup hot path + limiter TTL
    try:
        await db.customers.create_index([("user_id", 1), ("phone", 1)], name="idx_customers_user_phone")
        await db.scan_lookup_attempts.create_index([("key", 1), ("created_at", 1)], name="idx_lookup_key_created")
        await db.scan_lookup_attempts.create_index("expires_at", name="ttl_scan_lookup_attempts", expireAfterSeconds=0)
    except Exception as e:
        logging.getLogger(__name__).warning(f"CR-093 indexes skipped: {e}")
```
Order: E4 → E1 → E2 → E3 → restart.

## 3. Self-test
| # | Check | Expected |
|---|---|---|
| L1 | `{}` body | 422 |
| L2 | `{"phone":"abc","restaurant_id":"689"}` | 400 |
| L3 | `{"phone":"98765 43210","country_code":"+91","restaurant_id":"689"}` where no such customer | 200 `{exists:false,name:null}`; **no new customer** (count unchanged) |
| L4 | known 10-digit customer of r689 with a name | 200 `{exists:true,name:"<name>"}` |
| L5 | known blank-name customer (one of 21) | `{exists:true,name:null}` |
| L6 | duplicate phone group (r635 `9309105737`) | returns oldest's name (`"Siddhi Malani"` from 2026-07-13 record) |
| L7 | `country_code:"+61"` with r541 foreign diner | `exists:false` today (phone stored with `+61 ` inside) — expected until CR-085; log as known |
| L8 | 11 rapid calls same IP | 11th → 429 with `Retry-After` header |
| L9 | 6 calls same phone+rid (different IPs via `X-Forwarded-For`) | 6th → 429 |
| L10 | `db.scan_lookup_attempts` has TTL index; `customers` has `idx_customers_user_phone` | `list_indexes` |
| L11 | `explain()` on the lookup query | uses `idx_customers_user_phone` |
| L12 | `skip-otp`, `/auth/me`, staff `/api/auth/login` | unchanged 422/200/200 |

## 4. Rollback
Remove route + helpers + model; indexes are harmless to leave (or `dropIndex`).

## 5. Exit-gate deliverables
Dashboard row 093 → 🟢 · markers · `qa/CR_093_QA_HANDOVER.md` (L1–L12) · change-log Wave 2 row "CR-093 lookup LIVE" CONFIRMED with request/response sample · note CR-089 can reuse `_lookup_rate_limited` · session handover.

```text
Status: PLAN WRITTEN — implementation gate NOT open until CR-098 is CLOSED (owner D-1)
Then: OWNER APPROVAL REQUIRED (HIGH, new public auth-adjacent route, contract change)
```
