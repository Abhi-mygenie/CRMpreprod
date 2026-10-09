# AMENDMENT DESIGN DRAFT — Scan & Order onto registry-sheet-contract v1

> ## ⚠️ THIS IS NOT AN IMPLEMENTATION PLAN AND NOT A GATE 3 ARTEFACT
>
> ### 🔴 SUPERSEDED 2026-10-06 — stale in six places. Read `IMPACT_ANALYSIS_AMENDMENT.md` instead.
>
> The owner opened **Role 2 — PLANNING** on 2026-10-06 for impact analysis. This draft was written
> against contract **v1** and a **78**-item registry; neither holds. Six deltas are itemised in
> `IMPACT_ANALYSIS_AMENDMENT.md` §3 — briefly: **22 columns not 21** (`Money path` adopted as column
> 22) · two-way accepts **`Status` only**, not Status + 2 dates · `Last updated` derived from each
> item's **last gate date**, blanket `2026-10-05` seeding **withdrawn** · **OPEN-1..OPEN-4 are all
> closed** · registry is **87** records, not 78 · **21** changes, not 19.
>
> Retained here for the audit trail. Its §4 cycle, §6 verification set and §7 risk list are still the
> basis of the work — as corrected by the impact analysis.
>

> **Role:** 6 — INVESTIGATION (read-only). **No code has been written.**
> Authored under the owner's instruction *"till contract is finalized no planning, but draft as
> investigation"* (2026-10-05). Gate 3 remains **shut**.
>
> This document becomes an `IMPLEMENTATION_PLAN.md` only when **both** hold:
> 1. the contract is finalised — the dashboard agent has ruled on v1.1 **P1/P2/P3**, and
> 2. the owner explicitly opens **Role 2 — PLANNING**.
>
> **Role 6 step budget: 9/10 used** on the investigation itself (§1 of
> `INVESTIGATION_REPORT_contract_alignment.md`). This draft is authoring of findings already
> gathered, not new investigation. No further probing was performed.

**Date:** 2026-10-05 · **Amends:** `CR-2026-10-04-006` · **Risk after amendment:** MEDIUM (owner, R2)
**Contract:** `memory/control/registry-sheet-contract.md` v1 — **FROZEN** (see `CONTRACT_FREEZE_RECONCILIATION.md` §8, §10)
**Supersedes:** D-G1 (one-way only), D-G13 (13-value status enum), D-G14/§6 (tab model and routing)

---

## 1. Shape of the change

Today's tool is a **one-way generator**: read `index.yml` → clear the sheet → write it. The amendment
makes it a **read-merge-write mirror with an approval-gated return path**. That single sentence is
the whole of the risk: for the first time, code in this project *reads* the sheet and can *mutate*
`index.yml` from it. Everything else is layout.

| | Now | After |
|---|---|---|
| Direction | one-way, index → sheet | two-way for Status + 3 dates, owner-approved |
| Columns | 18 ad-hoc | **21, contract order** |
| Tabs | 9, Summary first | **10, Summary last**, `Change Log` added |
| Status vocabulary | 13 values (ours) | **8 values** (contract) |
| Header | row 2, banner on row 1 | **row 1**, no banner |
| Routing | by `next_gate` | **by `Status`**, one-to-one |
| `Blockers` tab | party-grouped custom | non-blank `Blocked on`, any Status, same 21 columns |
| Write method | `batchClear` + full write | **read → merge → write**, column M never touched |

## 2. Field mapping — `index.yml` to the 21 contract columns

