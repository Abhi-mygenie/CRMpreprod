# INTAKE DOC — CR-2026-10-04-006

**Revision 2** — owner refinements applied: no artefact links, no two-way sync, change log instead,
status enum confirmed, new agent role requested. Revision 1 is superseded; deltas in §13.

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-04-006 |
| **Title** | Google Sheet registry mirror, generated one-way from a machine-readable index, with a change log on every regeneration |
| **Classification** | **CR** — internal tooling / process infrastructure |
| **Date Registered** | session after 2026-10-03 (rev 2 same session) |
| **Reported By** | Owner |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P2** (owner-confirmed) |
| **Risk** | **LOW** — downgraded from MEDIUM in rev 1. Two-way sync removed, so there is no write path into the registry |
| **Status** | 📝 REGISTERED — **Role 1 COMPLETE.** Columns, enum and tab model all owner-confirmed (D-G12/13/14). Awaiting (a) owner ruling on the ROLE 13 draft and (b) **Role 2 assignment to open Planning** |
| **Blast radius** | **ZERO on the customer app** · **ZERO on registry integrity** (read-only generation) |
| **Companion item** | §8 requests a **new ROLE 13** in the operating prompt — a prompt change, owner-approval gated (§7) |

## 1. Owner report

A Google Sheet for tracking all CRs and bugs from the registry, so tracking happens in a
spreadsheet rather than by reading `change_requests/README.md` (79 items, 437 lines).

## 2. Owner decisions

| # | Decision | Rev |
|---|---|---|
| D-G1 | ~~Two-way `status` sync~~ → **ONE-WAY ONLY (index → Sheet).** No writes back from the Sheet | **2** |
| D-G2 | Regenerate **on every registry change** | 1 |
| D-G3 | **Machine-readable index (YAML/JSON) is the source of truth**; generate both the markdown tables and the Sheet from it. Do not parse the existing prose | 1 |
| D-G4 | ~~4 tabs~~ → **tab model open; owner asked for a recommendation** (§7) | **2** |
| D-G5 | Audience: **owner only** | 1 |
| D-G6 | Severity **P2** | 1 |
| D-G7 | **No artefact / folder link column.** Linking is not wanted | **2** |
| D-G8 | **Status values = the 12-value enum of rev 1** (owner: *"your status are right"*), not gate names | **2** |
| D-G9 | **Owner smoke passed ⇒ `CLOSED`.** Smoke is the closing act; no separate release gate per item | **2** |
| D-G10 | **A change log is delivered on every regeneration** — this replaces two-way sync as the feedback mechanism | **2** |
| D-G11 | **A new agent role is to be added to the operating prompt** for this work (§8) | **2** |
| D-G12 | **All 17 columns confirmed** as listed in §4 | **2** |
| D-G13 | **Status enum confirmed at 13 values**, including `REPORT_WRITTEN` | **2** |
| D-G14 | ~~Tab model: Option B — 5 action-grouped tabs~~ **SUPERSEDED by D-G17 (rev 3)** | 2 |
| D-G15 | **Priority: build this BEFORE sprint item B1.** Owner: *"tracking pain is blocking me."* Note for the record — this re-orders the Code-Correctness Sprint agreed under D-S1; the sprint work is not cancelled, only deferred behind this CR | **2** |
| D-G16 | ROLE 13 — owner reviewing the draft; **not yet approved, not applied** | **2** |
| D-G17 | **Tab model replaced: gate-based, 8 tabs** (Summary · Intake · Planning · Implemented · QA · Smoke · Closed · Blockers). Owner Approval gets **no tab** — a `BLOCKED-YOU` badge instead. **Supersedes D-G14** | **3** |
| D-G18 | **Parked / deferred / reverted / tombstoned fold into `Closed`** | **3** |
| D-G19 | **Blockers tab grouped by party** (POS · CRM · OWNER · INTERNAL), items repeat there by design | **3** |
| D-G20 | **Summary tab = CTO dashboard** — funnel · risk · who is blocking us · trust indicators | **3** |

## 3. The problem D-G3 solves

The registry is not machine-readable. Measured: **11 tables in 8 different schemas**, column counts
2–7. Priority appears as `Priority`, `Priority / Risk`, `Severity` and `Severity / Risk`.
`Owner action needed`, `Blocked on` and `Note` are the same column under three names. Status is free
prose — multi-sentence, emoji-prefixed, with embedded markdown links and nested bold.

