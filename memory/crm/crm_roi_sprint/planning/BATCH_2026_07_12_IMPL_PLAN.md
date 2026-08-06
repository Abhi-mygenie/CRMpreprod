# BATCH IMPLEMENTATION PLAN — 2026-07-12 (CR-060 · CR-061 · BUG-011 · CR-062 · BUG-012)

> Role: PLANNING AGENT — Implementation Plan. All owner Qs LOCKED (see `DECISIONS_LOG.md § 2026-07-12`).
> Impact analysis: `planning/BATCH_2026_07_12_IMPACT.md`. Mockup contract: `planning/BATCH_2026_07_12_MOCKUPS.html` (approved).
> Implementation gate: **OPEN** (owner: "defaults are fine… close planning session"). ZERO code changed this session.
> Order: BUG-012 → BUG-011 → CR-060 → CR-062 → CR-061.

---

## A. BUG-012 — MessageStatusPage deep-link race (frontend only)

File: `frontend/src/pages/MessageStatusPage.jsx`. Code marker: `BUG-012`.

- **E-A1 (lazy init)**: change `filters` useState to lazy initializer reading `searchParams` once:
  `useState(() => ({ status:"all", event_type:"all", campaign_id: sp.get("campaign_id") || "all", run_id: sp.get("run_id") || "all", template_name:"all", status_note:"all", search:"", include_test:false, date_from:"", date_to:"" }))`
  (`const sp = new URLSearchParams(window.location.search)` above the useState, or call `useSearchParams` before state — order matters: hook already at :110, move above :85 state block.)
- **E-A2**: delete/neuter the mount effect at :113-125 (its only job was the now-redundant setFilters; keep `setPagination skip:0` unnecessary since initial skip is 0).
- **E-A3 (last-request-wins)**: add `const fetchSeq = useRef(0)`; in `fetchLogs` capture `const seq = ++fetchSeq.current` before await, and guard `if (seq !== fetchSeq.current) return;` before `setLogs`/`setPagination`. Same guard NOT needed in fetchStats/fetchFilterOptions (not filter-dependent).
- **Preserve**: CR-036 B.2/B.3 markers (status_note chip, resend), banner "Filtered by campaign" logic, export param building.

Self-test: deep-link from CampaignsPage + CampaignHistoryPage (with run_id) → only campaign rows listed; throttle network in devtools to force old-response-last; manual dropdown filtering regression; Clear banner regression.

## B. BUG-011 — Campaign History counts via read-time aggregation (backend only)

File: `backend/routers/campaigns.py`. Code marker: `BUG-011`. NO webhook change, NO backfill, NO frontend change.

- **E-B1**: new helper `async def _augment_run_stats(runs: list[dict], user_id: str) -> list[dict]`:
  - Collect run ids; single aggregation on `whatsapp_message_logs`:
    `{$match: {user_id, $or: [{reference_id: {$in: run_ids}}, {campaign_id: {$in: run_ids}}]}}` (BUG-006 legacy compat — add code marker so CR-055 migration sweep finds it),
    `{$project: {run_key: {$ifNull:["$reference_id","$campaign_id"]}, status:1}}` → group by `(run_key, status)` counts.
  - Per run: `total_sent` = sum of statuses NOT in `("failed",)` (i.e. pending+sent+delivered+read+rejected? → NO: sent = statuses in `("sent","delivered","read")`); `total_failed` = `failed`+`rejected`; `total_delivered` = `delivered`+`read`; `total_read` = `read`.
  - Fallback: if a run has ZERO matching logs (pre-logging legacy), keep stored `total_sent`/`total_failed` values as-is.
- **E-B2**: wire helper into `GET /campaigns/{campaign_id}/runs` (:948) and `GET /campaigns/history/all` (:960) before return.
- **Downstream consumers unchanged**: `CampaignHistoryPage.jsx` (:78-80,:179-189) reads same field names; CampaignsPage campaign cards unaffected (read `campaigns`, not runs).

Self-test: curl both endpoints for a tenant with a real completed campaign → delivered/read now non-zero and equal to Message Status counts for that run; run with zero logs keeps stored totals; pytest regression `test_campaigns_api.py`.

## C. CR-060 — Import modal: max-w-3xl + Errors tab + CSV download (frontend only)

File: `frontend/src/pages/CustomersPage.jsx`. Code marker: `CR-060`. Visual contract = mockup §1.

- **E-C1**: `:2808` → `max-w-lg` ⇒ `max-w-3xl max-h-[90vh] overflow-y-auto` on import DialogContent.
- **E-C2**: new state `const [importTab, setImportTab] = useState("preview")` (reset in `resetImportModal` and when new preview loads).
- **E-C3**: step-2 tab bar under stat cards: `Preview (first 5)` | `Errors (N)` (hide Errors tab when `error_count === 0`). `data-testid="import-tab-preview"` / `"import-tab-errors"`.
- **E-C4**: Errors card (`:2884` area) becomes clickable → `setImportTab("errors")`, add `data-testid="import-errors-card"`, cursor-pointer + outline when active.
- **E-C5**: Errors tab body: scrollable table (`max-h-[240px]`) over `importPreview.all_errors` → columns Row | Name | Phone | Reason (all_errors items carry `{row, name, phone, reason}` — VERIFY exact shape of `ImportPreviewResponse.all_errors` in `routers/customers.py` before rendering name/phone; if only `{row, reason}`, render 2 columns).
- **E-C6**: "⬇ Download error rows (CSV)" button — client-side Blob from `all_errors` (no backend call), filename `import-errors-{filename}.csv`. `data-testid="import-errors-download"`.
- **E-C7**: keep red info strip on Preview tab; step 1 and step 3 untouched.

