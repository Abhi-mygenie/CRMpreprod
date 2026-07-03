# CR-010 — POS `category_id` End-to-End Mapping (Discovery)

**CR:** CR-010 POS Category-ID Field Population + CRM End-to-End Mapping
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr010_closed_no_crm_changes_required_engine_path3_handles_pos_payload`

---

## 1. Trigger

Owner placed order **#869136** on R689 Kunafa Mahal at 2026-05-27 16:19 IST
(10:50 UTC) to verify the POS `item_notes` fix. While auditing the
`pos_request_logs` entry, two issues surfaced:

| # | Issue | Severity |
|---|---|---|
| A | `item_notes: "No Garlic, Less Spicy"` now flows correctly ✅ | (fix confirmed) |
| B | Every item arrives with `item_category: ""` and `category_id` / `category_name` **absent entirely** — category-scope coupons cannot match | **P1 — coupon engine cannot evaluate any category-level rule against POS-ingested orders** |

Pattern audit (last 20 items across 10 orders, 3 restaurants — R689, R523, R391):
**20/20** items have `item_category = ""`; `category_id` and `category_name` absent in all.

Owner directive: POS will start sending `category_id`. CRM must investigate
and confirm end-to-end mapping is in place. **No code changes in this CR — discovery only.**

---

## 2. End-to-End Pipeline — Layer-by-Layer Map

| # | Layer | File / source | `category_id` support today? | Notes |
|---|---|---|---|---|
| 1 | MyGenie `/api/v1/vendoremployee/get-categories` | upstream (preprod.mygenie.online) | ✅ Returns numeric `id` per category | source of truth |
| 2 | MyGenie `/api/v1/vendoremployee/get-products-list` | upstream | ✅ Each product carries `category_id` (numeric) | source of truth for product→category mapping |
| 3 | CRM proxy `GET /api/menu/categories` | `routers/menu.py:78-82` | ✅ Returns `{id: str(c.id), name, status}` | already consumed by Coupon Admin UI |
| 4 | CRM proxy `GET /api/menu/items` | `routers/menu.py:52` | ✅ Returns `category_id: str(p.get("category_id", ""))` per item | already exposed |
| 5 | Coupon Admin UI — payload on save | `frontend/src/pages/CouponsPage.jsx:261, 379-380, 431-432` | ✅ Saves BOTH `eligible_category_ids` (MyGenie numeric IDs as strings) AND `eligible_category_names` (defensive) | redundant on purpose |
| 6 | Coupon Engine `_line_matches_category_scope()` | `backend/core/coupon.py:198-217` | ✅ 4-path chain; **Path 1** = `line.category_id` ∈ `coupon.eligible_category_ids` (exact string match) | ID-first preference already built |
| 7 | `POSCartItem` schema (real-time `/pos/coupons/validate` request) | `backend/models/schemas.py:853-880` | ✅ Has `category_id`, `category_name`, `item_category` all with `AliasChoices` | validate path is already category_id-ready |
| 8 | **`OrderItem` schema (`POST /pos/orders` ingestion)** | `backend/routers/pos.py:1030-1100` | ❌ **`category_id` field absent — only `item_category: Optional[str] = None`** | **CRM gap G1** |
| 9 | **POSCartItem → cart dict conversion in `/pos/orders` webhook** | `backend/routers/pos.py:1500-1517` | ❌ **Hardcoded `"category_id": None, "category_name": None`** | **CRM gap G2** |
| 10 | POS payload today (`/api/pos/orders`) | live `pos_request_logs` (order 869136 + 9 others) | ❌ `item_category: ""`; `category_id` / `category_name` absent entirely | **POS-side gap (POS will fix)** |

---

## 3. Two Distinct Code Paths — Different Status

### Path A — `POST /api/pos/coupons/validate` (real-time pre-bill validation)
- Uses `POSCartItem` schema
- `category_id` field **already exists, wired, validated by Pydantic AliasChoices**
- Engine Path 1 (`line.category_id` exact match against `eligible_category_ids`) **will work the moment POS includes `category_id` in items[].**
- **CRM change required: ZERO** ✅

### Path B — `POST /api/pos/orders` (post-bill ingestion → records `coupon_usage`)
- Uses `OrderItem` schema (different from POSCartItem — order-level data including post-payment fields)
- `category_id` is **not** in `OrderItem`, so Pydantic will silently drop it even if POS sends it
- Conversion step at `pos.py:1500-1517` hardcodes `"category_id": None, "category_name": None`
- Even if POS sends `category_id`, the engine will see `None` here and fall back to Path 3/4 (`item_category` against either list)
- **CRM change required: 2 small forward-only additive edits (G1 + G2)**

---

## 4. Why `category_id` (numeric MyGenie ID) over `item_category` (display name)

| Criterion | `category_id` ("42") | `category_name` ("Authentic Kunafa") |
|---|---|---|
| Stability under category rename | ✅ Immutable | ❌ Coupons silently break |
| Case / whitespace sensitivity | ✅ Exact string match | ⚠️ Normalized but locale brittle |
| Source of truth | ✅ MyGenie DB primary key | ⚠️ Display label, can drift |
| Already stored on coupon | ✅ `eligible_category_ids` | ✅ `eligible_category_names` |
| Engine cost | O(1) exact-string set lookup (Path 1) | O(n) normalized set lookup (Path 2) |

**Owner's call to use `category_id` is the architecturally correct choice and matches what CRM already stores on the coupon side.**

---

## 5. CRM Gaps to Close — Pure Forward-Only Schema Additions

### Gap G1 — `OrderItem` schema is missing `category_id`

**File:** `/app/backend/routers/pos.py`
**Anchor:** around line 1051 inside the `class OrderItem(BaseModel)` block

**Proposed addition (pseudocode — NOT applied in this CR):**
```python
item_category: Optional[str] = None    # ← already exists, keep
category_id: Optional[str] = Field(    # ← NEW
    default=None,
    validation_alias=AliasChoices("category_id", "categoryId"),
)
category_name: Optional[str] = None    # ← NEW (defensive fallback)
```

- Backward compatible: defaults to `None` if POS doesn't send
- Uses same `AliasChoices` convention as other POS-realtime fields in the schema
- Pure additive, zero risk to existing flows

### Gap G2 — Conversion hardcodes `None` for these fields

**File:** `/app/backend/routers/pos.py`
**Anchor:** lines 1500-1517 in the `record_coupon_usage_for_order` cart_dict construction

**Current code:**
```python
cart_dicts.append({
    "item_id":      oi.pos_food_id or None,
    "food_id":      oi.pos_food_id or None,
    "category_id":  None,                  # ← hardcoded
    "category_name": None,                 # ← hardcoded
    "item_category": oi.item_category,
    ...
})
```

**Proposed change (pseudocode — NOT applied):**
```python
cart_dicts.append({
    "item_id":      oi.pos_food_id or None,
    "food_id":      oi.pos_food_id or None,
    "category_id":  oi.category_id or None,         # ← pass through
    "category_name": oi.category_name or None,      # ← pass through
    "item_category": oi.item_category,
    ...
})
```

- Backward compatible: still `None` if POS doesn't send (existing behavior)
- Zero risk; no engine changes

### Total CRM-side surface

| Metric | Count |
|---|---|
| Files to modify | 1 (`routers/pos.py`) |
| Schema fields added | 2 (`category_id`, `category_name` on `OrderItem`) |
| Lines changed in conversion | 2 |
| Backward-compat | 100% — every change defaults to `None` if POS omits |

**These edits are deferred to a separate implementation CR (CR-011) once POS confirms deployment of the new field on their side. Doing it pre-POS-deploy adds unused fields — owner directive is investigation-only for now.**

---

## 6. POS-Side Required Change (Handoff)

Full payload specification in
`/app/memory/crm/crm_roi_sprint/handoff/POS_HANDOFF_CATEGORY_ID_REQUIRED_FIELD_2026_05_27.md`.

Summary: POS must populate `items[].category_id` (and optionally `category_name`)
with MyGenie's numeric category ID (as string) in both endpoints:
- `POST /api/pos/orders`
- `POST /api/pos/coupons/validate`

POS already has this value — they fetch it from
`GET /api/v1/vendoremployee/get-products-list` which CRM proxies under the
same key. No new MyGenie API call required POS-side.

---

## 7. Impact Today (Without This CR)

| Coupon class | Status today |
|---|---|
| V2 — Item-scope coupons (matched by `pos_food_id`) | ✅ Working (KUNAFA20, SEED_V2_ITEMS_MULTI verified live) |
| V3-B BOGO — Item-list based (buy/get food_ids) | ✅ Working (SEED_V3B_BOGO verified) |
| V2 — `discount_scope: "order"` (no category logic) | ✅ Working |
| **V2 — Category-scope coupons** | ❌ **Silent fail — engine returns `NO_ELIGIBLE_CATEGORY_IN_CART` on validate; no recording on order ingestion** |
| **V3-C Every-Nth — Category-scope** | ❌ **Same silent fail** |

Restaurants currently cannot deploy any category-wide coupon (e.g.
"10% off all Beverages", "Every 3rd Pizza free") via POS until both
sides ship.

---

## 8. Risk Register (Future Implementation CR — Not This One)

| Risk | Level | Mitigation |
|---|---|---|
| POS deploys `category_id` before CRM adds OrderItem schema fields | LOW | Pydantic silently drops unknown fields; no error, just no improvement. Order ingestion continues working as today. |
| CRM adds fields before POS deploys | LOW | Fields default `None`; no behavior change. Engine falls back to `item_category` path as today. |
| Numeric mismatch — POS sends int, CRM stores string | NONE | `coerce_numbers_to_str=True` already set on `OrderItem.model_config` (line 1043) — handles both `"42"` and `42` |
| Existing coupons with only `eligible_category_names` (legacy) | NONE | Engine Path 2 (`category_name` match) still works; we're adding faster Path 1 not replacing Path 2 |
| Order-finalization performance | NONE | Adding 2 dict keys is O(1) — no DB query, no API call |

---

## 9. Acceptance Criteria for the Future Implementation CR (CR-011)

When POS confirms deployment of `category_id`, CR-011 should verify:

1. Sample order with `category_id` set in `items[]` arrives via `/pos/orders` and `OrderItem` Pydantic-parses it (no field drop).
2. `coupon_usage` record for a category-scope coupon on that order shows correct `eligible_category_ids` match.
3. Validate path (`/pos/coupons/validate`) returns `success=true` for a category coupon when POS sends `category_id` in items[].
4. Item-scope and order-scope coupons unaffected (existing 211 engine tests still pass).
5. Live R689 `pos_request_logs` audit shows `items[].category_id` populated on ≥ 5 consecutive new orders.
6. No regression in `loyalty_points_used`, `coupon_discount`, POS contract fields per CR-001C compliance audit.

---

## 10. Strict Boundaries Honoured

- No product code changed during this discovery CR
- No DB writes, no migrations
- No env / deploy changes
- `/app/memory/crm/crm_1_0/` baseline close doc untouched
- `/app/memory/final/` not created/touched
- No new dependencies
- POS handoff doc to be created in parallel (`POS_HANDOFF_CATEGORY_ID_REQUIRED_FIELD_2026_05_27.md`)

---

## 11. Closure Addendum — Live Verification (2026-05-27)

### 11.1 POS is already sending category ID in `item_category`

Test order **#869143** (R689 Kunafa Mahal, 2026-05-27 17:01 IST) confirmed:

```json
{
  "item_name": "Astha - E- Malai Kunafa",
  "pos_food_id": "146562",
  "item_category": "5119",
  "item_qty": 1,
  "item_price": 299
}
```

POS sends the **numeric MyGenie category ID** (`"5119"`) in the `item_category` field — not in a separate `category_id` field. This is consistent across multiple R689 orders (869143, 867456, 867406).

### 11.2 Engine Path 3 handles it correctly

| Path | Check | Result |
|---|---|---|
| Path 1 | `category_id` ∈ `eligible_category_ids` | SKIP — field is `None` (not on `OrderItem` schema) |
| Path 2 | `category_name` ∈ `eligible_category_names` | SKIP — field is `None` |
| **Path 3** | **`item_category` ∈ `eligible_category_ids`** | **✅ MATCH — `"5119"` ∈ `["5119"]`** |
| Path 4 | `item_category` ∈ `eligible_category_names` | not reached |

### 11.3 Discount calculation verified

| Metric | Value |
|---|---|
| Coupon | `SEED_V2_CATMULTI` — 10% off category `Authentic Kunafa` (`eligible_category_ids: ["5119"]`) |
| `eligible_subtotal` | 299.0 (1 x 299) |
| CRM computed discount | 29.9 |
| POS reported discount | 29.9 |
| `discount_mismatch` | `false` ✅ |

### 11.4 `coupon_usage` recorded correctly

```
coupon_code: SEED_V2_CATMULTI
discount_scope: category
eligible_category_ids: ["5119"]
crm_computed_discount: 29.9
source: pos_orders
recorded: true
```

### 11.5 Validate path also works (different mechanism)

On the validate path (`/pos/coupons/validate`), POS sends `category_name` (display name) instead of `category_id`. Engine matches via **Path 2** (`category_name` ∈ `eligible_category_names`). Both paths converge correctly.

### 11.6 Gap G1 + G2 — No longer needed

The original discovery identified two CRM gaps:
- **G1:** `OrderItem` schema missing `category_id` field
- **G2:** Cart conversion hardcoding `category_id: None`

Since POS sends the numeric category ID in `item_category` (which `OrderItem` already has), and the engine's Path 3 fallback matches `item_category` against `eligible_category_ids`, **both gaps are moot**. No CRM code changes required. **CR-011 is not needed.**

### 11.7 Scope note

This verification was done on R689 (Kunafa Mahal). Other restaurants (e.g. Mayur's Kitchen) still send `item_category: ""` on the orders path — category coupons will not match for those restaurants until their POS instances also populate `item_category` with the numeric ID. This is a POS rollout matter, not a CRM issue.

---

## 12. Status

```
cr010_closed_no_crm_changes_required_engine_path3_handles_pos_payload
```

**No CR-011 required.** CRM engine's existing 4-path fallback chain in `_line_matches_category_scope()` handles POS's current payload format. Category-scope coupons work end-to-end on R689.

---

## 13. References

- Closure order evidence: `pos_request_logs` — `request_body.order_id = "869143"` (R689, 2026-05-27)
- Earlier discovery order: `pos_request_logs` — `request_body.order_id = "869136"` (R689, 2026-05-27)
- Engine code: `/app/backend/core/coupon.py:198-217` (`_line_matches_category_scope`)
- OrderItem schema: `/app/backend/routers/pos.py:1029-1097`
- Conversion step: `/app/backend/routers/pos.py:1500-1517`
- Coupon admin UI: `/app/frontend/src/pages/CouponsPage.jsx:261, 379-380, 431-432`
- Menu proxy: `/app/backend/routers/menu.py:52, 78-82`
- CR-006 QA root-cause for category matching: `../qa/CR_006_COUPON_ENGINE_POS_VALIDATE_REGRESSION_QA_REPORT.md` §5

End of CR-010.
