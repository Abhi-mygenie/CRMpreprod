# CR-001C-L BUG-L3-001 — QA Report

**Bug ID:** BUG-L3-001
**Module:** CR-001C-L (Loyalty) — Phase L3, D1 (expired pre-mark)
**Date:** 2026-05-23
**Status:** **`cr001c_l_bug_l3_001_fixed_qa_passed_in_preview_awaiting_real_migration_reverify`**
**Implementation report:** `/app/memory/crm/crm_1_0/implementation/CR_001C_L_BUG_L3_001_IMPLEMENTATION_REPORT.md`
**Static harness:** `/tmp/cr_001c_l_bug_l3_001_static_qa.py`
**Original discovery report:** `/app/memory/crm/crm_1_0/qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R2.md` (§3)

---

## 1. QA Overview

| Layer | Result |
|---|---|
| Lint on the 1 touched file (`migration.py`) | ✅ 0 new findings |
| Backend service health (`GET /api/health`) | ✅ HTTP 200 after restart |
| **BUG-L3-001 static QA assertions** | ✅ **24 / 24 PASS** |
| LF-MERGE regression harness | ✅ **37 / 37 PASS** |
| LX-A regression harness | ✅ **63 / 63 PASS** |
| Source-level invariants on `migration.py` | ✅ 4 / 4 (fix marker, tz-coerce line, narrowed `except`, compare preserved) |

---

## 2. Static QA Harness — Detailed Results

The harness inlines the **exact post-fix logic block** from `migration.py:340-371` as `premark_expired(order_date, expiry_months)` and exercises it through 9 sections / 24 assertions.

### QA-1 — Naive MyGenie ISO strings (real Jeh's Nest dates) older than cutoff → pre-mark

| Input order_date | Expected | Result |
|---|---|---|
| `'2025-10-04 15:31:22'` | expired=True | ✅ |
| `'2025-10-04 16:06:42'` | expired=True | ✅ |
| `'2025-10-06 14:17:02'` | expired=True | ✅ |
| `'2025-10-07 12:44:43'` | expired=True | ✅ |
| `'2025-10-21 11:08:40'` | expired=True | ✅ |

### QA-2 — Naive recent timestamps within 6 months → no pre-mark

| Input order_date (naive) | Expected | Result |
|---|---|---|
| now − 10 days | expired=False | ✅ |
| now − 90 days | expired=False | ✅ |
| now − 179 days | expired=False | ✅ |
| now (today) | expired=False | ✅ |

### QA-3 — Tz-aware (`Z`-suffix) ISO strings

| Input order_date | Expected | Result |
|---|---|---|
| (now − 200 days) ISO with `Z` | expired=True | ✅ |
| (now − 10 days) ISO with `Z` | expired=False | ✅ |

### QA-4 — Boundary conditions around the 6-month cutoff

| Input order_date | Expected | Result |
|---|---|---|
| Cutoff − 10 seconds (older) | expired=True | ✅ |
| Cutoff + 10 seconds (newer) | expired=False | ✅ |

### QA-5 — Kill-switches

| Input expiry_months | Expected | Result |
|---|---|---|
| `0` (with very old order) | expired=False | ✅ |
| `None` (with very old order) | expired=False | ✅ |

### QA-6 — Defensive cases

| Input order_date | Expected | Result |
|---|---|---|
| `None` | expired=False (gated by `if order_date`) | ✅ |
| `''` | expired=False (gated by `if order_date`) | ✅ |
| `'not-a-date'` | expired=False (caught as `ValueError`) | ✅ |

### QA-7 — Source-level invariants

| Assertion | Result |
|---|---|
| `od_dt = od_dt.replace(tzinfo=timezone.utc)` line present in `migration.py` | ✅ |
| BUG-L3-001 fix marker `CR-001C-L BUG-L3-001 fix (2026-05-23)` present | ✅ |
| `except` clause narrowed to `ValueError:` only (no `(ValueError, TypeError)`) | ✅ |
| `if od_dt < cutoff:` compare still present (compare logic preserved) | ✅ |

### QA-8 — Language sanity (justification)

| Assertion | Result |
|---|---|
| Python's naive < tz-aware comparison **does** raise `TypeError` | ✅ — confirms the bug existed in the pre-fix code and that the fix's `replace(tzinfo=timezone.utc)` is necessary |

### QA-9 — Jeh's Nest dataset replay

| Sample size | Pre-mark expected | Pre-mark observed |
|---|---|---|
| 10 historical naive timestamps from the 28 mis-marked rows | 10 should pre-mark | 10 ✅ |

### 2.10 Reproducibility

