# INVESTIGATION REPORT — Shared registry-sheet contract alignment

**Role:** 6 — INVESTIGATION AGENT (read-only, no code) · **Date:** 2026-10-05
**Trigger:** Owner brief *"Scan & Order (customer app) agent: registry sheet onto the shared contract"*, 2026-10-05
**Amends:** `CR-2026-10-04-006` (currently IMPLEMENTED, gate 5, QA open)
**Subject sheet:** `Scan and Order issue tracker` — `1-dS9OsFt4FQ68ufgP924jgfP7L8RNEKlVYCe39scqx0`

---

## 0. Headline

**The brief cannot be executed as written.** Its first instruction is *"Contract:
`registry-sheet-contract.md` (read it first; this brief is the delta for Scan & Order)"* — and that
file **does not exist anywhere on this pod**. A filesystem-wide search and a content grep across all
`.md`, `.py` and `.yml` both return nothing.

The brief is explicitly a **delta**. Without the base document, 7 of the 18 required changes cannot
be specified, including two of the three acceptance criteria. I can state precisely which changes
are unambiguous and which are not, and that is what follows.

Separately, two changes in the brief **conflict with decisions already ratified** in this project's
own registry, and one of them is a reversal of the CR's founding decision. Those need owner rulings,
not agent interpretation.

## 1. Hypotheses and outcomes

| # | Hypothesis | Evidence | Outcome |
|---|---|---|---|
| H1 | The sheet is close to the contract, so this is a cosmetic re-layout | brief's own mapping + current `HEADERS` | **PARTLY REJECTED** — the layout half is cosmetic; §2's two-way Status path is an architecture reversal, not cosmetic |
| H2 | The contract is available somewhere in the pod or repo | `find / -iname '*registry*contract*'`, content grep | **REJECTED** — absent. Primary blocker |
| H3 | The carry-over registrations (brief §4) are outstanding work | `index.yml` = 78 = every item folder | **REJECTED for CR-2026-10-04-004** (already done); **CONFIRMED for the 19 legacy `BUG-NNN`**, which conflicts with INV-2026-10-04-001's stated non-goal |

## 2. Run report (requested in Deliverables)

Measured now, pre-change:

| Metric | Value |
|---|---|
| Items on the sheet | **78** |
| Newly registered from CR-2026-10-04-004 | **0 outstanding — all 23 are already indexed** (see §5.1) |
| Unrouted (blank Status) | **78** — every item |
| Items with no `Registered` date | **3** — `BUG-2026-02-XX-001`, `CR-2026-02-XX-001`, `CR-2026-02-XX-002` (the `02-XX` placeholders; never invented) |
| Type distribution now | CR 61 · INV 13 · BUG 3 · PROD-INCIDENT 1 |
| Type distribution after the brief's §1 rule | CR **56** · INV 13 · BUG **8** · INCIDENT 1 |
| Items with live code markers | 26 |

## 3. Changes that are unambiguous — can be built today

| # | Change | From → To | Notes |
|---|---|---|---|
| C1 | Drop the banner row | row 1 banner + row 2 header → **header on row 1** | frozen-row count drops 2 → 1; generation timestamp loses its home (see Q7) |
| C2 | Add `Change Log` tab | 9 tabs → 10 | distinct from `CHANGELOG.md`; relationship unspecified (Q6) |
| C3 | Rename `Severity` → `Priority` | — | values already P0–P3, no data migration |
| C4 | Rename `Wave / track` → `Sprint` | — | all 78 currently blank |
| C5 | Add `Project`, hardcoded `SO` | new | trivial |
| C6 | Add `Area` (blank), `Assignee`, `Closed date`, `Notes` | new | `Assignee` is never written by us — but see **R1**, a real conflict |
| C7 | Fold `Next gate` and `Badge` into `Status note` | 2 columns → merged | both are currently blank/derived; no data loss today |
| C8 | `Type` derivation | `CR` → `BUG` for 5 items; `PROD-INCIDENT` → `INCIDENT` | **verified exactly**: `CR-2026-10-03-002`, `-003`, `-005`, `CR-2026-10-04-002`, `-003` are the only non-`BUG`-prefixed items whose title begins "BUG" — precisely the brief's list, no more, no fewer |
| C9 | Blank-Status rows on `All Items` only | currently already true | my `route()` returns `None` for them; matches the brief |
| C10 | Summary reports them as `Unrouted` | currently labelled "Unrouted (status not adjudicated)" | rename only |
| C11 | Keep trust indicators as a 4th Summary block titled `Trust indicators` | currently blocks 1–4 free-form | retitle + restructure blocks 1–3 into the contract's plain table |

C1–C11 are ~1 hour of work in `registry_sync.py`. None touches application code.

