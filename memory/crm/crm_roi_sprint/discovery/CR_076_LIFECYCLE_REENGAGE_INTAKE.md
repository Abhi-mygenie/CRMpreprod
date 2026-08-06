# CR-076 — Customer Lifecycle Re-Engage: Bulk Campaign + Automation

**Type**: BUG + Feature Enhancement  
**ID**: CR-076  
**Date**: 2026-08-05  
**Reporter**: Owner (verbal, 2026-08-05 session)  
**Intake Agent**: E1 — Emergent Labs  
**Severity**: P1 — Core re-engagement feature is broken and incomplete  
**Risk**: MEDIUM (frontend + segment filter extension; no financial/POS/coupon/auth impact)  
**Duplicate check**: DISTINCT — no prior CR covers lifecycle → campaign automation  
**Blast radius**: MEDIUM (5 files / surfaces affected)

---

## 1. Owner Request (verbatim)

> "If you go to our customer lifecycle page, there's a re-engage button there, but it doesn't do anything. The idea is to bulk select those customers based on that [lifecycle stage] and then engage, select a template, and create a campaign. Just go through it — it seems to be broken. Do a complete investigation. How exactly can it be used, so that any customer who comes into churn, automatically that day, an automated message or campaign which is running keeps running for different categories of customers."

---

## 2. Investigation — Code Reality (FULL)

### 2.1 Re-engage Button — What it does today

**File**: `frontend/src/pages/CustomerLifecyclePage.jsx`, lines 291–293

```javascript
const handleReengage = (customerId) => {
    navigate(`/customers/${customerId}?action=reengage`);
};
```

**What happens**: Navigates to `/customers/<id>?action=reengage`.

**CustomerDetailPage.jsx — `?action=reengage` handler**: `grep -n "reengage\|action=" CustomerDetailPage.jsx` → **zero results**. The detail page imports only `useParams` (for `id`), not `useSearchParams` or `useLocation`. The URL parameter `?action=reengage` is **silently ignored**. The user lands on the customer detail page with no campaign flow, no modal, no WhatsApp send triggered.

**Verdict**: DEAD BUTTON. The Re-engage button on CustomerLifecyclePage navigates to a page that does nothing with the intent. This is a PLAN_GAP — the button was built but the destination was never wired.

---

### 2.2 Bulk Selection — What exists today

**CustomerLifecyclePage.jsx** — full file reviewed (665 lines):
- No `selectedCustomers` state
- No checkbox column in the table
- No "Select All" toggle
- No bulk action bar
- No "Re-engage all [Stage]" CTA at the header level

**Verdict**: Zero bulk selection infrastructure exists. Only individual per-row Re-engage buttons (shown for `at_risk`, `dormant`, `churned` customers only).

---

### 2.3 Campaign Audience — Can lifecycle stages be used today?

**`core/helpers.py::build_customer_query`** (20 filter dimensions, lines 221–488):

The filter supports `last_visit_days` (inactive for MORE than N days — `last_visit < cutoff`). But:
- **No `lifecycle_stage` filter block** — you cannot say "give me all `at_risk` customers" as a segment filter
- **Lifecycle stages require date RANGE logic** — `at_risk` = last_visit between 31-60 days ago (`$lt 30d AND $gte 60d`); current `last_visit_days` filter only does `$lt` (one-sided)
- **Stage not stored on customers collection** — stages are computed at query time via `classify_customer_stage()` in `analytics.py` using date math; there is no `lifecycle_stage` field on customer documents

**`AudiencesPage.jsx`** — has 5 accordion sections (Loyalty/Dates/WA/Flags/Tags). **No "Lifecycle Stage" section**.

**Verdict**: You cannot currently create or save a "Churned customers" segment. The lifecycle stage classification exists ONLY in the analytics router — it is not wired into the campaign/audience system.

---

### 2.4 Campaign Automation — What exists today

**`core/campaign_jobs.py`** (290 lines, `CAMPAIGN_SCHEDULER_ENABLED=false` currently):
- Supports `schedule_type`: `one_time`, `recurring` (daily/weekly/monthly)
- Recurring campaigns re-run on schedule indefinitely
- Audience is re-evaluated fresh on each run using `_resolve_audience_customers()`
- If a segment existed for "last_visit > 90 days" (churned), a recurring daily campaign would correctly re-evaluate each day

**`core/loyalty_jobs.py`** — daily cron at midnight handles birthday/anniversary/expiry messages. No lifecycle transition detection.

**What is missing for the "automated churn campaign"**:
1. A `lifecycle_stage` filter in `build_customer_query` (so a segment can target "churned")
2. A saved segment "Churned Customers" using that filter
3. A recurring daily campaign with that segment as audience + an approved re-engagement template
4. The recurring campaign will naturally handle new customers entering churn daily (audience re-evaluated each run)

