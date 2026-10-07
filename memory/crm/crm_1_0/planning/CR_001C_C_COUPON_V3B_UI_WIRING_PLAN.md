# CR-001C-C V3-B BOGO / BXGY — UI Wiring Plan, Field Mapping & Implementation Blueprint

**Date:** 2026-05-25
**Phase:** V3-B BOGO / Buy-X-Get-Y — production UI wiring (medium effort, ~2 hours code + QA)
**Mode:** Planning + mapping only — **no code, no DB, no env, no deploy** in this step
**Sibling doc:** `discovery/CR_001C_C_COUPON_V3B_UI_WIRING_GAP_DISCOVERY.md` (15 docs read, gaps catalogued, 2 prior-guide bugs corrected)
**Prerequisite status:**
- V3-B backend: ✅ QA 49/49 PASS (`cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`)
- V3-A UI live: ✅ `cr001c_coupon_v3a_admin_ui_implementation_qa_passed` (12/12)
- Owner-approved preview at `/coupons-v3-preview` (V3-B form lines 333–405)
- Owner backend gate frozen: all 12 V3-B Q1–Q12 answered (Addendum D, 2026-02)
- Combined regression: V1 45 + V2 45 + V3-A 31 + V3-B 49 + V3-C 41 = **211/211 PASS**

---

## 1. Executive Summary

V3-B BOGO / Buy-X-Get-Y adds **buy-and-get mechanics** to a coupon: customer buys N eligible items, gets M eligible items at a benefit (free, % off, or flat off). The backend is fully ready (49/49 QA). The production `/coupons` page already exposes a "BOGO / BXGY" tile marked **Soon** — we wire the form section, payload mapping, edit-mode rehydration, and a list-row label fix.

### Two CRITICAL corrections over `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md`

| Bug in old guide | Correction (this plan) | Source |
|---|---|---|
| Line 100: `c.offer_type === "bxgy"` (edit-mode detection) | **Use `"bxg"`** (the canonical stored value). Edit-mode detection: `c.offer_type === "bogo" \|\| c.offer_type === "bxg"`. | `backend/models/schemas.py:48-65` — `_v3a_validate_offer_type` allowed enum: `simple` / `bogo` / **`bxg`** / `buy_x_get_y` / `nth_item` / `every_nth` / `every_nth_item` / `free_item` / `combo`. The validator normalises `buy_x_get_y` → `bxg`. No `"bxgy"` exists. |
| Line 136: `payload.offer_type = bogoMode; // "bogo" or "bxgy"` | **Send `"bxg"` for BXGY mode** (not `"bxgy"`). | Same enum. |

Both corrections are encoded verbatim in §5.4 (`handleSubmit`) and §5.5 (`resolveTypeFromCoupon`).

### Key UX design (mode-driven semantics)

A single tile "BOGO / BXGY" opens **one form** that switches behaviour based on a `bogoMode` UI toggle:

| UI mode | `offer_type` sent | `same_item_required` | Item pickers visible | Default qty |
|---|---|---|---|---|
| **BOGO** (default when tile clicked) | `"bogo"` | `true` (locked while mode=BOGO) | **Buy only** | buy=1, get=1, benefit=Free |
| **BXGY** | `"bxg"` | user-controllable (default `false`) | **Buy + Get** | buy=2, get=1, benefit=Free |

The `bogoMode` is purely a UI convenience; the backend cares only about `offer_type` + `same_item_required`. They are kept in sync.

---

## 2. Inputs Reviewed (delta over discovery doc)

Already enumerated in `discovery/CR_001C_C_COUPON_V3B_UI_WIRING_GAP_DISCOVERY.md` §1. No new inputs since. Re-verifying field shape against `backend/models/schemas.py:590-720` at write time.

---

## 3. Backend Field Mapping (Source of Truth)

