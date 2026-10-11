# CR-001C-L LF-MERGE — QA Report

**Module:** CR-001C-L (Loyalty) — Loyalty Flag Merge follow-up to L3
**Date:** 2026-05-23
**Status:** **`cr001cl_lf_merge_complete_qa_passed_in_preview`**
**Implementation report:** `/app/memory/crm/crm_1_0/implementation/CR_001C_L_LF_MERGE_IMPLEMENTATION_REPORT.md`
**Static harness:** `/tmp/cr_001c_l_lf_merge_static_qa.py`

---

## 1. QA Overview

| Layer | Result |
|---|---|
| Lint on the 3 touched files | ✅ 0 new findings (pre-existing warnings in unrelated files preserved) |
| Backend service health (`GET /api/health`) | ✅ HTTP 200 after restart |
| Static QA harness assertions (LF-MERGE) | ✅ **37 / 37 PASS** |
| LX-A regression harness | ✅ **63 / 63 PASS** (disjoint surface; no impact) |
| Live derivation check on `Jeh's Nest` | ✅ `derived clean_slate = True` (was effectively False under hidden flag) |
| Read-only smoke (no Mongo writes) | ✅ Confirmed |

---

## 2. Static QA Harness — Detailed Results

### 2.1 QA-1 — `migration.py` flag-source swap

| Assertion | Result |
|---|---|
| `clean_slate = loyalty_enabled_flag` line present | ✅ |
| No `.get("loyalty_clean_slate_recalc"` code-path read in `migration.py` | ✅ |
| `loyalty_settings.get("loyalty_enabled"` IS read | ✅ |
| `LF-MERGE marker comment` present | ✅ |
| Downstream `clean_slate` consumers (`if clean_slate and loyalty_enabled_flag`, `if not clean_slate`) intact | ✅ |

### 2.2 QA-2 — `customers.py` flag-source swap

| Assertion | Result |
|---|---|
| `clean_slate = bool(loyalty_settings_doc.get("loyalty_enabled", False))` present | ✅ |
| No `.get("loyalty_clean_slate_recalc"` code-path read in `customers.py` | ✅ |
| `LF-MERGE marker comment` present | ✅ |
| Hard-init expression `0 if clean_slate else mygenie_customer.get("loyalty_point", 0)` intact | ✅ |
| Existing-customer guard `if not existing and not clean_slate` preserved | ✅ |

### 2.3 QA-3 — `schemas.py` deprecation discipline

| Assertion | Result |
|---|---|
| `DEPRECATED 2026-05-23 (CR-001C-L LF-MERGE)` marker present | ✅ |
| `loyalty_clean_slate_recalc: bool = False` field still defined on `LoyaltySettings` | ✅ (backward compat) |
| `loyalty_clean_slate_recalc: Optional[bool] = None` still accepted on `LoyaltySettingsUpdate` | ✅ (backward compat) |
| `loyalty_enabled: bool = False` default unchanged | ✅ |

### 2.4 QA-4 — Behavioral parameterization of customer field-init

In-memory simulation of the inline expression at `customers.py:226-232` parameterized by `clean_slate`. MyGenie payload provided 7 non-zero fields:

```python
{
  "loyalty_point": 250, "total_points_earned": 300,
  "total_points_redeemed": 50, "wallet_balance": 120.5,
  "total_wallet_received": 200.0, "total_wallet_used": 79.5,
  "total_coupon_used": 4
}
```

#### QA-4a — `loyalty_enabled=true` → `clean_slate=True` → hard-init

| Field | Result |
|---|---|
| `total_points == 0` | ✅ |
| `total_points_earned == 0` | ✅ |
| `total_points_redeemed == 0` | ✅ |
| `wallet_balance == 0.0` | ✅ |
| `total_wallet_received == 0.0` | ✅ |
| `total_wallet_used == 0.0` | ✅ |
| `total_coupon_used == 0` | ✅ |

#### QA-4b — `loyalty_enabled=false` → `clean_slate=False` → trust MyGenie

| Field | Result |
|---|---|
| `total_points == 250` | ✅ |
| `total_points_earned == 300` | ✅ |
| `total_points_redeemed == 50` | ✅ |
| `wallet_balance == 120.5` | ✅ |
| `total_wallet_received == 200.0` | ✅ |
| `total_wallet_used == 79.5` | ✅ |
| `total_coupon_used == 4` | ✅ |

### 2.5 QA-5 — `loyalty_clean_slate_recalc` is ignored across 6 settings combinations

Derivation function (mirrors both routers post-merge):
```python
def derive_clean_slate(settings: dict) -> bool:
    return bool((settings or {}).get("loyalty_enabled", False))
```

