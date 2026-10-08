# CR-035 — Full Implementation Plan: Customer Export & Import
# (Line-by-line. Every file. Every function. Every edge case.)

> **Gate**: Implementation Planning (post Impact Analysis approval)
> **Date**: 2026-07-01
> **Status**: READY — all Q1–Q10 locked, mockup approved
> **Risk**: LOW
> **Total files touched**: 3 (1 backend model, 1 backend router, 1 frontend page)
> **New collections**: 1 (`import_logs`)
> **New pip packages**: 1 (`openpyxl`)
> **Hotspot files**: 0

---

## Table of Contents
1. Pre-flight checklist
2. Package installation
3. `models/schemas.py` — new ImportLog model
4. `routers/customers.py` — 4 new endpoints
5. `frontend/pages/CustomersPage.jsx` — state, handlers, UI
6. Sequence diagrams
7. Error codes reference
8. Edge case registry
9. Verification matrix (V1–V18)

---

## 1. Pre-flight Checklist

Before writing a single line:

- [ ] `openpyxl` installed and in requirements.txt
- [ ] `import_logs` collection does NOT need manual creation (Motor creates on first insert)
- [ ] All 4 new routes placed BEFORE `@router.get("/{customer_id}")` at line 1149 — **critical, FastAPI route ordering**
- [ ] All new routes placed AFTER `@router.get("/tags")` at line 1060 — keeps grouping clean
- [ ] No changes to existing routes, models, or any other file

---

## 2. Package Installation

### Command
```bash
pip install openpyxl && pip freeze > /app/backend/requirements.txt
```

### Verify
```bash
python3 -c "import openpyxl; print(openpyxl.__version__)"
```

### Why openpyxl
- Read `.xlsx` files on import (via `openpyxl.load_workbook(BytesIO(content))`)
- Write `.xlsx` files on export (via `openpyxl.Workbook()`)
- Pure Python, no system dependencies, works in this Docker environment
- Already used by pandas internally, but we use it directly to avoid pandas overhead on small files

---

## 3. `models/schemas.py` — Changes

**File**: `/app/backend/models/schemas.py`
**Insert after**: The last `class` definition (currently line 1041 `LoyaltySettingsUpdate`)
**Lines added**: ~20

### 3a. ImportRowError sub-model

```python
class ImportRowError(BaseModel):
    row: int                    # 1-based row number from the file
    reason: str                 # Human-readable reason e.g. "Missing phone number"
```

### 3b. ImportLog model

```python
class ImportLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    filename: str                           # Original filename from UploadFile.filename
    format: str                             # "csv" or "xlsx"
    total_rows: int                         # Rows parsed (excluding header)
    imported: int                           # Rows created (new customers)
    updated: int                            # Rows updated (duplicate phone found)
    failed: int                             # Rows skipped due to errors
    errors: List[ImportRowError] = []       # Per-row error details (max 50 stored)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

### 3c. ImportPreviewRow sub-model (used for Step 2 preview response)

```python
class ImportPreviewRow(BaseModel):
    row: int
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[str] = None              # Raw comma-sep string from file
    status: str                             # "new" | "update" | "error"
    reason: Optional[str] = None           # populated when status == "error"
```

### 3d. ImportPreviewResponse

```python
class ImportPreviewResponse(BaseModel):
    filename: str
    format: str
    total_rows: int
    new_count: int
    update_count: int
    error_count: int
    preview_rows: List[ImportPreviewRow]    # first 5 rows only
    all_errors: List[ImportRowError]        # all error rows for display
```

### Import needed at top of schemas.py (already present, just verify):
```python
from typing import List, Optional          # already exists
import uuid                                # already exists
from datetime import datetime, timezone    # already exists
from pydantic import BaseModel, Field      # already exists
```

---

## 4. `routers/customers.py` — 4 New Endpoints

**File**: `/app/backend/routers/customers.py`
**Insert position**: After line 1111 (`@router.get("/tags")` block ends ~line 1066), before line 1149 (`@router.get("/{customer_id}")`)

### 4a. New imports to add at TOP of file (line 1 area)

Add to the existing import block:
```python
# CR-035: Export/Import
import csv
import io
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from models.schemas import (
    ...,                    # existing imports unchanged
    ImportLog, ImportPreviewResponse, ImportPreviewRow, ImportRowError
)
```

**Exact search_replace target on line 16-19:**
```python
# BEFORE:
from models.schemas import (
    Customer, CustomerCreate, CustomerUpdate,
    Segment, SegmentCreate, SegmentUpdate
)

# AFTER:
from models.schemas import (
    Customer, CustomerCreate, CustomerUpdate,
    Segment, SegmentCreate, SegmentUpdate,
    ImportLog, ImportPreviewResponse, ImportPreviewRow, ImportRowError
)
```

Add to line 1 `from fastapi import` block:
```python
# BEFORE:
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request

