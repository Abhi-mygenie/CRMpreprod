# MyGenie CRM - PRD

## Problem Statement
CRM for restaurant loyalty, coupons, WhatsApp automation, POS integration. Codebase from https://github.com/Abhi-mygenie/CRMpreprod.git (28-may branch). External MongoDB at `52.66.232.149:27017/mygenie`.

## Architecture
- **Frontend**: React (CRA with Craco), Tailwind CSS, Radix UI, Recharts
- **Backend**: FastAPI (Python), Motor (async MongoDB driver)
- **Database**: External MongoDB — `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- **Auth**: JWT-based with MyGenie API integration (`owner@kunafamahal.com` / `Qplazm@10` — R689 Kunafa Mahal)
- **WhatsApp**: AuthKey.io (send) + Meta Graph API (template creation) + AuthKey sync
- **POS**: MyGenie POS at `preprod.mygenie.online` — shares same MongoDB as CRM. POS calls production CRM, NOT this preview server.

## Sprint: ROI Measurement for CRM

### Sprint Anchor Docs
| Doc | Path |
|---|---|
| CRM 1.0 Baseline Close (DO NOT MODIFY) | `/app/memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md` |
| Sprint README | `/app/memory/crm/crm_roi_sprint/README.md` |
| CR Register (live state) | `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` |

### CR Status — All 14 CRs (as of 2026-05-28)

| # | CR | Status | QA | Next Action |
|---|---|---|---|---|
| 1 | CR-005 Coupon UI/Usage/Visibility Bugs | `cr005_authenticated_qa_passed` | ✅ | Closed |
| 2 | CR-002B Customer CRM Benefits Visibility | `cr002b_authenticated_qa_passed` | ✅ | Closed |
| 3 | POS-CRM Cross-Sell Suggestions API | `pos_crm_cross_sell_phase_1_v1_1_shipped_pos_green` | ✅ | Closed |
| 4 | CR-003 Coupon Analytics Dashboard | `cr003_phase_4_qa_passed` | ✅ P1-P4 all QA'd | Closed |
| 5 | CR-004 WhatsApp Utility + Marketing | `cr004_phase_3_live_test_passed` | ✅ P1-P3 all QA'd + live test | **P0: Check AuthKey/CRM dashboard for message 869305. Fix message_id:None** |
| 6 | CR-006 Coupon Engine POS Regression | `cr006_b11_fixed_real_data_reproduction_complete` | ✅ | Closed — awaiting owner field test |
| 7 | Hotfix Customer Detail Crash | `hotfix_customer_detail_crash_fixed_owner_verified` | ✅ | Closed |
| 8 | CR-007 Loyalty Redemption Fix | `cr007_implemented_and_tested` | ⚠️ No standalone QA doc | Optional: extract QA evidence |
| 9 | CR-008 MyGenie Token Session Mgmt | `cr008_qa_passed` | ✅ | Closed |
| 10 | CR-009 WhatsApp Settings Credential Toggle | `cr009_qa_passed` | ✅ | Closed |
| 11 | CR-010 POS category_id Mapping | `cr010_closed_no_crm_changes_required` | ✅ | Closed |
| 12 | CR-011 Coupon Optimizer (Auto-Suggest) | `cr011_registered_awaiting_discovery` | N/A | **Discovery — next in queue** |
| 13 | CR-012 WhatsApp Template Builder Production Readiness | `cr012_registered_discovery_complete` | N/A | Phase 1 Planning → Implementation |
| 14 | CR-013 WhatsApp Template Gallery | `cr013_registered_awaiting_discovery` | N/A | Blocked by CR-012 P1 |

---

## What Was Done This Session (2026-05-28)

### 1. P2 QA Debt Cleared — 6 Reports
All 6 missing QA reports written with real backend curl tests + frontend screenshots:

| Report | Scenarios | Status |
|---|---|---|
| CR-003 Phase 3 QA (Custom Date Picker + CSV/PDF) | 15 | ✅ Passed |
| CR-003 Phase 4 QA (ROI Score) | 14 | ✅ Passed |
| CR-004 Phase 1 QA (Foundation Cleanup) | 12 | ✅ Passed |
| CR-004 Phase 2 QA (Variable DB Mapping) | 14 + 19 unit tests | ✅ Passed |
| CR-004 Phase 2.5 QA (Variable Expansion 10→23) | 16 + 25 unit tests | ✅ Passed |
| CR-004 Phase 2.5-B QA (Coupon Picker) | 12 | ✅ Passed |

### 2. CR-004 Phase 3: Event Reconciliation (Full Lifecycle)

**Discovery:** Mapped all 3 event lists (master list / code triggers / DB config). Found critical drift: 7 events fired by code but invisible to owners, 14 events declared but never fired, 3 naming mismatches.

**Implementation:**
- Added 9 new events to `CRM_EVENTS` in `schemas.py` (total: 27 = 11 POS + 16 CRM)
- Renamed 2 code triggers to match master list: `first_visit` → `welcome_message`, `feedback_received` → `feedback_request`
- Added 3 new Tier 2 triggers: `reset_password` (auth OTP flow), `coupon_expiring` (daily cron), `inactive_customer` (daily cron)
- Fixed 2 bugs: resend TypeError, message-filters wrong AuthKey URL
- Updated frontend `crmEventLabels` — all 16 CRM events visible in Automation page
- Updated variable registry `fills_on_events` for renamed events
- All 50 unit tests passing

**Files changed:**
| File | Changes |
|---|---|
| `models/schemas.py` | +9 CRM_EVENTS |
| `routers/pos.py` | `first_visit` → `welcome_message` |
| `services/feedback_service.py` | `feedback_received` → `feedback_request` |
| `routers/auth.py` | Added `reset_password` WhatsApp trigger + asyncio import |
| `core/loyalty_jobs.py` | Added `run_coupon_expiry_reminders()` + `run_inactive_customer_reminders()` |
| `core/scheduler.py` | Registered new jobs in daily cron |
| `core/whatsapp_variables.py` | Updated FEEDBACK_EVENTS, fills_on_events |
| `routers/whatsapp.py` | Fixed resend bug, fixed message-filters URL, added 9 CRM event descriptions |
| `frontend/.../WhatsAppAutomationContent.jsx` | Moved 9 events into `crmEventLabels` |
| `tests/test_whatsapp_p2_5_expansion.py` | Updated `feedback_received` → `feedback_request` |

### 3. Live End-to-End Test — WhatsApp Delivered ✅

**Setup:**
- Configured `send_bill` event → `send_bill_to_customer` template (wid=26508) for R689
- Also configured `send_bill_auto` + `send_bill_manual` → same template (covers all POS paths)
- Variable mappings: {{1}}=customer_name, {{2}}=amount, {{3}}="your order" (text), {{4}}="counter" (text), {{5}}=restaurant_name

**Test:**
- Real POS order 869305 (₹775, customer "abhishek jain", phone 7505242126) placed at R689 Kunafa Mahal
- `send_bill` event triggered automatically
- Template resolved: `{1: "abhishek jain", 2: "Rs.775", 3: "your order", 4: "counter", 5: "Kunafa Mahal"}`
- WhatsApp message delivered to customer ✅ (confirmed by owner)

**Architecture discovery:** POS calls `preprod.mygenie.online` (production), not this preview server. Both share the same MongoDB. Event mapping configured on preview was read by production at trigger time. DB-driven architecture works cross-environment.

---

## Suggested Next Actions for Next Agent

### Priority 0 — Immediate (CR-004 P3 follow-up)
1. **Check AuthKey dashboard** — verify delivery report for order 869305 message (delivery status, message_id, read receipt)
2. **Check CRM Message Status page** (`/message-status`) — verify send_bill log appears with correct details
3. **Investigate `message_id: None`** in `whatsapp_message_logs` — AuthKey response not returning message_id in expected format. Affects status callback tracking. Check `send_single_message()` response parsing in `core/whatsapp.py:85-120`

### Priority 1 — CR-004 P3 Polish
4. Add `raw_amount` variable (no "Rs." prefix formatter) to fix double-prefix issue ("Rs Rs.775")
5. Add `payment_mode` and `item_summary` to POS trigger event_data for dynamic {{3}} and {{4}}
6. Test `send_bill_auto` path via POS event gateway (`POST /api/pos/event`)

### Priority 2 — CR-011 Coupon Optimizer Discovery
7. **CR-011** — Rule-based coupon suggestions based on ROI bands from CR-003 Phase 4
   - Discovery doc exists: `/app/memory/crm/crm_roi_sprint/discovery/CR_011_COUPON_OPTIMIZER_AUTO_SUGGEST_DISCOVERY.md`
   - Depends on CR-003 P4 (done) — unblocked

### Priority 3 — New Features
8. **CR-012 Phase 1** — WhatsApp Template Builder Production Readiness (buttons UI, OTP, name validation, char limits)
   - Discovery doc: `/app/memory/crm/crm_roi_sprint/discovery/CR_012_WHATSAPP_TEMPLATE_BUILDER_PRODUCTION_READINESS_DISCOVERY.md`
   - 4 items: P1-A Buttons Builder UI, P1-B Authentication OTP flow, P1-C Template Name Validation, P1-D Character Limit Counters
9. **CR-013 Template Gallery** — blocked by CR-012 P1

### Priority 4 — Deferred (not started)
10. **Segment broadcast send** — `POST /segments/{id}/send` endpoint + scheduler worker (biggest missing piece in WhatsApp module)
11. **Opt-in/opt-out** — customer field + enforcement layer (blocker before marketing broadcasts)
12. **Admin UI for event management** — owner noted this is needed for configuring new events (separate CR)

---

## Key Files Reference

| Area | Files |
|---|---|
| WhatsApp variable registry | `backend/core/whatsapp_variables.py` (23 vars, `picker: "coupon"` on 4) |
| WhatsApp resolver + send | `backend/core/whatsapp.py` (`build_body_values`, `trigger_whatsapp_event`, `send_single_message`) |
| WhatsApp router | `backend/routers/whatsapp.py` (events API, template mapping, variable mapping, message logs) |
| POS order webhook (fires send_bill) | `backend/routers/pos.py` (line 1462 — `trigger_whatsapp_event("send_bill")`) |
| Event master list | `backend/models/schemas.py` (`POS_EVENTS` 11 + `CRM_EVENTS` 16 = 27 total) |
| Daily cron jobs | `backend/core/scheduler.py` + `backend/core/loyalty_jobs.py` (birthday, anniversary, expiry, coupon_expiring, inactive_customer) |
| Coupons router | `backend/routers/coupons.py` |
| Analytics (coupon dashboard + ROI) | `backend/routers/analytics.py`, `backend/services/analytics_service.py` |
| PDF report | `backend/services/pdf_report.py` |
| Templates page (frontend) | `frontend/src/pages/TemplatesPage.jsx` |
| WhatsApp Automation page | `frontend/src/components/shared/WhatsAppAutomationContent.jsx` |
| Coupon Analytics page | `frontend/src/pages/CouponAnalyticsPage.jsx` |

## Test Credentials
- **Login:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)
- **POS API Key (X-API-Key):** `dp_live_-sF0sATfNhf72UbrG9BPaKM4icqWnAb7Q4tB6DN3ktE`
- **AuthKey API Key:** Configured (d70e42b590e7fed...)
- **Meta WABA ID:** 1427078455442831

## Strict Rules
- Do NOT modify CRM 1.0 baseline close doc
- Do NOT merge CRs — they are separate
- Do NOT create `/app/memory/final/` — sprint not closed
- All CR docs follow lifecycle: discovery → planning → implementation → qa → handoff → final
