# ROI Measurement Sprint — Full Sprint Status (Docs vs Code) Consolidation Report

**Date:** 2026-05-27
**Sprint:** ROI Measurement for CRM
**Author:** Full Sprint Status Consolidation Agent
**Status:** `roi_sprint_minor_doc_gaps_fixed`

---

## 1. Overall Verdict

```
roi_sprint_minor_doc_gaps_fixed
```

All 9 CRs in the register align with code reality. The only doc gap was the
header line "**Six** separate, related CRs" in §2 of the register — stale
since CR-006, Hotfix, CR-007 and CR-008 were appended after the original 5.
Corrected in this run. No code, DB, env, deploy, migration, or CRM 1.0 doc
changes were made.

---

## 2. CR Status Matrix

| CR | Register status | Docs status | Code status | QA status | True status | Next action |
|---|---|---|---|---|---|---|
| **CR-005** Coupon UI/Usage/Visibility Bugs (B1-B7) | `cr005_authenticated_qa_passed` | discovery + Phase 0 + plan + impl + QA | ✅ `menuError` state + `menu-error-banner`/`menu-retry-btn` test-ids in `CouponsPage.jsx` (L248, L674, L770, L868); `total_coupon_used` $inc in `core/coupon.py` L2227 inside `if result.upserted_id is not None`; Happy Hour discount-type toggle present | ✅ QA passed (40 PASS, 1 DEFERRED — POS-side coupon usage live increment) | **Aligned — CLOSED for this sprint** | None. Re-test deferred B2/B3/B6 live increment once POS sends `coupon_code + coupon_discount > 0`. |
| **CR-002B** Customer CRM Benefits Visibility | `cr002b_authenticated_qa_passed` | discovery + Phase 0 + plan + impl + QA | ✅ `GET /customers/{id}/coupon-history` exists `customers.py` L1530; `total_coupon_used` returned L1525; 3-tab grid (`grid-cols-3`) with `coupons-tab` test-id in `CustomerDetailPage.jsx` L526, L529 | ✅ QA passed (including cross-restaurant scoping, empty/fake customer, auth) | **Aligned — CLOSED for this sprint** | None. |
| **POS-CRM Cross-Sell Suggestions API** | `pos_crm_cross_sell_phase_1_v1_1_shipped_pos_green` | registration + Phase 0 freeze + Phase 1 plan + impl + v1.1 update + QA + POS handoff + 5-blocker reply | ✅ `routers/suggestions.py` exists with `/pos/customers/order-suggestions`; v1.1 P-03 (currency), P-04 (`title` → `name`), Q-02 (`available_coupons_count`) markers in code header (L9-14); `core/customer_intelligence.py` referenced and present | ✅ QA report on disk; POS-green per handoff doc | **Aligned — SHIPPED** | None. Awaiting POS-side consumption metrics. |
| **CR-003** Coupon Analytics Dashboard | `cr003_discovery_passed_ready_for_phase_1_planning` | 2 discovery docs (`CR_003_…_DISCOVERY.md` + `CR_003_…_DISCOVERY_ANALYSIS_REPORT.md`) | ✅ No CR-003-specific code (confirmed by `grep CR-003` returns empty across backend + frontend) | N/A (no impl yet) | **Aligned — Discovery passed, Phase 1 planning NOT started** | Kick off CR-003 Phase 1 Planning Agent. UNBLOCKED — both gate CRs (CR-005 + CR-002B) are QA-passed. |
| **CR-004** WhatsApp Utility + Marketing | `cr004_whatsapp_utility_marketing_registered_awaiting_phase_0_discovery` | 1 discovery placeholder doc | ✅ No CR-004 code (confirmed by `grep "CR-004 WhatsApp"` returns empty) | N/A | **Aligned — Registered, Phase 0 NOT started** | Kick off CR-004 Phase 0 Discovery Agent (independent track). |
| **CR-006** Coupon Engine POS Validate Regression (B8-B12) | `cr006_b11_fixed_real_data_reproduction_complete` | QA/RCA report + implementation+repro report | ✅ **B11 fix** in `CouponsPage.jsx`: toggle auto-cleanup at L464, L468; save-time sanitize at L434-435; edit-mode cleanup at L336; picker filtering at L866, L879. ✅ **B8 engine fix** in `core/coupon.py`: comment "CR-006 fix" at L342, `min_item_qty` check moved BEFORE `_select_cheapest_or_highest()` (now called at L368) | ✅ 16/16 engine tests PASS per QA doc; real R689 reproduction complete | **Aligned — Fixed + repro complete** | Owner can promote to closed once next R689 owner-facing field test is positive. |
| **Hotfix** Customer Detail Page Crash | `hotfix_customer_detail_crash_fixed_owner_verified` | hotfix report | ✅ `customers.py` L1590, L1638 have `datetime.fromisoformat(...replace("Z","+00:00")) if isinstance(o["created_at"], str) else o["created_at"]` — handles both string and `datetime` (mixed-datetime fix) | ✅ Owner verified per hotfix doc | **Aligned — CLOSED** | None. |
| **CR-007** Loyalty Redemption Fix | `cr007_implemented_and_tested` | planning + implementation doc combined | ✅ `routers/pos.py` L1303-1357: CR-007 Fix A ("ORDER IS NEVER REJECTED" — log + continue at L1357), CR-007 Fix B ("back-calculate points from POS loyalty_discount" at L1317) | ✅ "implemented_and_tested" per register; no separate QA report on disk (combined in planning doc) | **Aligned — Implemented + tested** | Optional: create a stand-alone QA report under `qa/` for archival. Not blocking. |
| **CR-008** MyGenie Token Session Mgmt | `cr008_implemented_ready_for_qa` | planning + implementation report (this run) | ✅ Backend: `X-MyGenie-Token` header read at `menu.py:22`, `customers.py:463/522/1047`, `migration.py:818`; `mygenie_token=mygenie_token` in `auth.py:411, 463`; field added to `schemas.py:204`. ✅ Frontend: `AuthContext.jsx:23-24` reads `sessionStorage` & sets header, `:62-64` saves on login, `:94` clears on logout. ✅ DB fallback retained on every path. | ⏳ **PENDING** — no QA report on disk under `qa/` | **Aligned — Implemented, QA pending** | Run QA pass (7 scenarios in implementation report §6). Flip to `cr008_qa_passed` on success. |

