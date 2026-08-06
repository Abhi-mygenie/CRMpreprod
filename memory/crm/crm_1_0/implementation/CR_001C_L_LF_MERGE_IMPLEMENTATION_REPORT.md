# CR-001C-L LF-MERGE — Loyalty Flag Merge: Implementation Plan & Report

**Module:** CR-001C-L (Loyalty) — surgical follow-up to L3
**Date:** 2026-05-23
**Status:** **`cr001cl_lf_merge_complete_qa_passed_in_preview`**
**Trigger:** Real owner-triggered migration on `Jeh's Nest` (`pos_0001_restaurant_635`) produced 0 loyalty points because the hidden `loyalty_clean_slate_recalc` flag was `false` even though the visible "Loyalty Program" toggle was `ON`.
**Owner decision:** Option 3 (merge the two flags) — *"3 loyalty_enabled=true this is flag which is used merge them to this one"*.

---

## 1. Problem Statement

Two independent flags existed on `loyalty_settings`, with subtly different roles:

| Flag | Drove | UI? |
|---|---|---|
| `loyalty_enabled` | Realtime POS earning (L2 kill-switch) | ✅ Visible (`Loyalty Settings → Loyalty Program ON`) |
| `loyalty_clean_slate_recalc` | Migration clean-slate recompute (L3) | ❌ Hidden — no admin UI |

When the owner toggled "Loyalty Program ON" on `Jeh's Nest` and ran migration from the CRM UI:
- Realtime POS earning was correctly enabled.
- Migration silently used the **legacy** path because `loyalty_clean_slate_recalc` defaulted to `false` and there was no UI to flip it.
- Result: 209 customers + 233 orders synced, but every customer's `total_points = 0` and every order's `points_earned = 0` (verified in
  `/app/memory/crm/crm_1_0/qa/CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT.md`).

The owner cannot reasonably be expected to know about a hidden flag they can't see.

---

## 2. Decision

**Merge the two flags.** `loyalty_enabled` is now the single source of truth for both:
- Realtime POS earning (unchanged from L2).
- Migration clean-slate recompute (new behavior — previously gated on the hidden flag).

`loyalty_clean_slate_recalc` is **deprecated**: still present on the schema for backward compatibility with existing Mongo docs and PATCH payloads, but **no code path reads it anymore**. Safe to delete in L5.

### Rationale
- One flag = one mental model for the owner. "Loyalty Program ON" means loyalty works everywhere — realtime AND on historical data brought in via migration.
- No new UI surface required — the existing Loyalty Program toggle covers it.
- Backward compatible — restaurants with stale `loyalty_clean_slate_recalc: true` won't accidentally trip a different behavior because the field is no longer read.

### Out-of-scope (intentional)
- ❌ No removal of `loyalty_clean_slate_recalc` field from the schema (defer to L5 dead-code pass).
- ❌ No `PATCH /api/loyalty-settings` contract change.
- ❌ No frontend change — the existing toggle already POSTs `loyalty_enabled`.
- ❌ No L4, L5, Coupon, Wallet work.
- ❌ No prod deploy, no migration triggered, no `/app/memory/final/` touched.

---

## 3. Files Changed (exactly 3)

```
backend/routers/migration.py    +12 / −2     (read-site swap + comment refresh)
backend/routers/customers.py    +12 / −2     (read-site swap + comment refresh)
backend/models/schemas.py        +8 / −5     (DEPRECATED comments on the legacy field)
```

Verified via `git diff --name-only HEAD` — only these 3 files modified for the merge.

### 3.1 `backend/routers/migration.py`

Replaced (line 123 area):

```python
clean_slate = bool(loyalty_settings.get("loyalty_clean_slate_recalc", False))
loyalty_enabled_flag = bool(loyalty_settings.get("loyalty_enabled", False))
```

with:

```python
loyalty_enabled_flag = bool(loyalty_settings.get("loyalty_enabled", False))
# CR-001C-L LF-MERGE (2026-05-23): clean_slate now derives from loyalty_enabled.
clean_slate = loyalty_enabled_flag
```

Comment block above the read also rewritten to document the LF-MERGE.

### 3.2 `backend/routers/customers.py`

Replaced (line 120 area):

```python
clean_slate = bool(loyalty_settings_doc.get("loyalty_clean_slate_recalc", False))
```

with:

