# BUG-009 + CR-042 — Implementation Plan (bundled)

> **Items**: BUG-009 (Details button deep-link) + CR-042 (Message report download)
> **Bundled because**: Both need the same new `run_id` filter param on `GET /api/whatsapp/message-logs`. Touch `routers/whatsapp.py` ONCE.
> **Priority**: BUG-009 = P2 · CR-042 = P2
> **Type**: Bug fix (BUG-009) + Feature (CR-042)
> **Owner approval status**: ✅ Owner-locked (2026-07-03) — mockups approved
> **Effort**: ~4-5 hr total (BUG-009 ~30 min · CR-042 ~3-5 hr · shared backend ~1 hr)
> **Files touched**: 4 (`routers/whatsapp.py`, `CampaignHistoryPage.jsx`, `MessageStatusPage.jsx`, `pages/MessageStatusPage.jsx` — one file two edits)
> **Migration required**: No
> **Schema changes**: No
> **New dependencies**: No (`openpyxl`, `io`, `csv`, `StreamingResponse` already in use via CR-035)
> **Impact analysis**: `crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md` §1-§2
> **Decisions**: `DECISIONS_LOG.md § 2026-07-03 [CR-042], [BUG-009]`

---

## 1. Objective

**BUG-009**: Wire the dead `Details` button on `CampaignHistoryPage` to deep-link into `MessageStatusPage` pre-filtered by the specific run.

**CR-042**: Provide two download entry-points (filter-aware on `MessageStatusPage`, per-run on `CampaignHistoryPage`) that stream a CSV or XLSX report of WhatsApp message logs matching the current filter set.

Bundled objective: extend `GET /api/whatsapp/message-logs` with a `run_id` filter param, extract a reusable `_build_message_log_query()` helper, then build 2 new frontend affordances + 1 new backend endpoint that consume the shared helper.

---

## 2. Scope

### 2.1 In-scope

- Add `run_id: Optional[str]` param to `GET /api/whatsapp/message-logs` (used by both items).
- Extract `_build_message_log_query()` helper from current `get_message_logs` so both list + export use identical filter logic.
- Add new `GET /api/whatsapp/message-logs/export?format=csv|xlsx` endpoint with 5000-row cap and StreamingResponse.
- Wire `onClick` on `CampaignHistoryPage` Details button → `navigate('/messages?campaign_id=X&run_id=Y')`.
- Add contextual "🎯 Filtered to run" banner on `MessageStatusPage` when `run_id` is in URL.
- Extend `MessageStatusPage` URL param reader to read `run_id` alongside `campaign_id` (CR-026 pattern extension).
- Add an "Export ▾ (CSV / XLSX)" dropdown on the filter bar of `MessageStatusPage` (respects current filters).
- Add an "Export ▾ (CSV / XLSX)" per-row dropdown on `CampaignHistoryPage` (scopes by `run_id`).

### 2.2 Out-of-scope

- Any change to the send / resend path (`core/whatsapp.py`, campaigns.py send methods).
- Any change to CR-026 URL scheme beyond adding `run_id` alongside `campaign_id`.
- Any dashboard / analytics endpoint changes.
- Column customisation UI (fields frozen at owner-approved 12).
- Format options beyond CSV + XLSX (no PDF, no JSON dump).
- Row-cap tuning (5000 is owner-frozen).
- Any change to `whatsapp_message_logs` schema.

### 2.3 Non-goals

- Modal for BUG-009 (rejected in mockup review).
- Server-side generated PDF report.
- Async / background job for very large exports (not needed under 5000-row cap).

---

## 3. Design

### 3.1 Shared helper — `_build_message_log_query()`

**File**: `backend/routers/whatsapp.py`
**Location**: New helper defined just above current `get_message_logs` (~line 1120).

**Signature**:
```python
def _build_message_log_query(
    user_id: str,
    status: Optional[str],
    event_type: Optional[str],
    campaign_id: Optional[str],
    run_id: Optional[str],           # CR-042 + BUG-009 — new dimension
    template_name: Optional[str],
    search: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
    include_test: bool,
) -> Dict[str, Any]:
    """Build the Mongo query for whatsapp_message_logs. Used by both
    list_message_logs and export_message_logs.

    CR-042 + BUG-009 addition: run_id filter uses $or on campaign_id/reference_id
    to capture both legacy (pre-BUG-006) and new (post-BUG-006) log shapes.
    """
```