---

## 3. Mismatches Found

| CR | Issue | Severity | Recommendation |
|---|---|---|---|
| (Register §2) | Header line said "**Six** separate, related CRs" — stale (now 9) | LOW | **Fixed in this run** — line updated to "Nine separate, related CRs (was six at sprint start; CR-006, Hotfix, CR-007, CR-008 added later)". |
| CR-003 | Register Doc cell points to `CR_003_…_DISCOVERY_ANALYSIS_REPORT.md` only; a second older discovery doc (`CR_003_…_DISCOVERY.md`) also exists on disk | LOW (audit cosmetic) | Optional: amend register Doc cell to list both. Left unchanged this run (Phase 1 Planning Agent will reorganize this anyway). |
| CR-007 | No standalone `qa/` report; status is "implemented_and_tested" but evidence is inside the planning doc | LOW | Optional housekeeping: copy the test-evidence section into `qa/CR_007_LOYALTY_REDEMPTION_QA_REPORT.md`. Not blocking. |
| CR-008 | No `qa/` report yet (expected — status is explicitly "ready_for_qa") | EXPECTED | Run QA next. |

No HIGH or MEDIUM severity mismatches.

---

## 4. Register Corrections Made

| CR | Old | New | Reason |
|---|---|---|---|
| (header §2) | "Six separate, related CRs" | "Nine separate, related CRs (was six at sprint start; CR-006, Hotfix, CR-007, CR-008 added later)" | Stale count after sprint grew by 3 CRs + 1 hotfix. |

No CR row statuses were corrected — every register status matches code reality.

---

## 5. Docs Created/Updated

| Path | Action |
|---|---|
| `/app/memory/crm/crm_roi_sprint/handoff/ROI_MEASUREMENT_FULL_SPRINT_STATUS_DOC_VS_CODE_CONSOLIDATION_REPORT.md` | **Created** (this report) |
| `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` | **Updated** — §2 header CR count corrected (six → nine, with note) |

---

## 6. Confirmed Non-Changes

- Product code changed: **no**
- DB changed: **no**
- Env changed: **no**
- `/app/memory/final/` touched/created: **no** (confirmed: directory does not exist)
- CRM 1.0 docs modified: **no** (verified — md5 of `CRM_1_0_BASELINE_CLOSE_2026_05_26.md` is `4ff9f267b3e7d284ac9614130590b3cd`, unchanged this run)
- QA started: **no**
- CR-003 / CR-004 started: **no** (confirmed by code grep — zero matches for CR-003/CR-004 markers across backend + frontend)

---

## 7. Recommended Next Agent

**`cr008_qa_agent`** — Run the 7-scenario QA pass for CR-008 (per
`implementation/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_IMPLEMENTATION_REPORT.md` §6):

1. Fresh login → `TokenResponse.mygenie_token` populated, `sessionStorage["mygenie_token"]` set
2. `GET /api/menu/items` WITH `X-MyGenie-Token` → header value reaches MyGenie
3. `GET /api/menu/items` WITHOUT header → DB fallback works (existing behaviour)
4. `POST /api/customers/sync-from-mygenie` honours header
5. `POST /api/migration/sync-orders` honours header (+ `last_customer_sync_at` gate still works)
6. Logout → `sessionStorage["mygenie_token"]` cleared
7. Page refresh → sessionStorage survives → menu/sync calls still work without re-login

On pass, flip status to `cr008_qa_passed` and write `qa/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_QA_REPORT.md`.

Parallel work that does NOT block CR-008 QA (separate agents, independent tracks):
- **`cr003_phase_1_planning_agent`** — CR-003 is UNBLOCKED. Owner Phase 1 decisions are already locked in the discovery doc.
- **`cr004_phase_0_discovery_agent`** — WhatsApp track is fully independent.

---

## 8. Strict Rules Honoured

- No code changes (only doc edits in `00_register/` and `handoff/`).
- No DB / env / deploy / migration.
- No QA executed.
- `/app/memory/final/` not created / not touched.
- `/app/memory/crm/crm_1_0/` baseline close doc untouched (md5 verified).
- No CR-003 / CR-004 implementation started.

End of consolidation.