**Important edge case**: Recurring daily campaign sends to ALL currently-churned customers every day they remain churned — NOT just those who became churned "today". This means:
- Customer A churned 180 days ago → gets message every day
- Option to de-dup (send once per customer per stage entry) requires tracking `stage_entry_date` on customers — this does not exist

---

## 3. Gap Summary — 5 Gaps

| # | Gap | File | Type |
|---|---|---|---|
| G1 | Re-engage button goes to `?action=reengage` on CustomerDetailPage which ignores the param — zero action triggered | `CustomerDetailPage.jsx` | PLAN_GAP |
| G2 | No bulk selection UI on CustomerLifecyclePage (no checkboxes, no select-all, no batch action bar) | `CustomerLifecyclePage.jsx` | MISSING_FEATURE |
| G3 | No `lifecycle_stage` filter in `build_customer_query` — cannot create a segment targeting "churned" or "at_risk" customers | `core/helpers.py` | MISSING_FEATURE |
| G4 | No "Lifecycle Stage" accordion section in AudiencesPage — owner cannot build or save lifecycle segments | `AudiencesPage.jsx` | MISSING_FEATURE |
| G5 | Campaign Wizard does not offer lifecycle stage as an audience option — no shortcut from Lifecycle page to new campaign | `CampaignWizardPage.jsx` | MISSING_FEATURE |

---

## 4. Proposed Full Flow (after fix)

### Flow A — Per-row Re-engage (single customer)
1. Owner selects stage → sees customer list
2. Clicks **Re-engage** on a row (at_risk / dormant / churned customer)
3. A **"Send WhatsApp" modal** opens on the same page (or CustomerDetailPage):
   - Pre-fills: customer name, phone, stage
   - Template picker: approved templates only
   - Variable mapping (if needed)
   - Send button → fires as a direct WhatsApp send (similar to existing "Test Send" logic)

### Flow B — Bulk Re-engage (stage-level campaign)
1. Owner selects a lifecycle stage card (e.g., "Churned — 150 customers")
2. A **"Re-engage Churned Customers" button** appears in the table header
3. Click → opens Campaign Wizard pre-populated with:
   - Audience: "Churned Customers" (lifecycle segment, auto-created or saved)
   - Schedule: one-time (default) or recurring daily (for automation)
4. Owner picks template, sets schedule, creates campaign
5. If recurring daily: campaign runs every day, re-evaluates churned list → new churned customers auto-included

### Flow C — Fully Automated (set and forget)
1. Owner creates a recurring daily campaign via Campaign Wizard
2. Audience = "Churned Customers" segment (lifecycle_stage = churned)
3. Campaign fires daily → always targets whoever is currently churned
4. No manual action needed after setup — matches owner's "keeps running" ask

---

## 5. Owner Decisions Required (Q1–Q5)

| Q | Decision needed | Options | Recommendation |
|---|---|---|---|
| **Q1** | Per-row Re-engage — what should happen? | (a) Open "Send WhatsApp" inline modal on Lifecycle page · (b) Navigate to Campaign Wizard pre-filled for 1 customer · (c) Navigate to CustomerDetailPage and auto-open a send modal | **(a) — fastest UX, no navigation** |
| **Q2** | Bulk Re-engage — trigger | (a) "Re-engage [Stage] (N customers)" button appears when a stage card is selected · (b) Add checkboxes + "Re-engage Selected" bulk bar · (c) Both | **(a) first, (b) can follow as CR-045 extension** |
| **Q3** | Recurring campaign de-dup | (a) Send to ALL churned customers every day it runs (simple, same customer gets daily message) · (b) Send only to customers who entered churn in last 24h (complex — needs `stage_entry_date` field) | **(a) for now** — owner controls frequency by choosing "weekly" or "monthly" recurring |
| **Q4** | `lifecycle_stage` segment filter scope | (a) Add all 5 stages (new/active/at_risk/dormant/churned) to Audiences accordion · (b) Add only at_risk/dormant/churned (actionable stages) | **(a)** — add all 5 for completeness |
| **Q5** | Campaign Wizard — should lifecycle stage be a 1st-class audience type? | (a) Owner builds segment via Audiences page first, then picks in wizard (existing flow) · (b) Add "Lifecycle Stage" as a quick audience option directly in Campaign Wizard Step 1 | **(a) is sufficient** — reuse existing segment system |

---

## 6. Proposed Implementation Phases

### Phase 1 — Fix Re-engage button (G1) + Add lifecycle_stage to segments (G3+G4)
**Effort**: ~3 hrs | **Risk**: MEDIUM | **Gate**: Owner approves Q1 + Q4