| Case | `loyalty_enabled` | `loyalty_clean_slate_recalc` | Expected `clean_slate` | Result |
|---|---|---|---|---|
| A | `False` | `True` | `False` (hidden flag ignored) | ✅ |
| B | `True` | `False` | `True` (← Jeh's Nest's exact state) | ✅ |
| C | `True` | `True` | `True` | ✅ |
| D | `False` | `False` | `False` | ✅ |
| E | (absent) | (absent) | `False` (default) | ✅ |
| F | settings = `None` | — | `False` | ✅ |

### 2.6 QA-6 — Pydantic backward compatibility

| Assertion | Result |
|---|---|
| `LoyaltySettingsUpdate(loyalty_clean_slate_recalc=True)` parses without error | ✅ |
| `LoyaltySettings(id="x", user_id="x")` default `loyalty_clean_slate_recalc is False` | ✅ |
| `LoyaltySettings(id="x", user_id="x")` default `loyalty_enabled is False` | ✅ |

### 2.7 Reproducibility

```bash
/root/.venv/bin/python /tmp/cr_001c_l_lf_merge_static_qa.py
# Expected tail:
#   ============================================================
#     CR-001C-L LF-MERGE static QA results: 37 passed, 0 failed
#   ============================================================
# Exit code: 0
```

---

## 3. LX-A Regression Validation

LX-A surface (`backend/core/helpers.py`, `backend/core/loyalty.py`, `backend/routers/pos.py`, `backend/models/schemas.py` LoyaltySettings/Update read-side) is disjoint from LF-MERGE surface. Re-ran the LX-A static QA harness post-LF-MERGE:

```
============================================================
  CR-001C-LX-A static QA results: 63 passed, 0 failed
============================================================
```

LF-MERGE does not regress any of the 6 strict-key contracts on the 3 POS read endpoints.

---

## 4. Service Health

```bash
sudo supervisorctl restart backend  → started
sleep 5
curl -s http://localhost:8001/api/health
# {"status":"healthy","timestamp":"2026-05-23T07:39:41.865275+00:00"}
```

Backend booted cleanly on first attempt post-patch. APScheduler started. Lifespan complete.

---

## 5. Live Derivation Check on Real Restaurant (Read-Only)

| Field | Value |
|---|---|
| `user_id` | `pos_0001_restaurant_635` (Jeh's Nest, `owner@jehsnest.com`) |
| `loyalty_settings.loyalty_enabled` | `True` |
| `loyalty_settings.loyalty_clean_slate_recalc` | `False` (now ignored) |
| Derived `clean_slate` for next migration | **`True`** |
| Expected next-migration mode | **Clean-slate recompute** ✅ |

This confirms LF-MERGE achieves the owner's intent: the visible "Loyalty Program ON" toggle is now sufficient to make migration recompute points from historical orders.

---

## 6. Mutation Discipline

| What | Done? |
|---|---|
| Migration triggered by agent | ❌ — owner action only |
| Any Mongo document written / updated | ❌ — pure read |
| `loyalty_settings.loyalty_enabled` toggled by agent | ❌ — owner had already set it to `true` |
| `loyalty_settings.loyalty_clean_slate_recalc` flipped by agent | ❌ — left at its existing `false` value |
| Customer / order / `points_transactions` / `wallet_transactions` modified | ❌ |
| Service env / supervisor (other than standard hot-reload restart) changed | ❌ |

---

## 7. Status Transition

| Track | Before | After |
|---|---|---|
| LF-MERGE | (not started) | **`cr001cl_lf_merge_complete_qa_passed_in_preview`** |
| L3 (overall) | `cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending` | unchanged — real-data validation pending owner Revert → Sync Again |
| LX-A | `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` | unchanged |

---

## 8. Out-of-Scope Re-confirmation

- ❌ Migration NOT triggered by agent — only owner from CRM UI.
- ❌ No DB writes.
- ❌ No `/app/memory/final/` writes.
- ❌ L4 / L5 / Coupon / Wallet — not started.
- ❌ Prod deploy — not done.
- ❌ Existing L1/L2/L3/LX-A reports — not modified.
- ❌ Frontend — not modified.

---

## 9. Sign-off

CRM agent — LF-MERGE QA passed in preview.

**Owner action to complete L3 validation:**

1. Open Data Migration modal in the CRM UI.
2. **Revert** Sync Orders.
3. **Revert** Sync Customers.
4. **Sync Customers** → wait for completion.
5. **Sync Orders** → wait for completion.
6. Notify the agent → agent re-runs the full L3 verification matrix.

Expected post-re-run state (proves L3 substantive code path):
- `points_transactions` row count ≈ 200–233.
- Σ `total_points_earned` across 209 customers ≈ 1,540+ points.
- Per-order `points_earned` matches `core.loyalty.calculate_points(...)`.
- Some customers may upgrade to Silver/Gold based on cumulative points.
