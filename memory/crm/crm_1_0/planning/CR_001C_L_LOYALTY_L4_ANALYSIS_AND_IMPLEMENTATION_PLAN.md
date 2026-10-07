# CR-001C-L — L4 Manual/Cron Loyalty Analysis and Implementation Plan

**Module:** CR-001C-L Phase L4
**Date:** 2026-05-24
**Status:** `cr001c_loyalty_l4_analysis_waiting_owner_approval`
**Author:** CRM Team
**Prerequisite:** L1 ✅, L2 ✅, L3 ✅, LX-A ✅, LF-MERGE ✅, LR ✅, LR Correction ✅ (52/52)

---

## 1. Executive Summary

L4 addresses **counter parity and correctness gaps** in three code areas that were explicitly out-of-scope for the LR correction:

1. **Admin/manual redeem** (`routers/points.py::create_points_transaction`) — 7 defects vs LR-grade behavior.
2. **Birthday bonus cron** (`core/loyalty_jobs.py::run_birthday_bonus`) — 4 gaps.
3. **Anniversary bonus cron** (`core/loyalty_jobs.py::run_anniversary_bonus`) — same 4 gaps.

None of these touch the POS final-payload redeem path, `/api/pos/max-redeemable`, migration, or frontend. The shared `redeem_loyalty_points` helper from the LR correction is available for reuse by L4-A, and `calculate_tier` is available for L4-B/C.

**Recommendation:** Implement as a single bundle (L4-A + L4-B + L4-C). No datetime safety code change needed (L4-D analysis shows cron code is safe; helpers.py versions are cosmetic risk only). Estimated scope: ~45 LOC changes across 2 files.

---

## 2. Inputs Reviewed

| # | Document | Status |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Read |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | Read |
| 3 | `implementation/CR_001C_LR_CORRECTION_IMPLEMENTATION_REPORT.md` | Read |
| 4 | `qa/CR_001C_LR_CORRECTION_QA_REPORT.md` | Read |
| 5 | `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md` | Read |
| 6 | `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R689.md` | Read |
| 7 | `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md` | Read |
| 8 | `qa/CR_001C_LX_A_QA_REPORT.md` | Read (referenced from LX-A impl report) |

| # | Code file | Inspected |
|---|---|---|
| 1 | `backend/routers/points.py` (303 lines) | Full read |
| 2 | `backend/core/loyalty_jobs.py` (340 lines) | Full read |
| 3 | `backend/core/loyalty.py` (489 lines) | Full read |
| 4 | `backend/core/helpers.py` (484 lines) | Full read |
| 5 | `backend/core/scheduler.py` (122 lines) | Full read |
| 6 | `backend/routers/pos.py` (lines 1222-1330) | Redeem wiring section read |

---

## 3. Current L4 Code Audit

