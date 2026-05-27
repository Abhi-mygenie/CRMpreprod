# CRM ROI Measurement Sprint

**Sprint name:** ROI Measurement for CRM
**Started:** 2026-02-26
**Status:** `roi_measurement_sprint_open`
**Sprint folder root:** `/app/memory/crm/crm_roi_sprint/`

---

## 1. Sprint Context

Previous CRM 1.0 baseline is **CLOSED** and **untouched** by this sprint.

| Anchor | Path |
|---|---|
| Closed CRM 1.0 baseline (canonical source of truth) | `/app/memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md` |
| Closed CRM 1.0 baseline status | `crm_1_0_baseline_closed_production_promotable_2026_05_26` |
| Closed CRM 1.0 root | `/app/memory/crm/crm_1_0/` |

If any older artifact conflicts with the close doc, the close doc wins.

Notes:
- `/app/memory/final/` does not exist and must remain untouched.
- No historical backfill / migration is approved.
- Coupon / Loyalty / Wallet baseline is considered production-promotable from the previous sprint.

---

## 2. Folder Structure (lifecycle-ordered)

```
crm_roi_sprint/
├── README.md                  ← this file
├── 00_register/               ← master CR register (cross-CR)
│   └── ROI_MEASUREMENT_CR_REGISTER.md
├── discovery/                 ← Phase 0 — ALL newly registered CRs start here
├── planning/                  ← Phase 1+ — only after Phase 0 produces decisions
├── implementation/            ← code/doc deliverables per CR
├── qa/                        ← per-CR QA reports + ad-hoc POS / owner bug responses
├── analysis/                  ← deeper RCAs / data investigations (cross-cuts)
├── investigations/            ← ad-hoc deep dives (e.g. NG-08-style POS queries)
├── handoff/                   ← cross-team handoffs (POS, owner)
├── client_docs/               ← owner-facing manuals (only if needed)
└── final/                     ← only when this sprint formally closes
```

---

## 3. Lifecycle Rule (status promotion)

```
discovery/<CR>_DISCOVERY.md
        ↓ Phase 0 complete + owner decisions captured
planning/<CR>_PLAN.md                    (new doc, references discovery doc)
        ↓ Implementation done
implementation/<CR>_IMPLEMENTATION_REPORT.md
        ↓ QA done
qa/<CR>_QA_REPORT.md
        ↓ Cross-team handoff (if any)
handoff/<CR>_HANDOFF.md
        ↓ Sprint close
final/CRM_ROI_SPRINT_CLOSE_<date>.md
```

- Each CR's status string is **appended**, never back-edited.
- Earlier-phase docs are not deleted when a later-phase doc is created — they remain as audit trail.

---

## 4. Registered CRs (snapshot — see register for live state)

| # | CR | Phase | Current doc |
|---|---|---|---|
| 1 | `CR-005 Coupon UI / Usage / Visibility Bugs (Sprint POS-3.0 / CRM-1.0 Post-Close)` | **QA Passed** | `./qa/CR_005_AND_CR_002B_AUTHENTICATED_QA_REPORT.md` |
| 2 | `CR-002B Customer CRM Benefits Data Visibility Fix` | **QA Passed** | `./qa/CR_005_AND_CR_002B_AUTHENTICATED_QA_REPORT.md` |
| 3 | `POS-CRM Customer Cross-Sell Upsell Suggestions API` | **v1.1 Shipped + POS Green** | `./handoff/POS_CRM_CROSS_SELL_API_HANDOFF_TO_POS.md` |
| 4 | `CR-003 Coupon Analytics Dashboard` | **Phase 3 Implemented — Custom Date Picker + CSV Export** | `./implementation/CR_003_COUPON_ANALYTICS_DASHBOARD_PHASE_3_IMPLEMENTATION_REPORT.md` |
| 5 | `CR-004 WhatsApp Utility + Marketing Message Integration` | Discovery (not started) | `./discovery/CR_004_WHATSAPP_UTILITY_MARKETING_MESSAGE_INTEGRATION_DISCOVERY.md` |

| 6 | `Hotfix: Customer Detail Crash (Mixed Datetime + Missing Wallet Field)` | **Fixed + Owner Verified** | `./hotfix/HOTFIX_CUSTOMER_DETAIL_CRASH_2026_05_27.md` |
| 7 | `CR-007 Loyalty Redemption Fix: Order Never Rejected + POS Mismatch Logging` | **Implemented + Tested** | `./planning/CR_007_LOYALTY_REDEMPTION_ORDER_REJECTION_FIX_PLAN.md` |
| 8 | `CR-008 MyGenie Token Session Management (Option C)` | **QA Passed** | `./qa/CR_008_MYGENIE_TOKEN_SESSION_MANAGEMENT_QA_REPORT.md` |
| 9 | `CR-009 WhatsApp Settings Credential Visibility Toggle` | **QA Passed (Owner Smoke Test)** | `./qa/CR_009_WHATSAPP_SETTINGS_CREDENTIAL_VISIBILITY_TOGGLE_QA_REPORT.md` |
| 10 | `CR-010 POS category_id End-to-End Mapping` | **CLOSED — No CRM changes needed** | `./discovery/CR_010_POS_CATEGORY_ID_END_TO_END_DISCOVERY.md` + `./handoff/POS_HANDOFF_CATEGORY_ID_REQUIRED_FIELD_2026_05_27.md` |
| 11 | `CR-011 Coupon Optimizer (Auto-Suggest Discount Adjustments)` | **Registered — Awaiting Discovery** | `./discovery/CR_011_COUPON_OPTIMIZER_AUTO_SUGGEST_DISCOVERY.md` |

Live register (with priority, sequencing, dependencies): `./00_register/ROI_MEASUREMENT_CR_REGISTER.md`

---

## 5. Strict Boundaries

- The five CRs are **separate** — not merged.
- No product code / DB / env / deploy / migration changes during registration & discovery.
- No real WhatsApp / POS / loyalty side-effects.
- No edits to `/app/memory/final/` (does not exist) or to the closed `crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md`.
- CR-003 implementation must not start until CR-005 + CR-002B are understood or consciously deferred per item. **UPDATE 2026-05-26: CR-005 + CR-002B both QA-passed. CR-003 is UNBLOCKED.**
- CR-005 individual bugs (B1-B7) may be re-routed into CR-002B / V3-A2 / a CRM-1.1 patch CR during Phase 0 Discovery — that routing decision is **not** made at registration.

---

## 6. Naming Notes

- The new `CR-004 WhatsApp Utility + Marketing Message Integration` reuses the `CR-004` code already used by `/app/memory/crm/crm_1_0/planning/CR_004_LOYALTY_DEFAULTS_AND_UI_BUG_FIX.md` (closed sprint). The two CRs are different; owner may renumber the WhatsApp CR before Phase 0 Discovery.
- This sprint folder was created on 2026-02-26 by relocating the 4 newly-registered CR placeholders out of `crm_1_0/planning/`. The legacy CR-003 doc (proposed pre-baseline-close) remains in `crm_1_0/planning/` and is referenced via a pointer doc in `./discovery/`.
