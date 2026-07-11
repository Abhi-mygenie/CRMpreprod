# QA Handover — BUG-009 + CR-042 (bundled)

> **Items shipped**: BUG-009 (Details button deep-link) + CR-042 (Message report download)
> **Date**: 2026-07-03
> **Implementation role**: Role 3 (this agent)
> **Impl Plan**: `crm_roi_sprint/planning/BUG_009_CR_042_MESSAGE_EXPORT_AND_DEEP_LINK_IMPL_PLAN.md`
> **Risk**: LOW (both items)
> **QA type**: Manual (per DECISIONS_LOG rule "Do NOT run testing_agent_v3 for this sprint")

---

## 1. What shipped

### BUG-009
- The dead **Details** button on Marketing > History (each campaign run row) now navigates to `/messages?campaign_id=<campaign_id>&run_id=<run_id>`.
- The button is disabled when either `campaign_id` or `run_id` is missing on the row.
- On landing at the Messages page with `run_id` in the URL, a green **🎯 Filtered to run** banner appears above the filter block with a **Clear run filter** button (preserves the campaign_id filter — only drops the run scope).
- The existing CR-026 blue "Filtered by campaign" banner remains unchanged and continues to work independently.

### CR-042
- **New endpoint**: `GET /api/whatsapp/message-logs/export?format=csv|xlsx&<all list filters>`. Streams a report of matching logs. Row cap 5000. Adds `X-Row-Count` and `X-Row-Cap` response headers.
- **New button — MessageStatusPage**: Export ▾ dropdown next to the Refresh button. Dropdown items = CSV / Excel. Honours the currently active filters (status, event, campaign, run, template, search, dates, include_test).
- **New button — CampaignHistoryPage**: Per-row Export ▾ dropdown next to Details and Resend buttons. Scopes by that specific `run.id`.
- Filename patterns:
  - MessageStatus: `message_report_YYYY_MM_DD.<ext>`
  - CampaignHistory: `run_<campaign_name_slug>_<run_id_prefix>.<ext>`
