# Registry → Google Sheet contract (shared, all projects)

Version 1 · 2026-10-05 · Owner: Abhishek Jain
Applies to: POS, CRM, Scan & Order, Central Inventory, Infra. Every project sheet must match this
exactly so the Tech Dashboard can read all five the same way.

> **Transcription note.** Received verbatim from the owner on 2026-10-05 and stored here as the
> canonical copy for the Scan & Order pod — this file did not previously exist on this pod.
> HTML entities in the original paste (`&amp;`, `&lt;`, `&gt;`) have been normalised to `&`, `<`, `>`.
> No other edits. If this copy and the owner's master ever diverge, the master wins.

## 1. Purpose

Each project keeps its own machine registry (POS: `registry.json`; Scan & Order: `index.yml`; others
TBD). The Google Sheet is a human-facing mirror of that registry and the source the Tech Dashboard
reads. The sheet is **two-way for Status only**, and sheet → registry never happens without owner
approval (see §5).

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
- No "Open Only" tab.

## 3. Columns (All Items and stage tabs), in this order

| # | Column | Required | Values | Who writes |
|---|---|---|---|---|
| 1 | Project | yes | POS / CRM / SO / INV / INFRA | agent |
| 2 | ID | yes | unique within project (see §7) | agent |
| 3 | Type | yes | BUG / CR / INV / INCIDENT / GAP | agent |
| 4 | Title | yes | one line | agent |
| 5 | Status | yes | INTAKE / PLANNING / IMPLEMENTED / QA / SMOKE / CLOSED / PARKED / DUPLICATE | agent; humans may edit (§5) |
| 6 | Status note | no | free text: gate detail, dates, verdicts | agent |
| 7 | Priority | yes | P0 / P1 / P2 / P3 | agent |
| 8 | Risk | no | LOW / MEDIUM / HIGH / CRITICAL | agent |
| 9 | Area | no (POS only) | POS area list, blank for other projects | agent |
| 10 | Sprint | no | sprint / wave key | agent |
| 11 | Blocked on | no | blank / BACKEND / POS / CRM / SO / INV / INFRA / OWNER / OPS / INTERNAL | agent |
| 12 | Owner action | no | what the owner must do next, one line | agent |
| 13 | Assignee | no | person | **owner / dashboard only. Agent never writes or clears this column** |
| 14 | Registered | yes | YYYY-MM-DD | agent; owner fills if missing |
| 15 | Last updated | yes | YYYY-MM-DD | agent |
| 16 | Closed | yes when Status is CLOSED/PARKED/DUPLICATE | YYYY-MM-DD | agent; owner fills if missing |
| 17 | Related | no | comma-separated IDs | agent |
| 18 | Artefacts | no | which docs exist: INTAKE, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN, QA_HANDOVER, QA_REPORT | agent |
| 19 | Code markers | no | YES / no | agent |
| 20 | Files | no | files touched | agent |
| 21 | Notes | no | anything else | agent |

Enum values are upper case, exact. Anything that does not fit an enum goes into Status note or
Notes, never into the enum column.

## 4. Mapping rules

- **Priority is the only urgency scale.** A registry `severity` field maps into Priority. If both
  exist and differ, the higher urgency wins and the other value is kept in Status note.
- **Status is one of eight values.** Gate labels map as: Gate 1 → INTAKE, Gate 3 → PLANNING,
  Gate 5a → IMPLEMENTED, Gate 5b → QA, Gate 6 / "awaiting owner smoke" → SMOKE, owner verified /
  subsumed / resolved → CLOSED. Everything the registry writes into a prose status string goes into
  Status note.
- **BLOCKED is not a Status.** A blocked item keeps its real stage and gets a `Blocked on` party.
  Items with `Blocked on` set appear on the Blockers tab.
- **Type is derived from the item, not the ID prefix.** A CR whose title starts "BUG" is a BUG.
- **Dates**: `Registered` = date the item entered the registry; `Last updated` = date of the last
  registry change; `Closed` = date Status became CLOSED/PARKED/DUPLICATE.

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
5. In Phase 1 only **Status** and the three **date** columns are accepted from the sheet. Edits to
   any other agent-owned column are logged as REJECTED with reason "column not editable in Phase 1".
6. `Assignee` is excluded from the diff entirely: the agent neither reads nor writes it.

Change Log columns: `Logged at · ID · Column · Old value (registry) · New value (sheet) · Edited by
(if known) · Decision (PENDING / APPLIED / REJECTED) · Decided at · Note`.

## 6. Summary tab

A plain table, header row 1, three blocks stacked with one blank row between:
- Status × count (all eight values, zero included)
- Priority × count for open items (not CLOSED/PARKED/DUPLICATE)
- Blocked on × count

Plus one line: `Generated <ISO timestamp>` and `Pending change-log rows: N`.

## 7. IDs

From the next release every project uses `TYPE-YYYY-MM-DD-NNN` (e.g. `CR-2026-09-12-004`). Until
then each project keeps its current scheme. The dashboard requires only that IDs are unique within a
project; the Project column keeps them unique across projects.

## 8. Dashboard contract

The Tech Dashboard reads All Items from each of the five sheets, concatenates on the Project column,
and derives everything else. It writes only the Assignee column. It never writes any other cell.
