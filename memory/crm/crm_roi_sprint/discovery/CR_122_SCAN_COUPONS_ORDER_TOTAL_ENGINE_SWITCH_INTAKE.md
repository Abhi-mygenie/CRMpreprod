# CR-122 — Intake: `GET /scan/coupons` — order_total filter + requires_cart_validation + recommendation signal
**Date**: 2026-10-12 · **Role**: Intake Agent · **Source**: S&O brief `OUTBOUND_TO_CRM_COUPON_LIST_UX_THREE_ISSUES_2026-10-12.md` · INV (investigation this session) · **No code changed. No data written.**

---

## 1. Owner / S&O Request (verbatim intent)

> "Issues 1, 2, 3 from S&O brief — non-applicable coupons shown, BXGY shows ₹0 off, no recommendation signal — all should be handled at CRM API level, not client side."

---

## 2. Three S&O issues — one root cause, one fix

All three issues share **one root cause**: `GET /scan/coupons` (scan.py:467–530, CR-121) does its own inline DB query + Python loop. It does **not** call `list_available_coupons()` — the battle-tested engine function in `core/coupon.py` used by the POS. It also has no `order_total` query param.

`list_available_coupons()` already handles all three asks:

| Issue | What S&O sees today | What `list_available_coupons` already does |
|---|---|---|
| 1 — Non-applicable coupons in list | Coupons with `min_order > cart` and wrong time-window coupons appear | Calls `validate_coupon_for_customer` with real `order_total` → excludes `min_order` failures; keeps time-window coupons but with `time_window.within_window_now: false` |
| 2 — BXGY/BOGO/nth_item `requires_cart_validation: null` | Raw DB doc returned; field never computed | Computes `requires_cart = (v3b_ot is not None) or (v3c_ot is not None)` (coupon.py:2064); emits `requires_cart_validation: true/false` on every coupon |
| 3 — No recommendation signal | `recommended_code: null`, `recommended_discount: null` | Already computes `expected_discount` per coupon; ranking (max `expected_discount`) is 2 extra lines |

**The fix is one change to `GET /scan/coupons`:**
1. Add `order_total: Optional[float]` query param
2. When present → call `list_available_coupons` instead of inline loop
3. Add `recommended_code` + `recommended_discount` extraction (2 lines)
4. When absent → current behaviour preserved (backward compatible)

---

## 3. Code reality (confirmed from live code)

### `GET /scan/coupons` — scan.py:467–530 (CR-121)

Current loop does NOT:
- Accept `order_total` param
- Check `min_order_value`
- Check time windows
- Compute `requires_cart_validation`
- Return any recommendation

### `list_available_coupons` — core/coupon.py:1981–2133

```python
async def list_available_coupons(db, *, user_id, customer_id=None, order_total, channel, ...):
```
- Takes `order_total` (required) — used by `validate_coupon_for_customer` to enforce `min_order_value`
- Handles time-window coupons: included with `time_window.within_window_now: false`
- Computes `requires_cart_validation` (line 2064): `True` for bxg/bogo/nth_item and item/category scope
- Already computes `expected_discount` per coupon — ranking is free
- Already used + battle-tested by POS (`routers/pos.py`)

### DB probe (r689 BXGY coupons)

All V3-B/V3-C coupons confirmed: `discount_type: "flat"`, `discount_value: 0.0`, **no `requires_cart_validation` field in DB** — it is always computed at query time, never stored. Switching to the engine fixes this for all existing and future coupons automatically.

---

## 4. Classification

| Field | Value |
|---|---|
| **Type** | CR — route enhancement (additive) |
| **Severity** | **P1** — actively broken UX for S&O: non-applicable coupons shown, BXGY shows "₹0 off", no auto-apply |
| **Risk** | **LOW–MEDIUM** — `list_available_coupons` is battle-tested (POS uses it). Scan route switching to it is additive. Backward compatible when `order_total` absent. |
| **Duplicate check** | **DISTINCT** — CR-121 added optional auth + anonymous list. This adds `order_total` + engine switch. No overlap. |
| **Blast radius** | **SMALL** — 1 file (`routers/scan.py`), ~20 lines. No engine change. `core/coupon.py` untouched. |
| **Related** | CR-121 (same route, same session) · `list_available_coupons` already used by POS |

---

## 5. Contracted behaviour (locked by investigation + owner confirmation)

### Request — with `order_total` (new, recommended)
```
GET /scan/coupons?restaurant_id=689&order_total=960&channel=dine_in
// or with token (authenticated)
GET /scan/coupons?order_total=960&channel=dine_in
Authorization: Bearer <customer token>
```

### Response envelope changes (additive)
```json
{
  "success": true,
  "message": "N coupons available",
  "data": {
    "coupons": [...],
    "recommended_code":     "STO-GENERIC-10",   ← NEW: best simple coupon for this order_total
    "recommended_discount": 96.0                ← NEW: pre-computed discount amount
  }
}
```
`recommended_code` is `null` if no applicable simple coupon exists or `order_total` not passed.
`recommended_code` excludes `requires_cart_validation: true` coupons (discount cannot be computed without cart).

