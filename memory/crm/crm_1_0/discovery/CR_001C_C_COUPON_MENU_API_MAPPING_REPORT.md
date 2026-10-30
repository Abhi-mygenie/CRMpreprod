# CR-001C-C — Menu API to Coupon Field Mapping Report

> **ℹ️ ID-MISMATCH BLOCKER CLOSED 2026-05-26.** The "Menu API `product.id = 182041` vs POS `item_id = 2248768`" mismatch documented in this report (and previously flagged as BLOCKER B3) is **closed in production**. POS team now sends stable `pos_food_id` on every `/api/pos/orders` item — verified live on R689 across 15 / 15 most-recent payloads (0 / 15 carry the old `item_id` on items).
>
> See `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md` (Violation #1 closure).
>
> The rest of this discovery document remains accurate for context on menu API shape and category-name resolution.

**Date:** 2026-05-25
**Status:** `cr001c_coupon_menu_api_mapping_complete` *(ID-mismatch sub-blocker closed 2026-05-26)*
**Mode:** Discovery only — no implementation

---

## 1. Menu API Endpoint

```
GET https://preprod.mygenie.online/api/v1/vendoremployee/get-products-list
  ?limit=500&offset=1&type=all
Authorization: Bearer <mygenie_token>
```

**Response:**
```json
{
  "total_size": 89,
  "limit": "5",
  "offset": "1",
  "products": [ ... ]
}
```

**No separate categories endpoint exists.** Categories must be derived from the products list.

---

## 2. Menu API Product Fields (relevant to coupons)

| API Field | Type | Example | Purpose |
|---|---|---|---|
| `id` | `int` | `182041` | **Food ID** — primary item identifier |
| `name` | `string` | `"Royal Rose Velet Koshari"` | Item display name |
| `price` | `int/float` | `379` | Item price |
| `category_id` | `int` | `6777` | Category ID — primary category |
| `category_ids` | `array` | `[{"id": "6777", "position": 0}]` | Multi-category (id as string inside) |
| `veg` | `int` | `1` | Veg flag (1=veg, 0=non-veg) |
| `status` | `int` | `1` | Active status (1=active) |
| `restaurant_id` | `int` | `689` | Restaurant scope |
| `item_code` | `string` | `"F009"` | Internal item code |
| `image` | `string` | URL | Item image |
| `station_name` | `string` | `"KDS"` | Kitchen station |

---

## 3. Critical Mapping: Menu API → CRM Coupon Fields

### Item-Level Matching (V2 `discount_scope: "item"`)

| CRM Coupon Field | Maps to Menu API | Maps to POS Order | Notes |
|---|---|---|---|
| `eligible_food_ids` | `product.id` (as string) | `order.items[].pos_food_id` | **PRIMARY match path.** Menu API `id` = `182041`, POS sends `pos_food_id` = `"2248768"`. **WARNING: IDs may differ between menu API and POS!** |
| `eligible_item_ids` | `product.id` (as string) | `order.items[].item_id` | Secondary match path. Same ID concern. |

### Category-Level Matching (V2 `discount_scope: "category"`)

| CRM Coupon Field | Maps to Menu API | Maps to POS Order | Notes |
|---|---|---|---|
| `eligible_category_ids` | `product.category_id` (as string) | `order.items[].category_id` | Category ID. POS orders currently send `category_id: None` for R689. |
| `eligible_category_names` | **NOT IN API** | `order.items[].item_category` | No category NAME in product API response. POS also sends `item_category: None` for R689. |

---

## 4. ID Mismatch Discovery — CRITICAL FINDING

**Menu API item IDs and POS order item IDs are DIFFERENT for the same restaurant.**

| Source | Item | ID |
|---|---|---|
| Menu API | Golden Caramel Nutty Koshari | `182041` |
| POS Order 868992 | Golden Caramel Nutty Koshari | `2248768` |

**Root cause:** The Menu API returns `product.id` (the food catalog ID), while POS orders send `item_id` / `pos_food_id` which appears to be a different ID (possibly order-line or variant ID from a different table).

**Impact on coupon matching:**
- If admin creates a coupon with `eligible_food_ids: ["182041"]` from the menu API...
- ...and POS sends `pos_food_id: "2248768"` in the order...
- ...the coupon engine's `_line_matches_item_scope` will NOT match.

**This is a blocker for item-level coupons unless resolved.**

---

## 5. Category Name Gap

The Menu API product response has `category_id: 6777` but **no `category_name` field**.

The POS order items also send `item_category: None`.

**Impact:** Category-level coupons that use `eligible_category_names` (the human-readable fallback) cannot be populated from either source.

**Workaround options:**
1. Build a category lookup map from a separate API (if exists)
2. Use `category_id` only (not names)
3. Fetch category names from order_items collection in CRM DB

Let me check option 3:

---

## 6. Category Names from CRM DB

```
order_items.item_category: None (for R689 POS orders)
```

R689 POS orders do NOT send category information. Categories are only known at the menu-catalog level via `category_id` (numeric).

---

## 7. Recommended Mapping for Implementation

### For Item Selector (UI → Coupon Create):

| UI Shows | Stored in Coupon | Match Strategy |
|---|---|---|
| Product name + price from Menu API | `eligible_food_ids: [str(product.id)]` | Matches via `_line_matches_item_scope` against `line.food_id` |

**RISK:** Menu API `product.id` may not match POS `pos_food_id`. Need owner to confirm which ID POS uses when sending items. If they differ, we need a lookup/mapping table.

**UPDATE (2026-05-25):** Confirmed via live orders (868994, 868999) that POS sends `item_id` (order-line ID, changes every order) NOT `pos_food_id` (stable product.id). POS contract violation reported. POS team must add `pos_food_id` per contract. **CRM planning continues as per contract — no CRM changes needed.** See `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md`.

### For Category Selector (UI → Coupon Create):

| UI Shows | Stored in Coupon | Match Strategy |
|---|---|---|
| Category name (derived from grouping products by category_id) | `eligible_category_ids: [str(product.category_id)]` | Matches via `_line_matches_category_scope` against `line.category_id` |

**RISK:** POS orders currently send `item_category: None`, so category matching may only work if POS starts sending `category_id`. The coupon engine supports fallback to `item_category` string matching, but that field is also null.

---

## 8. Auth Token Concern

The Menu API uses a **MyGenie employee bearer token**, not the CRM JWT or POS API key. The CRM backend needs a way to call this API on behalf of the restaurant.

**Options:**
1. **Proxy through CRM backend** — CRM stores the MyGenie token per restaurant (from login flow) and proxies menu requests
2. **Frontend direct call** — Frontend uses the MyGenie token from the login session to call the menu API directly
3. **CRM caches menu data** — Backend periodically syncs menu items into a local collection

**Recommendation:** Option 2 (frontend direct) for MVP — the MyGenie token is already available from the login flow. CRM backend doesn't need to change. Cache for performance later.

---

## 9. Owner Questions Before Implementation

### Q-MAP-1: Item ID Mismatch
Menu API `product.id` (e.g., `182041`) ≠ POS order `pos_food_id` (e.g., `2248768`).
- **A.** These are the same ID and will match (I need to verify my sample)
- **B.** These are different IDs — POS team needs to confirm which ID to use
- **C.** We need a mapping table between menu_id and pos_food_id

### Q-MAP-2: Category Matching
POS orders currently don't send `category_id` or `item_category`.
- **A.** POS will start sending `category_id` in order items
- **B.** Use `category_id` from menu API only for admin selection; matching will work once POS sends it
- **C.** Defer category coupons until POS sends category data

### Q-MAP-3: Menu API Auth
How should CRM access the menu API?
- **A.** Frontend calls menu API directly using the MyGenie session token
- **B.** CRM backend proxies the menu API call
- **C.** CRM caches menu items locally

---

## 10. Data Summary for R689 (Kunafa Mahal)

| Metric | Value |
|---|---|
| Total menu items | 89 |
| Distinct categories | 14 |
| Category IDs | 5116-6777 |
| Item ID range (menu API) | 182038-182048+ |
| Item ID range (POS orders) | 2248768-2248769+ |
| Category names available? | NO (not in API response) |

---

## 11. Final Status

```
cr001c_coupon_menu_api_mapping_complete_blocked_on_owner_id_mismatch_decision
```

**Cannot proceed to implementation until Q-MAP-1 (item ID mismatch) is resolved.** This determines whether the item selector will work end-to-end or produce coupons that silently fail to match.