| # | Column | Source | Notes |
|---|---|---|---|
| 1 | Project | constant `SO` | not stored in the index |
| 2 | ID | `id` | **the diff key**. Never position |
| 3 | Type | `type`, overridden | title starts "BUG" → `BUG` (5 items); `PROD-INCIDENT` → `INCIDENT`; `GAP` supported, unused |
| 4 | Title | `title` | |
| 5 | Status | `status` | **8-value enum**; blank until adjudication |
| 6 | Status note | `status_note` **+ folded-in** `next_gate`, badge text, blocker detail (F4) | see §3 |
| 7 | Priority | `priority` ← renamed from `severity` | |
| 8 | Risk | `risk` | |
| 9 | Area | — | always blank; POS only per §3 |
| 10 | Sprint | `sprint` ← renamed from `wave_track` | |
| 11 | Blocked on | `blocked_on[*].party`, **oldest by `since`** (F4) | single enum value only |
| 12 | Owner action | `owner_action` | |
| 13 | **Assignee** | — | **never read, never written, never cleared.** See **OPEN-1** |
| 14 | Registered | `registered` | 3 blank (`02-XX`) → owner fills per §3 |
| 15 | Last updated | `last_updated` | seeded `2026-10-05` (F3), then from `.registry_state.json` |
| 16 | Closed | `closed` (new field) | required when Status ∈ CLOSED/PARKED/DUPLICATE |
| 17 | Related | `related` | comma-separated; blank on all 78 |
| 18 | Artefacts | `artefacts` | already derived |
| 19 | Code markers | `code_markers` | `YES`/`no`; 26 true |
| 20 | Files | `files` | |
| 21 | Notes | `notes` (new field) | |

**Retired index fields:** `next_gate`, `badge` (was derived), and the 13-value enum.
**Index-only, not mirrored:** `money_path` — surfaces as a count in `Trust indicators` (F5).

**Migration: none. Re-bootstrap instead.** Every renamed or added field is blank on all 78 rows, so
there is nothing to carry across. Re-running `bootstrap` into the new schema is strictly safer than
an in-place rename. The one consequence: `.registry_state.json` must be rebuilt in the **same step**,
or the next run logs 78 spurious "added to index" entries.

## 3. `Status note` composition (F4)

One cell, assembled in fixed order so it stays diff-stable:

```
<status_note>  ·  gate: <next_gate>  ·  BLOCKED: POS — no POS token for table-config (since 2026-10-04); OWNER — ratify 7 money-path items (since 2026-10-05)
```

Segments are omitted when empty. Column 11 carries only `POS` — the **oldest** blocker by `since`.
Nothing is discarded: every blocker's party, ref and date survives in this cell, which satisfies §3's
*"anything that does not fit an enum goes into Status note or Notes, never into the enum column."*

## 4. The read-merge-write cycle

Per contract §5 and the F1/F2 rulings. Owner approval happens **in chat**.

**Phase A — read**
1. `All Items!A2:U` → map keyed on column B (`ID`).
2. `Change Log!A2:I` → existing rows; collect `(ID, Column)` pairs by `Decision`.
3. Column **M is excluded from the read entirely** (§5.6).

**Phase B — diff** (against the rendered registry values, not raw YAML)
4. **Phase-1 columns** — `Status` (5), `Registered` (14), `Last updated` (15), `Closed` (16): if the
   sheet differs from the registry and no `PENDING` row already exists for that `(ID, Column)`,
   append a `PENDING` row.
5. **Any other agent-owned column** differing → append `REJECTED`, note
   `"column not editable in Phase 1"` (§5.5).
6. **Sheet row whose ID is absent from the index** → `REJECTED`, note `"unknown ID — row hand-added"`.
   Protects against someone typing a new item straight into the sheet.
7. **`Status` edited to a non-enum value** → `REJECTED`, note `"not a contract Status value"`.
8. **Edit on a stage tab** → `REJECTED`, note `"edit on a derived tab"` (F2). Stage tabs are read
   only to detect this, never to source a value.

**Phase C — merge and write**
9. Render all 78 rows from the index.
10. **Overlay**: where a `PENDING` row exists for `(ID, Column)`, keep the **sheet's** value so the
    owner's edit stays visible instead of being silently reverted the instant it is logged. This is
    the fix for R1 and the whole reason read-merge-write is needed.
11. Write `All Items` as **two ranges — `A:L` and `N:U`** — so column M is never in a write request.
    No `batchClear` on this tab.