## 4. 🔴 Blocked on the missing contract — 7 items

| # | Question | Why it blocks |
|---|---|---|
| Q1 | **What are the 21 columns, in order?** | Acceptance says *"21 contract columns"*. The brief's mapping yields only **20** by my count: Project · ID · Type · Title · Area · Status · Status note · Priority · Risk · Owner action · Assignee · Blocked on · Sprint · Registered · Last updated · Closed date · Files · Artefacts · Code markers · Notes. **One column is unaccounted for**, and the order is never stated. I will not invent either. |
| Q2 | **What is the contract's Status enum?** | Mine is 13 values (`REGISTERED … REPORT_WRITTEN`), ratified as D-G13. If the contract's differs, every stage-tab mapping and the Summary counts change, and the forthcoming adjudication would be done against the wrong vocabulary. |
| Q3 | **What maps a Status to a stage tab?** | The brief deletes `Next gate` as a column, but §6 of the implementation plan routes *by* `next_gate`. Brief §1 implies routing is now **Status-only**. That is a replacement of the ratified routing rule and needs the contract's mapping table. |
| Q4 | **What is the Summary plain-table shape (contract §6)?** | Named but not reproduced. |
| Q5 | **What is the change-log approval protocol (contract §5)?** | Named but not reproduced. Column set, how a row is marked approved/REJECTED, whether the owner approves in-sheet or in chat. |
| Q6 | **`Change Log` tab vs the existing `CHANGELOG.md`** | Two change logs now exist with different purposes: the file logs *index→sheet* field diffs; the tab must log *sheet→index* human edits. Same name, opposite direction. Are they merged, or kept separate? |
| Q7 | **Where does the generation timestamp live** once the banner is gone? | Removing the banner removes the only "as of" marker and the `READ-ONLY, edits are overwritten` warning — which is currently the *sole* safeguard against people typing into overwritten columns (P7's protected ranges were never built). |

## 5. 🔴 Conflicts with already-ratified decisions — 4 items, owner rulings needed

### R1 — `Assignee` is never written, but `sync` wipes every tab first

`push()` calls `values:batchClear` across all tabs, then rewrites from `index.yml`. "Never write the
Assignee column" is therefore **not achievable by omission** — not writing it still clears it. The
same applies to any human `Status` edit: it is erased on the very next run.

This is the sharpest mechanical consequence in the brief, and it compounds into a **design
contradiction**:

> §2: *"append human edits to the Change Log, present them to the owner, and apply to `index.yml`
> only what the owner approves"* + §3: *"on every `index.yml` mutation: regenerate the sheet in the
> same step"*

If the sheet is regenerated from `index.yml` while the edit is still awaiting approval, the owner's
typed Status **vanishes from the sheet the moment it is logged** — it is recorded in the Change Log
but visually reverted. The owner then sees their edit undone and is likely to retype it. Resolving
this needs either per-column write preservation (read-merge-write rather than clear-write) or a
rule that pending cells are left untouched until adjudicated. Contract §5 may already settle it;
I cannot see it.

### R2 — Two-way Status reverses D-G1, the CR's founding decision

`CR-2026-10-04-006` intake rev 2 settled **D-G1: one-way only, an append-only change log replaces
sync-back**, and that single decision is why the CR's risk was formally downgraded from MEDIUM to
LOW — the registry README records the reason verbatim: *"two-way sync removed, so no write path into
the registry"*.

The brief reintroduces a write path. Mechanically it is gated by owner approval, so it is safer than
raw sync-back, but it is still a reversal of a ratified decision and it **re-raises the risk rating
the downgrade was based on**. Per the operating prompt's gate system this is a scope change to a
registered item, which belongs to **Role 1/Role 2**, not to an implementation pass. It should be
recorded as an amendment to `CR-2026-10-04-006` (or a new CR) with the risk re-rated, rather than
absorbed silently.

### R3 — Brief §4 asks for registrations that INV-2026-10-04-001 explicitly forbids

The brief: *"register the unregistered items so they appear on the sheet."*

- **CR-2026-10-04-004's 23 items: already done.** All 23 have folders, the folders were backfilled
  into `README.md` last session, and `bootstrap` indexes from folders — so `index.yml` is 78 = every
  item folder. **Nothing outstanding.** The "15 orphan code markers" finding (F1) is likewise
  already represented: 26 items now carry `code_markers`.
- **INV-2026-10-04-001's 19 legacy `BUG-NNN` IDs: in direct conflict.** That investigation's §5
  Explicit non-goals states: *"No new registry rows for the legacy IDs until the owner rules on the
  report."* The report does not exist — the folder holds only `INTAKE_DOC.md`; the investigation has
  never been run. Registering them now would both pre-empt that ruling and inject 19 rows of unknown
  provenance into a sheet about to be adjudicated.

**Recommendation:** run `INV-2026-10-04-001` first (it is read-only, Role 6, P1, and currently
unblocked), then register whatever it recommends. Alternatively the owner explicitly overrides the
non-goal — but that should be said out loud.

### R4 — New finding: `BUG-042` is live in code and missing from the 19

`INV-2026-10-04-001` lists 19 surviving IDs: `001 002 003 005 006 007 008 010 011 020 035 039 040
041 043 044 047 048 050`.

A scan of current application source (`backend/**/*.py`, `frontend/src/**`) finds **5** legacy
markers: `BUG-035 · BUG-039 · BUG-040 · BUG-041 · BUG-042`.

**`BUG-042` carries a live code marker and does not appear on the 19-ID list at all.** Conversely,
14 of the 19 have no marker in today's code. This is a new F-class finding: the surviving-ID list
was assembled from `/app/memory` documents only, and never cross-checked against source. It should
be filed against `INV-2026-10-04-001` before that investigation runs.

## 6. Schema impact on `index.yml`

Fields today: 18. The brief adds `project`, `area`, `assignee`, `closed_date`, `notes`; renames
`severity`→`priority` and `wave_track`→`sprint`; and retires `next_gate`, `badge` (derived) and
possibly `related` — **`related` is absent from the brief's mapping entirely** (Q1's missing column?
It is currently blank on all 78, so no data is at risk either way).

