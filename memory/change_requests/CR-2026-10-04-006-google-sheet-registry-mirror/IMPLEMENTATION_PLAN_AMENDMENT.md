# IMPLEMENTATION PLAN — AMENDMENT · CR-2026-10-04-006 onto registry-sheet-contract v1.2

> **Role:** 2 — PLANNING, step 9. **Stage: Implementation Plan.**
> Authorised by the owner, 2026-10-06: *"boot gate for implementation planning and go ahead."*
>
> ## ✅ GATE 2 PASSED — plan accepted by the owner line-by-line, 2026-10-06
>
> Owner: *"any blockers is fine by line plan ready."* The eight adopted decisions in §0 are
> **ratified**, and the open items in §8 — **D-A2 (OAuth publishing status, 7th ask)**, column M
> protected by omission, and OQ-1 worth sending to the dashboard agent — are **accepted as known
> risks**, not treated as blockers.
>
> **The §0 decisions are now frozen.** They were reversible until the plan was accepted; the
> verification set is built on them.
>
> **Role 3 remains SHUT. No code has been written.** Execution requires an explicit
> `Role 3 approved for CR-2026-10-04-006`.
>
> **Reads:** `IMPACT_ANALYSIS_AMENDMENT.md` (rev 1–3) · `AMENDMENT_DESIGN_DRAFT.md` (superseded, §4
> cycle retained) · `control/registry-sheet-contract.md` **v1.2** · `STATUS_ADJUDICATION.md` ·
> `registry_sync.py` (599 lines, read in full) · `index.yml` (87 records).

---

## 0. Decisions this plan adopts

All were recommendations in the impact analysis. The owner said *"which suggestion"* and *"go
ahead"*, so the plan is written on the recommended answer in each case. **Each is reversible by one
line of instruction before Role 3 starts** — but not after, because the verification set is built on
them.

| Ref | Decision | Adopted answer |
|---|---|---|
| **D-A9** | Contract v1.2 overrides the earlier in-chat *"Status only"* ruling | **Follow the contract — 3 accepted columns** (`Status`, `Registered`, `Closed`) |
| **D-A7** | Approval mechanism | **`APPROVED` cell is primary**, chat approval retained as a fallback |
| **OQ-1** | Malformed date typed into `Registered`/`Closed` | **REJECT**, reason *"not a YYYY-MM-DD date"* |
| **OQ-2** | `Closed` populated on a non-closed item | **Accept + warn in `Note`**; Summary counts key off `Status` only |
| **OQ-3** | A closure edits two cells | **Both `PENDING` rows apply on one approval**, keyed on `ID` |
| **D-A3** | Sequencing | **Single pass: enum → layout → status write.** Advisory under v1.2, adopted anyway |
| **D-A4** | `#19` ROLE 13 prompt edit | **Separable** — P12, after everything else, under §7 approval |
| **D-A5** | Owner smoke on the pre-amendment build | **Skipped** — that code is being replaced. Smoke once, after P11 |

## 1. The 21 changes, mapped to phases

Numbering reconstructed from the design draft's bands (*"layout and schema (changes 1–15)"*,
*"read-merge-write (16–18)"*, *"ROLE 13 prompt edit (19)"*) plus `#20`/`#21` from the backfill. The
draft never enumerated 1–19 individually; this table is the authoritative list from here on.

| # | Change | Phase |
|---|---|---|
| 1 | Header on row 1; remove the banner line from every tab | P4 |
| 2 | Route by `Status` only; retire `next_gate` | P4 |
| 3 | 22 columns in contract order, exact header strings | P4 |
| 4 | `Project` column, constant `SO` | P4 |
| 5 | `Type` override — title starting "BUG" → `BUG`; `PROD-INCIDENT` → `INCIDENT` | P4 |
| 6 | `severity` → `priority` rename | P1 |
| 7 | `wave_track` → `sprint` rename | P1 |
| 8 | New fields `closed`, `notes` | P1 |
| 9 | `money_path` promoted to mirrored column 22 | P1 |
| 10 | **`STATUSES` 13 → the contract's 8 values** | P1 |
| 11 | Retire `badge()`; fold badge text into `Status note` | P4 |
| 12 | `Blocked on` = single enum value, oldest blocker by `since`; full detail into `Status note` | P4 |
| 13 | `Blockers` tab → same 22 columns, filtered on non-blank `Blocked on` | P4 |
| 14 | 10 tabs, `Summary` **last**, `Change Log` added | P4 |
| 15 | `Summary` rebuilt per §6 — 3 blocks, then two separate lines | P4 |
| 16 | **Phase A — read** `All Items!A2:V` + `Change Log!A2:H`; column M never read | P7 |
| 17 | **Phase B — diff** and append `PENDING`/`REJECTED` rows | P8 |
| 18 | **Phase C/D — merge-write + `apply`** | P9, P10 |
| 19 | ROLE 13 — REGISTRAR role in the operating prompt | P12 |
| 20 | Artefact detection by filename **suffix**, not exact match | P2 |
| 21 | Title truncation to one line, full text preserved | P2 |

