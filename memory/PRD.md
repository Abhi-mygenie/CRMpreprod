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

### Sprint Anchor Docs
| Doc | Path |
|---|---|
| CRM 1.0 Baseline Close (DO NOT MODIFY) | `/app/memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md` |
| Sprint README | `/app/memory/crm/crm_roi_sprint/README.md` |
| CR Register (live state) | `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` |

### CR Status — All 14 CRs (as of 2026-05-28)

| # | CR | Status | QA | Next Action |
|---|---|---|---|---|
| 1 | CR-005 Coupon UI/Usage/Visibility Bugs | `cr005_authenticated_qa_passed` | PASS | Closed |
| 2 | CR-002B Customer CRM Benefits Visibility | `cr002b_authenticated_qa_passed` | PASS | Closed |
| 3 | POS-CRM Cross-Sell Suggestions API | `pos_crm_cross_sell_phase_1_v1_1_shipped_pos_green` | PASS | Closed |
| 4 | CR-003 Coupon Analytics Dashboard | `cr003_phase_4_owner_verified` | P3+P4 QA missing | Write QA reports for Phase 3 (CSV/PDF/custom date) + Phase 4 (ROI Score) |
| 5 | CR-004 WhatsApp Utility + Marketing | `cr004_phase_2_5b_implemented` | P1/P2/P2.5/P2.5-B QA missing | QA backlog OR proceed to P3 Event Reconciliation |
| 6 | CR-006 Coupon Engine POS Regression | `cr006_b11_fixed_real_data_reproduction_complete` | PASS | Closed — awaiting owner field test |
| 7 | Hotfix Customer Detail Crash | `hotfix_customer_detail_crash_fixed_owner_verified` | PASS | Closed |
| 8 | CR-007 Loyalty Redemption Fix | `cr007_implemented_and_tested` | No standalone QA doc | Optional: extract QA evidence |
| 9 | CR-008 MyGenie Token Session Mgmt | `cr008_qa_passed` | PASS | Closed |
| 10 | CR-009 WhatsApp Settings Credential Toggle | `cr009_qa_passed` | PASS | Closed |
| 11 | CR-010 POS category_id Mapping | `cr010_closed_no_crm_changes_required` | PASS | Closed |
| 12 | CR-011 Coupon Optimizer (Auto-Suggest) | `cr011_registered_awaiting_discovery` | N/A | Discovery — depends on CR-003 P4 (done) |
| 13 | CR-012 WhatsApp Template Builder Production Readiness | `cr012_registered_discovery_complete` | N/A | Phase 1 Planning -> Implementation |
| 14 | CR-013 WhatsApp Template Gallery | `cr013_registered_awaiting_discovery` | N/A | Blocked by CR-012 P1 |

### What's Been Implemented (2026-05-28)
1. Cloned repo from `28-may` branch, configured external MongoDB, deployed app
2. All backend routers: auth, customers, points, wallet, coupons, feedback, whatsapp, pos, migration, analytics, scan, menu, suggestions
3. All frontend pages: Dashboard, Customers, Segments, Templates, QR, Feedback, Coupons, Settings, Loyalty, WhatsApp Automation, Item Analytics, Customer Lifecycle, Coupon Analytics, Profile, Migration, Wallet

### Suggested Next Actions
**P1** — CR-012 Phase 1 (Template Builder Production Readiness) — unblocks CR-013
**P2** — CR-003 + CR-004 QA Backlog (6 missing QA reports)
**P3** — CR-004 P3 Event Reconciliation, CR-011 Coupon Optimizer Discovery
**P4** — CR-013 Template Gallery (blocked by CR-012 P1)

## Key Files Reference
| Area | Files |
|---|---|
| WhatsApp variable registry | `backend/core/whatsapp_variables.py` |
| WhatsApp resolver + send | `backend/core/whatsapp.py` |
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