| Backend field | Type | Default | Validator (`schemas.py`) | UI form field | Required? |
|---|---|---|---|---|---|
| `offer_type` | `str?` | `"simple"` | enum (no `"bxgy"`) | derived from `bogoMode`: `"bogo"` or `"bxg"` | Yes for V3-B |
| `discount_scope` | `str?` | `"order"` | enum order/item/category | hardcoded `"order"` for V3-B | Yes |
| `buy_quantity` | `int?` | `None` | `_v3b_validate_pos_int_ge_one` | `<Input type="number" min="1">` | Yes |
| `get_quantity` | `int?` | `None` | `_v3b_validate_pos_int_ge_one` | `<Input type="number" min="1">` | Yes |
| `same_item_required` | `bool?` | `None` | — | `<Switch>` (forced `true` in BOGO mode) | Conditional |
| `buy_food_ids` | `List[str]?` | `None` | — | `<ItemSelector label="Buy Items">` | At least 1 |
| `get_food_ids` | `List[str]?` | `None` | — | `<ItemSelector label="Get Items">` (shown if `!same_item_required`) | Required when `!same_item_required` |
| `get_discount_type` | `str?` | `None` | `_v3b_validate_get_discount_type` (enum free/percentage/flat) | 3-button toggle | Yes for V3-B |
| `get_discount_value` | `float?` | `None` | — | `<Input type="number">` (shown if type ≠ `"free"`) | Required when type ∈ {percentage, flat} |
| `max_applications` | `int?` | `None` | `_v3b_validate_pos_int_ge_one` | `<Input type="number" min="1">` (advanced collapsible) | Optional |
| `allow_repeat` | `bool?` | `True` | — | `<Switch>` (advanced) | Optional |
| `apply_to_cheapest_item` | `bool` | `False` | — | `<Switch>` (advanced, mutually exclusive with `apply_to_highest_item`) | Optional; already in `EMPTY_FORM` from V2 |
| `apply_to_highest_item` | `bool` | `False` | — | `<Switch>` (advanced) | Optional; already in `EMPTY_FORM` from V2 |
| `pos_instruction` | `str?` | `None` | — | `<Input>` (advanced) | Optional; already in `EMPTY_FORM` from V2 |
| `requires_get_item_in_cart` | `bool?` | `True` | — | **NOT exposed in UI** (locked `true` per Q2=A) | Backend default handles |
| `buy_item_ids` / `buy_category_ids` / `buy_category_names` / `get_item_ids` / `get_category_ids` / `get_category_names` | various | `None` | — | **NOT exposed in v1 UI** (category-scoped BOGO deferred to V3-B2 per OQ-V3B-UI-2) | n/a |

### Validator behaviour callouts

- **`offer_type="bxgy"` rejected** → use `"bxg"`. (Critical.)
- **`buy_quantity` / `get_quantity` / `max_applications` must be int ≥ 1.** Backend 422 on 0 or negative.
- **`get_discount_value` required when `get_discount_type ∈ {percentage, flat}`.** Backend will accept `null` if type is `"free"`. UI should also clear the value when user toggles to Free.
- **`same_item_required=None`** at save → backend engine treats as default behaviour; we always send explicit `true`/`false` to remove ambiguity.
- **`buy_food_ids: []` is allowed by Pydantic** but coupon will silently fail to match at validate time. UI should require ≥1 buy item before save (soft client guard).
- **For BOGO mode (`same_item_required=true`), `get_food_ids` should be `null`** — the engine defaults get-lists to buy-lists when same-item is set. Sending `get_food_ids` populated with same-item is harmless but creates duplicate data; we send `null` for cleanliness.

---

## 4. Current State of `CouponsPage.jsx` (Post-V3-A, 710 lines)