Parsing that will silently drop or mangle rows, which is worse than no Sheet: the owner would be
tracking from something subtly wrong. Generating from a typed index turns an unsolvable parsing
problem into a solved rendering one, and fixes the 8-schema inconsistency as a by-product.

## 4. Index record / Sheet columns — 17 fields

All columns are **generated and read-only** (D-G1). `folder` from rev 1 is **removed** (D-G7).

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | `id` | string, PK | `CR-YYYY-MM-DD-NNN` etc. |
| 2 | `type` | enum | CR · BUG · INV · PROD-INCIDENT |
| 3 | `title` | string | |
| 4 | `status` | **enum** | §5 — the tracking axis |
| 5 | `status_note` | prose | the context that currently lives *inside* status cells; nothing is lost |
| 6 | `severity` | enum | P0 · P1 · P2 · P3 — normalises 4 column names |
| 7 | `risk` | enum | LOW · MEDIUM · HIGH · CRITICAL |
| 8 | `owner_action` | string | what is waiting on the owner — normalises *Owner action needed* / *Note* |
| 9 | `blocked_on` | string | dependency or third party (CRM · POS · ops) |
| 10 | `next_gate` | enum | per §4 of the prompt: Intake · Planning · Approval · Implementation · QA · Smoke · Closure. **Carries the gate position, so `status` does not have to** |
| 11 | `wave_track` | string | Wave 0–5 · Phase B · sprint track |
| 12 | `files` | string | affected files or count |
| 13 | `artefacts` | string | which of INTAKE / IMPACT / PLAN / QA_HANDOVER / QA_REPORT exist (§22) — **text only, no links** (D-G7) |
| 14 | `registered` | date | |
| 15 | `last_updated` | date | |
| 16 | `related` | id list | parent · child · related IDs, as plain text |
| 17 | `code_markers` | bool | does live code reference this ID — **the check that caught finding F1** |

## 5. Status enum — 13 values

Rev 1's 12 values, confirmed by the owner (D-G8), **plus one gap found while counting**:

```
REGISTERED · PLANNED · IMPLEMENTED · QA_PASSED · AWAITING_OWNER_SMOKE · CLOSED
PARKED · BLOCKED · DEFERRED · HELD · REVERTED · TOMBSTONE · REPORT_WRITTEN
```

**`REPORT_WRITTEN` is new.** Eight investigations sit in exactly that state — report delivered,
owner ruling outstanding — and none of the other twelve values describe it. Without it those eight
items would be mis-filed.

**`AWAITING_QA` was considered and rejected.** Items that are built but unverified stay
`IMPLEMENTED`; `next_gate = QA` carries the distinction. That is what column 10 is for, and it keeps
the enum from doubling.

**D-G9 encoded:** `AWAITING_OWNER_SMOKE` → smoke passes → `CLOSED`. One transition, owner-driven.
This aligns with §15, which reserves `CLOSED` for owner acceptance.

## 6. Why `status` and `next_gate` are separate columns

Worth stating plainly, because it was nearly collapsed into one field. A single column cannot
express both *how far an item got* and *whether it is moving*:

| Real item | `status` | `next_gate` |
|---|---|---|
| CR-2026-08-03-001 (716) | `HELD` | Implementation |
| CR-2026-10-03-004 (CRM endpoints) | `BLOCKED` | Planning |
| CR-2026-02-XX-001 | `AWAITING_OWNER_SMOKE` | Closure |
| CR-2026-10-04-003 | `REVERTED` | — |

"Plan is finished but the owner held it" and "intake is finished but CRM is silent" are different
situations that a flat single field would flatten into "not moving".

## 7. Tab model — **DECIDED: Option B** (D-G14)

**Measured distribution** across the registry (92 row-matches, ~79 unique items):

| Status bucket | Count |
|---|---|
| REGISTERED / intake | 23 |
| CLOSED | 13 |
| IMPLEMENTED | 10 |
| REPORT_WRITTEN | 8 |
| AWAITING_OWNER_SMOKE | 6 |
| IMPLEMENTED (QA requested) | 5 |
| BLOCKED | 5 |
| DEFERRED | 4 |
| PARKED | 4 |
| PLANNED | 2 |
| TOMBSTONE | 2 |
| HELD · REVERTED · QA_PASSED | 1 each |

### Option A — one tab per status (as first suggested)

13 tabs. Faithful to the enum, but **seven would hold two rows or fewer**, tabs would sit empty
until something lands in them, and finding an item means guessing its status first.

### Option B — one tab per action group ★ **OWNER-SELECTED (D-G14)**

