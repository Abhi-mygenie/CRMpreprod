# CR-001C-L BUG-L3-001 — Implementation Report

**Bug ID:** BUG-L3-001
**Module:** CR-001C-L (Loyalty) — Phase L3, D1 (expired pre-mark)
**Date:** 2026-05-23
**Status:** **`cr001c_l_bug_l3_001_fixed_qa_passed_in_preview_awaiting_real_migration_reverify`**
**Verification report that surfaced this bug:** `/app/memory/crm/crm_1_0/qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT_R2.md`
**Owner decision authorising fix:** "Proceed with BUG-L3-001 fix only" (2026-05-23)

---

## 1. Bug Recap

During real owner-triggered migration on `Jeh's Nest` (`pos_0001_restaurant_635`) after the LF-MERGE deploy, the L3 verification matrix found **28 `points_transactions` rows older than the 6-month expiry cutoff** that were **NOT** pre-marked `points_expired=True`. Their points were being summed into customer balances even though they should have been excluded per the D1 spec.

### Root cause
`backend/routers/migration.py:340-352` (pre-fix):

```python
if expiry_months and order_date:
    try:
        od_dt = datetime.fromisoformat(
            order_date.replace("Z", "+00:00")
        )
        cutoff = datetime.now(timezone.utc) - timedelta(
            days=expiry_months * 30
        )
        if od_dt < cutoff:
            points_expired = True
            expired_at = od_dt.isoformat()
    except (ValueError, TypeError):
        pass
```

1. MyGenie returns `created_at` as a **naive** ISO string (e.g. `"2025-10-04 15:31:22"` — no `Z`, no `+00:00`).
2. `.replace("Z", "+00:00")` is a no-op for naive strings.
3. `datetime.fromisoformat(...)` returns a **naive** datetime (`tzinfo=None`).
4. `cutoff = datetime.now(timezone.utc) - timedelta(...)` is **tz-aware** (UTC).
5. `od_dt < cutoff` raises **`TypeError: can't compare offset-naive and offset-aware datetimes`**.
6. The broad `except (ValueError, TypeError): pass` silently swallows it.
7. `points_expired` stays at initial `False` → row never pre-marked.

Verified language behavior in QA-8 of the harness.

---

## 2. Fix Applied

### File touched (1, exactly as planned)

```
backend/routers/migration.py    +18 / −3
```

### Diff (semantic)

```python
if expiry_months and order_date:
    try:
        od_dt = datetime.fromisoformat(
            order_date.replace("Z", "+00:00")
        )
        # CR-001C-L BUG-L3-001 fix (2026-05-23):
        # MyGenie returns naive ISO strings (e.g.
        # "2025-10-04 15:31:22"). Comparing a naive
        # datetime with `cutoff` (tz-aware UTC) raises
        # TypeError, which was previously swallowed by
        # an over-broad except, leaving rows that should
        # have been pre-marked silently un-marked.
        # Coerce to UTC if no tzinfo, then compare.
        if od_dt.tzinfo is None:
            od_dt = od_dt.replace(tzinfo=timezone.utc)
        cutoff = datetime.now(timezone.utc) - timedelta(
            days=expiry_months * 30
        )
        if od_dt < cutoff:
            points_expired = True
            expired_at = od_dt.isoformat()
    except ValueError:
        # CR-001C-L BUG-L3-001 fix (2026-05-23):
        # narrowed from (ValueError, TypeError) so that
        # future tz/comparison bugs surface instead of
        # being silently swallowed.
        pass
```

Two semantic changes only, exactly as owner-specified:

1. **Coerce naive → UTC** before the compare (`if od_dt.tzinfo is None: od_dt = od_dt.replace(tzinfo=timezone.utc)`).
2. **Narrow the `except`** from `(ValueError, TypeError)` to `ValueError` only — future TypeErrors will surface as failed rows in the migration log instead of silently corrupting balances.

### What was NOT changed

- ❌ No change to `core.loyalty.calculate_points` or any point math.
- ❌ No change to migration flow / pagination / order upsert / customer matching.
- ❌ No change to wallet/coupon behavior.
- ❌ No change to schemas, env, supervisor, frontend, or any other backend file.
- ❌ No DB writes; existing 28 mis-marked rows on Jeh's Nest will be corrected when owner runs Revert → Sync Again (they will be re-inserted by the migration with the correct `points_expired` value).

`git diff --name-only HEAD` shows exactly the planned file scope.

---

## 3. Verification

### 3.1 Lint

`ruff check /app/backend/` → no new findings on `migration.py`. Same 4 pre-existing findings in unrelated files (`analytics.py`, `customers.py:1546`, `analytics_service.py`) — not introduced by this fix.

### 3.2 Service health

```
sudo supervisorctl restart backend  → started
curl -s http://localhost:8001/api/health → 200 {"status":"healthy", ...}
```

### 3.3 Static QA — `/tmp/cr_001c_l_bug_l3_001_static_qa.py`

**24 passed / 0 failed.** Coverage matrix:

| # | Section | Assertions | Result |
|---|---|---|---|
| QA-1 | Naive MyGenie ISO strings older than cutoff → pre-mark fires (5 historical Jeh's Nest dates) | 5 | ✅ |
| QA-2 | Naive recent timestamps within 6 months → no pre-mark (4 scenarios: 10d, 90d, 179d, today) | 4 | ✅ |
| QA-3 | Tz-aware `Z`-suffixed ISO strings work in both directions | 2 | ✅ |
| QA-4 | Boundary conditions ±10s around the 6-month cutoff | 2 | ✅ |
| QA-5 | `expiry_months=0` and `expiry_months=None` kill-switch → never pre-mark | 2 | ✅ |
| QA-6 | Defensive: `None`, `''`, `'not-a-date'` → expired=False (gated or caught as `ValueError`) | 3 | ✅ |
| QA-7 | Source-level invariants on `migration.py`: tz-coerce line present, fix marker present, `except` narrowed to `ValueError` only, compare line present | 4 | ✅ |
| QA-8 | Language sanity: naive vs tz-aware DOES raise `TypeError` (justifies the fix) | 1 | ✅ |
| QA-9 | Replay of 10 Jeh's Nest historical naive timestamps — all 10 pre-mark correctly | 1 | ✅ |
| **Total** | | **24** | **24 / 0** |

### 3.4 Regression harnesses

| Harness | Result |
|---|---|
| `/tmp/cr_001c_l_lf_merge_static_qa.py` | **37 / 37 PASS** |
| `/tmp/cr_001c_lx_a_static_qa.py` | **63 / 63 PASS** |

Both unaffected — fix surface is local to `migration.py:340-371`, disjoint from LF-MERGE (`migration.py:122`, `customers.py:120`, schemas) and LX-A (`routers/pos.py`, `core/helpers.py`, `core/loyalty.py`).

---

## 4. Expected Behavior on Next Real Migration

When owner performs **Revert Orders → Revert Customers → Sync Customers → Sync Orders** on Jeh's Nest:

| Expectation | Predicted value (based on current Jeh's Nest dataset) |
|---|---|
| `points_transactions` (`transaction_type="earn"`) rows | 98 (unchanged from R2 verification) |
| Of those 98, `points_expired=True` (older than 2025-11-24) | **~28** (currently 0) |
| Σ `customers.total_points_earned` | 753 (unchanged — earned counter is incremented regardless of expiry) |
| Σ `customers.total_points` (live balance) | **lower than 753** by the sum of the 28 expired rows' points |

The migration code at lines 382-384 already excludes `points_expired=True` rows from `total_points` via `(points_earned if not points_expired else 0)` — that branch becomes exercised once the pre-mark fires correctly.

---

## 5. Status Transitions

| Track | Before | After this fix |
|---|---|---|
| BUG-L3-001 | open (P0) | **`cr001c_l_bug_l3_001_fixed_qa_passed_in_preview_awaiting_real_migration_reverify`** |
| L3 (overall) | `cr001c_loyalty_l3_real_migration_validated_in_preview_with_bug_l3_001_open` | unchanged until owner re-runs migration. **After re-verify passes**, will advance to `cr001c_loyalty_l3_real_migration_validated_in_preview`. |
| LF-MERGE | `cr001cl_lf_merge_complete_qa_passed_in_preview` | unchanged |
| LX-A | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` | unchanged |

---

## 6. Out-of-Scope Re-confirmation

- ❌ Agent did **not** trigger migration.
- ❌ No DB writes.
- ❌ No change to `loyalty_settings` documents.
- ❌ No change to point math, customer matching, order upsert flow, wallet, coupon.
- ❌ L4 / L5 / Coupon (CR-001C-C) / Wallet (CR-001C-W) — not started.
- ❌ Prod deploy — not done.
- ❌ `/app/memory/final/` — untouched.
- ❌ Frontend — untouched.
- ❌ Existing reports (L1, L2, L3, LX-A, LF-MERGE) — unchanged.

---

## 7. Pending Owner Action

Per owner directive: **agent will not trigger migration; owner runs manually**.

1. Open Data Migration modal in the CRM UI for `Jeh's Nest`.
2. **Revert** Sync Orders.
3. **Revert** Sync Customers.
4. **Sync Customers** (Sync Again) → wait.
5. **Sync Orders** (Sync Again) → wait.
6. Notify the agent → agent will re-run the full L3 verification matrix (the R2 matrix) and confirm BUG-L3-001 is closed end-to-end on real data.

---

## 8. Sign-off

CRM agent — BUG-L3-001 fix applied surgically in preview.

- ✅ Code applied per plan (1 file, 2 semantic changes, 18/−3 lines including fix markers).
- ✅ Static QA 24/24 PASS.
- ✅ Regression LF-MERGE 37/37 + LX-A 63/63 PASS.
- ✅ Backend healthy after restart.
- ⏸ Waiting on owner to manually Revert → Sync Again, then re-verify.
