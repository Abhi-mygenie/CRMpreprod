# SESSION 2026-07-12 — BATCH INTAKE (5 items)

> Role: INTAKE AGENT (per `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`)
> Owner instruction: "do intake only for all 5". ZERO code changed this session.
> Note: owner mentioned an attached screenshot for item 1 — **asset not received on this pod** (evidence partially missing; code-reality check done instead).

---

## ITEM 1 — CR-060: Customer Import modal — bigger + clickable error rows + modal consistency

**Owner report**: "can we make it bigger — clicking on error can we show error rows here instead of user uploading and seeing; in fact all modals should have consistency… may be need design agent later."

- **Classification**: CR (UX enhancement on CR-035 import flow)
- **Severity**: P2 (workaround: import anyway, failed rows listed after import)
- **Risk**: LOW-MEDIUM (frontend-only; no API/schema change)
- **Duplicate check**: DISTINCT — related to CR-035 (import feature, shipped) but no open item covers preview-stage error visibility or modal sizing.
- **Evidence (code reality)**:
  - `frontend/src/pages/CustomersPage.jsx:2808` — import modal is `DialogContent className="max-w-lg rounded-2xl"` (small).
  - Preview step shows only **first 5 rows** (`importPreview.preview_rows`) + a red "Errors" count card (line ~2884) that is **not clickable**.
  - **Backend already returns full error list**: `routers/customers.py` `POST /customers/import-preview` response includes `all_errors` (row + reason for every error row) — grep confirms `all_errors` is **unused in frontend**. Fix is pure UI wiring.
  - Full-import result step (step 3) lists failed rows — this is what forces the owner to "upload and see".
- **Blast radius**: SMALL (CustomersPage.jsx import Dialog only). Modal-consistency sweep across app = LARGE if bundled — recommend splitting into 60-A (import modal: size + error rows) and 60-B (app-wide modal consistency, likely design-agent pass).
- **Owner Qs**: Q1 — error rows display: (a) expandable section under Errors card, (b) tab "Errors (N)" next to preview, (c) replace preview table when card clicked? Q2 — modal target size (`max-w-3xl`?). Q3 — is 60-B (all-modal consistency + design agent) to be registered separately now or parked?

---

## ITEM 2 — CR-061: CRM-built templates visible only in specific restaurants (env-controlled)

**Owner report**: "there are 2 types of template: 1 CRM and 2 AuthKey; we want CRM template to show only in specific restaurant controlled through env."

- **Classification**: CR (feature — tenant gating)
- **Severity**: P2
- **Risk**: MEDIUM (touches `routers/whatsapp.py` — registered HOTSPOT; owner approval needed before implementation)
- **Duplicate check**: DISTINCT — no existing CR gates CRM templates per tenant.
- **Evidence (code reality)**:
  - `TemplatesPage.jsx:203-230` fetches BOTH `GET /whatsapp/authkey-templates` and `GET /whatsapp/custom-templates`; renders "CRM Templates" section (line ~522) for every tenant.
  - Template Builder (`TemplateBuilderPage.jsx`, route + entry buttons) is also visible to all tenants — presumably must be gated by the same flag.
  - No env-based feature flag exists today for template origin. `.env` currently has 25+ vars, zero per-tenant feature flags.
- **Blast radius**: MEDIUM — backend (`/whatsapp/custom-templates` list + Template Builder create/submit endpoints if hard-gated), frontend (TemplatesPage CRM section, Builder entry points, CampaignWizard template dropdown if it lists CRM templates).
- **Owner Qs**: Q1 — gate key: (a) allowlist of tenant emails, (b) allowlist of user_ids, (c) restaurant/POS ids — in env var e.g. `CRM_TEMPLATES_ENABLED_TENANTS`? Q2 — gate depth: (a) UI-hide only, (b) UI + backend 403 (recommended)? Q3 — behaviour for existing CRM templates already created by non-allowlisted tenants (hide vs read-only)? Q4 — does gating also block CRM-template selection inside Campaign Wizard?

---

## ITEM 3 — BUG-011: Campaign History — Sent/Delivered/Read always 0 (never populated)

**Owner report**: "in history section of campaign, message sent deliver read is always empty; numbers not populated here, user needs to go to dashboard."

- **Classification**: BUG (feature gap — counters never wired)
- **Severity**: P2 (core numbers wrong on History page; workaround exists — Dashboard / Message Status show real statuses)
- **Risk**: MEDIUM-HIGH (fix options touch webhook path in `routers/whatsapp.py` — HOTSPOT — or read-path aggregation in `routers/campaigns.py`)
- **Duplicate check**: DISTINCT — related domain to BUG-006/CR-042 (message-log filters/export) but no registered item covers `campaign_runs` counters.
- **Evidence (code reality)**:
  - `routers/campaigns.py:112-113, 279-280, 749, 844` — `total_delivered: 0, total_read: 0` initialized on run creation.
  - Grep across `backend/` confirms **no code ever increments/updates `total_delivered` / `total_read`** (`total_sent`/`total_failed` ARE set at send time, lines 398/935/941).
  - Webhook status transitions (delivered/read) update `whatsapp_message_logs.status` only — never aggregated back to `campaign_runs`.
  - `CampaignHistoryPage.jsx:78-80, 187-189` reads `run.total_delivered`/`run.total_read` → always renders 0; summary cards `hist-stat-delivered`/`hist-stat-read` always 0.
  - Note: owner says "sent" also empty — code shows `total_sent` IS written; needs verification against live data during planning (possible legacy runs pre-date the field).