Five tabs, each answering one question. Every tab still shows the exact `status` column, and
filtering within a tab gives Option A's view on demand.

| Tab | Rule | Approx. rows | Question it answers |
|---|---|---|---|
| **Summary** | — | — | where does the project stand? |
| **Needs You** | `status` ∈ (AWAITING_OWNER_SMOKE, HELD) **or** `owner_action` non-empty | ~13 | what is waiting on me? |
| **In Flight** | `status` ∈ (REGISTERED, PLANNED, IMPLEMENTED, QA_PASSED, REPORT_WRITTEN) | ~36 | what is actually moving? |
| **Not Moving** | `status` ∈ (BLOCKED, PARKED, DEFERRED, REVERTED) | ~14 | what is stuck, and on whom? |
| **Closed** | `status` ∈ (CLOSED, TOMBSTONE) | ~15 | history |

**Summary tab contents:** counts by status, severity and type · the owner-action queue · **QA debt**
(built but never verified — currently 4 items) · oldest unverified item · count blocked on CRM vs POS
vs ops · count of items whose `code_markers` is true but `status` is still `REGISTERED` (the F1 class
of defect, as a standing alarm).

### Option C — single tab plus saved filter views

Least maintenance, but filter views are per-user state and easy to lose.

## 8. New agent role requested (D-G11)

The owner has asked for a dedicated role in the operating prompt. The prompt currently defines
**12 roles** (Role 12 = Release Agent), so this is **ROLE 13 — REGISTRAR**.

Draft definition is in §8 of the chat summary and reproduced here in short form:

- **Invoked when** the registry needs updating, the index or Sheet needs regenerating, or a change
  log is due.
- **Does:** maintain the index as the single source of truth; regenerate the markdown tables and the
  Sheet; produce the append-only change log; run the consistency audit (rows vs folders vs code
  markers, i.e. the F1–F7 class of check).
- **Must not:** adjudicate status — it records what the responsible role or the owner decided; write
  `CLOSED` on its own authority (§15); touch application code; edit the contract, addendum or
  ownership map.
- **Definition of done:** index, markdown and Sheet agree; change log written; audit returns zero
  unregistered items and zero orphan rows.

Adding it also requires a branch in the prompt's §3 role decision tree. **This is a prompt change
and is owner-approval gated (§7).** It is *not* applied by this intake.

## 9. Change log replaces sync-back (D-G10)

Every regeneration emits an append-only entry at
`/app/memory/change_requests/CHANGELOG.md`, echoed in chat:

| ID | Field | From → To | Authority | Date |
|---|---|---|---|---|
| CR-2026-10-03-002 | status | `QA_PASSED` → `CLOSED` | owner smoke (D-G9) | 2026-10-04 |

When nothing changed, it says so explicitly rather than emitting an empty table — silence and
"no changes" are different signals.

## 10. Placement — outside the customer app

`/app/memory/tools/` already holds standalone scripts (`probe_config_flags.py`,
`probe_restaurant_672.py`), so precedent exists. **Not `backend/server.py`:** it is a Part C
CRITICAL hotspot, CR-2026-09-12-006 is about to split it, and internal project tracking does not
belong in a customer-facing ordering app or its auth surface.

## 11. Integration and credentials

Google Sheets is a third-party integration; implementation must follow the integration playbook
rather than be improvised. It needs a Google service-account key (Sheet shared to the service
account) or Emergent-managed Google auth.

**No credentials requested at intake.** They are required before Implementation, not before
Planning, and they go in `.env` — never in a document (§2, R11).

## 12. Scope

**IN:** machine-readable index for all 79 items · generator for the registry markdown tables ·
generator for the Sheet with the agreed tab model · the append-only change log · the consistency
audit · the 17-column schema.

**OUT:** application code of any kind · `backend/server.py` · two-way sync of any field ·
artefact/folder hyperlinks (D-G7) · re-adjudicating any item's status (this CR mirrors, it does not
decide) · closing anything · CRM/POS access (owner-only, D-G5) · **applying the ROLE 13 prompt
change** (drafted for approval only).

## 13. Deltas from revision 1