| What exists | Line(s) | V3-B touch needed |
|---|---|---|
| 7-tile selector — `bogo` shown as **Soon** | 38-46 | ⚠️ Flip enabled + add scope/dtype/color |
| `SCOPE_COLORS["bogo"] = "bg-pink-50…"` + `SCOPE_LABELS["bogo"] = "BOGO/BXGY"` | 30-37 | ✅ Already added |
| `resolveCouponBucket` (handles `bogo`/`bxg`) | 28-32 | ✅ Already correct |
| `EMPTY_FORM` | 56-72 | ⚠️ Add 9 fields (`apply_to_*`/`pos_instruction` already exist) |
| `resolveTypeFromCoupon` | 73-83 | ⚠️ Add V3-B branch BEFORE V1/V2 routing |
| `openCreate` → `setForm({...EMPTY_FORM})` + `fetchMenu()` | 221-229 | ✅ No change (menu already fetched) |
| `openEdit` → big `setForm({...})` block + `fetchMenu()` | 231-268 | ⚠️ Add 9 V3-B rehydration lines |
| `handleTypeSelect` | 270-275 | ⚠️ Add `bogo` branch (mode default + buy/get qty defaults + same_item_required) |
| `handleSubmit` | 277-326 | ⚠️ Add V3-B payload branch (~30 LOC). Must send `"bxg"`. |
| `ItemSelector` reused as-is (single-list) | imported | ⚠️ Add optional `label` prop (1-line non-breaking) — used twice in V3-B |
| `Switch`, `Collapsible`, `Settings2`, `Sparkles` already imported | 19-27 | ✅ No new imports needed |
| V3-A time-window section | 565-619 | Insert V3-B section AFTER V3-A and BEFORE Validity (line ~620) |
| List row render shows `Rs.{discount_value} off` | ~340 | ⚠️ Add V3-B-aware label override (polish per OQ-V3B-UI-3) |

---

## 5. UI ↔ Backend Mapping (V3-B)

### 5.1 `COUPON_TYPES[id="bogo"]` after wiring

```js
{ id: "bogo", label: "BOGO / BXGY",
  desc: "Buy-X-Get-Y promotions with free, % or flat benefit",
  icon: ShoppingBag, phase: "V3-B",
  enabled: true,
  scope: "order",                          // V3-B stores discount_scope="order"
  dtype: null,                             // discount_type / value not meaningful — see §5.4
  color: "from-pink-500 to-pink-600" }
```

### 5.2 `EMPTY_FORM` additions (9 new keys; `apply_to_*` + `pos_instruction` already exist from V2)

```js
// V3-B BOGO / BXGY
buy_quantity: "1",
get_quantity: "1",
buy_food_ids: [],
get_food_ids: [],
get_discount_type: "free",
get_discount_value: "",
max_applications: "",
allow_repeat: true,
same_item_required: true,                  // default for BOGO mode
```

### 5.3 `handleTypeSelect` branch for `bogo`

When user picks BOGO/BXGY tile:
- `discount_scope = "order"` (V3-B always stores `"order"`)
- `discount_type = "flat"` (placeholder; not used at compute time for V3-B)
- `discount_value = 0` (placeholder)
- `same_item_required = true` (default to BOGO mode)
- `buy_quantity = "1"`, `get_quantity = "1"`, `get_discount_type = "free"`, `get_discount_value = ""`
- `buy_food_ids = []`, `get_food_ids = []`

The user can flip the mode toggle inside the form to switch to BXGY.

### 5.4 `handleSubmit` payload mapping (V3-B)

When `selectedType === "bogo"`:

```js
payload.discount_scope = "order";
payload.offer_type = form.same_item_required ? "bogo" : "bxg";   // ← CRITICAL: NOT "bxgy"
payload.discount_type = "flat";                                  // neutral; engine reads V3-B fields
payload.discount_value = 0;                                      // neutral
payload.buy_quantity = parseInt(form.buy_quantity, 10) || 1;
payload.get_quantity = parseInt(form.get_quantity, 10) || 1;
payload.same_item_required = !!form.same_item_required;
payload.buy_food_ids = form.buy_food_ids.length > 0 ? form.buy_food_ids : null;
payload.get_food_ids = (!form.same_item_required && form.get_food_ids.length > 0)
  ? form.get_food_ids : null;
payload.get_discount_type = form.get_discount_type;              // "free" / "percentage" / "flat"
payload.get_discount_value = (form.get_discount_type !== "free" && form.get_discount_value !== "")
  ? parseFloat(form.get_discount_value) : null;
payload.max_applications = form.max_applications !== ""
  ? parseInt(form.max_applications, 10) : null;
payload.allow_repeat = form.allow_repeat !== false;
payload.apply_to_cheapest_item = !!form.apply_to_cheapest_item;
payload.apply_to_highest_item = !!form.apply_to_highest_item;
if (form.pos_instruction) payload.pos_instruction = form.pos_instruction;
// requires_get_item_in_cart locked true per Q2=A — omit, backend default handles
```

