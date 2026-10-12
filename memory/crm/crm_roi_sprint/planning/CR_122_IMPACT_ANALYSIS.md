# CR-122 — Impact Analysis: `GET /scan/coupons` order_total + engine switch + requires_cart_validation + recommendation
**Date**: 2026-10-12 · **Role**: Planning Agent · **Risk**: LOW–MEDIUM · **No code changed. No data written.**
**Intake**: `discovery/CR_122_SCAN_COUPONS_ORDER_TOTAL_ENGINE_SWITCH_INTAKE.md`

---

## 1. Code reality (confirmed from live scan.py + core/coupon.py)

### 1.1 Current `GET /scan/coupons` — scan.py:467–530 (CR-121)

```python
# IMPORTS (line 23) — only validate_coupon_for_customer imported today
from core.coupon import validate_coupon_for_customer  # CR-105
# list_available_coupons is NOT imported ← Edit 1 adds it

# ROUTE SIGNATURE (lines 468–474) — no order_total param
async def get_available_coupons(
    channel: Optional[str] = None,
    restaurant_id: Optional[str] = None,    # CR-121
    request: Request = None,               # CR-121
    auth: Optional[dict] = Depends(optional_customer_token),
):
# ← Edit 2 adds: order_total: Optional[float] = None

# ROUTE BODY (lines 498–530)
# DB query with channel filter → inline Python loop
# Loop does: requires_customer / specific_users / per_user_limit
# Loop does NOT: min_order_value / time_window / requires_cart_validation / expected_discount
# Response: raw DB documents (no requires_cart_validation computed, no expected_discount)
```

### 1.2 `list_available_coupons` — core/coupon.py:1981–2133

```python
async def list_available_coupons(db, *, user_id, customer_id=None, order_total, channel, ...):
```

**What it does that the current scan loop does not:**

| Behaviour | current scan loop | `list_available_coupons` |
|---|---|---|
| Filter `min_order_value > order_total` | ❌ Not checked | ✅ via `validate_coupon_for_customer` |
| Time-window filter (happy-hour, weekday) | ❌ Not checked | ✅ `OUTSIDE_TIME_WINDOW` → included with `time_window.within_window_now: false` |
| Compute `requires_cart_validation` | ❌ Returns null | ✅ `(v3b_ot is not None) or (v3c_ot is not None)` (line 2064) |
| Compute `expected_discount` per coupon | ❌ Not present | ✅ Non-null for order-scope simple coupons |
| `requires_customer` filter | ✅ (CR-121) | ✅ via `validate_coupon_for_customer` line 1767 |
| `specific_users` filter | ✅ | ✅ via `validate_coupon_for_customer` line 1827 |
| `per_user_limit` filter | ✅ | ✅ via bulk `coupon_usage` aggregate |

**`list_available_coupons` is NOT currently imported in scan.py** → Edit 1 adds the import.

### 1.3 Response shape difference

**Current (raw DB document)** — includes every coupon DB field as-is.

**`list_available_coupons` output** — curated, well-typed shape:
```
id · code · title · display_title · coupon_type · discount_scope
discount_type · discount_value · min_order_value · max_discount
expected_discount · final_amount_preview · requires_cart_validation
eligible_match_hint · stackable_with_loyalty · valid_from · valid_until
offer_type · time_window{configured, within_window_now, valid_days, ...}
buy_quantity · get_quantity · get_discount_type · get_discount_value
max_applications · allow_repeat · same_item_required · pos_instruction
nth_item_number · nth_discount_type · nth_discount_value
```

**What the engine shape does NOT include** (present in raw DB doc today):
- `applicable_channels` — S&O already receives this from current route; not needed when channel is a request param
- `eligible_food_ids`, `eligible_item_ids`, `eligible_category_ids` — internal engine fields; S&O does not use
- `specific_users` — correctly filtered server-side; no need to expose to client

**New fields the engine shape adds** (not in raw DB doc):
- `requires_cart_validation: true/false` — always computed, never null ← Issue 2 fix
- `expected_discount` — computed discount amount for order-scope coupons ← needed for recommendation
- `time_window.within_window_now` — shows diner if coupon is currently in-window ← Issue 1 fix
- `display_title` — human-readable title (e.g. "Buy 3 Get 1 Free") ← better UX

**`my_usage_count`** — the current scan route adds this per-coupon for authenticated callers. `list_available_coupons` does not include it (it uses `usage_map` internally for `per_user_limit` only). **Must be added back** via a single additional aggregation call after the engine returns. See §2.3.

---

## 2. Proposed design

### 2.1 Two-path route (backward compatible)

```
order_total absent (default) → existing inline loop (no change)
order_total present          → list_available_coupons engine path (new)
```

Callers that don't pass `order_total` get the exact same response as today. No breaking change.

### 2.2 Engine path — step by step

