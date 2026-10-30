# CR-001C-C V3-C Every Nth Item — UI Wiring Plan

**Date:** 2026-05-25
**File:** `frontend/src/pages/CouponsPage.jsx` (single file, 880 lines)
**Mode:** Planning only — no code changes
**Backend status:** 41/41 QA, 211/211 combined. Admin CRUD verified via live curl.

---

## 1. Executive Summary

Wire the "Every Nth Item" tile from `enabled: false` → `enabled: true` in production `/coupons`, following the exact same pattern used for V3-A Happy Hour and V3-B BOGO/BXGY.

V3-C is **simpler** than V3-B:
- No buy/get split (single eligibility pool)
- No mode toggle (BOGO vs BXGY)
- Adds one new concept: **Excluded Items** picker

---

## 2. Backend Field Mapping (source of truth: `models/schemas.py`)

### V3-C specific fields (all Optional, backward-compatible)

| Backend Field | Type | Default | Validator | UI Element |
|---|---|---|---|---|
| `offer_type` | str | `"simple"` | enum: accepts `"every_nth"` / `"every_nth_item"` → normalised to `"nth_item"` | **Hidden** — set to `"nth_item"` in handleSubmit |
| `nth_item_number` | int | null | **≥ 2** (Pydantic rejects < 2) | Number input, min=2, required |
| `nth_discount_type` | str | null | enum: `"free"` / `"percentage"` / `"flat"` | 3-button selector (same as V3-B benefit type) |
| `nth_discount_value` | float | null | required if type ≠ "free" | Number input, shown only when type ≠ "free" |

### Reused fields (already in EMPTY_FORM from V2/V3-B)

| Field | Reused from | UI Element |
|---|---|---|
| `eligible_food_ids` | V2 | `ItemSelector` (existing component) |
| `eligible_category_names` | V2 | `CategorySelector` (existing component) + `selectedCats` state |
| `eligible_category_ids` | V2 | Derived from selectedCats |
| `max_applications` | V3-B | Number input in Advanced |
| `allow_repeat` | V3-B | Switch in Advanced |
| `apply_to_cheapest_item` | V2 | Switch in Advanced |
| `apply_to_highest_item` | V2 | Switch in Advanced (mutex with cheapest) |
| `pos_instruction` | V3-B | Text input in Advanced |

### New field NOT yet in EMPTY_FORM

| Field | Type | Default | UI Element |
|---|---|---|---|
| `excluded_item_ids` | list[str] | null | **Separate ItemSelector** for exclusions |

### Non-consulted V1 fields (overridden in handleSubmit)

| Field | Value | Why |
|---|---|---|
| `discount_type` | `"flat"` | V1 normaliser skipped for V3-C; placeholder |
| `discount_value` | `0` | Same — real discount from nth_discount_type/value |
| `discount_scope` | `"order"` | V3-C is compositional — scope is always order |

---

## 3. Edit-by-Edit Plan (9 edits, all in CouponsPage.jsx)

### Edit 1 — Enable `every_nth` in COUPON_TYPES (line 70)

**Before:**
```js
{ id: "every_nth", label: "Every Nth Item", desc: "Nth item free or discounted", icon: Hash, phase: "V3-C", enabled: false },
```

**After:**
```js
{ id: "every_nth", label: "Every Nth Item", desc: "Nth item free or discounted", icon: Hash, phase: "V3-C", enabled: true, scope: "order", dtype: null, color: "from-amber-500 to-amber-600" },
```

**Risk:** None — identical pattern to V3-A/V3-B.

---

### Edit 2 — Add V3-C fields to EMPTY_FORM (after line 98)

Add:
```js
// V3-C Every Nth
nth_item_number: "",
nth_discount_type: "free",
nth_discount_value: "",
excluded_item_ids: [],
```

**Risk:** None — all additive, safe defaults. `eligible_food_ids`, `eligible_category_names`, `max_applications`, `allow_repeat`, `apply_to_cheapest_item`, `apply_to_highest_item`, `pos_instruction` are already present from V2/V3-B.

---

### Edit 3 — Add V3-C detection to `resolveTypeFromCoupon` (line 109)

Insert before the scope check:
```js
// V3-C: Every Nth Item
if (c.offer_type === "nth_item") return "every_nth";
```

This goes between the V3-B branch (line 107-109) and the scope dispatch (line 110).

**Risk:** Low — must not break V1/V2/V3-A/V3-B paths. The check is offer_type-specific.

---

### Edit 4 — Add V3-C rehydration to `openEdit` (after line 311)

Append to the `setForm({...})` call:
```js
// V3-C Every Nth rehydration
nth_item_number: coupon.nth_item_number != null ? String(coupon.nth_item_number) : "",
nth_discount_type: coupon.nth_discount_type || "free",
nth_discount_value: coupon.nth_discount_value != null ? String(coupon.nth_discount_value) : "",
excluded_item_ids: coupon.excluded_item_ids || [],
```

**Risk:** Low — additive to existing setForm. V3-C fields are Optional on backend.

