# CR-001C-L — L4 Cron-Only Bonus Parity Analysis and Implementation Plan

**Module:** CR-001C-L Phase L4 (cron-only scope)
**Date:** 2026-05-24
**Status:** `cr001c_loyalty_l4_cron_only_analysis_waiting_owner_approval`
**Author:** CRM Team
**Prerequisite:** L1 ✅, L2 ✅, L3 ✅, LX-A ✅, LF-MERGE ✅, LR ✅, LR Correction ✅ (52/52)

---

## 1. Executive Summary

L4 (cron-only) addresses **counter parity and correctness gaps** in the two automated bonus jobs:

1. **Birthday bonus cron** (`core/loyalty_jobs.py::run_birthday_bonus`) — 4 gaps.
2. **Anniversary bonus cron** (`core/loyalty_jobs.py::run_anniversary_bonus`) — same 4 gaps.

**Parked to a later sprint (owner decision 2026-05-24):**
- Admin/manual redeem path (`routers/points.py`) — all 7 defects documented in the prior L4 analysis remain open but are explicitly out of this sprint.

**Scope:** ~30 LOC changes in 1 file (`core/loyalty_jobs.py`), ~17 QA assertions. No POS paths, migration, frontend, or admin redeem touched.

---

## 2. Owner Scope Decision (2026-05-24)

| Item | Decision |
|---|---|
| Birthday bonus cron parity | **IN SCOPE** — this sprint |
| Anniversary bonus cron parity | **IN SCOPE** — this sprint |
| Datetime safety in `core/loyalty_jobs.py` | **IN SCOPE** — analyze, fix only if needed |
| Admin/manual redeem (`routers/points.py`) | **PARKED** — later sprint |
| Manual redeem `total_points_redeemed` parity | **PARKED** |
| Manual redeem tier-aware helper adoption | **PARKED** |
| Manual redeem idempotency | **PARKED** |
| Any admin/manual points operations | **PARKED** |

---

## 3. Inputs Reviewed

| # | Document | Status |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Read |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | Read |
| 3 | `implementation/CR_001C_LR_CORRECTION_IMPLEMENTATION_REPORT.md` | Read |
| 4 | `qa/CR_001C_LR_CORRECTION_QA_REPORT.md` | Read |
| 5 | `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R3.md` | Read |
| 6 | `qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R689.md` | Read |
| 7 | `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md` | Read |
| 8 | Prior L4 full-scope analysis (now superseded by this cron-only plan) | Read |

| # | Code file | Inspected |
|---|---|---|
| 1 | `backend/core/loyalty_jobs.py` (340 lines) | Full read |
| 2 | `backend/core/loyalty.py` (489 lines) | Full read |
| 3 | `backend/core/helpers.py` (484 lines) | Full read |
| 4 | `backend/core/scheduler.py` (122 lines) | Full read |
| 5 | `backend/routers/points.py` (303 lines) | Read — confirmed PARKED, no changes |

---

## 4. Current L4 Cron Code Audit

| Area | Current Behavior | Gap | Risk | Recommended Fix |
|---|---|---|---|---|
| **Birthday: `total_points_earned`** | NOT incremented. Only `$set total_points`. | Counter drift. `tpe` never reflects bonus points. Key relationship `tp = tpe - expired - redeemed` breaks. | HIGH | L4-B: `$inc total_points_earned` alongside `total_points`. |
| **Birthday: tier recompute** | NOT done after bonus. | Customer could cross tier threshold (e.g., 490->590 pts, Silver at 500) but stay Bronze until next order. | MEDIUM — delayed tier upgrade. | L4-B: Recompute and `$set tier` if upgraded (NOT downgraded). |
| **Birthday: `loyalty_enabled` check** | NOT checked. Only `birthday_bonus_enabled` is checked. | Bonus fires even when loyalty program is disabled. | LOW-MEDIUM — owner might disable loyalty but birthday bonus still fires. | L4-B: Add `loyalty_enabled` guard. |
| **Birthday: `$set` vs `$inc` atomicity** | Uses read-then-`$set` pattern: `new_points = current + bonus; $set total_points = new_points`. | Non-atomic. Concurrent bonus + POS order could lose one update. | LOW — cron runs at midnight, unlikely concurrent. But correctness gap. | L4-B: Use `$inc` for `total_points` and `total_points_earned`. |
| **Anniversary: `total_points_earned`** | NOT incremented. Same gap as birthday. | Same counter drift. | HIGH | L4-C: Same fix as birthday. |
| **Anniversary: tier recompute** | NOT done. Same gap. | Same delayed tier upgrade. | MEDIUM | L4-C: Same fix. |
| **Anniversary: `loyalty_enabled` check** | NOT checked. Same gap. | Same inconsistency. | LOW-MEDIUM | L4-C: Same fix. |
| **Anniversary: `$set` vs `$inc`** | Same read-then-`$set` pattern. | Same non-atomic risk. | LOW | L4-C: Same fix. |

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
- Handles leap-year DOB (Feb 29 -> Feb 28 fallback).