```
1. Existing auth + rate-limit + resolve rid/customer_id block (unchanged — CR-121)

2. if order_total is not None:
     a. call list_available_coupons(db, user_id=rid, customer_id=customer_id,
                                     order_total=order_total, channel=channel or "dine_in")
        → eligible: list of curated coupon dicts
        → min_order filtered ✅ · time_window flagged ✅ · requires_cart_validation set ✅
        → expected_discount computed for simple coupons ✅
        → requires_customer / specific_users / per_user_limit handled by engine ✅

     b. add my_usage_count (authenticated path only — one extra aggregation):
        if customer_id:
            coupon_ids = [c["id"] for c in eligible]
            usage_pipeline = [
              {"$match": {"customer_id": customer_id, "coupon_id": {"$in": coupon_ids}}},
              {"$group": {"_id": "$coupon_id", "count": {"$sum": 1}}}
            ]
            usage_by_id = {row["_id"]: row["count"]
                           async for row in db.coupon_usage.aggregate(usage_pipeline)}
            for c in eligible:
                c["my_usage_count"] = usage_by_id.get(c["id"], 0)

     c. pick recommendation (simple non-cart coupons only):
        simple = [c for c in eligible
                  if not c.get("requires_cart_validation")
                  and (c.get("expected_discount") or 0) > 0]
        best = max(simple, key=lambda c: c["expected_discount"], default=None)

     d. return response with new top-level fields:
        return _resp(True, f"{len(eligible)} coupons available", {
            "coupons":              eligible,
            "recommended_code":     best["code"] if best else None,
            "recommended_discount": best["expected_discount"] if best else None,
        })

3. else:   # existing inline loop — unchanged
   ...existing code...
   return _resp(True, ..., {"coupons": eligible})   # no recommended_code (backward compat)
```

### 2.3 `my_usage_count` aggregation note

`list_available_coupons` already runs one `coupon_usage.aggregate()` internally for `per_user_limit` checking. This adds one more aggregation post-call for `my_usage_count`. Acceptable — one extra DB call vs N per-coupon count_documents in the old loop. Net: likely faster or equivalent.

### 2.4 Recommendation rule

For now: highest `expected_discount` among non-cart applicable coupons. No merchant-priority rules today. If multiple coupons tie on discount, pick any (deterministic via `max`). BXGY/BOGO coupons have `expected_discount: null` → excluded from recommendation (cannot compute without cart items).

---

## 3. Affected files

### Files WILL change

| File | Location | Change |
|---|---|---|
| `routers/scan.py` | line 23 (imports) | Add `list_available_coupons` to existing `from core.coupon import ...` |
| `routers/scan.py` | lines 468–474 (signature) | Add `order_total: Optional[float] = None  # CR-122` |
| `routers/scan.py` | lines 498–530 (body) | Add `if order_total is not None:` engine path (~25 lines) before existing else path |

**Total: ~28 lines net in one file.**

### Files WILL NOT change

| File | Reason |
|---|---|
| `core/coupon.py` | Engine used as-is — zero change |
| `models/schemas.py` | No schema model for the list endpoint |
| `routers/pos.py` | Untouched |
| All frontend files | S&O consumes the endpoint |
| MongoDB collections / indexes | Untouched — `coupon_usage` already has index `idx_user_coupon_customer {user_id:1, coupon_id:1, customer_id:1}` used by engine |
| `.env` files | Untouched |

---

## 4. Data flow trace

### Engine path (order_total provided)

```
GET /scan/coupons?restaurant_id=689&order_total=96&channel=dine_in

  → rate-limit (anonymous) / auth-gate (authenticated)  [CR-121, unchanged]
  → resolve rid / customer_id                            [CR-121, unchanged]
  → order_total = 96.0 → ENGINE PATH

  → list_available_coupons(rid, customer_id, order_total=96, channel="dine_in")
      ├── coupons.find({user_id: rid, is_active: true}).to_list()   [bulk fetch]
      ├── coupon_usage.aggregate(...)                                [bulk usage, if customer_id]
      └── for each coupon: validate_coupon_for_customer(...)
            min_order=600 > 96 → EXCLUDED
            min_order=300 > 96 → EXCLUDED
            min_order=0        → check time_window...
              outside window   → INCLUDED with time_window.within_window_now: false
              in window        → INCLUDED with expected_discount computed
              bxg/bogo         → INCLUDED with requires_cart_validation: true, expected_discount: null

  → post-call: add my_usage_count via 1 aggregation (authenticated only)

  → recommendation: max(expected_discount) among non-cart coupons

  → response: {coupons: [...], recommended_code: "STO-GENERIC-10", recommended_discount: 9.6}
```

### Legacy path (no order_total)

```
GET /scan/coupons?restaurant_id=689

  → [everything unchanged from CR-121]
  → response: {coupons: [...]}   ← no recommended_code field (null by absence)
```