# AFTER:
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Request, UploadFile, File
```

Add after existing imports:
```python
import csv
import io
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
```

---

### 4b. EXPORT_FIELDS constant

Insert as a module-level constant just after line 24 (`customer_sync_status = {}`):

```python
# CR-035: Ordered list of (csv_header, customer_dict_key) for export
EXPORT_FIELDS = [
    ("Name",            "name"),
    ("Phone",           "phone"),
    ("Email",           "email"),
    ("Date of Birth",   "dob"),
    ("Anniversary",     "anniversary"),
    ("Gender",          "gender"),
    ("City",            "city"),
    ("Address",         "address"),
    ("State",           "state"),
    ("Pincode",         "pincode"),
    ("Total Points",    "total_points"),
    ("Tier",            "tier"),
    ("Wallet Balance",  "wallet_balance"),
    ("Total Visits",    "total_visits"),
    ("Total Spent",     "total_spent"),
    ("Last Visit",      "last_visit"),
    ("Tags",            "tags"),             # joined as comma-sep string
    ("WhatsApp Opt-in", "whatsapp_opt_in"),
    ("VIP",             "vip_flag"),
    ("Lead Source",     "lead_source"),
    ("Customer Type",   "customer_type"),
    ("Created At",      "created_at"),
]
```

---

### 4c. Endpoint 1: `GET /customers/export` (CSV + Excel unified)

**Route**: `GET /api/customers/export?format=csv` or `?format=xlsx`
**Auth**: Required (get_current_user)
**Response**: StreamingResponse with appropriate Content-Disposition header
**Placement**: After `/tags` endpoint (~line 1066), before `/{customer_id}` at line 1149

```python
@router.get("/export")
async def export_customers(
    format: str = "csv",        # query param: "csv" or "xlsx"
    user: dict = Depends(get_current_user)
):
    """
    CR-035: Export ALL customers for this tenant as CSV or Excel.
    Downloads all customers regardless of current page filters.
    Includes: profile + loyalty + wallet + tier + tags (16 fields).
    """
    # ── 1. Validate format ──────────────────────────────────────────
    if format not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'xlsx'")

    # ── 2. Fetch all customers for this user_id ──────────────────────
    cursor = db.customers.find(
        {"user_id": user["id"]},
        {"_id": 0}                     # exclude MongoDB _id
    )
    customers = await cursor.to_list(length=None)   # no limit — export ALL

    # ── 3. Helper: get cell value for a customer ─────────────────────
    def get_val(c: dict, key: str) -> str:
        v = c.get(key)
        if v is None:
            return ""
        if key == "tags" and isinstance(v, list):
            return ", ".join(v)         # list → "VIP, Regular"
        if isinstance(v, bool):
            return "Yes" if v else "No"
        return str(v)

    headers = [h for h, _ in EXPORT_FIELDS]
    keys    = [k for _, k in EXPORT_FIELDS]

    timestamp = datetime.now(timezone.utc).strftime("%Y_%m_%d")

    # ── 4a. CSV path ─────────────────────────────────────────────────
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for c in customers:
            writer.writerow([get_val(c, k) for k in keys])

        output.seek(0)
        filename = f"customers_export_{timestamp}.csv"
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )

    # ── 4b. Excel path ───────────────────────────────────────────────
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Customers"

    # Header row — bold + orange fill matching brand
    header_fill = PatternFill(start_color="F26B33", end_color="F26B33", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    ws.append(headers)
    for cell in ws[1]:
        cell.fill   = header_fill
        cell.font   = header_font
        cell.alignment = Alignment(horizontal="center")

    # Data rows
    for c in customers:
        ws.append([get_val(c, k) for k in keys])

    # Auto column width (cap at 40)
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 40)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"customers_export_{timestamp}.xlsx"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
```

---

### 4d. Endpoint 2: `GET /customers/sample-import-template`

**Route**: `GET /api/customers/sample-import-template?format=csv`
**Purpose**: Let users download a pre-filled sample file to understand required columns
**Placement**: After `/export` endpoint

```python
@router.get("/sample-import-template")
async def download_import_template(
    format: str = "csv",
    user: dict = Depends(get_current_user)
):
    """CR-035: Download a sample import template with column headers + 2 example rows."""
    if format not in ("csv", "xlsx"):
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'xlsx'")

    IMPORT_HEADERS = ["name", "phone", "email", "dob", "city", "address", "tags"]
    SAMPLE_ROWS = [
        ["Priya Sharma",  "9876543210", "priya@example.com", "1990-05-15", "Mumbai", "123 Main St", "VIP, Regular"],
        ["Rahul Verma",   "9123456789", "rahul@example.com", "",           "Delhi",  "",             ""],
    ]

    timestamp = datetime.now(timezone.utc).strftime("%Y_%m_%d")

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(IMPORT_HEADERS)
        writer.writerows(SAMPLE_ROWS)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="import_template_{timestamp}.csv"'}
        )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Import Template"
    header_fill = PatternFill(start_color="F26B33", end_color="F26B33", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    ws.append(IMPORT_HEADERS)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
    for row in SAMPLE_ROWS:
        ws.append(row)
    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = 20

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="import_template_{timestamp}.xlsx"'}
    )
```

---

### 4e. INTERNAL HELPER: `_parse_import_file(content: bytes, filename: str)`

**Not a route.** A module-level async-compatible helper.
**Returns**: `List[dict]` — each dict has keys: `row` (1-based), `name`, `phone`, `email`, `dob`, `city`, `address`, `tags` (raw string), `_raw` (full row dict)

```python
def _parse_import_file(content: bytes, filename: str) -> list:
    """
    CR-035: Parse CSV or Excel file bytes.
    Returns list of row dicts with 1-based row index.
    Raises HTTPException 400 if file is unparseable.
    """
    rows = []
    fname = (filename or "").lower()

    try:
        if fname.endswith(".xlsx"):
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            raw_rows = list(ws.iter_rows(values_only=True))
            if not raw_rows:
                raise HTTPException(status_code=400, detail="Excel file is empty")
            # First row = headers (case-insensitive, strip whitespace)
            headers = [str(h).strip().lower() if h else "" for h in raw_rows[0]]
            for i, row in enumerate(raw_rows[1:], start=2):   # 1-based, skip header
                row_dict = {headers[j]: (str(v).strip() if v is not None else "") for j, v in enumerate(row) if j < len(headers)}
                row_dict["_row"] = i
                rows.append(row_dict)
        else:
            # Treat as CSV (default)
            text = content.decode("utf-8-sig")    # handle BOM
            reader = csv.DictReader(io.StringIO(text))
            # Normalize header keys
            for i, row in enumerate(reader, start=2):
                row_dict = {k.strip().lower(): v.strip() for k, v in row.items()}
                row_dict["_row"] = i
                rows.append(row_dict)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {str(e)}")

    return rows