**Gaps:**

| # | Gap | Current | Expected | Severity |
|---|---|---|---|---|
| 1 | `total_points_earned` | NOT incremented | Should `$inc` by `bonus_points` | HIGH |
| 2 | Tier recompute | NOT done | `calculate_tier(new_points, settings)` + `$set tier` if upgraded only | MEDIUM |
| 3 | `loyalty_enabled` | NOT checked | Skip bonus if `loyalty_enabled=false` | LOW-MEDIUM |
| 4 | `$set` vs `$inc` | `$set total_points = current + bonus` (read-then-set) | `$inc total_points` by `bonus_points` (atomic) | LOW |

### 5.2 Customer update — current vs proposed

**Current (lines 58-61):**
```python
await db.customers.update_one(
    {"id": customer["id"]},
    {"$set": {"total_points": new_points, "last_birthday_bonus_year": current_year}}
)
```

**Proposed (L4-B):**
```python
old_tier = customer.get("tier", "Bronze")
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

Note: `balance_after` in the PT row must still be computed as `current_points + bonus_points` for the row to be accurate. This uses the read value, which is acceptable since the cron processes customers sequentially and runs at midnight with low concurrency risk.

### 5.3 PT row — proposed addition

Add `"points_expired": False` for consistency with LR-grade rows:

```python
tx_doc = {
    ...,  # existing fields unchanged
    "points_expired": False,  # NEW
    "created_at": datetime.now(timezone.utc).isoformat()
}
```

### 5.4 `loyalty_enabled` guard — proposed

Insert after existing `birthday_bonus_enabled` check (line 20-21):

```python
if not settings.get("birthday_bonus_enabled", False):
    return {...}
# NEW: master loyalty kill-switch
if not settings.get("loyalty_enabled", False):
    return {"customers_awarded": 0, "total_points_awarded": 0, "awarded_customers": []}
```

### 5.5 `_tier_rank` helper

Needed for upgrade-only guard. Options:
- **Option A:** Inline a simple rank dict in `loyalty_jobs.py` (4 lines, self-contained).
- **Option B:** Import from `routers/points.py` (creates cross-dependency between router and core module — undesirable).
- **Option C:** Move `_tier_rank` to `core/loyalty.py` as a shared utility.

**Recommendation: Option A** (inline). It's a trivial 4-line function. Keeping it local avoids import churn. If L5 needs it shared, refactor then.

```python
def _tier_rank(tier: str) -> int:
    return {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}.get(tier, 0)