## 2. 🔴 New finding — a naming collision that must not reach the sheet

`registry_sync.py` already has a function called `changelog()` (line 536) writing to
`memory/change_requests/CHANGELOG.md`. The contract's **`Change Log` tab** is a completely different
thing.

| | `CHANGELOG.md` (exists) | `Change Log` tab (new) |
|---|---|---|
| Records | field diffs the **generator** observed between runs | **human edits** detected in the sheet |
| Direction | registry → file | sheet → registry proposal |
| Lifecycle | append-only prose | `PENDING / APPROVED / APPLIED / REJECTED` |
| Authority | `generator` | owner |

**They must never be merged or cross-written.** The plan names the new code `sheet_change_log()` and
leaves `changelog()` untouched. **V48** asserts both exist independently after a run.

## 3. Phase plan

### P0 — Pre-flight (no writes)

1. `cp index.yml index.yml.pre-amendment` · `cp .registry_state.json .registry_state.json.pre-amendment` · `cp -r .registry_csv .registry_csv.pre-amendment`
2. Snapshot the live sheet to `.registry_csv.sheet-pre-amendment/` by reading all 9 tabs — **the only rollback path for the sheet**, which has no version history we control.
3. `python registry_sync.py audit` → must read **87 indexed / 87 folders / 0 orphans / 0 duplicates**.
4. `md5sum README.md` → record. O-G3 requires it byte-identical at the end.
5. Confirm `GOOGLE_SHEET_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` resolve and the refresh token still exchanges. **If the token is dead, stop and escalate D-A2** — do not re-auth silently mid-amendment.

**Exit:** all five green. **Rollback:** nothing to roll back.

### P1 — Schema and enum (changes 6, 7, 8, 9, 10)

| Target | Edit |
|---|---|
| `STATUSES` (`:45-49`) | 13 values → **8**: `INTAKE · PLANNING · IMPLEMENTED · QA · SMOKE · CLOSED · PARKED · DUPLICATE` |
| `SEVERITIES` (`:50`) | keep the values, rename the concept to `PRIORITIES` |
| `TERMINAL` (`:54`) | → `["CLOSED", "PARKED", "DUPLICATE"]` per contract §2 |
| `FIELDS` (`:56-61`) | 18 → **22**: `severity`→`priority`, `wave_track`→`sprint`, drop `next_gate`, add `closed`, `notes`; `money_path` retained and now mirrored |
| `PARTIES` (`:53`) | extend to the contract's set: `BACKEND · POS · CRM · SO · INV · INFRA · OWNER · OPS · INTERNAL` |
| `GATES`, `GATE_TO_TAB` (`:52`, `:64-71`) | **deleted** |
| `STATUS_TO_TAB` (`:72-76`) | rewritten as a 1:1 map over the 8 values |
| `load_index()` validator (`:206-238`) | validate against the new enums; **`status: null` must stay legal** — contract §4 back-catalogue interim |

**Verify:** V20 (invalid enum → exit 1) · V21 (missing env → fail fast) · `audit` still clean.
**Rollback:** `git checkout registry_sync.py`.

### P2 — Tooling defects (changes 20, 21)

- **#20** — `ARTEFACT_FILES` (`:80-87`) becomes suffix matching, so `IMPACT_ANALYSIS_AMENDMENT.md` and `INVESTIGATION_REPORT_contract_alignment.md` are detected. Longest-suffix wins; one artefact token per match, de-duplicated, contract order.
- **#21** — new `one_line(text, limit)`: cut on a word boundary at **≤120 chars**, append ` …`, and **append the full original to `Notes`** prefixed `Full title: `. Applies at render time only — **`index.yml` titles are never truncated on disk.**