- Report columns (12): Sent At (created_at), Phone, Name, Event / Campaign, Template, Status, Delivered At, Read At, Rejected At, Error Reason, Message ID, Test Send (Yes/No).
- Excel styling: brand orange (#F26B33) fill on header row + white bold font (matches CR-035 pattern).
- Cap-hit toast: yellow warning "Showing first 5000 rows. Refine filters for a smaller export."

---

## 2. Files changed

| File | Purpose |
|---|---|
| `backend/routers/whatsapp.py` | Shared `_build_message_log_query()` helper (extracted); `run_id` param on `/message-logs`; new `export_message_logs` endpoint + `_EXPORT_HEADERS` / `_EXPORT_ROW_CAP` constants + `_resolve_event_or_campaign` / `_row_from_log` helpers |
| `frontend/src/pages/MessageStatusPage.jsx` | `run_id` in filters state; URL param reader for `run_id`; `handleExport(format)` handler; export dropdown in header (both non-embedded and embedded modes); green "🎯 Filtered to run" banner |
| `frontend/src/pages/CampaignHistoryPage.jsx` | `useNavigate` import + hook; `openExportRunId` state for per-row dropdown; `handleRunExport(run, format)` handler; Details button `onClick` wired; per-row Export dropdown JSX |

No changes to: `core/whatsapp.py`, `core/campaign_jobs.py`, `routers/campaigns.py`, `routers/customers.py`, `models/schemas.py`, `whatsapp_message_logs` schema, CR-026 URL scheme (extended additively only), auth code, tests. Nothing under `core/coupon.py`, `core/loyalty.py`, `pos.py`.

---

## 3. Self-test results (by Implementation)

### Backend curl (`API=http://localhost:8001` · JWT for `pos_0001_restaurant_635`)

| # | Test | Result |
|---|---|---|
| B1 | `GET /message-logs/export?format=csv&status=delivered` | ✅ 200 · text/csv · X-Row-Count=1 · X-Row-Cap=5000 · Content-Disposition attachment · header + 1 row |
| B2 | `GET /message-logs/export?format=xlsx` (no filter) | ✅ 200 · valid xlsx · 12 columns · 442 rows · brand-orange header |
| B3 | `GET /message-logs/export?format=pdf` | ✅ 400 |
| B4 | `GET /message-logs/export?format=csv` (no auth header) | ✅ 403 |
| B5 | Regression `GET /message-logs?limit=2` (no run_id) | ✅ 200 · total=442 · unchanged shape |
| B6 | New `GET /message-logs?run_id=nonexistent_run` | ✅ 200 · total=0 |
| B7 | `pytest tests/` full regression | ✅ 11/11 PASS in 10.16s |
| B8 | Backend restart | ✅ Hot reload picked up changes cleanly; `/api/health` healthy |
| B9 | XLSX header verification (openpyxl load) | ✅ 12 columns match `_EXPORT_HEADERS` order |

### Frontend

| # | Test | Result |
|---|---|---|
| L1 | Lint `CampaignHistoryPage.jsx` | ✅ No issues |
| L2 | Lint `MessageStatusPage.jsx` | ⚠️ 1 pre-existing unused-eslint-disable warning (unrelated to my changes) |
| L3 | Webpack compile | ✅ Compiled with 2 pre-existing hook-deps warnings (already present before this CR) |
| L4 | Load `/` → sidebar renders | ✅ MyGenie sidebar visible; app boots |
| L5 | Backend `/api/health` after frontend deploy | ✅ Healthy |

**No self-test failure. All 9 backend checks + 5 frontend checks PASS.**

---

## 4. Test matrix for owner UAT

### 4.1 BUG-009 flows

| # | Steps | Expected |
|---|---|---|
| U1 | Login as `owner@jehsnest.com` → Marketing > History | Table of campaign runs. Each row has Details, Resend (if failed>0), Export buttons. |
| U2 | Click Details on any run | URL becomes `/messages?campaign_id=<X>&run_id=<Y>`. MessageStatusPage opens. |
| U3 | On MessageStatusPage after U2 | Green emerald "🎯 Filtered to run" banner visible above the filter block. Message log table shows only rows for that specific run. |
| U4 | Click "Clear run filter" on the green banner | Green banner disappears. Blue "Filtered by campaign" banner may still show if campaign_id was in URL — expected. Full filter set unchanged except run_id removed. |
| U5 | Details button on a row missing campaign_id or run_id | Button is disabled (grayed out). |
| U6 | Return to Marketing > History (existing behaviours) | Resend button, days filter (7/30/90), stat cards all unchanged. |

### 4.2 CR-042 — MessageStatusPage export

| # | Steps | Expected |
|---|---|---|
| U7 | Navigate to Messages page | New "Export ▾" button visible next to Refresh. |
| U8 | Set filter status=delivered → click Export → CSV | Download `message_report_YYYY_MM_DD.csv`. Open in text editor — 12 header columns + N rows, ALL rows have status=delivered. Toast: "Exported N row(s)". |
| U9 | Same as U8 but Excel | Download `message_report_YYYY_MM_DD.xlsx`. Open in Excel — orange header row, 12 columns. |
| U10 | Export while landed via BUG-009 deep-link (run_id in URL) | Downloaded rows match only that run — same as Message Status table |
| U11 | Export with a filter combo producing 0 rows | Download contains header row only. Toast: "Exported 0 rows". |
| U12 | Simulate 5000-row cap (need a large tenant OR reduce cap for test) | Toast: "Showing first 5000 rows. Refine filters for a smaller export." |

### 4.3 CR-042 — CampaignHistoryPage per-run export

| # | Steps | Expected |
|---|---|---|
| U13 | Marketing > History → click Export ▾ on any row | Small dropdown appears with CSV + Excel |
| U14 | Choose CSV | Download `run_<campaignslug>_<runidprefix>.csv`. Row count == that run's total_sent (approximately, ± resends). Toast: "Exported N row(s)". |
| U15 | Choose Excel | Same as U14 with .xlsx |
| U16 | Click outside dropdown | Dropdown closes |
| U17 | Open dropdown on one row, then click Export on another row | First dropdown closes, second opens (only one open at a time) |

### 4.4 Regression

| # | Steps | Expected |
|---|---|---|
| U18 | Existing CR-026 flow: click "View Messages" on CampaignsPage | URL has campaign_id only (no run_id). Blue "Filtered by campaign" banner visible. Green run banner NOT visible. |
| U19 | Existing Resend flow | Unchanged |
| U20 | Existing all 8 filter dimensions on MessageStatusPage | Unchanged |
| U21 | Existing embed mode of MessageStatusPage (if used elsewhere) | Same as U7 but export button is in the embedded action bar |

---

## 5. Known non-issues (verified but worth noting)

1. **Pre-existing eslint warning** on `MessageStatusPage.jsx:186` — `unused eslint-disable directive`. Was there before my changes. Not blocking. Left as-is per §5 "Do not improvise".
2. **F841 in `routers/whatsapp.py:902`** — unused local variable in unrelated `menu_pick` validation code. Pre-existing. Not blocking (ruff warning, not compile error). Left as-is.
3. **Frontend recompile warnings** for missing hook deps on line 38 (fetchRuns) and line 121 (searchParams) — my new useEffect follows the exact same pattern as the CR-026 pre-existing useEffect. Cosmetic warnings only.

---

## 6. Rollback plan

If a UAT failure surfaces:

```bash
# 1. Revert code
cd /app && git log --oneline | head -3          # find the CR-042/BUG-009 commit
git revert <sha>

# 2. Restart backend (frontend hot-reloads)
sudo supervisorctl restart backend

# 3. Verify
curl http://localhost:8001/api/health
```

No DB migration to roll back. No env var change.

---

## 7. Data-testid map for future automated testing

**CampaignHistoryPage**:
- `history-details-btn-<run_id>`
- `history-resend-failed-<run_id>` (unchanged from earlier)
- `history-export-btn-<run_id>`, `history-export-csv-<run_id>`, `history-export-xlsx-<run_id>`

**MessageStatusPage**:
- `messages-export-btn`, `messages-export-csv`, `messages-export-xlsx` (top action bar)
- `messages-export-btn-embedded`, `messages-export-csv-embedded`, `messages-export-xlsx-embedded` (embedded mode)
- `filtered-to-run-banner`, `clear-run-filter-btn` (BUG-009 banner)
- `campaign-filter-banner`, `campaign-filter-clear` (CR-026, unchanged)

---

## 8. Sign-off checklist for QA (Role 4) → Owner acceptance

- [ ] BUG-009 U1-U6 all PASS
- [ ] CR-042 U7-U17 all PASS
- [ ] Regression U18-U21 all PASS
- [ ] Row counts match expected on at least 1 real Jeh's Nest campaign run
- [ ] Owner-side smoke test on Excel file rendering (open in real Excel/Numbers/LibreOffice)
- [ ] Any UAT failure filed with a fresh CR / BUG ID

---

## 9. Handover exit

```text
Code complete: BUG-009 + CR-042
Risk: LOW
Self-test: 14/14 PASS (9 backend curl + 5 frontend)
Build/compile: PASS (backend hot-reload OK; frontend webpack OK with pre-existing warnings only)
Registry sync: YES (CR_STATUS_DASHBOARD + BUG_REGISTRY_CAMPAIGNS updated)
Exit Gate: 7/7 PASS
Docs: crm_roi_sprint/qa/BUG_009_CR_042_QA_HANDOVER.md (this file), SESSION_2026_07_03_HANDOVER.md (next)
Next: Owner UAT → Role 4 QA (owner-driven manual testing) → Role 8 Closure
```

*End of QA handover. Standing by for owner UAT.*
