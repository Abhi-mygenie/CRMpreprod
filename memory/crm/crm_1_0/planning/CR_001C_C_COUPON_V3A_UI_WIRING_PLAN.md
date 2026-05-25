# CR-001C-C V3-A Happy Hour — UI Wiring Plan, Discovery & Field Mapping

**Date:** 2026-05-25
**Phase:** V3-A Happy Hour — production UI wiring (low effort, ~1 hour code)
**Mode:** Planning + discovery + mapping only — **no code, no DB, no env, no deploy** in this step
**Prerequisite status:**
- V3-A backend: ✅ QA 31/31 PASS (`cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview`)
- Owner-approved preview at `/coupons-v3-preview` (V3 Preview UI Planning Report §10)
- Combined regression: 211/211 PASS across V1 → V3-C

---

## 1. Executive Summary

V3-A Happy Hour adds a **time window** (weekdays + start/end time + IANA timezone) to a coupon so it is only redeemable inside that window. The backend is fully ready (31/31 QA). The production `/coupons` page already exposes a "Happy Hour" tile marked **Soon** — we just need to wire the form section, payload mapping and edit-mode rehydration.

### Critical correction over `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md`

| Claim in old guide | Correction (this plan) | Source |
|---|---|---|
| Send `payload.offer_type = "time_window"` for Happy Hour | **`offer_type` must remain `"simple"`** (or omitted). `"time_window"` is **NOT** an allowed enum value. | `backend/models/schemas.py` lines 48-65 — `_v3a_validate_offer_type` allowed set: `simple`, `bogo`, `bxg`, `buy_x_get_y`, `nth_item`, `every_nth`, `every_nth_item`, `free_item`, `combo` |
| Edit-mode detection: `c.offer_type === "time_window"` | Detect by presence of any time-window field: `valid_days?.length > 0 OR start_time OR end_time` | V3-A is compositional — backend implementation report §"Algorithm" |

### Key insight: V3-A is **compositional**, not a separate offer type

A Happy Hour coupon is **any normal coupon** (V1 order_flat / V1 order_percentage / V2 item / V2 category) that ALSO has time-window fields set. The backend's `_v3a_is_within_time_window` is inserted as **Step 4** of `validate_coupon_for_customer` (after EXPIRED, before USAGE_LIMIT_REACHED) and applies to **all** coupon scopes automatically.

For V3-A v1 UI (this plan) we keep the tile-based UX from the approved preview:
- "Happy Hour" tile is a **mode** that defaults `discount_scope="order"` and exposes the time window section + flat/% choice. This is the lowest-friction shape, matches the preview, and lets us ship in ~1 hour.
- Composing Happy Hour with V2 (item/category) is **deferred** to V3-A2 (see §11 out of scope) — backend already supports it, UI doesn't need to expose it yet.

---

## 2. Inputs Reviewed

| File | Purpose | Lines / sections |
|---|---|---|
| `frontend/src/pages/CouponsPage.jsx` | Production V1+V2 drawer UI | Whole file (612 lines) — discovered current state |
| `frontend/src/pages/CouponV3Preview.jsx` | Preview UX (owner-approved) | Lines 267-331 (V3-A section); lines 27-35 (DAYS, TIMEZONES constants); line 153 (state) |
| `backend/models/schemas.py` | V3-A Pydantic fields + validators | Lines 1-65 (validators); 593-597 (Coupon fields); 622-626 (CouponCreate validators); 679-683 (CouponUpdate fields); 707-710 (Update validators) |
| `backend/core/coupon.py` | Time-window evaluator | (referenced — owner of pre-check logic, no UI implication) |
| `memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md` | Backend behaviour spec | Whole file |
| `memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md` | Owner-approved UX | §4 (field map), §10 (owner checklist) |
| `memory/crm/crm_1_0/handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md` | Prior agent's draft guide | §V3-A — used as starting point, two bugs corrected in this plan |

---

## 3. Current State of `CouponsPage.jsx` (Discovery)