The existing V1 payload fields (`code`, `title`, `min_order_value`, `max_discount`, `start_date`, `end_date`, `usage_limit`, `per_user_limit`, `applicable_channels`, `stackable_with_loyalty`) are already built — V3-B reuses them all.

### 5.5 `resolveTypeFromCoupon(c)` — edit-mode detection

Add V3-B branch **between** V3-A and V1/V2 routing:

```js
function resolveTypeFromCoupon(c) {
  // V3-A: Happy Hour is compositional — detect by time-window field presence
  if ((c.valid_days && c.valid_days.length > 0) || c.start_time || c.end_time) {
    return "time_window";
  }
  // V3-B: BOGO/BXGY detected by offer_type. Backend stores "bogo" or "bxg" (NEVER "bxgy").
  if (c.offer_type === "bogo" || c.offer_type === "bxg") {
    return "bogo";
  }
  // V1/V2 fallback
  const scope = c.discount_scope || "order";
  if (scope === "item") return "item_discount";
  if (scope === "category") return "category_discount";
  return c.discount_type === "percentage" ? "order_percentage" : "order_flat";
}
```

### 5.6 `openEdit` rehydration additions

Append to the `setForm({...})` call:

```js
// V3-B rehydration
buy_quantity: coupon.buy_quantity != null ? String(coupon.buy_quantity) : "1",
get_quantity: coupon.get_quantity != null ? String(coupon.get_quantity) : "1",
buy_food_ids: coupon.buy_food_ids || [],
get_food_ids: coupon.get_food_ids || [],
get_discount_type: coupon.get_discount_type || "free",
get_discount_value: coupon.get_discount_value != null ? String(coupon.get_discount_value) : "",
max_applications: coupon.max_applications != null ? String(coupon.max_applications) : "",
allow_repeat: coupon.allow_repeat !== false,
same_item_required: coupon.same_item_required !== false,   // default true if undefined
```

### 5.7 Form section (rendered when `selectedType === "bogo"`)

Inserted **after** the V3-A time-window section (line ~619) and **before** the existing Validity & Limits section. ~80 LOC.

| Sub-section | Components | Behaviour |
|---|---|---|
| **Coupon Details** | `code`, `title` | Reused from existing common header — no change |
| **Mode toggle (BOGO ↔ BXGY)** | Two large pill buttons | Selecting BOGO → `same_item_required=true`, clear `get_food_ids`. Selecting BXGY → `same_item_required=false`, keep `get_food_ids`. |
| **Buy / Get Rules** | 2× `Input type="number" min="1"`, 1× `Switch` (same-item — visible only in BXGY mode) | Both qty inputs HTML5-required. Same-item switch visible only when BXGY mode |
| **Buy Items** | `ItemSelector label="Buy Items"` driven by `menuItems` | Always visible; ≥1 required (soft client validation) |
| **Get Items** | `ItemSelector label="Get Items"` driven by `menuItems`, **conditional `!same_item_required`** | Visible only when BXGY + same-item=false; ≥1 required in that state |
| **Get Benefit** | 3-button toggle Free / % Off / Rs. Off, optional value input | Value input hidden when "Free"; HTML5 required when shown |
| **Advanced collapsible** (reuse existing `advancedOpen` state) | `max_applications`, `allow_repeat`, `apply_to_cheapest_item`, `apply_to_highest_item`, `pos_instruction` | All optional |

**Soft client validations:**
- ≥1 buy item before save (toast if empty).
- ≥1 get item when BXGY + same-item=false (toast if empty).
- `get_discount_value` required when type ≠ Free (toast).
- `apply_to_cheapest_item` and `apply_to_highest_item` mutually exclusive (lift preview pattern lines 397-398).

