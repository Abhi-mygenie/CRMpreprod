# CRM Preprod - PRD

## Original Problem Statement
Pull code from https://github.com/Abhi-mygenie/CRMpreprod.git from 26-may branch, use remote MongoDB (mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie), build as-is.

## Architecture
- **Frontend**: React 19 with Craco, Tailwind CSS, Radix UI, Recharts, React Router v7
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver), APScheduler
- **Database**: Remote MongoDB at 52.66.232.149 (DB: mygenie)
- **Auth**: JWT + API Key dual auth (POS endpoints)
- **Preview URL**: https://crm-deploy-may.preview.emergentagent.com

## What's Been Implemented

### Session 0 (2026-05-25) — Initial Deploy
- Cloned 26-may branch, configured backend .env with remote MongoDB
- Installed all dependencies, both services running

### Session 2 (2026-05-25) — Re-Deploy on New Pod + All POS Blockers Closed + L4-A Admin Redeem Hardening

**Re-Deploy (current session)**
- Re-cloned `26-may` into `/app/CRMpreprod/`, symlinked `/app/backend` and `/app/frontend` → CRMpreprod (kept original scaffolding as `.scaffold.bak`)
- Added `resolve.symlinks: false` to `craco.config.js` to fix webpack resolution through the symlink
- Wired remote MongoDB (`mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie`)
- Both services up — `/api/health` 200, mygenie login page renders cleanly at preview URL

**POS↔CRM Contract Alignment (owner-confirmed, all closed)**
- B1 (`pos_food_id`) — CLOSED, POS now sends stable product IDs
- B2 (`coupon_info` wrapper) — CLOSED, top-level coupon fields flowing
- B3 (`loyalty_info` wrapper) — CLOSED, top-level loyalty fields flowing
- B7 (`wallet_info` wrapper) — CLOSED, top-level wallet fields flowing
- LR realtime order redemption verification — CLOSED end-to-end

**Outcome**
- Zero external blockers remaining on coupon + loyalty pipeline
- All CR-001 / CR-001C work fully closed in preview AND in production contract

**CR-001C-L Phase L4-A — Admin/Manual Redeem Hardening (this session)**
- Routed `POST /api/points/transaction` redeem branch through shared `core.loyalty.redeem_loyalty_points` helper (Option Y)
- Closed all 7 defects: tier-no-downgrade, `total_points_redeemed $inc`, tier-aware ratio, `redeemed_value` + `ratio_per_point` on PT, `points_expired: False`, idempotency, `loyalty_enabled` kill-switch (HTTP 403), `last_visit` no longer touched on redeem
- 33/33 new QA assertions PASS · 280/280 regression PASS · **313/313 combined**
- Live HTTP smoke: 4/4 scenarios verified end-to-end on remote Mongo
- 3 files modified (`schemas.py`, `routers/points.py`, `CustomerDetailPage.jsx`) + 1 new QA harness · no DB migration · no env change
- See `implementation/CR_001C_L_L4A_ADMIN_REDEEM_HARDENING_IMPLEMENTATION_REPORT.md` + `planning/CR_001C_L_LOYALTY_L4A_ADMIN_REDEEM_HARDENING_PLAN.md`
- Tracker: `cr001c_l_l4a_admin_redeem_hardening_qa_passed_in_preview`

**CR-001C-L Phase L5 — Cleanup / Dead-Code Removal (this session)**
- Inlined `_calculate_points` wrapper at single call site, replaced with hard-fail stub
- Removed deprecated `loyalty_clean_slate_recalc` field from `LoyaltySettings` + `LoyaltySettingsUpdate` Pydantic models (existing Mongo docs untouched — Pydantic ignores unknown fields)
- Removed synthetic historical PT/WT backfill block from `customers.py` (legacy non-clean-slate path, dead post LF-MERGE)
- Added ISO-8601 string-sort invariant comment to `run_points_expiry`
- 4 files modified, ~66 LOC net deletion · no behaviour change · **313/313 QA regression PASS** · live POS earn smoke confirmed
- Kept POS legacy aliases (`used_loyalty_point` / `used_loyalty_points`) as zero-cost safety net for partial POS rollouts
- See `implementation/CR_001C_L_L5_CLEANUP_IMPLEMENTATION_REPORT.md`
- Tracker: `cr001c_l_l5_cleanup_qa_passed_in_preview`

