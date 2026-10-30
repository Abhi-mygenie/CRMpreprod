# CR-001C-L-FIX Phase 1 — Backend Default Alignment Implementation Report

**Status:** `cr001c_l_fix_phase_1_backend_default_alignment_complete`
**Date:** 2026-05-26
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_L_FIX_CONSOLIDATED_LOYALTY_CLOSURE_PLAN.md` §3 Phase 1
**Branch:** `27-may` (working in `/app`)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`

---

## 1. Summary

Phase 1 of CR-001C-L-FIX implemented: a single canonical `default_loyalty_settings(user_id)` helper in `core/loyalty.py` that returns CR-004-compliant defaults sourced from the `LoyaltySettings` Pydantic schema. All 5 hardcoded-defaults blocks across 4 files have been replaced with calls to this helper.

**Defects closed by this phase:** D2, D3, D4 (3 sites) — total 5 hardcoded blocks eliminated.

**Regression:** 244/244 PASS (V1 45 + V2 45 + V3-A 31 + V3-B 49 + V3-C 41 + L4-A 33). Zero failures.

---

## 2. What Changed

### New: `default_loyalty_settings(user_id)` helper

**File:** `backend/core/loyalty.py` (top of file, after imports)

```python
def default_loyalty_settings(user_id: str) -> dict:
    from models.schemas import LoyaltySettings
    base = LoyaltySettings(id=str(uuid.uuid4()), user_id=user_id).model_dump()
    return base
```

Sources defaults from the Pydantic schema itself, so schema and runtime can never drift. Returns a complete dict ready for `insert_one`.

### CR-004-compliant values produced by the helper

| Field | OLD hardcoded | NEW (from schema) |
|---|---|---|
| `min_order_value` | 100.0 | **0** |
| `redemption_value` | 0.25 | **1.0** |
| `max_redemption_percent` | 50.0 | **100.0** |
| `max_redemption_amount` | 500.0 | **None** (no limit) |
| `min_redemption_points` | 100 | **50** |

All other fields (earn percents, tier thresholds, bonus settings, etc.) remain at schema defaults — identical to what was previously hardcoded.

### 5 hardcoded blocks replaced

| # | File | Lines (pre-edit) | Defect | Change |
|---|---|---|---|---|
| 1 | `backend/routers/auth.py` | 178–213 | D2 — register endpoint | 35-line dict → `default_loyalty_settings(user_id)` |
| 2 | `backend/routers/auth.py` | 474–509 | D3 — mygenie-login first-time | 35-line dict → `default_loyalty_settings(user_id)` |
| 3 | `backend/routers/points.py` | 172–179 | D4 — /earn fallback | 7-line dict → `default_loyalty_settings(user["id"])` |
| 4 | `backend/routers/pos.py` | 1290–1297 | D4 — order webhook fallback | 8-line dict → `default_loyalty_settings(user["id"])` |
| 5 | `backend/routers/pos.py` | 1744–1757 | D4 — payment-received fallback | 13-line dict → `default_loyalty_settings(user["id"])` |

### Import additions

| File | Added import |
|---|---|
| `backend/routers/auth.py` | `from core.loyalty import default_loyalty_settings` |
| `backend/routers/points.py` | `default_loyalty_settings` added to existing `from core.loyalty import ...` |
| `backend/routers/pos.py` | `default_loyalty_settings` added to existing `from core.loyalty import ...` |

---

## 3. What Was NOT Changed (intentionally preserved)

| Pattern | Location | Why preserved |
|---|---|---|
| `settings.get("min_order_value", 100.0)` | `pos.py:1829`, `points.py:176` | Field-level `.get()` fallback on an already-loaded settings doc — safe defensive read, NOT a settings-creation block |
| `settings.get("redemption_value", 0.25)` | `scan.py:475`, `customers.py:1498-1500` | Read-only display code — safe fallback for legacy docs that might lack the key |
| `routers/coupons.py` | Entire file | Out of scope — untouched per plan |
| `core/loyalty_jobs.py` | Entire file | Out of scope — untouched per plan |
| `frontend/` | All files | Phase 1 is backend-only |

---

## 4. Acceptance Criteria (Phase 1)

| # | Criterion | Result |
|---|---|---|
| A1 | `grep "min_order_value.*100\.0"` in backend settings-creation blocks returns 0 | **PASS** — only `.get()` fallbacks remain |
| A2 | `grep "redemption_value.*0\.25"` in backend settings-creation blocks returns 0 | **PASS** — only read-only display fallbacks remain |
| A3 | `grep "max_redemption_percent.*50\.0"` in all backend returns 0 | **PASS** |
| A4 | `grep "max_redemption_amount.*500\.0"` in all backend returns 0 | **PASS** |
| A5 | `grep "min_redemption_points.*100"` in settings-creation blocks returns 0 | **PASS** |
| A6 | Helper round-trip: 13 assertion checks on CR-004 values | **PASS** |
| A7 | Backend hot-reload clean, `/api/health` 200 | **PASS** |
| A8 | Full regression 244/244 PASS | **PASS** |

---

## 5. QA Regression Results

| Suite | Expected | Actual | Status |
|---|---|---|---|
| V1 (`qa_cr001c_c_coupon_v1`) | 45/45 | **45/45** | PASS |
| V2 (`qa_cr001c_c_coupon_v2_item_category`) | 45/45 | **45/45** | PASS |
| V3-A (`qa_cr001c_c_coupon_v3_a_time_window`) | 31/31 | **31/31** | PASS |
| V3-B (`qa_cr001c_c_coupon_v3_b_bogo_bxgy`) | 49/49 | **49/49** | PASS |
| V3-C (`qa_cr001c_c_coupon_v3_c_every_nth`) | 41/41 | **41/41** | PASS |
| L4-A (`qa_cr001c_l_l4a_admin_redeem`) | 33/33 | **33/33** | PASS |
| **Combined** | **244** | **244** | **PASS** |

---

## 6. Files Modified (cumulative)

| File | Type | LOC delta |
|---|---|---|
| `backend/core/loyalty.py` | M | +16 (new helper + import) |
| `backend/routers/auth.py` | M | −67 / +4 (2 hardcoded blocks → helper calls + import) |
| `backend/routers/points.py` | M | −6 / +3 (1 fallback block + import) |
| `backend/routers/pos.py` | M | −18 / +6 (2 fallback blocks + import) |

No DB migration. No env change. No new dependency. Hot-reload only.

---

## 7. Rollback

```bash
# Revert Phase 1 only
git checkout HEAD~1 -- backend/core/loyalty.py backend/routers/auth.py backend/routers/points.py backend/routers/pos.py
```

No DB change to undo. All schema fields remain backward-compatible.

---

## 8. Next Phase

**Phase 2 — Live DB migration** (per plan §3 Phase 2): one-shot script to bulk-apply CR-004 values to all 11 existing `loyalty_settings` docs + R689 earn-% reset. Estimated ~15 min.

**Remaining phases:** 3 (input bug fix), 4 (label + per-tier UI + disabled badge), 5 (unhide buttons), 6 (QA + final report).

---

## 9. Tracker

```
cr001c_l_fix_phase_1_backend_default_alignment_complete
```
