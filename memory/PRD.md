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
| Remove dead `/coupons-v3-preview` page + route | 2 min | Delete `CouponV3Preview.jsx`, remove 2 lines from `App.js` |

---

## External Blockers (POS Team)

| # | Blocker | Impact | CRM Status | Doc |
|---|---|---|---|---|
| B1 | POS missing `pos_food_id` | Item/category coupons can't match | CRM ready | `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` |
| B2 | Coupon fields nested in `coupon_info` | Coupon commit won't trigger | CRM ready | Same |
| B3 | Loyalty fields nested in `loyalty_info` | Redemption won't trigger | CRM ready | Same |

---

## Backlog (Prioritized)

### P1 — Internal (no external dependency)
- CR-003: Coupon analytics dashboard (backend data ready, needs frontend view) — `planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md`
- Preview page cleanup (2 min)

### P2 — Owner Actions
- Toggle `loyalty_enabled=True` for R478, R618, R634 (currently null → silently disabled)
- R689 `mygenie_token` expired — owner re-login refreshes (affects item/category pickers)

### P3 — Gated on POS Team
- CR-001C-LR Realtime Order Redemption Verification (needs POS to send loyalty fields)
- CR-001A Phase 2 prod close (needs natural prod room order)
- Item/category coupon live smoke on real bills (needs `pos_food_id`)

### P4 — Future
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