**Loyalty Module — Status**
- Backend: All 10 backend phases closed (L1, L2, L3, L4, LR, LX-A, LF-MERGE, CR-004 schema-only, L4-A, L5) — 313/313 QA PASS
- **UI / DB closure gap identified Session 2 end** — 14 defects catalogued in `planning/CR_001C_L_FIX_CONSOLIDATED_LOYALTY_CLOSURE_PLAN.md`
- Next CR: `CR-001C-L-FIX` — single consolidated CR to close all 14 (DB migration + 5 backend hardcoded-default fixes + 23-input NaN bug + admin-button unhide + per-tier UI + disabled badge + R689 reset)
- Tracker: `cr001c_l_fix_consolidated_plan_ready_for_implementation`
- Owner decisions Q1–Q6 frozen in plan §0
- Effort: ~2.75 hours, single CR (no PR split — phase boundaries provide all isolation)

### Session 1 (2026-05-25) — Coupon V3-C + Seed Fix + Loyalty Defaults

**Coupon V3-C UI Wiring (last "Soon" tile)**
- Enabled "Every Nth Item" tile in production `/coupons`
- Full form: nth number (min 2), benefit type (Free/% Off/Rs. Off), eligible items + categories, excluded items, advanced settings
- `handleSubmit` V3-C payload (offer_type="nth_item"), `resolveTypeFromCoupon` detection, `openEdit` rehydration
- Hid generic Discount Rules for V3-B and V3-C (cleaner UX)
- Single file: `CouponsPage.jsx` (~+110 LOC)

**Seed Data Fix**
- 8 SEED_ coupons had wrong item names (e.g. 182042 = "Signature Trio Salankatia", not "Classic Cheese Kunafa")
- Updated DB + recreated `/tmp/seed_r689_coupons.py` with verified food_id→name mapping

**CR-004 Loyalty Settings Defaults & Bug Fix**
- `min_order_value` default: ₹100 → ₹0 (backend: schemas.py, points.py, loyalty.py)
- `redemption_value` input: `min="0.5"` → `min="0.01"` (bug: blocked save when value was ₹0.25)
- `max_redemption_amount` default: ₹500 → None/empty (no limit)
- `max_redemption_percent` default: 50% → 100%
- Off-peak hours: investigated, confirmed fully wired and working (no change needed)

---

## Current System Status

### Coupon System — COMPLETE (ready for final QA)

| Component | Status | Evidence |
|---|---|---|
| Backend Engine (V1→V3-C) | **211/211 QA PASS** | 5 harnesses, all green |
| Admin UI (7 tiles) | **ALL LIVE** | No "Soon" badges, all create/edit/list/toggle/delete working |
| Admin API (9 endpoints) | **ALL WORKING** | Verified via curl |
| POS API (3 endpoints) | **ALL WORKING** | available, validate, orders coupon commit |
| POS Perf (N+1 fix) | **DONE** | 16.5s → 1.15s (14.3× speedup) |
| Seed Data | **FIXED** | Item names corrected, seed script recreated |

### Loyalty System — Functional + Defaults Fixed

| Component | Status |
|---|---|
| Realtime POS earning | Working for `loyalty_enabled=True` restaurants |
| Redemption helpers (shared) | 52/52 static QA |
| L4 Cron (birthday/anniversary) | 17/17 QA |
| Migration parity (L3) | Validated on 2 restaurants |
| `payment_status` gate | Removed — CRM accepts any value |
| Settings defaults (CR-004) | Fixed — min_order=0, redemption_value min=0.01, max_amount=no limit, max_percent=100% |
| Off-peak hours | Confirmed working end-to-end |

### POS Schema Alignment

| Item | Status |
|---|---|
| CR-001A Phase 1 (alias mapping) | Closed live on prod |
| CR-001A Phase 2 (room_info) | QA passed, awaiting prod room order |
| CR-001D (restaurant_id) | QA passed, same as above |
| CR-002 (POS request logging) | Running |

---

## Cleanup Items (Non-Blocking)

| Item | Effort | File(s) |
|---|---|---|
| ~~Remove dead `/coupons-v3-preview` page + route~~ | DONE Session 2 | — |

---

## Next CR — CR-001C-L-FIX (Consolidated Loyalty Closure)

🟧 **Single consolidated CR — ready for implementation.** Closes 14 defects identified at Session 2 end that prevent loyalty from being truly "done" from an owner-facing perspective.

