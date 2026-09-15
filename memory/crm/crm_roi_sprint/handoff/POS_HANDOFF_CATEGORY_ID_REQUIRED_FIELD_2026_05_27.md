# POS Handoff — `category_id` Required Field on Order & Validate Payloads

**To:** POS Engineering Team
**From:** CRM (mygenie CRM preprod)
**Date:** 2026-05-27
**Severity:** P1 — category-scope coupons silent-fail today
**Status:** `pos_handoff_category_id_closed_no_crm_changes_pos_already_sends_in_item_category`

---

## 1. TL;DR

POS-side payloads to CRM are missing `category_id` (and `category_name`)
on every `items[]` entry. As a result, **every category-scope coupon
silently fails to match** when the bill flows through `/api/pos/orders`
or pre-validates through `/api/pos/coupons/validate`.

**Action requested from POS:**

Add `category_id` (MyGenie numeric category ID, as a string) to every
item in:
- `POST /api/pos/orders` → `items[]`
- `POST /api/pos/coupons/validate` → `items[]`

CRM has already confirmed it has the necessary engine-side and
admin-side support; only the order-ingestion `OrderItem` schema needs
two additive fields on CRM side (tracked separately as CR-010 / CR-011).

Owner (R689) has confirmed POS will roll out this field. This handoff
captures the exact contract POS needs to honour.

---

## 2. Evidence — What POS Sends Today

### Live order **#869136** — R689 Kunafa Mahal — 2026-05-27 16:19 IST

```json
{
  "items": [
    {
      "item_name": "Pistachio Cocoa Celebration Habba Cake",
      "pos_food_id": "182048",
      "item_category": "",          ← EMPTY STRING
      "item_qty": 3,
      "item_price": 1137,
      "variant": "",
      "is_veg": true,
      "item_notes": "No Garlic, Less Spicy"
    }
  ]
}
```

Missing entirely: `category_id`, `category_name`.

### Pattern audit — 10 most recent orders, 3 restaurants

| Field | Value | Count |
|---|---|---|
| `items[].item_category` | `""` (empty string) | 20/20 |
| `items[].category_id` | absent | 20/20 |
| `items[].category_name` | absent | 20/20 |

Confirmed: this is **not** specific to R689 — same pattern on R523 and R391.

---

## 3. Required Payload — Spec

### 3.1 `POST /api/pos/orders` — `items[]` entries

```jsonc
{
  "pos_id": "0001",
  "restaurant_id": "689",
  "order_id": "869136",
  ...
  "items": [
    {
      "item_name":     "Pistachio Cocoa Celebration Habba Cake",
      "pos_food_id":   "182048",
      "category_id":   "42",                    // ← REQUIRED — MyGenie numeric id as string
      "category_name": "Authentic Kunafa",      // ← OPTIONAL but recommended (fallback)
      "item_category": "Authentic Kunafa",      // ← KEEP populating for backward compat
      "item_qty":      3,
      "item_price":    1137,
      "item_notes":    "No Garlic, Less Spicy",
      ...
    }
  ]
}
```

### 3.2 `POST /api/pos/coupons/validate` — `items[]` entries

Same shape — POS must include `category_id` here too. This is the
real-time pre-bill coupon validation call.

```jsonc
{
  "code": "EVERY3_PIZZA_FREE",
  "items": [
    { "pos_food_id": "74029", "category_id": "17", "category_name": "Pizza", ... },
    ...
  ]
}
```

### 3.3 Field semantics

| Field | Type | Source | Required? |
|---|---|---|---|
| `category_id` | `string` (MyGenie numeric id; pass as string) | `GET /api/v1/vendoremployee/get-products-list` → `category_id` per product | **REQUIRED** |
| `category_name` | `string` | Same source → category display name | Recommended (fallback Path 2) |
| `item_category` | `string` | Same as `category_name` | Continue sending for backward compat |

**CRM accepts `category_id` as either a string `"42"` or a numeric `42`** —
Pydantic `coerce_numbers_to_str=True` is already configured. String is
preferred for forward-compat.

---

## 4. Where POS Should Source `category_id`

POS already calls MyGenie's product API:

```
GET https://preprod.mygenie.online/api/v1/vendoremployee/get-products-list
Authorization: Bearer <mygenie_token>
```

The response includes `category_id` (numeric) on every product entry.
POS just needs to **carry that value forward** into the items[] array
when constructing the request to CRM. **No new MyGenie API call needed.**

CRM verifies this end-to-end via its own proxy at `GET /api/menu/items`
(`/app/backend/routers/menu.py:52`), which already exposes:

```python
"category_id": str(p.get("category_id", ""))
```

so both sides see the identical value.

---

## 5. Why `category_id` and Not Just `category_name`