A rename is a destructive migration on a file that is now the source of truth. Since every affected
field is blank on all 78 rows, the safe path is to **re-bootstrap into the new schema** rather than
migrate — but that resets `.registry_state.json`, so the next run would log 78 "added to index"
entries again unless the snapshot is rebuilt in the same step.

## 7. Confirmed and requiring no investigation

- **ROLE 13 — REGISTRAR: approved.** The brief's *"Confirmed"* satisfies §7's requirement for owner
  approval before editing the operating prompt. The draft is ready to apply, and must now also carry
  the approval-gated change-log rule and the never-write-Assignee rule.
- **`CR-2026-07-03-010` (ID-scheme canonicalisation):** `TYPE-YYYY-MM-DD-NNN` retained. Already the
  format in use for all 78 — no action.
- **Status adjudication is out of scope for this brief.** Noted and respected: no status is proposed
  anywhere in this report.

## 8. Recommended sequence

1. **Owner supplies `registry-sheet-contract.md`** → unblocks Q1–Q7.
2. **Owner rules on R1** (pending-cell preservation) and **R2** (amend `CR-2026-10-04-006` vs new CR;
   re-rate the risk).
3. **Owner rules on R3** — run `INV-2026-10-04-001` first, or override its non-goal.
4. File **R4** (`BUG-042`) against `INV-2026-10-04-001`.
5. **Role 2 — PLANNING** drafts the amendment: new schema, contract layout, read-merge-write push,
   Change Log diff, ROLE 13 prompt edit. *Not* a straight implementation pass, because of R2.
6. **Role 3** implements C1–C11 plus whatever Q1–Q7 settle.
7. Owner reviews the sheet on the new layout; **then** adjudication, jointly, as the brief says.

C1–C11 could be built now and the contract-dependent parts layered after — but that means writing
the header row twice and re-bootstrapping the schema twice. Given the contract is one file, waiting
is cheaper. The owner's call.

---

```text
Investigation complete: shared registry-sheet contract alignment (amends CR-2026-10-04-006)
Root cause: deliverable under-specified — registry-sheet-contract.md is absent from the pod and the
            brief is explicitly only the delta; additionally the brief reverses ratified decision
            D-G1 and collides with INV-2026-10-04-001's stated non-goal
Classification: CONFIG
Confidence: HIGH (11 changes unambiguous, 7 blocked, 4 conflicts — all evidence-backed)
Steps used: 8/10
Evidence: memory/change_requests/index.yml · memory/tools/registry_sync.py (HEADERS, push, route)
          memory/change_requests/README.md:400 · INV-2026-10-04-001/INTAKE_DOC.md §2,§5
          CR-2026-10-04-004/INTAKE_DOC.md F1 · CR-2026-10-04-006/{INTAKE_DOC,IMPACT_ANALYSIS,
          IMPLEMENTATION_PLAN,AUTH_AMENDMENT,QA_HANDOVER}.md · grep of backend/** + frontend/src/**
Recommendation: Owner decision (supply the contract; rule on R1/R2/R3), then Planning — not
                Implementation, because R2 reverses D-G1 and re-rates the CR's risk
Report: memory/change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/INVESTIGATION_REPORT_contract_alignment.md
```
