# Complete POS Payload Field Mapping — Menu Items

**ID:** INV-2026-06-17-002 (Addendum)  
**Subject:** Complete field-by-field payload mapping from POS API to customer display  
**Source API:** `POST https://preprod.mygenie.online/api/v1/web/restaurant-product`

---

## 1. CATEGORY-LEVEL FIELDS (4 fields)

| POS Field | Type | Example | Used Where | Admin Can Override? |
|---|---|---|---|---|
| `category_id` | int | `5297` | Key for matching admin overrides, item grouping | No |
| `category_name` | string | `"Noodles"` | Category header in customer menu | No |
| `category_image` | URL | `"https://preprod.mygenie.online/.../food-default-image.png"` | Not currently displayed in customer app | No |
| `category_description` | string | `""` | Not currently displayed | No |

---

## 2. ITEM-LEVEL FIELDS (71 fields)

### 2.1 Identity & Display (shown to customer)

| POS Field | Type | Example | Customer Display | Admin Override? |
|---|---|---|---|---|
| `id` | int | `204706` | Internal key, used in cart/order payloads | No |
| `name` | string | `"Egg Noodles"` | Item name on menu card | No |
| `description` | string | `"Honey Lemon"` | Shown below item name (expandable) | No |
| `image` | URL | `"https://preprod.mygenie.online/.../food-default-image.png"` | Item image — if default placeholder, image card layout is suppressed | No |
| `slug` | string | `"egg-noodles-204706"` | Not displayed | No |

**Image logic:** Frontend checks `item.image` against pattern `/admin/img/.*food-default-image/`. If it matches → treated as "no image" → compact card layout. Only custom-uploaded images get the image card.

### 2.2 Pricing

| POS Field | Type | Example | Customer Display | Admin Override? |
|---|---|---|---|---|
| `price` | number | `199` | Base price shown on menu card | No |
| `discount` | number | `0` | Discount amount | No |
| `discount_type` | string | `"percent"` | Discount calculation method | No |
| `restaurant_discount` | number | `0` | Restaurant-level discount | No |
| `tax` | string | `"0.00"` | Tax percentage applied to item | No |
| `tax_type` | string | `"GST"` | Tax type (GST or VAT) | No |
| `tax_calc` | string | `"Exclusive"` | Tax calculation mode (Inclusive/Exclusive) | No |
| `pack_charges` | string | `"0.00"` | Packaging charges | No |
| `delivery_charge` | string | `"0.00"` | Per-item delivery charge | No |
| `takeaway_charge` | string | `"0.00"` | Per-item takeaway charge | No |

### 2.3 Variations (customization options)

| POS Field | Type | Example | Customer Display | Admin Override? |
|---|---|---|---|---|
| `variations` | array | `[{"name":"Choice Of Size","type":"single","min":0,"max":0,"required":"on","values":[{"label":"Half","optionPrice":"0"},{"label":"Full","optionPrice":"250"}]}]` | Shown in customization modal when adding to cart | No |

**Variation structure:**
```json
{
  "name": "Choice Of Size",      // Group name
  "type": "single",               // "single" or "multi"
  "min": 0,                       // Minimum selections
  "max": 0,                       // Maximum selections (0 = unlimited)
  "required": "on",               // "on" = mandatory selection
  "values": [
    { "label": "Half", "optionPrice": "0" },
    { "label": "Full", "optionPrice": "250" }
  ]
}
```

### 2.4 Add-ons (extras)

| POS Field | Type | Example | Customer Display | Admin Override? |
|---|---|---|---|---|
| `add_ons` | array | `[{"id":11602,"name":"Amul Butter","price":20}]` | Shown in customization modal | No |

**Add-on structure:**
```json
{
  "id": 11602,
  "name": "Amul Butter",
  "price": 20
}
```

### 2.5 Availability & Status Controls

