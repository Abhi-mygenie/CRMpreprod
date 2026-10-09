#!/usr/bin/env python3
"""Registry mirror generator — CR-2026-10-04-006 (amendment, contract v1.2).

One-way: index.yml -> Google Sheet. Nothing is ever read back from the Sheet
without owner approval (§5). change_requests/README.md is never machine-written (O-G3).

    python registry_sync.py bootstrap        # skeleton index.yml, derivable fields only
    python registry_sync.py migrate          # P3: rename fields 18→19, no value change
    python registry_sync.py audit            # read-only drift / divergence report
    python registry_sync.py propose          # surface README prose for owner adjudication
    python registry_sync.py sync --dry-run   # build views, dump CSVs, write nothing remote
    python registry_sync.py sync             # push to Sheets, append CHANGELOG

Status is never guessed or defaulted (O-G4). Fields that cannot be derived are
left blank rather than fabricated (O-G1).

CR-2026-10-04-006 amendment — changes 1-21 (contract v1.2):
  P1: schema + enum  P2: artefact suffix + truncation  P3: migrate
  P4: layout (22 cols, no banners, Summary last)  P5: 87-row status write
  P6: hard gate dry-run  P7-P10: read-merge-write (Band b, deferrable)
"""
import csv
import json
import os
import pathlib
import re
import sys
from datetime import datetime, timezone

import requests
import yaml
from dotenv import load_dotenv

ROOT = pathlib.Path("/app")
ITEMS_DIR = ROOT / "memory/change_requests"
INDEX_PATH = ITEMS_DIR / "index.yml"
README_PATH = ITEMS_DIR / "README.md"
CHANGELOG_PATH = ITEMS_DIR / "CHANGELOG.md"
STATE_PATH = ROOT / "memory/tools/.registry_state.json"
CSV_DIR = ROOT / "memory/tools/.registry_csv"
TOKEN_PATH = "/app/secrets/sheets_token.json"
ENV_PATH = "/app/backend/.env"

TOKEN_URL = "https://oauth2.googleapis.com/token"
SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets"

ID_RE = re.compile(r"^(CR|BUG|INV|PROD-INCIDENT)-(\d{4})-([\dX]{2})-([\dX]{2})-(\d{3})$")
ID_IN_TEXT = re.compile(r"(?:CR|BUG|INV|PROD-INCIDENT)-\d{4}-[\dX]{2}-[\dX]{2}-\d{3}")

TYPES = ["CR", "BUG", "INV", "PROD-INCIDENT"]

# P1 change #10 — 13-value enum → 8 contract values
STATUSES = ["INTAKE", "PLANNING", "IMPLEMENTED", "QA", "SMOKE", "CLOSED", "PARKED", "DUPLICATE"]

# P1 change #6 — severity → priority (values unchanged)
PRIORITIES = ["P0", "P1", "P2", "P3"]

RISKS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

# P1 — GATES deleted (was change routing by next_gate; now STATUS_TO_TAB only)

# P1 — PARTIES extended (change #9 via P1 scope)
PARTIES = ["BACKEND", "POS", "CRM", "SO", "INV", "INFRA", "OWNER", "OPS", "INTERNAL"]

# P1 — TERMINAL updated per contract §2
TERMINAL = ["CLOSED", "PARKED", "DUPLICATE"]

# P1 change #6/#7/#8/#9: severity→priority, wave_track→sprint, drop next_gate,
# add closed + notes; money_path retained (change #9 = mirror to col 22)
FIELDS = [
    "id", "type", "title", "status", "status_note", "priority", "risk",
    "owner_action", "blocked_on", "sprint", "files",
    "artefacts", "registered", "last_updated", "related", "code_markers",
    "money_path", "closed", "notes",
]

# P1 — STATUS_TO_TAB: 1:1 map over the 8 values (GATE_TO_TAB deleted)
STATUS_TO_TAB = {
    "INTAKE": "Intake",
    "PLANNING": "Planning",
    "IMPLEMENTED": "Implemented",
    "QA": "QA",
    "SMOKE": "Smoke",
    **{s: "Closed" for s in TERMINAL},
}

# P4 change #14 — Summary last; Change Log added
GATE_TABS = ["Intake", "Planning", "Implemented", "QA", "Smoke", "Closed"]
TABS = ["All Items", *GATE_TABS, "Blockers", "Change Log", "Summary"]

