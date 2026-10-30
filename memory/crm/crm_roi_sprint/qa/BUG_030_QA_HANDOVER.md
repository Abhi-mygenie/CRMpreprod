# QA Handover — BUG-030: `_resolve_restaurant_id` async fallback
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/BUG_030_IMPLEMENTATION_PLAN.md` · **Risk**: MEDIUM (identity routing) · **Backend only.**
**Creds**: `owner@thegoankitchen.com / Qplazm@10` (r69) · `owner@kunafamahal.com / Qplazm@10` (r689) · URL from `/app/frontend/.env`

## What changed (1 file, markers `# BUG-030`)

| File | Change |
|---|---|
| `backend/routers/scan.py` | E1: new `async _resolve_restaurant_id()` helper after line 38 (~12 lines). E2–E5: replaced `_normalize_restaurant_id(...)` → `await _resolve_restaurant_id(...)` in skip-otp, lookup, loyalty-rules, submit-feedback. `get_app_config:626` intentionally left (tries short-form first; CA-2 removal). |

Not touched: `core/phone.py` · `routers/pos.py` · `routers/customers.py` · stored data

## Self-test — 6/6 PASS

| V | Check | Result |
|---|---|---|
| V1 | skip-otp `{restaurant_id:"69"}` → success:True, is_new:False, token present | ✅ |
| V2 | lookup `{restaurant_id:"69", phone:"9035133228"}` → success:True, exists:True | ✅ |
| V3 | `GET /scan/loyalty-rules/69` → success:True, "Loyalty rules" | ✅ |
| V4 | feedback `{rating:4, restaurant_id:"69"}` → success:True, linked:False | ✅ |
| V5 | skip-otp `{restaurant_id:"689"}` → success:True, fast path unchanged | ✅ |
| V6 | `GET /scan/loyalty-rules/689` → success:True, 33 keys | ✅ |

Regression: `test_cr089_skip_otp` + `test_cr093_lookup` + `test_cr094_loyalty_rules` + `test_cr096_feedback` → **68 passed, 2 skipped**

## QA asks
1. Re-run V1–V4 with fresh IPs (X-Forwarded-For) to avoid rate-bucket collisions.
2. Ad-hoc: (a) `restaurant_id:"pos_owner_69_bdd4513c"` (full id) → also resolves correctly (fast path — starts with "pos_") · (b) unknown `restaurant_id:"99999"` → still returns standard form, route 404s naturally · (c) confirm orphan customer `ea9cf871` still at `pos_0001_restaurant_69` (untouched, pending CR-101).
3. Report → `qa/BUG_030_QA_REPORT.md` + `test_reports/iteration_10.json`.
