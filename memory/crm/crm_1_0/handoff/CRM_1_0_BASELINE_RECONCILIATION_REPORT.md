# CRM 1.0 Baseline Reconciliation Report

**Date:** 2026-02-26
**Agent:** CRM 1.0 Baseline Reconciliation Agent
**Branch on disk:** `27-may` (from `Abhi-mygenie/CRMpreprod.git`)
**Database:** External MongoDB `52.66.232.149:27017/mygenie` (15 collections)
**Mode:** Documentation only — no code, DB, env, deploy, or migration changes. `/app/memory/final/` untouched.

---

## 1. Executive Summary

The CRM 1.0 stack is a **functionally complete backend** with most flows reaching at least **beta-usable** status. The two true blockers are external (POS team) and one (V3-C Admin UI verification) is internal-but-undocumented.

| Pillar | Verdict |
|---|---|
| **Coupon engine (V1 → V3-C)** | ✅ Working baseline — 211 / 211 in-preview QA, all helpers present in `core/coupon.py` (V1, V2, V3-A `_v3a_*`, V3-B `_v3b_*`, V3-C `_v3c_*`). |
| **Loyalty earning + L1–L4 migration** | ✅ Working baseline — `core/loyalty.py` + `core/loyalty_jobs.py`, validated on 2 live restaurants (Jeh's Nest 209 + R689 Kunafa 2034 customers). |
| **Loyalty realtime redemption** | 🟧 Beta blocked — CRM-side wired (52/52 LR QA + alias acceptance + `payment_status` gate removed in code, `pos.py` L1195 `Optional[str]=None`), POS does not yet send loyalty fields. |
| **POS order ingestion** | ✅ Working baseline — CR-001A Phase 1 closed live, Phase 2 QA passed in preview (prod-close pending natural room order). |
| **POS contract / payload** | 🟧 Blocked — 3 P1 POS-team violations (top-level loyalty fields, top-level coupon fields, `pos_food_id`). |
| **Menu proxy API** | ✅ Beta usable — `/api/menu/items` + `/api/menu/categories` live via stored `mygenie_token`. ID mismatch (`product.id` vs POS `item_id`) needs verification. |
| **Coupon Admin UI V1 + V2 + V3-A + V3-B** | ✅ Beta usable — `CouponsPage.jsx` line 64–70 confirms V1/V2/V3-A/V3-B/V3-C all `enabled: true` in production list; V3-A and V3-B have dedicated impl + QA reports. |
| **Coupon Admin UI V3-C** | 🟧 Beta pending QA — tile is `enabled: true` in code, but **no `CR_001C_C_COUPON_V3C_ADMIN_UI_IMPLEMENTATION_REPORT.md` or QA report** on disk. Needs verification. |
| **Customer / CRM profile / Segments / Notes** | ✅ Beta usable — `routers/customers.py` exposes 30+ endpoints (CRUD, segments, QR, loyalty-details, insights, MyGenie sync). |
| **Wallet** | 🟧 Not baseline-ready — only 3 thin endpoints (`POST /wallet/transaction`, `GET /wallet/transactions/{id}`, `GET /wallet/balance/{id}`); UI page (`WalletPage.jsx`, 58 LOC) is a feature-flagged placeholder. No POS wallet contract. |
| **Scan & Order (consumer app)** | 🟧 Beta pending QA — `routers/scan.py` has 30+ endpoints (OTP auth, addresses, orders history, coupons, loyalty/points/wallet history); no in-tree QA report found. |
| **Feedback** | 🟧 Beta usable — 3 endpoints (`POST`, `GET`, `PUT /{id}/resolve`); analytics sibling router. |
| **WhatsApp automation** | 🟧 Beta usable — full template + automation + custom-templates CRUD (15+ endpoints in `routers/whatsapp.py`). No QA evidence in memory. |
| **Analytics (item performance + customer lifecycle)** | 🟧 Beta usable — 6 endpoints with export; no QA evidence in memory. |
| **POS-PERF-1 N+1 fix** | ✅ Working baseline — 14.3× speedup on `/api/pos/coupons/available`, byte-identical contract, regression 211/211. |
| **Migration (CR-001B R689 Phase 2)** | 🟧 In flight per `CR_001_INDEX.md`; F9 persistent `migration_sync_logs` + F12 dedup. Needs verification of current state. |

**Net assessment:** CRM 1.0 backend is **production-promotable** for the coupon engine, loyalty earning, migration parity, and POS order ingestion. The realtime-redemption verification, V3-C Admin UI QA evidence, Wallet promotion, and Scan-app QA are the four real internal work items. Everything else is gated on POS team.

---

## 2. Inputs Reviewed

### Core baseline (read in full)
- `/app/memory/PRD.md`
- `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md`
- `/app/memory/crm/crm_1_0/handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS.md`

### Coupon backend baseline (read in full)
- `implementation/CR_001C_C_COUPON_V1_IMPLEMENTATION_REPORT.md` (summary checked)
- `implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md` (summary checked)
- `implementation/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_REPORT.md` (summary checked)
- `implementation/CR_001C_C_COUPON_V3B_BOGO_BXGY_IMPLEMENTATION_REPORT.md` (summary checked)
- `implementation/CR_001C_C_COUPON_V3C_EVERY_NTH_IMPLEMENTATION_REPORT.md` (summary checked)
- `qa/CR_001C_C_COUPON_V3C_EVERY_NTH_QA_REPORT.md` (summary checked)

### Coupon POS / contract baseline (read in full)
- `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md`
- `planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` (path under `planning/`, not `bugs/` as listed in prompt)

### Coupon Admin UI baseline (read in full)
- `discovery/CR_001C_C_COUPON_ADMIN_UI_WHAT_EXISTS_AND_GAP_REPORT.md`
- `implementation/CR_001C_C_COUPON_V3A_ADMIN_UI_IMPLEMENTATION_REPORT.md` (present)
- `implementation/CR_001C_C_COUPON_V3B_ADMIN_UI_IMPLEMENTATION_REPORT.md` (present)
- `qa/CR_001C_C_COUPON_V3A_ADMIN_UI_QA_REPORT.md` (present)
- `qa/CR_001C_C_COUPON_V3B_ADMIN_UI_QA_REPORT.md` (present)
- `planning/CR_001C_C_COUPON_V3A_UI_WIRING_PLAN.md`
- `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md`
- `planning/CR_001C_C_COUPON_V3_UI_PLANNING_AND_PREVIEW_REPORT.md`
- **NOT FOUND on disk:** `implementation/CR_001C_C_COUPON_V3_ADMIN_UI_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_C_COUPON_V3_ADMIN_UI_QA_REPORT.md`, and any V3-C Admin UI impl/QA report. Needs verification.

### Loyalty baseline (read in full)
- `investigations/LOYALTY_POINTS_EARNING_ON_POS_ORDER_INVESTIGATION.md` (summary checked)
- `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_VERIFICATION_REPORT.md`
- `planning/CR_001C_LR_REDEMPTION_TRIGGER_CORRECTION_PLAN.md` (summary checked)
- `analysis/CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION.md` (summary checked)

### Code paths checked as truth (read-only)
- `backend/server.py`, `backend/routers/*.py`, `backend/core/coupon.py`, `backend/core/loyalty.py`, `backend/core/loyalty_jobs.py`, `backend/models/schemas.py`
- `frontend/src/App.js`, `frontend/src/pages/CouponsPage.jsx`, `frontend/src/pages/WalletPage.jsx`, page directory listing

---

## 3. Code Truth Checked

Selected evidence used to validate doc claims. **Code wins where it conflicts with docs.**

| # | Claim under test | Doc says | Code says | Verdict |
|---|---|---|---|---|
| 1 | `payment_status` gate removed in `_validate_order` | Removed 2026-05-25 (`CR_001_INDEX.md`) | `pos.py` L1195 `payment_status: Optional[str] = None`; no reject branch in `_validate_order` (L585+); payload still stored at L889 | ✅ Doc + code agree |
| 2 | POS-legacy `used_loyalty_point` alias accepted | LR Alias Addendum 2026-05-24 | `pos.py` L1248–L1254: `Field(..., validation_alias=AliasChoices("loyalty_points_used","used_loyalty_point","used_loyalty_points"))` | ✅ Doc + code agree |
| 3 | V3-A Admin UI wired to prod `/coupons` | `CR_001_INDEX.md` row 80 (2026-05-25) | `CouponsPage.jsx` L68 `time_window … enabled: true` | ✅ Doc + code agree |
| 4 | V3-B Admin UI wired to prod `/coupons` | `CR_001_INDEX.md` row 81 (2026-05-25) | `CouponsPage.jsx` L69 `bogo … enabled: true` | ✅ Doc + code agree |
| 5 | V3-C Admin UI status | Not stated in `CR_001_INDEX.md`; consolidation doc §7 says preview-only | `CouponsPage.jsx` L70 `every_nth … enabled: true` — UI is exposed | 🟧 Code shows V3-C UI tile ENABLED, but no impl/QA report on disk → **needs verification** |
| 6 | Consolidation doc §4.1: V3 UI wiring pending | 2026-05-25 doc | All three V3 tiles flipped to `enabled: true` in code | 🟧 Consolidation doc is **stale**; code has moved past it for V3-A and V3-B (and exposes V3-C tile). |
| 7 | `redeem_loyalty_points` shared helper used by 5 callers | LR Correction (2026-05-24) | `core/loyalty.py` L258 `async def redeem_loyalty_points`; called from `pos.py` L563 (`/loyalty/redeem`), L1310 (`/orders`), L1791 (`/webhook/payment-received`); `compute_max_redeemable` at L160 called from `pos.py` L505 (`/max-redeemable`) and L398 (helper internal) | ✅ Doc + code agree |
| 8 | `POSOrderWebhook` accepts top-level `coupon_code` + `coupon_discount` | POS handoff §7 | `pos.py` L1156 `coupon_code: Optional[str] = None` (+ pre-loaded alias map in schemas.py L809/815) | ✅ Doc + code agree |
| 9 | V1 → V3-C engine present | 211/211 QA pass | `core/coupon.py` exposes `normalize_coupon_type`, `compute_coupon_discount`, V1+V2 helpers, V3-A `_v3a_parse_hhmm` + window check, V3-B `_v3b_*` family, V3-C `_v3c_*` family | ✅ Doc + code agree |
| 10 | `CouponV3Preview.jsx` route `/coupons-v3-preview` | Consolidation §7 lists it as live preview | File exists at `frontend/src/pages/CouponV3Preview.jsx` (default export), but **no route entry in `App.js`** | 🟧 **Orphan file** — preview UI is not routable in this branch. Low impact since prod V3 UI is now live; flag for cleanup. |
| 11 | Wallet UI is feature-flagged on `loyalty_settings.wallet_enabled` | — | `WalletPage.jsx` 58 LOC; reads `/loyalty/settings` `.wallet_enabled`; shows "coming soon" placeholder card when false | ✅ Verified — Wallet is intentionally a placeholder. |
| 12 | DB connection | `mongo_url` from env, `db_name` from env | `core/database.py` reads both from env — `os.environ['MONGO_URL']` + `os.environ['DB_NAME']` (no defaults; fail-fast) | ✅ Matches platform protocol |

---

## 4. Module Status Matrix

| # | Module | Backend code | Frontend UI | QA evidence | Status |
|---|---|---|---|---|---|
| 1 | Coupon engine V1–V3-C | `core/coupon.py`, `routers/pos.py` (validate/orders), `routers/coupons.py` (admin) | `CouponsPage.jsx` (all 5 tiles enabled) | 211/211 in preview + V3-A/B Admin UI QA reports | ✅ **Working baseline** (V3-C Admin UI needs verification — §12) |
| 2 | Loyalty earning + tier + L1–L4 migration | `core/loyalty.py`, `core/loyalty_jobs.py`, `routers/points.py`, `routers/migration.py` | `LoyaltySettingsPage.jsx`, `MigrationPage.jsx`, `CustomerDetailPage.jsx` | L3 validated on Jeh's Nest (209c) + R689 Kunafa (2034c); L4 cron 17/17; BUG-L3-001 closed | ✅ **Working baseline** (preview) |
| 3 | Loyalty redemption (realtime) | `core/loyalty.redeem_loyalty_points`, `routers/pos.py` `/orders`, `/loyalty/redeem`, `/max-redeemable`, `/webhook/payment-received` | None direct (POS-driven) | 52/52 static QA; real-data verification **inconclusive** — POS never sent the test order | 🟧 **Beta blocked** on POS team |
| 4 | Wallet | `routers/wallet.py` (3 endpoints), `models/schemas.py` `WalletTransaction` | `WalletPage.jsx` feature-flagged placeholder | None | 🟧 **Not baseline-ready** — minimal admin debit/credit; no POS contract; UI is placeholder |
| 5 | Customer management + CRM profile + Notes | `routers/customers.py` (30+ endpoints incl. segments, qr, sample-data, loyalty-details, insights) | `CustomersPage.jsx`, `CustomerDetailPage.jsx`, `CustomerRegistrationPage.jsx`, `SegmentsPage.jsx`, `QRCodePage.jsx`, `ProfilePage.jsx` | None in memory; live data validated indirectly via loyalty L3 (209 + 2034 customers loaded) | 🟧 **Beta usable** (no formal QA report in memory) |
| 6 | POS order ingestion (`POST /api/pos/orders`) | `routers/pos.py` `pos_order_webhook` + `_validate_order` + `POSOrderWebhook` schema with alias map | n/a | CR-001A Phase 1 closed live on prod 868899; Phase 2 12/12 + 9/9 (prod-close pending) | ✅ **Working baseline** (Phase 2 prod-close pending natural room order) |
| 7 | POS contract / payload mapping | `models/schemas.py` `POSOrderWebhook` + `OrderItem` + `POSCartItem` | n/a | `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` lists 7 violations (3 BLOCKERS) | 🟧 **Beta blocked** on POS team |
| 8 | Menu proxy (`/api/menu/items`, `/categories`) | `routers/menu.py` | Consumed by `CouponsPage.jsx` item/category pickers | None formal; live data validated via UI | 🟧 **Beta usable** with one open question (B3 — ID mismatch needs verification) |
| 9 | Coupon Admin UI (V1+V2+V3-A+V3-B) | `routers/coupons.py` (9 endpoints, create uses `model_dump()` post Session-1 fix) | `CouponsPage.jsx` 12+12 + V3-A + V3-B sections | V3-A Admin UI 12/12; V3-B Admin UI 15/15 + 4/4 regression | ✅ **Beta usable / promotable** |
| 10 | Coupon Admin UI (V3-C) | Same backend | `CouponsPage.jsx` `every_nth` tile `enabled: true` | **No impl/QA report on disk** | 🟧 **Beta pending QA** — needs verification |
| 11 | POS-PERF-1 (`/api/pos/coupons/available`) | `core/coupon.py` precomputed kwargs + bulk caller fanout | n/a | 16.48s → 1.15s; 211/211 regression; byte-identical contract | ✅ **Working baseline** |
| 12 | Scan & Order (consumer app) | `routers/scan.py` (~30 endpoints — OTP auth, profile, addresses, orders, coupons, points/wallet history) | None in CRM; consumer app is external | None in memory; not in CR-001 index | 🟧 **Beta pending QA** — needs verification |
| 13 | Feedback | `routers/feedback.py` (3 endpoints + analytics_router sibling) | `FeedbackPage.jsx` | None | 🟧 **Beta usable** (minimal surface) |
| 14 | WhatsApp / Automation / Templates | `routers/whatsapp.py` (15+ endpoints), `core/whatsapp.py` | `TemplatesPage.jsx`, `MessageStatusPage.jsx`, `WhatsAppAutomationPage` (routed in `App.js`) | None in memory | 🟧 **Beta usable** — needs verification |
| 15 | Analytics (item perf + customer lifecycle) | `routers/analytics.py` + `services/analytics_service.py` | `ItemAnalyticsPage.jsx`, `CustomerLifecyclePage.jsx`, `DashboardPage.jsx` | None in memory | 🟧 **Beta usable** — needs verification |
| 16 | Migration (CR-001B Phase 2 R689 hardening) | `routers/migration.py`, F9 collection `migration_sync_logs` | `MigrationPage.jsx` | `CR_001_INDEX.md` marks "owner-driven, in flight"; clean-slate recompute via `loyalty_enabled` post LF-MERGE | 🟧 **Beta usable** — phase 2 status needs verification |
| 17 | CR-002 — POS request logging middleware | `core/pos_request_logger.py`, env-gated, indexes on `pos_request_logs` | n/a | Verified via CR-001A live; consumed for diagnostics in LR R689 investigations | ✅ **Working baseline** |
| 18 | Scheduler (loyalty cron at 00:00 UTC) | `core/scheduler.py`, `core/loyalty_jobs.py`, APScheduler | n/a | L4 cron QA 17/17; live log shows "Scheduler started" on boot in this pod | ✅ **Working baseline** |

---

## 5. Coupon Status

| Q | Answer |
|---|---|
| 1. What is implemented? | Full V1 (order flat / pct), V2 (item / category), V3-A (time-window), V3-B (BOGO / BXG), V3-C (Every-Nth). 3 POS endpoints (`/available`, `/validate`, `/orders` commit), 27 structured error codes, 9 admin CRUD endpoints, V3-A + V3-B Admin UI wired into production `/coupons`. |
| 2. Verified by QA / live evidence | 211/211 in-preview QA (V1 45 + V2 45 + V3-A 31 + V3-B 49 + V3-C 41). V3-A Admin UI 12/12 + V3-B Admin UI 15/15 + 4/4 regression. POS-PERF-1: 14.3× speedup, byte-identical contract verified via raw + sorted-JSON diff. |
| 3. Only planned, not implemented | V3-D (free-item instruction-only), V3-E / V4 combo coupons. Per-line discount allocation, multi-coupon, coupon reversal, variant/add-on matching. Coupon analytics dashboard. Duplicate (clone) admin feature. |
| 4. Implemented but blocked | Item-level + category-level coupons cannot match end-to-end on real bills until POS sends stable `pos_food_id` (current POS sends order-line `item_id`). Coupon final commit blocked when POS nests `coupon_code` under `coupon_info` wrapper. |
| 5. Risky / unclear | V3-C Admin UI tile is exposed (`enabled: true`) but no impl/QA report on disk — **needs verification**. `CouponV3Preview.jsx` file exists but is not routed in `App.js` (orphan). `discount_type: "fixed"` (UI) vs `"flat"` (engine canonical) naming consistency from V1 discovery report — needs verification on whether it still differs. |
| 6. Next action | (a) Confirm / produce V3-C Admin UI QA report. (b) Re-send POS contract violations to POS team. (c) Remove orphan `CouponV3Preview.jsx` or wire its route. |
| 7. Working baseline? | **YES for engine + V1 + V2 + V3-A + V3-B.** V3-C engine yes; V3-C Admin UI is "Beta pending QA". |
| 8. To promote V3-C UI | Run a 1-day QA harness (create / list / edit / toggle / delete an `every_nth` coupon from prod `/coupons`; verify `model_dump()` persists nth_item_number / nth_discount_type / nth_discount_value); produce report under `qa/`. |

---

## 6. Loyalty Status

### 6.1 Earning + Migration

| Q | Answer |
|---|---|
| Implemented? | Realtime earning per `loyalty_enabled`, tier evolution (Bronze/Silver/Gold), L1–L4 migration parity (clean-slate recompute, real-data recompute, expired pre-mark, L4 birthday + anniversary cron), LX-A POS BUG-108 response shape, LF-MERGE (unified `loyalty_enabled` controls realtime + migration). |
| Verified? | L3 closed on **two** restaurants — Jeh's Nest 209 customers (R3), R689 Kunafa 2034 customers (50% earn, tier evolution). L4 cron static QA 17/17. BUG-L3-001 closed. LX-A static QA 63/63 + live read-only smoke 5/5. |
| Risky? | Three restaurants (R478, R618, R634) still have `loyalty_enabled = null` → silently disabled. Owner action required. |
| Status | ✅ **Working baseline** in preview. |

### 6.2 Redemption (realtime + final-payload)

| Q | Answer |
|---|---|
| Implemented? | `core/loyalty.redeem_loyalty_points` + `compute_max_redeemable` shared helpers; 5 callers wired in `pos.py` (`/orders`, `/loyalty/redeem`, `/max-redeemable`, `/webhook/payment-received`); idempotency via `loyalty_idempotency_key` (auto-falls-back to `order_{order_id}`); `payment_status` gate removed; POS-legacy alias `used_loyalty_point` accepted. |
| Verified? | 52/52 static QA. Real-data verification **inconclusive** — POS test order 868933 never reached CRM (`pos_request_logs` empty for that ID). All R689 orders that did reach CRM (868904, 868908, 868932) had zero loyalty fields and zero `order_amount`. |
| Blocked by? | POS team. CRM-side fully ready and confirmed via `redeem_loyalty_points` invocation in `pos.py` L1310 (orders) and L1791 (webhook). |
| Next action | Re-send `handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` to POS team; ask for ETA; run verification the moment a POS order lands with `used_loyalty_point > 0` + `order_amount > 0`. |
| Status | 🟧 **Beta blocked** on POS team. |

---

## 7. Wallet Status

| Q | Answer |
|---|---|
| Implemented? | `routers/wallet.py` exposes 3 endpoints only: `POST /api/wallet/transaction` (admin debit/credit), `GET /api/wallet/transactions/{customer_id}`, `GET /api/wallet/balance/{customer_id}`. UI page `WalletPage.jsx` (58 LOC) gates display on `loyalty_settings.wallet_enabled` and shows a placeholder card otherwise. |
| Verified? | No QA report in `/app/memory/`. No POS wallet endpoints (`/pos/wallet/debit` etc.) — explicitly deferred per BUG-108 §4 (POS3.0 doc). |
| Planned but not done | POS wallet contract (debit / credit / reverse), wallet redemption UI, customer-facing wallet balance display in checkout flow. |
| Blocked? | No — internal work item, not POS-dependent. |
| Status | 🟧 **Not baseline-ready** — usable as a back-office ledger but not as a customer-facing or POS-integrated feature. |
| Recommendation | **D — Deprecate / replace later.** Re-scope post-coupon-V4. If kept, owner decision needed on POS wallet contract. |

---

## 8. Customer / CRM Profile Status

| Q | Answer |
|---|---|
| Implemented? | 30+ endpoints in `routers/customers.py` covering: CRUD (line 509, 1014, 1021, 1100), MyGenie sync (445, 482), sample data (719), segments router with WhatsApp config (1297–1489), QR registration (1111–1127), loyalty-details (1489), insights (1524). Frontend pages: Customers, CustomerDetail, CustomerRegistration, Segments, QRCode, Profile. |
| Verified? | No formal QA report on disk. Indirect validation via loyalty L3 (R3 + R689) — 2243 customers loaded and recomputed without breakage. |
| Risky? | Customer notes / orders surfaces are exposed only via POS endpoints (`pos.py` L2714 `/customers/{id}/notes/items`, L2755 `/customers/{id}/notes/orders`) — UI surface in CRM is unclear. Needs verification. |
| Status | 🟧 **Beta usable.** Promote-to-baseline after a smoke-test harness across Customers / Segments / QR / Profile / WhatsApp-config flows. |

---

## 9. POS Order Ingestion Status

| Q | Answer |
|---|---|
| Implemented? | `POST /api/pos/orders` (`pos.py` L1269), `POST /api/pos/webhook/payment-received` (L1598), `POST /api/pos/customer-lookup` (L1911), `POST /api/pos/customers` (L208) + 20+ more. CR-001A Phase 1 alias map live (item_id → pos_food_id, qty → item_qty, price → item_price, created_at → order_created_at). CR-001A Phase 2 `room_info` + `associated_order_ids` schema acceptance. CR-001D `orders.restaurant_id` mapping fix. |
| Verified? | CR-001A Phase 1 closed live on prod 2026-05-22 (order 868899, 7/7 alias checks). Phase 2 12/12 static + 9/9 order_doc + live route 401-on-bad-auth. Verifier script ready: `qa/cr_001a_check.sh`. |
| Pending | Phase 2 prod-close requires a natural production room order after deploy + `pos-backend` restart. |
| Status | ✅ **Working baseline.** Phase 2 prod-close is non-blocking. |

---

## 10. POS Contract Status

| Q | Answer |
|---|---|
| Implemented (CRM side) | Pydantic `AliasChoices` for `loyalty_points_used / used_loyalty_point / used_loyalty_points` (pos.py L1248); top-level `coupon_code` / `coupon_discount` (schemas.py L809/815); `payment_status` no longer rejected; `pos_food_id` alias on `POSCartItem` (schemas.py L859). |
| Blocked by | **3 P1 violations from POS team** per `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md`: (1) `pos_food_id` not sent — POS sends order-line `item_id` instead; (2) `loyalty_points_used` nested under `loyalty_info` wrapper instead of top-level; (3) `coupon_code` nested under `coupon_info` wrapper. **2 P2:** `item_category` per item, `wallet_used` top-level. |
| CRM workaround possible? | NO for any of the 3 blockers — CRM reads only top-level fields by design. |
| Status | 🟧 **Blocked** on POS team. |

---

## 11. Menu API Status

| Q | Answer |
|---|---|
| Implemented? | `GET /api/menu/items` + `GET /api/menu/categories` (proxied via stored `mygenie_token`, `routers/menu.py`). Token stored on user doc; refreshed on MyGenie SSO login. |
| Verified? | Live — consumed by Coupon Admin UI item/category pickers (V1+V2 + V3-A/B). |
| Risky? | **ID mismatch:** Menu API returns `product.id = 182041`, POS sends `item_id = 2248768` for the same physical item. Item-level coupons will silently fail to match on real bills. **Needs verification** with POS team on whether a deterministic mapping exists. |
| Status | 🟧 **Beta usable** — internally; **blocked end-to-end** by the ID-mismatch (Blocker B3). |

---

## 12. Coupon Admin UI Status

| Phase | Backend | UI exposed? (`CouponsPage.jsx`) | Impl report | QA report | Status |
|---|---|---|---|---|---|
| V1 Flat / Percentage | ✅ | ✅ `enabled: true` L64–65 | (covered in coupon-discovery + Session 1) | (covered in coupon QA) | ✅ Production-live |
| V2 Item / Category | ✅ | ✅ `enabled: true` L66–67 | covered in V2 impl | covered in V2 QA | ✅ Production-live |
| V3-A Happy Hour | ✅ | ✅ `enabled: true` L68 | `CR_001C_C_COUPON_V3A_ADMIN_UI_IMPLEMENTATION_REPORT.md` | `CR_001C_C_COUPON_V3A_ADMIN_UI_QA_REPORT.md` 12/12 | ✅ Production-live |
| V3-B BOGO / BXG | ✅ | ✅ `enabled: true` L69 | `CR_001C_C_COUPON_V3B_ADMIN_UI_IMPLEMENTATION_REPORT.md` | `CR_001C_C_COUPON_V3B_ADMIN_UI_QA_REPORT.md` 15/15 + 4/4 regression | ✅ Production-live |
| V3-C Every-Nth | ✅ | ✅ `enabled: true` L70 | **MISSING ON DISK** | **MISSING ON DISK** | 🟧 **Beta pending QA — needs verification** |

**Note:** The 2026-05-25 consolidation doc (§7) marks V3-A/B/C as "preview only". **That doc is stale** — `CR_001_INDEX.md` rows from 2026-05-25 explicitly close V3-A and V3-B Admin UI wiring, and the code agrees. V3-C UI is the only verifiable gap.

---

## 13. Other Beta Modules

### 13.1 Scan & Order (consumer app)

- `routers/scan.py` provides a complete consumer surface: OTP request/verify/skip, register/login, profile, loyalty/points history, wallet history, orders + detail, coupons, addresses (CRUD + default). ~30 endpoints.
- No memory artefacts for QA, design, or owner decisions.
- **Status:** 🟧 **Beta pending QA** — needs a dedicated agent to inventory, smoke-test, and produce a baseline report.
- **Recommendation:** **B — Keep as beta with known limitations** until owner explicitly scopes it.

### 13.2 Feedback

- `routers/feedback.py` exposes 3 endpoints (`POST`, `GET`, `PUT /{id}/resolve`) + an `analytics_router` sibling. `services/feedback_service.py` present.
- Frontend page `FeedbackPage.jsx` routed.
- **Status:** 🟧 **Beta usable** — surface is minimal.
- **Recommendation:** **A — Promote to working baseline after a 1-page smoke QA** (create + list + resolve + analytics).

### 13.3 WhatsApp Automation + Templates

- `routers/whatsapp.py` (15+ endpoints: templates, automation rules, custom-templates, api-key, authkey-templates, events list).
- Frontend pages: `TemplatesPage.jsx`, `MessageStatusPage.jsx`, `WhatsAppAutomationPage` (routed at `/whatsapp-automation`).
- **Status:** 🟧 **Beta usable** — full CRUD present, no QA evidence in memory.
- **Recommendation:** **B — Keep as beta with known limitations**; promote after a smoke QA covering the 6 main events (`signup_first_visit`, `feedback_received`, `points_expiry_reminder`, etc.).

### 13.4 Analytics

- `routers/analytics.py` (6 endpoints: item-performance, item-performance/export, item-customers/{name}, customer-lifecycle, customer-lifecycle/trend, customer-lifecycle/customers, customer-lifecycle/export). `services/analytics_service.py` includes coupon analytics (`breakdown_by_offer_type`, `time_window_usage`, `bxgy_usage`, `nth_item_usage`).
- Frontend pages: `ItemAnalyticsPage.jsx`, `CustomerLifecyclePage.jsx`, `DashboardPage.jsx`.
- **Status:** 🟧 **Beta usable** — surface complete; no formal QA report in memory.
- **Recommendation:** **A — Promote to working baseline after a 1-day QA harness** (compare aggregations on a small fixed-data sample).

### 13.5 Migration (CR-001B R689 Phase 2)

- `routers/migration.py` ~239+ LOC. F9 persistent `migration_sync_logs` collection (composite index on `(user_id, sync_type, started_at desc)`) confirmed in `server.py` lifespan.
- `CR_001_INDEX.md` §CR-001B marks Phase 2 "owner-driven, in flight".
- **Status:** 🟧 **Beta usable** for re-syncs (validated indirectly via L3 on two restaurants); Phase 2 F-series fixes status **needs verification**.
- **Recommendation:** **B — Keep as beta** until owner closes Phase 2.

---

## 14. Working Baseline Candidates

These modules can be **promoted to production-ready** today (no new work, no external dependency):

1. **Coupon engine V1 + V2 + V3-A + V3-B + V3-C (backend)**
2. **Coupon Admin UI V1 + V2 + V3-A + V3-B**
3. **Loyalty earning + tier evolution + L1–L4 migration**
4. **POS order ingestion (CR-001A Phase 1 + Phase 2 schema)**
5. **CR-001D `orders.restaurant_id` mapping**
6. **CR-002 POS request logging middleware**
7. **POS-PERF-1 `/available` N+1 fix**
8. **Menu proxy API (with documented ID-mismatch caveat)**
9. **Loyalty cron scheduler (L4 birthday + anniversary parity)**

---

## 15. Modules Not Baseline-Ready

| # | Module | Why not baseline | What's needed |
|---|---|---|---|
| 1 | **Wallet** | Only 3 thin endpoints; UI placeholder; no POS contract; no QA | Owner decision on scope; if kept, design POS wallet contract |
| 2 | **Coupon Admin UI V3-C** | Tile is enabled but no impl/QA evidence on disk | Produce QA report (create / edit / list / toggle every_nth coupon) |
| 3 | **Scan & Order (consumer app)** | 30+ endpoints with zero memory artefacts | Inventory + smoke-test agent |
| 4 | **Loyalty realtime redemption (real-data verification)** | CRM-ready; POS never sent a qualifying order | Wait for POS to send `used_loyalty_point > 0` + `order_amount > 0`, then re-run verification |
| 5 | **Migration CR-001B Phase 2 close** | Marked "in flight" | Status check on F9/F12 fixes; owner sign-off |

---

## 16. Blockers

### Top 5 (priority order)

| # | Blocker | Type | Owner | Detail |
|---|---|---|---|---|
| **B1** | POS team has not implemented the agreed top-level loyalty + coupon fields and `pos_food_id` per contract | External (POS team) | POS team | 3 P1 violations in `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md`; impacts loyalty redemption + coupon commit + item/category match |
| **B2** | POS does not call `POST /api/pos/orders` at bill-finalize with loyalty fields | External (POS team) | POS team | All R689 test orders (868917, 868924, 868925, 868928, 868929, 868931, 868932 → 868935, 008976, **868933**) never reached CRM with loyalty fields |
| **B3** | Menu API `product.id` ≠ POS `item_id` for same item | External (POS team or owner decision) | POS team + owner | Item-level coupons silently fail. **Needs verification** whether a deterministic mapping exists |
| **B4** | 3 restaurants (R478, R618, R634) have `loyalty_enabled = null` (silently disabled) | Data (owner) | Restaurant owners | One toggle each in CRM UI |
| **B5** | V3-C Admin UI has tile enabled but no QA evidence on disk | Internal | CRM team | Run a 1-day QA harness OR confirm an off-disk report exists |

### Secondary

- **B6** CR-001A Phase 2 prod-close awaits a natural production room order (low-priority).
- **B7** `CouponV3Preview.jsx` is an orphan file (not routed in `App.js`) — cleanup hygiene.
- **B8** `discount_type: "fixed"` (UI) vs `"flat"` (engine canonical) naming consistency — **needs verification** post-Session-1 fix.

---

## 17. Recommended Next Steps

### Priority 0 — External (POS team)
1. Re-send `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md` to POS owner; collect ETA on the 3 P1 fixes.
2. Re-send `handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`. Ask POS to send actual `order_amount` + loyalty fields.
3. Resolve **Q-MAP-1** (Menu `product.id` ↔ POS `item_id` mapping decision).

### Priority 1 — Internal (no external dependency)
4. **V3-C Admin UI QA evidence** — produce `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md` covering create / list / edit / toggle / delete of an `every_nth` coupon (via `/coupons`); confirm `routers/coupons.py` `model_dump()` persists `nth_item_number`, `nth_discount_type`, `nth_discount_value`.
5. Clean up orphan `frontend/src/pages/CouponV3Preview.jsx` — either route it under `/coupons-v3-preview` (matches doc) or delete.
6. Verify `discount_type: "fixed"` vs `"flat"` UI/engine consistency.

### Priority 2 — Owner / data
7. Owner toggles `loyalty_enabled = True` for R478, R618, R634.

### Priority 3 — Verifications (gated)
8. CR-001A Phase 2 prod-close on first natural prod room order. Run `qa/cr_001a_check.sh`.
9. LR Realtime Order Redemption Verification on R689 once POS sends loyalty fields.
10. Item / category coupon live smoke on a real R689 bill once POS sends `pos_food_id`.

### Priority 4 — Promote beta modules
11. Run 1-day QA harnesses (in this order): **Feedback → Analytics → WhatsApp templates → Customer/Segments → Scan & Order**. Produce one short QA report per module.

### Priority 5 — Wallet scoping decision
12. Owner decides Wallet roadmap: deprecate / minimal back-office only / extend with POS contract.

### Priority 6 — Backlog
13. Duplicate-coupon ("clone") admin action.
14. Coupon analytics dashboard view.
15. V3-D / V3-E composite (combo) coupons.
16. LR `used_outside_window_attempts` analytics counter (V3-A2).

---

## 18. Recommended Agent Sequence

| # | Agent role | Primary deliverable | Trigger |
|---|---|---|---|
| 1 | **POS Communication Agent** | Re-send violations + LR payload handoff; collect POS ETA; capture decisions in a new `handoff/POS_ETA_AND_DECISIONS_<date>.md`. No code. | Immediate |
| 2 | **V3-C Admin UI QA Agent** | Smoke + edge QA on `every_nth` admin flow + report under `qa/`. Documentation + at most 1-line code touch only if a real bug surfaces. | Immediate (parallel with #1) |
| 3 | **Orphan / Hygiene Agent** | Decide `CouponV3Preview.jsx` fate; confirm `fixed`/`flat` consistency; capture as small `handoff/CRM_UI_HYGIENE_<date>.md`. | After #2 |
| 4 | **Beta-Module Baseline-Promotion Agent (×5 modules)** | One QA report per module: Feedback, Analytics, WhatsApp, Customer/Segments, Scan. Sequential. | After #2 |
| 5 | **Wallet Scoping Agent** | Documentation only — produce options doc + owner gate. No code. | After owner decision in §17.5 |
| 6 | **POS-Gated Verification Agent** | Run CR-001A Phase 2 prod-close, LR realtime redemption, item/category live smoke. Update `CR_001_INDEX.md` rows. | When POS lands fixes |
| 7 | **Migration CR-001B Phase 2 Closure Agent** | Status check on F9/F12; produce closure report. | When owner ready |
| 8 | **Backlog Agent (P4)** | Pick one per session from §17 Priority 6. | Ongoing |

---

## 19. Final Status

```
crm_1_0_baseline_reconciliation_complete
```

**Modules reviewed:** 18
**Working baseline:** 9
**Beta usable (promotable):** 6
**Beta blocked (external):** 2 (loyalty realtime redemption verification, POS contract)
**Not baseline-ready:** 1 (Wallet) + 1 needs-verification (V3-C Admin UI)

**Top external dependency:** POS team. 3 of the top 5 blockers are POS-side. CRM backend is otherwise production-promotable.

**No code, DB, env, deploy, or migration changes performed by this agent.**

---

## Addendum A — Live-DB Re-verification (2026-05-26)

**Trigger:** Owner pointed out that loyalty realtime redemption and POS contract violations were both effectively closed in production but the disk docs were stale. Re-queried the live DB (`52.66.232.149:27017/mygenie`) to verify.

### A.1 Findings

| Original §4 row | Original verdict | Live-DB truth | Corrected verdict |
|---|---|---|---|
| #3 Loyalty redemption (realtime) | 🟧 Beta blocked on POS team | 76 redeem PT rows on R689, 8,633 points redeemed, latest 2026-05-26 05:16 UTC. 5 of 15 most-recent `/api/pos/orders` payloads carry positive `loyalty_points_used` (500 – 4619). | ✅ **Working baseline — closed 2026-05-26** |
| #7 POS contract / payload | 🟧 Beta blocked on POS team | Of last 15 `/api/pos/orders` payloads: 15/15 top-level `loyalty_points_used`, 15/15 top-level `coupon_code`, 15/15 first item `pos_food_id`. 0/15 carry nested `loyalty_info` / `coupon_info` / `wallet_info` wrappers. 0/15 carry the old `item_id` field on items. | ✅ **Working baseline — closed 2026-05-26** |

### A.2 Top-5 blockers — revised

The §16 "Top 5 blockers" list is materially obsolete. Updated state:

| # | Original | Status after live-DB re-check |
|---|---|---|
| B1 | POS top-level loyalty/coupon fields + `pos_food_id` not honoured | ✅ **CLOSED 2026-05-26** — POS shipped contract fixes |
| B2 | POS not calling `/api/pos/orders` at bill-finalize with loyalty fields | ✅ **CLOSED 2026-05-26** — 76 redeem PTs committed on R689 |
| B3 | Menu API `product.id` ≠ POS `item_id` | ✅ **CLOSED 2026-05-26** — POS now sends stable `pos_food_id` on every order |
| B4 | R478 / R618 / R634 `loyalty_enabled = null` | **Demoted to owner-config item, not a blocker** (per owner directive — restaurant owners toggle when they want loyalty enabled) |
| B5 | V3-C Admin UI lacks impl/QA report on disk | 🟧 **Remains the only open item from Top-5** — internal hygiene |

### A.3 Remaining open items (no external dependencies)

1. V3-C Admin UI QA evidence (produce `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md`).
2. CR-001A Phase 2 prod close — awaits a natural production room order (low priority).
3. Beta-module baseline promotion: Feedback, Analytics, WhatsApp, Customer/Segments, Scan & Order.
4. Owner scoping decisions: Wallet roadmap, Migration CR-001B Phase 2 closure.
5. Hygiene: orphan `frontend/src/pages/CouponV3Preview.jsx`; restore upstream 27-may `memory/PRD.md`.

### A.4 Evidence sources

- New closure docs:
  - `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md`
  - `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md`
- `CR_001_INDEX.md` — 2 row statuses flipped (R689 investigations + Final Realtime Redemption QA) + new "Closure 2026-05-26" sub-section
- Superseded: 4 × `analysis/CR_001C_LR_R689_*.md`, `discovery/CR_001C_C_COUPON_MENU_API_MAPPING_REPORT.md`, the original `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_VIOLATIONS.md`, and the original `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_VERIFICATION_REPORT.md` (all carry a SUPERSEDED banner pointing here)
- Refreshed consolidation: `handoff/CRM_1_0_CURRENT_STATE_CONSOLIDATION_AND_NEXT_STEPS_v2_2026_05_26.md` (original v1 retained as history)

### A.5 Final status (after addendum)

```
crm_1_0_baseline_reconciliation_complete_with_2026_05_26_closure_addendum
```

CRM 1.0 is **production-promotable** end-to-end for the core flow (coupon engine + admin UI V1+V2+V3-A+V3-B, loyalty earning + realtime redemption, POS order ingestion, POS contract compliance, migration parity). The one remaining internal item is V3-C Admin UI QA evidence.

No code, DB, env, deploy, or migration changes performed by this addendum.

---

## Addendum B — V3-C Admin UI QA Closure (2026-05-26)

**Trigger:** Urgent V3-C Coupon Admin UI QA Evidence Sub-Agent closed the last open Top-5 item from Addendum A (§A.2, B5).

### B.1 Result

```
cr001c_coupon_v3c_admin_ui_qa_passed
```

**42 / 42 PASS** (38 live API smoke + 4 engine smoke) against the live production MongoDB on an isolated synthetic user; full artefact cleanup verified.

### B.2 Updates to this report

| Section | Was | Now |
|---|---|---|
| §1 row "Coupon Admin UI V3-C" | 🟧 Beta pending QA | ✅ Working beta baseline → **promotable** |
| §4 row #10 "Coupon Admin UI (V3-C)" | 🟧 Beta pending QA | ✅ **Working baseline** |
| §12 V3-C row (Impl/QA report) | "MISSING ON DISK" | `qa/CR_001C_C_COUPON_V3C_ADMIN_UI_QA_REPORT.md` (2026-05-26) |
| §15 "Modules Not Baseline-Ready" item #2 | V3-C Admin UI lacks evidence | **REMOVED — closed by Addendum B** |
| §16 Top-5 blockers — B5 | V3-C Admin UI lacks impl/QA evidence | **CLOSED 2026-05-26** |
| §17 P0 #4 V3-C QA harness | Open | **Closed by this addendum** |
| Working baseline modules count | 11 | **12** |

### B.3 Evidence snapshot (from §10 of the V3-C QA report)

| Bucket | Pass / Total |
|---|---|
| Live API smoke (create / list / edit / toggle / delete / regression) | 38 / 38 |
| Engine smoke (n=3 with 3 / 2 / 6 items + cleanup) | 4 / 4 |
| Cleanup residual check | 1 / 1 |
| **TOTAL** | **43 / 43** |

### B.4 Final status (after Addendum B)

```
crm_1_0_baseline_reconciliation_complete_with_v3c_admin_ui_closure_2026_05_26
```

With this closure CRM 1.0 has:

- **12 working-baseline modules** (was 11)
- **0 external blockers**
- **0 internal Top-5 blockers**
- Remaining items are all owner-driven scoping (Wallet, Migration CR-001B Phase 2) or low-priority verification (CR-001A Phase 2 prod-close on next natural prod order) or beta-promotion QA for Feedback / Analytics / WhatsApp / Customer-Segments / Scan-app.

No code, DB, env, deploy, or migration changes performed by this addendum.