# P2 change #20 — artefact detection by filename suffix (not exact match)
ARTEFACT_SUFFIXES = [
    ("CR.md",                "CR"),
    ("INTAKE_DOC.md",        "INTAKE"),
    ("IMPACT_ANALYSIS.md",   "IMPACT_ANALYSIS"),
    ("IMPLEMENTATION_PLAN.md", "IMPLEMENTATION_PLAN"),
    ("QA_HANDOVER.md",       "QA_HANDOVER"),
    ("QA_REPORT.md",         "QA_REPORT"),
]

# P4 change #3 — 22 columns in contract v1.2 order, exact header strings
HEADERS = [
    "Project", "ID", "Type", "Title", "Status", "Status note", "Priority",
    "Risk", "Area", "Sprint", "Blocked on", "Owner action", "Assignee",
    "Registered", "Last updated", "Closed", "Related", "Artefacts",
    "ID mentioned in code", "Files", "Notes", "Money path",
]


# ---------------------------------------------------------------- P2 helpers

def one_line(text, limit=120):
    """P2 change #21 — truncate to one line at a word boundary.

    Returns (display_text, full_text_or_None). Truncation is render-only;
    index.yml titles are never modified (V49).
    """
    if not text or len(text) <= limit:
        return text, None
    cut = text.rfind(" ", 0, limit)
    if cut < 0:
        cut = limit
    return text[:cut] + " …", text


def detect_artefacts(folder):
    """P2 change #20 — suffix-based artefact detection, longest suffix wins."""
    found_labels = []
    for fname in sorted(f.name for f in folder.iterdir() if f.is_file()):
        for suffix, label in ARTEFACT_SUFFIXES:
            if fname.endswith(suffix) and label not in found_labels:
                found_labels.append(label)
                break
    return ", ".join(found_labels)


# ---------------------------------------------------------------- derivation

def item_folders():
    """Folders whose name starts with a well-formed item ID."""
    found, unnamed = {}, []
    for path in sorted(p for p in ITEMS_DIR.iterdir() if p.is_dir()):
        parts = path.name.split("-")
        candidate = "-".join(parts[:5]) if parts[0] != "PROD" else "-".join(parts[:6])
        if ID_RE.match(candidate):
            found[candidate] = path
        else:
            unnamed.append(path.name)
    return found, unnamed


def readme_rows():
    """id -> list of cell-lists, for every README table row naming that id."""
    rows = {}
    for line in README_PATH.read_text().splitlines():
        if not line.startswith("|"):
            continue
        ids = ID_IN_TEXT.findall(line)
        if not ids:
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        rows.setdefault(ids[0], []).append(cells)
    return rows


def slug_title(folder):
    parts = folder.name.split("-")
    offset = 6 if folder.name.startswith("PROD-INCIDENT") else 5
    slug = "-".join(parts[offset:]) or folder.name
    return slug.replace("-", " ").strip()


def derive_title(item_id, folder, rows):
    """README title cell where present, else the folder slug."""
    for cells in rows.get(item_id, []):
        if len(cells) < 2:
            continue
        text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", cells[1]).strip()
        text = text.replace("*", "").strip(" —-–:·")
        if text and not ID_IN_TEXT.fullmatch(text) and len(text) > 3:
            return text
    return slug_title(folder)


def derive_registered(item_id):
    m = ID_RE.match(item_id)
    y, mo, d = m.group(2), m.group(3), m.group(4)
    return None if "X" in mo + d else f"{y}-{mo}-{d}"


def source_blob():
    globs = ["backend/**/*.py", "frontend/src/**/*.js", "frontend/src/**/*.jsx",
             "frontend/src/**/*.ts", "frontend/src/**/*.tsx"]
    chunks = []
    for pattern in globs:
        for path in ROOT.glob(pattern):
            if "node_modules" in path.parts:
                continue
            chunks.append(path.read_text(errors="ignore"))
    return "\n".join(chunks)


def blank_record(item_id, folder, blob, rows):
    """P1 — uses new 19-field schema."""
    artefacts = detect_artefacts(folder)
    return {
        "id": item_id,
        "type": item_id.rsplit("-", 4)[0] if item_id.startswith("PROD") else item_id.split("-")[0],
        "title": derive_title(item_id, folder, rows),
        "status": None,
        "status_note": None,
        "priority": None,
        "risk": None,
        "owner_action": None,
        "blocked_on": [],
        "sprint": None,
        "files": None,
        "artefacts": artefacts,
        "registered": derive_registered(item_id),
        "last_updated": None,
        "related": [],
        "code_markers": item_id in blob,
        "money_path": None,
        "closed": None,
        "notes": None,
    }


