# QA Handover — CR-106: `GET /scan/coupons?channel=` filter + pos-only exclusion
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_106_IMPLEMENTATION_PLAN.md` · **Risk**: LOW (additive param, 5 lines) · **Backend only.**
**Creds**: customer token via `POST /api/scan/auth/skip-otp` `{phone:"9838777712", restaurant_id:"689"}` (fresh customer — hasn't used FLAT100TEST) · `REACT_APP_BACKEND_URL` from `/app/frontend/.env`

## What changed (1 file, marker `# CR-106`)

| File | Change |
|---|---|
| `backend/routers/scan.py:462–472` | Added `channel: Optional[str] = None` param. `ch_filter = {"$in": [channel]} if channel else {"$in": ["dine_in","delivery","takeaway"]}`. Added `"applicable_channels": ch_filter` to DB query. |

**Not touched**: `models/schemas.py` · `core/coupon.py` · `routers/pos.py` · frontend · stored data

## Self-test — 6/6 PASS (fresh customer phone 9838777712)

| V | Check | Result |
|---|---|---|
| V1 | `GET /scan/coupons?channel=dine_in` → 24 coupons | ✅ |
| V2 | `GET /scan/coupons?channel=delivery` → 23 (1 fewer — 1 dine_in-only excluded) | ✅ |
| V3 | `GET /scan/coupons` (no param) → 24 consumer coupons | ✅ |
| V4 | pos-only coupons absent from no-param response | ✅ (r689 has 0 pos-only production coupons; 6 exist on QA test tenant only) |
| V5 | FLAT100TEST present with fresh customer | ✅ (was absent for 7505242126 because they already used it — per_user_limit=1, usage=1 — correct) |
| V6 | `GET /scan/coupons` backward compat, total unchanged | ✅ 24 |

## QA asks
1. Re-run V1–V6 with phone `9838777712` r689 (fresh customer for clean per_user_limit state).
2. Ad-hoc: (a) `?channel=takeaway` → same count as delivery (23) · (b) coupon with `["pos","dine_in"]` appears on `?channel=dine_in` · (c) `?channel=pos` → 0 results (or only pos coupons — not a valid S&O call but defensive check) · (d) confirm `applicable_channels` field on all returned coupons contains the requested channel.
3. Report → `qa/CR_106_QA_REPORT.md` + `test_reports/iteration_11.json`.