### Per-coupon fields — `requires_cart_validation` now always set
```json
{
  "code": "SEED_V3B_BXGY_FLAT",
  "offer_type": "bxg",
  "requires_cart_validation": true,    ← always computed, never null
  "expected_discount": null,           ← null when requires_cart_validation: true
  "final_amount_preview": null,        ← null when requires_cart_validation: true
  "time_window": {
    "configured": true,
    "within_window_now": false,        ← time-window coupons still returned, flag tells S&O
    ...
  }
}
```

### When `order_total` absent — backward compatible
- Route behaves exactly as today (current inline loop)
- `recommended_code: null`
- `requires_cart_validation` may be null for BXGY (current state)
- **No existing caller breaks**

---

## 6. What S&O needs to add (minimal)

1. Add `?order_total=<cart_total>` to `GET /scan/coupons` call
2. When `requires_cart_validation: true` → show "Tap to see discount" instead of "₹0 off"
3. When `recommended_code` present → auto-apply it
4. When diner taps BXGY coupon → fire `POST /scan/coupons/validate` with `items[]`

**`items[]` shape for validate (BXGY):**
```json
[
  { "food_id": "202959", "item_id": "202959", "name": "Golden Caramel", "quantity": 3, "unit_price": 120.0 },
  { "food_id": "202958", "item_id": "202958", "name": "Ras Bhari Mango", "quantity": 1, "unit_price": 130.0 }
]
```
Minimum required fields: `food_id` (or `item_id`) + `quantity` + `unit_price`.

---

## 7. Owner questions

**None.** Investigation confirmed code reality. All owner/S&O decisions captured:
- Issues handled at CRM API level (owner confirmed this session)
- Backward compatible when `order_total` absent
- Recommendation = highest `expected_discount` among simple applicable coupons (no merchant-priority rules today)

---

## 8. Fix sketch (for Planning — do not implement now)

```python
# routers/scan.py — GET /scan/coupons

@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,
    restaurant_id: Optional[str] = None,
    order_total: Optional[float] = None,     # CR-122: NEW
    request: Request = None,
    auth: Optional[dict] = Depends(optional_customer_token),
):
    # ... existing auth + rate limit + resolve rid/customer_id ...

    if order_total is not None:
        # CR-122: use battle-tested engine — handles min_order, time_window, requires_cart
        from core.coupon import list_available_coupons
        eligible = await list_available_coupons(
            db, user_id=rid, customer_id=customer_id,
            order_total=order_total, channel=channel or "dine_in"
        )
        # CR-122: pick recommended coupon (highest expected_discount, non-cart)
        simple = [c for c in eligible
                  if not c.get("requires_cart_validation")
                  and (c.get("expected_discount") or 0) > 0]
        best = max(simple, key=lambda c: c["expected_discount"], default=None)
        return _resp(True, f"{len(eligible)} coupons available", {
            "coupons": eligible,
            "recommended_code":     best["code"] if best else None,
            "recommended_discount": best["expected_discount"] if best else None,
        })

    # existing path (backward compatible — no order_total)
    # ... current inline loop unchanged ...
```

**Note for planning**: When `order_total` is provided and the caller is authenticated, `list_available_coupons` handles `per_user_limit`, `specific_users`, `requires_customer` — the inline loop's existing filters are subsumed. The `my_usage_count` field needs to be added back after the engine call since `list_available_coupons` doesn't include it (it's a scan-specific field).

---

## 9. Verification sketch

| V | Check | Expected |
|---|---|---|
| V1 | `?order_total=96` — list for cart ₹96 | Coupons with `min_order > 96` excluded |
| V2 | `?order_total=96` — BXGY coupon | `requires_cart_validation: true`, `expected_discount: null` |
| V3 | `?order_total=96` — time-window coupon (outside hours) | Included with `time_window.within_window_now: false` |
| V4 | `?order_total=960` — `recommended_code` | Code with highest `expected_discount` among non-cart coupons |
| V5 | No `order_total` — existing authenticated call | Response identical to today; `recommended_code: null` |
| V6 | No `order_total` — backward compat | No 422, same shape as pre-CR-122 |

---

```
Intake complete: CR-122
Classification: CR — route enhancement, additive (scan.py, ~20 lines)
Severity: P1 (S&O active UX issues: non-applicable shown, BXGY ₹0 off, no auto-apply)
Risk: LOW–MEDIUM (list_available_coupons is POS-tested; scan route switch is additive; backward compatible)
Duplicate check: DISTINCT (CR-121 = optional auth; this = order_total + engine switch)
Evidence: scan.py:467–530 (current route has no order_total), coupon.py:1981–2133 (list_available_coupons handles all three), coupon.py:2064 (requires_cart computation), DB probe r689 BXGY coupons
Blast radius: SMALL (1 file routers/scan.py, ~20 lines; core/coupon.py untouched)
Owner decisions: ALL LOCKED — API-level handling confirmed; backward compat when order_total absent
Docs: discovery/CR_122_SCAN_COUPONS_ORDER_TOTAL_ENGINE_SWITCH_INTAKE.md
Next: Planning gate opens on "choose planning role for CR-122"
```
