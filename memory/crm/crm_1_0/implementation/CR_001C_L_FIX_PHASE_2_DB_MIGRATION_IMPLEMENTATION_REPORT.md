# CR-001C-L-FIX Phase 2 — Live DB Migration Implementation Report

**Status:** `cr001c_l_fix_phase_2_db_migration_complete`
**Date:** 2026-05-26
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_L_FIX_CONSOLIDATED_LOYALTY_CLOSURE_PLAN.md` §3 Phase 2
**Branch:** `27-may` (working in `/app`)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`

---

## 1. Summary

Phase 2 of CR-001C-L-FIX executed: one-shot migration script bulk-applied CR-004 defaults to all 11 existing `loyalty_settings` docs and reset R689's anomalous earn percents. Pre-backup saved. Script is idempotent (second run modifies 0 docs).

**Defects closed by this phase:** D1 (11 restaurants on pre-CR-004 values), D14 (R689 bronze=50, silver=69).

---

## 2. What Changed

### New file: `backend/scripts/cr004_fix_bulk_apply.py`

One-shot migration script with:
- **Pre-backup** to `/tmp/loyalty_settings_pre_cr004fix_backup.json` (11 docs, 15KB)
- **Bulk update** of 5 CR-004 fields on all 11 restaurants (Q1=B)
- **R689 earn-% reset** to schema defaults (Q2=B)
- **Post-verification** — all 11 docs checked against expected values
- **Idempotency check** — second run confirms 0 modifications
- **Restore mode** — `--restore <path>` for emergency rollback

### DB mutations applied

#### All 11 restaurants — CR-004 fields

| Field | Before | After |
|---|---|---|
| `min_order_value` | 100.0 | **0** |
| `redemption_value` | 0.25 (10 restaurants) / 1.0 (R523) | **1.0** |
| `max_redemption_percent` | 50.0 | **100.0** |
| `max_redemption_amount` | 500.0 | **None** (no limit) |
| `min_redemption_points` | 100 (10 restaurants) / 50 (R523) | **50** |

#### R689 specifically — earn-% reset

| Field | Before | After |
|---|---|---|
| `bronze_earn_percent` | 50.0 | **5.0** |
| `silver_earn_percent` | 69.0 | **7.0** |
| `gold_earn_percent` | 10.0 | **10.0** (unchanged) |
| `platinum_earn_percent` | 15.0 | **15.0** (unchanged) |

---

## 3. Execution Evidence

```
[BACKUP] 11 docs saved to /tmp/loyalty_settings_pre_cr004fix_backup.json
[CR-004] Matched 11, modified 11 restaurants
[R689] Earn percents reset to schema defaults (bronze=5, silver=7, gold=10, platinum=15)
[VERIFY] All 11 docs pass CR-004 + R689 checks
[CR-004] Matched 11, modified 0 restaurants
[R689] No change (already at defaults or user_id not found)
[IDEMPOTENCY] PASS — script is idempotent

=== MIGRATION COMPLETE ===
  Backup: /tmp/loyalty_settings_pre_cr004fix_backup.json
  CR-004 applied: 11 restaurants
  R689 reset: yes
  Verification: PASS
```

---

## 4. Acceptance Criteria (Phase 2)

| # | Criterion | Result |
|---|---|---|
| A1 | All 11 docs show `min_order_value=0` | **PASS** |
| A2 | All 11 docs show `redemption_value=1.0` | **PASS** |
| A3 | All 11 docs show `max_redemption_percent=100.0` | **PASS** |
| A4 | All 11 docs show `max_redemption_amount=None` | **PASS** |
| A5 | All 11 docs show `min_redemption_points=50` | **PASS** |
| A6 | R689 `bronze_earn_percent=5.0` | **PASS** |
| A7 | R689 `silver_earn_percent=7.0` | **PASS** |
| A8 | Pre-backup exists at `/tmp/loyalty_settings_pre_cr004fix_backup.json` | **PASS** (15KB, 11 docs) |
| A9 | Script idempotent (second run modifies 0) | **PASS** |
| A10 | Backend healthy `/api/health` 200 | **PASS** |

---

## 5. Files Created

| File | Type | LOC |
|---|---|---|
| `backend/scripts/cr004_fix_bulk_apply.py` | N | ~120 |

No backend code modified. No env change. No dependency change.

---

## 6. Rollback

```bash
cd /app/backend && python3 scripts/cr004_fix_bulk_apply.py --restore /tmp/loyalty_settings_pre_cr004fix_backup.json
```

Restores all 11 docs to their exact pre-migration state.

---

## 7. Cumulative Phase Status

| Phase | Status | Defects Closed |
|---|---|---|
| Phase 1 — Backend default alignment | **COMPLETE** | D2, D3, D4 |
| **Phase 2 — Live DB migration** | **COMPLETE** | **D1, D14** |
| Phase 3 — Frontend input bug fix | Pending | D5, D6, D7, D8 |
| Phase 4 — Label fix + per-tier UI + disabled badge | Pending | D9, D12, D13 |
| Phase 5 — Unhide buttons | Pending | D10, D11 |
| Phase 6 — QA + report | Pending | — |

**Defects closed so far: 7/14** (D1, D2, D3, D4, D14 + the 3 D4 sub-sites).

---

## 8. Next Phase

**Phase 5 — Unhide Redeem + Use Wallet buttons** (per plan §9 risk-optimal order: Phase 5 before Phase 3). Estimated ~10 min.

---

## 9. Tracker

```
cr001c_l_fix_phase_2_db_migration_complete
```
