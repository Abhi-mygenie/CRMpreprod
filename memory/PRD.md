# MyGenie CRM - PRD

## Problem Statement
CRM for restaurant loyalty, coupons, WhatsApp automation, POS integration. Codebase from https://github.com/Abhi-mygenie/CRMpreprod.git (28-may branch). External MongoDB at `52.66.232.149:27017/mygenie`.

## Architecture
- **Frontend**: React (CRA with Craco), Tailwind CSS, Radix UI, Recharts
- **Backend**: FastAPI (Python), Motor (async MongoDB driver)
- **Database**: External MongoDB — `mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie`
- **Auth**: JWT-based with MyGenie API integration (`owner@kunafamahal.com` / `Qplazm@10` — R689 Kunafa Mahal)
- **WhatsApp**: AuthKey.io (send) + Meta Graph API (template creation) + AuthKey sync

## Sprint: ROI Measurement for CRM

### CR Status — All 14 CRs (as of 2026-05-28)

| # | CR | Status | QA |
|---|---|---|---|
| 1 | CR-005 Coupon UI/Usage/Visibility Bugs | `cr005_authenticated_qa_passed` | PASS |
| 2 | CR-002B Customer CRM Benefits Visibility | `cr002b_authenticated_qa_passed` | PASS |
| 3 | POS-CRM Cross-Sell Suggestions API | `pos_crm_cross_sell_phase_1_v1_1_shipped_pos_green` | PASS |
| 4 | CR-003 Coupon Analytics Dashboard | `cr003_phase_4_qa_passed` | PASS (P1-P4 all QA'd) |
| 5 | CR-004 WhatsApp Utility + Marketing | `cr004_phase_2_5b_qa_passed` | PASS (P1/P2/P2.5/P2.5-B all QA'd) |
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
1. **CR-003 Phase 3 QA** — Custom date picker, CSV export (13 columns), PDF export (branded reportlab). 15 scenarios all passed.
2. **CR-003 Phase 4 QA** — ROI Score card, insight banner, per-coupon ROI column with band coloring (Strong/Good/Watch/Risk), CSV/PDF ROI fields. 14 scenarios all passed.
3. **CR-004 Phase 1 QA** — Legacy endpoints 404, canonical variables API (23 vars), text mode at send time, legacy UI modals removed. Residual auth.py bug confirmed fixed. 12 scenarios all passed.
4. **CR-004 Phase 2 QA** — Enriched variable registry with `sources/fills_on_events/formatter`, resolver function, brand data injection, validator warnings. 19 unit tests + 14 scenarios all passed.
5. **CR-004 Phase 2.5 QA** — Variable expansion 10→23 in 7 categories, sample-data endpoint, P2 regression. 25 unit tests + 16 scenarios all passed.
6. **CR-004 Phase 2.5-B QA** — Coupon summary API, `coupon_pick` validation, picker field on 4 coupon vars, 3-mode toggle UI, auto-fill siblings. 12 scenarios all passed.

**Combined test suite:** 50 unit tests all green (`test_whatsapp_*.py`)

### Session Plan Remaining
- **P3a:** CR-004 P3 Event Reconciliation
- **P3b:** CR-011 Coupon Optimizer Discovery

### QA Reports Written (this session)
| Report | Path |
|---|---|
| CR-003 Phase 3 QA | `/app/memory/crm/crm_roi_sprint/qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_3_QA_REPORT.md` |
| CR-003 Phase 4 QA | `/app/memory/crm/crm_roi_sprint/qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_4_QA_REPORT.md` |
| CR-004 Phase 1 QA | `/app/memory/crm/crm_roi_sprint/qa/CR_004_PHASE_1_FOUNDATION_CLEANUP_QA_REPORT.md` |
| CR-004 Phase 2 QA | `/app/memory/crm/crm_roi_sprint/qa/CR_004_PHASE_2_VARIABLE_DB_MAPPING_QA_REPORT.md` |
| CR-004 Phase 2.5 QA | `/app/memory/crm/crm_roi_sprint/qa/CR_004_PHASE_2_5_VARIABLE_EXPANSION_QA_REPORT.md` |
| CR-004 Phase 2.5-B QA | `/app/memory/crm/crm_roi_sprint/qa/CR_004_PHASE_2_5B_COUPON_AWARE_VARIABLE_MAPPING_QA_REPORT.md` |

## Key Files Reference
| Area | Files |
|---|---|
| WhatsApp variable registry | `backend/core/whatsapp_variables.py` (23 vars, `picker: "coupon"` on 4) |
| WhatsApp resolver + send | `backend/core/whatsapp.py` (`build_body_values` with `coupon_pick` mode) |
| WhatsApp router | `backend/routers/whatsapp.py` |
| Coupons router | `backend/routers/coupons.py` |
| Analytics | `backend/routers/analytics.py`, `backend/services/analytics_service.py` |
| PDF report | `backend/services/pdf_report.py` |
| Templates page | `frontend/src/pages/TemplatesPage.jsx` |
| WhatsApp Automation | `frontend/src/components/shared/WhatsAppAutomationContent.jsx` |
| Coupon Analytics | `frontend/src/pages/CouponAnalyticsPage.jsx` |

## Strict Rules
- Do NOT modify CRM 1.0 baseline close doc
- Do NOT merge CRs — they are separate
- Do NOT create `/app/memory/final/` — sprint not closed
- All CR docs follow lifecycle: discovery -> planning -> implementation -> qa -> handoff -> final