Self-test: upload fixture CSV with mixed errors → tab shows all error rows pre-import; CSV downloads; import still works; modal fits 90vh on small screens.

## D. CR-062 — Template Builder formatting toolbar (frontend only)

File: `frontend/src/pages/TemplateBuilderPage.jsx`. Code marker: `CR-062`. Visual contract = mockup §2.

- **E-D1**: `bodyRef = useRef(null)` on body Textarea; helper `wrapSelection(marker)` → reads `selectionStart/End`, wraps selection (or inserts paired markers at caret when no selection), updates `tpl.body`, restores focus/selection.
- **E-D2**: toolbar row above body textarea: B (`*`), I (`_`), S (`~`), mono (` ``` `) buttons + hint text. `data-testid="fmt-bold-btn"` etc. Body only — NOT added to header/footer inputs.
- **E-D3**: preview renderer: extend `builder-preview-body` (:675) to render markers → `<b>/<i>/<s>/<code>` (small regex-based renderer; process AFTER existing variable highlighting so `{{n}}` chips still render; escape HTML first).
- **E-D4**: no validator changes (V1-V10 untouched), no payload changes (markers are plain chars).

Self-test: select text → each button wraps correctly; preview renders bold/italic/strike/mono + variable chips together; save draft + reload keeps markers; submit payload body contains raw markers.

## E. CR-061 — CRM templates env-gated by restaurant_id (backend + frontend)

Code marker: `CR-061`. ⚠ HOTSPOT `routers/whatsapp.py` — owner approval GRANTED via q4-lock (option b). Silent 403 — NO frontend error UX by design (q4-lock).

- **E-E1** `backend/.env`: add `CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS=""` (comma-separated restaurant ids; EMPTY = feature disabled for ALL tenants — safe default; owner supplies the 2-3 ids at deploy).
- **E-E2** `backend/routers/whatsapp.py`: helper `def _crm_templates_enabled(user: dict) -> bool` → parse env once per call (or module-level set), compare `str(user.get("restaurant_id"))` against allowlist. Guard `if not _crm_templates_enabled(user): raise HTTPException(403)` on AUTHORING endpoints only: POST `/custom-templates` (:182), PUT (:430), DELETE (:512), PATCH labels (:544), PUT submit (:564), `create_meta_template` (:662), CR-036 media upload endpoints (single-shot + chunked init/chunk/complete). **NOT gated**: GET `/custom-templates` (:421) returns `[]`-equivalent naturally for tenants who never created any — leave open (read-only, tenant-scoped); GET status (:577) leave open (read-only).
- **E-E3** expose flag to frontend: add `crm_templates_enabled: bool` to `GET /whatsapp/api-key` response (already the settings/config read used by TemplatesPage).
- **E-E4** `frontend/src/pages/TemplatesPage.jsx`: read flag with api-key fetch → when false: hide "Add Template" button (:501), hide "CRM Templates" section + drafts buckets (:457-465,:522+), hide Edit/`template-builder` entry points (:557,:564). No banner/message (q4-lock).
- **E-E5** `frontend/src/App.js` (:60-61): guard `/template-builder` routes — fetch-flag-aware redirect to `/templates` when disabled (simple wrapper or in-page guard inside TemplateBuilderPage; choose in-page guard to avoid App.js data fetching).
- **NOT touched**: `routers/campaigns.py`, `CampaignWizardPage.jsx`, `core/whatsapp.py`, authkey-templates list (approved CRM templates keep flowing as AuthKey templates — q4-wizard lock).

Self-test: with allowlist empty → all tenants lose Builder UI, POST custom-templates → 403; with test tenant's restaurant_id in list → full flow restored; wizard + sending unaffected either way; regression: templates page renders AuthKey list normally when flag false.

---

## Verification matrix (QA handover basis)
| # | Item | Check |
|---|---|---|
| V1 | BUG-012 | deep-link campaign_id → only that campaign's rows (repeat ×5 for race) |
| V2 | BUG-012 | deep-link run_id from History → run-scoped rows + banner |
| V3 | BUG-012 | manual filter change + rapid clicking → last selection wins |
| V4 | BUG-011 | runs endpoints return delivered/read == Message Status counts |
| V5 | BUG-011 | zero-log legacy run keeps stored totals; pytest regression |
| V6 | CR-060 | errors tab lists ALL error rows pre-import; CSV download; import regression |
| V7 | CR-062 | 4 buttons wrap selection; preview renders formatting + variables |
| V8 | CR-062 | submitted payload body = raw markers (no HTML) |
| V9 | CR-061 | empty allowlist → UI hidden + 403 on authoring; allowlisted → full flow |
| V10 | CR-061 | wizard/send regression both states |

## Rollout / rollback
- All frontend edits hot-reload; CR-061 needs backend restart after `.env` change.
- Rollback = revert per-item code markers; CR-061 additionally "allowlist all" by adding every restaurant_id (or revert code).
