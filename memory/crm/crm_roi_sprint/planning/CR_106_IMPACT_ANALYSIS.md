# CR-106 — Impact Analysis: `GET /scan/coupons?channel=` additive filter
**Date**: 2026-10-09 · **Role**: Planning Agent · **Source**: Intake `discovery/SESSION_2026_10_09_INTAKE_BUG034_CR105_CR106_CR107.md` §3 · **Status**: 🟡 IA in progress — owner decisions Q1/Q2 pending · **No code changed.**

---

## 1. Code reality (read-only 2026-10-09)

### Current route — `scan.py:462–483`

```python
@router.get("/coupons")
async def get_available_coupons(auth: dict = Depends(verify_customer_token)):
    now = datetime.now(timezone.utc).isoformat()
    coupons = await db.coupons.find({
        "user_id": auth["restaurant_id"],
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now}
    }, {"_id": 0}).to_list(50)
    # then filters by specific_users and per_user_limit...
```

**No `channel` filter anywhere.** Returns all date-valid active coupons regardless of `applicable_channels`.

### Schema — `models/schemas.py`

| Model | Field | Default |
|---|---|---|
| `CouponCreate` | `applicable_channels: List[str] = ["delivery", "takeaway", "dine_in"]` | All 3 when created |
| `CouponUpdate` | `applicable_channels: Optional[List[str]] = None` | Optional on edit |

### Live data (r689 Kunafa Mahal, 31 active coupons)

| Channel | Coupons that include it |
|---|---|
| `dine_in` | 31/31 |
| `delivery` | 29/31 |
| `takeaway` | 29/31 |
| Missing `applicable_channels` field | 0 |

**2 coupons don't apply to delivery/takeaway** — today these appear in the Customer App regardless of the diner's context.

### ⚠️ Finding — `"pos"` is a valid channel value

Across all tenants, `applicable_channels` contains: `['delivery', 'dine_in', 'pos', 'takeaway']`. Some coupons are marked `applicable_channels: ["pos"]` — meaning **POS-only, not for Customer App**. Today these surface in `GET /scan/coupons` and `POST /scan/coupons/validate`. This is a **pre-existing gap** regardless of CR-106.

---

## 2. Proposed change

Add an **optional `channel` query parameter** to `GET /scan/coupons`:

```python
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,          # CR-106: "dine_in" | "delivery" | "takeaway"
    auth: dict = Depends(verify_customer_token)
):
    query = {
        "user_id": auth["restaurant_id"],
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now},
    }
    if channel:
        query["applicable_channels"] = {"$in": [channel]}  # CR-106
    ...
```

- `?channel=dine_in` → returns only coupons that include `"dine_in"` in their `applicable_channels`
- No `channel` param → current behaviour (no filter) — **fully backward compatible**

---

## 3. Owner questions

| Q | Question | Recommendation |
|---|---|---|
| **Q1** | Default when `channel` not sent: **(a) no filter** (current, backward compatible) · **(b) always filter to `"dine_in"`** (safer for S&O default) | **(a) no filter** — backward compatible; S&O passes channel explicitly |
| **Q2** | `"pos"`-only coupons (e.g. `applicable_channels:["pos"]`): should they be **excluded from scan route always** (even without channel param)? | **Yes, recommended** — add `"pos"` exclusion to the base query: `"applicable_channels": {"$nin": [["pos"]]}` or filter in Python. A POS-only coupon has no meaning in the Customer App. This is additive to the channel param and closes the pre-existing gap. |

---

## 4. Blast radius

- **Files WILL change**: `backend/routers/scan.py` (~3 lines: 1 param + 1 conditional query addition)
- **Files WILL NOT touch**: `models/schemas.py` · `core/coupon.py` · frontend · stored data
- **Risk**: LOW — additive query param; default preserves current behaviour; no writes

---

## 5. Verification

| V | Check | Expected |
|---|---|---|
| V1 | `GET /scan/coupons?channel=dine_in` | only coupons with `"dine_in"` in `applicable_channels` |
| V2 | `GET /scan/coupons?channel=delivery` | returns 2 fewer coupons than V1 (2 dine-in-only for r689) |
| V3 | `GET /scan/coupons` (no param) | same as today — backward compat |
| V4 | If Q2=yes: `GET /scan/coupons` — POS-only coupon excluded | `"pos"`-only coupons absent |

---

```
Planning complete: CR-106
Stage: Impact Analysis
Code reality: PARTIAL (applicable_channels field exists on all r689 docs; no filter in route)
Risk: LOW (additive query param, 3 lines, backward compatible)
Files WILL change: routers/scan.py (1 param + 1 query condition)
Files WILL NOT touch: schemas.py · coupon.py · frontend · data
Owner decisions: Q1 (default no-filter vs dine_in default) · Q2 (always exclude pos-only coupons)
⚠️ Finding: applicable_channels includes "pos" value — pos-only coupons surface in Customer App today (pre-existing gap, Q2 addresses it)
Docs: planning/CR_106_IMPACT_ANALYSIS.md
Next: owner answers Q1/Q2 → Implementation Plan
```