| # | Rev 1 | Rev 2 | Effect |
|---|---|---|---|
| 1 | two-way `status` sync | **one-way only** | risk MEDIUM → **LOW**; failure modes R1/R2/R3 deleted; the "pull has no trigger" asymmetry disappears |
| 2 | `folder` hyperlink column | **removed** | 18 → 17 columns. Also sidesteps a problem rev 1 had not solved: a Sheet cannot open a pod filesystem path, so those links would have been dead |
| 3 | 12-value enum | **13 values** (`REPORT_WRITTEN` added) | 8 investigations now classify correctly |
| 4 | 4 fixed tabs | **tab model under decision** | Option B recommended |
| 5 | sync-back as owner's acceptance instrument | **change log** | simpler, and acceptance stays in chat where it already works |
| 6 | no role change | **ROLE 13 — REGISTRAR drafted** | prompt change, owner-gated |

## 14. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-07-03-010` registry hygiene / ID canonicalisation | Same domain, shipped, concerned ID formats not tooling | **DISTINCT** |
| `CR-2026-10-04-004` registry reconciliation | Produced the clean 79-row dataset this CR consumes — **prerequisite, now done** | **DISTINCT** |
| `CR-2026-07-04-002` registry finish-up | Closed; concerned the deprecated `memory_repo` | **DISTINCT** |

**Verdict: DISTINCT.** No existing item proposes an export, a Sheet, an index, or a registrar role.

## 15. Dependency note

Only worth building on an accurate registry. `CR-2026-10-04-004` closed that gap in the same session
(52 → 79 rows, 0 unregistered). Built a day earlier, this would have faithfully mirrored a registry
missing a third of its items — including the P1 security investigation.

---

## Addendum — 2026-10-06: contract v1.1 FINAL; amendment now 21 changes, risk MEDIUM

> **Correction, same day:** an earlier revision of this addendum called the accepted contract
> "v1.1.1". **There is no v1.1.1.** The dashboard agent folded the fixes into **v1.1**, which is now
> **final** — *"Contract v1.1 is final. You are clear to open Role 2 — Planning."* All nine rulings
> (P1–P5, Summary two-line, and three additions) were verified present in
> `control/registry-sheet-contract.md`.
>
> **Defect A resolved** (P1 defines the `APPROVED` Decision value). **Defect C resolved by
> implication** (P1 + P3). **Defect B is still open in the contract text** — §1 says the sheet is
> two-way for `Status` only, §5.5 still accepts `Status`, `Registered` and `Closed`. Tracked as
> **D-A8** in `IMPACT_ANALYSIS_AMENDMENT.md` §14; it blocks only the read-merge-write band.

Recorded in the Role 1 pass of 2026-10-06. Scope and deliverables are unchanged; this is a status
correction so the registry stops reporting a stale risk rating and a stale change count.

| Field | Was | Now |
|---|---|---|
| Contract version this item targets | v1.1 (3 defects open, sent back as v1.1.1) | **v1.1.1 — accepted by the dashboard agent** |
| Amendment change count | 19 | **21** (`#20` artefact detection is exact-filename-only; `#21` 16 of 86 titles exceed the contract's "one line", longest 362 chars) |
| Risk | LOW | **MEDIUM** (ruling R2) — changes 16–18 are the first code that **reads** the sheet, so a registry write path now exists |
| Verifications | 9 retained | 9 retained + 17 new (V22–V38) |

**`#20` and `#21` stay folded into this item** — owner ruling, 2026-10-06. Both are defects in
`registry_sync.py` found during the 78 → 80 backfill. They were considered for separate BUG rows and
rejected: the only fix for either lives inside this amendment, so splitting them would track one code
change in three places. Neither can be silently dropped — both are written into the verification set.

**Gate state unchanged.** Gate 2 is still shut. `AMENDMENT_DESIGN_DRAFT.md` remains an investigation
artefact and converts to an implementation plan only when the owner opens **Role 2**. No code has been
written against the amendment.

**Registry size moved again:** 80 → **86** items in the 2026-10-06 intake pass, which is why `#21`
now reads 16-of-86 rather than 16-of-80. The six new rows were authored to the contract's one-line
title rule, so none of them adds to the overlong set.

---

```text
Intake complete (rev 2): CR-2026-10-04-006
Classification: CR (internal tooling / process infrastructure)
Severity: P2 (owner-confirmed)
Risk: LOW (downgraded from MEDIUM — two-way sync removed)
Duplicate check: DISTINCT
Evidence: captured (11 tables / 8 schemas; status distribution across 79 items; /app/memory/tools precedent; 12 existing roles)
Blast radius: ZERO on customer app, ZERO on registry integrity
Docs updated: this file; ../README.md
Next: owner confirms §4 columns (17), §5 enum (13), §7 tab model (A/B/C), §8 ROLE 13 draft — then Planning
```