| What exists | Line(s) | Reusable for V3-A? |
|---|---|---|
| Drawer (`Sheet`) | 397+ | ✅ Yes — same drawer hosts V3-A |
| 7-tile type selector (Happy Hour tile already shown, `enabled: false`) | 37-45, 410-430 | ✅ Tile already there — just flip `enabled` and add `scope`/`dtype`/`color` |
| `EMPTY_FORM` shape (V1+V2 fields) | 47-58 | ✅ Extend with 4 V3-A fields |
| `resolveTypeFromCoupon(c)` | 60-65 | ⚠️ Needs V3-A detection branch (compositional) |
| `openEdit` rehydration | 196-228 | ⚠️ Needs 4 new field assignments |
| `handleTypeSelect` | 230-235 | ⚠️ Needs `time_window` branch (scope + offer_type stays "simple") |
| `handleSubmit` payload builder | 237-278 | ⚠️ Needs Happy Hour payload branch |
| Identity / Discount Rules / Validity sections inside form | 433-545 | ✅ Reused as-is for V3-A |
| Advanced Settings collapsible | 548-591 | ✅ Reused |
| `Separator` + `Switch` + `Input type="time"` + `Select` shadcn imports | 19-27 | ✅ All needed components already imported |
| `SCOPE_COLORS` / `SCOPE_LABELS` | 30-35 | ⚠️ Optional addition for Happy Hour list badge (low priority) |
| `Clock` icon import from lucide-react | 5 | ✅ Already imported |

### Reusable elements from `CouponV3Preview.jsx` (V3-A section, lines 267-331)

| Element | Where in preview | What to lift |
|---|---|---|
| `DAYS` constant (7 entries Mon=0 .. Sun=6) | Line 27-30 | Lift verbatim |
| `TIMEZONES` constant (7 IANA strings) | Line 32-35 | Lift verbatim |
| Weekday toggle button row | Lines 295-303 | Lift markup, replace `validDays`/`toggleDay` with form-state versions |
| Start time / End time inputs (`<Input type="time">`) | Lines 305-308 | Lift markup, replace state hooks with `form.start_time` / `form.end_time` |
| Timezone `<Select>` | Lines 309-315 | Lift markup, replace `timezone` state with `form.timezone` |
| "OfferSummary" plain-English panel | Line 329 | **Out of scope for v1 wiring** — keep simple, parity with V1/V2 (no live summary). Can add in V3-A2. |

---

## 4. Backend Field Mapping (Source of Truth)

From `backend/models/schemas.py`:

| Backend field (`Coupon` / `CouponCreate` / `CouponUpdate`) | Type | Default | Validator | UI form field |
|---|---|---|---|---|
| `offer_type` | `str?` | `"simple"` on create | enum (no `"time_window"`) | **Hidden** — always `"simple"` for V3-A v1 |
| `valid_days` | `List[int]?` | `null` | ISO weekday ints `[0..6]`, dedup + sort, `[]` → `null` | 7-button weekday toggle |
| `start_time` | `str?` | `null` | regex `^([01]\d\|2[0-3]):[0-5]\d$` (HH:MM 24h) | `<Input type="time">` |
| `end_time` | `str?` | `null` | same HH:MM regex | `<Input type="time">` |
| `timezone` | `str?` | `null` | IANA — must be loadable by `ZoneInfo` | `<Select>` of common IANA strings |

### Validator behaviour callouts

- **Empty list normalises to null.** `valid_days: []` is coerced to `null` by `_v3a_validate_valid_days`. UI can send either; both mean "every day".
- **Asymmetric times allowed (overnight).** `start_time=22:00, end_time=02:00` is a valid overnight window per backend `_v3a_is_within_time_window`. UI must NOT reject this.
- **Both times required as a pair.** If either is set, the backend treats the window as "configured". UI should require both-or-neither.
- **Timezone fallback chain** (server-side, not UI): coupon.timezone → `users.settings.timezone` → `Asia/Kolkata` → UTC (with `tz_fallback="utc"` warning). UI default = `Asia/Kolkata`.
- **`offer_type="time_window"` is REJECTED.** Per `_v3a_validate_offer_type` at line 48-65. Do not send this value.

---

## 5. UI ↔ Backend Mapping (V3-A Happy Hour)

### 5.1 `COUPON_TYPES[id="time_window"]` after wiring

```js
{ id: "time_window", label: "Happy Hour",
  desc: "Time-based promotional offers",
  icon: Clock, phase: "V3-A",
  enabled: true,
  scope: "order",     // V3-A v1 only composes with order-scope (V1)
  dtype: null,        // user picks flat/percentage
  color: "from-cyan-500 to-cyan-600" }
```

### 5.2 `EMPTY_FORM` additions

```js
// V3-A Happy Hour
valid_days: [],
start_time: "",
end_time: "",
timezone: "Asia/Kolkata",
```

