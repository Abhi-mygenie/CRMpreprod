# CR-001C-C Coupon Admin UI — What Exists and Gap Report

**Date:** 2026-05-25
**Agent:** CRM Coupon Admin UI Discovery Agent
**Branch:** `25-may` (Abhi-mygenie/CRMpreprod.git)
**Mode:** READ-ONLY — zero code changes, zero DB changes

---

## 1. Executive Summary

The CRM has a single-file coupon UI (`CouponsPage.jsx`, 536 lines) that supports **V1 Flat/Percentage coupons only** at a basic level. It can list, create, edit, and delete coupons using the 9 original admin CRUD endpoints in `routers/coupons.py`.

**The current UI is completely unaware of V2 through V3-C backend capabilities.** It does not expose any field added after the original V1 base: no `title`, no `coupon_type`, no `stackable_with_loyalty`, no item/category selectors, no time-window, no BOGO, no Every-Nth.

Additionally, the **admin create endpoint** (`POST /api/coupons`) in `coupons.py` has a **field-persistence gap**: it explicitly maps only the original 12 fields in the `coupon_doc` dict, silently dropping V1+ additions (title, coupon_type, stackable_with_loyalty) and all V2/V3 fields on create. The update endpoint (`PUT /api/coupons/{id}`) uses `model_dump()` and DOES correctly persist all fields.

**Verdict: Option B — Partially reuse existing list/API layer but build new create/edit flow.**

---

## 2. Inputs Reviewed

### Frontend code (read-only)
| File | Lines | Purpose |
|---|---|---|
| `frontend/src/pages/CouponsPage.jsx` | 536 | Only coupon UI — list + create/edit modal |
| `frontend/src/App.js` | 2 refs | Route: `/coupons` → `CouponsPage` |
| `frontend/src/components/ResponsiveLayout.jsx` | 1 ref | Sidebar nav: "Coupons" with Gift icon |
| `frontend/src/pages/DashboardPage.jsx` | 5 refs | Coupon stats cards (behind `coupon_enabled` flag) |
| `frontend/src/pages/CustomerDetailPage.jsx` | 10 refs | Customer coupon usage + active coupons display |

### Backend code (read-only)
| File | Lines | Purpose |
|---|---|---|
| `backend/routers/coupons.py` | 238 | 9 admin CRUD endpoints (untouched by V1-V3C) |
| `backend/models/schemas.py` | L563-850 | `CouponCreate`, `CouponUpdate`, `Coupon`, `CouponUsage` — full V1-V3C fields |
| `backend/core/coupon.py` | ~1800+ | Coupon engine (validate, list_available, record_usage) |
| `backend/routers/pos.py` | ~2834 | POS endpoints including coupon validate/commit |
| `backend/services/analytics_service.py` | ~varies | Coupon analytics aggregation |

### Documentation (read-only)
| Doc | Status |
|---|---|
| `CR_001_INDEX.md` | Read ✅ |
| `CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md` | Read ✅ |
| Implementation reports V1-V3C | Confirmed via INDEX statuses |

---

## 3. Existing Coupon UI Inventory

### Files found: **1 file only**

| # | File | Component | Purpose | Reusable? |
|---|---|---|---|---|
| 1 | `pages/CouponsPage.jsx` | `CouponsPage` | List + create/edit modal | Partially (list view reusable, form needs rebuild) |

No separate coupon services, hooks, types, constants, or sub-components exist.

### Current UI capabilities:

| Capability | Supported? |
|---|---|
| List coupons | ✅ |
| Create coupon | ✅ (V1 base fields only) |
| Edit coupon | ✅ (V1 base fields only) |
| Delete coupon | ✅ |
| Toggle active/inactive | ❌ (backend `POST /{id}/toggle` exists, UI not wired) |
| Coupon usage view | ❌ (backend `GET /{id}/usage` exists, UI not wired) |
| Validation preview | ❌ |
| Search/filter coupons | ❌ |

---

## 4. Existing UI API Usage