| POS Field | Type | Example | Effect | Admin Override? |
|---|---|---|---|---|
| `live_web` | string | `"Y"` | **MASTER KILL SWITCH** — `"Y"` = shown, anything else = hidden. Admin CANNOT override this. | **NO** |
| `status` | int | `1` | Item active status (1 = active) | No |
| `is_disable` | string | `"N"` | Item disable flag | No |
| `stock_out` | string | `"N"` | Stock-out flag | No |
| `food_stock` | int | `0` | Stock quantity (0 = unlimited) | No |
| `is_inventory` | string | `"No"` | Inventory tracking enabled | No |
| `web_available_time_starts` | string/null | `"00:00:00"` or `null` | POS timing — when item becomes available (HH:MM:SS). Null = 24hr. | **YES** — admin `itemTimings` overrides this |
| `web_available_time_ends` | string/null | `"23:59:59"` or `null` | POS timing — when item becomes unavailable. Null = 24hr. | **YES** — admin `itemTimings` overrides this |
| `available_time_starts` | string | `"00:00:00"` | General availability start (not used for web display) | No |
| `available_time_ends` | string | `"23:59:59"` | General availability end (not used for web display) | No |

### 2.6 Channel Eligibility (order type filtering)

| POS Field | Type | Example | Effect | Admin Override? |
|---|---|---|---|---|
| `dinein` | string | `"Yes"` | Item allowed for dine-in orders. `"No"` = hidden on dine-in menu. | No |
| `takeaway` | string | `"Yes"` | Item allowed for takeaway orders | No |
| `delivery` | string | `"Yes"` | Item allowed for delivery orders | No |

**Logic:** `channelEligibility.js` checks: if order type is "dinein" and `item.dinein === "No"` → item is filtered out. Permissive default — anything other than explicit `"No"` means allowed.

### 2.7 Classification & Dietary

| POS Field | Type | Example | Customer Display | Admin Override? |
|---|---|---|---|---|
| `veg` | int | `0`/`1`/`2` | Veg indicator badge — **0** = Non-Veg (red), **1** = Veg (green), **2** = Egg (yellow) | No |
| `jain` | int | `0` | Jain food flag | No |
| `egg` | int | `0` | Contains egg flag | No |
| `allergens` | array | `[]` | Allergen tags displayed on item card | No |
| `cuisines` | array | `[]` | Cuisine tags (not prominently displayed) | No |

### 2.8 Restaurant & Station Context

| POS Field | Type | Example | Used For | Admin Override? |
|---|---|---|---|---|
| `restaurant_id` | int | `698` | Restaurant association | No |
| `restaurant_name` | string | `"Cafe Flora"` | Restaurant context | No |
| `restaurant_status` | int | `1` | Restaurant active status | No |
| `restaurant_opening_time` | null/string | `null` | Restaurant hours (legacy) | No |
| `restaurant_closing_time` | null/string | `null` | Restaurant hours (legacy) | No |
| `category_id` | int | `5297` | Category association | No |
| `category_ids` | array | `[{"id":"5297","position":1}]` | Multi-category mapping | No |
| `station_name` | string | `"KDS"` | Kitchen display station (used in order payload) | No |
| `food_for` | string | `"Normal"` | Menu type — `"Normal"`, `"Party"`, `"Premium"`, or station name | No |

### 2.9 Delivery & Timing Metadata

| POS Field | Type | Example | Used For | Admin Override? |
|---|---|---|---|---|
| `min_delivery_time` | int | `0` | Estimated delivery time (min) | No |
| `max_delivery_time` | int | `0` | Estimated delivery time (max) | No |
| `prepration_time_min` | null/int | `null` | Preparation time in minutes | No |
| `serve_time_in_min` | int | `0` | Serving time in minutes | No |
| `free_delivery` | int | `0` | Free delivery eligible | No |
| `schedule_order` | int | `0` | Scheduled order eligible | No |

### 2.10 Ratings & Analytics

| POS Field | Type | Example | Customer Display | Admin Override? |
|---|---|---|---|---|
| `avg_rating` | number | `0` | Average rating (shown if > 0) | No |
| `rating_count` | int | `0` | Number of ratings | No |
| `order_count` | int | `0` | Total times ordered | No |
| `recommended` | int | `0` | Recommended flag (1 = recommended) | No |

### 2.11 Other Metadata (not directly displayed)