- **Blast radius**: MEDIUM. Fix options for Planning: (a) `$inc` counters in webhook on status transition (write-path, hotspot, historical runs stay 0 unless backfilled), (b) read-time aggregation from `whatsapp_message_logs` in `GET /campaigns/runs` (no write-path risk, fixes history retroactively, must reuse BUG-006 `$or` campaign_id/reference_id compat), (c) both + one-time backfill.
- **Owner Qs**: Q1 — fix option a/b/c? Q2 — backfill historical runs? 

---

## ITEM 4 — CR-062: Template Builder — bold/italic formatting (+ answer to "where is this restriction, at Meta side?")

**Owner report**: "when creating template we can't make text bold italic etc — where is this restriction, at Meta side?"

- **Classification**: CR (feature — formatting toolbar) + inline ANSWER
- **Severity**: P3 (cosmetic/authoring convenience; manual workaround exists today)
- **Risk**: LOW (frontend-only toolbar inserting markers; no backend change)
- **Duplicate check**: DISTINCT — CR-023 built the Template Builder; no item covers formatting helpers.
- **ANSWER to owner's question**: The restriction is **NOT at Meta side and NOT enforced in CRM code**. Meta WhatsApp templates support inline formatting in **BODY text** using markers: `*bold*`, `_italic_`, `~strikethrough~`, ` ```monospace``` `. Our builder validations (V1-V10 in `TemplateBuilderPage.jsx:25-90` + backend safety net `routers/whatsapp.py:690-720`) only check braces/variables/URLs/name — they do NOT block these characters. **Owner can type `*text*` in the body TODAY and Meta will render it bold.** What's missing is a formatting toolbar (B/I/S buttons that wrap selected text), i.e. pure UX. Caveat: formatting markers apply to body only — header/footer text does not render formatting in WhatsApp.
- **Blast radius**: SMALL (`TemplateBuilderPage.jsx` body textarea + preview pane rendering of markers).
- **Owner Qs**: Q1 — want toolbar (B / I / Strike / Mono wrap-selection buttons) + preview rendering of the markers? Q2 — scope body-only (recommended, per Meta behaviour)?

---

## ITEM 5 — BUG-012: "View Messages" deep-link — filter shows selected but ALL messages listed

**Owner report**: "filter not working — when I click on View Messages, auto-select of filter doesn't work; shows selected, but all messages are shown."

- **Classification**: BUG (regression/defect in CR-026 deep-link, related BUG-009)
- **Severity**: P2 (feature broken; workaround: manually re-pick campaign in the dropdown re-triggers a correct fetch)
- **Risk**: MEDIUM (filtering logic, no data risk)
- **Duplicate check**: RELATED to CR-026 (implemented 2026-07-03) and BUG-009 (Details deep-link, closed) — this is a NEW defect in the shipped behaviour, not a duplicate of an open item.
- **Evidence (code reality) + root-cause hypothesis (unconfirmed — needs Investigation/Planning confirmation)**:
  - `MessageStatusPage.jsx:113-125` — URL-param effect (`[]` deps) calls `setFilters(...)` on mount.
  - `MessageStatusPage.jsx:188-191` — fetch effect `[filters, pagination.skip]` fires **twice on mount**: run 1 with default `filters` (`campaign_id:"all"` → unfiltered fetch), run 2 after URL-param setFilters (filtered fetch).
  - **RACE**: both requests are in flight concurrently; if the unfiltered response resolves LAST it overwrites `logs` (and `pagination.total`) with all messages — while the Select correctly shows the campaign as selected (filters state IS set). Matches owner symptom exactly ("shows selected, but all messages are shown").
  - Backend query is NOT the suspect: `_build_message_log_query` (`routers/whatsapp.py:1464-1481`) handles `campaign_id` with BUG-006 `$or` compat — manual dropdown filtering reportedly works.
  - Candidate fixes for Planning: initialize `filters` state lazily from `searchParams` (kills the double fetch), or guard first fetch until URL params applied, or AbortController/last-request-wins in `fetchLogs`.
- **Blast radius**: SMALL-MEDIUM (`MessageStatusPage.jsx` only; entry points CampaignsPage:310/345 + CampaignHistoryPage:211 unchanged).

---

## Registry actions this session
- Dashboard rows added: **CR-060, CR-061, CR-062** (📋 Registered) + change-log entry.
- `BUG_REGISTRY_CAMPAIGNS.md`: **BUG-011, BUG-012** added (🔴 OPEN).
- No code changed. Next: PLANNING role per item (owner to prioritize + answer Qs above).