### 5.8 `ItemSelector` 1-line non-breaking change

```jsx
// In ItemSelector component definition
export function ItemSelector({ items, selected, onToggle, loading, label = "Eligible Items" }) {
  // ... existing render uses {label} in place of hardcoded "Eligible Items"
}
```

Backward-compatible — all existing call sites continue to render "Eligible Items".

### 5.9 List row label override (polish per OQ-V3B-UI-3)

In the `filteredCoupons.map(coupon => …)` block, replace the hardcoded `Rs.{discount_value} off` with a V3-B-aware label:

```js
const v3Label = (c) => {
  if (c.offer_type === "bogo" || c.offer_type === "bxg") {
    const benefit = c.get_discount_type === "free" ? "Free"
                  : c.get_discount_type === "percentage" ? `${c.get_discount_value || 0}% off`
                  : `Rs.${c.get_discount_value || 0} off`;
    return `Buy ${c.buy_quantity || 1} Get ${c.get_quantity || 1} ${benefit}`;
  }
  if (c.offer_type === "nth_item") {
    const benefit = c.nth_discount_type === "free" ? "Free"
                  : c.nth_discount_type === "percentage" ? `${c.nth_discount_value || 0}% off`
                  : `Rs.${c.nth_discount_value || 0} off`;
    return `Every ${c.nth_item_number || 0}${nthSuffix(c.nth_item_number)} ${benefit}`;
  }
  return null;
};
// Then in JSX: { v3Label(coupon) || `${formatDiscount(coupon)}` }
```

Helper `nthSuffix(n)`: simple ordinal suffix (2nd, 3rd, 4th, etc.). Already covers V3-C labels as a bonus (free polish, no extra work).

---

## 6. File-by-File Implementation Plan (do NOT execute in this step)

Single file core: `frontend/src/pages/CouponsPage.jsx`. Plus one 1-line non-breaking change to the `ItemSelector` component.

| # | Location | Edit | Risk |
|---|---|---|---|
| 1 | `COUPON_TYPES` line ~46 | Flip `bogo` tile: `enabled: true, scope: "order", dtype: null, color: "from-pink-500 to-pink-600"` | None |
| 2 | `EMPTY_FORM` line ~72 | Add 9 V3-B keys (see §5.2) | None |
| 3 | `resolveTypeFromCoupon` line 73-83 | Add V3-B branch (see §5.5) | Low — must be between V3-A and V1/V2 |
| 4 | `openEdit` `setForm({...})` line 234-262 | Add 9 V3-B rehydration lines (see §5.6) | Low |
| 5 | `handleTypeSelect` line 270-275 | Add `bogo` branch (see §5.3) | None |
| 6 | `handleSubmit` line ~290 (after V3-A branch) | Add V3-B payload branch (~30 LOC, see §5.4). **MUST send `"bxg"` not `"bxgy"`** | **Critical** — review carefully |
| 7 | Form drawer, after V3-A section at line ~619 | Insert V3-B form section (~80 LOC, see §5.7) | Low — guarded by `selectedType === "bogo"` |
| 8 | `frontend/src/pages/CouponsPage.jsx` ItemSelector definition OR if separate file | Add `label = "Eligible Items"` default prop (1-line) | None — backward-compat |
| 9 | List row render in `filteredCoupons.map` line ~340 | Replace hardcoded discount label with `v3Label(coupon) || existing` (see §5.9) | Low — covers V3-B + V3-C labels |
| 10 | Helper functions near top of file | Add `nthSuffix(n)` ordinal helper (~6 LOC) | None |

**Total LOC delta:** approximately **+165 / -10** (form section ~80, payload + rehydration ~50, helpers ~15, tile/EMPTY_FORM/etc ~20).
**No new dependencies.** No new top-level imports needed (`Switch`, `Collapsible`, `Settings2`, `ChevronDown`, `ChevronRight`, `Sparkles` already present).

---

## 7. Owner Decisions Needed

Backend gate frozen on all 12 V3-B Q1-Q12 (`PLANNING_AND_OWNER_GATE` Addendum D). **3 UI-only micro-Qs** remain — each has a safe recommended default so we can proceed without blocking.