---

## 5. Risk assessment

| Area | Risk | Reasoning |
|---|---|---|
| Engine correctness | **LOW** | `list_available_coupons` is battle-tested — used by POS in production, has its own QA suite |
| Response shape change | **MEDIUM** | When `order_total` provided: raw DB doc → curated engine shape. Fields gained: `requires_cart_validation`, `expected_discount`, `time_window`, `display_title`. Fields absent: `applicable_channels`, `eligible_food_ids`, `specific_users`. S&O must not depend on absent fields. |
| `my_usage_count` gap | **LOW** | One extra aggregation post-call; same semantics as today |
| Backward compat | **NONE** | Existing callers without `order_total` get identical response |
| Recommendation logic | **LOW** | Simple `max(expected_discount)` — no external dependency, deterministic |
| §14 hotspot | **NOT TOUCHED** | `core/coupon.py` is CRITICAL but is not modified — only called |
| `list_available_coupons` import | **LOW** | Additive import from same module already imported |

---

## 6. Conflict check

| With | Overlap | Resolution |
|---|---|---|
| **CR-121** | Same route, same hunk | CR-122 adds `order_total` branch BEFORE the existing CR-121 logic (which becomes the `else`). No line-level conflict. |
| **CR-120** (validate route) | Different route | None |
| **CR-119** (skip-otp) | Different route | None |
| Wave A CRs (CR-111/113/115) | Different files | None |

---

## 7. S&O response shape — `order_total` path

```json
{
  "success": true,
  "message": "5 coupons available",
  "data": {
    "coupons": [
      {
        "id": "...",
        "code": "STO-GENERIC-10",
        "title": "S&O Test — Generic 10% Off",
        "display_title": "10% Off Your Order",
        "coupon_type": "order",
        "discount_scope": "order",
        "discount_type": "percentage",
        "discount_value": 10.0,
        "min_order_value": 0.0,
        "expected_discount": 96.0,
        "final_amount_preview": 864.0,
        "requires_cart_validation": false,
        "stackable_with_loyalty": true,
        "valid_from": "2026-01-01T00:00:00Z",
        "valid_until": "2027-12-31T23:59:59Z",
        "offer_type": "simple",
        "time_window": { "configured": false, "within_window_now": true },
        "my_usage_count": 0
      },
      {
        "code": "SEED_V3B_BXGY_FLAT",
        "offer_type": "bxg",
        "requires_cart_validation": true,
        "expected_discount": null,
        "final_amount_preview": null,
        "time_window": { "configured": false, "within_window_now": true },
        "buy_quantity": 3,
        "get_quantity": 1
      }
    ],
    "recommended_code": "STO-GENERIC-10",
    "recommended_discount": 96.0
  }
}
```

---

## 8. Owner / S&O questions

**None.** All decisions locked. S&O confirmed: issues handled at CRM API level.

---

## 9. Verification matrix

| V | Case | Expected |
|---|---|---|
| V1 | `?order_total=96` — coupon with `min_order=300` | Excluded from list |
| V2 | `?order_total=96` — coupon with `min_order=50` | Included with `expected_discount` computed |
| V3 | `?order_total=960` — BXGY coupon | `requires_cart_validation: true`, `expected_discount: null` |
| V4 | `?order_total=960` — time-window coupon (outside hours) | Included with `time_window.within_window_now: false` |
| V5 | `?order_total=960` — `recommended_code` | Code with highest `expected_discount` |
| V6 | No `order_total` — authenticated call | Response identical to pre-CR-122; no `recommended_code` key |
| V7 | No `order_total` — anonymous call | Response identical to pre-CR-122 |
| V8 | `?order_total=0` — conservative floor | Coupons with `min_order > 0` excluded |
| V9 | `?order_total=960` — authenticated | `my_usage_count` present on all coupons |
| V10 | `?order_total=960` — anonymous | No `my_usage_count` field |

---

```
Planning complete: CR-122
Stage: Impact Analysis
Code reality: FULL (scan.py:467–530 confirmed; core/coupon.py:1981–2133 confirmed; list_available_coupons not currently imported in scan.py)
Risk: LOW–MEDIUM (response shape changes when order_total provided — curated engine shape vs raw DB doc; backward compat preserved for callers without order_total)
Files WILL change: routers/scan.py only (3 edits: import, signature, body ~28 lines)
Files WILL NOT touch: core/coupon.py · models/schemas.py · routers/pos.py · frontend · DB/indexes
Owner decisions: ALL LOCKED
Key design: two-path route — order_total present → engine; absent → existing inline loop (unchanged)
Docs: planning/CR_122_IMPACT_ANALYSIS.md
Next: Implementation Plan gate opens on "choose planning role for implementation planning of CR-122"
```