12. Stage tabs: filter by `Status`, same 21 columns. **See OPEN-1.**
13. `Change Log`: **append-only, excluded from every clear.** New rows appended below the last.
14. `Summary`: rebuilt each run (§5).

**Phase D — apply** (separate command; runs only after the owner approves in chat)
15. `registry_sync.py apply <ID> <Column>` or `--all-pending` → write the value into `index.yml`,
    mark the row `APPLIED`, stamp `Decided at`.
16. Immediately re-push, because §5.1 requires regeneration on every registry change.
17. `REJECTED` rows are never overlaid, so their cells revert naturally on the next push (§5.3).

## 5. Summary tab (§6 + X2/X3)

Header row 1, then — in order, one blank row between blocks:

```
Generated <ISO timestamp>
Pending change-log rows: N

Status × count              (all 8 values, zeros included)
Unrouted: 78                (X3 — declared SO deviation, outside the 8-value block)

Priority × count            (open items only: not CLOSED/PARKED/DUPLICATE)

Blocked on × count

Trust indicators            (X2 — SO-local 4th block)
  Items indexed · Status not yet adjudicated · Items with live code markers ·
  Live code markers but Status = INTAKE (F1 tripwire) · index.yml ↔ README divergence ·
  Money-path items (F5) · Registered missing
```

## 6. Verification plan (drafted, not run)

Carried forward: **V1 V2 V3 V7 V8 V11 V16 V20 V21** — all 9 currently passing, all must keep passing.
New, all required before this would be callable done:

| V | Check |
|---|---|
| V22 | Header on row 1 of all 10 tabs; no banner anywhere |
| V23 | Exactly 21 columns, in contract order, exact header strings |
| V24 | `Project` = `SO` on all 78 rows |
| V25 | **Column M is absent from every write request** — assert on the request payload, not by eyeballing the sheet |
| V26 | Type a value into `Assignee`, run `sync` twice → value survives both |
| V27 | Edit a `Status` on `All Items` → one `PENDING` row appears; `index.yml` **unchanged**; the edit is **still visible** in the sheet after the push |
| V28 | Edit a non-Phase-1 column → `REJECTED` with the §5.5 reason; cell reverts next push |
| V29 | Edit a `Status` on a **stage** tab → `REJECTED`, `"edit on a derived tab"` |
| V30 | Hand-add a row with an unknown ID → `REJECTED`, `"unknown ID"` |
| V31 | Invalid Status value → `REJECTED`, `"not a contract Status value"` |
| V32 | `apply` → `index.yml` updated, row `APPLIED`, `Decided at` stamped, sheet re-pushed |
| V33 | `Change Log` is never cleared or reordered across 3 consecutive runs |
| V34 | Summary Status counts **+ Unrouted = `All Items` row count** (the owner's acceptance criterion) |
| V35 | Tab order matches §2 exactly, Summary last |
| V36 | `Last updated` = `2026-10-05` on all 78 after the re-bootstrap seeding |
| V37 | Two blockers on one item → column 11 shows the **older** party; both appear in `Status note` |
| V38 | `.registry_state.json` rebuilt during re-bootstrap → first post-migration run logs **0** changes, not 78 |

## 7. Risks

1. **First read path into a human-editable surface.** Every prior guarantee rested on the sheet being
   write-only. Mitigations: ID-keyed diffing (never positional), the Phase-1 column allow-list, and
   `index.yml` mutating **only** via the explicit `apply` command.
2. **Column M is protected by omission, not by permission.** Nothing in the API stops a future code
   change from including M in a range. V25 asserts on the request payload for exactly this reason.
   A protected range (plan phase P7, never built) would be the real guard.
3. **Concurrent change — see OPEN-3.** If the registry and a human change the same field in the same
   cycle, §5.4 says the registry wins. But step 10 overlays the human's pending value, which
   contradicts it. Needs a rule.
4. **`batchClear` still applies to stage tabs and Summary.** Anyone typing into those loses it with no
   warning — and change #1 removes the `READ-ONLY, edits are overwritten` banner that is currently
   the only notice. Recommend keeping a warning somewhere, perhaps a note cell on Summary.
5. **🔴 Refresh-token expiry, still unanswered (5th ask).** §5.1 makes REGISTRAR run on **every**
   registry mutation. If the consent screen is in *Testing*, Google expires the refresh token after
   7 days and the sheet silently stops updating — now with four other projects' dashboard depending
   on it. Unchanged by the F1b ruling: declining the Drive scope does not affect token lifetime.
6. **Re-bootstrap resets history.** `.registry_state.json` must be rebuilt in the same step (V38).

## 8. Open questions — must close before this can become a plan

**OPEN-1 — `Assignee` on stage tabs is unsatisfiable as written.** §2 says stage tabs carry the same
columns as `All Items`, filtered. §3 says the agent *"never writes or clears"* column 13. These
cannot both hold on a derived tab: stage-tab membership and row order change every run, so if M is
left untouched it retains the **previous** run's values at those positions and displays assignees
against the wrong items. The only alternatives all breach something:

| | Behaviour | Breach |
|---|---|---|
| i | never touch M on stage tabs | stale, mis-aligned assignees shown — actively misleading |
| ii | write M blank on stage tabs | breaches "never writes or clears" literally |
| iii | omit column 13 from stage tabs | breaches "same columns as All Items" |

**Recommendation:** confirm with the dashboard agent that §3's prohibition is about **`All Items`**,
where the dashboard writes (§8 says it reads All Items and writes only Assignee). Then (ii) is
correct and harmless. This is a v1 wording issue, not an SO issue — worth folding into v1.1.

**OPEN-2 — Summary header line.** §6: *"Plus one line: `Generated <ISO timestamp>` and
`Pending change-log rows: N`."* One line holding both, or one line each? §5 above assumes two lines.
Cosmetic, but the dashboard may parse it.

**OPEN-3 — concurrent edit.** §5.4 *"the registry wins unless the owner explicitly overrides"* vs
step 10's overlay of a pending human edit. Options: (a) registry wins, the cell reverts, and the
`PENDING` row gains a note `"registry changed concurrently; registry wins per §5.4"`; (b) the overlay
holds until adjudicated. **(a)** is literal compliance; **(b)** is kinder to the human. Needs a ruling.

**OPEN-4 — `Last updated` and the approval loop.** If the owner edits `Last updated` in the sheet
(it is a Phase-1 accepted column), and `apply` then changes the registry, the agent's own write
updates `Last updated` again. Risk of a self-feeding diff. Likely needs `Last updated` excluded from
the diff, or computed after apply — which would contradict §5.5 listing all three dates as accepted.

## 9. Sizing

| Band | Items | Rough |
|---|---|---|
| Layout and schema (changes 1–15) | 15 | ~3–4 h |
| Read-merge-write + diff + apply (16–18) | 3 | ~4–5 h |
| ROLE 13 prompt edit (19) | 1 | ~0.5 h |
| New verifications V22–V38 | 17 | ~2 h |

Not a Role 3 pass. Two of the three substantial pieces (diff, apply) have no analogue in the existing
code, and `OPEN-1`/`OPEN-3`/`OPEN-4` are behavioural rules that must be settled before they are
written, not after.

---

```text
Draft complete: amendment design for CR-2026-10-04-006 onto registry-sheet-contract v1
Type: Role 6 INVESTIGATION draft — NOT an implementation plan, Gate 3 NOT opened
Steps used: 9/10 (investigation); this document is authoring, not probing
Blocked on: contract finalisation (v1.1 P1/P2/P3) · OPEN-1..OPEN-4 · owner opening Role 2
Carries: 19 changes · 9 existing verifications retained · 17 new drafted · risk MEDIUM per R2
Report: memory/change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/AMENDMENT_DESIGN_DRAFT.md
```