| Action | Endpoint called by UI | Backend endpoint exists? | Notes |
|---|---|---|---|
| List | `GET /api/coupons` | ✅ `coupons.py` L46 | Works |
| Create | `POST /api/coupons` | ✅ `coupons.py` L14 | **Gap: only persists 12 base fields** |
| Update | `PUT /api/coupons/{id}` | ✅ `coupons.py` L62 | Uses `model_dump()` — persists all fields |
| Delete | `DELETE /api/coupons/{id}` | ✅ `coupons.py` L85 | Works |
| Toggle | NOT CALLED | ✅ `POST /api/coupons/{id}/toggle` | Not wired in UI |
| Usage | NOT CALLED | ✅ `GET /api/coupons/{id}/usage` | Not wired in UI |
| Validate (admin) | NOT CALLED | ✅ `POST /api/coupons/validate` (query params, deprecated) | Old endpoint |
| Apply (admin) | NOT CALLED | ✅ `POST /api/coupons/apply` (deprecated) | Should not be used |
| POS Available | NOT CALLED | ✅ `GET /api/pos/coupons/available` | POS only |
| POS Validate | NOT CALLED | ✅ `POST /api/pos/coupons/validate` (JSON body, V2+) | POS only |

### Schema mismatch:

**YES.** The UI sends 12 fields on create. The backend `CouponCreate` schema accepts 50+ fields. The admin `create_coupon` route explicitly maps only 12 fields into `coupon_doc`, silently ignoring the rest. Even if the UI sent V2+ fields, they would not be persisted on create.

### Hardcoded values in UI:

| Item | Hardcoded value |
|---|---|
| `discount_type` options | `"percentage"`, `"fixed"` — only 2 types |
| `applicable_channels` | `["delivery", "takeaway", "dine_in"]` — hardcoded list |
| Form state init | 12 fields only |

---

## 5. Backend Capability Summary by Phase

| Phase | Backend | Admin CRUD | POS API | QA |
|---|---|---|---|---|
| V1 Flat/Pct | ✅ `core/coupon.py` | ✅ `coupons.py` (9 endpoints, but create is incomplete) | ✅ available/validate/orders | 45/45 |
| V2 Item/Category | ✅ | ✅ Schema accepts fields; update persists; **create drops them** | ✅ | 45/45 |
| V3-A Time-window | ✅ | ✅ Schema accepts fields; update persists; **create drops them** | ✅ | 31/31 |
| V3-B BOGO/BXGY | ✅ | ✅ Schema accepts fields; update persists; **create drops them** | ✅ | 49/49 |
| V3-C Every-Nth | ✅ | ✅ Schema accepts fields; update persists; **create drops them** | ✅ | 41/41 |

**Critical backend gap in admin create:** `coupons.py` `create_coupon` (line 23-41) builds `coupon_doc` with only 12 explicit fields. V1+ additions (`title`, `coupon_type`, `stackable_with_loyalty`) and all V2/V3 fields are NOT included. Fix is straightforward: replace explicit mapping with `coupon_data.model_dump()`.

---

## 6. Phase-by-Phase What Exists / What Does Not Exist Matrix

| # | Phase | Backend? | Admin API? | CRM UI? | UI fields complete? | UI can create? | UI can edit? | UI activate/deactivate? | UI preview/test? | Gaps | Recommendation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **V1 Flat** | ✅ | ✅ (create incomplete) | ✅ Partial | ❌ Missing: title, coupon_type, stackable_with_loyalty | ✅ Base only | ✅ Base only | ❌ | ❌ | 3 V1 fields missing; create route drops them | Add missing fields; fix create route |
| 2 | **V1 Percentage** | ✅ | ✅ (create incomplete) | ✅ Partial | ❌ Same as flat | ✅ Base only | ✅ Base only | ❌ | ❌ | Same as flat | Same |
| 3 | **V2 Item-level** | ✅ | ✅ (create drops fields) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | No item selector, no discount_scope, no eligible IDs | New form section needed |
| 4 | **V2 Category-level** | ✅ | ✅ (create drops fields) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | No category selector | New form section needed |
| 5 | **V3-A Time-window** | ✅ | ✅ (create drops fields) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | No time picker, day selector, timezone | New form section needed |
| 6 | **V3-B BOGO** | ✅ | ✅ (create drops fields) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | No BOGO rule builder | New advanced form section needed |
| 7 | **V3-B BXGY** | ✅ | ✅ (create drops fields) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | No BXGY rule builder | New advanced form section needed |
| 8 | **V3-C Every-Nth** | ✅ | ✅ (create drops fields) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | No every-Nth rule builder | New advanced form section needed |
| 9 | Free-item (future) | ❌ | ❌ | ❌ | N/A | N/A | N/A | N/A | N/A | Not implemented | Parked (V3-D) |
| 10 | Combo (future) | ❌ | ❌ | ❌ | N/A | N/A | N/A | N/A | N/A | Not implemented | Parked (V4) |

