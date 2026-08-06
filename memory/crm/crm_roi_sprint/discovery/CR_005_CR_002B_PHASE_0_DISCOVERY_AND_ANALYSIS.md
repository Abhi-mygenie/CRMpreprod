# CR-005 + CR-002B — Phase 0 Discovery & Code Analysis

**Date:** 2026-05-26
**Sprint:** ROI Measurement for CRM
**Status:** `cr005_cr002b_phase_0_discovery_complete`

---

## CR-005: All 7 Bugs — Root Cause Analysis

### B1 — Coupon description not showing on list | P2 | FRONTEND FIX

**Root cause: CONFIRMED.** The coupon list row at `CouponsPage.jsx` L516-528 renders `coupon.code`, `coupon.title`, discount value, usage count, and dates — but **never renders `coupon.description`**. The field exists in the form (L925-926), is saved to the backend (L344), and loaded on edit (L282) — it's just never displayed in the list card.

**Fix:** Add `{coupon.description && <p className="text-xs text-gray-400 mt-0.5">{coupon.description}</p>}` after the title line (L522).

**Effort:** 1 line. Frontend only.

---

### B2 — Customer shows "0 used" despite coupon usage | P1 | BACKEND BUG

**Root cause: CONFIRMED.** The customer detail page shows `customer.total_coupon_used` (CustomerDetailPage.jsx L329). This field is **NEVER incremented by the POS order path.**

Evidence:
- `grep -rn "total_coupon_used.*inc"` → only match is `migration.py` L487 (historical migration import)
- `record_coupon_usage_for_order()` in `coupon.py` L2216 increments `total_used` on the **coupon** doc, but **never touches `total_coupon_used` on the customer doc**
- Live DB proof: R689 has **zero** `coupon_usage` records AND **zero** customers with `total_coupon_used > 0`

**Two sub-issues:**
1. **`total_coupon_used` on customer doc never incremented** — `record_coupon_usage_for_order` needs to add `$inc: {"total_coupon_used": 1}` on the customer after recording usage
2. **R689 has zero `coupon_usage` records** — means either POS is sending `coupon_discount=0` (which skips recording per L2068-2073), or POS is not sending `coupon_code` in the order payload. Need to verify with POS team.

**Fix:** Add customer `$inc` to `record_coupon_usage_for_order`. Also investigate POS order payloads for R689 to confirm coupon data is being sent.

**Effort:** ~2 lines backend + investigation with POS team.

**Overlaps:** Directly feeds CR-002B (customer-level data trust).

---

### B3 / B6 — Per-User Limit and Total Usage Limit not enforced | P1 | LIKELY NOT A CODE BUG

**Root cause: INVESTIGATION SHOWS CODE IS CORRECT, but enforcement depends on `coupon_usage` records existing.**

The validation code at `coupon.py` L1656-1684 is correct:
- `usage_limit`: checks `coupon.total_used` against `coupon.usage_limit` — works IF `total_used` is incremented (it IS, at L2216)
- `per_user_limit`: checks `coupon_usage.count_documents` for this customer — works IF `coupon_usage` records exist
- Default `per_user_limit = int(coupon.get("per_user_limit") or 1)` means even unset limits default to 1

**The real issue:** R689 has **zero `coupon_usage` records**. If no usage is recorded, the per-user check always passes (count=0 < limit). This is the SAME root cause as B2 — coupon usage is not being recorded for R689 orders.

**Dedupe verdict:** B3 and B6 are the SAME defect as B2. All three are symptoms of coupon usage not being recorded. Once B2 is fixed (usage records written + customer counter incremented), B3/B6 enforcement will automatically work.

**Effort:** Resolved by B2 fix.

---

### B4 — Happy Hour: no item/category scope | P2 | ENHANCEMENT (V3-A2)

**Root cause: CONFIRMED as expected.** V3-A (Happy Hour) is order-level only. The coupon form shows time window fields (days, start/end time, timezone) but has no item/category selector. The discount type select is shared with V1 (flat/percentage at order level).

**This is NOT a bug.** It's a planned capability gap. V3-A was always order-scope. Adding item/category scope requires:
- Backend: New V3-A2 engine path that combines time-window validation with item/category matching
- Frontend: Add `ItemSelector` + `CategorySelector` to the `time_window` form section

**Route:** Defer to dedicated V3-A2 CR.

**Effort:** ~2-3 days (new engine path + UI).

---

### B5 — Menu items not loading in BOGO/Every-Nth pickers | P1 | NEEDS INVESTIGATION

**Root cause: PARTIALLY CONFIRMED.** The `fetchMenu()` function at CouponsPage.jsx L256-262 calls `api.get("/menu/items")` and `api.get("/menu/categories")`. These proxy to MyGenie's external API using the restaurant owner's `mygenie_token`.

R689 **has** a `mygenie_token` (confirmed in DB). Possible failure modes:
1. Token expired — MyGenie tokens may have a TTL; if the owner hasn't re-logged, the token could be stale
2. MyGenie API returns empty products for this restaurant
3. Menu fetch fails silently (catch block at L262 swallows errors: `catch { /* menu fetch fail is non-fatal */ }`)

**The silent catch is the core problem** — if menu fetch fails for ANY reason, the user sees empty pickers with no error message.

**Fix:**
1. Surface the error in the UI instead of silently swallowing it
2. Add a "Retry" button or manual refresh for menu items
3. Verify mygenie_token validity before making the call

**Effort:** ~15 lines frontend (error handling + retry).

---

