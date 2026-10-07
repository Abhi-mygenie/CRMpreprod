# CR-076 — QA Handover
## Customer Lifecycle Re-Engage: Bulk Campaign + Automation

**Date**: 2026-08-05  
**Role**: Implementation Agent → QA Agent handover  
**Risk**: MEDIUM  
**Test credentials**: `owner@kunafamahal.com / Qplazm@10` (Kunafa Mahal, 2021 churned customers)  
**Secondary tenant**: `owner@hungry.com / Qplazm@10` (Hungry Keya, restaurant_634)

---

## What Was Implemented

### Backend (2 files)

| File | Edit | What |
|---|---|---|
| `backend/core/helpers.py` | E-A | `lifecycle_stage` filter block added before `return query` — translates stage enum to `last_visit` date-range + `total_visits` MongoDB conditions; reads CR-077 `loyalty_settings` boundaries (fallback: 30/60/90d) |
| `backend/routers/campaigns.py` | E-E.3 backend | `_resolve_audience_customers()` now handles `audience_id` prefixed with `lifecycle_stage:` — calls `build_customer_query` with `{lifecycle_stage: stage}` |

### Frontend (4 files)

| File | Edit | What |
|---|---|---|
| `AudiencesPage.jsx` | E-B (4 sub-changes) | `lifecycle_stage: "all"` in DEFAULT_FILTERS; `lifecycle: false` in openSections; `"Stage:"` chip in chipLabelToFilterKey + getFilterTags; new Section 0 "Lifecycle Stage" Collapsible (teal colour, data-testid="lifecycle-stage-section") with 7 stage options |
| `CustomerLifecyclePage.jsx` | E-C (5 sub-changes) | Dialog import + Label; modal state (reengageModal, reengageTemplates, reengageTemplate, reengageSending); handleReengage now opens inline modal (was dead navigate); handleReengageSend calls `/whatsapp/direct-send`; bulk CTA button ("Re-engage [Stage] (N)") in card header when at_risk/dormant/churned selected; modal JSX (data-testid="reengage-modal") before `</ResponsiveLayout>` |
| `CustomerDetailPage.jsx` | E-D (3 sub-changes) | `useSearchParams` added to imports; `showReengageModal` + related state; auto-open `useEffect` when `?action=reengage` + customer loaded; Re-engage button (data-testid="detail-reengage-btn") next to Edit; modal JSX (data-testid="detail-reengage-modal") |
| `CampaignWizardPage.jsx` | E-E frontend (2 sub-changes) | `useSearchParams` added; new `useEffect` reads `?audience_stage=` + `?audience_count=` on mount; pre-fills `audienceId="lifecycle_stage:churned"`, `audienceName`, `audienceCount` |

---

## Self-Tests PASSED (before QA handover)

| Test | Result |
|---|---|
| `filters={"lifecycle_stage":"churned"}` segment → count=2021 | ✅ |
| `filters={"lifecycle_stage":"at_risk"}` segment → count=4 | ✅ |
| Campaign with `audience_id="lifecycle_stage:churned"` created → OK | ✅ |
| Backend running clean, no import errors | ✅ |
| All 6 files have CR-076 code markers | ✅ |

---

## Verification Matrix (V1–V10)

| V# | Test | How to verify | Expected |
|---|---|---|---|
| V1 | `lifecycle_stage=churned` filter | POST /api/segments with `{"lifecycle_stage":"churned"}` | count < total_customers; count matches Lifecycle page churned count |
| V2 | AudiencesPage — create segment with lifecycle_stage=at_risk | Browser: Audiences → New → Section 0 → At Risk → Preview | Preview count matches Lifecycle page at_risk count |
| V3 | Lifecycle page — stage card click → bulk CTA | Browser: select Churned stage card | "Re-engage Churned (N)" button appears in table header |
| V4 | Bulk CTA click | Browser: click bulk CTA button (data-testid="bulk-reengage-btn") | Navigates to `/campaigns/new?audience_stage=churned&audience_count=N` |
| V5 | Campaign Wizard pre-fill | Browser: arrive via V4 link | Audience = "Churned Customers", count pre-filled |
| V6 | Per-row Re-engage button | Browser: Lifecycle → click Re-engage on a row | Modal opens with customer name + phone + stage badge (data-testid="reengage-modal") |
| V7 | Template picker in modal | Browser: select template → Send | API POST /whatsapp/direct-send called — success toast shown |
| V8 | CustomerDetailPage ?action=reengage | Browser: navigate to /customers/{id}?action=reengage | Modal auto-opens (data-testid="detail-reengage-modal") |
| V9 | Lapsing audience backend | POST /api/segments with `{"lifecycle_stage":"lapsing"}` | count = at_risk count + dormant count |
| V10 | Campaign with lifecycle audience sends | POST /api/campaigns/... with audience_id="lifecycle_stage:churned" then POST .../send (test-send is safer) | Campaign executes, message_logs records written |

---

## Files Changed

**WILL change**: `helpers.py`, `campaigns.py`, `AudiencesPage.jsx`, `CustomerLifecyclePage.jsx`, `CustomerDetailPage.jsx`, `CampaignWizardPage.jsx`

**WILL NOT change**: `core/coupon.py`, `core/loyalty.py`, `routers/pos.py`, `routers/auth.py`, `core/whatsapp.py`, `routers/whatsapp.py`, `core/campaign_jobs.py`, `models/schemas.py`

---

## DO NOT during QA

- Do NOT send live WhatsApp to real customers (test-send only)
- Do NOT run destructive DB operations
- Clean up any QA-created test segments after testing
