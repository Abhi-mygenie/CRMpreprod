# CR-005 — Coupon UI / Usage / Visibility Bugs (Sprint POS-3.0 / CRM-1.0 Post-Close Findings)

**Date:** 2026-02-26
**Status:** `cr005_coupon_ui_usage_bugs_registered_awaiting_phase_0_discovery`
**Priority:** P1 (within ROI Measurement Sprint — directly threatens CR-002B customer visibility and CR-003 analytics correctness)
**Sprint:** ROI Measurement for CRM
**Register:** `./ROI_MEASUREMENT_CR_REGISTER.md`
**Reported by:** Owner / POS team field testing on R689 (post CRM-1.0 baseline close 2026-05-26)
**Reference screenshots:** Attached in chat (7 screenshots: ss1 … ss7)

> **Important context:** CRM 1.0 baseline (closed 2026-05-26, `crm_1_0_baseline_closed_production_promotable_2026_05_26`) is **not** being reopened by this CR. These are post-close field-discovered defects/gaps that must be triaged and routed (most likely as a CRM-1.1 patch CR or as sub-tasks under CR-002B / CR-003 / V3-A enhancement). This doc only **registers** them — no investigation, no fix.

---

## 1. Purpose

Capture and group all coupon UI / usage / visibility bugs reported on R689 post CRM-1.0 baseline close, so they can be jointly triaged and routed in Phase 0 Discovery before any code change.

This is a **single CR with multiple bug items** (B1-B7). Bugs are kept together because they all sit on the same coupon admin / customer-detail / coupon-engine surface and benefit from one shared discovery pass.

---

## 2. Bug Register

| ID | Title | Surface | Severity | Likely area | Source (screenshot) | Status |
|---|---|---|---|---|---|---|
| **B1** | Coupon description not showing on `/coupons` list | Coupon Admin List (`/coupons`) | P2 (cosmetic / info loss) | Frontend list row template (missing `description` render) | ss1 | Open — awaiting discovery |
| **B2** | Coupon applied in 2 orders but customer detail shows `0 used` (BOGO coupon, customer **Neelam Sharma**, `9736078200`, 2 visits / ₹140 spent) | Customer Detail screen — COUPONS card | **P1 (data trust)** | Customer-side coupon usage rollup (`coupon_usage` query, customer-id linkage, restaurant filter) — **directly overlaps CR-002B** | ss2 | Open — awaiting discovery |
| **B3** | Per-User Limit not enforced (set to `1`, customer redeemed multiple times) | Coupon Admin form → Validity & Limits → Per User Limit · enforcement at apply/validate time | **P1 (rule bypass)** | Coupon engine `per_user_limit` enforcement + `coupon_usage` lookup by customer | ss3 | Open — awaiting discovery |
| **B4** | Happy Hour: no item / category scope option (e.g. "apply only on liquor") — **enhancement** | Coupon Admin form → Happy Hour (V3-A) | P2 (capability gap) | V3-A engine + UI; today V3-A is order-level only. Owner asks for V3-A2-style item/category scope | ss4 | Open — feature request, route to V3-A2 planning |
| **B5** | Menu items not loading in BOGO and Every Nth Item pickers | Coupon Admin form → BOGO/BXGY (V3-B) Buy/Get pickers · Every Nth (V3-C) item picker | **P1 (blocks coupon creation)** | Frontend `ItemSelector` data source / menu fetch / restaurant scope for V3-B and V3-C forms | ss5 | Open — awaiting discovery |
| **B6** | Total Usage Limit / Per User Limit not working (Total=`2`, PerUser=`2`, both bypassed) | Coupon Admin form → Validity & Limits · enforcement at apply/validate time | **P1 (rule bypass)** | Same engine path as B3 — likely same defect, dedupe candidate | ss6 (label says "user limit also working" — likely a transcription typo for "**not** working", consistent with B3) | Open — awaiting discovery; likely dupe of B3 |
| **B7** | `% discount` option missing in Happy Hour coupon form (only `Discount (Rs.)` flat field shown) | Coupon Admin form → Happy Hour (V3-A) → Discount Rules | P2 (capability gap) | V3-A admin form schema — flat-only today; engine likely already supports percentage via shared V1 path, UI missing | ss7 | Open — awaiting discovery |

> **Dedupe note (B3 ↔ B6):** Both bugs point at the same enforcement path (`max_applications` total cap and `per_user_limit` per-customer cap not being honoured at validate/apply time). Phase 0 Discovery should confirm whether they are one defect surfacing in two screens, or two independent defects (e.g. total-limit vs per-user-limit code paths).

