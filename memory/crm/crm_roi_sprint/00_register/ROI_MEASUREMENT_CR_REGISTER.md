# ROI Measurement Sprint — CR Register

**Sprint name:** ROI Measurement for CRM
**Sprint folder:** `/app/memory/crm/crm_roi_sprint/`
**Created:** 2026-02-26
**Relocated to sprint folder:** 2026-02-26 (was previously under `/app/memory/crm/crm_1_0/planning/`)
**Status:** `roi_measurement_sprint_cr_register_open`

> **Lifecycle:** All CRs in this sprint start in `../discovery/` (Phase 0). On Phase 0 completion + owner decisions, a sibling doc is created under `../planning/`. Implementation reports land in `../implementation/`, QA reports in `../qa/`, cross-team handoffs in `../handoff/`. Sprint closes with a doc in `../final/`.

---

## 1. Sprint Context

Previous CRM 1.0 baseline is **CLOSED**.

Canonical source of truth (do not modify):
- `/app/memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md`
- Final baseline status: `crm_1_0_baseline_closed_production_promotable_2026_05_26`

If any older CRM 1.0 artifact conflicts with the close document, the close document wins.

Notes:
- `/app/memory/final/` does not exist in this environment and must remain untouched.
- No historical backfill / migration is approved.
- Coupon / Loyalty / Wallet baseline is considered production-promotable from the previous sprint.

---

## 2. Registered CRs (this sprint)

Eleven separate, related CRs (was six at sprint start; CR-006, Hotfix, CR-007, CR-008, CR-009, CR-010 added later; CR-011, CR-012 added 2026-05-28). They must **NOT** be merged into one.