### 5.3 `handleTypeSelect` branch for `time_window`

When user picks Happy Hour:
- `discount_scope = "order"` (V3-A v1 keeps it ORDER scope)
- `discount_type` stays as `flat` default (user toggles in the form)
- `offer_type` stays `"simple"` — **do NOT set to `"time_window"`**

### 5.4 `handleSubmit` payload mapping (Happy Hour)

When `selectedType === "time_window"`:

```js
payload.discount_scope = "order";
payload.offer_type = "simple";                          // CRITICAL — not "time_window"
payload.valid_days  = form.valid_days.length > 0 ? form.valid_days : null;
payload.start_time  = form.start_time || null;
payload.end_time    = form.end_time  || null;
payload.timezone    = form.timezone   || null;
```

The existing V1 payload fields (`discount_type`, `discount_value`, `min_order_value`, `max_discount`, `start_date`, `end_date`, `usage_limit`, `per_user_limit`, `applicable_channels`, `stackable_with_loyalty`) are already built — Happy Hour reuses them all.

### 5.5 `resolveTypeFromCoupon(c)` — edit-mode detection

Add an early check (BEFORE the scope check):

```js
function resolveTypeFromCoupon(c) {
  // V3-A: Happy Hour is compositional — detect by time-window fields
  if ((c.valid_days && c.valid_days.length > 0) || c.start_time || c.end_time) {
    return "time_window";
  }
  const scope = c.discount_scope || "order";
  if (scope === "item") return "item_discount";
  if (scope === "category") return "category_discount";
  return c.discount_type === "percentage" ? "order_percentage" : "order_flat";
}
```

### 5.6 `openEdit` rehydration additions

Append to the `setForm({...})` call:

```js
valid_days: coupon.valid_days || [],
start_time: coupon.start_time || "",
end_time:   coupon.end_time   || "",
timezone:   coupon.timezone   || "Asia/Kolkata",
```

### 5.7 Form section (rendered when `selectedType === "time_window"`)

Inserted **after** the existing "Discount Rules" section (`isV2` block) and **before** the existing "Validity & Limits" section. Same `<Separator>` + `<p className="text-xs font-bold uppercase tracking-widest text-gray-400">` heading pattern.

| Field | Component | Validation (client) |
|---|---|---|
| Valid Days (Mon-Sun) | 7 toggle buttons, multi-select | None client-side (backend accepts empty = every day) |
| Start Time | `<Input type="time">` | Required IF Happy Hour mode; HTML form validation |
| End Time | `<Input type="time">` | Required IF Happy Hour mode; HTML form validation |
| Timezone | `<Select>` of `TIMEZONES` array | Required; default `Asia/Kolkata` |

Backend already enforces HH:MM regex + IANA validity → if user bypasses HTML5, backend will respond `422` with a clear field error → existing toast surfaces it.

### 5.8 List view badge (optional, low priority)

Add Happy Hour badge in the coupons list when `c.valid_days?.length > 0 || c.start_time`. This is a nicety — owner did **not** explicitly ask for it. Keep optional and ship it in V3-A2.

```js
// Optional addition to SCOPE_COLORS:
time_window: "bg-cyan-50 text-cyan-700 border-cyan-200",
```

---

## 6. File-by-File Implementation Plan (do NOT execute in this step)

Single file: `frontend/src/pages/CouponsPage.jsx`. Eight self-contained edits.

| # | Location | Edit | Risk |
|---|---|---|---|
| 1 | Lines 27-35 (module top) | Add `const DAYS = [...]` and `const TIMEZONES = [...]` (lifted from preview lines 27-35) | None |
| 2 | Line 42 | Replace the `time_window` entry: set `enabled: true`, add `scope: "order"`, `dtype: null`, `color: "from-cyan-500 to-cyan-600"` | None |
| 3 | Lines 47-58 (`EMPTY_FORM`) | Add 4 fields: `valid_days`, `start_time`, `end_time`, `timezone: "Asia/Kolkata"` | None |
| 4 | Lines 60-65 (`resolveTypeFromCoupon`) | Add early-return branch for time-window field presence (see §5.5) | Low — must not break V1/V2 paths |
| 5 | Lines 196-228 (`openEdit` `setForm({...})`) | Add 4 field rehydrations (see §5.6) | Low |
| 6 | Lines 230-235 (`handleTypeSelect`) | (No code change needed — `t.scope = "order"` + `t.dtype = null` from §5.1 already handle this branch correctly) | None |
| 7 | Lines 237-278 (`handleSubmit`) | Add 5-line Happy Hour branch (see §5.4). MUST keep `offer_type = "simple"` | **Critical** — review carefully, see §1 correction |
| 8 | Around line 485 (after V2 selector block, before Validity block) | Insert the Time Window form section (see §5.7) — guarded by `selectedType === "time_window"` | Low |

