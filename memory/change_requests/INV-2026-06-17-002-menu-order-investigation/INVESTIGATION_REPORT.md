# Investigation Report: Menu Order Admin Interface — Full Data Flow

**ID:** INV-2026-06-17-002  
**Subject:** How the Menu Order admin interface works — POS data sourcing, admin overrides, and customer-facing rendering  
**Role:** INVESTIGATION (no code edits)

---

## EXECUTIVE SUMMARY

The Menu Order interface is an **override layer on top of POS data**. All menu content (categories, items, prices, availability, timing) comes from the POS API. The admin panel does NOT create or delete menu items — it only controls **display order**, **visibility**, and **timing overrides** for the customer-facing app.

---

## 1. DATA SOURCE: What Comes From POS

### 1.1 API Calls

| API Endpoint | POS URL | What It Returns |
|---|---|---|
| `getRestaurantProducts()` | `POST /web/restaurant-product` | All categories + items for a restaurant |
| `getMenuMaster()` | `POST /web/menu-master` | Station/menu list (for multi-menu restaurants) |

Both call the POS API at `REACT_APP_API_BASE_URL` (`https://preprod.mygenie.online/api/v1`) **directly from the frontend** — NOT proxied through the backend.

### 1.2 Data Fields From POS (per item)

| POS Field | Used For | Example |
|---|---|---|
| `id` | Unique item identifier | `"12345"` |
| `name` | Item display name | `"Afghani Paneer"` |
| `category_id` | Category grouping | `"67"` |
| `category_name` | Category display name | `"Tandoori Starter"` |
| `live_web` | **POS kill switch** — `'Y'` = available, anything else = hidden | `"Y"` |
| `web_available_time_starts` | POS timing — when item becomes available | `"12:00:00"` |
| `web_available_time_ends` | POS timing — when item becomes unavailable | `"23:00:00"` |
| `price`, `variations`, `add_ons` | Pricing and customization | (various) |

### 1.3 POS is the Master

- **POS controls what items exist** — admin cannot add/remove items
- **POS controls `live_web`** — if POS marks an item as not live, it's hidden regardless of admin settings
- **POS controls prices** — admin cannot override prices
- **POS controls item timing defaults** — if no admin override, POS times are used

---

## 2. ADMIN OVERRIDES: What the Menu Order Interface Controls

All admin overrides are stored in the `customer_app_config` collection in MongoDB under the `menuOrder`, `categoryTimings`, and `itemTimings` fields for the restaurant.

### 2.1 Category Controls

| Override | Stored In | How It Works |
|---|---|---|
| **Category Order** (drag & drop) | `config.menuOrder.categoryOrder` | Array of `{id, name}` — defines display sequence. New POS categories not in this list appear at the end. |
| **Category Visibility** (toggle) | `config.menuOrder.categoryVisibility` | Object `{catId: true/false}` — `false` = hidden from customer app. Default: visible. |
| **Category Timing** (clock icon) | `config.categoryTimings` | Object `{catId: {start: "HH:MM", end: "HH:MM"}}` — admin override for when the whole category is available. Overrides POS item times for ALL items in category. |

### 2.2 Item Controls (inside expanded category)

| Override | Stored In | How It Works |
|---|---|---|
| **Item Order** (drag & drop) | `config.menuOrder.itemOrder[categoryId]` | Array of `{id, name}` — defines item sequence within category. |
| **Item Visibility** (eye icon) | `config.menuOrder.itemVisibility[categoryId]` | Object `{itemId: true/false}` — `false` = hidden from customer app. Default: visible. |
| **Item Timing** (clock icon) | `config.itemTimings` | Object `{itemId: {start: "HH:MM", end: "HH:MM"}}` — admin override for when this specific item is available. Overrides POS time for this item only. |

### 2.3 Station Controls (multi-menu restaurants only)

| Override | Stored In | How It Works |
|---|---|---|
| **Station Order** | `config.menuOrder.stationOrder` | Array of `{id, name}` — station display sequence |
| **Station Visibility** | `config.menuOrder.stationVisibility` | Object `{stationId: true/false}` |
| **Station Category Order** | `config.menuOrder.stationCategoryOrder[stationId]` | Per-station category ordering |
| **Station Category Visibility** | `config.menuOrder.stationCategoryVisibility[stationId]` | Per-station category visibility |
| **Station Item Order** | `config.menuOrder.stationItemOrder[stationId__categoryId]` | Per-station item ordering |
| **Station Item Visibility** | `config.menuOrder.stationItemVisibility[stationId__categoryId]` | Per-station item visibility |

---

## 3. MERGE LOGIC: How POS + Admin Overrides Combine

The merge function (`mergeWithSaved`) in `MenuOrderTab.jsx` (line 399):

```
Input:  POS items (apiList) + Admin saved order + Admin saved visibility
Output: Merged list with admin ordering and visibility applied

Algorithm:
1. Walk through admin saved order
2. For each saved entry, find matching POS item
3. Apply visibility (default: true unless explicitly false)
4. Append any NEW POS items not in admin order (at the end, visible by default)
```

**Key behavior:** New items added in POS automatically appear at the bottom of the customer menu, visible by default. Admin doesn't need to do anything for new items to show up.

---

## 4. AVAILABILITY CASCADE: How Item Availability Is Decided