**Note:** `eligible_food_ids` and `eligible_category_names` are already rehydrated (lines 289-291). `max_applications`, `allow_repeat` already rehydrated (lines 309-311). No duplicate needed.

---

### Edit 5 — Add toggle helper for excluded_item_ids (near line 413)

Add:
```js
const toggleExcludedFoodId = (fid) => setForm(p => ({
  ...p,
  excluded_item_ids: p.excluded_item_ids.includes(fid)
    ? p.excluded_item_ids.filter(x => x !== fid)
    : [...p.excluded_item_ids, fid]
}));
```

**Risk:** None — identical pattern to `toggleFoodId`.

---

### Edit 6 — Add V3-C payload branch to `handleSubmit` (after line 392, V3-B block)

```js
// V3-C Every Nth Item
if (selectedType === "every_nth") {
  payload.discount_scope = "order";
  payload.offer_type = "nth_item";
  payload.discount_type = "flat";
  payload.discount_value = 0;
  payload.nth_item_number = parseInt(form.nth_item_number, 10) || null;
  payload.nth_discount_type = form.nth_discount_type;
  payload.nth_discount_value = (form.nth_discount_type !== "free" && form.nth_discount_value !== "")
    ? parseFloat(form.nth_discount_value) : null;
  // Eligible items/categories — reuse V2 fields
  payload.eligible_food_ids = form.eligible_food_ids.length > 0 ? form.eligible_food_ids : null;
  payload.eligible_category_ids = selectedCats.map(c => c.id);
  payload.eligible_category_names = selectedCats.map(c => c.name);
  // Excluded items
  payload.excluded_item_ids = form.excluded_item_ids.length > 0 ? form.excluded_item_ids : null;
  // Advanced
  payload.max_applications = form.max_applications !== "" ? parseInt(form.max_applications, 10) : null;
  payload.allow_repeat = form.allow_repeat !== false;
  payload.apply_to_cheapest_item = !!form.apply_to_cheapest_item;
  payload.apply_to_highest_item = !!form.apply_to_highest_item;
}
```

**Critical notes:**
- `offer_type` = `"nth_item"` (canonical). Backend also accepts `"every_nth"` and normalises, but canonical is safer.
- `discount_type` / `discount_value` forced to `"flat"` / `0` (non-consulted placeholders, same as V3-B).
- `eligible_food_ids` + `eligible_category_names` use the SAME form state as V2 — safe because only one type is active per drawer session.

**Risk:** Medium — must verify `selectedCats` is populated when editing a V3-C coupon with categories. The existing `openEdit` (line 313) already handles this: `const cats = (coupon.eligible_category_ids || []).map(...)`.

---

### Edit 7 — Add V3-C form section in the drawer (after line 754, V3-B closing tag)

Insert `{selectedType === "every_nth" && (...)}` block containing:

**Section A — "Nth Item Rule":**
- `nth_item_number`: Number input, min=2, required, with helper text "e.g. 5 = every 5th item gets the benefit"
- `nth_discount_type`: 3-button selector (Free / % Off / Rs. Off) — amber color scheme to match the tile
- `nth_discount_value`: Number input, shown only when type ≠ "free"

**Section B — "Eligible Items":**
- `ItemSelector` using `form.eligible_food_ids` + `toggleFoodId` (reuse existing)
- `CategorySelector` using `selectedCats` + `toggleCategory` (reuse existing)
- Label: "Select items OR categories eligible for this offer"

**Section C — "Excluded Items":**
- `ItemSelector` using `form.excluded_item_ids` + `toggleExcludedFoodId`
- Label: "Excluded Items (won't count for Nth)"
- Helper text: "These items will be ignored even if they match the eligible list above"

**Section D — "Advanced" (inside existing Collapsible? NO — dedicated section like V3-B):**
- `max_applications`: Number input
- `allow_repeat`: Switch
- `apply_to_cheapest_item` / `apply_to_highest_item`: Mutex switches
- `pos_instruction`: Text input

**Design decision:** Follow V3-B's pattern — dedicated "Advanced" section inline, NOT inside the generic `Collapsible` at line 816. V3-B puts its advanced settings at lines 724-752 as a standalone section. V3-C should do the same.

**Risk:** Low — all components already exist. Just wiring them into a conditional block.

---

### Edit 8 — Hide generic "Discount Rules" for V3-C (lines 579-607)

The generic "Discount Rules" section shows `Discount (Rs.)` + `Min Order (Rs.)` inputs that are meaningless for V3-C (real discount comes from nth_discount_type/value).

**Proposed:** Wrap lines 579-607 with `{selectedType !== "every_nth" && selectedType !== "bogo" && (...)}`.

**Wait — V3-B currently does NOT hide this section.** For consistency with V3-B's existing behavior, I have two options:

**Option A:** Hide for both V3-B and V3-C (cleaner UX, but changes existing V3-B behavior).
**Option B:** Don't hide — keep showing it (matches V3-B precedent, handleSubmit overrides).