```

---

### 4f. INTERNAL HELPER: `_validate_and_classify_row(row, existing_phones)`

```python
def _validate_and_classify_row(row: dict, existing_phones: set) -> dict:
    """
    CR-035: Validate a single parsed row.
    Returns dict with keys: status ("new"|"update"|"error"), reason (if error), clean data.
    """
    row_num = row.get("_row", 0)
    name  = row.get("name", "").strip()
    phone = row.get("phone", "").strip()

    # ── Mandatory field checks ───────────────────────────────────────
    if not name:
        return {"status": "error", "row": row_num, "reason": "Missing name"}
    if not phone:
        return {"status": "error", "row": row_num, "reason": "Missing phone number"}

    # ── Phone normalisation ──────────────────────────────────────────
    # Strip spaces, dashes, +91 prefix
    clean_phone = phone.replace(" ", "").replace("-", "").lstrip("+")
    if clean_phone.startswith("91") and len(clean_phone) == 12:
        clean_phone = clean_phone[2:]   # remove country code
    if not clean_phone.isdigit():
        return {"status": "error", "row": row_num, "reason": f"Invalid phone format: '{phone}'"}
    if len(clean_phone) != 10:
        return {"status": "error", "row": row_num, "reason": f"Phone must be 10 digits, got {len(clean_phone)}"}

    # ── Classify: new vs update ──────────────────────────────────────
    status = "update" if clean_phone in existing_phones else "new"

    # ── Tags: parse comma-separated string → list ────────────────────
    raw_tags = row.get("tags", "").strip()
    tags_list = [t.strip() for t in raw_tags.split(",") if t.strip()] if raw_tags else []

    return {
        "status":  status,
        "row":     row_num,
        "name":    name,
        "phone":   clean_phone,
        "email":   row.get("email", "").strip() or None,
        "dob":     row.get("dob", "").strip() or None,
        "city":    row.get("city", "").strip() or None,
        "address": row.get("address", "").strip() or None,
        "tags":    tags_list,
        "reason":  None
    }