**Body semantics** (mirror current `get_message_logs` lines 1130-1195, plus new `run_id` block):
```python
query: Dict[str, Any] = {"user_id": user_id}
if not include_test:
    query["is_test"] = {"$ne": True}

conjuncts: List[Dict[str, Any]] = []

if campaign_id:
    conjuncts.append({
        "$or": [
            {"campaign_id": campaign_id},
            {"reference_id": campaign_id},   # BUG-006 legacy compat
        ]
    })

if run_id:
    # CR-042 + BUG-009: same $or shape as campaign_id — captures legacy logs
    # (which stored run_id in campaign_id) and current logs (reference_id = run_id).
    conjuncts.append({
        "$or": [
            {"campaign_id": run_id},
            {"reference_id": run_id},
        ]
    })

if status:
    conjuncts.append({"status": status})
if event_type:
    conjuncts.append({"event_type": event_type})
if template_name:
    conjuncts.append({"template_name": template_name})
if search:
    escaped = re.escape(search)
    conjuncts.append({
        "$or": [
            {"customer_name": {"$regex": escaped, "$options": "i"}},
            {"customer_phone": {"$regex": escaped, "$options": "i"}},
        ]
    })
if date_from or date_to:
    range_q: Dict[str, str] = {}
    if date_from:
        range_q["$gte"] = date_from
    if date_to:
        range_q["$lte"] = date_to
    conjuncts.append({"sent_at": range_q})

if conjuncts:
    query["$and"] = conjuncts
return query
```

### 3.2 Refactor `get_message_logs` to use helper

**File**: `backend/routers/whatsapp.py`
**Location**: Current `get_message_logs` (~line 1125-1196).

**Change**: Replace the manual query construction with a single call:
```python
@router.get("/message-logs")
async def get_message_logs(
    status: Optional[str] = None,
    event_type: Optional[str] = None,
    campaign_id: Optional[str] = None,
    run_id: Optional[str] = None,     # CR-042 + BUG-009: new param
    template_name: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    include_test: bool = False,
    skip: int = 0,
    limit: int = 50,
    user: dict = Depends(get_current_user),
):
    query = _build_message_log_query(
        user_id=user["id"],
        status=status, event_type=event_type,
        campaign_id=campaign_id, run_id=run_id,
        template_name=template_name, search=search,
        date_from=date_from, date_to=date_to,
        include_test=include_test,
    )
    cursor = db.whatsapp_message_logs.find(query).sort("sent_at", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=limit)
    total = await db.whatsapp_message_logs.count_documents(query)
    return {
        "logs": _serialize_logs(logs),
        "total": total,
        "skip": skip,
        "limit": limit,
    }
```

Note: `_serialize_logs` is the existing serializer — do not touch. Keep the response shape byte-identical for CR-026 and existing consumers.

### 3.3 New endpoint — `GET /message-logs/export`

**File**: `backend/routers/whatsapp.py`
**Location**: Immediately after refactored `get_message_logs` (~line 1200).