**Lines of code:** ~50-65 net additions, no deletions, no refactors. No new dependencies, no new imports beyond what's already in the file (`Clock` icon and `Select`/`Input`/`Label`/`Separator` are all imported).

---

## 7. Owner Decisions Needed

The V3 preview was already approved by the owner (`planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md` §13). Only **2 micro-decisions** remain for v1 wiring; both have safe recommended defaults so we can proceed without blocking:

| Q | Decision | Recommended default | Impact if owner picks otherwise |
|---|---|---|---|
| OQ-V3A-UI-1 | V3-A v1: Happy Hour composes with **order scope only** (flat/percentage), or also with item/category (V2)? | **Order scope only** (matches preview, simpler form) | If "all scopes" → 1-2 extra hours work to merge time-window section into V2 forms too. Defer to V3-A2 either way. |
| OQ-V3A-UI-2 | Timezone list: ship with the preview's 7 IANA strings (Asia/Kolkata, Asia/Dubai, Asia/Riyadh, Asia/Singapore, Europe/London, America/New_York, America/Los_Angeles) or expanded list? | **The 7 from preview** | Easy to extend later. |

No blocker. Proceed with defaults unless owner overrides.

---

## 8. QA Plan (post-implementation)

The agent that implements this plan must run these manual checks against the running preview at `https://crm-staging-15.preview.emergentagent.com/coupons` (existing R689 JWT). **No POS integration test needed** (V3-A is pre-validation only; POS pipeline does not need to change for Happy Hour).

| # | Test | Expected |
|---|---|---|
| Q1 | Open `/coupons` → click "New Coupon" → Happy Hour tile is **clickable** (not "Soon") | Tile enabled, drawer opens to Happy Hour form |
| Q2 | Fill Code=HAPPY20, Title="Lunch Happy Hour", flat/Rs.100, Mon+Tue+Wed+Thu+Fri selected, 12:00–15:00, Asia/Kolkata, dates valid, save | HTTP 201, coupon appears in list |
| Q3 | Fetch saved coupon via `GET /api/coupons/{id}` (curl) | Body contains `valid_days: [0,1,2,3,4]`, `start_time: "12:00"`, `end_time: "15:00"`, `timezone: "Asia/Kolkata"`, `offer_type: "simple"` |
| Q4 | Edit the saved coupon | Form re-opens with all V3-A fields populated correctly |
| Q5 | Change end_time to 25:99 via DevTools and submit | Backend returns 422 → toast shows error |
| Q6 | Create overnight window (22:00 → 02:00) | Saved successfully; both fields persisted |
| Q7 | Create with only one of start_time/end_time → bypassed via DevTools | Backend persists as-is (one-sided), but the time-window pre-check treats it as not-configured. Verify with `GET /api/pos/coupons/available` that `within_window_now=true` regardless of clock. |
| Q8 | Validate via `POST /api/pos/coupons/validate` from inside vs outside the window (use `order_time` param) | Inside → 200 success; outside → 200 with `error.code="OUTSIDE_TIME_WINDOW"` and `time_window_status` block |
| Q9 | Toggle coupon active/inactive | Works (existing `/toggle` endpoint, no V3-A touchpoint) |
| Q10 | Delete coupon | Works |
| Q11 | Regression: create a plain V1 flat coupon (no time fields) | Works exactly as before — `resolveTypeFromCoupon` still returns `"order_flat"` |
| Q12 | Regression: create a V2 item-discount | Works — V2 path untouched |