---

## 7. Field Coverage Matrix

| Backend Field | Phase | Current UI Supports? | Create? | Edit? | Notes |
|---|---|---|---|---|---|
| `code` | Base | ✅ | ✅ | ✅ | Auto-uppercased |
| `title` | V1 | ❌ | ❌ | ❌ | Not in UI; backend accepts; **create route drops it** |
| `description` | Base | ✅ | ✅ | ✅ | |
| `coupon_type` | V1 | ❌ | ❌ | ❌ | Not in UI; backend accepts; **create route drops it** |
| `discount_type` | Base | ✅ | ✅ | ✅ | Only "percentage"/"fixed" shown |
| `discount_value` | Base | ✅ | ✅ | ✅ | |
| `discount_scope` | V2 | ❌ | ❌ | ❌ | Not in UI |
| `min_order_value` | Base | ✅ | ✅ | ✅ | Labeled "Min Order Value" |
| `max_discount` | Base | ✅ | ✅ | ✅ | Conditional on percentage type |
| `start_date` | Base | ✅ | ✅ | ✅ | Date picker |
| `end_date` | Base | ✅ | ✅ | ✅ | Date picker |
| `is_active` | Base | ✅ Display | ❌ | ❌ | Shown as badge, but no toggle button |
| `usage_limit` | Base | ✅ | ✅ | ✅ | |
| `per_user_limit` | Base | ✅ | ✅ | ✅ | |
| `applicable_channels` | Base | ✅ | ✅ | ✅ | Hardcoded 3 channels |
| `specific_users` | Base | ✅ | ✅ | ✅ | Customer selector with checkbox list |
| `stackable_with_loyalty` | V1 | ❌ | ❌ | ❌ | Not in UI |
| `eligible_food_ids` | V2 | ❌ | ❌ | ❌ | |
| `eligible_item_ids` | V2 | ❌ | ❌ | ❌ | |
| `eligible_category_ids` | V2 | ❌ | ❌ | ❌ | |
| `eligible_category_names` | V2 | ❌ | ❌ | ❌ | |
| `excluded_item_ids` | V2 | ❌ | ❌ | ❌ | |
| `excluded_category_ids` | V2 | ❌ | ❌ | ❌ | |
| `min_item_qty` | V2 | ❌ | ❌ | ❌ | |
| `max_applicable_qty` | V2 | ❌ | ❌ | ❌ | |
| `apply_to_cheapest_item` | V2 | ❌ | ❌ | ❌ | |
| `apply_to_highest_item` | V2 | ❌ | ❌ | ❌ | |
| `offer_type` | V3-A | ❌ | ❌ | ❌ | |
| `valid_days` | V3-A | ❌ | ❌ | ❌ | |
| `start_time` | V3-A | ❌ | ❌ | ❌ | |
| `end_time` | V3-A | ❌ | ❌ | ❌ | |
| `timezone` | V3-A | ❌ | ❌ | ❌ | |
| `buy_quantity` | V3-B | ❌ | ❌ | ❌ | |
| `get_quantity` | V3-B | ❌ | ❌ | ❌ | |
| `buy_food_ids` | V3-B | ❌ | ❌ | ❌ | |
| `buy_item_ids` | V3-B | ❌ | ❌ | ❌ | |
| `buy_category_ids` | V3-B | ❌ | ❌ | ❌ | |
| `buy_category_names` | V3-B | ❌ | ❌ | ❌ | |
| `get_food_ids` | V3-B | ❌ | ❌ | ❌ | |
| `get_item_ids` | V3-B | ❌ | ❌ | ❌ | |
| `get_category_ids` | V3-B | ❌ | ❌ | ❌ | |
| `get_category_names` | V3-B | ❌ | ❌ | ❌ | |
| `get_discount_type` | V3-B | ❌ | ❌ | ❌ | |
| `get_discount_value` | V3-B | ❌ | ❌ | ❌ | |
| `max_applications` | V3-B/C | ❌ | ❌ | ❌ | |
| `allow_repeat` | V3-B/C | ❌ | ❌ | ❌ | |
| `same_item_required` | V3-B | ❌ | ❌ | ❌ | |
| `requires_get_item_in_cart` | V3-B | ❌ | ❌ | ❌ | |
| `pos_instruction` | V3-B/C | ❌ | ❌ | ❌ | |
| `nth_item_number` | V3-C | ❌ | ❌ | ❌ | |
| `nth_discount_type` | V3-C | ❌ | ❌ | ❌ | |
| `nth_discount_value` | V3-C | ❌ | ❌ | ❌ | |

