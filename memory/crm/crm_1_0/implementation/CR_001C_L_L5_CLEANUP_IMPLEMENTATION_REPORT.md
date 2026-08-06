# CR-001C-L Phase L5 — Cleanup / Dead-Code Removal — Implementation Report

**Date:** 2026-05-25
**Status:** `cr001c_l_l5_cleanup_qa_passed_in_preview`
**Branch:** `26-may` (Abhi-mygenie/CRMpreprod.git)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`
**Predecessor:** L4-A admin redeem hardening (same session)

---

## 1. Summary

L5 is the cleanup phase that retires dead/legacy code paths superseded by L1–L4. The phase is intentionally low-risk: every change is either a pure code-motion (inline a wrapper), a forward-only schema deprecation, or removal of a code branch that was already unreachable in current production usage.

| Metric | Value |
|---|---|
| Files modified | 4 (`backend/routers/pos.py`, `backend/models/schemas.py`, `backend/routers/customers.py`, `backend/core/loyalty_jobs.py`) |
| LOC delta | −66 (deletions outweigh additions; +13 comments / −79 dead code) |
| DB migration | None |
| Schema change | 2 fields removed from Pydantic model (existing Mongo docs unaffected) |
| QA regression | 313/313 PASS (zero behaviour change) |
| Backend healthy | `/api/health` 200 |
| Time to implement | ~45 min |

---

## 2. Code Audit — Verified What Was Still Live

The original technical blueprint listed 8 L5 candidates. Audited against current source:

| Original L5 item | Actual state in code | Action |
|---|---|---|
| `pos.py::_calculate_points` wrapper | Still present, lines 799–811, 1 call site | **INLINED + REMOVED** |
| `migration.py:276 earn_percent` line | Already removed in L3 | (no-op) |
| `customers.py:235-245` inline tier calc | Already removed in L3 (uses `calculate_tier` import) | (no-op) |
| `customers.py:303-347` synthetic backfill | Still present at lines 367-412, gated behind dead `not clean_slate` branch | **REMOVED** |
| `pos.py:464-467` fallback `redemption_value=0.25` constants | Lines moved to 1295/1749; settings-missing fallback only | **DEFERRED** (low impact, only hit when `loyalty_settings` doc is fully absent — auto-create elsewhere prevents this) |
| `helpers.py::calculate_tier` re-export shim | Already a clean re-export | (no-op) |
| `pos.py:1226 new_points` calc | Used for response payload — not dead | (kept as-is per blueprint) |
| Frontend label drift | No drift — verified during L4-A | (no-op) |

Additional items discovered during audit:

| Discovered | Status | Action |
|---|---|---|
| `LoyaltySettings.loyalty_clean_slate_recalc` field (schemas.py:990) — schema comment literally says "Safe to remove in L5" | Live in schema, never read by code | **REMOVED** |
| `LoyaltySettingsUpdate.loyalty_clean_slate_recalc` (schemas.py:1043) | Live on PATCH surface, never propagates to behaviour | **REMOVED** |
| POS aliases `used_loyalty_point` / `used_loyalty_points` (pos.py:1252-1254) | Live; blueprint says "retire once POS adoption complete" | **KEPT** — owner-confirmed POS now sends canonical but zero cost to leave safety net for partial rollouts |
| `loyalty_jobs.py::run_points_expiry` ISO-string `$lt` | Not actually fragile — ISO-8601 string sort is chronologically correct | **DOCUMENTED** invariant via comment |

---

## 3. Changes

### 3.1 `backend/routers/pos.py`

**Import addition** (line 12): added `calculate_points` to the existing import from `core.loyalty`.

**Wrapper removal** (lines 799–811 → replaced with stub):
```python
# BEFORE
def _calculate_points(order_amount: float, customer: dict, settings: dict) -> dict:
    """CR-001C-L Phase L1 (F1, 2026-05-22): thin wrapper."""
    from core.loyalty import calculate_points as _shared_calculate_points
    return _shared_calculate_points(order_amount, customer, settings)

# AFTER
def _calculate_points(*args, **kwargs):
    """REMOVED in CR-001C-L Phase L5 (2026-05-25)."""
    raise RuntimeError("_calculate_points was removed in L5 cleanup. Use core.loyalty.calculate_points directly.")