If any of Q1-Q4 or Q11-Q12 fail → roll back the 8-edit patch (it's contained to one file).

---

## 9. Risks & Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Sending `offer_type="time_window"` will 422 from backend | This plan **explicitly corrects** the old guide. §1 + §5.4 highlight the right value (`"simple"`). |
| R2 | `valid_days: []` from UI gets stored as `null` (backend normalises empty list) | Documented in §4. UI is consistent — sends `null` when empty, list otherwise. |
| R3 | User saves only start_time without end_time (or vice versa) — backend stores it but time-window pre-check ignores incomplete config | Add HTML5 `required` on both fields when the Happy Hour section is shown; OR add an inline note. Acceptable trade-off either way; recommend HTML5 `required`. |
| R4 | Existing V1/V2 coupons may have `valid_days = null` and `start_time = null` from a prior backfill — `resolveTypeFromCoupon` correctly returns the V1/V2 type | Verified by §5.5 — the new branch only triggers when ANY of those fields is truthy. |
| R5 | Timezone select dropdown looks abrupt on mobile (long IANA strings) | Preview already uses these 7 strings; keep parity. Defer expansion. |
| R6 | `Clock` icon is already imported but unused in the V1+V2 file — wiring will start using it | Just confirm — no import addition needed. |
| R7 | Backend doesn't currently validate that `start_date / end_date` (calendar) intersects `valid_days` (weekdays). User could create "every Mon-Fri" with `end_date = next Sunday`. Acceptable — separate concern. | Out of scope. |

---

## 10. Effort Estimate

| Step | Estimated effort |
|---|---|
| 8 file edits per §6 | ~40 minutes |
| Manual QA Q1-Q12 per §8 | ~20 minutes |
| Implementation report under `implementation/` + index update | ~15 minutes |
| **Total** | **~1.5 hours** |

---

## 11. Out of Scope (deferred to V3-A2 or later phases)

- Composing Happy Hour with V2 (item / category) in the SAME drawer — owner can still create a V2 coupon AND set the time-window fields manually via API; UI exposure deferred.
- "Offer summary" plain-English panel (preview line 329). Add when implementing V3-A2.
- Happy Hour list-view badge in the coupons table (R5 above) — optional polish, defer.
- V3-A2 analytics counter `used_outside_window_attempts` — backend already returns `0`; deferred per OQ-V3A-2.
- Removing the `/coupons-v3-preview` route — defer until V3-A + V3-B + V3-C are ALL wired.
- Any backend change — none needed; backend is at 31/31 QA.
- Any DB migration — none needed; all V3-A fields are optional and additive.
- Any POS contract change — none needed; V3-A is pre-validation only.

---

## 12. Acceptance Criteria

The wiring step is considered done when ALL of these are true:

1. The "Happy Hour" tile in `/coupons` is no longer marked **Soon** and is clickable.
2. Selecting the tile reveals a form with: code, title, flat/% type toggle, discount value, weekday selector (7 buttons), start time, end time, timezone, and the existing common (dates, limits, channels, stackable) sections.
3. Submitting creates a coupon whose `GET /api/coupons/{id}` returns:
   - `offer_type: "simple"`
   - `valid_days: [<sorted int list>]`
   - `start_time: "HH:MM"`
   - `end_time: "HH:MM"`
   - `timezone: "<IANA>"`
4. Editing the saved coupon re-populates all V3-A fields.
5. All existing V1+V2 create/edit/list/toggle/delete flows still work (regression Q11-Q12).
6. No backend, DB, env, dependency, or supervisor change.

---

## 13. Recommended Next Agent

**Frontend Wiring Agent — V3-A (single file: `CouponsPage.jsx`).**
Brief:
- Apply the 8 edits in §6 exactly.
- Use `mcp_search_replace` for each (no full-file rewrite — file is 612 lines and stable).
- Run Q1-Q12 per §8. Capture results in a new `implementation/CR_001C_C_COUPON_V3A_UI_WIRING_IMPLEMENTATION_REPORT.md`.
- Update `planning/CR_001C_INDEX.md` row to `cr001c_coupon_v3a_ui_wired_to_production_qa_passed_in_preview`.
- **Do not** touch V3-B / V3-C tiles, the preview route, or any other file.

---

## 14. Final Status

```
cr001c_coupon_v3a_ui_wiring_plan_ready_for_implementation
```

- Discovery: complete (`CouponsPage.jsx` 612 lines mapped; preview V3-A section identified at lines 267-331; backend fields & validators identified at `schemas.py` 1-65, 593-597, 622-626).
- Field mapping: complete (§4, §5).
- Plan: 8 self-contained edits in one file (§6).
- Effort: ~1.5 hours including QA + report.
- Critical correction applied: `offer_type` stays `"simple"` (NOT `"time_window"`). Old implementation guide had this wrong.
- No blockers. No owner gate (owner already approved V3 preview UX). 2 micro-Qs with safe defaults.
- Ready for the Frontend Wiring Agent to execute.
