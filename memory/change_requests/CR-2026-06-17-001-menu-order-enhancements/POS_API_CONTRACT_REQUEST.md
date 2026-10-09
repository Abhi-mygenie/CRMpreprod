# POS API Contract Request — Sort Order & Timing Fields

**From:** MyGenie Customer App Team  
**To:** POS API Team  
**Date:** 2026-06-17  
**Priority:** P1  
**Reference:** CR-2026-06-17-001 (Menu Order Enhancements)

---

## Summary

The Customer App needs sort order fields for categories and menus/stations to display menu items in the correct sequence. Currently only items have `food_order` — categories and menus have no equivalent. Additionally, `web_available_time_starts/ends` is not being populated for any restaurant.

---

## REQUEST 1: Category Sort Order (POS-1)

**Endpoint:** `POST /web/restaurant-product`

**Current category fields:**
```json
{
  "category_name": "Noodles",
  "category_id": 5297,
  "category_image": "https://...",
  "category_description": "",
  "items": [...]
}
```

**Requested addition:**
```json
{
  "category_name": "Noodles",
  "category_id": 5297,
  "category_image": "https://...",
  "category_description": "",
  "category_order": 3,
  "items": [...]
}
```

| Field | Type | Description |
|---|---|---|
| `category_order` | int | Sort position for this category within the restaurant. 0 = unset. Ascending order (1 first, 2 second, etc.) |

**Why needed:** Categories currently arrive in arbitrary POS-internal order with no field to sort by. Customer app and admin have no baseline ordering. 42 categories for Hyatt (716) show in random order.

---

## REQUEST 2: Menu/Station Sort Order (POS-2)

**Endpoint:** `POST /web/menu-master`

**Current menu fields:**
```json
{
  "id": 4173,
  "menu_name": "Promational Menu",
  "image": null,
  "description": null,
  "opening_time": "13:00:00",
  "closing_time": "19:00:00"
}
```

**Requested addition:**
```json
{
  "id": 4173,
  "menu_name": "Promational Menu",
  "image": null,
  "description": null,
  "opening_time": "13:00:00",
  "closing_time": "19:00:00",
  "menu_order": 1
}
```

| Field | Type | Description |
|---|---|---|
| `menu_order` | int | Sort position for this menu/station. 0 = unset. Ascending order. |

**Why needed:** Menus/stations arrive in arbitrary order. Hyatt (716) has 12 menus (Breakfast, GROK, FOOD MENU, etc.) with no way to control display sequence from POS.

---

## REQUEST 3: Populate `food_order` for All Restaurants (POS-3)

**Endpoint:** `POST /web/restaurant-product` (item-level field)

**Current state:** `food_order` field exists on every item but is `0` for most restaurants.

| Restaurant | `food_order` populated? |
|---|---|
| 478 (18march) | YES — 135/147 items |
| 689 (Kunafa Mahal) | YES — 97/99 items |
| 541 (Palm House) | NO — all 0 |
| 698 (Cafe Flora) | NO — all 0 |
| 716 (Hyatt) | NO — all 0 |
| 762, 523, 719, 601, 474 | NO — all 0 |

**Request:** Ensure `food_order` is populated (either via POS admin UI or API default) for all restaurants. When `food_order=0` for all items, the customer sees arbitrary ordering.

**Note:** This may be a restaurant operational issue (restaurants need to set sort order in POS admin) rather than an API issue. Please clarify if there's a POS admin feature for this that restaurants need to enable.

---

## REQUEST 4: Populate `web_available_time_starts/ends` (POS-4)

**Endpoint:** `POST /web/restaurant-product` (item-level fields)

**Current state:** Fields exist but are `null` for ALL items across ALL restaurants checked (478, 541, 689, 698, 716, 762, 523, 719, 601, 474).

Related fields:
- `available_time_starts` / `available_time_ends` — always `00:00:00` / `23:59:59`
- `web_available_time_starts` / `web_available_time_ends` — always `null`

**Request:** When a restaurant sets item-level time restrictions in POS, populate `web_available_time_starts` and `web_available_time_ends` with the actual time window. The Customer App already has full timing logic built (`itemAvailability.js`) that reads these fields — it just never receives real data.

**Question:** Is `available_time_starts/ends` the correct field for web ordering, or should we use `web_available_time_starts/ends`? Currently we only read the `web_*` variant.

---

## Acceptance Criteria

| # | Request | Customer App Ready? | Blocked Until POS Ships? |
|---|---|---|---|
| POS-1 | `category_order` field in `/web/restaurant-product` | YES — merge logic built, will sort by field once available | YES |
| POS-2 | `menu_order` field in `/web/menu-master` | YES — merge logic built | YES |
| POS-3 | `food_order` populated for all restaurants | YES — customer app will sort by it once populated | Partial — app sorts by it now for restaurants that have it |
| POS-4 | `web_available_time_starts/ends` populated | YES — full timing cascade built and tested | YES |

---

## Contact

For questions about how the Customer App consumes these fields, reference:
- `frontend/src/hooks/useMenuData.js` — POS data fetch + transform
- `frontend/src/pages/MenuItems.jsx` — category/item ordering + visibility
- `frontend/src/utils/itemAvailability.js` — timing cascade logic
- `frontend/src/pages/DiningMenu.jsx` — station timing check

---

*End of POS API Contract Request*
