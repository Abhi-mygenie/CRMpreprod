# MyGenie CRM - PRD

## Problem Statement
CRM for restaurant loyalty, coupons, WhatsApp automation, POS integration. Codebase from https://github.com/Abhi-mygenie/CRMpreprod.git (28-may branch). External MongoDB at `52.66.232.149:27017/mygenie`.

## Architecture
- **Frontend**: React (CRA with Craco), Tailwind CSS, Radix UI, Recharts
- **Backend**: FastAPI (Python), Motor (async MongoDB driver)
- **Database**: External MongoDB — `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- **Auth**: JWT-based with MyGenie API integration (`owner@kunafamahal.com` / `Qplazm@10` — R689 Kunafa Mahal)
- **WhatsApp**: AuthKey.io (send) + Meta Graph API (template creation) + AuthKey sync
- **POS**: MyGenie POS at `preprod.mygenie.online` — shares same MongoDB as CRM

## Sprint: ROI Measurement for CRM

### CR Status — All 14 CRs (as of 2026-05-28)

| # | CR | Status | QA |
|---|---|---|---|
| 1 | CR-005 Coupon UI/Usage/Visibility Bugs | `cr005_authenticated_qa_passed` | PASS |
| 2 | CR-002B Customer CRM Benefits Visibility | `cr002b_authenticated_qa_passed` | PASS |
| 3 | POS-CRM Cross-Sell Suggestions API | `pos_crm_cross_sell_phase_1_v1_1_shipped_pos_green` | PASS |
| 4 | CR-003 Coupon Analytics Dashboard | `cr003_phase_4_qa_passed` | PASS (P1-P4 all QA'd) |
| 5 | **CR-004 WhatsApp Utility + Marketing** | **`cr004_phase_3_live_test_passed`** | **PASS (P1-P3 all QA'd + live test delivered)** |
| 6 | CR-006 Coupon Engine POS Regression | `cr006_b11_fixed_real_data_reproduction_complete` | PASS |
| 7 | Hotfix Customer Detail Crash | `hotfix_customer_detail_crash_fixed_owner_verified` | PASS |
| 8 | CR-007 Loyalty Redemption Fix | `cr007_implemented_and_tested` | No standalone QA doc |
| 9 | CR-008 MyGenie Token Session Mgmt | `cr008_qa_passed` | PASS |
| 10 | CR-009 WhatsApp Settings Credential Toggle | `cr009_qa_passed` | PASS |
| 11 | CR-010 POS category_id Mapping | `cr010_closed_no_crm_changes_required` | PASS |
| 12 | CR-011 Coupon Optimizer (Auto-Suggest) | `cr011_registered_awaiting_discovery` | N/A |
| 13 | CR-012 WhatsApp Template Builder Production Readiness | `cr012_registered_discovery_complete` | N/A |
| 14 | CR-013 WhatsApp Template Gallery | `cr013_registered_awaiting_discovery` | N/A |

### What Was Done This Session (2026-05-28)

**P2 QA Debt — 6 QA reports written and verified:**
1. CR-003 Phase 3 QA — Custom date picker, CSV export, PDF export
2. CR-003 Phase 4 QA — ROI Score card, insight banner, per-coupon ROI column
3. CR-004 Phase 1 QA — Legacy endpoints 404, canonical variables API, text mode
4. CR-004 Phase 2 QA — Enriched variable registry, resolver, brand injection
5. CR-004 Phase 2.5 QA — Variable expansion 10→23 in 7 categories
6. CR-004 Phase 2.5-B QA — Coupon picker, coupon_pick mode

**P3a — CR-004 Phase 3: Event Reconciliation (full lifecycle):**
- Added 9 new events to CRM_EVENTS (total: 27 = 11 POS + 16 CRM)
- Fixed 2 naming mismatches (`first_visit` → `welcome_message`, `feedback_received` → `feedback_request`)
- Added 3 Tier 2 triggers: `reset_password`, `coupon_expiring`, `inactive_customer`
- Fixed 2 bugs: resend TypeError, message-filters wrong AuthKey URL
- Updated frontend to display all 16 CRM events in Automation page

**P3a — Live End-to-End Test:**
- Configured `send_bill` event → `send_bill_to_customer` template (wid=26508) for R689
- Real POS order 869305 (₹775, abhishek jain, phone 7505242126) triggered `send_bill`
- WhatsApp message delivered to customer ✅
- Confirmed: DB-driven mapping works across environments (POS→preprod, mapping in shared MongoDB)

### Next Priority Actions

**P0 — Immediate (next session):**
1. **Check AuthKey dashboard** — verify message delivery report, message_id, read receipt for order 869305
2. **Check CRM Message Status page** — verify send_bill log appears with correct details
3. **Investigate `message_id: None`** — AuthKey response parsing issue, may affect status callback tracking

**P1 — Follow-up:**
4. Add `raw_amount` variable (no "Rs." prefix) to fix double-prefix cosmetic issue
5. Add `payment_mode` + `item_summary` to POS trigger event_data
6. Test `send_bill_auto` path (POS event gateway)

**P2 — Remaining session plan:**
7. CR-011 Coupon Optimizer Discovery

### Docs Written (this session)
| Type | Path |
|---|---|
| CR-003 P3 QA | `qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_3_QA_REPORT.md` |
| CR-003 P4 QA | `qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_4_QA_REPORT.md` |
| CR-004 P1 QA | `qa/CR_004_PHASE_1_FOUNDATION_CLEANUP_QA_REPORT.md` |
| CR-004 P2 QA | `qa/CR_004_PHASE_2_VARIABLE_DB_MAPPING_QA_REPORT.md` |
| CR-004 P2.5 QA | `qa/CR_004_PHASE_2_5_VARIABLE_EXPANSION_QA_REPORT.md` |
| CR-004 P2.5-B QA | `qa/CR_004_PHASE_2_5B_COUPON_AWARE_VARIABLE_MAPPING_QA_REPORT.md` |
| CR-004 P3 Planning | `planning/CR_004_PHASE_3_EVENT_RECONCILIATION_PLAN.md` |
| CR-004 P3 Impl | `implementation/CR_004_PHASE_3_EVENT_RECONCILIATION_IMPLEMENTATION_REPORT.md` |
| CR-004 P3 QA | `qa/CR_004_PHASE_3_EVENT_RECONCILIATION_QA_REPORT.md` |
| CR-004 P3 Live Test | `qa/CR_004_PHASE_3_EVENT_RECONCILIATION_LIVE_TEST_REPORT.md` |

## Strict Rules
- Do NOT modify CRM 1.0 baseline close doc
- Do NOT merge CRs — they are separate
- Do NOT create `/app/memory/final/` — sprint not closed
- All CR docs follow lifecycle: discovery -> planning -> implementation -> qa -> handoff -> final