**Recommendation:** Option A — hide for both. The generic discount fields are confusing when V3-B/V3-C have their own benefit sections. V3-B's handleSubmit already forces `flat/0`, so hiding the inputs has zero functional impact.

→ **NEEDS OWNER DECISION (Q1)**

---

### Edit 9 — Reset V3-C state on openCreate (line 261-268)

`openCreate` already resets to `EMPTY_FORM` (line 264). Since we're adding V3-C fields to `EMPTY_FORM` (Edit 2), this is automatically handled. No additional edit needed.

**But:** we should also reset `selectedCats` when switching types. This is already done at line 265: `setSelectedCats([])`. So we're good.

---

## 4. Owner Decision Gate

### Q1 — Hide generic Discount Rules for V3-B and V3-C?

When `selectedType` is `"bogo"` or `"every_nth"`, the generic "Discount Rules" section (discount value, min order) is irrelevant — V3-B/V3-C have their own benefit sections and handleSubmit overrides.

- **A.** Hide for both V3-B and V3-C (cleaner UX — recommended)
- **B.** Keep showing (matches current V3-B behavior exactly)

**Impact:** Zero functional impact either way. A is cosmetic improvement.

### Q2 — Excluded categories picker?

Backend supports `excluded_category_ids`. The preview (CouponV3Preview.jsx) only shows excluded items, not excluded categories.

- **A.** Only show excluded items picker (matches preview, simpler) — **recommended**
- **B.** Also show excluded categories picker

**Impact:** Low — can add later if needed.

---

## 5. Known Non-Blockers

| Item | Status | Impact |
|---|---|---|
| R689 `mygenie_token` expired | Pre-existing | ItemSelector/CategorySelector will show empty with loading state. Owner re-login refreshes. NOT a V3-C wiring issue. |
| POS sends numeric category IDs | Pre-existing POS contract violation | Category coupons won't match at POS validation time. NOT a UI wiring issue. |
| `CouponV3Preview.jsx` cleanup | Deferred | After V3-C wiring, the preview page + route can be removed. Out of scope for this edit. |

---

## 6. QA Plan (post-implementation)

| # | Test | Expected |
|---|---|---|
| Q1 | Click "New Coupon" → "Every Nth Item" tile is clickable (not "Soon") | Tile enabled, amber icon, drawer opens |
| Q2 | Fill: Code=TEST_NTH5, Title="Every 5th Free", nth=5, benefit=Free, select 1 item, dates valid, save | HTTP 201, appears in list with amber "Every Nth" badge |
| Q3 | Verify via `GET /api/coupons` (curl) | `offer_type: "nth_item"`, `nth_item_number: 5`, `nth_discount_type: "free"`, `eligible_food_ids: [...]` |
| Q4 | Edit the saved coupon | Form opens with all V3-C fields populated (nth number, benefit type, items) |
| Q5 | Create with nth=1 → submit | Backend returns 422 (min 2) → toast shows error |
| Q6 | Create with percentage benefit, value=50, select category | Saves with `nth_discount_type: "percentage"`, `nth_discount_value: 50`, `eligible_category_names: [...]` |
| Q7 | Create with excluded items | Saves with `excluded_item_ids: [...]` |
| Q8 | Create with max_applications=2, allow_repeat=false | Saves correctly |
| Q9 | Filter by "Every Nth Item" | Only V3-C coupons shown (SEED_V3C_* + any new ones) |
| Q10 | Regression: create a plain V1 flat coupon | Works exactly as before |
| Q11 | Regression: create a V2 item coupon | Works |
| Q12 | Regression: create a V3-A Happy Hour coupon | Works |
| Q13 | Regression: create/edit a V3-B BOGO coupon | Works |
| Q14 | Edit existing SEED_V3C_EVERY3_FREE | Opens with correct type detected, fields populated |
| Q15 | Toggle active/inactive on a V3-C coupon | Works |
| Q16 | Delete a V3-C test coupon | Works |

---

## 7. File Changes Summary

| File | Change | Lines |
|---|---|---|
| `frontend/src/pages/CouponsPage.jsx` | 9 edits (8 if Q1=B) | ~+110 LOC, ~-2 LOC |
| No other file | — | — |

**No backend, DB, env, dependency, or supervisor changes.**

---

## 8. Effort Estimate

| Step | Time |
|---|---|
| 9 surgical edits | ~45 min |
| Smoke test Q1-Q16 | ~20 min |
| Documentation | ~10 min |
| **Total** | **~1.5 hours** |

---

## 9. Acceptance Criteria

1. "Every Nth Item" tile at `/coupons` is enabled and clickable (amber icon, no "Soon" badge)
2. Selecting the tile reveals a form with: code, title, nth number (min 2), benefit type (Free/% Off/Rs. Off), benefit value, eligible items picker, eligible categories picker, excluded items picker, advanced settings, and the common validity/limits sections
3. Creating a V3-C coupon persists all fields correctly (verified via GET)
4. Editing a V3-C coupon rehydrates all fields
5. All existing V1/V2/V3-A/V3-B create/edit/list/toggle/delete flows still work
6. No backend, DB, env, dependency, or supervisor change