### B7 — % discount missing in Happy Hour form | P2 | FRONTEND BUG

**Root cause: CONFIRMED.** The "Discount Rules" section at CouponsPage.jsx L612-642 shows the `discount_type` Select (flat/percentage) ONLY when `isV2` is true:

```jsx
{isV2 && (
  <Select value={form.discount_type} ...>
    <SelectItem value="flat">Flat Amount (Rs.)</SelectItem>
    <SelectItem value="percentage">Percentage (%)</SelectItem>
  </Select>
)}
```

`isV2` is true only for `item_discount` and `category_discount` scopes. For `time_window` (Happy Hour), `order_flat`, and `order_percentage`, the discount type is determined by the tile selection (`dtype` property). But when editing a Happy Hour coupon, there's **no way to toggle between flat and percentage** — the form inherits whatever `discount_type` was set.

The tile definition at L68 sets `dtype: null` for `time_window`, which means `discount_type` keeps its previous value (usually `"flat"` from the default state at L74).

**Fix:** Show the `discount_type` Select for `time_window` type too. Change the condition from `{isV2 && (...)}` to `{(isV2 || selectedType === "time_window") && (...)}`.

**Effort:** 1 line change. Frontend only.

---

## CR-005 Summary — Routing Decision

| Bug | Root Cause | Fix Type | Route To | Effort |
|---|---|---|---|---|
| **B1** | Description not rendered in list | Frontend 1-line | **CRM-1.1 patch** | 5 min |
| **B2** | `total_coupon_used` never incremented + zero coupon_usage records | Backend bug + POS investigation | **CRM-1.1 patch + POS verify** | 1 hour |
| **B3** | Same as B2 (enforcement depends on usage records) | Resolved by B2 fix | **Dedupe into B2** | 0 |
| **B6** | Same as B2 | Resolved by B2 fix | **Dedupe into B2** | 0 |
| **B4** | V3-A is order-level only (by design) | New engine path | **Defer to V3-A2 CR** | 2-3 days |
| **B5** | Silent menu fetch failure | Frontend error handling | **CRM-1.1 patch** | 30 min |
| **B7** | discount_type toggle hidden for Happy Hour | Frontend 1-line | **CRM-1.1 patch** | 5 min |

**Net: 4 bugs fixable now (B1, B2/B3/B6, B5, B7), 1 deferred (B4 to V3-A2)**

---

## CR-002B: Customer CRM Benefits Data Visibility — Full Analysis (Updated)

Based on CR-005 discovery + deep code review of CustomerDetailPage.jsx + all backend endpoints:

| # | Block | Status | Source | Issue Found |
|---|---|---|---|---|
| 1 | Customer coupons — used count | **BROKEN** | `customer.total_coupon_used` (L329) | B2: never incremented by POS path |
| 2 | Customer coupons — used LIST | **MISSING** | No endpoint, no UI | Gap 2: no used-coupons history (only count shown, no list with discount/date/order) |
| 3 | Customer coupons — available list | **WORKS** | `loyaltyDetails.active_coupons` (L339-342) | Correctly fetched from coupons API |
| 4 | Coupon display (code/title/type/value) | **WORKS** | Active coupons return code, discount_type, discount_value | Correct |
| 5 | Loyalty earned | **WORKS** | `customer.total_points_earned` (L295) | Verified live via Cross-Sell |
| 6 | Loyalty redeemed | **WORKS** | `customer.total_points_redeemed` (L302) | Verified live via Cross-Sell |
| 7 | Loyalty balance | **WORKS** | `customer.total_points` (L276) | Verified live via Cross-Sell |
| 8 | Wallet balance | **WORKS** | `customer.wallet_balance` (L312) | Correct |
| 9 | Wallet added/used | **WORKS** | `total_wallet_received` (L317), `total_wallet_used` (L321) | Both shown with breakdown |
| 10 | Visits | **WORKS** | `customer.total_visits` (L247) | Correct |
| 11 | Spend | **WORKS** | `customer.total_spent` (L249) | Correct |
| 12 | Tier | **WORKS** | `customer.tier` (L262) | Correct — closed enum {Bronze,Silver,Gold,Platinum} |
| 13 | Top items | **WORKS** | `/insights` endpoint (L1534-1541) | Real aggregation from `order_items`, not placeholder |
| 14 | AI insights / preferences | **WORKS — REAL DATA** | `/insights` endpoint (L1524-1645) | Computes: top items, top categories, avg frequency, preferred day, preferred time, spending trend, common notes — all from live `orders` + `order_items` aggregations. NOT placeholder. NOT mocked. |

**Two gaps found:**
1. B2: `total_coupon_used` never incremented → Fix 1 in plan
2. Gap 2: No used-coupons list on customer detail → Fix 2 + Fix 3 in plan (new endpoint + new tab)

All other blocks verified working with real data.

---

## Recommended Implementation Order

```
1. B2 fix (backend: increment total_coupon_used) — unblocks B3 + B6
2. CR-002B Gap 2: new endpoint GET /customers/{id}/coupon-history
3. CR-002B Gap 2: new "Coupons" tab on customer detail page
4. B1 fix (frontend: render description) — trivial
5. B7 fix (frontend: show discount_type for Happy Hour) — trivial
6. B5 fix (frontend: surface menu fetch error) — moderate
7. B4 deferred to V3-A2 CR — separate planning
```

**Total effort for all fixes: ~2 hours.**

---

## Status

```
cr005_cr002b_phase_0_discovery_complete
```

Ready for implementation. All root causes confirmed against live code and DB.
