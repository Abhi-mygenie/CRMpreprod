# Investigation Addendum: Default Menu Ordering — What Happens Without Admin Overrides

**ID:** INV-2026-06-17-002 (Addendum 2)  
**Question:** Does POS send an order? What is the default if admin doesn't set anything?

---

## ANSWER: POS Controls the Default Order. `food_order` Field Exists But Is Always 0.

### What POS sends:

The POS API (`/web/restaurant-product`) returns categories and items in a **server-determined order**. This is NOT sorted by category_id, NOT alphabetical, and NOT by creation date. It's the POS's own internal ordering — likely set by the POS admin panel.

**Evidence (Restaurant 716 — Hyatt Centric):**
```
Category IDs in order received: 7886, 7887, 5925, 5933, 5934, 5932, 5943, ...
- NOT ascending by ID
- NOT descending by ID  
- NOT alphabetical
→ POS server decides the order
```

### The `food_order` field:

Every item has a `food_order` field, but it is `0` for ALL items across ALL categories for both restaurant 698 and 716. This field is **not being used by POS** to sort items — it's always zero.

Items within a category come in the order POS returns them — which appears to be **insertion order** (by item ID ascending within a category).

### The `position` field in `category_ids`:

Each item has `category_ids: [{id: "5297", position: 0}]`. The `position` field is also `0` for almost all items — not used for ordering.

---

## DEFAULT BEHAVIOR — Complete Decision Tree

### When admin has NOT set any menuOrder (current state for ALL restaurants):

```
CATEGORIES:
  menuOrder.categoryOrder = []  (empty/null)
  → Line 104 in MenuItems.jsx: if (categoryOrder.length === 0) return rawMenuSections;
  → Result: CATEGORIES SHOWN IN EXACT POS API RESPONSE ORDER
  → No reordering, no filtering, all visible

ITEMS within each category:
  menuOrder.itemOrder[categoryId] = []  (empty/null)
  → Line 763 in MenuItems.jsx: if (itemOrder.length > 0) { ... }
  → Condition is FALSE → skips reordering
  → Result: ITEMS SHOWN IN EXACT POS API RESPONSE ORDER
  → No reordering, no filtering, all visible

STATIONS (multi-menu):
  menuOrder.stationOrder = []  (empty/null)
  → Same pattern: stations shown in POS menu-master API response order
```

### Summary table:

| Level | Admin Override Set? | What Customer Sees |
|---|---|---|
| **Stations** | NO | POS menu-master API order (by menu `id` internally) |
| **Categories** | NO | POS `/web/restaurant-product` response order |
| **Items** | NO | POS response order within each category |
| **Visibility** | NO | Everything visible (all categories, all items) |
| **Timing** | NO | POS `web_available_time_starts/ends` used. If null → 24hr available |

---

## WHAT THIS MEANS FOR RESTAURANT 716 (Hyatt)

Restaurant 716 has:
- **42 categories** from POS
- **12 stations/menus** (Breakfast, GROK, FOOD MENU, Kids Menu, Bar & Drinks, etc.)
- **No admin menuOrder config exists** in the database
- **No admin categoryTimings or itemTimings set**

**Customer sees:** Categories and items in whatever order POS returns them. First category shown is "Goan Thali", then "Rain Check Combo", then "Desserts", etc.

**If admin wants to change the order:** They need to use the Menu Order admin page → drag categories/items → Save. This creates the `menuOrder` config in the database. Until then, POS order is the default.

---

## IMPORTANT NOTE: `owner@hyatt.com` Does NOT Exist in This Database

The Hyatt admin user is not in the preprod database's `users` collection. The account likely exists only in production. Restaurant 716's config also doesn't exist in this database (no `customer_app_config` entry for restaurant_id "716").

Available restaurants in this environment:
- 698 (Cafe Flora) — owner@cafeflora.com
- 478 (18march) — owner@18march.com
- 762 (DEMO-mygenie Alok) — owner@mygeniealok.com
- And others (see users collection)

---

*End of Addendum 2*
