# CR-088 — Impact Analysis + Implementation Plan: `/scan/*` list hygiene
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: INV-017 GAP-09/12, P-2/P-3/P-6 · Customer App D4 · `discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md §5` · **Risk**: LOW–MEDIUM (additive read-only changes; backward compatible) · **No owner questions — IA and Impl Plan written together.** · **Status**: ✅ OWNER APPROVED — implementation gate opens on "choose implementation role for CR-088" · **No code changed.**

---

## 1. Four items

| # | Item | Gap | Intake ref |
|---|---|---|---|
| (a) | `skip` query param on `/scan/orders`, `/scan/points/history`, `/scan/wallet/history` | No offset → app can only show first 50; can't page | GAP-12, P-3 |
| (b) | True `total` (count_documents) on `/scan/points/history` + `/scan/wallet/history` | Returns `len(rows_returned)` — meaningless once capped | GAP-12, P-2 |
| (c) | `expiring_soon` + `expiring_date` in `/scan/loyalty` | App can't show "N pts expire on DD/MM" | P-6 |
| (d) | Serve OpenAPI at `/api/openapi.json` | FastAPI default is `/openapi.json` (no `/api` prefix) → CA-9 contract | GAP-09 |

---

## 2. Code reality (read-only 2026-10-09)

### List routes

| Route | `skip`? | `total` | Lines |
|---|---|---|---|
| `GET /scan/orders` | ❌ | ✅ `count_documents` | :388–396 |
| `GET /scan/points/history` | ❌ | ❌ `len(txns)` only | :368–375 |
| `GET /scan/wallet/history` | ❌ | ❌ `len(txns)` only | :378–385 |

All three already cap at `min(limit, 50)`. `skip` needs clamping to `max(skip, 0)`.

### `expiring_soon` logic

Staff endpoint `GET /points/expiring/{customer_id}` (`points.py:218–265`) has the full calculation:

```
expiry_months = settings.points_expiry_months (default 6)
reminder_days = settings.expiry_reminder_days  (default 30)
expiry_cutoff    = now − expiry_months×30 days      ← points older than this = already expired
reminder_cutoff  = now − (expiry_months×30 − reminder_days) ← older than THIS but not expired = expiring soon
→ sum earn/bonus txns where expiry_cutoff ≤ tx_date < reminder_cutoff → expiring_soon
→ earliest tx_date + expiry_months×30 days → expiring_date
```

r689 live data: `points_expiry_months: 2`, `expiry_reminder_days` not set (default 30).
`points_transactions` has no stored `expiry_date` field — expiry always computed from `created_at`. ✅

`timedelta` already imported in `scan.py:8`. No new imports needed for (c).

### OpenAPI

`server.py:168`: `app = FastAPI(title="DinePoints - Loyalty & CRM", lifespan=lifespan)` — no `openapi_url` set.
FastAPI default → `/openapi.json` (outside `/api` prefix). Fix = one keyword arg.

---

## 3. No owner questions

All 4 items are additive and backward compatible. Default values preserve existing behaviour:
- `skip=0` → same result as today
- `total` is a new key alongside existing keys → no breaking change
- `expiring_soon`/`expiring_date` are new keys on the loyalty response
- `/api/openapi.json` is a new URL; the old `/openapi.json` continues to work by FastAPI default

---

## 4. Edits (5 total)

### E1 — `routers/scan.py` — `get_orders`: add `skip` param
```python
# Before
async def get_orders(limit: int = 20, auth: dict = Depends(verify_customer_token)):
    ...
    orders = await db.orders.find(...).sort("created_at", -1).limit(min(limit, 50)).to_list(min(limit, 50))
    total = await db.orders.count_documents(...)
    return _resp(True, f"{len(orders)} orders", {"orders": orders, "total": total})

# After
async def get_orders(limit: int = 20, skip: int = 0, auth: dict = Depends(verify_customer_token)):  # CR-088: +skip
    _limit, _skip = min(limit, 50), max(skip, 0)
    orders = await db.orders.find(...).sort("created_at", -1).skip(_skip).limit(_limit).to_list(_limit)
    total = await db.orders.count_documents(...)
    return _resp(True, f"{total} orders", {"orders": orders, "total": total, "skip": _skip, "limit": _limit})
```

### E2 — `routers/scan.py` — `get_points_history`: add `skip` + true `total`
```python
# Before
async def get_points_history(limit: int = 20, auth: dict = Depends(verify_customer_token)):
    txns = ...find(...).sort("created_at", -1).limit(min(limit, 50)).to_list(min(limit, 50))
    return _resp(True, f"{len(txns)} transactions", {"transactions": txns, "total": len(txns)})

# After
async def get_points_history(limit: int = 20, skip: int = 0, auth: dict = Depends(verify_customer_token)):  # CR-088
    _limit, _skip = min(limit, 50), max(skip, 0)
    txns = ...find(...).sort("created_at", -1).skip(_skip).limit(_limit).to_list(_limit)
    total = await db.points_transactions.count_documents({"customer_id": ..., "user_id": ...})
    return _resp(True, f"{total} transactions", {"transactions": txns, "total": total, "skip": _skip, "limit": _limit})
```