```python
# CR-001C-L LF-MERGE (2026-05-23): clean_slate now derives from loyalty_enabled.
clean_slate = bool(loyalty_settings_doc.get("loyalty_enabled", False))
```

Comment block above the read also rewritten.

### 3.3 `backend/models/schemas.py`

Both occurrences of `loyalty_clean_slate_recalc` (on `LoyaltySettings` and `LoyaltySettingsUpdate`) marked **DEPRECATED 2026-05-23 (CR-001C-L LF-MERGE)**. Field defaults preserved (`bool = False` on `LoyaltySettings`, `Optional[bool] = None` on `LoyaltySettingsUpdate`) so existing Mongo docs continue to validate and existing PATCH callers don't break.

### 3.4 Downstream `clean_slate` consumers — unchanged

All downstream branches (`if clean_slate:`, `if not clean_slate:`, `0 if clean_slate else mygenie_customer.get(...)`) still use the local `clean_slate` boolean. The merge changes only its **source**, not its **plumbing**. No behavior regression in:
- `customers.py` customer-doc hard-init (lines 226–232)
- `customers.py` existing-customer allow-list `$set` branch (line 319)
- `customers.py` non-clean-slate dedup guard (line 367)
- `migration.py` per-order points-recompute branch (line 324)
- `migration.py` D1 expired pre-mark (line 433)
- `migration.py` re-sync dedup guard (line 452)

---

## 4. Verification

### 4.1 Lint

`ruff check /app/backend/` → no new findings in the 3 touched files.
(4 pre-existing findings remain in unrelated files; line numbers shifted ±5–7 lines due to comment expansion — same warnings, same root cause.)

### 4.2 Service health

```
sudo supervisorctl restart backend  → started
curl -s http://localhost:8001/api/health → 200 {"status":"healthy", ...}
```

### 4.3 Static QA — `/tmp/cr_001c_l_lf_merge_static_qa.py`

**37 passed / 0 failed.** Coverage matrix:

| # | Section | Assertions | Result |
|---|---|---|---|
| QA-1 | `migration.py`: `clean_slate` sourced from `loyalty_enabled`, hidden flag not read, LF-MERGE marker present, downstream branches preserved | 5 | ✅ |
| QA-2 | `customers.py`: same merge applied, hard-init expression intact, existing-customer guard intact | 5 | ✅ |
| QA-3 | `schemas.py`: DEPRECATED marker present, legacy field still defined (backward compat), `loyalty_enabled` default unchanged | 4 | ✅ |
| QA-4a | `loyalty_enabled=true` → clean_slate True → all 7 customer-init fields hard-init to zero | 7 | ✅ |
| QA-4b | `loyalty_enabled=false` → clean_slate False → all 7 fields trust MyGenie payload | 7 | ✅ |
| QA-5 | `loyalty_clean_slate_recalc` is IGNORED across 6 settings-doc combinations (legacy flag true, master toggle false; master toggle absent; settings None; etc.) | 6 | ✅ |
| QA-6 | Pydantic round-trip: `LoyaltySettingsUpdate(loyalty_clean_slate_recalc=True)` still parses; `LoyaltySettings` defaults unchanged | 3 | ✅ |
| **Total** | | **37** | **37 / 0** |

### 4.4 LX-A regression — `/tmp/cr_001c_lx_a_static_qa.py`

**63 passed / 0 failed.** LX-A read-side contract unaffected (LX-A touches `core/helpers.py`, `core/loyalty.py`, and `routers/pos.py`; LF-MERGE touches `routers/migration.py`, `routers/customers.py`, and `models/schemas.py` — disjoint surfaces).

### 4.5 Live derivation check on `Jeh's Nest`

```
Jeh's Nest (pos_0001_restaurant_635):
  loyalty_enabled            : True
  loyalty_clean_slate_recalc : False   ← now IGNORED
  derived clean_slate        : True    ← would drive next migration
```

✅ Confirms that the next owner-triggered migration on `Jeh's Nest` will run in clean-slate mode automatically.

---

## 5. What Owner Should Do Next (to validate L3 end-to-end on real data)

> Agent will NOT trigger migration. Owner runs from the CRM UI.