```

---

## 6. Anniversary Bonus Analysis

### 6.1 Current code: `core/loyalty_jobs.py::run_anniversary_bonus` (lines 101-183)

**Structurally identical to birthday bonus.** Same 4 gaps, same fixes:

| # | Gap | Severity | Fix |
|---|---|---|---|
| 1 | `total_points_earned` not incremented | HIGH | `$inc total_points_earned` |
| 2 | Tier not recomputed | MEDIUM | `calculate_tier` + upgrade-only `$set tier` |
| 3 | `loyalty_enabled` not checked | LOW-MEDIUM | Guard at top |
| 4 | `$set` vs `$inc` for `total_points` | LOW | Switch to `$inc` |

### 6.2 Duplicate prevention

Uses `last_anniversary_bonus_year == current_year`. Working correctly. No change needed.

---

## 7. Datetime Safety Findings

### 7.1 Cron birthday matching (`loyalty_jobs.py:40-52`)

```python
dob = datetime.strptime(dob_str[:10], "%Y-%m-%d").date()   # date object (no tz)
today = datetime.now(timezone.utc).date()                    # date object (no tz)
birthday_this_year = dob.replace(year=current_year)          # date object
window_start = birthday_this_year - timedelta(days=...)      # date object
window_end = birthday_this_year + timedelta(days=...)        # date object
if window_start <= today <= window_end:                      # date vs date
```

**Verdict: SAFE.** All comparisons are between `date` objects. No `datetime` naive-vs-aware risk. BUG-L3-001 pattern cannot recur.

### 7.2 Cron anniversary matching (`loyalty_jobs.py:124-137`)

```python
anniversary = datetime.strptime(anniversary_str[:10], "%Y-%m-%d").date()  # date object
today = datetime.now(timezone.utc).date()                                  # date object
anniversary_this_year = anniversary.replace(year=current_year)             # date object
if window_start <= today <= window_end:                                    # date vs date
```

**Verdict: SAFE.** Same pattern as birthday. All `date` objects.

### 7.3 `datetime.now(timezone.utc)` usage in `loyalty_jobs.py`

All `datetime.now()` calls in the file use `timezone.utc`:
- Line 26: `today = datetime.now(timezone.utc).date()` — birthday
- Line 71: `datetime.now(timezone.utc).isoformat()` — PT row `created_at`
- Line 111: `today = datetime.now(timezone.utc).date()` — anniversary
- Line 156: `datetime.now(timezone.utc).isoformat()` — PT row `created_at`
- Line 196: `now = datetime.now(timezone.utc)` — expiry reminders
- Line 272: `now = datetime.now(timezone.utc)` — expiry

No `datetime.utcnow()` usage. All timezone-aware.

### 7.4 helpers.py birthday/anniversary (informational — NOT in L4 scope)

`check_birthday_bonus` and `check_anniversary_bonus` in `helpers.py` have a latent naive-vs-aware bug (documented in prior analysis). These functions are NOT called by the cron jobs — the cron uses `run_birthday_bonus` / `run_anniversary_bonus` from `loyalty_jobs.py`. The helpers.py versions are legacy and do not affect L4.

### 7.5 Expiry string comparison (informational — NOT in L4 scope)

`run_points_expiry` uses string `$lt` comparison on `created_at`. Fragile but practically correct. Not in L4 cron-bonus scope. Deferred to L5.

### 7.6 Summary

| Area | Risk | Action in L4 |
|---|---|---|
| Cron birthday matching | **SAFE** | None needed |
| Cron anniversary matching | **SAFE** | None needed |
| `datetime.now()` calls | All use `timezone.utc` | None needed |
| helpers.py birthday/anniversary | Latent bug, NOT used by cron | Document only |
| Expiry string comparison | Fragile, NOT in L4 scope | Defer to L5 |

**No datetime safety code change required for L4.**

---

## 8. Shared Helper Reuse Plan

| Helper | Used by L4? | How |
|---|---|---|
| `calculate_tier(...)` | **YES** (L4-B, L4-C) | Recompute tier after bonus. Already imported in `loyalty_jobs.py` line 12. |
| `_tier_rank(...)` | **YES** (L4-B, L4-C) | Upgrade-only guard. Inlined in `loyalty_jobs.py` (~4 lines). |
| `redeem_loyalty_points(...)` | NO | Not relevant — no redeem in this sprint. |
| `get_redemption_value_for_tier(...)` | NO | Not relevant — no redeem in this sprint. |

---

## 9. Recommended L4 Implementation Scope

### L4-B: Birthday Bonus Parity

**File:** `backend/core/loyalty_jobs.py` (~15 LOC change in `run_birthday_bonus`)

| # | Change | Detail |
|---|---|---|
| 1 | Add `loyalty_enabled` guard | After `birthday_bonus_enabled` check, return early if `loyalty_enabled=false` |
| 2 | Switch to `$inc` for `total_points` | Replace `$set total_points = new_points` with `$inc total_points = bonus_points` |
| 3 | Add `$inc total_points_earned` | In the same `$inc` block |
| 4 | Add tier recompute (upgrade-only) | Compute `new_tier = calculate_tier(new_points, settings)`, only `$set tier` if rank increased |
| 5 | Add `points_expired: False` to PT row | One field addition |

### L4-C: Anniversary Bonus Parity

**File:** `backend/core/loyalty_jobs.py` (~15 LOC change in `run_anniversary_bonus`)

Same 5 changes as L4-B. Structurally identical.

### Supporting: `_tier_rank` inline helper

**File:** `backend/core/loyalty_jobs.py` (+4 LOC at module level)

```python
def _tier_rank(tier: str) -> int:
    return {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}.get(tier, 0)