| Reason | Detail |
|---|---|
| **Rename safety** | Category names can be edited in MyGenie admin (e.g. "Beverages" → "Drinks"). IDs are immutable. Without `category_id`, every rename silently breaks every coupon scoped to that category. |
| **Source of truth** | `category_id` is the MyGenie DB primary key. `category_name` is a display label. |
| **CRM already stores ID** | When an owner picks "All Pizza" while building a coupon, CRM stores `eligible_category_ids = ["17"]` and `eligible_category_names = ["Pizza"]` — both. Engine prefers ID-match (Path 1) for speed and stability. |
| **Engine match cost** | ID = O(1) exact-string set lookup; name = O(n) normalized lookup. |

---

## 6. Engine Side — How CRM Will Use the Field

`/app/backend/core/coupon.py` — `_line_matches_category_scope()` runs a
4-path fallback chain:

| Priority | Engine reads | Matches against |
|---|---|---|
| 1 | `line.category_id` | `coupon.eligible_category_ids` (exact string) |
| 2 | `line.category_name` | `coupon.eligible_category_names` (normalized) |
| 3 | `line.item_category` | `coupon.eligible_category_ids` (fallback) |
| 4 | `line.item_category` | `coupon.eligible_category_names` (fallback) |

When POS sends `category_id`, Path 1 wins instantly. If POS occasionally
misses, Paths 2-4 still try the fallback chain — defensive by design.

---

## 7. Two Path Status — CRM Side

| Path | CRM endpoint | CRM schema reads `category_id`? | CRM change needed when POS deploys? |
|---|---|---|---|
| A | `POST /api/pos/coupons/validate` | ✅ Yes — `POSCartItem.category_id` exists with `AliasChoices` (`models/schemas.py:861-870`) | **None** ✅ |
| B | `POST /api/pos/orders` | ❌ No — `OrderItem` schema doesn't have `category_id` yet | 2 small forward-only additive edits (tracked as **CR-010 / CR-011** in CRM ROI Sprint) |

CRM will ship Path B fix **after** POS confirms deployment of
`category_id`. Doing it before adds unused schema fields. Owner
directive.

---

## 8. Acceptance Criteria — Joint POS + CRM

### POS team to confirm:

1. ☐ `POST /api/pos/orders` `items[].category_id` populated on every item (string format, MyGenie numeric ID)
2. ☐ `POST /api/pos/coupons/validate` `items[].category_id` populated on every item
3. ☐ Continue populating `pos_food_id`, `item_category` (backward compat)
4. ☐ Sample test order placed on R689 with a category coupon (e.g. "10% off Authentic Kunafa") — POS sends + receives expected 10% discount in the validate response
5. ☐ CRM `pos_request_logs` for that test order shows `items[0].category_id` populated

### CRM team to confirm post-POS-deploy:

1. ☐ Implement Gap G1 (add `category_id`, `category_name` to `OrderItem`)
2. ☐ Implement Gap G2 (pass-through in cart_dict conversion)
3. ☐ `coupon_usage` collection shows correct match for category-scope coupons
4. ☐ Engine 211-test suite still all-pass
5. ☐ No regression in `loyalty_points_used`, `coupon_discount`, POS contract fields (CR-001C compliance)

---

## 9. Backward Compatibility Guarantee

CRM will ship Path B with **all new fields defaulting to `None`**.
If POS partial-rolls (some restaurants on new payload, some still on
old), **both work**:

- Old payload → Path 1 fails (no field) → engine tries Path 2/3/4 → if
  `item_category` populated, still matches; if empty, category coupon
  fails silently as today (no regression vs. baseline).
- New payload → Path 1 wins → faster, more reliable match.

No coordinated cut-over required. POS can ship at their own pace.

---

## 10. Reference Files (CRM-Side)

| Concern | File | Lines |
|---|---|---|
| Engine — category matching | `backend/core/coupon.py` | 198-217 |
| Realtime validate schema (Path A ready) | `backend/models/schemas.py` | 853-880 |
| Order ingestion schema (Path B gap G1) | `backend/routers/pos.py` | 1030-1100 |
| Order ingestion cart conversion (Path B gap G2) | `backend/routers/pos.py` | 1500-1517 |
| Menu proxy exposing category_id | `backend/routers/menu.py` | 52, 78-82 |
| Admin UI storing eligible_category_ids | `frontend/src/pages/CouponsPage.jsx` | 261, 379-380, 431-432 |

---

## 11. CRM Discovery Doc

Full investigation: `../discovery/CR_010_POS_CATEGORY_ID_END_TO_END_DISCOVERY.md`

---

## 12. Status

```
pos_handoff_category_id_required_field_owner_confirmed_will_send
```

**Awaiting POS:** deployment timeline confirmation + sample request payload
demonstrating `category_id` populated.

End of POS handoff.
