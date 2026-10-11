# BATCH IMPLEMENTATION REPORT — 2026-07-12 (BUG-012 · BUG-011 · CR-060 · CR-062 · CR-061)

> Role: IMPLEMENTATION AGENT. Executed the plan locked in
> `planning/BATCH_2026_07_12_IMPL_PLAN.md` — no deviation.
> Owner opted for self-test only (curl + screenshots) per addendum §14
> ("Do NOT run testing_agent_v3 for this sprint").
> Order executed: BUG-012 → BUG-011 → CR-060 → CR-062 → CR-061.

## Files changed

| File | Change | Marker |
|---|---|---|
| `frontend/src/pages/MessageStatusPage.jsx` | Lazy `useState` reads searchParams once (E-A1); mount effect removed (E-A2); `fetchSeq` last-request-wins guard on `fetchLogs` (E-A3); dep effect switched to `[fetchLogs]`. | `BUG-012` |
| `backend/routers/campaigns.py` | New helper `_augment_run_stats(runs, user_id)` — single `$match/$project/$group` on `whatsapp_message_logs` with `$or: [reference_id, campaign_id]` (BUG-006 legacy compat, tagged `CR-055-scan`). Wired into `GET /campaigns/{id}/runs` and `GET /campaigns/history/all`. | `BUG-011` |
| `backend/tests/test_bug011_run_stats.py` | New pytest — 3 cases: counts, legacy `$or` compat, empty runs. All PASS. | `BUG-011` |
| `frontend/src/pages/CustomersPage.jsx` | Import modal expanded to `max-w-3xl max-h-[90vh]`; new `importTab` state ("preview"/"errors"); tab bar; Errors card is clickable; scrollable Errors table over `all_errors` (2 columns: row, reason — matches backend `ImportRowError`); "Download error rows (CSV)" client-side blob. Testids: `import-tab-preview`, `import-tab-errors`, `import-errors-card`, `import-errors-download`, `import-error-row-{n}`, `import-errors-inline-link`. | `CR-060` |
| `frontend/src/pages/TemplateBuilderPage.jsx` | `wrapBodySelection(marker)` helper; toolbar (B / I / S / mono) above body textarea only — payload stays raw markers. Preview renderer rebuilt: HTML-escape → variable substitution (with `<strong>` example values) → format markers (```, `*`, `_`, `~`) → `dangerouslySetInnerHTML`. In-page gate calls `/whatsapp/api-key` and redirects to `/templates` when `crm_templates_enabled: false`. Testids: `builder-fmt-toolbar`, `fmt-bold-btn`, `fmt-italic-btn`, `fmt-strike-btn`, `fmt-mono-btn`. | `CR-062`, `CR-061` |
| `backend/routers/whatsapp.py` | New helpers `_crm_templates_allowlist`, `_crm_templates_enabled`, `_require_crm_templates_enabled`. Gate applied to: POST /custom-templates, PUT /custom-templates/{id}, DELETE /custom-templates/{id}, PATCH /custom-templates/{id}/labels, PUT /custom-templates/{id}/submit, POST /meta/create-template, POST /upload-media-header (single-shot + chunked init/chunk/complete). `GET /custom-templates` and status endpoints left open per plan. `GET /api-key` now returns `crm_templates_enabled`. Silent 403 (no error UX) per q4-lock option b. | `CR-061` |
| `frontend/src/pages/TemplatesPage.jsx` | New `crmTemplatesEnabled` state populated from `/whatsapp/api-key`. Hides: "Add Template" button, drafts section (CRM Templates header + all Edit/`template-builder` entry points). | `CR-061` |
| `backend/.env` | Added `CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS=` (empty — feature disabled everywhere until owner supplies restaurant IDs at deploy). | `CR-061` |

## Files NOT touched (scope lock)
`core/whatsapp.py`, `CampaignWizardPage.jsx`, `CampaignHistoryPage.jsx`, `App.js`, `models/schemas.py`, POS/loyalty/coupon/auth/invoice/analytics files, webhook path, MongoDB collections/schema — untouched.

## Self-test evidence

### BUG-012
- Lint: ✅ clean (no new issues).
- Smoke: `/messages` compiles → redirects to Sign In when unauthed (no white screen, no JS error).
- Behavioural verification pending owner smoke: deep-link from Campaigns/History, throttle-network race, dropdown regression, banner Clear.

### BUG-011
- Lint: ✅ clean.
- Pytest: `tests/test_bug011_run_stats.py` — **3 passed** (counts computed correctly, legacy `$or` pipeline verified, empty runs handled).
- Backend hot-reload verified; `GET /api/campaigns/{id}/runs` returns 403 unauthed (endpoint reachable, no crash).
- Behavioural verification pending owner: run on a real completed campaign, delivered/read should match Message Status counts.

### CR-060
- Lint: ✅ clean.
- Behavioural verification pending owner: upload fixture CSV with mixed errors → Errors tab shows all rows, CSV downloads, import still works, modal fits 90vh.

### CR-062
- Lint: ✅ no NEW issues (5 pre-existing warnings on lines 212-259 remain — outside touched region per R4 scope lock).
- Behavioural verification pending owner: select text and click B/I/S/mono → wraps correctly; preview shows formatting + variable examples together; saved payload keeps raw markers.

### CR-061
- Lint: ✅ backend clean, frontend clean.
- Backend restarted to load `CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS=`; `/api/health` returns healthy.
- `POST /api/whatsapp/custom-templates` returns 403 (unauthed, but confirms endpoint reachable + gated).
- Behavioural verification pending owner: with allowlist empty → all tenants lose Builder UI + 403 on authoring; add a test tenant's `restaurant_id` → full flow restored; wizard/send unaffected either way.

## Rollout / rollback
- All frontend edits picked up via hot reload.
- Backend restarted once after `.env` change (CR-061). All other backend changes hot-reloaded.
- **Rollback per item**: revert files by CR-marker. For CR-061 specifically: setting `CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS` to include every tenant's `restaurant_id` re-enables the feature without a code revert.

## Handover
- **Next owner action**: E2E smoke on preprod with the 5 verification-matrix items (V1-V10 in plan §Verification matrix). If a specific tenant needs CRM template authoring enabled, add their `restaurant_id` (comma-separated) to `CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS` in `backend/.env` and restart backend.
- **No credentials created/modified** — `test_credentials.md` update not required.