The customer-facing app uses `isItemAvailable()` in `itemAvailability.js` with this priority cascade:

```
Step 1: POS live_web check
   └─ live_web !== 'Y'  →  UNAVAILABLE (hard block, admin cannot override)

Step 2: Admin category timing check
   └─ categoryTimings[catId] exists?
      └─ YES: current time outside range  →  UNAVAILABLE
      └─ NO: continue to step 3

Step 3: Admin item timing check  
   └─ itemTimings[itemId] exists?
      └─ YES: use admin timing  →  check if current time is within range
      └─ NO: use POS timing (web_available_time_starts / web_available_time_ends)
         └─ POS times null?  →  24hr AVAILABLE
         └─ POS times exist?  →  check if current time is within range
```

### Override Priority (highest to lowest):

| Priority | Source | Can Admin Override? |
|---|---|---|
| 1 (highest) | POS `live_web` kill switch | **NO** — if POS says not live, item is hidden |
| 2 | Admin `categoryTimings` | YES — admin sets category-level time windows |
| 3 | Admin `itemTimings` | YES — admin sets item-level time windows |
| 4 (lowest) | POS `web_available_time_starts/ends` | Only via admin timing override |

---

## 5. PERSISTENCE & SAVE FLOW

### 5.1 Save Path

```
Admin changes in UI
  → setConfig() updates React state
  → AdminConfigContext.saveConfig()
  → PUT /api/config/ (backend)
  → MongoDB customer_app_config collection
  → Stored under restaurant_id
```

### 5.2 Config Fields in MongoDB

```json
{
  "restaurant_id": "698",
  "menuOrder": {
    "categoryOrder": [{"id": "67", "name": "Tandoori Starter"}, ...],
    "categoryVisibility": {"67": true, "68": false, ...},
    "itemOrder": {"67": [{"id": "123", "name": "Afghani Paneer"}, ...]},
    "itemVisibility": {"67": {"123": true, "456": false}},
    // Multi-menu variants:
    "stationOrder": [...],
    "stationVisibility": {...},
    "stationCategoryOrder": {...},
    "stationCategoryVisibility": {...},
    "stationItemOrder": {...},
    "stationItemVisibility": {...}
  },
  "categoryTimings": {
    "67": {"start": "18:00", "end": "23:00"}
  },
  "itemTimings": {
    "123": {"start": "12:00", "end": "15:00"}
  }
}
```

### 5.3 Customer App Read Path

```
Customer opens menu
  → RestaurantConfigContext fetches /api/config/{restaurantId}
  → Gets menuOrder, categoryTimings, itemTimings
  → MenuItems.jsx fetches POS data via getRestaurantProducts()
  → Merges POS categories with admin categoryOrder + categoryVisibility
  → Merges POS items with admin itemOrder + itemVisibility
  → Applies timing cascade (isItemAvailable) per item
  → Renders final menu
```

---

## 6. UI FEATURES IN THE SCREENSHOT

| UI Element | What It Does | Stored Where |
|---|---|---|
| **Drag handle (≡)** | Reorder categories by dragging | `menuOrder.categoryOrder` |
| **Category name** (e.g., "Tandoori Starter") | FROM POS — not editable | POS API |
| **Item count badge** (e.g., "5/5 items") | Visible items / total items | Computed from visibility |
| **Clock icon + "24 hrs"** | Category timing — shows admin override or "24 hrs" (no restriction) | `categoryTimings[catId]` |
| **Visible/Hidden toggle** | Category visibility on customer app | `menuOrder.categoryVisibility[catId]` |
| **Chevron (>)** | Expand category to see/manage individual items | UI state only |
| **Search categories** | Filter categories in admin view | UI state only |
| **Refresh button** | Re-fetches latest data from POS API | Triggers `getRestaurantProducts()` |

---

## 7. WHAT ADMIN CAN AND CANNOT DO

### CAN do:
- Reorder categories (drag & drop)
- Reorder items within categories (drag & drop)
- Hide/show entire categories
- Hide/show individual items
- Set time windows for categories (override POS)
- Set time windows for items (override POS)
- Reset timing to POS default (remove admin override)
- Bulk show/hide all items in a category

### CANNOT do:
- Add new menu items (POS only)
- Delete menu items (POS only)
- Change item prices (POS only)
- Override POS `live_web` kill switch (if POS says item is not live, it stays hidden)
- Change item names, descriptions, images (POS only)

---

## 8. TIMING DISPLAY EXPLAINED

In the screenshot, you see "24 hrs" next to each category. This means:

- **No admin timing override** is set for that category
- **POS items** within may have their own individual times, but the category itself has no time restriction
- If admin clicks the clock icon, they can set a time window (e.g., "18:00 - 23:00")
- Once set, it shows as an "admin override" with a reset button to revert to POS default
- **Admin timing always wins over POS timing** for display purposes

---

## INVESTIGATION STATUS

```
Investigation complete: INV-2026-06-17-002
Root cause: N/A (knowledge request, not a bug)
Classification: ARCHITECTURE / DATA_FLOW
Confidence: HIGH
Steps used: 8/10
Evidence: Full code trace across 8 files
Report: /app/memory/change_requests/INV-2026-06-17-002-menu-order-investigation/INVESTIGATION_REPORT.md
```
