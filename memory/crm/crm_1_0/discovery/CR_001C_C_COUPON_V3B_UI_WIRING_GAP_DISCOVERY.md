# CR-001C-C V3-B BOGO / BXGY — UI Wiring Discovery & Gap Analysis

**Date:** 2026-05-25
**Phase:** V3-B BOGO / Buy-X-Get-Y — production UI wiring
**Mode:** Discovery + gap analysis only — **no code, no DB, no env, no deploy**. Planning sibling doc will follow once gaps are approved.
**Prerequisite status:**
- V3-B backend: ✅ QA 49/49 PASS (`cr001c_coupon_v3b_bogo_bxgy_implementation_qa_passed_in_preview`)
- V3-A UI: ✅ Live at `/coupons` (`cr001c_coupon_v3a_admin_ui_implementation_qa_passed`, 12/12 QA)
- Owner-approved preview at `/coupons-v3-preview` (V3-B form section lines 333–405)

---

## 1. Document Inventory — What I Read

### Docs from your list (11 — all valid)
1. `implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md`
2. `implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md`
3. `implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md`
4. **`implementation/CR_001C_C_COUPON_V3B_BOGO_BXGY_IMPLEMENTATION_REPORT.md`** ← critical
5. `implementation/CR_001C_C_COUPON_V3C_EVERY_NTH_IMPLEMENTATION_REPORT.md`
6. `qa/CR_001C_C_COUPON_V3C_EVERY_NTH_QA_REPORT.md`
7. `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md`
8. `discovery/CR_001C_C_COUPON_ADMIN_UI_WHAT_EXISTS_AND_GAP_REPORT.md`
9. `planning/CR_001C_C_COUPON_V3A_UI_WIRING_PLAN.md`
10. `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md` ⚠️ **contains 2 BUGS for V3-B — see §3**
11. `planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md`

### Additional docs I also referenced (4 — not in your list but newer/relevant)
12. **`planning/CR_001C_C_COUPON_V3B_BOGO_BXGY_PLANNING_AND_OWNER_GATE.md`** — Frozen owner decisions Q1–Q12 (Addendum D). Essential.
13. **`qa/CR_001C_C_COUPON_V3B_BOGO_BXGY_QA_REPORT.md`** — V3-B backend QA 49/49 evidence.
14. **`implementation/CR_001C_C_COUPON_V3A_ADMIN_UI_IMPLEMENTATION_REPORT.md`** — Just-shipped V3-A precedent (pattern).
15. **`handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS.md`** — Latest state.

### Source-of-truth code files inspected
- `backend/models/schemas.py` lines 590–720 (V3-B Pydantic + validators)
- `backend/core/coupon.py` (V3-B engine — read-only audit only)
- `frontend/src/pages/CouponsPage.jsx` (post-V3-A, 710 lines)
- `frontend/src/pages/CouponV3Preview.jsx` lines 333–405 (approved V3-B preview)

---

## 2. Critical Findings Up Front

### 🔴 Finding F1 — Two BUGS in the prior implementation guide

`handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md` (your doc #10) contains **two wrong values** for V3-B. If implemented as-written, **every BXGY save would fail with HTTP 422**.

| Line | Bug | Truth (verified against `schemas.py:48-65`) |
|---|---|---|
| 100 | `c.offer_type === "bxgy"` (edit-mode detection) | Backend stores `"bxg"`, not `"bxgy"`. Allowed enum: `simple` / `bogo` / `bxg` / `buy_x_get_y` / `nth_item` / `every_nth` / `every_nth_item` / `free_item` / `combo`. The validator **normalises** `"buy_x_get_y"` to `"bxg"`. |
| 136 | `payload.offer_type = bogoMode; // "bogo" or "bxgy"` | Must send `"bogo"` or `"bxg"`. Sending `"bxgy"` → **HTTP 422**. |

**Same class of bug as V3-A** (the guide had `offer_type="time_window"` which is also rejected). The V3-A wiring plan already corrected its V3-A version; nothing carried over to V3-B. We will repeat the correction in the V3-B planning doc.

### 🔴 Finding F2 — The V3 UI Guide says `offer_type: "every_nth"` for V3-C — also unverified
While V3-C is out of scope for this sprint, the seed evidence shows backend stores `offer_type: "nth_item"` (canonical). Flag for the next sprint. The validator accepts `"every_nth"` AND `"nth_item"` per the allowed enum — but the **stored canonical value** needs verification before V3-C wiring.

### ✅ Finding F3 — V3-B backend is fully ready
QA 49/49 PASS. All 20 V3-B fields exist on `Coupon` / `CouponCreate` / `CouponUpdate` with optional defaults. Validators cover `get_discount_type` enum, positive-int constraints, and offer_type enum. No backend touch required.

### ✅ Finding F4 — Owner decisions are frozen
All 12 V3-B owner questions answered with recommended defaults on 2026-02 (`planning/CR_001C_C_COUPON_V3B_BOGO_BXGY_PLANNING_AND_OWNER_GATE.md` Addendum D). No new owner gate required for the UI; only 2 UI micro-decisions remain (§7).

### ⚠️ Finding F5 — Existing seed coupons will need re-render verification
We already seeded 5 `SEED_V3B_*` coupons via API on 2026-05-25. Their edit-mode rehydration is currently broken (they all open into the V1 order form because `resolveTypeFromCoupon` has no V3-B branch). This is the first thing the wiring fix unblocks.

---

## 3. Backend Field Inventory (Source of Truth)

From `backend/models/schemas.py:598-615` (Coupon model) + `679-705` (CouponUpdate):

### 3.1 Required when offer_type ∈ {bogo, bxg}
| Field | Type | Default | Validator | Notes |
|---|---|---|---|---|
| `offer_type` | `str` | `"simple"` | `_v3a_validate_offer_type` | Must be `"bogo"` or `"bxg"` for V3-B. `"buy_x_get_y"` normalised → `"bxg"`. |
| `buy_quantity` | `int` | `None` | `_v3b_validate_pos_int_ge_one` | Required ≥1. |
| `get_quantity` | `int` | `None` | `_v3b_validate_pos_int_ge_one` | Required ≥1. |
| `get_discount_type` | `str` | `None` | `_v3b_validate_get_discount_type` | Must be `"free"` / `"percentage"` / `"flat"`. |

### 3.2 Conditionally required
| Field | When required |
|---|---|
| `get_discount_value` | when `get_discount_type ∈ {percentage, flat}` |
| `buy_food_ids` (or `buy_item_ids` / `buy_category_ids` / `buy_category_names`) | at least one buy list non-empty |
| `get_food_ids` (or one of the get-* lists) | when `same_item_required=False`; defaults to buy lists when `same_item_required=True` |

### 3.3 Optional (advanced)
| Field | Type | Default | Notes |
|---|---|---|---|
| `same_item_required` | `bool?` | `None` | Drives "BOGO same-item" vs "BXGY different-item" semantics. |
| `max_applications` | `int?` | `None` | Cap. Validator: ≥1 if set. |
| `allow_repeat` | `bool?` | `True` | Default true. |
| `apply_to_cheapest_item` | `bool` | `False` | V2 inherited. |
| `apply_to_highest_item` | `bool` | `False` | V2 inherited. |
| `pos_instruction` | `str?` | `None` | Cashier hint, surfaced only on failure response per Q11=B. |
| `requires_get_item_in_cart` | `bool?` | `True` | **Locked true** per Q2=A. **Do not expose in UI** (always send true). |

### 3.4 Buy / get list fields (all `List[str]?`, all optional, all additive)
| Field | Used for |
|---|---|
| `buy_food_ids` | Item-level matching (canonical) |
| `buy_item_ids` | V2 alias path |
| `buy_category_ids` | Category-scoped BOGO/BXGY |
| `buy_category_names` | Category name fallback |
| `get_food_ids` | Item-level get matching |
| `get_item_ids` | V2 alias path |
| `get_category_ids` | Category-scoped get |
| `get_category_names` | Category name fallback |

For v1 V3-B UI, only `buy_food_ids` and `get_food_ids` will be exposed (food-only). Category-scoped BOGO/BXGY is deferred to V3-B2 (see §11).

---

## 4. Current State of `CouponsPage.jsx` (Post-V3-A, 710 lines)

| What exists | Line(s) | V3-B reusable? |
|---|---|---|
| Drawer (`Sheet`) | 506+ | ✅ Same drawer hosts V3-B |
| 7-tile type selector — `"bogo"` tile shown as **Soon** (`enabled: false`) | 38-46 (after V3-A wiring) | ⚠️ Flip enabled + add scope/dtype/color |
| `EMPTY_FORM` shape (V1+V2+V3-A fields) | 56-72 | ⚠️ Extend with ~13 V3-B fields |
| `resolveTypeFromCoupon(c)` | 73-83 | ⚠️ Add V3-B branch BEFORE V1/V2 fallback |
| `resolveCouponBucket(c)` (just added for filter) | 28-32 | ✅ Already handles `bogo`/`bxg` for filter |
| `openCreate` / `openEdit` | 221-268 | ⚠️ `openEdit` needs V3-B rehydration; both call `fetchMenu()` already |
| `handleTypeSelect` | 270-275 | ⚠️ Needs `bogo` branch to set `offer_type` + `same_item_required` default + buy/get qty defaults |
| `handleSubmit` payload builder | 277-326 | ⚠️ Needs V3-B branch (~25 LOC). Must send `"bxg"` not `"bxgy"` |
| `fetchMenu()` already called by `openCreate` + `openEdit` | 228, 267 | ✅ Menu data ready for buy & get pickers |
| `ItemSelector` component (single list, with `loading` prop) | imported from existing | ✅ Reuse twice (one for buy, one for get) |
| `Switch`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`, `Settings2`, `ChevronDown/Right` imports | 19-27 | ✅ All already imported |
| V2 selector block + V3-A time-window section | 538-585 | Insert V3-B section after V3-A and before Validity |
| `SCOPE_COLORS["bogo"]` + `SCOPE_LABELS["bogo"]` (just added) | 30-37 | ✅ Filter + badge already work for V3-B |
| List row "Rs.X off" rendering for V3-B (currently shows "Rs.0 off") | ~340 (need verification) | ⚠️ Polish: show "Buy X Get Y Free" instead of "Rs.0 off" — see §6.4 |

---

## 5. Reusable Elements from `CouponV3Preview.jsx` (lines 333-405)

| Element | Where in preview | What to lift |
|---|---|---|
| 2-mode toggle (BOGO vs BXGY) | Lines 346-353 | Lift markup; replace `bogoMode` local state with derived from form |
| Buy/Get quantity inputs | Lines 358-361 | Lift markup; use `form.buy_quantity` / `form.get_quantity` |
| "Same Item Required" `<Switch>` | Lines 362-365 | Lift; bind to `form.same_item_required` |
| Buy item picker | Line 366 | Replace `ItemPicker` + `MOCK_ITEMS` with `<ItemSelector items={menuItems} selected={form.buy_food_ids} onToggle={toggleBuyFoodId} loading={menuLoading} />` |
| Get item picker (conditional on `!sameItem`) | Line 367 | Same pattern with `form.get_food_ids` |
| 3-mode benefit toggle (Free / % Off / Rs. Off) | Lines 372-379 | Lift markup; bind `form.get_discount_type`; pink-600 active style matches V3-B badge color |
| Benefit value input (conditional when not `free`) | Lines 380-384 | Lift; bind `form.get_discount_value` |
| Advanced Collapsible | Lines 387-402 | Lift wholesale; existing `advancedOpen` state already in CouponsPage |
| Advanced fields: max_applications, allow_repeat, cheapest, highest, pos_instruction | Inside collapsible | All map to existing or new form fields |
| `OfferSummary` plain-English panel | Line 403 | **Out of scope for v1** — defer to V3-B2 polish (parity with V3-A v1) |

---

## 6. Gap Analysis — UI ↔ Backend Mapping

### 6.1 Tile config gap
| Current | Required |
|---|---|
| `{ id: "bogo", label: "BOGO / BXGY", icon: ShoppingBag, phase: "V3-B", enabled: false }` | `{ ..., enabled: true, scope: "order", dtype: null, color: "from-pink-500 to-pink-600" }` |

### 6.2 `EMPTY_FORM` gap (13 fields to add)
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
same_item_required: true,
// (apply_to_cheapest_item, apply_to_highest_item, pos_instruction already exist from V2)
```

### 6.3 `resolveTypeFromCoupon` gap
Add V3-B branch **before** V1/V2 fallback (so a V3-B coupon never gets misrouted to V1 form):
```js
if (c.offer_type === "bogo" || c.offer_type === "bxg") return "bogo";
```
Position: **after** the V3-A time-window check, **before** the scope-based V1/V2 routing. Order matters because a V3-B coupon may also carry V2 fields (`eligible_category_ids` is shared with V2 schemas).

### 6.4 `handleTypeSelect` gap (mode default semantics)
When user clicks the BOGO tile:
- Default to BOGO mode (Q1=D scope is full, but UX default is BOGO since that's the most common variant)
- Set `same_item_required = true`, `buy_quantity = "1"`, `get_quantity = "1"`, `get_discount_type = "free"`
- `discount_scope = "order"` (V3-B coupons always store `discount_scope: "order"` per seed evidence)

### 6.5 `handleSubmit` payload gap (~25 LOC)
```js
if (selectedType === "bogo") {
  payload.offer_type = form.same_item_required ? "bogo" : "bxg";  // ← CRITICAL: "bxg" not "bxgy"
  payload.discount_scope = "order";
  payload.buy_quantity = parseInt(form.buy_quantity) || 1;
  payload.get_quantity = parseInt(form.get_quantity) || 1;
  payload.buy_food_ids = form.buy_food_ids.length > 0 ? form.buy_food_ids : null;
  payload.get_food_ids = (!form.same_item_required && form.get_food_ids.length > 0) ? form.get_food_ids : null;
  payload.same_item_required = form.same_item_required;
  payload.get_discount_type = form.get_discount_type;
  payload.get_discount_value = (form.get_discount_type !== "free" && form.get_discount_value)
    ? parseFloat(form.get_discount_value) : null;
  payload.max_applications = form.max_applications ? parseInt(form.max_applications) : null;
  payload.allow_repeat = form.allow_repeat;
  payload.apply_to_cheapest_item = form.apply_to_cheapest_item;
  payload.apply_to_highest_item = form.apply_to_highest_item;
  // requires_get_item_in_cart locked true (Q2=A) — backend default handles it; omit from payload
  // discount_value / discount_type are not meaningful for V3-B — set neutral defaults
  payload.discount_type = "flat";
  payload.discount_value = 0;
}
```

### 6.6 `openEdit` rehydration gap (~9 lines)
```js
buy_quantity: coupon.buy_quantity != null ? String(coupon.buy_quantity) : "1",
get_quantity: coupon.get_quantity != null ? String(coupon.get_quantity) : "1",
buy_food_ids: coupon.buy_food_ids || [],
get_food_ids: coupon.get_food_ids || [],
get_discount_type: coupon.get_discount_type || "free",
get_discount_value: coupon.get_discount_value != null ? String(coupon.get_discount_value) : "",
max_applications: coupon.max_applications != null ? String(coupon.max_applications) : "",
allow_repeat: coupon.allow_repeat !== false,
same_item_required: coupon.same_item_required !== false,  // default true
```

### 6.7 Form section gap (~80 LOC inserted between V3-A and Validity)
Skeleton:
```jsx
{selectedType === "bogo" && (
  <>
    <Separator className="bg-gray-100" />
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Buy / Get Rules</p>
      <div className="grid grid-cols-2 gap-3">
        <Input type="number" min="1" value={form.buy_quantity} ... data-testid="buy-quantity" />
        <Input type="number" min="1" value={form.get_quantity} ... data-testid="get-quantity" />
      </div>
      <Switch checked={form.same_item_required} onCheckedChange={...} data-testid="same-item-switch" />
      <ItemSelector items={menuItems} selected={form.buy_food_ids} onToggle={toggleBuyFoodId}
                    loading={menuLoading} label="Buy Items" />
      {!form.same_item_required && (
        <ItemSelector items={menuItems} selected={form.get_food_ids} onToggle={toggleGetFoodId}
                      loading={menuLoading} label="Get Items" />
      )}
    </div>
    <Separator className="bg-gray-100" />
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Get Benefit</p>
      <div className="flex gap-2">
        {[{ id: "free", label: "Free" }, { id: "percentage", label: "% Off" }, { id: "flat", label: "Rs. Off" }].map(b => (
          <button key={b.id} type="button" data-testid={`benefit-${b.id}`} ...>
            {b.label}
          </button>
        ))}
      </div>
      {form.get_discount_type !== "free" && (
        <Input type="number" value={form.get_discount_value} ... data-testid="benefit-value" />
      )}
    </div>
    <Separator className="bg-gray-100" />
    {/* Advanced Settings — extend existing collapsible OR add a V3-B-specific one */}
  </>
)}
```

### 6.8 ItemSelector — needs a `label` prop OR 2 calls
The existing `ItemSelector` has its own internal label. Two options:
- **A.** Reuse `ItemSelector` twice as-is. Both lists will show "Eligible Items" — confusing.
- **B.** Add an optional `label` prop to `ItemSelector` (1-line change in the component). RECOMMENDED.
- **C.** Wrap each call in a labelled `<div>` and pass a different testid. Acceptable but less clean.

Recommended: **Option B** — 1-line non-breaking change to `ItemSelector` (default `label="Eligible Items"`).

### 6.9 List row rendering — "Buy X Get Y Free" instead of "Rs.0 off"
V3-B coupons store `discount_value: 0` because the discount comes from `get_*`. The current list row renders `"Rs.0 off"` which is meaningless. Fix in the same `filteredCoupons.map(coupon => ...)` block:
```js
const v3bLabel = (c) => {
  if (c.offer_type !== "bogo" && c.offer_type !== "bxg") return null;
  const get = c.get_discount_type === "free" ? "Free"
            : c.get_discount_type === "percentage" ? `${c.get_discount_value}% off`
            : `Rs.${c.get_discount_value} off`;
  return `Buy ${c.buy_quantity || 1} Get ${c.get_quantity || 1} ${get}`;
};
// Use v3bLabel(coupon) where currently shows "Rs.X off" for V3-B coupons
```

This is **polish, not blocker** — can be a separate edit at the end of the wiring.

### 6.10 `data-testid` coverage (required by guidelines)
| Element | testid |
|---|---|
| BOGO tile | `type-bogo` (already exists as part of type selector data-testid pattern) |
| Mode toggle BOGO | `bogo-mode-bogo` |
| Mode toggle BXGY | `bogo-mode-bxgy` |
| Buy quantity | `buy-quantity` |
| Get quantity | `get-quantity` |
| Same item switch | `same-item-switch` |
| Buy item picker container | `buy-items-selector` |
| Get item picker container | `get-items-selector` |
| Benefit type Free / % / Flat | `benefit-free` / `benefit-percentage` / `benefit-flat` |
| Benefit value input | `benefit-value` |
| Max applications | `max-applications` |
| Allow repeat switch | `allow-repeat-switch` |
| Apply to cheapest switch | `cheapest-switch` |
| Apply to highest switch | `highest-switch` |
| POS instruction | `pos-instruction` |

---

## 7. Owner Decisions Required for v1 UI

All 12 backend questions are frozen (`PLANNING_AND_OWNER_GATE` Addendum D). Only **3 UI-only micro-Qs** remain — all with safe recommended defaults so wiring can proceed if owner says just "go".

| Q | Decision | Recommended | If owner picks otherwise |
|---|---|---|---|
| OQ-V3B-UI-1 | Default mode when BOGO tile clicked | **BOGO** (same-item, simplest, most common) | BXGY → starts with 2 pickers visible |
| OQ-V3B-UI-2 | Category-scoped buy/get exposure in v1 UI? | **NO** (food_id only; defer category to V3-B2) | YES → +1 day work, +6 form fields |
| OQ-V3B-UI-3 | Replace "Rs.0 off" in list row with "Buy X Get Y Free"? | **YES** (small polish, immediate clarity) | NO → V3-B rows remain confusing |

No blocker. Proceed with defaults unless owner overrides.

---

## 8. Implementation Effort

| Step | Estimated effort |
|---|---|
| Tile flip + `EMPTY_FORM` extension | 5 min |
| `resolveTypeFromCoupon` + `openEdit` rehydration | 10 min |
| `handleTypeSelect` BOGO branch | 5 min |
| `handleSubmit` BOGO payload branch (~25 LOC) | 15 min |
| Form section render (~80 LOC) | 35 min |
| `ItemSelector` `label` prop (1-line) | 2 min |
| List row "Buy X Get Y" label (~10 LOC) | 8 min |
| `data-testid` coverage | 5 min |
| Manual QA (Q1-Q15 plan below) | 25 min |
| Implementation + QA reports | 15 min |
| **Total** | **~2 hours** (vs ~1.5 h for V3-A) |

V3-B is ~40% bigger than V3-A due to dual item picker + mode toggle + benefit type toggle, but ~half the code can be lifted verbatim from `CouponV3Preview.jsx`.

---

## 9. QA Plan (post-implementation)

15 tests against `https://crm-variable-mapping.preview.emergentagent.com/coupons` with R689 JWT. Backend has 49/49 V3-B QA already — these are **UI-only** smoke tests.

| # | Test | Expected |
|---|---|---|
| Q1 | BOGO tile is clickable (no "Soon") | ✅ |
| Q2 | Click BOGO tile → form opens with BOGO mode selected, same_item=true, buy=1, get=1, benefit=Free | ✅ |
| Q3 | Create BOGO coupon `UIQA_BOGO`: Buy 1 Get 1 Free on KUNAFA_CLASSIC | HTTP 201, `offer_type=bogo`, `same_item_required=true` |
| Q4 | Switch to BXGY mode → second item picker appears, `same_item` toggle off | ✅ |
| Q5 | Create BXGY: Buy 2 KUNAFA Get 1 SHAKE 50% off | `offer_type=bxg`, `get_discount_type=percentage`, `get_discount_value=50` |
| Q6 | Edit existing `SEED_V3B_BOGO` from earlier seed | Drawer opens to BOGO form with all fields populated, BOGO mode pre-selected |
| Q7 | Edit existing `SEED_V3B_BXGY_PCT` | BXGY mode pre-selected, get items list visible, 50% value populated |
| Q8 | Toggle benefit to Free in edit → save | `get_discount_value` cleared on backend |
| Q9 | Invalid: `buy_quantity=0` (bypass HTML5 via DevTools) | Backend 422 → toast shown |
| Q10 | Set max_applications=2, allow_repeat=false | Both fields persist in PUT/GET roundtrip |
| Q11 | Filter dropdown "BOGO / BXGY" → list shows only V3-B coupons including the newly-wired ones | ✅ |
| Q12 | List row for V3-B coupon shows "Buy 1 Get 1 Free" (not "Rs.0 off") | ✅ |
| Q13 | Toggle V3-B coupon active/inactive | 200 OK |
| Q14 | Delete V3-B coupon | 200 OK; row disappears |
| Q15 | Regression: V1, V2, V3-A flows still work | ✅ (load each, edit, save without changes) |

---

## 10. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Sending `offer_type="bxgy"` from UI will 422 from backend | **F1 in §2.** Wiring sends `"bxg"`. Explicit guard in `handleSubmit`. |
| R2 | Sending `payload.offer_type` for V3-A as `"time_window"` regression | Already corrected in V3-A wiring; V3-B sets `bogo`/`bxg` only. |
| R3 | Same-item BOGO with no buy_food_ids → ambiguous "every cart item" semantics | Add UI validation: require ≥1 buy item before save. Backend would emit `NO_ELIGIBLE_BUY_ITEMS_IN_CART` on validate but admin save itself succeeds. Treat as UI nicety. |
| R4 | Switching BOGO ↔ BXGY mid-edit can leave stale `get_food_ids` | Clear `get_food_ids` to `[]` when `same_item_required` flips true. |
| R5 | `get_discount_value` left populated when switching benefit to "Free" | Clear `get_discount_value` to `""` on switch. |
| R6 | The 5 SEED_V3B_* coupons already in DB will open in V1 form before this fix | Confirmed — that's exactly the gap this wiring fixes. After fix, they rehydrate correctly. |
| R7 | Backend's `same_item_required` default is `None`, not `False` | UI sends explicit `true`/`false`, no ambiguity. |
| R8 | `apply_to_cheapest_item` and `apply_to_highest_item` are mutually-exclusive in V2 UX | Wire same toggle-pair logic from preview (lines 397-398): turning one on turns the other off. |
| R9 | Backend `requires_get_item_in_cart` locked true per Q2=A — NEVER expose in UI | Document in code comment. Omit from payload (backend default handles it). |

---

## 11. Out of Scope (deferred)

| Item | Defer to |
|---|---|
| Category-scoped buy/get pickers (`buy_category_ids`, `get_category_ids` etc.) | V3-B2 (per OQ-V3B-UI-2 recommended) |
| `OfferSummary` plain-English panel inside the V3-B form | V3-B2 (parity with V3-A — still deferred for V3-A too) |
| Re-arranging the BOGO/BXGY mode UI to look more polished (the current preview is functional but tile-shaped) | V3-B2 polish |
| Backend changes — none | n/a (49/49 QA already) |
| DB migration | n/a |
| POS contract changes | n/a (POS receives V3-B via existing `coupon_code` field in `/validate` and `/orders` — no new top-level fields) |
| V3-C Every-Nth UI wiring | Next sprint after V3-B |
| Removing `/coupons-v3-preview` route | When V3-A + V3-B + V3-C are all wired |

---

## 12. Acceptance Criteria (for the next agent that wires)

1. "BOGO / BXGY" tile in `/coupons` is no longer marked **Soon** and is clickable.
2. Selecting the tile shows: code, title, BOGO/BXGY mode toggle, buy/get quantity, same-item switch, buy item picker, get item picker (when !same_item), benefit type (Free/%/Flat), benefit value (when not Free), validity/limits/channels sections, advanced section (max_applications, allow_repeat, cheapest/highest, pos_instruction).
3. Save BOGO → `GET /api/coupons/{id}` returns `offer_type:"bogo"`, `same_item_required:true`, `buy_quantity:int`, `get_quantity:int`, `buy_food_ids:[...]`, `get_discount_type:"free"`.
4. Save BXGY → `offer_type:"bxg"`, `same_item_required:false`, separate `get_food_ids`.
5. Edit any of the 5 pre-existing `SEED_V3B_*` coupons → form populates correctly in matching mode.
6. List filter "BOGO / BXGY" shows all V3-B coupons.
7. List row label reads "Buy X Get Y …" instead of "Rs.0 off" for V3-B coupons (if OQ-V3B-UI-3 = YES).
8. All existing V1+V2+V3-A flows still work (regression Q15).
9. No backend, DB, env, dependency, or supervisor change.

---

## 13. Recommended Next Agent

**Frontend Wiring Agent — V3-B**
Brief:
- Apply the 8 edits scoped in §6 exactly. Single file: `frontend/src/pages/CouponsPage.jsx`.
- One non-breaking 1-line change to `ItemSelector` (add optional `label` prop).
- Use `mcp_search_replace` for all (no full-file rewrite).
- **CRITICAL:** Send `offer_type = "bxg"` (NOT `"bxgy"`) for BXGY mode.
- Run Q1-Q15 per §9. Capture results in `implementation/CR_001C_C_COUPON_V3B_ADMIN_UI_IMPLEMENTATION_REPORT.md` + `qa/CR_001C_C_COUPON_V3B_ADMIN_UI_QA_REPORT.md`.
- Update `planning/CR_001_INDEX.md` row to `cr001c_coupon_v3b_admin_ui_implementation_qa_passed`.
- **Do not** touch V3-C tile, the preview route, the backend, or any other file.

---

## 14. Final Status

```
cr001c_coupon_v3b_ui_wiring_gap_discovery_complete
```

- Discovery: complete — 15 docs read, 4 source files inspected.
- 2 critical bugs found in the prior implementation guide (Finding F1) — **corrections applied in this discovery**.
- Backend ready (49/49 QA) — no backend touch needed.
- Owner gate already frozen on all 12 V3-B questions (Addendum D, 2026-02).
- 3 UI-only micro-Qs remain with safe recommended defaults.
- Effort: ~2 hours total.
- Next deliverable: a sibling **`CR_001C_C_COUPON_V3B_UI_WIRING_PLAN.md`** (style parity with V3-A plan) once you approve the gaps + defaults.

---

## Appendix A — Diff vs V3-A Wiring (for context)

| Aspect | V3-A | V3-B |
|---|---|---|
| Backend fields surfaced in UI | 4 (`valid_days`, `start_time`, `end_time`, `timezone`) | **~13** (mode-driven; buy/get qty + lists + benefit + caps + flags) |
| New form section LOC | ~40 | ~80 |
| Mode toggles inside the section | 0 | 2 (BOGO/BXGY + benefit Free/%/Flat) |
| Item pickers | 0 | 2 (buy + get) |
| Advanced collapsible additions | 0 | 5 fields (max_applications, allow_repeat, cheapest, highest, pos_instruction) |
| New constants | 2 (`DAYS`, `TIMEZONES`) | 0 (mode/benefit lists inlined) |
| Critical guide-bug correction | `offer_type: "time_window"` → `"simple"` | `offer_type: "bxgy"` → `"bxg"` |
| QA tests | 12 | 15 |
| Estimated effort | 1.5 h | 2 h |
| Owner gate | 2 micro-Qs | 3 micro-Qs |