| Field | Value |
|---|---|
| Plan doc | `planning/CR_001C_L_FIX_CONSOLIDATED_LOYALTY_CLOSURE_PLAN.md` |
| Tracker | `cr001c_l_fix_consolidated_plan_ready_for_implementation` |
| Effort | ~2.75 hours (single CR, 6 phases, no PR split) |
| Risk | 🟢 Low for 8 defects · 🟡 Medium for 3 (DB migration + per-tier UI + disabled badge) · 🟠 1 genuinely complex (D8 — `parseFloat("")` NaN across 23 inputs) |
| Backend | 4 files modified + 1 new helper + 1 migration script + 1 new QA harness |
| Frontend | 2 files modified (`LoyaltySettingsPage.jsx`, `CustomerDetailPage.jsx`) |
| DB | Bulk update of 11 existing `loyalty_settings` docs + R689 earn-% reset (with pre-backup) |
| Owner decisions | Q1-Q6 frozen in plan §0 (Bulk migration · R689 reset · Unhide both buttons · Plain points helper · Per-tier UI · Disabled badge) |

### Defects this CR closes (D1–D14)

| ID | Defect | Severity |
|---|---|---|
| D1 | 11/11 live `loyalty_settings` docs still on pre-CR-004 values | 🟥 |
| D2 | `auth.py:178-214` register hardcodes OLD defaults, bypasses schema | 🟥 |
| D3 | `auth.py:474-510` mygenie-login first-time, same bypass | 🟥 |
| D4 | 3 fallback dicts (points.py, 2× pos.py) hardcode OLD values | 🟧 |
| D5/D6 | `\|\| 50` fallback on Max % hides real value, breaks editing | 🟥 |
| D7 | `\|\| 30` on expiry_reminder_days, same pattern | 🟧 |
| D8 | `parseFloat("")` → NaN across 23 numeric inputs ("inputs not working") | 🟥 |
| D9 | "Customer needs at least ₹X worth points" (₹ on a points count) | 🟧 |
| D10 | Admin Redeem button hidden — L4-A backend unreachable from UI | 🟥 |
| D11 | Use Wallet debit button hidden | 🟧 |
| D12 | Per-tier redemption-value inputs missing (LX-A backend ready) | 🟧 |
| D13 | No "Loyalty Disabled" indicator anywhere | 🟧 |
| D14 | R689 anomalous `bronze_earn_percent=50, silver_earn_percent=69` | 🟧 |

### Execution order (risk-optimal, per plan §9)
1. Backend default helper + 5 hardcoded blocks (P1) — 🟢
2. DB migration + R689 reset (P2) — 🟢
3. Unhide Redeem + Use Wallet buttons (P5) — 🟢
4. Input bug fix — 23 inputs (P3) — 🟡 the one complex change
5. Helper text + per-tier UI + disabled badge (P4) — 🟢
6. QA harness + regression (313+12=325) + report (P6)

### Acceptance criteria (14 binary pass/fail in plan §7)
- All 11 live restaurants show CR-004 values on 5 target fields
- R689 has `bronze=5, silver=7`
- Grep for old defaults in backend returns 0 hits
- Clearing any numeric input keeps it cleared (no NaN, no `|| X` fallback)
- Helper reads "At least X points required to redeem"
- Per-tier collapsible visible and persists null
- Disabled banner + pill show when `loyalty_enabled=false`
- Both admin buttons VISIBLE + greyed when loyalty paused
- End-to-end UI redeem flow exercises L4-A hardening
- 325/325 QA PASS
- Backend healthy, reports written

---

## External Blockers (POS Team) — ALL CLOSED 2026-05-25 (Session 2)

| # | Blocker | Resolution |
|---|---|---|
| B1 | POS missing `pos_food_id` | ✅ **CLOSED** — POS now sends stable `pos_food_id` on every cart line |
| B2 | Coupon fields nested in `coupon_info` | ✅ **CLOSED** — POS↔CRM contract aligned, top-level `coupon_code`/`coupon_discount` flowing |
| B3 | Loyalty fields nested in `loyalty_info` | ✅ **CLOSED** — POS↔CRM contract aligned, top-level `loyalty_points_used` flowing |
| B7 | Wallet fields nested in `wallet_info` | ✅ **CLOSED** — POS↔CRM contract aligned, top-level `wallet_used` flowing |
| LR realtime verify | POS not calling `/api/pos/orders` at bill-finalize | ✅ **CLOSED** — verified end-to-end |

CRM contract was already implemented and tested (280/280 QA PASS). Closure achieved via POS team alignment.

---

## Owner Configuration Items (NOT blockers — operational)

- `loyalty_enabled=True` flag for R478, R618, R634 — owner-driven toggle when those restaurants want loyalty on.
- R689 `mygenie_token` refresh — owner re-login when token expires.

---