```

---

### 4g. Endpoint 3: `POST /customers/import-preview`

**Route**: `POST /api/customers/import-preview`
**Purpose**: Step 2 of the import flow — parse file, classify rows, return preview without writing to DB
**Auth**: Required

```python
@router.post("/import-preview", response_model=ImportPreviewResponse)
async def preview_import(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """
    CR-035 Step 2: Parse uploaded file and return preview data without importing.
    Returns: first 5 rows, counts of new/update/error, all error rows.
    Max file size: 10MB. Max rows: 5000.
    """
    # ── 1. File size guard (10MB) ────────────────────────────────────
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB.")

    # ── 2. File type guard ───────────────────────────────────────────
    fname = (file.filename or "").lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only .csv and .xlsx files are supported.")

    fmt = "xlsx" if fname.endswith(".xlsx") else "csv"

    # ── 3. Parse ─────────────────────────────────────────────────────
    rows = _parse_import_file(content, file.filename)

    # ── 4. Row limit guard ───────────────────────────────────────────
    if len(rows) > 5000:
        raise HTTPException(
            status_code=400,
            detail=f"File has {len(rows)} rows. Maximum allowed is 5,000."
        )

    # ── 5. Fetch all existing phones for this tenant (for dup check) ─
    existing_docs = await db.customers.find(
        {"user_id": user["id"]}, {"phone": 1, "_id": 0}
    ).to_list(length=None)
    existing_phones = {doc["phone"] for doc in existing_docs if doc.get("phone")}

    # ── 6. Validate & classify all rows ─────────────────────────────
    classified = [_validate_and_classify_row(r, existing_phones) for r in rows]

    new_count    = sum(1 for r in classified if r["status"] == "new")
    update_count = sum(1 for r in classified if r["status"] == "update")
    error_count  = sum(1 for r in classified if r["status"] == "error")

    # ── 7. Build preview rows (first 5 rows from classified) ─────────
    preview_rows = []
    for r in classified[:5]:
        preview_rows.append(ImportPreviewRow(
            row    = r["row"],
            name   = r.get("name"),
            phone  = r.get("phone"),
            email  = r.get("email"),
            tags   = ", ".join(r.get("tags", [])) if isinstance(r.get("tags"), list) else r.get("tags"),
            status = r["status"],
            reason = r.get("reason")
        ))

    # ── 8. Collect all error rows (for display) ──────────────────────
    all_errors = [
        ImportRowError(row=r["row"], reason=r["reason"])
        for r in classified if r["status"] == "error"
    ]

    return ImportPreviewResponse(
        filename     = file.filename,
        format       = fmt,
        total_rows   = len(rows),
        new_count    = new_count,
        update_count = update_count,
        error_count  = error_count,
        preview_rows = preview_rows,
        all_errors   = all_errors
    )
```

---

### 4h. Endpoint 4: `POST /customers/import`

**Route**: `POST /api/customers/import`
**Purpose**: Step 3 — actually write to DB, create ImportLog, update tag catalog
**Auth**: Required
**Note**: Re-parses the file (frontend sends file again on confirm). No session/temp storage between steps.

```python
@router.post("/import")
async def import_customers(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user)
):
    """
    CR-035 Step 3: Execute the import. Parse file, upsert customers, record ImportLog.
    Duplicate phone → update existing customer (not replace — merges non-empty fields).
    Tags → additive (merged with existing tags, new tags added to tenant catalog).
    Returns ImportLog with final counts.
    """
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum is 10MB.")
    fname = (file.filename or "").lower()
    if not (fname.endswith(".csv") or fname.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only .csv and .xlsx supported.")
    fmt = "xlsx" if fname.endswith(".xlsx") else "csv"

    rows = _parse_import_file(content, file.filename)
    if len(rows) > 5000:
        raise HTTPException(status_code=400, detail=f"Max 5,000 rows allowed, got {len(rows)}.")

    # ── Fetch existing phones ────────────────────────────────────────
    existing_docs = await db.customers.find(
        {"user_id": user["id"]}, {"phone": 1, "id": 1, "tags": 1, "_id": 0}
    ).to_list(length=None)
    phone_to_doc = {doc["phone"]: doc for doc in existing_docs if doc.get("phone")}

    imported_count = 0
    updated_count  = 0
    failed_count   = 0
    errors         = []
    new_tags_seen  = set()

    for raw_row in rows:
        result = _validate_and_classify_row(raw_row, set(phone_to_doc.keys()))

        if result["status"] == "error":
            failed_count += 1
            errors.append(ImportRowError(row=result["row"], reason=result["reason"]))
            continue

        # ── Build customer payload ───────────────────────────────────
        payload = {"name": result["name"], "phone": result["phone"]}
        for field in ("email", "dob", "city", "address"):
            if result.get(field):
                payload[field] = result[field]

        # ── Tags: track new ones for catalog update ──────────────────
        incoming_tags = result.get("tags", [])
        for t in incoming_tags:
            new_tags_seen.add(t)

        now = datetime.now(timezone.utc).isoformat()

        if result["status"] == "update":
            # Merge: only overwrite non-empty fields; merge tags additively
            existing_doc = phone_to_doc[result["phone"]]
            existing_tags = existing_doc.get("tags", [])
            merged_tags = list(set(existing_tags + incoming_tags))  # additive
            update_payload = {**payload, "tags": merged_tags, "updated_at": now}
            # Remove None/empty from update payload to not overwrite existing data
            update_payload = {k: v for k, v in update_payload.items() if v is not None and v != ""}
            await db.customers.update_one(
                {"user_id": user["id"], "phone": result["phone"]},
                {"$set": update_payload}
            )
            updated_count += 1

        else:  # status == "new"
            new_doc = {
                "id":         str(uuid.uuid4()),
                "user_id":    user["id"],
                **payload,
                "tags":       incoming_tags,
                "tier":       "Bronze",          # default — computed by loyalty engine
                "total_points":    0,
                "wallet_balance":  0.0,
                "total_visits":    0,
                "total_spent":     0.0,
                "whatsapp_opt_in": False,
                "created_at":      now,
                "updated_at":      now,
            }
            await db.customers.insert_one(new_doc)
            imported_count += 1

    # ── Update tenant tag catalog with any new tags ──────────────────
    if new_tags_seen:
        await db.users.update_one(
            {"id": user["id"]},
            {"$addToSet": {"available_tags": {"$each": list(new_tags_seen)}}}
        )

    # ── Create ImportLog record ──────────────────────────────────────
    log = ImportLog(
        user_id    = user["id"],
        filename   = file.filename,
        format     = fmt,
        total_rows = len(rows),
        imported   = imported_count,
        updated    = updated_count,
        failed     = failed_count,
        errors     = errors[:50]        # cap stored errors at 50 rows
    )
    await db.import_logs.insert_one(log.dict())

    return {
        "id":         log.id,
        "filename":   log.filename,
        "total_rows": log.total_rows,
        "imported":   log.imported,
        "updated":    log.updated,
        "failed":     log.failed,
        "errors":     [e.dict() for e in errors[:50]],
        "created_at": log.created_at.isoformat()
    }
```

---

### 4i. Endpoint 5: `GET /customers/import-history`

**Route**: `GET /api/customers/import-history`
**Purpose**: Show past import runs on the Customers page

```python
@router.get("/import-history")
async def get_import_history(user: dict = Depends(get_current_user)):
    """CR-035: Return last 10 import logs for this tenant, newest first."""
    logs = await db.import_logs.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(10).to_list(10)
    return logs
```

---

## 5. `frontend/pages/CustomersPage.jsx` — Changes

**File**: `/app/frontend/src/pages/CustomersPage.jsx`
**Strategy**: All changes via `search_replace`. No bulk rewrite.
**Total new lines**: ~180

---

### 5a. New imports (line 1 area)

**Add to existing lucide-react import line:**
```jsx
// BEFORE (line 8):
import { 
    Users, Plus, Search, ChevronRight, Star, TrendingUp, Gift, Phone, User, Check,
    Edit2, Trash2, Building2, Calendar, MapPin, Filter, Clock, ChevronDown, Tag,
    ChevronLeft, Save, Layers, Wallet, Rocket, Cake, Heart, Utensils, MessageCircle,
    Flag, Crown, Leaf, ChevronUp, Home, Sparkles, X
} from "lucide-react";

// AFTER: add Upload, Download, FileSpreadsheet, History, AlertCircle
import { 
    Users, Plus, Search, ChevronRight, Star, TrendingUp, Gift, Phone, User, Check,
    Edit2, Trash2, Building2, Calendar, MapPin, Filter, Clock, ChevronDown, Tag,
    ChevronLeft, Save, Layers, Wallet, Rocket, Cake, Heart, Utensils, MessageCircle,
    Flag, Crown, Leaf, ChevronUp, Home, Sparkles, X,
    Upload, Download, FileSpreadsheet, History, AlertCircle, CheckCircle
} from "lucide-react";
```

---

### 5b. New state variables (inside `CustomersPage` function, after line 209 `const [tagSearchInput...`)

```jsx
// CR-035: Export/Import state
const [showExportDropdown, setShowExportDropdown]   = useState(false);
const [showImportModal, setShowImportModal]         = useState(false);
const [importStep, setImportStep]                   = useState(1);          // 1|2|3
const [importFile, setImportFile]                   = useState(null);       // File object
const [importPreview, setImportPreview]             = useState(null);       // ImportPreviewResponse
const [importResult, setImportResult]               = useState(null);       // final ImportLog
const [importLoading, setImportLoading]             = useState(false);
const [importHistory, setImportHistory]             = useState([]);
const [showImportHistory, setShowImportHistory]     = useState(false);
```

---

### 5c. `handleExport(format)` function (add after `fetchSegments` function ~line 317)

```jsx
// CR-035: Export handler
const handleExport = async (format) => {
    setShowExportDropdown(false);
    try {
        const response = await api.get(`/customers/export?format=${format}`, {
            responseType: "blob"
        });
        const url  = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href  = url;
        const date = new Date().toISOString().slice(0,10).replace(/-/g,"_");
        link.setAttribute("download", `customers_export_${date}.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success(`Exporting customers as ${format.toUpperCase()}...`);
    } catch {
        toast.error("Export failed. Please try again.");
    }
};
```

---

### 5d. `handleDownloadTemplate(format)` function

```jsx
const handleDownloadTemplate = async (format = "csv") => {
    try {
        const response = await api.get(`/customers/sample-import-template?format=${format}`, {
            responseType: "blob"
        });
        const url  = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href  = url;
        link.setAttribute("download", `import_template.${format}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    } catch {
        toast.error("Failed to download template.");
    }
};
```

---

### 5e. `handleFileSelect(file)` — called when user drops/picks file

```jsx
const handleFileSelect = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
        toast.error("Only .csv and .xlsx files are supported.");
        return;
    }
    setImportFile(file);
    setImportLoading(true);
    try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post("/customers/import-preview", formData, {
            headers: { "Content-Type": "multipart/form-data" }
        });
        setImportPreview(response.data);
        setImportStep(2);
    } catch (err) {
        toast.error(err.response?.data?.detail || "Failed to parse file.");
    } finally {
        setImportLoading(false);
    }
};
```

---

### 5f. `handleConfirmImport()` — called when user clicks "Import X Customers" on step 2

```jsx
const handleConfirmImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
        const formData = new FormData();
        formData.append("file", importFile);
        const response = await api.post("/customers/import", formData, {
            headers: { "Content-Type": "multipart/form-data" }
        });
        setImportResult(response.data);
        setImportStep(3);
        // Refresh customer list and history
        await fetchCustomers();
        await fetchSegments();
        await fetchImportHistory();
    } catch (err) {
        toast.error(err.response?.data?.detail || "Import failed.");
    } finally {
        setImportLoading(false);
    }
};
```

---

### 5g. `fetchImportHistory()` — fetch on mount and after imports

```jsx
const fetchImportHistory = async () => {
    try {
        const res = await api.get("/customers/import-history");
        setImportHistory(res.data || []);
    } catch {
        // silently ignore — not critical
    }
};
```

**Add `fetchImportHistory()` call inside existing `useEffect` on line 319:**
```jsx
// BEFORE:
useEffect(() => {
    fetchCustomers();
    fetchSegments();
}, [search, filters]);