| POS Field | Type | Example | Purpose |
|---|---|---|---|
| `food_order` | int | `0` | POS sort order |
| `food_status` | int | `0` | Food status code |
| `item_code` | string | `""` | Internal item code |
| `kcal` | string | `"0"` | Calorie info |
| `portion_size` | null/string | `null` | Portion size info |
| `complementary` | string | `"no"` | Complementary item flag |
| `complementary_price` | string | `"0"` | Complementary price |
| `give_discount` | string | `"Yes"` | Discount eligible |
| `packed_food` | string | `"No"` | Packed food flag |
| `is_recipe` | string | `"N"` | Has recipe flag |
| `recipe` | null/object | `null` | Recipe details |
| `recipe_id` | null/int | `null` | Recipe ID |
| `recipe_status` | string | `"No"` | Recipe active status |
| `attributes` | string | `"[]"` | Item attributes (JSON string) |
| `choice_options` | array | `[]` | Choice options (legacy?) |
| `created_at` | string | `"2026-05-30 03:52:42"` | Creation timestamp |
| `updated_at` | string | `"2026-05-30 03:52:42"` | Last update timestamp |

---

## 3. COMPLETE OVERRIDE MAP — POS vs Admin

| What | POS Controls | Admin Can Override |
|---|---|---|
| **Item exists** | YES (master) | NO — can only hide via visibility toggle |
| **Item name** | YES | NO |
| **Item description** | YES | NO |
| **Item image** | YES | NO |
| **Item price** | YES | NO |
| **Variations** | YES | NO |
| **Add-ons** | YES | NO |
| **Veg/Non-veg/Egg** | YES | NO |
| **Allergens** | YES | NO |
| **Tax rate & type** | YES | NO |
| **`live_web` (kill switch)** | YES | **NO** — highest priority |
| **Channel eligibility** | YES (dinein/takeaway/delivery) | NO |
| **Display order** | YES (food_order) | **YES** — admin drag-drop overrides POS sort |
| **Visibility** | N/A | **YES** — admin can hide categories/items |
| **Availability timing** | YES (web_available_time_starts/ends) | **YES** — admin `itemTimings`/`categoryTimings` override POS |
| **Category grouping** | YES (category_id) | NO |
| **Station assignment** | YES (food_for, station_name) | NO |

---

## 4. AVAILABILITY CASCADE (complete decision tree)

```
Is item shown to customer?

 ├─ live_web !== 'Y'?           → HIDDEN (POS kill switch, cannot override)
 ├─ status !== 1?               → HIDDEN
 ├─ is_disable === 'Y'?        → HIDDEN
 ├─ stock_out === 'Y'?         → HIDDEN (greyed out / "Out of Stock")
 │
 ├─ Admin categoryVisibility[catId] === false?  → CATEGORY HIDDEN (all items in it)
 ├─ Admin itemVisibility[catId][itemId] === false?  → ITEM HIDDEN
 │
 ├─ Channel check:
 │   ├─ orderType=dinein  & item.dinein='No'?    → FILTERED OUT
 │   ├─ orderType=takeaway & item.takeaway='No'? → FILTERED OUT
 │   └─ orderType=delivery & item.delivery='No'? → FILTERED OUT
 │
 └─ Time check (cascade):
     ├─ Admin categoryTimings[catId] exists?  → outside window = UNAVAILABLE
     ├─ Admin itemTimings[itemId] exists?     → use admin time window
     ├─ POS web_available_time_starts/ends?   → use POS time window
     └─ No timing at all?                    → AVAILABLE 24hrs
```

---

## 5. RESTAURANT INFO ENDPOINT

Separate from menu items, the restaurant details come from:

**API:** `POST /web/restaurant-info` with `{"restaurant_id": "698"}`

This returns restaurant-level data including:
- `online_order` — "Yes"/"No" master toggle
- `gst_status` — GST enabled at restaurant level
- `multiple_menu` — "Yes"/"No" multi-menu flag
- `razorpay` — Razorpay payment config (key, etc.)
- `service_charge_percent` — Service charge percentage
- `service_charge_auto_apply` — Auto-apply service charge
- Opening/closing times, address, logo, etc.

---

*Report saved as addendum to INV-2026-06-17-002*