| Area | Current Behavior | Gap | Risk | Recommended Fix |
|---|---|---|---|---|
| **Admin redeem: `total_points_redeemed`** | NOT incremented. Only `$set total_points`. | Counter drift — `total_points_redeemed` stays 0 forever for admin redeems. | HIGH — breaks audit trail, LR key relationship `tp = tpe - expired - redeemed`. | L4-A: `$inc total_points_redeemed` |
| **Admin redeem: tier-aware ratio** | No call to `get_redemption_value_for_tier`. No `redeemed_value` computed or stored. | Wrong Rs value for non-Bronze customers. PT row has no `redeemed_value` or `ratio_per_point`. | MEDIUM — audit gap. Admin doesn't see actual Rs redeemed. | L4-A: Use `get_redemption_value_for_tier` and store in PT row. |
| **Admin redeem: tier downgrade** | `calculate_tier(new_balance)` -> tier can DROP on redeem. | Violates Q-LR1 (no tier downgrade on redeem). Gold customer redeems -> balance drops below 1500 -> tier set to Silver. | HIGH — customer visible. Breaks POS loyalty read (tier drives ratio). | L4-A: Skip tier recalculation on `transaction_type="redeem"` (preserve existing tier). |
| **Admin redeem: `loyalty_enabled` check** | NOT checked. Admin can redeem even when loyalty is disabled. | Inconsistent with LR (`LOYALTY_DISABLED` rejection). | LOW — admin is privileged. But inconsistent. | L4-A: Warn-log only, do NOT block (see Q-L4-1). |
| **Admin redeem: idempotency** | None. No idempotency key. | Double-click -> double deduction. | MEDIUM — admin UI may not retry, but API consumers could. | L4-A: Optional — add server-generated key but not blocking. |
| **Admin redeem: PT row fields** | Missing `order_id`, `idempotency_key`, `redeemed_value`, `ratio_per_point`, `points_expired`. | Inconsistent PT row schema vs LR-grade rows. | LOW — functional but audit gap. | L4-A: Add missing fields. |
| **Admin redeem: uses shared helper** | NO — completely inline logic (~25 LOC). | Duplicated logic, drift risk. | MEDIUM | L4-A: Targeted inline fix (not shared helper — see section 4.7). |
| **Birthday: `total_points_earned`** | NOT incremented. Only `$set total_points`. | Counter drift. `tpe` never reflects bonus points. Key relationship `tp = tpe - expired - redeemed` breaks. | HIGH | L4-B: `$inc total_points_earned` alongside `total_points`. |
| **Birthday: tier recompute** | NOT done after bonus. | Customer could cross tier threshold (e.g., 490->590 pts, Silver at 500) but stay Bronze until next order. | MEDIUM — delayed tier upgrade. | L4-B: Recompute and `$set tier` if upgraded (NOT downgraded). |
| **Birthday: `loyalty_enabled` check** | NOT checked. Only `birthday_bonus_enabled` is checked. | Bonus fires even when loyalty program is disabled. | LOW-MEDIUM — owner might disable loyalty but birthday bonus still fires. | L4-B: Add `loyalty_enabled` guard. |
| **Birthday: `$set` vs `$inc` atomicity** | Uses read-then-`$set` pattern: `new_points = current + bonus; $set total_points = new_points`. | Non-atomic. Concurrent bonus + POS order could lose one update. | LOW — cron runs at midnight, unlikely concurrent. But correctness gap. | L4-B: Use `$inc` for `total_points` and `total_points_earned`. |
| **Anniversary: `total_points_earned`** | NOT incremented. Same gap as birthday. | Same counter drift. | HIGH | L4-C: Same fix as birthday. |
| **Anniversary: tier recompute** | NOT done. Same gap. | Same delayed tier upgrade. | MEDIUM | L4-C: Same fix. |
| **Anniversary: `loyalty_enabled` check** | NOT checked. Same gap. | Same inconsistency. | LOW-MEDIUM | L4-C: Same fix. |
| **Anniversary: `$set` vs `$inc`** | Same read-then-`$set` pattern. | Same non-atomic risk. | LOW | L4-C: Same fix. |
| **Expiry: tier recompute** | YES — `calculate_tier(new_points)` + `$set tier`. Tier CAN downgrade on expiry. | Debatable. Points expired -> balance drops -> tier drops. | INFO — this is arguably correct (expired points shouldn't sustain tier). | No change recommended. Document as intentional. |

---

## 4. Admin/Manual Redeem Analysis

### 4.1 Current endpoint

`POST /api/points/transaction` (`routers/points.py:19-95`)
- Auth: JWT (`get_current_user`) — admin/CRM-facing, NOT POS-facing.
- Accepts `PointsTransactionCreate` with `customer_id`, `points`, `transaction_type` ("earn"/"redeem"/"bonus"), `description`, `bill_amount`.

### 4.2 Current data writes (for `transaction_type="redeem"`)

```python
# Customer update:
await db.customers.update_one({"id": ...}, {"$set": {
    "total_points": new_balance,      # decremented OK
    "tier": new_tier,                 # RECALCULATED on live balance -- can downgrade!
    "last_visit": now                 # set on redeem -- questionable (redeem != visit)
}})
# Note: NO $inc total_points_redeemed

# PT row:
tx_doc = {
    "id": uuid, "user_id": ..., "customer_id": ...,
    "points": tx_data.points,          # positive (correct convention)
    "transaction_type": "redeem",
    "description": tx_data.description,
    "bill_amount": tx_data.bill_amount,
    "balance_after": new_balance,
    "created_at": now.isoformat()
    # MISSING: order_id, idempotency_key, redeemed_value, ratio_per_point, points_expired
}
```

### 4.3 Counter defects

| Counter | Expected behavior | Current behavior | Gap |
|---|---|---|---|
| `total_points` | Decremented by `points` | `$set new_balance` (correct result, non-atomic) | Non-atomic risk only |
| `total_points_redeemed` | Incremented by `points` | **NOT TOUCHED** | Counter drift |
| `tier` | Preserved (no downgrade on redeem, Q-LR1) | Recalculated on live balance -> **CAN DOWNGRADE** | Tier flip |

### 4.4 Redemption value defects

The admin endpoint does not compute `redeemed_value = points * ratio_per_point`. The PT row has no `redeemed_value` or `ratio_per_point`. This means:
- Admin cannot see the Rs equivalent of the redemption.
- Audit queries that join PT rows to compute total Rs redeemed will miss admin redeems.

### 4.5 Idempotency decision

The admin endpoint has no idempotency protection. For admin UI usage, this is acceptable (the UI is unlikely to retry). However, if external systems ever call this endpoint, double-deduction is possible.

**Recommendation:** Add optional idempotency (generate server-side key if not provided), but do NOT make it a blocking requirement.

### 4.6 `loyalty_enabled` decision

The admin endpoint does not check `loyalty_enabled`. This is debatable:
- **Argument for checking:** Consistency with LR.
- **Argument against:** Admin is privileged and may need to adjust points even when loyalty is disabled (customer complaint resolution).

**Recommendation:** Do NOT block admin redeem on `loyalty_enabled=false`. Admin is privileged. But log a warning. (See Q-L4-1.)

### 4.7 Recommended approach: thin wrapper vs targeted inline fix

**Option A — Redirect through `redeem_loyalty_points` helper:**
- Pro: Zero code duplication. All LR guards come free.
- Con: Helper requires `order_id` and `idempotency_key` (required fields). Admin redeems don't have an order_id.
- Con: Helper hard-fails on `LOYALTY_DISABLED` — admin may want to override.
- Con: Helper auto-caps via `compute_max_redeemable(bill_amount)` — admin may want to redeem any amount without a bill.

**Option B — Targeted inline fix (RECOMMENDED):**
- Pro: Minimal change, admin-specific behavior preserved.
- Con: Some logic duplication, but the admin path has fundamentally different semantics.

**Recommendation: Option B.** Fix the 7 specific defects inline:

1. `$inc total_points_redeemed: points` on redeem
2. Skip tier recalculation on redeem (preserve `old_tier`)
3. Compute `redeemed_value = points * get_redemption_value_for_tier(tier, settings)` and store in PT row
4. Add `points_expired: False` to PT row
5. Remove `last_visit` update on redeem (redeem is not a visit)
6. Optional: warn-log on `loyalty_enabled=false`
7. Optional: add server-generated idempotency key to PT row

---

## 5. Birthday Bonus Analysis

### 5.1 Current code: `core/loyalty_jobs.py::run_birthday_bonus` (lines 16-98)

**What it does correctly:**
- Checks `birthday_bonus_enabled` setting.
- Computes birthday window with `days_before` / `days_after`.
- Prevents duplicate bonus via `last_birthday_bonus_year == current_year`.
- Creates PT row with `transaction_type="bonus"`.
- Fires WhatsApp `birthday` trigger.
- Uses safe date-only comparisons (no naive-vs-aware risk).

**Gaps:**

| Gap | Current | Expected | Severity |
|---|---|---|---|
| `total_points_earned` | NOT incremented | Should `$inc` by `bonus_points` | HIGH |
| Tier recompute | NOT done | Should call `calculate_tier(new_points, settings)` and `$set tier` if upgraded (NOT downgraded) | MEDIUM |
| `loyalty_enabled` | NOT checked | Should skip bonus if `loyalty_enabled=false` | LOW-MEDIUM |
| `$set` vs `$inc` | `$set total_points = current + bonus` (read-then-set) | `$inc total_points` by `bonus_points` (atomic) | LOW |

### 5.2 Customer update — current vs proposed

**Current:**
```python
await db.customers.update_one(
    {"id": customer["id"]},
    {"$set": {"total_points": new_points, "last_birthday_bonus_year": current_year}}
)
```

**Proposed (L4-B):**
```python
new_points = current_points + bonus_points
new_tier = calculate_tier(new_points, settings)
tier_update = {"tier": new_tier} if _tier_rank(new_tier) > _tier_rank(old_tier) else {}
await db.customers.update_one(
    {"id": customer["id"]},
    {
        "$inc": {"total_points": bonus_points, "total_points_earned": bonus_points},
        "$set": {"last_birthday_bonus_year": current_year, **tier_update}
    }
)
```

### 5.3 PT row addition

Add `points_expired: False` for consistency with LR-grade rows. No other field changes needed — bonus rows don't need `order_id`, `idempotency_key`, `redeemed_value`, or `ratio_per_point`.

---

## 6. Anniversary Bonus Analysis

### 6.1 Current code: `core/loyalty_jobs.py::run_anniversary_bonus` (lines 101-183)

**Structurally identical to birthday bonus.** Same 4 gaps apply:

| Gap | Severity | Fix |
|---|---|---|
| `total_points_earned` not incremented | HIGH | `$inc total_points_earned` |
| Tier not recomputed | MEDIUM | `calculate_tier` + upgrade-only `$set tier` |
| `loyalty_enabled` not checked | LOW-MEDIUM | Guard at top |
| `$set` vs `$inc` for `total_points` | LOW | Switch to `$inc` |

### 6.2 Duplicate prevention

Uses `last_anniversary_bonus_year == current_year`. Same pattern as birthday. Working correctly.

---

## 7. Datetime Safety Findings

### 7.1 Cron birthday/anniversary matching (`loyalty_jobs.py`)

```python
dob = datetime.strptime(dob_str[:10], "%Y-%m-%d").date()   # date object (no tz)
today = datetime.now(timezone.utc).date()                    # date object (no tz)
birthday_this_year = dob.replace(year=current_year)          # date object
if window_start <= today <= window_end:                      # date vs date -> SAFE
```

**Verdict: SAFE.** All comparisons are between `date` objects (not `datetime`). No naive-vs-aware risk. BUG-L3-001 cannot recur here.

### 7.2 Helpers birthday/anniversary (`helpers.py`)

```python
dob = datetime.fromisoformat(dob_str.replace('Z', '+00:00'))  # datetime, COULD be naive
today = datetime.now(timezone.utc)                              # datetime, tz-aware
birthday_this_year = dob.replace(year=today.year)               # inherits dob's tz
if start_date <= today <= end_date:                             # naive vs aware -> TypeError!
```

**Verdict: LATENT BUG.** If `dob_str` is `"1990-05-24"` (no timezone, no 'Z'), `fromisoformat` returns naive datetime. Comparing with aware `today` raises TypeError, caught by broad `except Exception: pass` — silently skipping the customer.

**Impact: LOW.** These helpers are NOT used by the cron. The cron uses `run_birthday_bonus` / `run_anniversary_bonus` from `loyalty_jobs.py` which use the safe `.date()` pattern. The helpers.py functions appear to be unused legacy code or used only in non-critical informational paths.

**Recommendation:** Document as known risk. Fix in L4 if trivial (add `.date()` conversion), otherwise defer to L5 cleanup.

### 7.3 Expiry job string comparison (`loyalty_jobs.py::run_points_expiry`)

```python
expiry_cutoff_str = (now - timedelta(days=expiry_months * 30)).isoformat()
# Produces: "2025-11-24T14:06:10.148974+00:00"
# MongoDB query: "created_at": {"$lt": expiry_cutoff_str}
```

**Verdict: FRAGILE BUT PRACTICALLY CORRECT.** String comparison of ISO dates works lexicographically when the YYYY-MM-DD prefix determines the ordering. Mixed formats (space vs T separator) happen to compare correctly because the date prefix dominates.

**Recommendation:** No change in L4. Document as known fragility. Defer proper fix (parse dates before comparison) to L5.

### 7.4 Summary

| Area | Risk | Action in L4 |
|---|---|---|
| Cron birthday/anniversary | SAFE | None |
| helpers.py birthday/anniversary | Latent bug (unused by cron) | Document only; trivial fix if convenient |
| Expiry string comparison | Fragile but correct in practice | Document only; defer to L5 |

**No datetime safety code change is required for L4.**

---

## 8. Shared Helper Reuse Plan

| Helper | Used by L4? | How |
|---|---|---|
| `redeem_loyalty_points(...)` | **NO** | Admin redeem has different semantics (no order, no bill, no auto-cap). Targeted inline fix instead. |
| `get_redemption_value_for_tier(...)` | **YES** (L4-A) | Admin redeem computes `redeemed_value = points * ratio_per_point`. |
| `calculate_tier(...)` | **YES** (L4-B, L4-C) | Birthday/anniversary bonus recomputes tier after adding points. Already imported in `loyalty_jobs.py`. |
| `_tier_rank(...)` | **YES** (L4-B, L4-C) | Upgrade-only guard. Currently in `routers/points.py`; inline in `loyalty_jobs.py` (simple 4-line function). |

---

## 9. Recommended L4 Implementation Scope

### L4-A: Admin/Manual Redeem Parity

**File:** `backend/routers/points.py` (~15 LOC change in `create_points_transaction`)

| # | Change |
|---|---|
| 1 | Add `$inc total_points_redeemed: points` on redeem |
| 2 | Skip tier recalculation on redeem (preserve `old_tier`) |
| 3 | Import `get_redemption_value_for_tier`; compute and store `redeemed_value` + `ratio_per_point` in PT row |
| 4 | Add `points_expired: False` to PT row |
| 5 | Remove `last_visit` update on redeem (redeem is not a visit) |
| 6 | Optional: warn-log on `loyalty_enabled=false` redeem |

### L4-B: Birthday Bonus Parity

**File:** `backend/core/loyalty_jobs.py` (~15 LOC change in `run_birthday_bonus`)

| # | Change |
|---|---|
| 1 | Add `loyalty_enabled` guard at top (after `birthday_bonus_enabled`) |
| 2 | Switch `$set total_points` to `$inc total_points` and add `$inc total_points_earned` |
| 3 | Add tier recompute with upgrade-only guard |
| 4 | Add `points_expired: False` to PT row |

### L4-C: Anniversary Bonus Parity

**File:** `backend/core/loyalty_jobs.py` (~15 LOC change in `run_anniversary_bonus`)

Same 4 changes as L4-B. Structurally identical.

### L4-D: Datetime Safety

**NOT NEEDED.** Analysis (section 7) shows cron code is safe.

### Total estimated scope

| Sub-phase | File | LOC change |
|---|---|---|
| L4-A | `routers/points.py` | ~15 |
| L4-B | `core/loyalty_jobs.py` | ~15 |
| L4-C | `core/loyalty_jobs.py` | ~15 |
| **Total** | **2 files** | **~45 LOC** |

---

## 10. QA Plan

### L4-A: Admin Redeem Tests

| # | Test case | Expected |
|---|---|---|
| QA-L4-1 | Admin redeem: `total_points` decremented | `total_points = before - redeemed` |
| QA-L4-2 | Admin redeem: `total_points_redeemed` incremented | `total_points_redeemed = before + redeemed` |
| QA-L4-3 | Admin redeem: PT row has `redeemed_value` and `ratio_per_point` | `redeemed_value = points * ratio` |
| QA-L4-4 | Admin redeem: tier-aware ratio (Gold customer) | `ratio_per_point` matches Gold override |
| QA-L4-5 | Admin redeem: NO tier downgrade | Gold customer redeems below threshold -> tier stays Gold |
| QA-L4-6 | Admin redeem: insufficient points -> 400 error | HTTP 400 |
| QA-L4-7 | Admin redeem: PT row has `points_expired=False` | Present |

### L4-B: Birthday Bonus Tests

| # | Test case | Expected |
|---|---|---|
| QA-L4-8 | Birthday bonus: `total_points` incremented | `total_points = before + bonus` |
| QA-L4-9 | Birthday bonus: `total_points_earned` incremented | `total_points_earned = before + bonus` |
| QA-L4-10 | Birthday bonus: tier upgrade on threshold crossing | 490 pts + 100 bonus = 590 -> Silver (was Bronze) |
| QA-L4-11 | Birthday bonus: duplicate prevention | Same year -> skipped, count=0 |
| QA-L4-12 | Birthday bonus: `loyalty_enabled=false` -> skipped | No bonus awarded |
| QA-L4-13 | Birthday bonus: `birthday_bonus_enabled=false` -> skipped | No bonus awarded |
| QA-L4-14 | Birthday bonus: PT row has `points_expired=False` | Present |

### L4-C: Anniversary Bonus Tests

| # | Test case | Expected |
|---|---|---|
| QA-L4-15 | Anniversary bonus: `total_points` incremented | Same as birthday |
| QA-L4-16 | Anniversary bonus: `total_points_earned` incremented | Same as birthday |
| QA-L4-17 | Anniversary bonus: tier upgrade on threshold crossing | Same as birthday |
| QA-L4-18 | Anniversary bonus: duplicate prevention | Same year -> skipped |
| QA-L4-19 | Anniversary bonus: `loyalty_enabled=false` -> skipped | No bonus awarded |

### Regression Smoke

| # | Test case | Expected |
|---|---|---|
| QA-L4-20 | LR: `/api/pos/loyalty/redeem` still works (1 happy path) | Same as QA-1 from LR QA |
| QA-L4-21 | LX-A: 6-key loyalty blob unchanged | Strict 6-key shape |
| QA-L4-22 | `/api/health` | HTTP 200 |
| QA-L4-23 | Admin earn path unchanged (no regression) | `total_points` incremented, tier upgraded if applicable |
| QA-L4-24 | Key relationship: `tp = tpe - expired - redeemed` | Holds after admin redeem + bonus |

**Total: ~24 test assertions.**

---

## 11. Owner Questions

### Q-L4-1: Should admin manual redeem block on `loyalty_enabled=false`?

- **Option A (Recommended):** Do NOT block. Admin is privileged. Log a warning. Admin may need to adjust points for customer complaint resolution even when loyalty program is off.
- **Option B:** Block with `LOYALTY_DISABLED` error, same as LR.

### Q-L4-2: Should birthday/anniversary bonuses count toward `total_points_earned`?

- **CRM Recommendation: YES.** `total_points_earned` is the lifetime earned counter. It should reflect ALL points a customer has ever received. This keeps the key relationship `total_points = total_points_earned - expired - redeemed` intact. Without this, the relationship breaks after any bonus award.

### Q-L4-3: Should bonuses recompute tier?

- **CRM Recommendation: YES, upgrade-only.** If bonus pushes a customer past a tier threshold, the tier should upgrade immediately. The tier should NOT downgrade (consistent with Q-LR1). This gives the customer the immediate benefit of their bonus.

### Q-L4-4: Should cron skip if `loyalty_enabled=false`?

- **CRM Recommendation: YES.** If the loyalty program is disabled, birthday/anniversary bonuses should not fire. Consistent with L2 realtime kill-switch and LF-MERGE semantics. The individual `birthday_bonus_enabled` / `anniversary_bonus_enabled` flags remain as sub-toggles, but the master `loyalty_enabled` should gate everything.

### Q-L4-5: Should admin redeem use the shared `redeem_loyalty_points` helper?

- **CRM Recommendation: NO.** The admin path has fundamentally different semantics (no order, no bill amount, no auto-cap, potentially override loyalty_enabled). Targeted inline fix of the 7 specific defects is cleaner and lower-risk.

---

## 12. Final Recommendation

**L4 is ready to implement.** All gaps are well-understood, the fixes are small and targeted, and the shared helpers from LR/LX-A are available where needed.

**Implementation should be a single bundle (L4-A + L4-B + L4-C):**
- 2 files touched (`routers/points.py`, `core/loyalty_jobs.py`)
- ~45 LOC changes
- ~24 QA assertions
- No migration, no schema changes, no frontend changes
- No POS final-payload redeem path touched
- No `/api/pos/max-redeemable` touched

**Estimated effort:** Small. Can be completed in one implementation cycle.

**Dependencies:** None on POS. The open POS blocker (POS sending `used_loyalty_point` in final payload) is unrelated to L4. Both can proceed in parallel.

---

## 13. Scope Boundaries Confirmed

| Item | In L4? |
|---|---|
| Admin/manual redeem counter parity | YES |
| Birthday bonus counter parity | YES |
| Anniversary bonus counter parity | YES |
| Datetime safety code change | NO (not needed) |
| POS final payload redemption (`/pos/orders`) | NO |
| `/api/pos/max-redeemable` | NO |
| `/api/pos/loyalty/redeem` (standalone) | NO |
| Coupon (CR-001C-C) | NO |
| Wallet (CR-001C-W) | NO |
| Migration | NO |
| L5 cleanup | NO |
| Prod deploy | NO |
| Frontend changes | NO |
| `/app/memory/final/` | UNTOUCHED |

---

## 14. Final Status

`cr001c_loyalty_l4_analysis_waiting_owner_approval`

Plan is complete. Implementation may begin once owner approves the 5 questions in section 11 (or accepts the CRM-recommended defaults). No further analysis round is required.
