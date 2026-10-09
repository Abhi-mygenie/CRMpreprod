# Registry → Google Sheet contract (shared, all projects)

Version 1.2 · 2026-10-06 · Owner: Abhishek Jain
Applies to: POS, CRM, Scan & Order, Central Inventory, Infra. Every project sheet must match this
exactly so the Tech Dashboard can read all five the same way.

**v1.2 changes:** **D-A8 resolved** — §1 and §5.5 are now consistent: the Phase 1 accepted set is
**`Status` + `Registered` + `Closed` (three columns)**. `Last updated` remains agent-computed-only
and is never accepted from the sheet.

**v1.1 changes:** P1 (`APPROVED` in Decision enum), P2 (`Money path` column 22), P3 (`Edited by`
removed from Change Log), P4 (`Assignee` scoped to `All Items`), P5 (`PARKED` definition + `Sprint`
clause), Summary = two separate lines, `Last updated` excluded from the two-way accepted set, empty
stage tabs are valid, back-catalogue interim defined.

> **Local copy notes.** v1 is archived alongside as `registry-sheet-contract-v1.0-archive.md` so the
> diff stays auditable. Validation of v1.1 against the Scan & Order acceptance checklist is recorded
> in `registry-sheet-contract-v1.1-proposal.md`.
>
> **All three SO-raised defects are now closed as of v1.2 (2026-10-06):**
>
> | Defect raised by SO | Status | Resolved by |
> |---|---|---|
> | **A** — §5.3 does not say how the owner writes `APPROVED` | **RESOLVED (v1.1)** | P1. §5's Decision enum defines `APPROVED` = *owner has authorised; agent has not yet applied*. The **mechanism** (chat approval vs the owner typing `APPROVED` into the cell) is each project's own call — SO's choice is tracked as **D-A7** |
> | **B** — §1 contradicted §5.5 on the two-way surface | **RESOLVED (v1.2)** | **D-A8.** §1 now reads *"two-way for Status and the two date columns Registered and Closed"*, matching §5.5's three-column set. **Note: resolved at three columns, not the one SO recommended** — see `IMPACT_ANALYSIS_AMENDMENT.md` §20 |
> | **C** — Change Log has no who-writes spec | **RESOLVED by implication (v1.1)** | P1 + P3. The four Decision definitions make ownership derivable (agent writes PENDING/APPLIED/REJECTED; `APPROVED` is the owner's), and `Edited by` is removed, so no column remains to specify. Fully closed if D-A7 adopts the `APPROVED` cell |
>
> **Change Log is 8 columns, not 9** — P3 removed `Edited by`. No effect on the 22-column `All Items`
> schema or the dashboard's read, but SO's read range is `Change Log!A2:H` and `All Items!A2:V`.

## 1. Purpose

Each project keeps its own machine registry (POS: `registry.json`; Scan & Order: `index.yml`; others
TBD). The Google Sheet is a human-facing mirror of that registry and the source the Tech Dashboard
reads. The sheet is two-way for **Status and the two date columns `Registered` and `Closed`**, and
sheet → registry never happens without owner approval (see §5).

## 2. Workbook layout

Tabs, in this order, with these exact names:

| Tab | Content |
|---|---|
| All Items | every item, one row each |
| Intake | items with Status = INTAKE |
| Planning | Status = PLANNING |
| Implemented | Status = IMPLEMENTED |
| QA | Status = QA |
| Smoke | Status = SMOKE (waiting on owner smoke test) |
| Closed | Status = CLOSED, PARKED, DUPLICATE |
| Blockers | items with a non-blank `Blocked on`, regardless of Status |
| Change Log | append-only, see §5 |
| Summary | counts (see §6) |

Rules:
- Header is **row 1** on every tab. No banner line above it.
- Stage tabs carry the same columns as All Items, filtered. They are derived; All Items is the record.
- **Empty stage tabs are valid and expected.** A project may legitimately have zero items at a given
  stage (e.g. QA empty because everything that passed QA moved to SMOKE). The dashboard and any
  reader must not treat an empty tab as missing data or an error.
- No "Open Only" tab.

## 3. Columns (All Items and stage tabs), in this order

| # | Column | Required | Values | Who writes |
|---|---|---|---|---|
| 1 | Project | yes | POS / CRM / SO / INV / INFRA | agent |
| 2 | ID | yes | unique within project (see §7) | agent |
| 3 | Type | yes | BUG / CR / INV / INCIDENT / GAP | agent |
| 4 | Title | yes | one line | agent |
| 5 | Status | yes | INTAKE / PLANNING / IMPLEMENTED / QA / SMOKE / CLOSED / PARKED / DUPLICATE (see §4 for PARKED definition) | agent; humans may edit (§5) |
| 6 | Status note | no | free text: gate detail, dates, verdicts | agent |
| 7 | Priority | yes | P0 / P1 / P2 / P3 | agent |
| 8 | Risk | no | LOW / MEDIUM / HIGH / CRITICAL | agent |
| 9 | Area | no (POS only) | POS area list, blank for other projects | agent |
| 10 | Sprint | no | sprint / wave key | agent |
| 11 | Blocked on | no | blank / BACKEND / POS / CRM / SO / INV / INFRA / OWNER / OPS / INTERNAL | agent |
| 12 | Owner action | no | what the owner must do next, one line | agent |
| 13 | Assignee | no | person | owner / dashboard only. **Agent never writes or clears this column on `All Items`. On stage tabs, Assignee is always blank** — the column exists for layout consistency only |
| 14 | Registered | yes | YYYY-MM-DD | agent; owner fills if missing (§5) |
| 15 | Last updated | yes | YYYY-MM-DD | agent (**agent-computed-only; never accepted from sheet** — see §5) |
| 16 | Closed | yes when Status is CLOSED/PARKED/DUPLICATE | YYYY-MM-DD | agent; owner fills if missing (§5) |
| 17 | Related | no | comma-separated IDs | agent |
| 18 | Artefacts | no | which docs exist: INTAKE, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN, QA_HANDOVER, QA_REPORT | agent |
| 19 | Code markers | no | YES / no | agent |
| 20 | Files | no | files touched | agent |
| 21 | Notes | no | anything else | agent |
| **22** | **Money path** | no | YES / no | agent |

Enum values are upper case, exact. Anything that does not fit an enum goes into Status note or Notes,
never into the enum column.

## 4. Mapping rules

- **Priority is the only urgency scale.** A registry `severity` field maps into Priority. If both
  exist and differ, the higher urgency wins and the other value is kept in Status note.
- **Status is one of eight values.** Gate labels map as: Gate 1 → INTAKE, Gate 3 → PLANNING,
  Gate 5a → IMPLEMENTED, Gate 5b → QA, Gate 6 / "awaiting owner smoke" → SMOKE, owner verified /
  subsumed / resolved → CLOSED. Everything the registry writes into a prose status string goes into
  Status note.
- **BLOCKED is not a Status.** A blocked item keeps its real stage and gets a `Blocked on` party.
  Items with `Blocked on` set appear on the Blockers tab.
- **`PARKED` means a deliberate decision to stop work with a defined re-open condition.** A blocked
  item is never PARKED — it keeps its real stage with `Blocked on` set. **Work scheduled for a later
  wave is expressed via `Sprint`, not PARKED.**
- **Type is derived from the item, not the ID prefix.** A CR whose title starts "BUG" is a BUG.
- **Dates**: `Registered` = date the item entered the registry; `Last updated` = date of the last
  registry change; `Closed` = date Status became CLOSED/PARKED/DUPLICATE.
- **Back-catalogue adoption interim.** When a project adopts this contract against an existing
  registry, items whose Status has not yet been adjudicated are written with a blank Status cell and
  counted as "Unrouted" in the Summary tab. This is a valid transitional state, not a data error. The
  agent should surface the unrouted count to the owner until it reaches zero.

## 5. Two-way rule and the Change Log

1. Registry → sheet: the agent rewrites All Items and the stage tabs from the registry **every time
   the registry changes**, in the same step. This is a named role in the agent's operating prompt
   (REGISTRAR).
2. Sheet → registry: the agent **never writes sheet edits into the registry directly**. On each
   REGISTRAR run it diffs the sheet against the registry and appends one row per human edit to the
   Change Log tab, then presents the log to the owner.
3. Only the owner approves a Change Log entry. On approval the agent applies it to the registry and
   marks the row APPLIED. Rejected rows are marked REJECTED and the sheet cell is reverted on the
   next push.
4. Conflict rule: the registry wins unless the owner explicitly overrides.
5. In Phase 1, **three columns are accepted from the sheet: `Status`, `Registered`, and `Closed`.**
   **`Last updated` is agent-computed-only and is never accepted from the sheet** (accepting
   an edit to it would immediately generate another edit on the next push — a self-feeding diff).
   Edits to any other agent-owned column are logged as REJECTED with reason "column not editable in
   Phase 1".
6. `Assignee` is excluded from the diff entirely: the agent **neither reads nor writes it on
   `All Items`, and always writes it blank on stage tabs**.

Change Log columns: `Logged at · ID · Column · Old value (registry) · New value (sheet) ·
Decision (PENDING / APPROVED / APPLIED / REJECTED) · Decided at · Note`

- **PENDING** — logged, owner has not yet ruled.
- **APPROVED** — owner has authorised the change; agent has not yet applied it.
- **APPLIED** — owner approved and agent has written the change to the registry.
- **REJECTED** — owner rejected; agent has reverted the sheet cell to the registry value.

## 6. Summary tab

A plain table, header row 1, three blocks stacked with one blank row between:
- Status × count (all eight values, zero included; blank/unrouted items counted separately as
  **Unrouted**)
- Priority × count for open items (not CLOSED/PARKED/DUPLICATE)
- Blocked on × count

Then **two separate lines**:
- `Generated: <ISO timestamp>`
- `Pending change-log rows: N`

## 7. IDs

From the next release every project uses `TYPE-YYYY-MM-DD-NNN` (e.g. `CR-2026-09-12-004`). Until
then each project keeps its current scheme. The dashboard requires only that IDs are unique within a
project; the Project column keeps them unique across projects.

## 8. Dashboard contract

The Tech Dashboard reads All Items from each of the five sheets, concatenates on the Project column,
and derives everything else. It writes only the **Assignee column on `All Items`**. It never writes
any other cell.