> **Severity legend:** P1 = blocks owner flow or returns wrong CRM data · P2 = cosmetic / capability gap / not blocking.

---

## 3. Suspected Root Causes (for discovery, NOT verified)

> These are **hypotheses only** to guide Phase 0 Discovery. Do not act on them.

| Bug | Hypothesis | Files / areas to inspect first (read-only) |
|---|---|---|
| B1 | List-row template never wired `description` field even though it is captured in create/edit form | `/app/frontend/src/pages/CouponsPage.jsx` (list row render) |
| B2 | Customer-side rollup queries `coupon_usage` with mismatched key (e.g. by `customer_id` vs `pos_customer_id`, or restaurant_id filter mismatch); or `coupon_usage` not being written on POS realtime orders for V3-B | Customer detail page → coupons card data source; `coupon_usage` writes inside POS order ingestion (`routers/pos.py`) and BOGO/BXGY apply path |
| B3 / B6 | `per_user_limit` and `total_usage_limit` enforcement either (a) not read into the validate path, (b) not compared against `coupon_usage` count, or (c) compared against the wrong filter (customer scope, restaurant scope) — same engine call site for both | Coupon validate/apply functions in `/app/backend/core/coupon.py` + `routers/coupons.py` + `routers/pos.py` apply call |
| B4 | V3-A engine is order-level today; item/category scope was deferred to V3-A2 in baseline planning | Confirm against `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_PLAN.md` |
| B5 | `ItemSelector` data fetch may be conditional on `coupon_type` or `mode` and not fire for `offer_type='bogo' | 'bxg'` / V3-C; or menu fetch returns empty when restaurant menu cache is cold | `/app/frontend/src/pages/CouponsPage.jsx` (V3-B `bogoMode` form + V3-C form), `ItemSelector` component |
| B7 | V3-A form omits the `discount_type` toggle (`flat` vs `percentage`) — backend likely supports it via shared V1 path | `/app/frontend/src/pages/CouponsPage.jsx` Happy Hour form section |

---

## 4. Relationships To Other CRs In This Sprint

| Bug | Overlaps with | How |
|---|---|---|
| B2 | **CR-002B Customer CRM Benefits Data Visibility Fix** | B2 is literally a CR-002B symptom — customer detail "coupons used" count is wrong. Phase 0 of CR-002B must include B2 as a concrete case. |
| B2, B3, B6 | **CR-003 Coupon Analytics Dashboard** | If `coupon_usage` is not being written correctly or rollups are wrong, CR-003 dashboard will show wrong numbers globally. Strengthens the rule that CR-003 must not start until CR-002B / CR-005 are understood. |
| B4, B7 | V3-A2 (Happy Hour item/category + percentage) | These are enhancements to the V3-A engine + UI; can be promoted to a dedicated V3-A2 CR after Phase 0. |
| B1, B5 | Frontend-only fixes (likely) | Independent surface; can ship without backend change once root-caused. |

---

## 5. Out Of Scope (this registration)

- No code change (frontend or backend)
- No DB change / no seed-data correction
- No env / deploy / migration
- No QA execution
- No reopening of the closed CRM 1.0 baseline close doc
- No merging of B1-B7 into CR-002B / CR-003 / V3-A2 yet — that routing decision belongs to Phase 0 Discovery

---

## 6. Future Flow

```
Phase 0 Discovery
  → Triage & route per-bug (some bugs may move to CR-002B, V3-A2, or stay here as CRM-1.1 patch)
    → Per-bug Planning
      → Implementation
        → QA
          → Final Reconciliation
```

This placeholder doc covers only **registration**. Phase 0 discovery has NOT started yet.

---

## 7. Strict Non-Goals For This Registration

- No deep code inspection (the file pointers in Section 3 are hypotheses, not findings)
- No DB writes / reads against R689 production data beyond what was already done for NG-08 investigation
- No real WhatsApp / POS / loyalty side-effects

---

## 8. Recommended Next Agent (when picked up)

`CR-005 Coupon UI / Usage / Visibility Bugs Discovery Agent` — runs Phase 0 Discovery against all 7 bug items, confirms B3/B6 dedupe, and proposes a triage routing (which bugs are CRM-1.1 patches vs which fold into CR-002B / V3-A2).

---

## 9. Status

```
cr005_coupon_ui_usage_bugs_registered_awaiting_phase_0_discovery
```