**UI field coverage: 12 / 50+ backend fields = ~24%**

---

## 8. UX Gap Findings

| UX Feature | Status | Notes |
|---|---|---|
| Coupon list | ✅ Exists | Shows code, discount, dates, channels, usage count |
| Create coupon | ✅ Partial | Single modal dialog, V1 base fields only |
| Edit coupon | ✅ Partial | Reuses create modal |
| Delete coupon | ✅ | With confirm dialog |
| Deactivate coupon | ❌ | Backend toggle exists, not wired |
| Coupon type selector | ❌ | No selector for flat/item/category/BOGO/nth etc. |
| Dynamic form sections by type | ❌ | Single static form for all coupons |
| Item selector | ❌ | No item picker component |
| Category selector | ❌ | No category picker component |
| Date picker | ✅ | HTML date inputs |
| Time picker | ❌ | Needed for V3-A |
| Weekday selector | ❌ | Needed for V3-A |
| Usage limit fields | ✅ | usage_limit + per_user_limit |
| Loyalty stacking toggle | ❌ | Not exposed |
| BOGO/BXGY rule builder | ❌ | Not built |
| Every-Nth rule builder | ❌ | Not built |
| POS instruction field | ❌ | Not exposed |
| Preview/test coupon | ❌ | Not built |
| Validation error display | ✅ Partial | Toast-only, no inline field errors |
| Coming soon for future | ❌ | No placeholder for V3-D, V4 |
| Simple labels for non-technical users | ✅ Partial | Labels are clear but generic |
| Search/filter coupons | ❌ | Not built |
| Coupon usage analytics | ❌ | Backend exists, not wired |

---

## 9. API Mismatch Findings

### Critical: Admin create route field-persistence gap

**File:** `backend/routers/coupons.py`, lines 23-41

The `create_coupon` endpoint builds `coupon_doc` with only 12 explicitly mapped fields:

```python
coupon_doc = {
    "id", "user_id", "code", "discount_type", "discount_value",
    "start_date", "end_date", "usage_limit", "per_user_limit",
    "min_order_value", "max_discount", "specific_users",
    "applicable_channels", "description", "is_active", "total_used", "created_at"
}
```

**Missing from create (silently dropped even if sent by client):**
- V1: `title`, `coupon_type`, `stackable_with_loyalty`
- V2: `discount_scope`, `eligible_food_ids`, `eligible_item_ids`, `eligible_category_ids`, `eligible_category_names`, `excluded_item_ids`, `excluded_category_ids`, `min_item_qty`, `max_applicable_qty`, `apply_to_cheapest_item`, `apply_to_highest_item`
- V3-A: `offer_type`, `valid_days`, `start_time`, `end_time`, `timezone`
- V3-B: `buy_quantity`, `get_quantity`, `buy_food_ids`, `buy_item_ids`, `buy_category_ids`, `buy_category_names`, `get_food_ids`, `get_item_ids`, `get_category_ids`, `get_category_names`, `get_discount_type`, `get_discount_value`, `max_applications`, `allow_repeat`, `same_item_required`, `requires_get_item_in_cart`, `pos_instruction`
- V3-C: `nth_item_number`, `nth_discount_type`, `nth_discount_value`