def bootstrap():
    if INDEX_PATH.exists():
        sys.exit(f"{INDEX_PATH} already exists — bootstrap never overwrites. "
                 "Run migrate to update an existing index to the new schema.")
    folders, unnamed = item_folders()
    blob = source_blob()
    rows = readme_rows()
    records = [blank_record(i, f, blob, rows) for i, f in sorted(folders.items())]
    INDEX_PATH.write_text(
        "# Generated skeleton — CR-2026-10-04-006 bootstrap.\n"
        "# Derivable fields only. Blank fields are NOT guessed (O-G1, O-G4);\n"
        "# they await the owner hand-authoring pass.\n"
        + yaml.safe_dump(records, sort_keys=False, allow_unicode=True, width=100)
    )
    marked = sum(1 for r in records if r["code_markers"])
    print(f"Wrote {INDEX_PATH} — {len(records)} records.")
    print(f"  code_markers true : {marked}")
    print(f"  registered derived: {sum(1 for r in records if r['registered'])}")
    print(f"  folders without a well-formed ID (not indexed): {len(unnamed)} {unnamed}")


# ---------------------------------------------------------------- P3 migration

def migrate():
    """P3 — rename fields in the existing index.yml to the new 19-field schema.

    Renames: severity → priority, wave_track → sprint.
    Drops: next_gate.
    Adds: closed (null), notes (null).
    Preserves all existing non-null values.
    git diff must show renames and new keys only — no value changes.
    """
    if not INDEX_PATH.exists():
        sys.exit(f"{INDEX_PATH} not found. Run bootstrap first.")
    raw = yaml.safe_load(INDEX_PATH.read_text())
    changed = 0
    for rec in raw:
        # Rename severity → priority
        if "severity" in rec and "priority" not in rec:
            rec["priority"] = rec.pop("severity")
            changed += 1
        elif "severity" in rec:
            rec.pop("severity")
        # Rename wave_track → sprint
        if "wave_track" in rec and "sprint" not in rec:
            rec["sprint"] = rec.pop("wave_track")
            changed += 1
        elif "wave_track" in rec:
            rec.pop("wave_track")
        # Drop next_gate
        if "next_gate" in rec:
            rec.pop("next_gate")
        # Add closed, notes
        if "closed" not in rec:
            rec["closed"] = None
        if "notes" not in rec:
            rec["notes"] = None
        # Reorder to match FIELDS
        ordered = {f: rec.get(f) for f in FIELDS}
        rec.clear()
        rec.update(ordered)

    INDEX_PATH.write_text(
        yaml.safe_dump(raw, sort_keys=False, allow_unicode=True, width=100)
    )
    # Rebuild state so next sync reports 0 spurious changes (V38)
    current = {r["id"]: {f: r.get(f) for f in FIELDS if f != "id"} for r in raw}
    STATE_PATH.write_text(json.dumps(current, indent=1, default=str))
    print(f"migrate: {len(raw)} records updated, {changed} renames applied.")
    print(f"State rebuilt at {STATE_PATH}")


# ---------------------------------------------------------------- validation