**Full endpoint**:
```python
# CR-042: Message report download — CSV + XLSX with 5000-row cap
_EXPORT_HEADERS = [
    ("Sent At", "sent_at"),
    ("Phone", "customer_phone"),
    ("Name", "customer_name"),
    ("Event / Campaign", "_event_or_campaign"),     # computed
    ("Template", "template_name"),
    ("Status", "status"),
    ("Delivered At", "delivered_at"),
    ("Read At", "read_at"),
    ("Rejected At", "rejected_at"),
    ("Error Reason", "failure_reason"),
    ("Message ID", "message_id"),
    ("Test Send", "is_test"),
]
_EXPORT_ROW_CAP = 5000
_EXPORT_BRAND_COLOR = "F26B33"  # match CR-035 XLSX styling

def _resolve_event_or_campaign(log: dict) -> str:
    """Human-readable dimension for the report column."""
    if log.get("event_type"):
        return log["event_type"]
    if log.get("campaign_name"):
        return log["campaign_name"]
    if log.get("campaign_id"):
        return f"campaign:{log['campaign_id']}"
    return ""

def _row_from_log(log: dict) -> List[str]:
    row = []
    for _, key in _EXPORT_HEADERS:
        if key == "_event_or_campaign":
            row.append(_resolve_event_or_campaign(log))
        elif key == "is_test":
            row.append("Yes" if log.get("is_test") else "No")
        else:
            v = log.get(key, "")
            row.append("" if v is None else str(v))
    return row

@router.get("/message-logs/export")
async def export_message_logs(
    format: str = "csv",                          # 'csv' or 'xlsx'
    status: Optional[str] = None,
    event_type: Optional[str] = None,
    campaign_id: Optional[str] = None,
    run_id: Optional[str] = None,
    template_name: Optional[str] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    include_test: bool = False,
    user: dict = Depends(get_current_user),
):
    if format not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'xlsx'")

    query = _build_message_log_query(
        user_id=user["id"],
        status=status, event_type=event_type,
        campaign_id=campaign_id, run_id=run_id,
        template_name=template_name, search=search,
        date_from=date_from, date_to=date_to,
        include_test=include_test,
    )
    cursor = db.whatsapp_message_logs.find(query).sort("sent_at", -1).limit(_EXPORT_ROW_CAP)
    logs = await cursor.to_list(length=_EXPORT_ROW_CAP)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    tenant_slug = (user.get("business_name") or user["id"])[:32].replace(" ", "_")
    filename_base = f"message_report_{tenant_slug}_{ts}"

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([h for h, _ in _EXPORT_HEADERS])
        for log in logs:
            writer.writerow(_row_from_log(log))
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename_base}.csv"',
                "X-Row-Count": str(len(logs)),
                "X-Row-Cap": str(_EXPORT_ROW_CAP),
            },
        )

    # xlsx
    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet("Message Report")
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor=_EXPORT_BRAND_COLOR)
    header_row = [Cell(worksheet=ws, value=h) for h, _ in _EXPORT_HEADERS]
    for cell in header_row:
        cell.font = header_font
        cell.fill = header_fill
    ws.append(header_row)
    for log in logs:
        ws.append(_row_from_log(log))
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_base}.xlsx"',
            "X-Row-Count": str(len(logs)),
            "X-Row-Cap": str(_EXPORT_ROW_CAP),
        },
    )
```

**Imports needed at top of file** (verify present, add if missing):
```python
import io, csv, re
from datetime import datetime, timezone
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.cell import Cell
```
(All already imported by CR-035 pattern in customers.py — do a quick grep before adding.)

### 3.4 Frontend edit 1 — BUG-009 Details onClick

**File**: `frontend/src/pages/CampaignHistoryPage.jsx`
**Location**: Line 164-166.

**Before**:
```jsx
<Button variant="outline" size="sm" className="text-xs rounded-full" data-testid="history-details-btn">
    Details
</Button>
```

**After**:
```jsx
{/* BUG-009: deep-link to MessageStatusPage filtered by this run */}
<Button
    variant="outline"
    size="sm"
    className="text-xs rounded-full"
    data-testid="history-details-btn"
    onClick={() => navigate(`/messages?campaign_id=${run.campaign_id}&run_id=${run.id}`)}
    disabled={!run.campaign_id || !run.id}
>
    Details
</Button>
```

**Import**: `useNavigate` from `react-router-dom` — add if not already imported at top of file. Add `const navigate = useNavigate();` inside `CampaignHistoryContent` component (~line 60).

### 3.5 Frontend edit 2 — MessageStatusPage URL param reader

**File**: `frontend/src/pages/MessageStatusPage.jsx`
**Location**: Line 82-91 (filters state init) and Line 106-113 (URL param useEffect).

**State init — add `run_id` alongside `campaign_id`**:
```jsx
const [filters, setFilters] = useState({
    // ... existing keys ...
    campaign_id: "",
    run_id: "",     // BUG-009 + CR-042: run-scoped filter
});
```