**The update endpoint DOES use `coupon_data.model_dump()`** and would persist all fields. But coupons must be created before they can be updated.

**Recommended fix:** Replace explicit `coupon_doc` mapping in `create_coupon` with:
```python
coupon_doc = coupon_data.model_dump()
coupon_doc["id"] = coupon_id
coupon_doc["user_id"] = user["id"]
coupon_doc["code"] = coupon_data.code.upper()
coupon_doc["is_active"] = True
coupon_doc["total_used"] = 0
coupon_doc["created_at"] = now
```

### Other mismatches:

| Issue | Detail |
|---|---|
| UI sends `discount_type: "fixed"` | Backend stores `"fixed"` but V1 engine normalizes to `"flat"` for POS validation. Possible display mismatch. |
| UI does not send `title` | Coupons in DB have `title: null`; POS handoff expects title for display. |
| UI ignores `is_active` toggle on edit | No way to reactivate a deactivated coupon from UI. |
| Deprecated `/coupons/validate` and `/coupons/apply` | Backend has these old query-param endpoints; UI does not call them. New POS validate (`POST /pos/coupons/validate`) is JSON body-based. No conflict, but old endpoints should be removed eventually. |

---

## 10. Reuse vs Rebuild Verdict

### **Verdict: B — Partially reuse existing list/API layer but build new create/edit flow**

| Factor | Assessment |
|---|---|
| **List view** | Reusable with minor enhancements (add type badge, toggle button, search) |
| **Create/edit form** | Must be replaced — single flat form cannot handle 5 coupon types with 50+ conditional fields |
| **API layer** | Reusable — `api.get("/coupons")`, `api.post("/coupons")`, `api.put("/coupons/{id}")`, `api.delete` all work. Just need to send more fields. |
| **Routing** | Reusable — `/coupons` route already exists |
| **Navigation** | Reusable — sidebar link exists |
| **Architecture** | Single-file (536 lines) with inline state management. For 5 coupon types, need component decomposition. |

**Why not A (extend safely):** The existing single-modal form pattern cannot scale to 50+ conditional fields across 5 coupon types without becoming unmaintainable. Attempting to patch it phase-by-phase will create a tangled monolith.

**Why not C (full replace):** The list view, API integration pattern, routing, and navigation are sound. Rebuilding them from scratch adds no value.

**Risk level:** Low — reusing the list wrapper means no UX regression for existing users.

---

## 11. Recommended UI Direction

### **Primary path: Option 2 — Reuse existing coupon list but build new create/edit wizard**

Keep `CouponsPage.jsx` as the list/container. Build a new multi-step wizard or type-specific form for create/edit that:

1. Step 1: Select coupon type (Flat/Percentage → Item/Category → Happy Hour → BOGO/BXGY → Every-Nth)
2. Step 2: Type-specific fields appear dynamically
3. Step 3: Common fields (dates, limits, channels)
4. Step 4: Review + save

### Fallback: Option 3 — Patch existing UI phase-by-phase

If time is constrained, patch V1 missing fields first, then add V2 section, etc. Higher technical debt but faster first delivery.

---

## 12. Recommended UI Implementation Phases

| UI Phase | Scope | Estimated Complexity | Prerequisite |
|---|---|---|---|
| **Phase 0** | Fix admin create route to persist all fields (backend, 1 function) | Low (30 min) | None |
| **Phase 1** | Complete V1: add `title`, `stackable_with_loyalty`; add toggle active; add coupon type badge to list; add search/filter | Medium | Phase 0 |
| **Phase 2** | V2 Item/Category: add `discount_scope` selector; add item/category ID input fields (manual first, searchable later); conditional form sections | Medium-High | Phase 1 |
| **Phase 3** | V3-A Time-window: add `offer_type` selector; weekday picker; time inputs; timezone selector | Medium | Phase 1 |
| **Phase 4** | V3-B BOGO/BXGY: rule builder (buy/get quantities, item selectors, discount type, max applications, pos_instruction) | High | Phase 2 |
| **Phase 5** | V3-C Every-Nth: rule builder (nth_item_number, discount type/value, eligible items) | Medium | Phase 4 (reuses components) |
| **Phase 6** | Preview/test, coupon usage analytics view, coming-soon placeholders | Medium | Phase 1+ |