```bash
/root/.venv/bin/python /tmp/cr_001c_l_bug_l3_001_static_qa.py
# Expected tail:
#   ============================================================
#     CR-001C-L BUG-L3-001 static QA results: 24 passed, 0 failed
#   ============================================================
# Exit code: 0
```

---

## 3. Regression Validation

| Harness | Surface tested | Result |
|---|---|---|
| `cr001c_l_lf_merge_static_qa.py` | `migration.py:122` `clean_slate` source; `customers.py:120`; `schemas.py` deprecation discipline; hard-init parameterization | ✅ **37/37** |
| `cr001c_lx_a_static_qa.py` | `core/helpers.py`, `core/loyalty.py`, `routers/pos.py` strict 6-key blob | ✅ **63/63** |

Disjoint surfaces — BUG-L3-001 touches only `migration.py:340-371`. No regression observed.

---

## 4. Service Health

```bash
sudo supervisorctl restart backend
sleep 5
curl -s http://localhost:8001/api/health
# {"status":"healthy","timestamp":"2026-05-23T08:18:23.645042+00:00"}
```

Backend booted cleanly on first attempt post-fix. APScheduler started. Lifespan complete.

---

## 5. Live Pre-State Snapshot (Pre Owner Re-Sync)

Captured immediately after the fix deploy, against the existing (pre-fix-generated) Jeh's Nest data. **No mutation.** These numbers establish the diff baseline for the next verification.

| Metric | Pre-state (current DB) | Predicted post-resync |
|---|---|---|
| `customers` rows | 209 | 209 (idempotent) |
| `orders` rows | 233 | 233 (idempotent) |
| `points_transactions` rows (`transaction_type="earn"`) | 98 | 98 |
| Of those 98, `points_expired=True` | **0** | **~28** ← the fix kicks in here |
| Σ `customers.total_points_earned` | 753 | 753 (earned counter incremented regardless of expiry) |
| Σ `customers.total_points` (live balance) | 753 | **< 753** by the sum of the 28 expired rows' points |
| Tier distribution | 209 Bronze | 209 Bronze (no change expected) |

The expiry pre-mark in the current data is wrong (0 marked, 28 should have been). After Revert → Sync Again, the migration will re-create the 98 PT rows with the correct `points_expired` value, and customer `total_points` will decrease accordingly via the `(points_earned if not points_expired else 0)` branch at `migration.py:382-384`.

---

## 6. Mutation Discipline

| What | Done? |
|---|---|
| Migration triggered by agent | ❌ — owner action only |
| Any Mongo document written / updated | ❌ — pure read |
| `loyalty_settings` modified | ❌ |
| Customer / order / `points_transactions` / `wallet_transactions` modified | ❌ |
| Service env / supervisor (other than hot-reload restart for code reload) changed | ❌ |
| Frontend changed | ❌ |

---

## 7. Status Transition

| Track | Before | After |
|---|---|---|
| BUG-L3-001 | open (P0) | **`cr001c_l_bug_l3_001_fixed_qa_passed_in_preview_awaiting_real_migration_reverify`** |
| L3 | `cr001c_loyalty_l3_real_migration_validated_in_preview_with_bug_l3_001_open` | unchanged until owner re-runs migration |
| LF-MERGE | `cr001cl_lf_merge_complete_qa_passed_in_preview` | unchanged |
| LX-A | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` | unchanged |

---

## 8. Out-of-Scope Re-confirmation

- ❌ No migration triggered.
- ❌ No DB writes.
- ❌ No change to `core.loyalty` or any point-math helper.
- ❌ No change to customer matching.
- ❌ No change to wallet behavior (deferred to CR-001C-W per owner decision).
- ❌ No guest back-attribution (deferred per owner decision).
- ❌ No L4 / L5 / Coupon / Wallet work.
- ❌ No prod deploy.
- ❌ `/app/memory/final/` untouched.

---

## 9. Sign-off

CRM agent — BUG-L3-001 QA passed in preview.

**Pending owner action:**

1. Open Data Migration modal in CRM UI for `Jeh's Nest`.
2. **Revert** Sync Orders.
3. **Revert** Sync Customers.
4. **Sync Customers** (Sync Again) → wait.
5. **Sync Orders** (Sync Again) → wait.
6. Notify the agent → agent will re-run the full L3 verification matrix (R3).

Expected post-re-sync state (proves BUG-L3-001 closes on real data):
- ~28 PT rows pre-marked `points_expired=True` (currently 0).
- Σ `customers.total_points` drops below 753 by the sum of the 28 expired rows.
- All other L3 invariants from the R2 matrix continue to hold.
