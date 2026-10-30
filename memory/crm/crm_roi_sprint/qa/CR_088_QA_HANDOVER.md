# QA Handover — CR-088: `/scan/*` list hygiene
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_088_IMPACT_ANALYSIS.md` · **Risk**: LOW–MEDIUM (additive read routes + server.py) · **Backend only — no frontend changes.**
**Creds**: customer token via `POST /api/scan/auth/skip-otp` `{phone:"7505242126", restaurant_id:"689", country_code:"+91"}` · `REACT_APP_BACKEND_URL` from `/app/frontend/.env`

---

## What changed (2 files, markers `# CR-088`)

| File | Change |
|---|---|
| `backend/routers/scan.py` | E1 `get_orders` +`skip:int=0` param + `.skip(_skip)` · E2 `get_points_history` +skip + `count_documents` total · E3 `get_wallet_history` same as E2 · E4 `get_loyalty` +`expiring_soon`/`expiring_date` inlined from `points.py:218-265` |
| `backend/server.py` | E5 `FastAPI(..., openapi_url="/api/openapi.json")` |

**Not touched**: `routers/points.py` · `pos.py` · `customers.py` · `schemas.py` · frontend · stored data

---

## Self-test — 8/8 PASS (r689 / phone 7505242126 / Abhishek Jain)

| V | Check | Result |
|---|---|---|
| V1 | `GET /scan/orders?skip=0&limit=5` → 5 orders, `total:76`, `skip:0`, `limit:5` | ✅ |
| V2 | `GET /scan/orders?skip=5&limit=5` → 5 different orders, same `total:76` | ✅ |
| V3 | `GET /scan/points/history?skip=0&limit=5` → `total:78` (real DB count, not 5) | ✅ |
| V4 | `GET /scan/points/history?skip=20&limit=5` → offset applied, `total:78` unchanged | ✅ |
| V5 | `GET /scan/wallet/history` → `total:0`, `skip:0` | ✅ |
| V6 | `GET /scan/loyalty` → `expiring_soon:300`, `expiring_date:"2026-10-16T16:13:22+00:00"` present | ✅ |
| V7 | `GET /api/openapi.json` → `openapi:"3.1.0"`, 186 paths | ✅ |
| V8 | `GET /scan/orders` (no params) → `total:76`, `skip:0`, `limit:20` — backward compat | ✅ |

---

## QA asks
1. Run V1–V8 independently with a fresh customer token (use phone `7505242126` r689 or any r689 customer with orders + points).
2. Ad-hoc: (a) `skip` negative value → clamped to 0, not an error · (b) `limit` > 50 → clamped to 50 · (c) tenant with `points_expiry_months:0` → `expiring_soon:0`, `expiring_date:null` · (d) `GET /scan/loyalty` for a customer with `expiry_months>0` and no earn txns in the reminder window → `expiring_soon:0`.
3. Confirm no new docs written to any collection after the run.
4. Report → `qa/CR_088_QA_REPORT.md` + `test_reports/iteration_10.json` (or next available after CR-100 QA).