---

## 13. Owner Question Gate

### Q1. Reuse decision:
- **A.** Extend existing coupon UI (patch the single modal)
- **B.** Partially reuse existing list/API layer but build new create/edit flow **(RECOMMENDED)**
- **C.** Build new coupon management module from scratch

### Q2. First UI scope:
- **A.** V1 only (complete the missing V1 fields)
- **B.** V1 + V2 (flat/percentage + item/category)
- **C.** V1 through V3-A (add time-window)
- **D.** V1 through V3-C full coupon engine

### Q3. Form style:
- **A.** Single long form with all fields
- **B.** Step-by-step wizard (type → specifics → limits → review)
- **C.** Coupon type-specific forms (separate form per type)
- **D.** Hybrid: coupon type selector + dynamic sections **(RECOMMENDED)**

### Q4. Item/category selector:
- **A.** Use live menu/catalog selector (requires catalog API)
- **B.** Manual IDs first (text input for food_id / category_id)
- **C.** Searchable selector if API exists, manual fallback otherwise **(RECOMMENDED)**

### Q5. Advanced fields (max_applications, allow_repeat, pos_instruction, etc.):
- **A.** Show all fields
- **B.** Hide advanced fields under "Advanced Settings" collapsible **(RECOMMENDED)**
- **C.** Keep advanced fields internal only (API-only, no UI)

### Q6. Test/preview before save:
- **A.** Include preview/test validation in first UI phase
- **B.** Add later **(RECOMMENDED — focus on CRUD first)**
- **C.** Do not include

### Q7. Future coupons (Free-item V3-D, Combo V4):
- **A.** Show as "Coming Soon" placeholders
- **B.** Hide until implemented **(RECOMMENDED)**
- **C.** Show only if feature flag exists

### Q8. UI rollout strategy:
- **A.** Build full V1-V3C UI at once
- **B.** Phase UI rollout by coupon complexity **(RECOMMENDED)**
- **C.** Build internal admin-only first, client-friendly later

---

## 14. Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| 1 | **Admin create route drops V2+ fields** | Any coupon created via UI/API will be missing V2+ fields even if sent | Fix `coupons.py` create before UI work (Phase 0) |
| 2 | `discount_type: "fixed"` vs `"flat"` naming mismatch | UI uses "fixed", V1 coupon engine normalizes to "flat" for POS | Align UI labels with backend canonical names |
| 3 | No item/category catalog API in CRM | V2 item/category selectors need a source of items | Use manual IDs initially; add searchable selector when catalog API available |
| 4 | Single-file 536-line component | Adding 50+ fields will make it unmaintainable | Decompose into sub-components before adding V2+ |
| 5 | No test/preview flow | Admin might create invalid coupons (e.g., BOGO with missing fields) | Add client-side validation per coupon type; backend validators will catch server-side |

---

## 15. Final Recommendation

1. **Phase 0 (immediate):** Fix `coupons.py` admin create route to use `model_dump()`. This is a 1-function backend fix that unblocks all future UI work.

2. **Phase 1 (first UI sprint):** Complete V1 UI — add `title`, `stackable_with_loyalty`, active toggle, type badge on list, search/filter. This gives immediate value with low complexity.

3. **Phase 2-5 (subsequent sprints):** Build new create/edit wizard with coupon-type selector and dynamic form sections. Reuse the existing list view. Phase by complexity.

4. **Owner decisions required before Phase 1:** Q1-Q8 above.

---

## 16. Final Status

```
cr001c_coupon_admin_ui_discovery_complete_waiting_owner_ui_decisions
```
