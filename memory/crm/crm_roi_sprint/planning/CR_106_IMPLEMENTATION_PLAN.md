# CR-106 — Implementation Plan: `GET /scan/coupons?channel=` + pos-only exclusion
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_106_IMPACT_ANALYSIS.md` (Q1=A · Q2=YES locked) · **Risk**: LOW (additive query param, 5 lines, backward compatible) · **Status**: ✅ OWNER APPROVED — gate opens on "choose implementation role for CR-106" · **No code changed.**

---

## 0. Decisions locked

| Q | Decision |
|---|---|
| **Q1** | **A — no default filter.** S&O passes `?channel=` explicitly. No `?channel=` → returns all consumer coupons (pos-only excluded). |
| **Q2** | **YES — always exclude pos-only coupons** from `GET /scan/coupons` regardless of channel param. pos-only = `applicable_channels` contains no consumer channel. |
| **Business rules** | POS receives all coupons (channel advisory). S&O: `dine_in` / `delivery` / `takeaway`. Hotel rooms = `dine_in`. pos-only = POS-till exclusive, never S&O. |

---

## 1. Code reality

**Current route** (`scan.py:462–483`):
```python
coupons = await db.coupons.find({
    "user_id": auth["restaurant_id"],
    "is_active": True,
    "start_date": {"$lte": now},
    "end_date": {"$gte": now}
}, {"_id": 0}).to_list(50)
```
No channel filter. Returns all active coupons including pos-only.

---

## 2. Edit — E1 (single edit, ~5 lines)

```python
# Before
@router.get("/coupons")
async def get_available_coupons(auth: dict = Depends(verify_customer_token)):
    ...
    coupons = await db.coupons.find({
        "user_id": auth["restaurant_id"],
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now}
    }, {"_id": 0}).to_list(50)

# After
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,  # CR-106: "dine_in" | "delivery" | "takeaway"
    auth: dict = Depends(verify_customer_token)
):
    ...
    # CR-106: base filter always excludes pos-only coupons (no consumer channel)
    ch_filter = {"$in": [channel]} if channel else {"$in": ["dine_in", "delivery", "takeaway"]}
    coupons = await db.coupons.find({
        "user_id": auth["restaurant_id"],
        "is_active": True,
        "start_date": {"$lte": now},
        "end_date": {"$gte": now},
        "applicable_channels": ch_filter,  # CR-106
    }, {"_id": 0}).to_list(50)
```

**Why this works:**
- `channel="dine_in"` → `{$in: ["dine_in"]}` → only dine_in coupons
- `channel=None` → `{$in: ["dine_in","delivery","takeaway"]}` → all consumer coupons, pos-only excluded
- Coupon `["pos","dine_in"]` → contains "dine_in" → ✅ included when channel=dine_in or no channel
- Coupon `["pos"]` → contains none of the 3 → ✅ excluded always

---

## 3. Verification

| V | Check | Expected |
|---|---|---|
| V1 | `GET /scan/coupons?channel=dine_in` | only coupons with `"dine_in"` in applicable_channels |
| V2 | `GET /scan/coupons?channel=delivery` | fewer coupons than V1 (2 dine-in-only excluded for r689) |
| V3 | `GET /scan/coupons` (no param) | all consumer coupons; pos-only coupons absent |
| V4 | `GET /scan/coupons` — confirm pos-only coupon NOT in response | 6 pos-only coupons (QA data) absent |
| V5 | `GET /scan/coupons?channel=dine_in` — coupon with `["pos","dine_in"]` | present (has dine_in → included) |
| V6 | Backward compat: existing behaviour unchanged for non-pos coupons without channel param | same count as before minus pos-only |

---

## 4. Files

**WILL change**: `backend/routers/scan.py` (E1: 1 param addition + 2 query lines changed = ~5 lines)

**WILL NOT touch**: `models/schemas.py` · `core/coupon.py` · `routers/pos.py` · frontend · stored data

---

```
Planning complete: CR-106
Stage: Implementation Plan
Risk: LOW
Files WILL change: routers/scan.py (~5 lines, 1 edit block)
Files WILL NOT touch: schemas.py · coupon.py · pos.py · frontend · data
Owner decisions: Q1=A · Q2=YES · business rules locked
Next: "choose implementation role for CR-106" → implement
```