**Verify:** V42 (the two backfilled folders gain artefacts) · V43 (0 of 87 titles over the limit; full text recoverable).
**Rollback:** as P1.

### P3 — Re-bootstrap and state rebuild

1. `python registry_sync.py bootstrap` into the new 22-field schema. **Renames carry no data** — `priority`/`sprint` were blank on all 87 — so this is a regeneration, not a migration.
2. Rebuild `.registry_state.json` **in the same step** so the next run does not log 87 spurious "added to index" lines.
3. `git diff index.yml` → expect field renames and 4 new keys per record, **and no value changes**. Any value change is a bug: stop.

**Verify:** V1 · V38 (first post-migration run logs 0 changes) · V2 (`README.md` md5 unchanged).
**Rollback:** restore `index.yml.pre-amendment` and `.registry_state.json.pre-amendment`.

### P4 — Layout (changes 1, 2, 3, 4, 5, 11, 12, 13, 14, 15)

| Target | Edit |
|---|---|
| `HEADERS` (`:342-345`) | the 22 contract column names, exact strings, contract order |
| `row_for()` (`:348-356`) | 22 cells; `Project`=`SO`; `Area` blank; **`Assignee` blank**; `Type` override (#5); `Blocked on` = oldest party only; `Status note` = `status_note · gate detail · BLOCKED: …` |
| `badge()` (`:333-339`) | **deleted**; its text folds into `Status note` |
| `route()` (`:308-314`) | `STATUS_TO_TAB` only — the `GATE_TO_TAB` fallback is removed |
| `TABS` (`:78`) | `["All Items", "Intake", "Planning", "Implemented", "QA", "Smoke", "Closed", "Blockers", "Change Log", "Summary"]` |
| `build_views()` (`:359-434`) | banner rows removed from all tabs; `Blockers` rebuilt as a 22-column filter; `Summary` rebuilt per §6 with the `Unrouted` line and the SO-local `Trust indicators` block (both contract-sanctioned by Addition 3 / §8) |
| `push()` (`:483-531`) | `frozenRowCount` 2 → **1** everywhere; `autoResizeDimensions` `endIndex` 18 → **22** |

**Verify:** V22 · V23 · V24 · V35 · V37 · V16 · V40 (routed + unrouted = 87, unrouted surfaced).
**Rollback:** as P1.

### P5 — Status write (the 87-row pass)

Write the adjudicated `Status` for all 87 records from `STATUS_ADJUDICATION.md` — **only now legal,
because P1 shipped the 8-value enum.** Statuses live in each row's `status_note` prefix
(`Adjudicated contract status: …`) for the 7 items filed on 2026-10-06, and in
`STATUS_ADJUDICATION.md` for the other 80.

- `closed` dates populated where known; **left blank where unsourced** — 15 `Closed` and 3 `Registered` stay blank for the owner to fill **via the sheet** under v1.2. No date is invented.
- P5's ruling is already satisfied: `CR-2026-09-12-015` → `PLANNING` + `Sprint = Wave 2`; only `CR-2026-09-15-003` is `PARKED`.

**Verify:** V34 (Status counts + Unrouted = 87) · V40 · `audit` clean.
**Rollback:** restore `index.yml` from P3's artefact.

### P6 — Local verification, **no sheet writes**

`python registry_sync.py sync --dry-run`, then inspect `.registry_csv/`:
10 files · header on row 1 · 22 columns · `Change Log.csv` present and empty · `Summary.csv` ending
in two separate lines (`Generated: <ISO>`, then `Pending change-log rows: 0`).

**Verify:** V11 (dry-run writes nothing) · V3/V7 · V23 · V39 (`Money path` in column 22, 1–21 unmoved).
**Exit gate:** **nothing is pushed until every P6 check passes.** This is the last point where a
mistake is free.

### P7 — Read path (change 16)

New `read_sheet(token, sheet_id)`:
- `GET` `All Items!A2:V` → dict keyed on **column B (`ID`)**, never on row index
- `GET` `Change Log!A2:H` → existing rows, `(ID, Column)` → `Decision`
- **column M is sliced out of every returned row before the data leaves this function** — containment at the boundary, not at each call site

**Verify:** V44 (ranges are `A2:V` / `A2:H`; M in no range, either direction).

### P8 — Diff engine (change 17)

New `diff_sheet(records, sheet_rows, log_rows)` → list of proposed `Change Log` rows. Rules in order:

| Order | Condition | Outcome |
|---|---|---|
| 1 | Sheet `ID` not in the index | `REJECTED` — *"unknown ID — row hand-added"* |
| 2 | Edit detected on a **stage tab** | `REJECTED` — *"edit on a derived tab"* |
| 3 | Column outside `{Status, Registered, Closed}` | `REJECTED` — *"column not editable in Phase 1"* |
| 4 | `Status` not in the 8 values | `REJECTED` — *"not a contract Status value"* |
| 5 | `Registered`/`Closed` not `YYYY-MM-DD` (**OQ-1**) | `REJECTED` — *"not a YYYY-MM-DD date"* |
| 6 | `Closed` set, `Status` not terminal (**OQ-2**) | `PENDING` + `Note` warning |
| 7 | A `PENDING`/`APPROVED` row already exists for `(ID, Column)` | no duplicate row |
| 8 | Otherwise | `PENDING` |

Stage tabs are read **only** to detect rule 2 — never to source a value.
**OQ-3:** rows are grouped by `ID`, so a `Status`+`Closed` pair approves and applies together.

**Verify:** V27 · V28 · V29 · V30 · V31 · V46 · V47.

### P9 — Merge-write (change 18, Phase C)

Rewrite `push()`:
- **`All Items` is removed from `batchClear`** and written as **two ranges — `A:L` and `N:V`** — so column M is never in a write request
- **`Change Log` is excluded from every clear**; new rows **appended** below the last
- stage tabs and `Summary` keep `batchClear` (they are derived)
- **overlay:** where a `PENDING` row exists for `(ID, Column)`, the **sheet's** value is kept in the rendered output, so the owner's edit stays visible instead of reverting the instant it is logged
- a one-line read-only note is placed on `Summary` only — change #1 removes the per-tab banner, and that banner is currently the only warning that stage tabs are overwritten

**Verify:** V25 (**assert on the request payload, not the rendered sheet**) · V26 (`Assignee` survives two syncs) · V27 · V33 (`Change Log` never cleared or reordered across 3 runs) · V48 (`CHANGELOG.md` and the `Change Log` tab both intact and independent).

### P10 — Apply (change 18, Phase D)

New command `registry_sync.py apply [<ID> <Column> | --all-approved]`:
1. Read `Change Log`; select rows with `Decision = APPROVED` (**D-A7**), or the explicit `(ID, Column)` pair
2. Write the value into `index.yml`; recompute `last_updated`
3. Mark the row `APPLIED`, stamp `Decided at`
4. **Immediately re-push** — contract §5.1 requires regeneration on every registry change
5. `REJECTED` rows are never overlaid, so their cells revert naturally on the next push

**Verify:** V32 · V45 (apply `Registered` → `last_updated` recomputed **once**; next sync reports no further change — proves no loop).

### P11 — Full verification run, then owner smoke

Run all **36** checks (§4). Then **one** owner smoke covering: open the sheet, read `Summary`, edit a
`Status` on `All Items`, see it logged as `PENDING` and still visible, type `APPROVED`, run `apply`,
confirm `index.yml` changed.

### P12 — ROLE 13 — REGISTRAR (change 19) · **separate, needs §7 approval**

Add the role to `MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` §8 after ROLE 12, and
cross-reference it from §10 "Code and registry rules". **Shipped only on explicit owner approval
(§7 forbids the agent editing the operating prompt).** Nothing in P1–P11 depends on it.

## 4. Verification matrix — 36 total

**Retained (9), all currently passing:** V1 V2 V3 V7 V8 V11 V16 V20 V21.

**Amendment (27):** V22 V23 V24 V25 V26 V27 V28 V29 V30 V31 V32 V33 V34 V35 V36 V37 V38 V39 V40
V42 V43 V44 V45 V46 V47 **V48** (`CHANGELOG.md` ≠ `Change Log` tab, §2) **V49** (`index.yml` titles
**not** truncated on disk — truncation is render-only, #21).
**V41 withdrawn** in rev 2 (empty tabs are contract-valid).

| Phase | Gating verifications |
|---|---|
| P0 | audit clean · README md5 recorded · token exchanges |
| P1 | V20 V21 |
| P2 | V42 V43 V49 |
| P3 | V1 V2 V38 |
| P4 | V22 V23 V24 V35 V37 V16 |
| P5 | V34 V40 |
| **P6** | **V11 V3 V7 V23 V39 — hard gate, nothing pushed until green** |
| P7 | V44 |
| P8 | V27 V28 V29 V30 V31 V46 V47 |
| P9 | V25 V26 V33 V48 |
| P10 | V32 V45 |
| P11 | all 36 + owner smoke |

## 5. Rollback

| Phase | Rollback |
|---|---|
| P1 P2 P4 P7 P8 P9 P10 | `git checkout memory/tools/registry_sync.py` — code only, no state |
| P3 P5 | restore `index.yml.pre-amendment` + `.registry_state.json.pre-amendment`, re-run `audit` |
| P6 onward | restore the sheet from `.registry_csv.sheet-pre-amendment/` — **the only sheet rollback that exists** |
| P12 | `git checkout` the operating prompt |

**The irreversible step is the first push after P6.** The live sheet has no version history we
control, and four other projects' dashboard reads it. Hence P6 is a hard gate.

## 6. Files

**WILL change:** `memory/tools/registry_sync.py` · `memory/change_requests/index.yml` ·
`memory/change_requests/CHANGELOG.md` (append) · `memory/tools/.registry_state.json` ·
`memory/tools/.registry_csv/*` · (P12 only) `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`

**WILL NOT touch:** `backend/server.py` · `backend/requirements.txt` · `backend/.env` ·
`frontend/**` · `frontend/package.json` · `tests/**` · `/app/secrets/sheets_token.json` ·
`memory/change_requests/README.md` (**byte-identical, O-G3, V2**) · any other item's folder ·
**no new dependency** — the token exchange stays on plain `requests`.

## 7. Sequencing and the one thing that must not happen

**P1 → P2 → P3 → P4 → P5 → P6 in one pass, no push in between.** Changes #10 (the enum) and P5 (the
status write) are mutually dependent: the write is illegal before the enum, and the sheet routes to
nothing after the enum until the write lands. Under contract v1.2 Addition 3 an all-blank-`Status`
sheet is *valid*, so this is no longer a correctness requirement — but pushing in the middle would
publish an all-tabs-empty sheet to four other projects for no reason.

**Band (b) — P7–P10 — can be deferred.** P1–P6 plus P11 deliver a fully contract-compliant one-way
mirror with every tab populated. If the read path slips, nothing is lost.

## 8. Still open — not blockers for Role 3, but unresolved

1. **🔴 D-A2 — OAuth consent publishing status. 7th ask, unanswered.** §5.1 makes REGISTRAR run on
   every registry mutation. In *Testing*, Google expires the refresh token every 7 days and the
   mirror stops silently while four projects read a stale tab. **P0 step 5 will catch a dead token
   before the amendment starts; it cannot stop one dying afterwards.**
2. **Column M is protected by omission, not permission.** V25 asserts on the payload; protected
   ranges (original plan phase **P7**, never built) are the real guard. Not in this scope.
3. **OQ-1 is worth sending to the dashboard agent** — all five projects will hit malformed dates and
   the obvious implementations differ (reject · coerce · accept-as-string).

---

```text
Planning complete: CR-2026-10-04-006 (amendment)
Stage: Implementation Plan
Code reality: FULL baseline (599-line tool, 87 records, live 9-tab sheet) / NONE of the 21 changes
Risk: MEDIUM — 3 of 22 columns writable; index.yml mutates only via `apply`
Contract: v1.2 · all 3 SO-raised defects closed
Phases: P0 pre-flight · P1 schema+enum · P2 #20/#21 · P3 re-bootstrap · P4 layout · P5 87-row status write · P6 HARD GATE local verify · P7 read · P8 diff · P9 merge-write · P10 apply · P11 verify+smoke · P12 ROLE 13 (§7)
Verifications: 9 retained + 27 amendment = 36 (V48, V49 added here; V41 withdrawn)
Decisions adopted: D-A9 follow contract (3 cols) · D-A7 APPROVED cell · OQ-1 reject bad dates · OQ-2 accept+warn · OQ-3 apply paired · D-A3 single pass · D-A4 #19 separable · D-A5 skip pre-amendment smoke
New finding: CHANGELOG.md vs the Change Log tab are different artefacts and must never cross-write (V48)
Irreversible point: the first push after P6. Sheet rollback exists only via the P0 snapshot
Files WILL change / WILL NOT touch: §6
Owner decisions still open: D-A2 (OAuth publishing status, 7th ask — operational, not blocking) · P12 §7 approval
Next: Gate 3. Requires an explicit "Role 3 approved for CR-2026-10-04-006"
```