**URL param useEffect — add `run_id` reader**:
```jsx
useEffect(() => {
    const cid = searchParams.get("campaign_id");
    const rid = searchParams.get("run_id");                       // BUG-009
    if (cid || rid) {
        setFilters((f) => ({ ...f, campaign_id: cid || "", run_id: rid || "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**fetchLogs params — append `run_id`** (~line 145-156):
```jsx
if (filters.campaign_id) params.append("campaign_id", filters.campaign_id);
if (filters.run_id) params.append("run_id", filters.run_id);      // BUG-009 + CR-042
```

### 3.6 Frontend edit 3 — MessageStatusPage "Filtered to run" banner

**File**: `frontend/src/pages/MessageStatusPage.jsx`
**Location**: Above the stat-card row (verify position after inspecting current JSX; roughly the top of the return block ~line 250).

**Insert**:
```jsx
{/* BUG-009: contextual banner when landing with a run scope */}
{filters.run_id && (
    <div
        className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3"
        data-testid="filtered-to-run-banner"
    >
        <div className="flex items-center gap-2 text-sm text-emerald-900">
            <span aria-hidden="true">🎯</span>
            <span>
                Filtered to run:&nbsp;
                <span className="font-semibold">
                    {filters.campaign_id ? `campaign ${filters.campaign_id}` : "unnamed"}
                </span>
                {" · "}run_id: <span className="font-mono text-xs">{filters.run_id}</span>
            </span>
        </div>
        <Button
            variant="ghost" size="sm"
            className="text-emerald-700"
            data-testid="clear-run-filter-btn"
            onClick={() => setFilters((f) => ({ ...f, run_id: "", campaign_id: "" }))}
        >
            Clear filter
        </Button>
    </div>
)}
```

### 3.7 Frontend edit 4 — MessageStatusPage Export dropdown

**File**: `frontend/src/pages/MessageStatusPage.jsx`
**Location**: In the filter action bar (verify exact position — should sit to the right of the Refresh button).

**Insert** (following CR-035's dropdown pattern from `CustomersPage.jsx:213-395`):
```jsx
{/* CR-042: Export dropdown for filter-aware download */}
<DropdownMenu>
    <DropdownMenuTrigger asChild>
        <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            data-testid="messages-export-btn"
        >
            Export ▾
        </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
        <DropdownMenuItem
            data-testid="messages-export-csv"
            onClick={() => handleExport("csv")}
        >
            📄 CSV
        </DropdownMenuItem>
        <DropdownMenuItem
            data-testid="messages-export-xlsx"
            onClick={() => handleExport("xlsx")}
        >
            📊 Excel (.xlsx)
        </DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>
