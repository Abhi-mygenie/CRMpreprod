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

Eleven separate, related CRs (was six at sprint start; CR-006, Hotfix, CR-007, CR-008, CR-009, CR-010 added later; CR-011, CR-012 added 2026-05-28; CR-015a sub-CR added 2026-05-29; CR-015b + CR-015c cleanup sub-CRs added & completed 2026-05-29). They must **NOT** be merged into one.

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
| 16 | `CR-015 WhatsApp Template Variable Mapping End-to-End Fidelity` | Holistic fix across 3 layers: resolver type-mismatch (Bug #1), event-data forwarding leak at every trigger callsite (Bug #3), registry expansion + admin-UI validation hardening + data cleanup (Bug #2). System-wide, not just `send_bill`. Surfaced during CR-004 P3.5 live test where AuthKey rendered "Test" for every template slot. | **Discovery:** `../discovery/CR_015_WHATSAPP_VARIABLE_MAPPING_FIDELITY_DISCOVERY.md` ✅ · **Planning:** `../planning/CR_015_PHASE_1_PLAN.md` ✅ approved · **Day 2 Freeze:** `../planning/CR_015_DAY_2_FROZEN_SPEC.md` ✅ T3 done · **Day 3 Freeze:** `../planning/CR_015_DAY_3_FROZEN_SPEC.md` ✅ T4+T6 done, T7 committed · **Implementation Closeout:** `../implementation/CR_015_VARIABLE_MAPPING_FIDELITY_CLOSEOUT.md` · **Day 3 Report:** `../implementation/CR_015_DAY_3_IMPLEMENTATION_REPORT.md` · **Probe:** `../investigations/CR_015_PRE_IMPL_GROUND_TRUTH_2026_05_29.md` | `cr015_closed_live_test_passed` |
| 17 | `CR-016 Dynamic Event Registry + Trigger Configuration UI` | Move WhatsApp event registry from hardcoded `POS_EVENTS`/`CRM_EVENTS` lists (27 events in `schemas.py`) + 15 hardcoded `trigger_whatsapp_event` callsites to a tenant-editable `events` collection. Tenant defines custom events, picks a predefined source signal (e.g. `pos.order.received`), adds AND-list condition filters (10 operators), optionally maps to a template. 27 built-ins seeded with locked metadata. Reuses existing WhatsApp Automation page + new 4-tab modal. NO cooldown layer — frequency controlled by source-signal cadence + conditions. | **Discovery:** `../discovery/CR_016_DYNAMIC_EVENT_REGISTRY_DISCOVERY.md` ⏸ Phase 0 complete with 16 predefined source signals + condition model + 4-tab admin UI plan; awaiting 8 owner answers in §7 before planning | `cr016_discovery_phase_0_deferred_next_sprint` |
| 18 | `CR-015a Preview Sample Data Gap for T5 Variables` | Sub-CR of CR-015. Template preview showed "NA" for 14 new T5 variables because `GET /api/customers/sample-data` hardcoded only the original 23 keys. Fix: 14 backend keys + frontend fallback to registry `example`. | **Discovery:** `../discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md` · **Planning (frozen):** `../planning/CR_015A_PREVIEW_SAMPLE_DATA_FROZEN_SPEC.md` ✅ · **Implementation Closeout:** `../implementation/CR_015A_PREVIEW_SAMPLE_DATA_CLOSEOUT.md` ✅ (curl + visual verified) | `cr015a_implemented_2026_05_29` |
| 19 | `CR-015b Dead Variable-Mapping Code Removal` | Tech-debt cleanup. Removed orphaned/unreachable variable-mapping modal cluster on the WhatsApp Automation page (no button ever opened it) + unused `availableFields`/`getPreviewMessage` on Segments. Templates page (the one live mapping surface, incl. coupon picker) untouched. | **Discovery:** `../discovery/CR_015B_DEAD_VARIABLE_MAPPING_CODE_DISCOVERY.md` ✅ · **Implementation Closeout:** `../implementation/CR_015B_DEAD_VARIABLE_MAPPING_CODE_CLOSEOUT.md` ✅ (lint clean, zero residual refs) | `cr015b_removed_2026_05_29` |
| 20 | `CR-015c Remove Demo Login` | Owner-mandated full removal of demo login (was already 404/broken). Backend `/demo-login` endpoint + `DEMO_EMAIL`/`DEMO_PASSWORD` + `is_demo` schema field; frontend Demo Login button + `demoLogin`/`isDemoMode` + `DemoModeBanner`. Tests switched to real login. Nothing in DB. | **Discovery:** `../discovery/CR_015C_REMOVE_DEMO_LOGIN_DISCOVERY.md` ✅ · **Implementation Closeout:** `../implementation/CR_015C_REMOVE_DEMO_LOGIN_CLOSEOUT.md` ✅ (demo-login now 404; 11 segments tests pass via real login) | `cr015c_removed_2026_05_29` |
| 21 | `CR-017 /pos/max-redeemable Missing Projected Points Earned` | Hot production fix. Added `projected_points_earned` + `projected_earn_percent` + `earn_ratio_display` to `/pos/max-redeemable`. Single endpoint, non-breaking. | **Discovery:** `../discovery/CR_017_MAX_REDEEMABLE_PROJECTED_POINTS_EARNED_DISCOVERY.md` ✅ · **Implementation Closeout:** `../implementation/CR_017_MAX_REDEEMABLE_PROJECTED_POINTS_CLOSEOUT.md` ✅ (curl verified, POS handoff updated) | `cr017_closed_implemented_verified` |
| 22 | `CR-018 /pos/max-redeemable Projected Tier Upgrade` | Feature enhancement. Add `projected_tier_after`, `tier_upgrade` (bool), `tier_upgrade_message` to `/pos/max-redeemable` so POS can nudge "Complete this order and you'll upgrade to Silver!". Same endpoint as CR-017, ~15 LoC, additive, non-breaking. | **Discovery:** `../discovery/CR_018_MAX_REDEEMABLE_PROJECTED_TIER_UPGRADE_DISCOVERY.md` ⏸ awaiting owner approval | `cr018_closed_implemented_verified` |
| 23 | `CR-019 send_bill Event-Key Mismatch (UI vs Trigger Code)` | Quick-fix bug surfaced 2026-06-05 live-debug. Frontend exposes `send_bill_manual`/`send_bill_auto` as POS events, but `routers/pos.py:1511,2133` collapses both to `send_bill` before lookup. Result: every new tenant configures dead keys (3 tenants broken — Mygenie Dev / Mayur's Kitchen / Jeh's Nest = 2,388 unsent bills), only tenants who happened to also use the CRM tab work (Kunafa, Hungry Keya). Fix: remove `send_bill_manual`/`auto` from `POS_EVENTS`, move `send_bill` from `CRM_EVENTS` → `POS_EVENTS`, one-off migration script for affected tenants, loud-log silent-skip path. | **Discovery:** `../discovery/CR_019_SEND_BILL_EVENT_KEY_MISMATCH_DISCOVERY.md` ✅ · **Planning:** `../planning/CR_019_SEND_BILL_EVENT_KEY_MISMATCH_PLAN.md` ⏸ awaiting owner sign-off on D3/D4/D5 | `cr019_plan_drafted_awaiting_signoff` |
| 24 | `CR-020 Template Variable Picker — Grouped UX + Menu Variable Family` | UX restructure of the Templates-page mapping picker (flat 37-var dropdown → single intelligent popover with 7 grouped blocks: Order/Bill incl. einvoice_link, Loyalty, Customer, Coupon, Menu NEW, Brand, Feedback). Cross-block selection native; search + "suggested for this event" chips + recently-used + per-variable 🟢/🟡 fills-on badge + live preview. Adds **Menu variable family** (`menu_item_name`, `menu_item_price`, `menu_category_name`) via static owner-bound picker mirroring existing `coupon_pick` pattern. Same color palette, web-first. Backend trigger/send/webhook flow untouched. Planning phase will start with an HTML mock for owner reaction. | **Discovery:** `../discovery/CR_020_TEMPLATE_VARIABLE_PICKER_GROUPED_UX_DISCOVERY.md` ⏸ awaiting owner answers to Q1-Q9 | `cr020_discovery_drafted_awaiting_signoff` |
| 25 | `CR-021 Coupon Engine — Distribute-First Selection + POS-Zero Universal Recording + Unlimited Defaults` | Three coupon defects fixed in one CR plus a hidden runtime coercion bug. (B1) `_v3b_select_get_units` rewritten with group-sort-roundrobin distribute-first algorithm — fixes BOGO/BXG/Nth landing on cheapest single SKU when cart has multiple distinct eligible lines. Same helper serves V3-B + V3-C. (B2) `record_coupon_usage_for_order` POS-zero handling — universal CRM safety net: when POS sends `coupon_discount=0` AND CRM computes > 0, record using `crm_computed` with `discount_mismatch=True`, increment `total_used`. Applies to ALL coupon classes (V1/V2/V3-B/V3-C) per owner D3 "if POS sends by mistake CRM shd honour and record drift in log". Closes silent usage-limit loop. (B3) `per_user_limit` default flipped to Unlimited — Pydantic + frontend + runtime coercions. 142/142 QA pass (49 V3-B + 41 V3-C + 52 new CR-021). | **Discovery:** `../discovery/CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_DISCOVERY.md` ✅ · **Planning:** `../planning/CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_PLAN.md` ✅ · **Implementation Report:** `../implementation/CR_021_IMPLEMENTATION_REPORT.md` ✅ · **Closeout:** `../implementation/CR_021_CLOSEOUT.md` ✅ · QA fixture: `backend/tests/qa_cr021_distribute_and_pos_zero.py` (52/52 pass) | `cr021_closed_2026_06_06_142_of_142_qa_pass` |
| 26 | `CR-022 Coupon POS-side Bug Fixes: Alias, Display Title, Same Item Required` | Four owner-reported POS-side coupon bugs: (B1) `POSCartItem.food_id` alias didn't accept `item_id` — POS validate couldn't match items against `eligible_food_ids`. (B2) `category_id: None` hardcoded in order webhook cart_dicts. (B3) `display_title` missing from POS coupon API responses — added `build_display_title()` helper. (B4) `same_item_required` frontend edit hydration defaulted to `true` for all BOGO coupons via `!== false`. 142/142 QA pass (all existing suites green). Owner must re-save BOGO1 with correct settings to fix existing data. | No separate discovery/planning docs (hotfix CR). Decisions: D1-D4 in `DECISIONS_LOG.md`. | `cr022_closed_2026_06_06_142_of_142_qa_pass` |
| 27 | `CR-023 WhatsApp Template Builder — Production Readiness` | 14 gaps found in template creation flow preventing "Submit to Meta" from working. P0 blockers: Meta API v17→v21, language code format (`en`→`en_US`), body_text example wrapping, media header examples. P1: no button UI, no char limits, no name validation, no status tracking, no duplicate check. P2: 2 languages only, no media upload, poor errors, blanket AuthKey sync. Foundation exists (form + backend + Meta/AuthKey wiring). Phased approach: Phase 1 (P0 fixes + validation = make it work), Phase 2 (buttons + status = full features), Phase 3 (polish). | **Discovery:** `../discovery/CR_023_WHATSAPP_TEMPLATE_BUILDER_PRODUCTION_READINESS_DISCOVERY.md` ✅ · Mock: pending Q1-Q5 | `cr023_discovery_phase_0_complete_mock_next` |

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

| 28 | `CR-078 POS Customer Intelligence Report API` | New feature — POS aggregated report endpoints | Intake: `../discovery/CR_078_POS_CUSTOMER_INTELLIGENCE_REPORT_INTAKE.md` | `cr078_implemented_self_test_7of7_pass_qa_pending` |

---


| 29 | `CR-079 POS Customer Edit — Contract Fix` | Fix — schema + response shape | Intake: `../discovery/CR_079_POS_CUSTOMER_EDIT_INTAKE.md` | `cr079_qa_pass_5of5_iteration_10_owner_smoke_pending` |
| 30 | `CR-080 POS Loyalty & Wallet Management` | New feature — POS auth wrappers + financial writes | Intake: `../discovery/CR_080_POS_LOYALTY_WALLET_INTAKE.md` | `cr080_qa_pass_10of10_iteration_10_owner_smoke_pending` |
| 31 | `CR-081 POS Coupon Management` | New feature — POS auth wrappers + net-new distribute | Intake: `../discovery/CR_081_POS_COUPON_MANAGEMENT_INTAKE.md` | `cr081_qa_pass_11of11_iteration_10_owner_smoke_pending` |

| 32 | `CR-082 Anonymous Coupon Application (customer_id optional)` | Enhancement — coupon engine | Intake: `../discovery/CR_082_ANONYMOUS_COUPON_INTAKE.md` | `cr082_impact_analysis_complete_ready_for_impl_plan` |

| 33 | `CR-083 Customer Block / Deactivate — CRM Frontend` | New feature — frontend UI for existing is_blocked | Intake: `../discovery/CR_083_CUSTOMER_DEACTIVATE_INTAKE.md` | `cr083_intake_closed_q1a_q2a_ready_for_planning` |
| 34 | `CR-084 Remove dev_otp from non-dev request-otp (SECURITY)` | Bug — auth-adjacent | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §1 | `cr084_registered_p1_high_awaiting_owner_approval_to_plan` |
| 35 | `CR-085 Canonical phone normalisation at every entry point` | CR — customer identity (CRITICAL hotspot pos.py) | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §2 | `cr085_registered_p1_critical_q1_q3_pending` |
| 36 | `CR-086 Migration creates customers for unknown phones` | Bug — migration parity | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §3 | `cr086_registered_p1_high_q1_pending_depends_cr085` |
| 37 | `CR-087 Backfill orphan orders + merge duplicate customers` | Data CR — one-off script (conflicts §1 no-backfill rule) | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §4 | `cr087_registered_p1_critical_q1_q3_pending_owner_must_lift_no_backfill_rule` |
| 38 | `CR-088 /scan list hygiene (skip, total, expiring_soon, /api/openapi.json)` | CR — additive read routes | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §5 | `cr088_registered_p2_low_medium_no_questions` |
| 39 | `CR-089 skip-otp guard rails` | CR — auth security | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §6 | `cr089_registered_p2_medium_q1_q2_owner_risk_decision` |
| 40 | `CR-090 Customer OTP delivery + forgot/reset-password` | CR — new integration | Intake: `../discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §7 | `cr090_blocked_p2_high_q1_channel_decision` |
| 41 | `CR-093 Public customer lookup POST /scan/auth/lookup ({exists,name}, no create, rate-limited)` | CR — new public auth-adjacent route | Intake: `../discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` §1 | `cr093_registered_p1_high_q1_q2_pending` |
| 42 | `CR-094 Public loyalty rules GET /scan/loyalty-rules/{rid}` | CR — new public read route | Intake: `../discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` §2 | `cr094_implemented_2026_10_09_self_test_13_13_qa_pending` |
| 43 | `CR-095 Remove orphan /scan/config + /scan/menu/dietary-tags routes (4 routes, Customer-App-owned collections)` | BUG — security / ownership | Intake: `../discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` §3 | `cr095_registered_p1_critical_owner_d1_d2_yes_cutover_gated` |
| 44 | `BUG-025 skip-otp limiter phone bucket evaded by +91 / leading-0 prefix (key not canonical)` | BUG — security/abuse gap (CR-089) | Intake: `../discovery/SESSION_2026_10_09_BATCH_INTAKE_BUG025_BUG028_CR099.md` | `bug025_registered_p2_low` |
| 45 | `BUG-026 test_cr098.py fixture phone 8888888888 invalid under canonical rule` | BUG — test hygiene | same intake | `bug026_registered_p3_low_tests_only` |
| 46 | `BUG-027 QA suites leak skip-otp-created customers (no cleanup)` | BUG — test hygiene | same intake | `bug027_registered_p3_low_tests_only` |
| 47 | `BUG-028 /customers horizontal overflow at 390px (pre-existing)` | BUG — UI | same intake | `bug028_registered_p3_low` |
| 48 | `CR-099 Allow formatted phone input in CRM Add/Edit Customer (server normalises)` | CR — UX | same intake | `cr099_registered_p3_low_owner_decision_a_or_b_pending` |
| 49 | `ENV-001 Test tenant r69 loyalty_enabled:false → points>0 path not live-exercised` | ENVIRONMENT — test coverage | same intake | `env001_registered_owner_decision_pending` |
| 50 | `CR-100 Tolerate legacy customers with country_code:null in identity match (+91 only, forward-fix; 53 docs r635/r689, 13 twins)` | CR — identity rule (§14) | IA: `../planning/CR_100_IMPACT_ANALYSIS.md` | `cr100_planning_ia_done_impl_plan_gate_closed_owner_hold` |
| 51 | `CR-101 Data hygiene (D-3): unset 2 dead password_hash · delete 3 orphan-tenant customers (test_restaurant ×2, pos_0001_restaurant_69 ×1) · drop customer_otps (5)` | CR — data hygiene (prod write, end of batch, PROC-001) | Intake: `../discovery/SESSION_2026_10_09_INTAKE_CR101_BUG029_BUG030_PROC001.md` | `cr101_registered_p3_medium_end_of_batch_owner_confirm_deletions` |
| 52 | `BUG-029 /scan/auth/lookup 400s before IP bucket — invalid-phone probes bypass limiter` | BUG — limiter consistency | same intake | `bug029_registered_p3_low_may_ride_with_bug025` |
| 53 | `BUG-030 _normalize_restaurant_id('69') maps to non-existent tenant (r69 non-standard user id)` | BUG — tenant resolution | same intake | `bug030_registered_p3_low_owner_a_or_b` |
| 54 | `PROC-001 Complete validation test on PRODUCTION DB after all data changes (085-B / 087 / 101 / 100)` | PROCESS — owner rule 2026-10-09 | same intake | `proc001_mandatory_closure_step` |
| 55 | `CR-102 skip-otp accept country_code (Customer App already sends it; schema drops it → +91 assumed)` | CR — contract gap on identity path | Intake: `../discovery/SESSION_2026_10_09_INTAKE_CR102.md` | `cr102_registered_p2_low_may_ride_with_bug025` |
| 56 | `CR-103 POS L-1 parity: add the 14 CR-094 fields (per-tier redemption, max_redemption_*, min_order_value, bonuses, off-peak type/value, expiry) to GET /pos/loyalty/settings` | CR — POS API contract (additive) | Intake: `../discovery/SESSION_2026_10_09_INTAKE_CR103_CR104_BUG031_BUG033.md` §1 | `cr103_parked_owner_2026_10_09_no_pos_api_or_contract_changes_this_batch` |
| 57 | `CR-104 Feedback bonus award — feedback_bonus_enabled/points configured + shown in UI but no code path awards them` | CR — loyalty feature gap (§14) | same intake §2 | `cr104_registered_p3_high_qb_c_decide_at_cr096_closure` |
| 58 | `BUG-031 CR-094 plan silent on null handling for *_redemption_value (40/41 null) / max_redemption_amount (38/41 null)` | BUG — PLAN_GAP (CR-094) | same intake §3 | `bug031_fixed_in_cr094_impl_2026_10_09` |
| 59 | `BUG-032 CR-094 plan test R6 targets r69 → 404 (pos_owner_69_bdd4513c; BUG-030) — fixture must be r689` | BUG — PLAN_GAP (CR-094, tests only) | same intake §4 | `bug032_fixed_in_cr094_impl_2026_10_09` |
| 60 | `BUG-033 POS contract v1 §3.1 doc gaps (10/15 fields described, off_peak_bonus_type constants, tz, expiry 0)` | BUG — DOC | same intake §5 | `bug033_accepted_ca_notes_to_cr094_pos_side_parked_with_cr103` |
| 61 | `ENV-002 Production edge verification for /api/scan/* public reads — Cache-Control passthrough (preview edge forces no-store), X-Forwarded-For trust (IP limiters key on XFF[0]), edge latency` | ENVIRONMENT — infra verification on production | Intake: `../discovery/SESSION_2026_10_09_INTAKE_ENV002_PROD_EDGE_CHECK.md` | `env002_registered_p2_low_owner_hand_to_infra_i1_i6` |



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

| 62 | `CR-108 Coupon code trailing-space data fix` | Data hygiene — strip spaces from 11 coupon.code docs (6 tenants). P1/LOW. One MongoDB updateMany. RUNBOOK.md §13. | Intake: `../discovery/SESSION_2026_10_09_INTAKE_CR108_COUPON_CODE_TRAILING_SPACE.md` | `cr108_registered_p1_low_owner_timing_choice` |

| 63 | `CR-109 Add .strip().upper() to coupon code at write time` | Preventive — 6 lines in coupons.py + pos_coupons.py. P2/LOW. No owner questions. | Intake: `../discovery/SESSION_2026_10_09_INTAKE_CR109_COUPON_CODE_STRIP.md` | `cr109_registered_p2_low_preventive_no_owner_questions` |

| 64 | `CR-110 Bulk mygenie_token refresh script` | OPS — one-time script to refresh stale prod-dump tokens on preprod. P1/LOW–MEDIUM. No app file change. Dry-run mode. Unblocks CR-086. | Intake: `../discovery/SESSION_2026_10_09_INTAKE_CR110_BULK_TOKEN_REFRESH.md` | `cr110_registered_p1_ops_script_no_app_code_change` |

| 65 | `CR-111 Importer phone validation` | Preventive — `_validate_and_classify_row` → `normalize_phone` + `phone_match`. P2/LOW. Fixes BUG-036 (G-1). Batch DQ-1 Wave A. | Intake: `../discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md` | `cr111_registered_p2_low_dq1_wave_a` |
| 66 | `CR-112 Unique partial index customers(user_id, phone, country_code)` | Structural — DB-level duplicate prevention + DuplicateKey handling at 6 insert sites. P1/HIGH. After CR-087. Batch DQ-1 Wave D. | Intake: same doc | `cr112_registered_p1_high_after_cleanup` |
| 67 | `CR-113 Data-quality logging & visibility` | Observability — `orders.link_status`, sync counters, `pos_guest_events`, `phone_invalid` filter/badge, prod request-log sampling. P1/LOW. Rides BUG-028. Wave A. | Intake: same doc | `cr113_registered_p1_low_dq1_wave_a` |
| 68 | `CR-114 Daily data-quality job` | Observability — `data_quality_daily` per tenant + orphan KPI (G-6). P1/LOW. Wave A. | Intake: same doc | `cr114_registered_p1_low_dq1_wave_a` |
| 69 | `CR-115 Sync resilience + re-link` | 401 flag/banner, resume page, ordering guard, re-link on customer arrival (fixes BUG-037). P1/MEDIUM. RELATED CR-086. Wave A. | Intake: same doc | `cr115_registered_p1_medium_dq1_wave_a` |
| 70 | `CR-116 Discrepancy report generator` | Read-only tooling — per-restaurant 6-sheet report + approval JSON converter; prerequisite for any data write. P1/LOW. Wave B. | Intake: same doc · Spec: `../planning/DATA_CLEANUP_GATE_PLAN_2026_10_10.md` §2–3 | `cr116_registered_p1_low_dq1_wave_b` |
| 71 | `CR-117 Cleanup runner framework` | Executes 085-B/087/101 — pre-flight, mongodump, audit, archive, rollback, auto PROC-001. P0/CRITICAL. Wave C. Preprod rehearsal mandatory. | Intake: same doc · Spec: gate plan §4–5 | `cr117_registered_p0_critical_dq1_wave_c` |