| Q | Decision | Recommended default | Impact if owner picks otherwise |
|---|---|---|---|
| **OQ-V3B-UI-1** | Default mode when BOGO tile is clicked | **BOGO** (same-item, simplest, 1 picker) | BXGY → starts with 2 pickers, slightly busier |
| **OQ-V3B-UI-2** | Expose category-scoped buy/get pickers in v1 UI? | **NO** (food_id only; defer category to V3-B2) | YES → +1 day work; 6 extra fields in form |
| **OQ-V3B-UI-3** | Replace "Rs.0 off" with "Buy X Get Y Free" in list row? | **YES** (polish §5.9 — also helps V3-C as a bonus) | NO → list rows for V3-B/V3-C remain confusing |

No blocker. Proceed with defaults unless owner overrides.

---

## 8. QA Plan (post-implementation)

15 manual checks against `https://crm-variable-mapping.preview.emergentagent.com/coupons` using the existing R689 JWT.

**Backend already at 49/49 V3-B QA** — these are **UI-only** smoke tests; no need to re-prove backend semantics.

| # | Test | Expected |
|---|---|---|
| Q1 | "BOGO / BXGY" tile no longer marked **Soon** and is clickable | ✅ |
| Q2 | Click tile → form opens with BOGO mode pre-selected, `same_item=true`, `buy=1`, `get=1`, benefit=Free, 1 item picker visible | ✅ |
| Q3 | Create `UIQA_V3B_BOGO`: Buy 1 KUNAFA_CLASSIC Get 1 Free → save | HTTP 201; `GET /api/coupons/{id}` returns `offer_type:"bogo"`, `same_item_required:true`, `buy_quantity:1`, `get_quantity:1`, `buy_food_ids:["182042"]`, `get_food_ids:null`, `get_discount_type:"free"` |
| Q4 | Toggle to BXGY mode in form → 2nd item picker appears, same-item switch visible & off | ✅ |
| Q5 | Create `UIQA_V3B_BXGY_PCT`: Buy 2 KUNAFA_GOLDEN Get 1 SHAKE 50% off | `offer_type:"bxg"`, `same_item_required:false`, `buy_food_ids:["182041"]`, `get_food_ids:["182046"]`, `get_discount_type:"percentage"`, `get_discount_value:50.0` |
| Q6 | Open `SEED_V3B_BOGO` (pre-existing) | Drawer opens in BOGO mode, all fields populated correctly |
| Q7 | Open `SEED_V3B_BXGY_PCT` (pre-existing) | Drawer opens in BXGY mode, get picker visible, value `50` shown |
| Q8 | Toggle benefit to Free in edit → save | `get_discount_value` becomes `null` server-side |
| Q9 | Bypass HTML5: send `buy_quantity=0` → save | Backend HTTP 422; toast surfaces error |
| Q10 | Create with `max_applications=2, allow_repeat=false, apply_to_highest_item=true` | All 3 fields round-trip via GET; cheapest auto-off |
| Q11 | Filter "BOGO / BXGY" → list shows newly-wired V3-B coupons | ✅ |
| Q12 | List row for V3-B coupon reads "Buy 1 Get 1 Free" / "Buy 2 Get 1 50% off" (not "Rs.0 off") | ✅ |
| Q13 | Bonus: list row for V3-C coupon reads "Every 3rd Free" | ✅ (free polish via §5.9) |
| Q14 | Toggle V3-B coupon active/inactive | 200 OK both directions |
| Q15 | Delete V3-B coupon | 200 OK; row disappears |

**Regression sweep** (must remain green):
- Q-Reg-1: Create V1 plain flat → no V3-B contamination in saved doc
- Q-Reg-2: Edit existing V1 + V2 + V3-A coupons → drawer opens in correct mode
- Q-Reg-3: V3-A "Happy Hour" tile still works
- Q-Reg-4: Filter "Happy Hour" still works