### E3 — `routers/scan.py` — `get_wallet_history`: add `skip` + true `total` (mirror of E2)
```python
# Same pattern as E2 but for wallet_transactions
```

### E4 — `routers/scan.py` — `get_loyalty`: add `expiring_soon`/`expiring_date`
Inline the `points.py:218–265` calculation (already uses `timedelta` which is imported). Add after `settings = ...find(...)`:

```python
# CR-088: expiring_soon — inline staff expiring logic (points.py:218-265)
expiry_months = settings.get("points_expiry_months", 6) if settings else 6
expiring_soon_pts, expiring_date = 0, None
if expiry_months > 0:
    reminder_days = settings.get("expiry_reminder_days", 30) if settings else 30
    now_dt = datetime.now(timezone.utc)
    expiry_cutoff   = now_dt - timedelta(days=expiry_months * 30)
    reminder_cutoff = now_dt - timedelta(days=(expiry_months * 30) - reminder_days)
    earn_txns = await db.points_transactions.find(
        {"customer_id": auth["customer_id"], "user_id": auth["restaurant_id"],
         "transaction_type": {"$in": ["earn", "bonus"]}},
        {"_id": 0, "points": 1, "created_at": 1}
    ).to_list(1000)
    for tx in earn_txns:
        tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00")) if isinstance(tx["created_at"], str) else tx["created_at"]
        if tx_date.tzinfo is None:
            tx_date = tx_date.replace(tzinfo=timezone.utc)
        if expiry_cutoff <= tx_date < reminder_cutoff:
            expiring_soon_pts += tx["points"]
            exp_d = tx_date + timedelta(days=expiry_months * 30)
            if expiring_date is None or exp_d < expiring_date:
                expiring_date = exp_d
```

Add to return dict:
```python
"expiring_soon": max(0, expiring_soon_pts),
"expiring_date": expiring_date.isoformat() if expiring_date else None,
```

### E5 — `server.py:168` — add `openapi_url`
```python
# Before
app = FastAPI(title="DinePoints - Loyalty & CRM", lifespan=lifespan)
# After
app = FastAPI(title="DinePoints - Loyalty & CRM", lifespan=lifespan, openapi_url="/api/openapi.json")  # CR-088
```

---

## 5. Edit order

```
E5 (server.py — zero risk, isolated) → E1 → E2 → E3 → E4 → V1–V7 self-test
```

---

## 6. Verification matrix

| V | Check | Expected |
|---|---|---|
| V1 | `GET /scan/orders?skip=0&limit=5` (valid customer token) | 5 orders, `total`=real count, `skip=0` |
| V2 | `GET /scan/orders?skip=5&limit=5` | next 5 orders, different set from V1 |
| V3 | `GET /scan/points/history?skip=0` | `total`= real DB count (not just row count) |
| V4 | `GET /scan/points/history?skip=20` | offset works; `total` unchanged |
| V5 | `GET /scan/wallet/history` | `total` = real count (0 for most tenants) |
| V6 | `GET /scan/loyalty` | response has `expiring_soon` (int ≥ 0) + `expiring_date` (ISO string or null) |
| V7 | `GET /api/openapi.json` | 200, valid JSON with `openapi` version field |
| V8 | `GET /scan/orders` (no params) | backward compatible — same behaviour as before CR-088 |

---

## 7. Files

**WILL change**: `backend/routers/scan.py` (E1–E4, ~40 lines total) · `backend/server.py` (E5, 1 line)

**WILL NOT touch**: `routers/points.py` (logic copied, not called) · `routers/pos.py` · `routers/customers.py` · `models/schemas.py` · frontend · stored data · indexes (count_documents uses existing `{user_id, customer_id}` index pattern)

---

## 8. Risk notes

- `count_documents` adds one extra DB round-trip per list endpoint. For a customer with 8,468 points transactions (r689 baseline), this is a fast indexed count — acceptable.
- `get_loyalty` now fetches earn/bonus txns (up to 1,000). Most diners have <200 earn transactions. This matches exactly what `points.py:236-240` already does for staff.
- `openapi_url` change requires supervisor restart (server.py edit). Not a hot-reload change.

---

```
Planning complete: CR-088
Stage: Impact Analysis + Implementation Plan (combined — no owner questions)
Code reality: PARTIAL (orders has skip-less pagination + true total; points/wallet missing skip + true total; loyalty missing expiring_soon; openapi at wrong path)
Risk: LOW–MEDIUM (additive read routes + 1-line server.py)
Files WILL change: routers/scan.py (E1–E4) · server.py (E5)
Files WILL NOT touch: points.py · pos.py · customers.py · schemas.py · frontend · data
Owner decisions: none — all additive, backward compatible
Docs: planning/CR_088_IMPACT_ANALYSIS.md (this file)
Next: "choose implementation role for CR-088" → implement
```