| Order | CR Code / Name | Type | Doc | Status |
|---|---|---|---|---|
| 1 | `CR-005 Coupon UI / Usage / Visibility Bugs (Sprint POS-3.0 / CRM-1.0 Post-Close)` | Bug bundle from field testing (B1-B7) | Discovery: `../discovery/CR_005_COUPON_UI_USAGE_VISIBILITY_BUGS_DISCOVERY.md`<br>Phase 0 Analysis: `../discovery/CR_005_CR_002B_PHASE_0_DISCOVERY_AND_ANALYSIS.md`<br>Implementation Plan: `../planning/CR_005_CR_002B_IMPLEMENTATION_PLAN.md`<br>Implementation Report: `../implementation/CR_005_CR_002B_IMPLEMENTATION_REPORT.md`<br>**QA Report:** `../qa/CR_005_AND_CR_002B_AUTHENTICATED_QA_REPORT.md` | `cr005_authenticated_qa_passed` |
| 2 | `CR-002B Customer CRM Benefits Data Visibility Fix` | Customer-level CRM visibility | Discovery: `../discovery/CR_002B_CUSTOMER_CRM_BENEFITS_DATA_VISIBILITY_FIX_DISCOVERY.md`<br>Phase 0 Analysis: `../discovery/CR_005_CR_002B_PHASE_0_DISCOVERY_AND_ANALYSIS.md`<br>Implementation Plan: `../planning/CR_005_CR_002B_IMPLEMENTATION_PLAN.md`<br>Implementation Report: `../implementation/CR_005_CR_002B_IMPLEMENTATION_REPORT.md`<br>**QA Report:** `../qa/CR_005_AND_CR_002B_AUTHENTICATED_QA_REPORT.md` | `cr002b_authenticated_qa_passed` |
| 3 | `POS-CRM Customer Cross-Sell Upsell Suggestions API` | POS-facing CRM intelligence API | Registration: `../discovery/POS_CRM_CUSTOMER_CROSS_SELL_UPSELL_SUGGESTIONS_API_DISCOVERY.md`<br>Phase 0 Requirements Freeze: `../discovery/POS_CRM_CUSTOMER_CROSS_SELL_PHASE_0_REQUIREMENTS_FREEZE.md`<br>Phase 1 Plan: `../planning/POS_CRM_CROSS_SELL_API_PHASE_1_PLAN.md`<br>Implementation: `../implementation/POS_CRM_CROSS_SELL_API_IMPLEMENTATION_REPORT.md`<br>**QA:** `../qa/POS_CRM_CROSS_SELL_API_QA_REPORT.md`<br>**POS Handoff:** `../handoff/POS_CRM_CROSS_SELL_API_HANDOFF_TO_POS.md`<br>**POS Feedback:** `../discovery/CRM2_0_CR_002_POS_FEEDBACK_TO_CRM_HANDOFF_2026_05_26.md`<br>**CRM Reply (5 blockers):** `../handoff/CRM_REPLY_TO_POS_5_BLOCKER_ANSWERS_2026_05_26.md` | `pos_crm_cross_sell_phase_1_v1_1_shipped_pos_green` |
| 4 | `CR-003 Coupon Analytics Dashboard` | Owner/admin global analytics | Legacy pointer: `/app/memory/crm/crm_1_0/planning/CR_003_COUPON_ANALYTICS_DASHBOARD.md`<br>**Phase 1 QA:** `../qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_1_QA_REPORT.md`<br>**Phase 2 Discovery:** `../discovery/CR_003_PHASE_2_DISCOVERY_HANDOFF.md`<br>**Phase 2 Plan:** `../planning/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_2_PLAN.md`<br>**Phase 2 Implementation:** `../implementation/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_2_IMPLEMENTATION_REPORT.md`<br>**Phase 2 QA:** `../qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_2_QA_REPORT.md`<br>**Phase 3 Implementation:** `../implementation/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_3_IMPLEMENTATION_REPORT.md`<br>**Phase 4 Implementation:** `../implementation/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_4_IMPLEMENTATION_REPORT.md`<br>**Phase 3 QA:** `../qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_3_QA_REPORT.md` ✅<br>**Phase 4 QA:** `../qa/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_4_QA_REPORT.md` ✅ | `cr003_phase_4_qa_passed` |
| 5 | `CR-004 WhatsApp Utility + Marketing Message Integration` | WhatsApp provider + templates + event triggers + logs | Discovery (registration): `../discovery/CR_004_WHATSAPP_UTILITY_MARKETING_MESSAGE_INTEGRATION_DISCOVERY.md`<br>**Phase 0 Discovery Report:** `../discovery/CR_004_WHATSAPP_DISCOVERY_AGENT_REPORT.md`<br>**Phase 0 Addendum A (Variables/Templates):** `../discovery/CR_004_WHATSAPP_DISCOVERY_AGENT_REPORT_ADDENDUM_A.md`<br>**Phase 0 Addendum B (Message Dashboard):** `../discovery/CR_004_WHATSAPP_DISCOVERY_AGENT_REPORT_ADDENDUM_B_MESSAGE_DASHBOARD.md`<br>**Phase 1 Planning:** `../planning/CR_004_PHASE_1_FOUNDATION_CLEANUP_PLANNING.md`<br>**Phase 1 Implementation:** `../implementation/CR_004_PHASE_1_FOUNDATION_CLEANUP_IMPLEMENTATION_REPORT.md`<br>**Phase 2 Planning:** `../planning/CR_004_PHASE_2_VARIABLE_DB_MAPPING_PLANNING.md`<br>**Phase 2 Implementation:** `../implementation/CR_004_PHASE_2_VARIABLE_DB_MAPPING_IMPLEMENTATION_REPORT.md`<br>**Phase 2.5 Discovery:** `../discovery/CR_004_P2_5_VARIABLE_EXPANSION_DISCOVERY.md`<br>**Phase 2.5 Planning:** `../planning/CR_004_PHASE_2_5_VARIABLE_EXPANSION_PLANNING.md`<br>**Phase 2.5 Implementation:** `../implementation/CR_004_PHASE_2_5_VARIABLE_EXPANSION_IMPLEMENTATION_REPORT.md`<br>**Phase 2.5-B Planning:** `../planning/CR_004_PHASE_2_5_B_COUPON_AWARE_DYNAMIC_VARIABLE_MAPPING_PLANNING.md`<br>**Phase 2.5-B Implementation:** `../implementation/CR_004_PHASE_2_5B_COUPON_AWARE_DYNAMIC_VARIABLE_MAPPING_IMPLEMENTATION_REPORT.md`<br>**Phase 1 QA:** `../qa/CR_004_PHASE_1_FOUNDATION_CLEANUP_QA_REPORT.md` ✅<br>**Phase 2 QA:** `../qa/CR_004_PHASE_2_VARIABLE_DB_MAPPING_QA_REPORT.md` ✅<br>**Phase 2.5 QA:** `../qa/CR_004_PHASE_2_5_VARIABLE_EXPANSION_QA_REPORT.md` ✅<br>**Phase 2.5-B QA:** `../qa/CR_004_PHASE_2_5B_COUPON_AWARE_VARIABLE_MAPPING_QA_REPORT.md` ✅<br>**Phase 3 Planning:** `../planning/CR_004_PHASE_3_EVENT_RECONCILIATION_PLAN.md`<br>**Phase 3 Implementation:** `../implementation/CR_004_PHASE_3_EVENT_RECONCILIATION_IMPLEMENTATION_REPORT.md`<br>**Phase 3 QA:** `../qa/CR_004_PHASE_3_EVENT_RECONCILIATION_QA_REPORT.md` ✅<br>**Phase 3 Live Test:** `../qa/CR_004_PHASE_3_EVENT_RECONCILIATION_LIVE_TEST_REPORT.md` ✅ (WhatsApp delivered to real customer)<br>**Phase 3.5 Plan:** `../planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md`<br>**Phase 3.5 Implementation Closeout:** `../implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md` ✅ Commits 1-7 done<br>**Phase 3.5 Partial Live Test (2026-05-28):** `../qa/CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md` (predecessor — receive-side ✅ + hotfix)<br>**Phase 3.5 Closure Live Test:** `../qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md` ✅ **CLOSED — full pending→delivered→read lifecycle verified via Option A synthetic order on preview (E2E1779979662, 71 sec end-to-end)** | `cr004_p3_5_closed_live_test_passed` |
| 6 | `CR-006 Coupon Engine POS Validate Business Logic Regression` | Coupon engine QA/RCA (B8-B12) | **QA Report:** `../qa/CR_006_COUPON_ENGINE_POS_VALIDATE_REGRESSION_QA_REPORT.md`<br>**Implementation + Repro:** `../implementation/CR_006_COUPON_REGRESSION_FIX_AND_REAL_DATA_REPRO_REPORT.md` | `cr006_b11_fixed_real_data_reproduction_complete` |
| 7 | `Hotfix: Customer Detail Page Crash (Mixed Datetime + Missing Wallet Field)` | Hotfix — migrated data compat | **Hotfix Report:** `../hotfix/HOTFIX_CUSTOMER_DETAIL_CRASH_2026_05_27.md` | `hotfix_customer_detail_crash_fixed_owner_verified` |
| 8 | `CR-007 Loyalty Redemption Fix: Order Never Rejected + POS Mismatch Logging` | Loyalty redemption — order never rejected, CRM source of truth, mismatch logging | **Planning + Implementation:** `../planning/CR_007_LOYALTY_REDEMPTION_ORDER_REJECTION_FIX_PLAN.md` | `cr007_implemented_and_tested` |
| 9 | `CR-008 MyGenie Token Session Management (Option C)` | Auth/session — MyGenie token freshness | **QA Report:** `../qa/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_QA_REPORT.md`<br>Implementation Report: `../implementation/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_IMPLEMENTATION_REPORT.md`<br>Planning: `../planning/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_PLAN.md` | `cr008_qa_passed` |
| 10 | `CR-009 WhatsApp Settings Credential Visibility Toggle` | UX — eye toggle on AuthKey API Key + Meta Access Token | **QA Report:** `../qa/CR_009_WHATSAPP_SETTINGS_CREDENTIAL_VISIBILITY_TOGGLE_QA_REPORT.md`<br>Implementation Report: `../implementation/CR_009_WHATSAPP_SETTINGS_CREDENTIAL_VISIBILITY_TOGGLE_IMPLEMENTATION_REPORT.md`<br>Discovery: `../discovery/CR_009_WHATSAPP_SETTINGS_CREDENTIAL_VISIBILITY_TOGGLE_DISCOVERY.md` | `cr009_qa_passed` |
| 11 | `CR-010 POS category_id End-to-End Mapping` | POS payload gap — category-scope coupons | **Discovery:** `../discovery/CR_010_POS_CATEGORY_ID_END_TO_END_DISCOVERY.md`<br>**POS Handoff:** `../handoff/POS_HANDOFF_CATEGORY_ID_REQUIRED_FIELD_2026_05_27.md` | `cr010_closed_no_crm_changes_required_engine_path3_handles_pos_payload` |
| 12 | `CR-011 Coupon Optimizer (Auto-Suggest Discount Adjustments)` | Coupon ROI-based auto-suggest | **Discovery:** `../discovery/CR_011_COUPON_OPTIMIZER_AUTO_SUGGEST_DISCOVERY.md` | `cr011_registered_awaiting_discovery` |
| 13 | `CR-012 WhatsApp Template Builder Production Readiness` | Template creation UI + backend refactor for Meta compliance | **Discovery:** `../discovery/CR_012_WHATSAPP_TEMPLATE_BUILDER_PRODUCTION_READINESS_DISCOVERY.md` | `cr012_registered_discovery_complete` |
| 14 | `CR-013 WhatsApp Template Gallery (Pre-Built Restaurant Templates)` | Cloneable seed library of Meta-compliant templates | **Discovery:** `../discovery/CR_013_WHATSAPP_TEMPLATE_GALLERY_DISCOVERY.md` | `cr013_registered_awaiting_discovery` |
| 15 | `CR-014 E-Invoice PDF + Mobile HTML Link for send_bill WhatsApp` | Auto-generate mobile-friendly HTML invoice (with PDF download) on every POS order, hosted at public token URL, injected into `send_bill` WhatsApp via existing `einvoice_link` variable (already in registry per CR-004 P3.5) | **Discovery:** `../discovery/CR_014_E_INVOICE_PDF_LINK_DISCOVERY.md` ⏸ Phase 0 complete + Profile-page fields appendix (§15) added 2026-05-28 evening; awaiting 2 owner confirmations in §15.6 before planning starts | `cr014_discovery_phase_0_parked_awaiting_2_final_confirmations` |
| 16 | `CR-015 WhatsApp Template Variable Mapping End-to-End Fidelity` | Holistic fix across 3 layers: resolver type-mismatch (Bug #1), event-data forwarding leak at every trigger callsite (Bug #3), registry expansion + admin-UI validation hardening + data cleanup (Bug #2). System-wide, not just `send_bill`. Surfaced during CR-004 P3.5 live test where AuthKey rendered "Test" for every template slot. | **Discovery:** `../discovery/CR_015_WHATSAPP_VARIABLE_MAPPING_FIDELITY_DISCOVERY.md` ⏸ Phase 0 complete with 7-track remediation plan + 12 new registry entries proposed; awaiting 8 owner answers in §7 before planning | `cr015_discovery_phase_0_parked_pending_planning_signoff` |
| 17 | `CR-016 Dynamic Event Registry + Trigger Configuration UI` | Move WhatsApp event registry from hardcoded `POS_EVENTS`/`CRM_EVENTS` lists (27 events in `schemas.py`) + 15 hardcoded `trigger_whatsapp_event` callsites to a tenant-editable `events` collection. Tenant defines custom events, picks a predefined source signal (e.g. `pos.order.received`), adds AND-list condition filters (10 operators), optionally maps to a template. 27 built-ins seeded with locked metadata. Cooldown + hard caps. | **Discovery:** `../discovery/CR_016_DYNAMIC_EVENT_REGISTRY_DISCOVERY.md` ⏸ Phase 0 complete with 16 predefined source signals + condition model + 4-tab admin UI plan; awaiting 10 owner answers in §7 before planning | `cr016_discovery_phase_0_parked_pending_planning_signoff` |

> **Naming collision note (2026-02-26):** A pre-existing planning doc already uses the `CR-004` code (`./CR_004_LOYALTY_DEFAULTS_AND_UI_BUG_FIX.md`). The new WhatsApp CR uses the user-supplied name `CR-004 WhatsApp Utility + Marketing Message Integration` verbatim and is stored in a non-colliding file. Owner can decide later whether to renumber the WhatsApp CR (e.g. `CR-006`) before Phase 0 Discovery starts.

> **CR-005 promoted to top of order (2026-02-26):** Bugs B1-B7 reported on R689 directly threaten CR-002B (customer visibility) and CR-003 (analytics correctness). CR-005 Phase 0 Discovery must finish (or consciously defer per item) before CR-003 implementation. Some CR-005 bugs may be routed into CR-002B / V3-A2 after triage.

---

## 3. Recommended Priority Order & Reasoning

1. **CR-005 Coupon UI / Usage / Visibility Bugs (Sprint POS-3.0 / CRM-1.0 Post-Close)** — *Field-reported bugs on R689 (B1-B7) including a P1 rule-bypass (per-user / total usage limit not enforced), P1 customer-visibility wrongness ("applied in 2 orders, shows 0 used"), P1 menu loading failure in BOGO/Every-Nth pickers, plus capability gaps (Happy Hour % discount, Happy Hour item/category scope, list description missing). Must be triaged before CR-002B / CR-003 / V3-A2 work plans firm up — several bugs likely fold into those CRs after triage.*

2. **CR-002B Customer CRM Benefits Data Visibility Fix** — *Customer-level coupon/loyalty/wallet/insight data must be trusted **before** owner-level analytics. CR-005 B2 is a concrete CR-002B symptom and must be carried into CR-002B Phase 0.*

3. **POS-CRM Customer Cross-Sell Upsell Suggestions API** — *Uses CRM intelligence inside POS order flow and may need an API contract from CRM/POS. Independent of CR-003. Can run after CR-002B or in parallel once CR-002B discovery clarifies which customer-level fields are reliable.*

4. **CR-003 Coupon Analytics Dashboard** — *Global owner ROI dashboard; high value, but should come **after** (or only in parallel with) CR-002B + CR-005 once customer-level data reliability and limit-enforcement correctness are known. Phase 1 owner scope already locked.*

5. **CR-004 WhatsApp Utility + Marketing Message Integration** — *WhatsApp provider, templates, automation rules, event triggers, send logs, opt-in/opt-out. Independent of CR-002B / CR-003 / CR-005 / POS-CRM Cross-Sell, so it can run in parallel. Soft-benefits from CR-002B because transactional WhatsApp content (coupon/loyalty/wallet events) depends on those values being correct.*

---

## 4. Dependency / Sequencing Note

```
CR-005 (field bugs on R689 — coupon UI / usage limit / visibility)
   ├──► feeds CR-002B (B2 is a CR-002B symptom — must be carried in)
   ├──► gates CR-003 (B3/B6 limit-bypass + B2 usage-count wrong would corrupt the dashboard)
   └──► spawns possible V3-A2 sub-CR (B4 + B7: Happy Hour item/category + % discount)

CR-002B (customer-level data trust)
   └──► CR-003 (owner-level coupon ROI dashboard depends on the same coupon/loyalty/wallet data being correct)

POS-CRM Cross-Sell API
   └──► loosely depends on CR-002B (customer insights / top items / preferences must be correct
        for suggestions to be meaningful). Can run in parallel once CR-002B discovery
        confirms which fields are reliable enough to surface to POS.

CR-004 WhatsApp Utility + Marketing Message Integration
   └──► independent track. Soft-benefits from CR-002B (transactional WhatsApp content
        for coupon/loyalty/wallet events inherits any data wrongness). Can run in parallel.
```

Strict boundaries:
- Do **NOT** merge the five CRs.
- Do **NOT** start CR-003 implementation until CR-002B + CR-005 are understood or consciously deferred.
- Do **NOT** include POS cross-sell work inside CR-003.
- Do **NOT** include WhatsApp work inside CR-003 or CR-002B.
- Do **NOT** send real WhatsApp messages during CR-004 registration / discovery.
- CR-005 individual bugs (B1-B7) may be **re-routed** into CR-002B / V3-A2 / a CRM-1.1 patch CR during Phase 0 Discovery — that routing decision is **not** made in this registration run.

---

## 5. Future Flow Per CR

Each CR follows:
`Phase 0 Discovery → Phase 1 Planning → Phase 1 Implementation → Phase 1 QA → Final Reconciliation`

For CR-003 specifically, Phase 1 owner decisions are already locked (see CR-003 doc).

---

## 6. Next Immediate Action

- Kick off **CR-005 Phase 0 Discovery** to triage the 7 R689 field bugs (B1-B7), confirm B3/B6 dedupe, and decide routing (CRM-1.1 patch vs fold into CR-002B / V3-A2).
- Then continue with **CR-002B Phase 0 Discovery** to map customer-detail-screen data sources against live DB collections.
- Recommended next agent: `CR-005 Coupon UI / Usage / Visibility Bugs Discovery Agent`, then `CR-002B Customer CRM Benefits Data Discovery Agent`.

---

## 7. Non-Goals For This Registration Run

- No product code changes
- No DB / env / deploy / migration changes
- No QA execution
- No historical backfill
- No edits to `/app/memory/final/` (does not exist)
- No edits to the closed CRM 1.0 baseline close document
- No deep rewrite of existing CR-003 doc