| Edit | File | What |
|---|---|---|
| E-A | `core/helpers.py` | Add `lifecycle_stage` filter block to `build_customer_query` — translate stage enum to `last_visit` date range + `total_visits` conditions |
| E-B | `frontend/src/pages/AudiencesPage.jsx` | Add "Lifecycle Stage" section to filter accordion — single-select: all 5 stages with stage badge chips |
| E-C | `frontend/src/pages/CustomerLifecyclePage.jsx` | Change `handleReengage` to open an inline modal (per Q1-a decision) — template picker + direct WhatsApp send for single customer |
| E-D | `frontend/src/pages/CustomerDetailPage.jsx` | Read `?action=reengage` URL param on mount → auto-open send modal (for existing deep-link navigation) |

### Phase 2 — Bulk Re-engage (G2 + G5)
**Effort**: ~2 hrs | **Risk**: LOW-MEDIUM | **Gate**: Owner approves Q2

| Edit | File | What |
|---|---|---|
| E-E | `frontend/src/pages/CustomerLifecyclePage.jsx` | Add "Re-engage [Stage] Customers" CTA button when a stage card is selected — navigates to `/campaigns/new?audience_stage=churned&audience_count=N` |
| E-F | `frontend/src/pages/CampaignWizardPage.jsx` | Read `?audience_stage=` URL param on mount → pre-populate audience with the corresponding lifecycle segment (create-or-reuse) |

### Phase 3 — Documentation for automation flow
**Effort**: ~30 min | **Risk**: LOW

- Owner smoke test: create recurring daily campaign for "Churned Customers"
- Verify audience re-evaluates on each daily run
- Note: enable `CAMPAIGN_SCHEDULER_ENABLED=true` in backend .env for this to fire automatically

---

## 7. Files WILL change

| File | Why |
|---|---|
| `core/helpers.py` | Add `lifecycle_stage` filter block (E-A) |
| `frontend/src/pages/AudiencesPage.jsx` | Add Lifecycle Stage section to accordion (E-B) |
| `frontend/src/pages/CustomerLifecyclePage.jsx` | Fix Re-engage modal + bulk CTA (E-C, E-E) |
| `frontend/src/pages/CustomerDetailPage.jsx` | Handle `?action=reengage` param (E-D) |
| `frontend/src/pages/CampaignWizardPage.jsx` | Read `?audience_stage=` param (E-F) |

## 7. Files WILL NOT change

`core/coupon.py`, `core/loyalty.py`, `core/whatsapp.py`, `routers/pos.py`, `routers/auth.py`, `routers/whatsapp.py`, `models/schemas.py`, `core/campaign_jobs.py`, any POS/invoice/payment logic

---

## 8. Risk Assessment

| Area | Risk | Reason |
|---|---|---|
| `core/helpers.py` lifecycle filter | MEDIUM | Adds new filter block; uses existing date math pattern identical to `last_visit_days` filter; no existing filter changed |
| `CampaignWizardPage.jsx` URL param | LOW | Additive only — reads param on mount, pre-populates existing fields; no campaign creation logic changed |
| `AudiencesPage.jsx` accordion | LOW | New section added; no existing sections modified |
| `CustomerLifecyclePage.jsx` modal | LOW | New modal state + template picker; no existing data fetch changed |
| WhatsApp send from modal | MEDIUM | Calls real WhatsApp send path — must use existing DirectSend logic (not campaign engine) to avoid bulk blast risk |

**No CRITICAL risk** — no financial logic, no POS, no auth, no loyalty math touched.

---

## 9. Intake Output

```
Intake complete: CR-076
Classification: BUG (G1 — dead Re-engage button) + Feature (G2-G5 — bulk + automation)
Severity: P1 — core engagement feature broken; automation entirely missing
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: 
  - CustomerLifecyclePage.jsx line 291-293 (dead navigate)
  - CustomerDetailPage.jsx (no ?action=reengage handler — 0 grep results)
  - core/helpers.py (no lifecycle_stage filter block — confirmed)
  - AudiencesPage.jsx (no Lifecycle Stage accordion — confirmed)
Blast radius: MEDIUM (5 files, 0 financial/POS/auth files)
Docs updated: discovery/CR_076_LIFECYCLE_REENGAGE_INTAKE.md
Next: Owner approves Q1–Q5 → Planning → Implementation (Phase 1 then Phase 2)
```

---

## 10. Owner Q&A Summary (decisions needed before planning)

**Please answer before I start coding:**

| Q | Question | Default if no answer |
|---|---|---|
| Q1 | Per-row Re-engage: open inline modal on Lifecycle page (a), or navigate to CampaignWizard (b), or open on CustomerDetail (c)? | (a) inline modal |
| Q2 | Bulk: "Re-engage [Stage] (N)" button when stage selected (a), checkboxes (b), or both (c)? | (a) stage-level button |
| Q3 | Recurring automation: send to all currently-churned every day (a), OR only send once when customer first enters stage (b)? | (a) all churned every run |
| Q4 | Lifecycle filter: add all 5 stages or only at_risk/dormant/churned? | all 5 |
| Q5 | Campaign Wizard shortcut: add "Lifecycle Stage" as 1st-class audience type (a) OR rely on segment-first flow (b)? | (b) segment-first |