// AFTER: add fetchImportHistory on mount only via separate useEffect
useEffect(() => {
    fetchImportHistory();
}, []);           // mount only — import history doesn't change with filters
```

---

### 5h. `resetImportModal()` — called on close/done

```jsx
const resetImportModal = () => {
    setShowImportModal(false);
    setImportStep(1);
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setImportLoading(false);
};
```

---

### 5i. Close export dropdown on outside click (useEffect)

```jsx
useEffect(() => {
    if (!showExportDropdown) return;
    const handler = (e) => {
        if (!e.target.closest("#export-btn-wrapper")) {
            setShowExportDropdown(false);
        }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
}, [showExportDropdown]);
```

---

### 5j. Header buttons UI — replace existing header (line 605–629)

**BEFORE** (current header `<div className="flex gap-2">`):
```jsx
<div className="flex gap-2">
    {!loading && customers.length === 0 && (
        <Button ...>🔄 Sync MyGenie</Button>
    )}
    <Button onClick={() => setShowAddModal(true)} ...>
        <Plus className="w-4 h-4 mr-1" /> Add
    </Button>
</div>
```

**AFTER**:
```jsx
<div className="flex gap-2 items-center">
    {/* Sync button — unchanged, only when 0 customers */}
    {!loading && customers.length === 0 && (
        <Button
            onClick={() => navigate("/settings?tab=migration")}
            variant="outline"
            className="rounded-full h-10 px-4 border-[#3B82F6] text-[#3B82F6] hover:bg-[#3B82F6]/10"
            data-testid="sync-mygenie-btn"
        >
            🔄 Sync MyGenie
        </Button>
    )}

    {/* CR-035: Export dropdown */}
    <div className="relative" id="export-btn-wrapper">
        <Button
            variant="outline"
            onClick={() => setShowExportDropdown(v => !v)}
            className="rounded-full h-10 px-4 border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
            data-testid="export-customers-btn"
        >
            <Download className="w-4 h-4 mr-1.5" />
            Export
            <ChevronDown className="w-3.5 h-3.5 ml-1" />
        </Button>
        {showExportDropdown && (
            <div className="absolute top-full right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg z-50 min-w-[170px] overflow-hidden">
                <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                    All {segments?.total?.toLocaleString() || ""} customers
                </div>
                <button
                    onClick={() => handleExport("csv")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    data-testid="export-csv-btn"
                >
                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                    Export as CSV
                </button>
                <button
                    onClick={() => handleExport("xlsx")}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    data-testid="export-xlsx-btn"
                >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    Export as Excel
                </button>
            </div>
        )}
    </div>

    {/* CR-035: Import button */}
    <Button
        variant="outline"
        onClick={() => { setShowImportModal(true); setImportStep(1); }}
        className="rounded-full h-10 px-4 border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        data-testid="import-customers-btn"
    >
        <Upload className="w-4 h-4 mr-1.5" />
        Import
    </Button>

    {/* Existing Add button — unchanged */}
    <Button
        onClick={() => setShowAddModal(true)}
        className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full h-10 px-4"
        data-testid="add-customer-btn"
    >
        <Plus className="w-4 h-4 mr-1" /> Add
    </Button>
</div>
```

---

### 5k. Import History section — add just BEFORE the customer table (after segment stats row ~line 706)

```jsx
{/* CR-035: Import History (collapsible) */}
{importHistory.length > 0 && (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
        <button
            className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-gray-50/50 transition-colors rounded-2xl"
            onClick={() => setShowImportHistory(v => !v)}
            data-testid="import-history-toggle"
        >
            <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#F26B33]" />
                <span className="font-semibold text-sm text-gray-800">Import History</span>
                <span className="text-xs text-gray-400">({importHistory.length} runs)</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showImportHistory ? "rotate-180" : ""}`} />
        </button>
        {showImportHistory && (
            <div className="border-t border-gray-50 divide-y divide-gray-50">
                {importHistory.map((log, idx) => (
                    <div key={log.id || idx} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50/50 transition-colors" data-testid={`import-history-row-${idx}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${log.failed === 0 ? "bg-green-100" : log.imported + log.updated > 0 ? "bg-amber-100" : "bg-red-100"}`}>
                            {log.failed === 0
                                ? <CheckCircle className="w-4 h-4 text-green-600" />
                                : log.imported + log.updated > 0
                                    ? <AlertCircle className="w-4 h-4 text-amber-600" />
                                    : <AlertCircle className="w-4 h-4 text-red-500" />
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{log.filename}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                                {new Date(log.created_at).toLocaleDateString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })} · {log.format?.toUpperCase()}
                            </div>
                        </div>
                        <div className="flex gap-3 text-xs font-semibold flex-shrink-0">
                            {log.imported > 0 && <span className="text-green-600">+{log.imported} new</span>}
                            {log.updated  > 0 && <span className="text-blue-600">{log.updated} updated</span>}
                            {log.failed   > 0 && <span className="text-red-500">{log.failed} failed</span>}
                        </div>
                        <div className="text-xs text-gray-400 flex-shrink-0">
                            {log.total_rows} rows
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
)}
```

---

### 5l. Import Modal — placed just before the closing `</ResponsiveLayout>` tag

**The modal is a Dialog (shadcn) with 3 internal steps rendered conditionally.**

```jsx
{/* CR-035: Import Modal */}
<Dialog open={showImportModal} onOpenChange={(open) => { if (!open) resetImportModal(); }}>
    <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
            <DialogTitle className="font-['Montserrat'] text-lg">
                {importStep === 3 ? "Import Complete" : "Import Customers"}
            </DialogTitle>
            {importStep < 3 && (
                <p className="text-xs text-gray-500 mt-0.5">
                    {importStep === 1
                        ? "Upload a CSV or Excel file — max 5,000 rows"
                        : `${importPreview?.filename} · ${importPreview?.total_rows} rows detected`
                    }
                </p>
            )}
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 my-2">
            {[1,2,3].map((s, i) => (
                <>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${importStep > s ? "bg-green-500 text-white" : importStep === s ? "bg-[#F26B33] text-white" : "bg-gray-200 text-gray-400"}`}>
                        {importStep > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
                    </div>
                    {i < 2 && <div className={`flex-1 h-0.5 ${importStep > s ? "bg-green-500" : "bg-gray-200"}`} />}
                </>
            ))}
            <span className="ml-2 text-xs text-gray-400">Step {importStep} of 3</span>
        </div>

        {/* ── STEP 1: Upload ── */}
        {importStep === 1 && (
            <div>
                {/* Drop zone */}
                <label
                    htmlFor="import-file-input"
                    className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-8 cursor-pointer hover:border-[#F26B33] hover:bg-orange-50/30 transition-all mb-4"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#F26B33]", "bg-orange-50/30"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("border-[#F26B33]", "bg-orange-50/30"); }}
                    onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
                    data-testid="import-dropzone"
                >
                    {importLoading
                        ? <div className="flex flex-col items-center gap-2"><div className="w-8 h-8 border-2 border-[#F26B33] border-t-transparent rounded-full animate-spin" /><p className="text-sm text-gray-500">Parsing file…</p></div>
                        : <>
                            <Upload className="w-10 h-10 text-gray-300 mb-2" />
                            <p className="font-semibold text-gray-700 text-sm">Drop file here, or <span className="text-[#F26B33]">browse</span></p>
                            <p className="text-xs text-gray-400 mt-1">Supports .csv and .xlsx — max 5,000 rows</p>
                          </>
                    }
                    <input id="import-file-input" type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => handleFileSelect(e.target.files[0])} data-testid="import-file-input" />
                </label>

                {/* Format guidance */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
                    <span className="font-semibold">Required columns:</span> <code className="bg-amber-100 px-1 rounded">name</code> and <code className="bg-amber-100 px-1 rounded">phone</code>.
                    Optional: email, dob, city, address, tags (comma-separated).
                    Duplicate phone → update existing customer.
                </div>

                {/* Template download */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-xs text-gray-600">Not sure of the format?</span>
                    <button onClick={() => handleDownloadTemplate("csv")} className="text-xs font-semibold text-[#F26B33] hover:underline flex items-center gap-1">
                        <Download className="w-3 h-3" /> Download Sample CSV
                    </button>
                </div>
            </div>
        )}

        {/* ── STEP 2: Preview ── */}
        {importStep === 2 && importPreview && (
            <div>
                {/* Summary pills */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold text-green-700">{importPreview.new_count}</div>
                        <div className="text-xs text-green-600">New</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold text-blue-700">{importPreview.update_count}</div>
                        <div className="text-xs text-blue-600">Will update</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                        <div className="text-xl font-bold text-red-600">{importPreview.error_count}</div>
                        <div className="text-xs text-red-500">Errors</div>
                    </div>
                </div>

                {/* Preview table */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Preview — first 5 rows</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-50"><tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">#</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Name</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Phone</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-50">
                                {importPreview.preview_rows.map(row => (
                                    <tr key={row.row} className={row.status === "error" ? "bg-red-50/60" : ""}>
                                        <td className="px-3 py-2 text-gray-400">{row.row}</td>
                                        <td className="px-3 py-2 font-medium">{row.name || <span className="text-gray-400 italic">—</span>}</td>
                                        <td className="px-3 py-2 text-gray-600">{row.phone || <span className="text-red-500">missing</span>}</td>
                                        <td className="px-3 py-2">
                                            {row.status === "new"    && <span className="text-green-600 font-medium">New</span>}
                                            {row.status === "update" && <span className="text-blue-600 font-medium">Update</span>}
                                            {row.status === "error"  && <span className="text-red-500 font-medium">{row.reason}</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Error summary if any */}
                {importPreview.error_count > 0 && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 mb-4 text-xs text-red-600">
                        <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                        <span className="font-semibold">{importPreview.error_count} row{importPreview.error_count > 1 ? "s" : ""} will be skipped</span> due to errors. Valid rows ({importPreview.new_count + importPreview.update_count}) will still import.
                    </div>
                )}
            </div>
        )}

        {/* ── STEP 3: Result ── */}
        {importStep === 3 && importResult && (
            <div>
                <div className="text-center mb-5">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle className="w-7 h-7 text-green-600" />
                    </div>
                    <h3 className="text-lg font-bold font-['Montserrat'] text-gray-900">Import Successful</h3>
                    <p className="text-xs text-gray-400 mt-1">{importResult.filename}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-5">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-green-700">{importResult.imported}</div>
                        <div className="text-xs text-green-600">Created</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-blue-700">{importResult.updated}</div>
                        <div className="text-xs text-blue-600">Updated</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                        <div className="text-xs text-red-500">Failed</div>
                    </div>
                </div>
                {importResult.errors?.length > 0 && (
                    <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-4">
                        <p className="text-xs font-semibold text-gray-600 mb-2">Failed rows (skipped)</p>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                            {importResult.errors.slice(0, 10).map((e, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="bg-red-100 text-red-600 rounded px-1.5 py-0.5 font-mono font-medium">Row {e.row}</span>
                                    <span className="text-gray-500">{e.reason}</span>
                                </div>
                            ))}
                            {importResult.errors.length > 10 && (
                                <p className="text-xs text-gray-400">…and {importResult.errors.length - 10} more</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Footer buttons — vary by step */}
        <DialogFooter className="flex gap-3 mt-2">
            {importStep === 1 && (
                <Button variant="outline" className="flex-1 rounded-full" onClick={resetImportModal}>Cancel</Button>
            )}
            {importStep === 2 && (
                <>
                    <Button variant="outline" className="flex-1 rounded-full" onClick={() => { setImportStep(1); setImportPreview(null); }} disabled={importLoading}>← Back</Button>
                    <Button
                        className="flex-1 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white"
                        onClick={handleConfirmImport}
                        disabled={importLoading || (importPreview?.new_count + importPreview?.update_count === 0)}
                        data-testid="confirm-import-btn"
                    >
                        {importLoading
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Importing…</>
                            : `Import ${(importPreview?.new_count || 0) + (importPreview?.update_count || 0)} Customers`
                        }
                    </Button>
                </>
            )}
            {importStep === 3 && (
                <>
                    <Button variant="outline" className="flex-1 rounded-full" onClick={() => { resetImportModal(); setShowImportHistory(true); }}>View History</Button>
                    <Button className="flex-1 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white" onClick={resetImportModal} data-testid="import-done-btn">Done</Button>
                </>
            )}
        </DialogFooter>
    </DialogContent>
</Dialog>
```

---

## 6. Sequence Diagrams

### Export flow
```
User clicks Export → CSV           User clicks Export → XLSX
      ↓                                    ↓
GET /api/customers/export?format=csv   GET /api/customers/export?format=xlsx
      ↓                                    ↓
DB: find all customers for user_id     DB: find all customers for user_id
      ↓                                    ↓
Build csv.writer rows                  Build openpyxl workbook + styling
      ↓                                    ↓
StreamingResponse (text/csv)           StreamingResponse (xlsx MIME)
      ↓                                    ↓
Browser auto-downloads file            Browser auto-downloads file
```

### Import flow
```
Step 1: User drops file
    ↓
POST /api/customers/import-preview   (file bytes → parse only, NO DB writes)
    ↓
_parse_import_file()                 → parse CSV or Excel rows
    ↓
DB: find all existing phones         → set for O(1) dup lookup
    ↓
_validate_and_classify_row() × N     → "new" | "update" | "error"
    ↓
Return ImportPreviewResponse         → frontend shows Step 2

Step 2: User clicks "Import X Customers"
    ↓
POST /api/customers/import           (file bytes → parse AGAIN + write)
    ↓
For each valid row:
  status==new    → db.customers.insert_one()
  status==update → db.customers.update_one($set non-empty fields, merge tags)
    ↓
db.users.update_one($addToSet available_tags)   → update tag catalog
    ↓
db.import_logs.insert_one(ImportLog)             → persist history
    ↓
Return ImportLog result              → frontend shows Step 3
```

---

## 7. Error Codes Reference

| Code | Condition | Message |
|------|-----------|---------|
| 400 | format not csv/xlsx | "format must be 'csv' or 'xlsx'" |
| 400 | file > 10MB | "File too large. Maximum size is 10MB." |
| 400 | file not .csv/.xlsx | "Only .csv and .xlsx files are supported." |
| 400 | rows > 5000 | "File has N rows. Maximum allowed is 5,000." |
| 400 | unparseable file | "Could not parse file: <detail>" |
| 401 | no token | "Not authenticated" (from get_current_user) |

**Per-row errors (not HTTP codes — collected in ImportLog.errors):**
| Condition | reason string |
|-----------|---------------|
| name empty | "Missing name" |
| phone empty | "Missing phone number" |
| phone has letters | "Invalid phone format: '<value>'" |
| phone != 10 digits | "Phone must be 10 digits, got N" |

---

## 8. Edge Case Registry

| # | Edge case | Handling |
|---|-----------|----------|
| E1 | File with BOM (Excel-generated CSV) | `content.decode("utf-8-sig")` strips BOM |
| E2 | Header row is case-variant ("Name", "NAME", "name") | All headers lowercased via `.lower().strip()` |
| E3 | Phone with +91 prefix (e.g. "+919876543210") | Strip `+91`, keep 10-digit |
| E4 | Phone with spaces/dashes ("98765 43210") | `.replace(" ","").replace("-","")` |
| E5 | Duplicate phone appears twice in same file | Second occurrence overwrites first (last-write wins) |
| E6 | Tags column blank for some rows | `tags_list = []` — no tags added, no error |
| E7 | Tags column with new tag not in catalog | Auto-added to `available_tags` via `$addToSet` |
| E8 | Excel file with multiple sheets | `wb.active` — only first sheet used |
| E9 | File > 5000 rows | HTTP 400 on preview call, never reaches import |
| E10 | All rows have errors | Preview shows 0 importable. Import button disabled. |
| E11 | User re-imports same file | All phones already exist → all rows classified as "update" |
| E12 | Wallet balance column in file | `wallet_balance` key ignored during import (not in payload) |
| E13 | Tier column in file | `tier` key ignored during import (computed by loyalty engine) |
| E14 | Empty file (header only, no data rows) | `rows = []` → `new_count=0, update_count=0, error_count=0`. Import btn disabled. |

---

## 9. Verification Matrix (V1–V18)

| # | What to check | How |
|---|---------------|-----|
| V1 | Export CSV button appears in header | Login → Customers page → Export button visible ✅ |
| V2 | Export CSV downloads file with correct name | Click Export → CSV → browser downloads `customers_export_YYYY_MM_DD.csv` ✅ |
| V3 | Export XLSX downloads formatted file | Click Export → Excel → `.xlsx` file with orange header row ✅ |
| V4 | Export includes all 22 columns | Open file → count columns ✅ |
| V5 | Export includes tags as comma-separated string | Customer with 2 tags → cell = "VIP, Regular" ✅ |
| V6 | Import button opens modal | Click Import → modal opens at Step 1 ✅ |
| V7 | Drop zone accepts .csv and .xlsx | Drop each format → no error ✅ |
| V8 | Drop zone rejects .pdf / .json | Drop wrong format → toast error ✅ |
| V9 | Sample template download works | Click "Download Sample CSV" → file downloads ✅ |
| V10 | Step 1 → Step 2 shows preview with counts | Upload valid file → Step 2 shows new/update/error counts ✅ |
| V11 | Preview table shows first 5 rows | Step 2 table has exactly 5 rows ✅ |
| V12 | Error rows highlighted in preview | Row with missing phone → red background + error message ✅ |
| V13 | Import button disabled when 0 valid rows | File with all errors → "Import 0 Customers" button disabled ✅ |
| V14 | Confirm import creates new customers | Import file with 3 new phones → DB has 3 new docs ✅ |
| V15 | Confirm import updates existing customer | Import file with existing phone → name updated in DB ✅ |
| V16 | Tags merged additively on update | Existing customer has "VIP" → import row has "Regular" → customer has "VIP, Regular" ✅ |
| V17 | Import history section appears after import | After import → History section visible with new run ✅ |
| V18 | Step 3 result shows correct counts | Result modal matches actual DB changes ✅ |

---

## 10. Files Summary

| File | Change type | Estimated new lines |
|------|-------------|---------------------|
| `backend/models/schemas.py` | Add 4 new models (ImportRowError, ImportLog, ImportPreviewRow, ImportPreviewResponse) | +35 lines |
| `backend/routers/customers.py` | Add 6 new functions (2 helpers + 4 endpoints + 1 constant) | +230 lines |
| `frontend/pages/CustomersPage.jsx` | Add state, 5 handlers, header buttons, history section, import modal | ~200 lines |
| `backend/requirements.txt` | Add openpyxl entry after `pip install` | +1 line |

**New DB collection**: `import_logs` (auto-created by Motor on first insert)
**New pip package**: `openpyxl`
**Hotspot files touched**: 0
**Existing routes modified**: 0
**DB migration**: NONE

---

```
Planning complete: CR-035
Gate: Implementation Planning ✅
Risk: LOW
All owner decisions: LOCKED (Q1–Q10)
Mockup: Approved
Next gate: IMPLEMENTATION (on owner go-ahead)
Estimated effort: ~8–10 hrs
```

---
*End of CR-035 Implementation Plan — 2026-07-01*
