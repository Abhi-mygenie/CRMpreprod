# BATCH IMPACT ANALYSIS — 2026-07-12 (CR-060 · CR-061 · BUG-011 · CR-062 · BUG-012)

> Role: PLANNING AGENT (per `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` Role 2)
> Stage: **Impact Analysis ONLY** — owner instructed: ask all open questions BEFORE implementation planning.
> ZERO code changed. Intake ref: `discovery/SESSION_2026_07_12_BATCH_INTAKE.md`.

---

## 1. CR-060 — Import modal: bigger + error rows in preview

### Code reality: FULL (defect/gap confirmed)
- `CustomersPage.jsx:2808` — `<DialogContent className="max-w-lg rounded-2xl">` (~512px). 3-step wizard inside (upload → preview → result), step indicator at :2825.
- Preview step (:2873-2922): 4 stat cards (Total/New/Update/**Errors**) — Errors card is static; table shows only `importPreview.preview_rows` (**first 5 rows**, sliced server-side at `routers/customers.py` import-preview `classified[:5]`); red info strip says "N rows will be skipped".
- **Backend `POST /customers/import-preview` already returns `all_errors = [{row, reason}...]` for EVERY error row** — grep confirms `all_errors` appears nowhere in `frontend/src`. Zero backend work needed.
- Result step (:2949-2963) shows failed rows only AFTER import (slice 10) — this is the "upload and see" pain.

### Data flow
File → `import-preview` → `{total_rows, new_count, update_count, error_count, preview_rows[5], all_errors[]}` → React state `importPreview` → render. Change is render-layer only.

### Conflicts
None. CR-035 closed. `CustomersPage.jsx` (~3000 LOC) flagged for future refactor (non-blocking recommendation from Session 10) — additive edit acceptable.

### Risk: LOW (frontend-only, no API/schema/state-machine change)

### Proposed shape (pending Q1/Q2)
- Widen import Dialog to `max-w-3xl` (or owner-chosen), `max-h-[90vh] overflow-y-auto` like the Add/Edit modals.
- Make Errors card clickable (`data-testid="import-errors-card"`) → toggles an "Error rows (N)" section rendering `all_errors` (scrollable, Row # + reason, same visual as result-step list).
- 60-B (app-wide modal consistency + design agent) — **parked**, separate scope.

### Files WILL change: `frontend/src/pages/CustomersPage.jsx` (~40-60 LOC)
### Files WILL NOT touch: `backend/routers/customers.py`, any other modal/page.

### Effort: ~0.5 day incl. self-test.

---

## 2. CR-061 — CRM templates visible only in env-allowlisted restaurants

### Code reality: FULL (no gating exists)
- `TemplatesPage.jsx` fetches `GET /whatsapp/custom-templates` (:206) and renders "CRM Templates" section (:522) + drafts/pending/rejected buckets (:457-465) for ALL tenants. "Add Template" button → `/template-builder` (:501); Edit → `/template-builder/{id}` (:557,564).
- Routes registered globally in `App.js:60-61`.
- Backend CRM-template surface in `routers/whatsapp.py` (HOTSPOT): `POST/GET/PUT/DELETE /custom-templates` (:182,421,430,512), `/labels` (:544), `/submit` (:564), `/status` (:577), `create_meta_template` (:662) + CR-036 media upload endpoints.
- **Important nuance for Q4**: Campaign Wizard (`CampaignWizardPage.jsx:122`) fetches ONLY `authkey-templates`. A CRM-built template, once approved, surfaces IN the AuthKey list (synced via AuthKey/Meta) — i.e., post-approval it is indistinguishable from an AuthKey template in the wizard. Gating "CRM templates" can therefore only cleanly gate **authoring/managing** (Builder + custom-templates section), not already-approved sends, unless we also filter synced templates by origin (`custom_templates` join exists via CR-036 B.2 enrichment).

### Data flow
env allowlist → backend gate (dependency check on user identity) → 403 on custom-template endpoints + a `crm_templates_enabled: bool` flag exposed to frontend (e.g., in `/auth/me` or `/whatsapp/api-key` read) → frontend hides CRM section + Builder entries + routes.

### Conflicts
- `routers/whatsapp.py` is a **registered HOTSPOT** → owner approval mandatory before implementation (addendum §14).
- CR-036 B.4 (pending) touches whatsapp.py tests — additive, no collision expected.

### Risk: MEDIUM (hotspot file; multi-tenant behaviour change; safe default must be "enabled for all" or "disabled for all"? → Q3)

### Files WILL change (pending Qs): `backend/.env` (+1 var), `backend/routers/whatsapp.py` (gate dependency ~15 LOC + applied to ~8 endpoints), `frontend/src/pages/TemplatesPage.jsx`, `frontend/src/App.js` (route guard), possibly `routers/auth.py` (expose flag) — final list in impl plan.
### Files WILL NOT touch: `core/whatsapp.py` send paths, `routers/campaigns.py` (unless Q4 = yes).

### Effort: ~1 day (UI-hide + backend 403). +0.5 day if Q4 requires wizard filtering.

---

## 3. BUG-011 — Campaign History Sent/Delivered/Read never populated

### Code reality: FULL (root cause confirmed)
- `campaign_runs` docs get `total_delivered: 0, total_read: 0` at creation (`campaigns.py:112-113` model default, :279-280 send-run, :749 scheduler-run, :844 resend-run) and **no code path ever updates them** (repo-wide grep).
- `total_sent`/`total_failed` ARE `$set`/`$inc` at send time (:395-398, :933-941) — owner's "sent is also empty" most likely = legacy runs created before these fields OR campaigns with 0 sends; must verify against live DB in implementation (read-only probe).
- Webhook `POST /whatsapp/status-callback` (`whatsapp.py:1765`) updates `whatsapp_message_logs` row status via state machine (+`delivered_at`/`read_at` when `applied`, :1966-2005) — **never touches `campaign_runs`**.
- Read endpoints: `GET /campaigns/{id}/runs` (:948) and `GET /campaigns/history/all` (:960) — plain `find` on `campaign_runs`, no aggregation.
- `CampaignHistoryPage.jsx:78-80` (summary cards) + :179-189 (table) render the dead fields.

### Data flow (current)
send → run doc(sent/failed set) → webhook → message_logs.status only → History reads run doc → 0/0.

### Fix options (owner decision Q5)
| Option | Where | Pros | Cons |
|---|---|---|---|
| (a) `$inc` in webhook when `applied` & row has run linkage | `whatsapp.py` webhook (HOTSPOT, CRITICAL-path) | true counters, cheap reads | historical runs stay 0 without backfill; counter drift risk on edge verdicts; touches most sensitive code path |
| (b) read-time aggregation from `whatsapp_message_logs` in both runs endpoints | `campaigns.py` only | **retroactively fixes ALL history**, zero write-path risk, single source of truth | aggregation cost per page view (bounded: ≤500 runs, indexed by user_id; needs BUG-006 `$or` campaign_id/reference_id compat) |
| (c) = a + b + one-time backfill | both | belt & braces | most work, most risk |
- **Planning recommendation: (b)** — safest, fixes legacy data for free, avoids the webhook hotspot entirely. Sent should also come from aggregation (fixes legacy "sent empty" rows) with fallback to stored `total_sent`.

### Conflicts
- Option (a) collides with webhook code owned by CR-039/CR-041/BUG-006 lineage + future CR-055 (campaign_id normalization migration). Option (b) only needs the same `$or` compat that CR-055 will later delete — add code marker so CR-055 sweep catches it.

### Risk: option (b) = MEDIUM · option (a)/(c) = HIGH (webhook hotspot → full gate + regression checklist)

### Files WILL change (option b): `backend/routers/campaigns.py` (~40 LOC aggregation helper + wire into 2 endpoints). Frontend unchanged (fields keep same names).
### Files WILL NOT touch (option b): `routers/whatsapp.py`, webhook state machine, `CampaignHistoryPage.jsx`.

### Effort: (b) ~0.5-1 day incl. regression pytest. (a) ~1.5 days. (c) ~2 days.

---

## 4. CR-062 — Template Builder formatting toolbar

### Code reality: FULL (no restriction anywhere — confirmed)
- Frontend validators V1-V10 (`TemplateBuilderPage.jsx:25-90`) and backend safety net (`whatsapp.py:690-720`) check braces/sequencing/URLs/name only. `*`, `_`, `~`, backticks pass through untouched.
- Meta renders `*bold*` `_italic_` `~strike~` ` ``` mono ``` ` in **body** text (header/footer don't render formatting). Typing markers manually already works end-to-end today.
- Preview body renders raw text `whitespace-pre-wrap` (:675) — markers show literally, no visual bold/italic in preview.

### Proposed shape (pending Q7)
- Toolbar row above body textarea: **B / I / S̶ / `<>`** buttons wrapping current selection with markers (textarea `selectionStart/End` manipulation).
- Preview upgrade: lightweight marker→`<b>/<i>/<s>/<code>` renderer for `builder-preview-body` (and variable highlight preserved).

### Conflicts: none (TemplateBuilderPage last touched by CR-036 B.2/B.3 media work — different sections).
### Risk: LOW (frontend-only; no payload change — markers are plain body chars Meta already accepts).
### Files WILL change: `frontend/src/pages/TemplateBuilderPage.jsx` (~60-80 LOC).
### Files WILL NOT touch: backend anything.
### Effort: ~0.5 day.

---

## 5. BUG-012 — View Messages deep-link shows all messages

### Code reality: FULL (root cause CONFIRMED by trace — race)
- `MessageStatusPage.jsx`:
  - :85-96 `filters` initialized with `campaign_id:"all"`.
  - :113-125 mount effect (`[]`) reads `?campaign_id`/`?run_id` → `setFilters`.
  - :188-191 fetch effect (`[filters, pagination.skip]`) — **fires on mount with the DEFAULT filters (unfiltered request #1), then again after the URL-param setFilters (filtered request #2)**. Both HTTP requests in flight concurrently; responses race. When #1 resolves after #2 it overwrites `logs` + `pagination.total` with the unfiltered set — while the Select correctly shows the campaign (filters state IS updated). Exactly matches the reported symptom, and explains intermittence (QA passed CR-026 when #1 happened to resolve first).
- Backend filter (`_build_message_log_query` :1442-1505) is correct (BUG-006 `$or` compat) — manual dropdown selection works because it's a single fetch.
- Same race also affects `run_id` deep-link from CampaignHistoryPage (:211) and — pre-existing but identical mechanism — any future URL-param filter.

### Candidate fixes (owner decision Q8; can combine)
1. **Lazy state init** — `useState(() => filtersFromSearchParams(searchParams))` → single correct fetch on mount, race eliminated at source. (~10 LOC, cleanest; recommended)
2. Last-request-wins guard in `fetchLogs` (request sequence counter / AbortController) — defensive fix that also protects fast filter-clicking generally. (~10 LOC)
- Planning recommendation: **1 + 2** (still small; #2 hardens all filter interactions).

### Conflicts: `MessageStatusPage.jsx` recently touched by CR-036 B.2/B.3 (chips/resend) — different lines; verify markers preserved.
### Risk: MEDIUM → effectively LOW-MEDIUM after choosing frontend-only fix (no data risk).
### Files WILL change: `frontend/src/pages/MessageStatusPage.jsx` (~20-25 LOC).
### Files WILL NOT touch: backend, CampaignsPage, CampaignHistoryPage.
### Effort: ~0.5 day incl. deep-link re-verification of CR-026 + BUG-009 flows.

---

## Cross-batch notes
- No two items collide on the same lines; CR-060 + BUG-012 + CR-062 are independent frontend edits → can ship as one implementation session if approved together.
- Hotspot approvals needed: CR-061 (`routers/whatsapp.py`) — and BUG-011 ONLY if owner picks option (a)/(c).
- Suggested implementation order: BUG-012 → BUG-011(b) → CR-060 → CR-062 → CR-061 (last; needs hotspot gate + Q answers).

## OPEN OWNER QUESTIONS (blocking Implementation Plan)
- **Q1 (CR-060)**: error-row display: (a) expandable section on clicking Errors card *(recommended)* / (b) tab next to preview / (c) replace preview table.
- **Q2 (CR-060)**: modal width `max-w-3xl` OK? And register 60-B (app-wide modal consistency w/ design agent) now or park?
- **Q3 (CR-061)**: allowlist key: (a) tenant emails / (b) user_ids / (c) POS restaurant ids — env var name `CRM_TEMPLATES_ENABLED_TENANTS`?
- **Q4 (CR-061)**: gate depth: (a) UI-hide only / (b) UI + backend 403 *(recommended)*. And: should already-APPROVED CRM-built templates (which appear as AuthKey templates in wizard) remain usable by non-allowlisted tenants? (recommended: yes — gate authoring only)
- **Q5 (BUG-011)**: fix option (a) webhook `$inc` / **(b) read-time aggregation (recommended — retroactive, no hotspot)** / (c) both + backfill.
- **Q6 (BUG-011)**: aggregation counts based on message-log statuses — confirm "Sent" should ALSO be recomputed from logs (fixes legacy runs showing 0 sent)?
- **Q7 (CR-062)**: toolbar B/I/Strike/Mono wrapping selection + preview renders formatting — body-only *(per Meta behaviour)* — approve?
- **Q8 (BUG-012)**: fix 1 (lazy init) + fix 2 (last-request-wins) combined *(recommended)* — approve?
- **Q9 (batch)**: implementation order/bundling — approve suggested order above, or prioritize a subset first?
