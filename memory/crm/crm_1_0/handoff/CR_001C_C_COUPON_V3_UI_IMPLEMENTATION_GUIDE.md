# CR-001C-C Coupon V3 UI — Implementation Guide for Next Agent

**Date:** 2026-05-25
**Prerequisite:** Owner must approve V3 preview at `/coupons-v3-preview` before implementing.
**Preview file:** `frontend/src/pages/CouponV3Preview.jsx` (non-functional mockup — reference only)
**Production file to modify:** `frontend/src/pages/CouponsPage.jsx`

---

## Overview

The V3 coupon backend is complete (211/211 QA). The V1+V2 admin UI is live at `/coupons` using a right-side drawer. The V3 preview shows the proposed forms. Implementation = merge the V3 form sections from the preview into the production CouponsPage.

**No backend changes needed.** The `POST /api/coupons` endpoint already accepts all V3 fields (Phase 0 fix applied: `model_dump()` in `coupons.py`).

---

## What To Change in CouponsPage.jsx

### Step 1: Enable V3 types in COUPON_TYPES array (~line 37)

Change `enabled: false` → `enabled: true` for these 3 entries:

```js
// BEFORE
{ id: "time_window", label: "Happy Hour", ..., enabled: false },
{ id: "bogo", label: "BOGO / BXGY", ..., enabled: false },
{ id: "every_nth", label: "Every Nth Item", ..., enabled: false },

// AFTER
{ id: "time_window", label: "Happy Hour", ..., enabled: true, scope: "order", dtype: null, color: "from-cyan-500 to-cyan-600" },
{ id: "bogo", label: "BOGO / BXGY", ..., enabled: true, scope: "order", dtype: null, color: "from-pink-500 to-pink-600" },
{ id: "every_nth", label: "Every Nth Item", ..., enabled: true, scope: "order", dtype: null, color: "from-amber-500 to-amber-600" },
```

### Step 2: Add V3 fields to EMPTY_FORM (~line 47)

Add these fields:

```js
// V3-A
valid_days: [],
start_time: "",
end_time: "",
timezone: "Asia/Kolkata",

// V3-B
buy_quantity: "1",
get_quantity: "1",
buy_food_ids: [],
get_food_ids: [],
buy_category_ids: [],
buy_category_names: [],
get_category_ids: [],
get_category_names: [],
get_discount_type: "free",
get_discount_value: "",
max_applications: "",
allow_repeat: true,
same_item_required: true,
requires_get_item_in_cart: true,

// V3-C
nth_item_number: "",
nth_discount_type: "free",
nth_discount_value: "",
excluded_food_ids: [],
excluded_category_ids: [],
```

### Step 3: Update handleTypeSelect (~line 231)

Map V3 types to `offer_type`:

```js
const handleTypeSelect = (typeId) => {
  const t = COUPON_TYPES.find(ct => ct.id === typeId);
  if (!t || !t.enabled) return;
  setSelectedType(typeId);
  setForm(prev => ({
    ...prev,
    discount_scope: t.scope || "order",
    discount_type: t.dtype || prev.discount_type,
    // V3 offer_type mapping
    offer_type: typeId === "time_window" ? "time_window"
              : typeId === "bogo" ? "bogo"
              : typeId === "every_nth" ? "every_nth"
              : "simple",
  }));
};
```

### Step 4: Update resolveTypeFromCoupon (~line 64)

Handle V3 types when editing existing coupons:

```js
function resolveTypeFromCoupon(c) {
  if (c.offer_type === "time_window") return "time_window";
  if (c.offer_type === "bogo" || c.offer_type === "bxgy") return "bogo";
  if (c.offer_type === "every_nth") return "every_nth";
  const scope = c.discount_scope || "order";
  if (scope === "item") return "item_discount";
  if (scope === "category") return "category_discount";
  return c.discount_type === "percentage" ? "order_percentage" : "order_flat";
}
```

### Step 5: Add V3 form sections in the drawer (inside the `{selectedType && ...}` block)

Copy the form sections from `CouponV3Preview.jsx` — the sections for:
- `{selectedType === "time_window" && ( ... )}` — weekday buttons, time inputs, timezone
- `{selectedType === "bogo" && ( ... )}` — BOGO/BXGY toggle, buy/get qty, item pickers, benefit type
- `{selectedType === "every_nth" && ( ... )}` — nth number, benefit type, eligible/excluded pickers

These go AFTER the V2 sections and BEFORE the common Validity section.

**Key difference from preview:** Replace mock item/category data with the live `menuItems`/`menuCategories` state and `menuLoading` that already exist in CouponsPage.

### Step 6: Update handleSubmit to include V3 payload fields

Add to the payload construction:

```js
// V3-A
if (selectedType === "time_window") {
  payload.offer_type = "time_window";
  payload.valid_days = form.valid_days.length > 0 ? form.valid_days : null;
  payload.start_time = form.start_time || null;
  payload.end_time = form.end_time || null;
  payload.timezone = form.timezone || null;
}

// V3-B
if (selectedType === "bogo") {
  payload.offer_type = bogoMode; // "bogo" or "bxgy"
  payload.buy_quantity = parseInt(form.buy_quantity) || 1;
  payload.get_quantity = parseInt(form.get_quantity) || 1;
  payload.buy_food_ids = form.buy_food_ids.length > 0 ? form.buy_food_ids : null;
  payload.get_food_ids = !form.same_item_required && form.get_food_ids.length > 0 ? form.get_food_ids : null;
  payload.get_discount_type = form.get_discount_type;
  payload.get_discount_value = form.get_discount_type !== "free" ? parseFloat(form.get_discount_value) : null;
  payload.same_item_required = form.same_item_required;
  payload.max_applications = form.max_applications ? parseInt(form.max_applications) : null;
  payload.allow_repeat = form.allow_repeat;
  payload.apply_to_cheapest_item = form.apply_to_cheapest_item;
  payload.apply_to_highest_item = form.apply_to_highest_item;
  payload.requires_get_item_in_cart = form.requires_get_item_in_cart;
}

// V3-C
if (selectedType === "every_nth") {
  payload.offer_type = "every_nth";
  payload.nth_item_number = parseInt(form.nth_item_number) || null;
  payload.nth_discount_type = form.nth_discount_type;
  payload.nth_discount_value = form.nth_discount_type !== "free" ? parseFloat(form.nth_discount_value) : null;
  payload.eligible_food_ids = form.eligible_food_ids.length > 0 ? form.eligible_food_ids : null;
  payload.eligible_category_ids = selectedCats.map(c => c.id);
  payload.eligible_category_names = selectedCats.map(c => c.name);
  payload.excluded_item_ids = form.excluded_food_ids?.length > 0 ? form.excluded_food_ids : null;
  payload.max_applications = form.max_applications ? parseInt(form.max_applications) : null;
  payload.allow_repeat = form.allow_repeat;
  payload.apply_to_cheapest_item = form.apply_to_cheapest_item;
  payload.apply_to_highest_item = form.apply_to_highest_item;
}

// Common for all V3
if (form.pos_instruction) payload.pos_instruction = form.pos_instruction;
```

### Step 7: Update openEdit to populate V3 fields

In the `openEdit` function, add V3 field mapping from the coupon object to form state, similar to how V2 fields are already mapped.

### Step 8: Add V3 scope badges to the list

Update `SCOPE_COLORS` and `SCOPE_LABELS`:
```js
const SCOPE_COLORS = {
  order: "bg-blue-50 text-blue-700 border-blue-200",
  item: "bg-purple-50 text-purple-700 border-purple-200",
  category: "bg-emerald-50 text-emerald-700 border-emerald-200",
  time_window: "bg-cyan-50 text-cyan-700 border-cyan-200",
  bogo: "bg-pink-50 text-pink-700 border-pink-200",
  every_nth: "bg-amber-50 text-amber-700 border-amber-200",
};
```

### Step 9: Clean up preview

After V3 is wired into production `/coupons`:
1. Delete `frontend/src/pages/CouponV3Preview.jsx`
2. Remove the `/coupons-v3-preview` route from `App.js`
3. Remove the `CouponV3Preview` import from `App.js`

---

## Backend Field Reference (schemas.py)

### V3-A (Time Window)
| Field | Type | Default | Validation |
|---|---|---|---|
| `offer_type` | str | `"simple"` | Must be `"simple"` / `"time_window"` / `"bogo"` / `"bxgy"` / `"every_nth"` |
| `valid_days` | List[int] | null | ISO weekday ints 0-6 (Mon=0, Sun=6) |
| `start_time` | str | null | `"HH:MM"` 24h format |
| `end_time` | str | null | `"HH:MM"` 24h format |
| `timezone` | str | null | IANA timezone string, validated via ZoneInfo |

### V3-B (BOGO/BXGY)
| Field | Type | Default | Validation |
|---|---|---|---|
| `buy_quantity` | int | null | >= 1 |
| `get_quantity` | int | null | >= 1 |
| `buy_food_ids` | List[str] | null | |
| `get_food_ids` | List[str] | null | |
| `buy_category_ids` | List[str] | null | |
| `buy_category_names` | List[str] | null | |
| `get_category_ids` | List[str] | null | |
| `get_category_names` | List[str] | null | |
| `get_discount_type` | str | null | `"free"` / `"percentage"` / `"flat"` |
| `get_discount_value` | float | null | |
| `max_applications` | int | null | >= 1 |
| `allow_repeat` | bool | true | |
| `same_item_required` | bool | null | |
| `requires_get_item_in_cart` | bool | true | |
| `pos_instruction` | str | null | |

### V3-C (Every Nth)
| Field | Type | Default | Validation |
|---|---|---|---|
| `nth_item_number` | int | null | >= 2 |
| `nth_discount_type` | str | null | `"free"` / `"percentage"` / `"flat"` |
| `nth_discount_value` | float | null | |
| `excluded_item_ids` | List[str] | null | |
| `excluded_category_ids` | List[str] | null | |
| + reuses: `eligible_food_ids`, `eligible_category_ids`, `eligible_category_names`, `max_applications`, `allow_repeat`, `apply_to_cheapest_item`, `apply_to_highest_item`, `pos_instruction` |

---

## Testing After Implementation

1. Create a V3-A coupon (Happy Hour, 20% off, Mon-Fri, 12:00-15:00, Asia/Kolkata)
2. Create a V3-B coupon (BOGO, buy 1 Kunafa get 1 free, same item)
3. Create a V3-C coupon (Every 5th coffee free)
4. Verify all 3 appear in the list with correct badges
5. Edit each — verify fields populate correctly
6. Toggle active/inactive — verify works
7. Delete one — verify removed

No POS testing needed (POS contract violations still pending).

---

## Estimated Effort

| Phase | Task | Effort |
|---|---|---|
| V3-A | Enable type + add time window form section + payload mapping | ~1 hour |
| V3-B | Enable type + add BOGO/BXGY form section + dual item pickers + payload mapping | ~2 hours |
| V3-C | Enable type + add Every Nth form section + excluded items + payload mapping | ~1.5 hours |
| Cleanup | Delete preview page + route | 5 minutes |
| **Total** | | **~4.5 hours** |