1. **In the Data Migration modal** (the one in the screenshot at 12.44 PM), click **Revert** on `Sync Orders` first.
2. After orders revert succeeds, click **Revert** on `Sync Customers`.
3. Click **Sync Again** on `Sync Customers`, wait for it to complete.
4. Click **Sync Again** on `Sync Orders`, wait for it to complete.
5. Notify the agent → agent will re-run the full L3 verification matrix (same one used in
   `CR_001C_L_LOYALTY_L3_REAL_MIGRATION_VERIFICATION_REPORT.md`) and now expect:

| Expectation after clean-slate re-run | Approximate number |
|---|---|
| `points_transactions` rows created | ≈ 200–233 (one per qualifying order) |
| Σ `customers.total_points_earned` across 209 customers | ≈ ₹30,838 × 5% = **~1,540 points** at Bronze; could be higher if any customer crosses tier mid-recompute |
| Customers upgraded out of Bronze | A handful (anyone whose `total_points` crosses 500 / 1,500 / 5,000) |
| Per-order `orders.points_earned` | ₹2,000 × Bronze 5% = 100; ₹1,000 → 50; ₹700 → 35; etc. |
| PT `created_at` matches `order.order_created_at` | ✅ |
| PT rows older than `points_expiry_months` pre-marked `points_expired=True` | None today (all 233 orders ≤ 6 months); D1 path still proves out via the no-PT-row-pre-marked-incorrectly assertion |

After that re-verification passes, **L3 fully closes**:
- `cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending` →
- `cr001c_loyalty_l3_real_migration_validated_in_preview`

---

## 6. Risk Assessment

| # | Risk | Mitigation | Coverage |
|---|---|---|---|
| R-1 | A restaurant with stale `loyalty_clean_slate_recalc=true` and `loyalty_enabled=false` re-runs migration → previously clean-slate, now legacy | LF-MERGE QA-5 explicitly proves the legacy flag is ignored in all 6 combinations. **This is the intended behavior.** Owner is in control via the only flag that matters now. | QA-5 (6 cases) |
| R-2 | Existing PATCH callers send `loyalty_clean_slate_recalc=true` and expect it to take effect | Field still accepted on Update model (no 422). Value lands on Mongo doc but is no longer read. Behavior change documented for any external caller. | QA-6 |
| R-3 | Restaurants with `loyalty_enabled=true` AND historical data already migrated under the legacy path → re-running Sync from UI will hard-init wallet/coupon counters to zero too (per `customers.py:226-232`) | Owner needs to be aware: clicking **Revert → Sync Again** with `loyalty_enabled=true` clears wallet balances and coupon counters as part of the clean-slate. This matches the original L3 design. If the owner wants to preserve wallet balances mid-migration, that's a separate change (out of LF-MERGE scope). | Out-of-scope; flagged for owner awareness in §5 |
| R-4 | LX-A regression | LX-A static QA re-ran: 63/63 PASS. Surface is disjoint (`routers/pos.py` vs `routers/migration.py`+`routers/customers.py`). | §4.4 |
| R-5 | Backend boot regression | Backend restarted cleanly; `/api/health` 200; APScheduler started. | §4.2 |

---

## 7. Status Transitions

| Track | Before | After |
|---|---|---|
| LF-MERGE | (not started) | **`cr001cl_lf_merge_complete_qa_passed_in_preview`** |
| L3 | `cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending` | **unchanged** (real-data validation still pending; LF-MERGE just unblocks it via the UI) |
| LX-A | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` | **unchanged** (LX-A not touched) |

---

## 8. Out-of-Scope Re-confirmation

- ❌ No migration triggered by agent.
- ❌ No DB documents mutated.
- ❌ No env / supervisor (other than the standard hot-reload restart) / dependency changes.
- ❌ No frontend changes.
- ❌ No L4 / L5 work.
- ❌ No Coupon (CR-001C-C) / Wallet (CR-001C-W) / Visibility (CR-001C-V) work.
- ❌ No `/app/memory/final/` writes.
- ❌ No prod deploy.
- ❌ Existing L1/L2/L3/LX-A reports unchanged.

---

## 9. Sign-off

CRM agent — LF-MERGE complete in preview.
- ✅ Code applied per plan §3 (3 files).
- ✅ Static QA 37/37, LX-A regression 63/63, backend healthy.
- ✅ Live derivation check confirms `Jeh's Nest` will run clean-slate on next Sync.
- ⏸ Real-data L3 validation pending owner Revert → Sync Again from the CRM UI (per §5).

Awaiting owner action on the migration modal.