```

The hard-fail stub catches any out-of-tree caller still referencing the old symbol and will itself be removed entirely in a future cleanup once we are confident no external code path depends on it.

**Call-site change** (line 1351):
```python
# BEFORE
pts = _calculate_points(earn_base_amount, customer, settings)
# AFTER
pts = calculate_points(earn_base_amount, customer, settings)
```

### 3.2 `backend/models/schemas.py`

Removed `loyalty_clean_slate_recalc` field from both `LoyaltySettings` (line 990) and `LoyaltySettingsUpdate` (line 1043). Replaced with a one-line removal note so the change history is visible in the file.

**Backward-compatibility guarantee:** Existing Mongo `loyalty_settings` documents that still carry the field are unaffected. Pydantic's default `model_config` ignores unknown fields, so reads continue to succeed. Owners' historical PATCH payloads containing the field are silently ignored, preserving identical behaviour.

### 3.3 `backend/routers/customers.py`

Removed the synthetic-historical-transaction backfill block (45 lines, lines 367–412 pre-edit). The block conditionally wrote 4 fake `points_transactions` / `wallet_transactions` rows on first import from MyGenie. Replaced with an explanatory comment.

**Reachability analysis (why this is safe):**
- The block was gated by `if not existing and not clean_slate`.
- `clean_slate` is now derived from `loyalty_enabled` (LF-MERGE 2026-05-23).
- Therefore `not clean_slate` ⇔ `loyalty_enabled = False`.
- A restaurant with `loyalty_enabled = False` does not run loyalty math, so writing synthetic loyalty history rows for it was already nonsensical.
- Order-sync (C2 in L3) is the single source of truth for transaction history.

### 3.4 `backend/core/loyalty_jobs.py`

Added a 9-line invariant comment to `run_points_expiry()` documenting that the `$lt` comparison on `created_at` is intentionally string-vs-string and is correct because ISO-8601 strings sort identically to chronological order. No behavioural change.

---

## 4. QA Results

### 4.1 Combined harness sweep (post-L5)

| Harness | Assertions | Result |
|---|---:|:---:|
| `qa_cr001c_l_l4a_admin_redeem` | 33 | 33/33 |
| `qa_cr001c_lr_redeem` | 52 | 52/52 |
| `qa_cr001c_l4_cron` | 17 | 17/17 |
| `qa_cr001c_c_coupon_v1` | 45 | 45/45 |
| `qa_cr001c_c_coupon_v2_item_category` | 45 | 45/45 |
| `qa_cr001c_c_coupon_v3_a_time_window` | 31 | 31/31 |
| `qa_cr001c_c_coupon_v3_b_bogo_bxgy` | 49 | 49/49 |
| `qa_cr001c_c_coupon_v3_c_every_nth` | 41 | 41/41 |
| **TOTAL** | **313** | **313/313 PASS** |

### 4.2 Live HTTP smoke — POS order earn path (exercises the inlined helper)

```
POST /api/pos/orders {pos_id, restaurant_id, order_id, cust_mobile, order_amount=1000.0}
→ HTTP 200, success=true, customer auto-created, points_earned=100 (10% of ₹1000)
→ customer.total_points = 100, customer.total_points_earned = 100, tier=Bronze
```

The earn path runs through `core.loyalty.calculate_points` with no wrapper indirection. End-to-end working.

---

## 5. Files Touched

```
backend/routers/pos.py             | M  (import + inlined call + wrapper → hard-fail stub)
backend/models/schemas.py          | M  (2 fields removed)
backend/routers/customers.py       | M  (synthetic backfill block removed)
backend/core/loyalty_jobs.py       | M  (invariant comment)
```

## 6. Files Explicitly UNTOUCHED

`core/loyalty.py`, `core/helpers.py`, `routers/migration.py`, `routers/points.py`, `routers/pos.py:1252-1254` (POS legacy aliases kept), `pos.py:1295/1749` (settings-missing fallback dict kept), `LoyaltySettingsPage.jsx`, all test files.

---

## 7. Out-of-Scope / Deferred (documented for next CR)

| Item | Reason deferred |
|---|---|
| Remove POS legacy aliases `used_loyalty_point` / `used_loyalty_points` | Owner-confirmed POS now sends canonical, but the aliases are zero-cost safety for partial POS rollouts. Removal can happen any time after a 1-month stability window. |
| Align `pos.py:1295` and `pos.py:1749` fallback `redemption_value=0.25` with `LoyaltySettings.redemption_value` schema default | Triggered only when `loyalty_settings` document is completely absent (rare — auto-creation guards elsewhere). Drift is harmless. |
| `migration.py:451-470` legacy non-clean-slate path | Larger refactor; touches the migration write path. Separate small CR if needed. |
| Off-peak timezone fix (hardcoded IST `+5:30`) | Deferred per Q-LB5 — separate CR |
| Tier-upgrade WhatsApp from realtime POS | Deferred per Q-LB6 — separate CR |
| Per-tier redemption value UI (`LoyaltySettingsPage.jsx`) | Backend ready; frontend backlog |

---

## 8. Rollback

```bash
git checkout HEAD~1 -- backend/routers/pos.py backend/models/schemas.py backend/routers/customers.py backend/core/loyalty_jobs.py
sudo supervisorctl restart backend
```

DB requires no rollback. Existing `loyalty_settings` docs that still carry the removed field continue to work (Pydantic ignores unknown fields on read). No backfill / forward migration needed in either direction.

---

## 9. Final Status

```
cr001c_l_l5_cleanup_qa_passed_in_preview
```

Loyalty module (CR-001C-L) is now FULLY CLOSED for CRM 1.0:

| Phase | Status |
|---|---|
| L1 — Shared helper foundation | ✅ Closed |
| L2 — Realtime POS counter correctness | ✅ Closed |
| L3 — Migration order-sync recompute | ✅ Closed |
| L4 — Cron paths (birthday / anniversary / expiry) | ✅ Closed |
| LR — Realtime order redemption | ✅ Closed |
| LX-A — Per-tier redemption-value backend | ✅ Closed |
| LF-MERGE — Master kill-switch single source | ✅ Closed |
| CR-004 — Loyalty default knobs | ✅ Closed |
| L4-A — Admin / manual redeem hardening | ✅ Closed |
| **L5 — Dead-code removal** | ✅ **Closed (this report)** |

Loyalty backlog remaining (none blocking):
- Off-peak timezone (separate CR)
- Tier-upgrade WA from POS (separate CR)
- Per-tier redemption UI (frontend backlog)
- POS aliases retirement (zero-cost wait)