```

### Total estimated scope

| Sub-phase | File | LOC change |
|---|---|---|
| `_tier_rank` helper | `core/loyalty_jobs.py` | +4 |
| L4-B (birthday) | `core/loyalty_jobs.py` | ~15 |
| L4-C (anniversary) | `core/loyalty_jobs.py` | ~15 |
| **Total** | **1 file** | **~34 LOC** |

---

## 10. QA Plan

### L4-B: Birthday Bonus Tests

| # | Test case | Expected |
|---|---|---|
| QA-L4-1 | Birthday bonus: `total_points` incremented | `total_points = before + bonus` |
| QA-L4-2 | Birthday bonus: `total_points_earned` incremented | `total_points_earned = before + bonus` |
| QA-L4-3 | Birthday bonus: tier upgrade on threshold crossing | 490 pts + 100 bonus = 590 -> Silver (was Bronze) |
| QA-L4-4 | Birthday bonus: NO tier downgrade (bonus cannot cause downgrade) | Tier stays same or upgrades only |
| QA-L4-5 | Birthday bonus: duplicate prevention (same year) | Second run -> skipped, `customers_awarded=0` |
| QA-L4-6 | Birthday bonus: `loyalty_enabled=false` -> skipped | Returns `customers_awarded=0` |
| QA-L4-7 | Birthday bonus: `birthday_bonus_enabled=false` -> skipped | Returns `customers_awarded=0` |
| QA-L4-8 | Birthday bonus: PT row has `points_expired=False` | Field present and `False` |
| QA-L4-9 | Birthday bonus: PT row `balance_after` correct | `balance_after = before + bonus` |

### L4-C: Anniversary Bonus Tests

| # | Test case | Expected |
|---|---|---|
| QA-L4-10 | Anniversary bonus: `total_points` incremented | `total_points = before + bonus` |
| QA-L4-11 | Anniversary bonus: `total_points_earned` incremented | `total_points_earned = before + bonus` |
| QA-L4-12 | Anniversary bonus: tier upgrade on threshold crossing | Same as birthday |
| QA-L4-13 | Anniversary bonus: duplicate prevention (same year) | Second run -> skipped |
| QA-L4-14 | Anniversary bonus: `loyalty_enabled=false` -> skipped | Returns `customers_awarded=0` |

### Regression Smoke

| # | Test case | Expected |
|---|---|---|
| QA-L4-15 | LR: `/api/pos/loyalty/redeem` happy path (1 assertion) | Unchanged behavior |
| QA-L4-16 | LX-A: 6-key loyalty blob unchanged | Strict 6-key shape |
| QA-L4-17 | `/api/health` | HTTP 200 |

**Total: 17 test assertions.**

---

## 11. Owner Questions (revised for cron-only scope)

### Q-L4-2: Should birthday/anniversary bonuses count toward `total_points_earned`?

- **Option A (Recommended):** YES. Keeps `total_points = total_points_earned - expired - redeemed` intact.
- **Option B:** NO. Only order-based earning counts.

### Q-L4-3: Should bonuses recompute tier?

- **Option A (Recommended):** YES, upgrade-only. Bonus pushes past threshold -> tier upgrades immediately. Never downgrades.
- **Option B:** NO. Tier only changes on POS orders.

### Q-L4-4: Should cron skip when `loyalty_enabled=false`?

- **Option A (Recommended):** YES. Master kill-switch gates everything. Individual `birthday_bonus_enabled` / `anniversary_bonus_enabled` remain as sub-toggles.
- **Option B:** NO. Bonuses fire independently of `loyalty_enabled`.

(Q-L4-1 and Q-L4-5 from prior plan are removed — they concerned admin redeem, now parked.)

---

## 12. Parked Items (Later Sprint)

| Item | Original L4 ref | Status |
|---|---|---|
| Admin/manual redeem `total_points_redeemed` parity | L4-A #1 | PARKED |
| Admin redeem tier-aware ratio + `redeemed_value` in PT row | L4-A #3 | PARKED |
| Admin redeem NO tier downgrade (Q-LR1) | L4-A #2 | PARKED |
| Admin redeem `loyalty_enabled` behavior | L4-A #6, Q-L4-1 | PARKED |
| Admin redeem idempotency | L4-A #5 | PARKED |
| Admin redeem shared-helper decision | Q-L4-5 | PARKED |
| Admin redeem `last_visit` cleanup | L4-A #5 | PARKED |
| Admin redeem `points_expired` on PT row | L4-A #4 | PARKED |

All 7 admin-redeem defects are fully documented in the prior L4 analysis (`CR_001C_L_LOYALTY_L4_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` section 4). They can be picked up in a future sprint without re-analysis.

---

## 13. Scope Boundaries Confirmed

| Item | In this L4 sprint? |
|---|---|
| Birthday bonus cron parity | **YES** |
| Anniversary bonus cron parity | **YES** |
| Datetime safety audit in `loyalty_jobs.py` | **YES** (analyzed — no fix needed) |
| Admin/manual redeem (`routers/points.py`) | **NO — PARKED** |
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

## 14. Final Recommendation

**L4 cron-only is ready to implement.** Scope is tight:
- **1 file** touched (`core/loyalty_jobs.py`)
- **~34 LOC** changes
- **17 QA assertions**
- No admin paths, no POS paths, no migration, no frontend

Implementation can begin once owner approves the 3 remaining questions (Q-L4-2, Q-L4-3, Q-L4-4) or accepts the CRM-recommended defaults.

---

## 15. Final Status

`cr001c_loyalty_l4_cron_only_analysis_waiting_owner_approval`

Plan is complete. Implementation may begin against this scope once owner confirms. No further analysis round required.