If any of Q1-Q5, Q6-Q7 (edit rehydration), or Q-Reg-* fail → roll back the patch (it's contained to one file + 1-line in `ItemSelector`).

---

## 9. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Sending `offer_type="bxgy"` will 422 from backend | **Encoded explicitly in §5.4**: `form.same_item_required ? "bogo" : "bxg"`. No magic string `"bxgy"` appears anywhere in this plan. |
| R2 | Pre-existing V3-A wiring `offer_type="time_window"` regression | Already corrected in V3-A shipped wiring — no change in this plan. |
| R3 | A coupon with `offer_type="bogo"` but `same_item_required=false` exists (theoretically valid backend-wise) | `resolveTypeFromCoupon` returns `"bogo"` either way; UI opens in BXGY mode because the toggle keys off `same_item_required`, not `offer_type`. Self-consistent. |
| R4 | `same_item_required=null` (legacy) opens as BOGO mode | §5.6 rehydration: `same_item_required: coupon.same_item_required !== false` → null/undefined treated as true (BOGO). Matches user intent for legacy data. |
| R5 | User flips mode and stale `get_food_ids` remains | Wire the mode toggle to clear `get_food_ids=[]` when switching to BOGO. §5.7 sub-section "Mode toggle". |
| R6 | User toggles benefit to "Free" but `get_discount_value` stays populated | Wire the benefit toggle to clear `get_discount_value=""` when switching to Free. §5.7 "Get Benefit" sub-section. |
| R7 | `apply_to_cheapest_item` + `apply_to_highest_item` both true → backend behaviour ambiguous (probably cheapest wins) | Mutual-exclusion via `onChange` (lift preview pattern lines 397-398). |
| R8 | `pos_instruction` is shown for V3-B BUT existing V2 form also exposes it → not a conflict, just shared field | Confirmed safe — V2 + V3-B both read/write same key. |
| R9 | 5 pre-existing `SEED_V3B_*` coupons currently open in V1 form (broken) | This wiring fixes that — verified in Q6/Q7. |
| R10 | `ItemSelector` is used in 3 places (V2 item, V2 category — wait, that's `CategorySelector`, separate; V3-B buy, V3-B get) — adding `label` prop is non-breaking | Default `label="Eligible Items"` preserves existing UX. |
| R11 | `discount_value: 0` saved on V3-B coupons makes the V1 list label "Rs.0 off" | §5.9 list row override. Polish, low risk. |
| R12 | The shared `apply_to_*` / `pos_instruction` fields in `EMPTY_FORM` may overlap with V2 form — could lead to bleeding across types | They're inside `EMPTY_FORM` already (V2 inheritance). The form section guarded by `selectedType` decides what's rendered. Backend stores all fields regardless; values from a previous V2 edit don't leak because `setForm({...EMPTY_FORM})` resets on `openCreate`. |

---

## 10. Effort Estimate

| Step | Estimated effort |
|---|---|
| Edits #1-#6 (tile / EMPTY_FORM / resolver / rehydration / type select / submit) | ~25 min |
| Edit #7 (form section ~80 LOC) | ~35 min |
| Edit #8 (`ItemSelector` label prop, 1-line) | ~2 min |
| Edits #9-#10 (list row label override + ordinal helper) | ~10 min |
| Manual QA Q1-Q15 + regression sweep | ~25 min |
| Implementation + QA reports + index update | ~15 min |
| **Total** | **~1.8 hours** |

A small upside over the discovery estimate (~2h) due to the existing field overlap with V2 (`apply_to_*` / `pos_instruction`) and the fact that the preview is near-final.

---

## 11. Out of Scope (deferred)

- **Category-scoped buy/get pickers** (`buy_category_ids` / `buy_category_names` / `get_category_ids` / `get_category_names`) — defer to V3-B2 per OQ-V3B-UI-2.
- **`OfferSummary` plain-English panel inside the form** (preview line 403) — defer to V3-B2 polish.
- **POS contract / endpoint changes** — none needed; V3-B already validates via existing `/api/pos/coupons/validate` with `items[]`.
- **DB migration / new indexes** — none needed; all V3-B fields existed pre-implementation.
- **V3-C Every-Nth UI** — next sprint (V3-C UI wiring); §5.9 polish gives V3-C a clean list label as a side benefit.
- **Removing `/coupons-v3-preview` route** — defer until V3-A + V3-B + V3-C are ALL wired.
- **Any backend change** — none; backend at 49/49 V3-B QA + 211/211 combined.
- **Updating shared `apply_to_*` / `pos_instruction` UX** — kept identical to V2 to avoid regression.

---

## 12. Acceptance Criteria

The wiring step is considered done when ALL of these are true:

1. The "BOGO / BXGY" tile in `/coupons` is no longer marked **Soon** and is clickable.
2. Selecting the tile reveals a form with: code, title, BOGO/BXGY mode toggle, buy/get quantity, same-item switch (BXGY mode only), buy item picker, get item picker (BXGY + !same_item), benefit type (Free/%/Flat), benefit value (when not Free), validity/limits/channels, advanced section (max_applications, allow_repeat, cheapest/highest, pos_instruction).
3. Submitting BOGO creates a coupon whose `GET /api/coupons/{id}` returns:
   - `offer_type: "bogo"`
   - `same_item_required: true`
   - `buy_quantity: int`, `get_quantity: int`
   - `buy_food_ids: [...]`, `get_food_ids: null`
   - `get_discount_type: "free"` / `"percentage"` / `"flat"`
   - `discount_scope: "order"`
4. Submitting BXGY creates a coupon with `offer_type: "bxg"`, `same_item_required: false`, separate `buy_food_ids` and `get_food_ids`.
5. Editing the 5 pre-existing `SEED_V3B_*` coupons re-populates all V3-B fields in the correct mode.
6. List filter "BOGO / BXGY" shows all V3-B coupons (new + seeds).
7. List row label reads "Buy X Get Y …" for V3-B (and "Every Nth …" for V3-C as a bonus).
8. All existing V1+V2+V3-A flows still work (regression Q-Reg-1 … Q-Reg-4).
9. No backend, DB, env, dependency, or supervisor change.
10. ESLint clean. No new TypeScript/PropType warnings.

---

## 13. Recommended Next Agent

**Frontend Wiring Agent — V3-B (single file: `CouponsPage.jsx` + 1-line in `ItemSelector`).**

Brief for that agent:
- Apply the 10 edits in §6 exactly. Use `mcp_search_replace` (no full-file rewrite — file is 710 lines and stable).
- **CRITICAL:** Send `offer_type = "bxg"` for BXGY mode (NOT `"bxgy"`). Confirm by grep'ing the patched file for `"bxgy"` — must return zero hits.
- Run Q1-Q15 per §8 + regression sweep. Capture results in `implementation/CR_001C_C_COUPON_V3B_ADMIN_UI_IMPLEMENTATION_REPORT.md` + `qa/CR_001C_C_COUPON_V3B_ADMIN_UI_QA_REPORT.md` (parity with V3-A reports).
- Update `planning/CR_001_INDEX.md` row to `cr001c_coupon_v3b_admin_ui_implementation_qa_passed`.
- Update `/app/memory/PRD.md` "What's Been Implemented" with a new line.
- **Do not** touch V3-C tile, the preview route, the backend, the DB, `/app/memory/final/`, or any other file.

---

## 14. Final Status

```
cr001c_coupon_v3b_ui_wiring_plan_ready_for_implementation
```

- Discovery: complete (`discovery/CR_001C_C_COUPON_V3B_UI_WIRING_GAP_DISCOVERY.md`).
- Field mapping: complete (§3, §4, §5).
- Plan: 10 self-contained edits in `CouponsPage.jsx` + 1-line in `ItemSelector` (§6).
- Effort: ~1.8 hours including QA + reports.
- Critical corrections encoded: `offer_type` is `"bogo"` / `"bxg"` (NEVER `"bxgy"`).
- No backend / DB / env / dependency / supervisor change.
- Backend gate: ✅ frozen (Addendum D, 2026-02).
- UI micro-gate: 3 micro-Qs with safe defaults — non-blocking.
- Ready for the Frontend Wiring Agent to execute.