def load_index():
    if not INDEX_PATH.exists():
        sys.exit(f"{INDEX_PATH} missing — run bootstrap first.")
    records = yaml.safe_load(INDEX_PATH.read_text())
    errors, seen = [], set()
    for rec in records:
        rid = rec.get("id")
        if not rid or not ID_RE.match(rid):
            errors.append(f"malformed id: {rid!r}")
            continue
        if rid in seen:
            errors.append(f"duplicate id: {rid}")
        seen.add(rid)
        for field in FIELDS:
            if field not in rec:
                errors.append(f"{rid}: missing field {field!r}")
        for field, allowed in (
            ("type", TYPES),
            ("status", STATUSES),        # P1: 8-value enum; null is still legal
            ("priority", PRIORITIES),    # P1: renamed from severity
            ("risk", RISKS),
        ):
            value = rec.get(field)
            if value not in (None, "") and value not in allowed:
                errors.append(f"{rid}: {field}={value!r} not in {allowed}")
        for blocker in rec.get("blocked_on") or []:
            if blocker.get("party") not in PARTIES:
                errors.append(
                    f"{rid}: blocked_on.party={blocker.get('party')!r} invalid"
                )
    if errors:
        print("INDEX VALIDATION FAILED:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)
    return records


def readme_ids():
    return set(ID_IN_TEXT.findall(README_PATH.read_text()))


def audit():
    records = load_index()
    folders, unnamed = item_folders()
    indexed = {r["id"] for r in records}

    report = {
        "folders not in index": sorted(set(folders) - indexed),
        "index entries with no folder": sorted(indexed - set(folders)),
        "folders without a well-formed ID": unnamed,
        "in README but not in index": sorted(readme_ids() - indexed),
        "in index but not in README": sorted(indexed - readme_ids()),
        "code markers live but status REGISTERED (F1 tripwire)": sorted(
            r["id"] for r in records
            if r["code_markers"] and r.get("status") == "REGISTERED"
        ),
        "status not yet adjudicated by owner": sorted(
            r["id"] for r in records if not r.get("status")
        ),
        "unroutable to a gate tab": sorted(
            r["id"] for r in records if route(r) is None
        ),
    }
    print(f"AUDIT — {len(records)} indexed, {len(folders)} item folders\n")
    for label, ids in report.items():
        print(f"{label}: {len(ids)}")
        for item in ids[:8]:
            print(f"    {item}")
        if len(ids) > 8:
            print(f"    … and {len(ids) - 8} more")
    return report


def propose():
    """Surface each item's README prose beside its folder artefacts."""
    records = load_index()
    rows = readme_rows()
    out = ["# STATUS ADJUDICATION WORKSHEET — CR-2026-10-04-006",
           "",
           "Agent-extracted prose only. **No status has been assigned.** Fill the",
           "`status` column with one of the 8 enum values and hand back.",
           "",
           f"Enum: `{' · '.join(STATUSES)}`",
           "",
           "| ID | Artefacts on disk | ID in code | README prose (verbatim) | status ← YOU |",
           "|---|---|---|---|---|"]
    for rec in records:
        prose = " ⏎ ".join(
            " / ".join(c for c in cells[1:] if c) for cells in rows.get(rec["id"], [])
        ) or "— absent from README —"
        prose = prose.replace("|", "\\|")[:400]
        out.append(
            f"| {rec['id']} | {rec['artefacts'] or '—'} | "
            f"{'YES' if rec['code_markers'] else 'no'} | {prose} |  |"
        )
    path = ITEMS_DIR / "CR-2026-10-04-006-google-sheet-registry-mirror/STATUS_WORKSHEET.md"
    path.write_text("\n".join(out) + "\n")
    print(f"Wrote {path} — {len(records)} rows, status column intentionally empty.")


# ---------------------------------------------------------------- views (P4)

def route(rec):
    """P1 — STATUS_TO_TAB only (GATE_TO_TAB deleted)."""
    status = rec.get("status")
    return STATUS_TO_TAB.get(status) if status else None


def cell(value):
    if value is None or value == "":
        return ""
    if isinstance(value, bool):
        return "YES" if value else "no"
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            return " · ".join(
                f"{b.get('party')}: {b.get('ref')}"
                + (f" (since {b['since']})" if b.get("since") else "")
                for b in value
            )
        return ", ".join(str(v) for v in value)
    return str(value)


def _blocked_on_cell(blockers):
    """P4 change #12 — single oldest party only in Blocked on column."""
    if not blockers:
        return ""
    sorted_blockers = sorted(
        blockers,
        key=lambda b: str(b.get("since") or "9999-99-99")
    )
    return sorted_blockers[0].get("party", "")


def _status_note_cell(rec):
    """P4 change #11/#12 — badge text + full blocker detail folded into Status note."""
    parts = []
    sn = rec.get("status_note")
    if sn:
        parts.append(str(sn))
    blockers = rec.get("blocked_on") or []
    if blockers:
        detail = " · ".join(
            f"{b.get('party')}: {b.get('ref', '')}"
            + (f" (since {b['since']})" if b.get("since") else "")
            for b in sorted(blockers, key=lambda b: str(b.get("since") or ""))
        )
        parts.append(f"BLOCKED: {detail}")
    return " · ".join(parts)


def _type_cell(rec):
    """P4 change #5 — Type override."""
    t = rec.get("type", "")
    title = rec.get("title", "") or ""
    if title.upper().startswith("BUG"):
        return "BUG"
    if t == "PROD-INCIDENT":
        return "INCIDENT"
    return t


def row_for(rec):
    """P4 change #3 — 22 cells in contract column order.

    Column 9 (Area) = blank for SO.
    Column 13 (Assignee) = blank — agent never writes it on All Items (§5.6).
    """
    title_display, title_full = one_line(cell(rec["title"]))
    # V49: index.yml title never truncated — truncation is render-only
    # If truncated, full title goes into Notes column (col 21)
    notes_cell = cell(rec.get("notes"))
    if title_full:
        notes_cell = f"Full title: {title_full}" + (f" · {notes_cell}" if notes_cell else "")

    return [
        "SO",                                      # 1  Project (P4 change #4)
        cell(rec["id"]),                           # 2  ID
        _type_cell(rec),                           # 3  Type (P4 change #5)
        title_display,                             # 4  Title (P2 change #21)
        cell(rec["status"]),                       # 5  Status
        _status_note_cell(rec),                    # 6  Status note (P4 change #11/#12)
        cell(rec.get("priority")),                 # 7  Priority (P1 change #6)
        cell(rec["risk"]),                         # 8  Risk
        "",                                        # 9  Area (blank for SO)
        cell(rec.get("sprint")),                   # 10 Sprint (P1 change #7)
        _blocked_on_cell(rec.get("blocked_on") or []),  # 11 Blocked on (P4 change #12)
        cell(rec["owner_action"]),                 # 12 Owner action
        "",                                        # 13 Assignee — never written (§5.6)
        cell(rec["registered"]),                   # 14 Registered
        cell(rec["last_updated"]),                 # 15 Last updated
        cell(rec.get("closed")),                   # 16 Closed (P1 change #8)
        cell(rec["related"]),                      # 17 Related
        cell(rec["artefacts"]),                    # 18 Artefacts
        "YES" if rec["code_markers"] else "no",   # 19 ID mentioned in code (renamed)
        cell(rec["files"]),                        # 20 Files
        notes_cell,                                # 21 Notes (P1 change #8)
        cell(rec.get("money_path")),               # 22 Money path (P1 change #9)
    ]


def build_views(records):
    """P4 — no banner rows, Summary last, Change Log tab, 22 columns."""
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    views = {}

    # Gate tabs — header row 1, no banner (P4 change #1)
    for tab in GATE_TABS:
        rows = [row_for(r) for r in records if route(r) == tab]
        views[tab] = [HEADERS, *rows]

    # All Items — header row 1, no banner
    views["All Items"] = [HEADERS, *[row_for(r) for r in records]]

    # Blockers — P4 change #13: same 22 columns filtered on non-blank Blocked on
    blocked_records = [r for r in records if r.get("blocked_on")]
    views["Blockers"] = [HEADERS, *[row_for(r) for r in blocked_records]]

    # Change Log — append-only; initial state is just the header (P4 change #14)
    # Note: this is the Sheet Change Log (V48 — NOT CHANGELOG.md)
    views["Change Log"] = [
        ["Logged at", "ID", "Column", "Old value (registry)",
         "New value (sheet)", "Decision", "Decided at", "Note"]
    ]

    # Summary — P4 change #15, rebuilt per §6
    unrouted = [r for r in records if route(r) is None]
    by_party = {}
    for rec in records:
        for blocker in rec.get("blocked_on") or []:
            by_party.setdefault(blocker.get("party"), []).append((blocker, rec))

    open_statuses = [s for s in STATUSES if s not in TERMINAL]
    open_records = [r for r in records if r.get("status") not in TERMINAL]

    summary = [
        ["Status", "Items"],
        *[[s, len([r for r in records if r.get("status") == s])] for s in STATUSES],
        ["Unrouted (status blank)", len(unrouted)],
        [],
        ["Priority", "Open items"],
        *[[p, len([r for r in open_records if r.get("priority") == p])]
          for p in PRIORITIES],
        [],
        ["Blocked on", "Blockers"],
        *[[party, len(by_party.get(party, []))] for party in PARTIES],
        [],
        # SO-local trust indicators (Addition 3 / §8)
        ["Trust indicators", ""],
        ["Items indexed", len(records)],
        ["Status unrouted (back-catalogue interim)", len(unrouted)],
        ["ID mentioned in code", len([r for r in records if r["code_markers"]])],
        ["index.yml <-> README divergence",
         len(readme_ids() ^ {r["id"] for r in records})],
    ]
    # §6 two separate lines at end
    summary.append([f"Generated: {datetime.now(timezone.utc).isoformat()}"])
    summary.append(["Pending change-log rows: 0"])

    views["Summary"] = summary
    return views


def dump_csv(views):
    CSV_DIR.mkdir(exist_ok=True)
    for tab, rows in views.items():
        safe = tab.replace(" ", "_").replace("/", "_")
        path = CSV_DIR / f"{safe}.csv"
        with open(path, "w", newline="") as fh:
            csv.writer(fh).writerows(rows)
    print(f"CSV dump -> {CSV_DIR}")
    for tab, rows in views.items():
        print(f"  {tab:<14} {max(len(rows) - 1, 0):>3} data rows")


# ---------------------------------------------------------------- push (P5/P6)

def access_token():
    load_dotenv(ENV_PATH)
    if not os.path.exists(TOKEN_PATH):
        sys.exit(f"No OAuth token at {TOKEN_PATH} — run probe_sheets_oauth.py first.")
    with open(TOKEN_PATH) as fh:
        refresh_token = json.load(fh)["refresh_token"]
    resp = requests.post(TOKEN_URL, data={
        "refresh_token": refresh_token,
        "client_id": os.environ["GOOGLE_OAUTH_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        "grant_type": "refresh_token",
    }, timeout=30)
    if resp.status_code != 200:
        sys.exit(f"Token refresh failed [{resp.status_code}]: {resp.text}")
    sheet_id = os.environ["GOOGLE_SHEET_ID"]
    if "/" in sheet_id:
        sys.exit("GOOGLE_SHEET_ID must be the bare ID, not a URL.")
    return resp.json()["access_token"], sheet_id


def api(method, token, path, **kwargs):
    resp = requests.request(method, f"{SHEETS_API}/{path}",
                            headers={"Authorization": f"Bearer {token}"},
                            timeout=60, **kwargs)
    if resp.status_code != 200:
        sys.exit(f"{method} {path} failed [{resp.status_code}]: {resp.text}")
    return resp.json()


def a1(tab):
    return "'" + tab.replace("'", "''") + "'"


def push(views):
    """P4 — frozenRowCount 1, autoResize 22 cols, Change Log never cleared."""
    token, sheet_id = access_token()
    meta = api("GET", token, sheet_id, params={"fields": "sheets.properties"})
    existing = {s["properties"]["title"]: s["properties"]["sheetId"]
                for s in meta["sheets"]}

    missing = [t for t in TABS if t not in existing]
    if missing:
        api("POST", token, f"{sheet_id}:batchUpdate", json={"requests": [
            {"addSheet": {"properties": {"title": t}}} for t in missing]})
        print(f"Created tabs: {missing}")
        meta = api("GET", token, sheet_id, params={"fields": "sheets.properties"})
        existing = {s["properties"]["title"]: s["properties"]["sheetId"]
                    for s in meta["sheets"]}

    # P4: Change Log excluded from batchClear (append-only, V33/V48)
    tabs_to_clear = [t for t in TABS if t != "Change Log"]
    api("POST", token, f"{sheet_id}/values:batchClear",
        json={"ranges": [a1(t) for t in tabs_to_clear]})

    # Write all tabs except Change Log (Change Log uses append, handled separately)
    data = [{"range": f"{a1(tab)}!A1", "values": views[tab]}
            for tab in TABS if tab != "Change Log"]
    for start in range(0, len(data), 100):
        api("POST", token, f"{sheet_id}/values:batchUpdate", json={
            "valueInputOption": "RAW", "data": data[start:start + 100]})
    print(f"Pushed {len(TABS) - 1} tabs (Change Log handled separately).")

    # Fix 2: Write Change Log header if the tab is empty (newly created or blank)
    cl_check = api("GET", token, f"{sheet_id}/values/{a1('Change Log')}!A1", )
    if not cl_check.get("values"):
        api("POST", token, f"{sheet_id}/values:batchUpdate", json={
            "valueInputOption": "RAW",
            "data": [{"range": f"{a1('Change Log')}!A1",
                      "values": views["Change Log"]}]})
        print("Change Log header row written.")

    requests_body = []
    for tab in TABS:
        if tab not in existing:
            continue
        sid = existing[tab]
        # P4 change #1: frozenRowCount 1 everywhere (was 2)
        requests_body.append({"updateSheetProperties": {
            "properties": {"sheetId": sid,
                           "gridProperties": {"frozenRowCount": 1}},
            "fields": "gridProperties.frozenRowCount"}})
        requests_body.append({"repeatCell": {
            "range": {"sheetId": sid, "startRowIndex": 0, "endRowIndex": 1},
            "cell": {"userEnteredFormat": {
                "textFormat": {"bold": True},
                "backgroundColor": {"red": 0.12, "green": 0.14, "blue": 0.18}}},
            "fields": "userEnteredFormat(textFormat,backgroundColor)"}})
    for tab in TABS:
        if tab not in existing:
            continue
        # P4: autoResize 22 columns (was 18)
        requests_body.append({"autoResizeDimensions": {"dimensions": {
            "sheetId": existing[tab], "dimension": "COLUMNS",
            "startIndex": 0, "endIndex": 22}}})
    stale = [t for t in existing if t not in TABS]
    for tab in stale:
        requests_body.append({"deleteSheet": {"sheetId": existing[tab]}})

    # Fix 1: Enforce contract §2 tab order — set index 0..9 for all 10 tabs
    for idx, tab in enumerate(TABS):
        if tab in existing:
            requests_body.append({"updateSheetProperties": {
                "properties": {"sheetId": existing[tab], "index": idx},
                "fields": "index"}})

    api("POST", token, f"{sheet_id}:batchUpdate", json={"requests": requests_body})
    if stale:
        print(f"Removed non-generated tabs: {stale}")
    print(f"Sheet: https://docs.google.com/spreadsheets/d/{sheet_id}/edit")


# ------------------------------------------------------------ changelog (P6)
# NOTE: This function writes to CHANGELOG.md (the generator's field-diff log).
# It is NOT the contract's Change Log tab. See V48 — these must never be merged.
# The sheet Change Log tab is managed by sheet_change_log() (Band b, P7-P10).

def changelog(records):
    if STATE_PATH.exists():
        with open(STATE_PATH) as fh:
            previous = json.load(fh)
    else:
        previous = {}
    current = {r["id"]: {f: r.get(f) for f in FIELDS if f != "id"} for r in records}
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = []
    for item_id, fields in current.items():
        if item_id not in previous:
            lines.append(f"- `{item_id}` · **added to index** · generator · {stamp}")
            continue
        for field, value in fields.items():
            was = previous[item_id].get(field)
            if was != value:
                lines.append(f"- `{item_id}` · `{field}` · {was!r} → {value!r} "
                             f"· generator · {stamp}")
    for item_id in previous:
        if item_id not in current:
            lines.append(f"- `{item_id}` · **removed from index** · generator · {stamp}")

    if not CHANGELOG_PATH.exists():
        CHANGELOG_PATH.write_text(
            "# REGISTRY CHANGELOG — generated by CR-2026-10-04-006\n\n"
            "Append-only. One entry per observed field change, newest section last.\n"
            "`id · field · from → to · authority · date`\n"
        )
    body = "\n".join(lines) if lines else "- No changes since the last generation."
    with open(CHANGELOG_PATH, "a") as fh:
        fh.write(f"\n## {stamp}\n\n{body}\n")
    STATE_PATH.write_text(json.dumps(current, indent=1, default=str))
    print(f"CHANGELOG: {len(lines)} entr{'y' if len(lines) == 1 else 'ies'} appended.")


def sync(dry_run):
    records = load_index()
    views = build_views(records)
    dump_csv(views)
    total = sum(len([r for r in records if route(r) == t]) for t in GATE_TABS)
    unrouted = len([r for r in records if route(r) is None])
    print(f"\nRouting: {total} routed + {unrouted} unrouted = {len(records)} "
          f"(must equal {len(records)})")
    if dry_run:
        print("\n--dry-run: nothing written to Sheets, no CHANGELOG entry, "
              "no state snapshot.")
        return
    push(views)
    changelog(records)


if __name__ == "__main__":
    load_dotenv(ENV_PATH)
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "bootstrap":
        bootstrap()
    elif command == "migrate":
        migrate()
    elif command == "audit":
        audit()
    elif command == "propose":
        propose()
    elif command == "sync":
        sync("--dry-run" in sys.argv)
    else:
        sys.exit(__doc__)