```

**handleExport function** (add above return, ~line 200):
```jsx
const handleExport = async (format) => {
    const params = new URLSearchParams({ format });
    if (filters.status && filters.status !== "all") params.append("status", filters.status);
    if (filters.event_type && filters.event_type !== "all") params.append("event_type", filters.event_type);
    if (filters.campaign_id) params.append("campaign_id", filters.campaign_id);
    if (filters.run_id) params.append("run_id", filters.run_id);
    if (filters.template_name && filters.template_name !== "all") params.append("template_name", filters.template_name);
    if (filters.search) params.append("search", filters.search);
    if (filters.date_from) params.append("date_from", filters.date_from);
    if (filters.date_to) params.append("date_to", filters.date_to);
    if (filters.include_test) params.append("include_test", "true");
    try {
        const resp = await api.get(`/whatsapp/message-logs/export?${params}`, { responseType: "blob" });
        const rowCount = resp.headers["x-row-count"];
        const rowCap = resp.headers["x-row-cap"];
        const url = window.URL.createObjectURL(new Blob([resp.data]));
        const link = document.createElement("a");
        link.href = url;
        const ext = format === "xlsx" ? "xlsx" : "csv";
        link.setAttribute("download", `message_report.${ext}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        if (rowCount && rowCap && parseInt(rowCount) >= parseInt(rowCap)) {
            toast.warning(`Showing first ${rowCap} rows. Refine filters for a smaller export.`);
        } else {
            toast.success(`Exported ${rowCount || "?"} rows`);
        }
    } catch (e) {
        toast.error("Export failed. Please try again.");
    }
};
```

### 3.8 Frontend edit 5 — CampaignHistoryPage per-row Export dropdown

**File**: `frontend/src/pages/CampaignHistoryPage.jsx`
**Location**: In each row's action-button cluster, next to the Details button (~line 186 after the Resend button).

**Insert**:
```jsx
{/* CR-042: per-run export dropdown */}
<DropdownMenu>
    <DropdownMenuTrigger asChild>
        <Button
            variant="outline"
            size="sm"
            className="text-xs rounded-full"
            data-testid={`history-export-btn-${run.id}`}
        >
            Export ▾
        </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
        <DropdownMenuItem
            data-testid={`history-export-csv-${run.id}`}
            onClick={() => handleRunExport(run, "csv")}
        >
            📄 CSV
        </DropdownMenuItem>
        <DropdownMenuItem
            data-testid={`history-export-xlsx-${run.id}`}
            onClick={() => handleRunExport(run, "xlsx")}
        >
            📊 Excel (.xlsx)
        </DropdownMenuItem>
    </DropdownMenuContent>
</DropdownMenu>
```

**handleRunExport function** (add above return in CampaignHistoryContent):
```jsx
const handleRunExport = async (run, format) => {
    const params = new URLSearchParams({ format, run_id: run.id, campaign_id: run.campaign_id });
    try {
        const resp = await api.get(`/whatsapp/message-logs/export?${params}`, { responseType: "blob" });
        const rowCount = resp.headers["x-row-count"];
        const url = window.URL.createObjectURL(new Blob([resp.data]));
        const link = document.createElement("a");
        link.href = url;
        const ext = format === "xlsx" ? "xlsx" : "csv";
        link.setAttribute("download", `run_${run.id}.${ext}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success(`Exported ${rowCount || "?"} rows`);
    } catch (e) {
        toast.error("Export failed. Please try again.");
    }
};
```

---

## 4. Files touched

| File | Change type | ~LOC |
|---|---|---|
| `backend/routers/whatsapp.py` | (a) NEW helper `_build_message_log_query` (~50 LOC), (b) REFACTOR `get_message_logs` to use helper (~10 LOC net), (c) NEW endpoint `export_message_logs` (~90 LOC), (d) NEW constants `_EXPORT_HEADERS`, `_EXPORT_ROW_CAP`, `_EXPORT_BRAND_COLOR` (~15 LOC), (e) NEW helpers `_resolve_event_or_campaign`, `_row_from_log` (~20 LOC). Total ~185 net-new LOC. | +185 |
| `frontend/src/pages/CampaignHistoryPage.jsx` | (a) onClick on Details button (BUG-009), (b) Export dropdown per row (CR-042), (c) `handleRunExport` helper, (d) `useNavigate` import + hook | +45 |
| `frontend/src/pages/MessageStatusPage.jsx` | (a) `run_id` in filters state, (b) URL param reader for `run_id`, (c) filters params include `run_id`, (d) "🎯 Filtered to run" banner, (e) Export dropdown in action bar (CR-042), (f) `handleExport` helper, (g) toast import if missing | +75 |

**Total: ~305 LOC across 3 files.**

## 5. Files NOT touched

- `core/whatsapp.py` (send path, CRITICAL)
- `core/campaign_jobs.py` (scheduler)
- `routers/campaigns.py` (Details deep-link doesn't need campaign-side changes)
- `routers/customers.py`
- `whatsapp_message_logs` collection schema
- CR-026 URL scheme (extended additively, not rewritten)
- Any auth / integration code
- `models/schemas.py`
- Any tests file (existing pytest suite should continue to pass unchanged)

---

## 6. Code markers

Every net-new or modified block must carry a `// CR-042:` or `// BUG-009:` comment (JS) or `# CR-042:` / `# BUG-009:` (Python). For shared changes (backend `run_id` filter, helper extraction) use `# CR-042 + BUG-009:` prefix.

---

## 7. Migrations / config / .env

**None.** No new environment variables, no new secrets, no new dependencies, no DB migration.

---

## 8. Verification matrix

### 8.1 Backend (curl)

| # | Item | Command | Expected |
|---|---|---|---|
| B1 | CR-042 | `curl -H "Authorization: Bearer $TOK" "$API/api/whatsapp/message-logs/export?format=csv&status=delivered" -o out.csv` | HTTP 200, valid CSV with header row + N data rows, `X-Row-Count: N` header |
| B2 | CR-042 | Same as B1 with `format=xlsx` | HTTP 200, valid xlsx binary; open in Excel — column headers styled orange |
| B3 | CR-042 | `?format=csv&run_id=<known>&campaign_id=<known>` | Only rows for that specific run — row count matches `campaign_runs.total_sent` for that run (± delta if resends exist) |
| B4 | CR-042 | Export against Jeh's Nest (which has >100 logs) with no filters | 5000-row cap NOT hit; row count = actual total |
| B5 | CR-042 | Export with `format=pdf` | HTTP 400 |
| B6 | CR-042 | Export without auth | HTTP 401 |
| B7 | CR-042 | User A exports with User B's `campaign_id` | Empty result (0 rows) — tenant isolation enforced |
| B8 | BUG-009 + CR-042 | `/message-logs?run_id=X` | Filtered response; same rows as `/message-logs/export?run_id=X` (parity check) |
| B9 | BUG-009 | Existing test `/message-logs?campaign_id=X` (no run_id) | Response unchanged from pre-refactor (regression) |
| B10 | Both | `pytest tests/` | 11/11 PASS (no regressions in CR-041 webhook tests, CR-039 disambiguation tests) |

### 8.2 Frontend (manual browser flows)

| # | Item | Steps | Expected |
|---|---|---|---|
| F1 | BUG-009 | Login as `owner@jehsnest.com` → Marketing > History → click any Details button | URL becomes `/messages?campaign_id=X&run_id=Y`; MessageStatusPage loads |
| F2 | BUG-009 | On landed MessageStatusPage after F1 | Green "🎯 Filtered to run" banner visible above stat cards |
| F3 | BUG-009 | Click "Clear filter" on banner | Banner disappears; message log reverts to unfiltered list |
| F4 | BUG-009 | Details button on a row whose `run.id` or `run.campaign_id` is missing | Button is disabled (grey) |
| F5 | CR-042 (MessageStatus) | Set filter status=delivered, click Export ▾ → CSV | Download starts; open file — every row has status=delivered |
| F6 | CR-042 (MessageStatus) | Same as F5 with XLSX | Download starts; open in Excel — same rows + styled header row |
| F7 | CR-042 (History) | Click Export ▾ on a specific run row → CSV | Download `run_<id>.csv`; row count matches that run's message count |
| F8 | CR-042 (History) | Same as F7 with XLSX | Download `run_<id>.xlsx` |
| F9 | CR-042 | Toast messages | On success: green "Exported N rows"; on cap-hit: warning "Showing first 5000..."; on failure: red "Export failed" |
| F10 | CR-042 + BUG-009 | Regression — existing filter dropdowns on MessageStatusPage still work | No console errors, all 8 existing filter axes still filter correctly |
| F11 | CR-042 | Mobile viewport (375px) — CampaignHistoryPage row actions | Export button visible, does not overflow row |

### 8.3 Regression (per DECISIONS_LOG "no testing_agent" rule — manual)

- Run `python -m pytest tests/ -q` → all existing tests pass (11/11 confirmed pre-change per HANDOVER).
- Load MessageStatusPage without any URL params → unchanged behavior (no banner, no run_id in query).
- Load MessageStatusPage with `?campaign_id=X` (CR-026 legacy URL) → CR-026 flow unchanged; no run_id involved.

---

## 9. Rollout / rollback

### Rollout
1. Merge all 3 files together (backend + 2 frontend). Single supervisor auto-reload cycle.
2. Verify backend health check: `curl $API/api/health` → status=healthy.
3. Run backend curl checks B1-B10.
4. Open browser, run frontend checks F1-F11.

### Rollback
1. Git revert the commit → 3 files restored to prior state.
2. `sudo supervisorctl restart backend frontend`.
3. No DB rollback needed (no schema change, no data written).

---

## 10. Owner approval status

| Ask | Status |
|---|---|
| Mockup approval — BUG-009 | ✅ 2026-07-03 "2 ok" |
| Mockup approval — CR-042 both entry-points | ✅ 2026-07-03 "1 freeze" |
| Fields, format, row cap for CR-042 | ✅ 2026-07-03 intake answers |
| Bundling of BUG-009 + CR-042 backend commit | ⏳ Implicit — reconfirm at gate |

**All owner-side answers received. No blockers. Ready for Implementation on gate.**

---

## 11. Estimated calendar time

| Phase | Time |
|---|---|
| Backend implementation | ~1.5 hr |
| Frontend implementation | ~2 hr |
| Manual verification (backend curl + browser) | ~1 hr |
| Buffer / bug fixes surfaced during verification | ~0.5 hr |
| **Total** | **~5 hr** |

---

*End of Implementation Plan for BUG-009 + CR-042. No code changes yet. Awaits owner gate to open Role 3 (Implementation).*