## Backlog (Prioritized)

### P1 — Final Closure (CRM-internal, no external dependency)
- ~~Re-baseline 280 QA harnesses against current prod-Mongo~~ ✅ done implicitly during L4-A/L5 (313/313 PASS)
- ~~Preview page cleanup — delete `CouponV3Preview.jsx` + route from `App.js`~~ ✅ **DONE Session 2** (file removed, import + route stripped, frontend recompiled clean, route now falls through to login redirect via `*` fallback)
- **🟧 NEXT: CR-001C-L-FIX consolidated loyalty closure** — see top of doc · `cr001c_l_fix_consolidated_plan_ready_for_implementation` · ~2.75 hrs

### P2 — CR-003 Coupon Analytics Dashboard (final feature this cycle)
- Backend data already exposed via `GET /api/analytics/coupons`
- Frontend: ~7 hours work, 5 owner decisions in `planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md`

### P3 — Future
- Duplicate coupon ("clone") feature
- Per-tier redemption value UI (LX-A fields exist in backend, not exposed in UI)
- Off-peak timezone fix (currently hardcoded IST, should use restaurant timezone)
- V3-D / V3-E composite coupons (parked to V4)

---

## Key Files Reference

### Backend
| File | Purpose |
|---|---|
| `backend/core/coupon.py` | Coupon engine (~1800+ LOC) — V1→V3-C |
| `backend/core/loyalty.py` | Loyalty helpers (calculate_points, compute_max_redeemable, redeem_loyalty_points) |
| `backend/core/loyalty_jobs.py` | Cron jobs (birthday, anniversary, expiry) |
| `backend/core/helpers.py` | Shared helpers (calculate_tier, get_earn_percent, check_off_peak_bonus) |
| `backend/routers/pos.py` | POS endpoints (~2800+ LOC) |
| `backend/routers/coupons.py` | Admin CRUD (9 endpoints) |
| `backend/routers/points.py` | Loyalty settings + manual points |
| `backend/routers/menu.py` | Menu proxy (items + categories via mygenie_token) |
| `backend/models/schemas.py` | All Pydantic models |
| `backend/services/analytics_service.py` | Coupon + feedback analytics |

### Frontend
| File | Purpose |
|---|---|
| `frontend/src/pages/CouponsPage.jsx` | Production coupon admin UI (all 7 types) |
| `frontend/src/pages/CouponV3Preview.jsx` | DEAD CODE — to be deleted |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | Loyalty settings UI |
| `frontend/src/pages/DashboardPage.jsx` | Dashboard with coupon stats cards |
| `frontend/src/pages/CustomerDetailPage.jsx` | Customer coupon usage display |

### Documentation (all under `/app/memory/crm/crm_1_0/`)
| Path | Purpose |
|---|---|
| `planning/CR_001_INDEX.md` | Master index of ALL work items |
| `handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS.md` | Full state consolidation |
| `qa/CRM_1_0_COUPON_FINAL_QA_READINESS_AUDIT.md` | Final QA readiness audit (this session) |
| `planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md` | Analytics dashboard proposal |
| `planning/CR_004_LOYALTY_DEFAULTS_AND_UI_BUG_FIX.md` | Loyalty defaults change plan |
| `planning/CR_001C_C_COUPON_V3C_UI_WIRING_PLAN.md` | V3-C UI wiring plan |
| `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md` | POS coupon API contract |
| `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` | POS violations report |
| `handoff/SESSION_1_AGENT_HANDOVER.md` | Session 1 agent handover |

### Test Credentials
| Purpose | Value |
|---|---|
| Restaurant for testing | R689 (Kunafa Mahal) — `pos_0001_restaurant_689` |
| JWT generation | `cd /app/backend && python3 -c "from core.auth import create_token; print(create_token('pos_0001_restaurant_689'))"` |
| Seed script | `python3 /tmp/seed_r689_coupons.py seed` (or `cleanup`) |
| QA harnesses | `cd /app/backend && python -m tests.qa_cr001c_c_coupon_v1` (v1/v2/v3_a/v3_b/v3_c) |

---

## For Next Agent — Recommended Sequence

1. **Preview cleanup** (2 min) — delete `CouponV3Preview.jsx` + remove route from `App.js`
2. **CR-003 Coupon Analytics Dashboard** — owner needs to answer Q1-Q5 in the planning doc
3. **POS-gated verifications** — run when POS team delivers fixes (B1/B2/B3)
4. **Backlog** — duplicate coupon, per-tier redemption UI, off-peak timezone fix
