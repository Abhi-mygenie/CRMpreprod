# INTAKE DOC — INV-2026-10-04-001

## Item Identity

| Field | Value |
|-------|-------|
| **INV ID** | INV-2026-10-04-001 |
| **Title** | Legacy `BUG-NNN` status source is gone — reconstruct the open/closed state of 19 surviving IDs from cross-references |
| **Classification** | **INVESTIGATION** (read-only, Role 6, no code) |
| **Date Registered** | session after 2026-10-03 |
| **Reported By** | Audit finding F7 of CR-2026-10-04-004 |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P1** — the deprecated tracker was recorded as holding 10 open bugs, 2 of them P0 |
| **Risk** | **LOW** to investigate (read-only); **UNKNOWN** in what it may surface |
| **Status** | 📝 REGISTERED (Role 1 done) — ready to run, no blockers |
| **Blast radius** | UNKNOWN until complete — that is the point of the investigation |

## 1. Problem

The operating prompt's addendum Part B §10 states:

| Claim in the prompt | Reality |
|---|---|
| Bug tracker at `/app/memory_repo/BUG_TRACKER_v2.md` | `/app/memory_repo` **does not exist**; no `BUG_TRACKER*` file exists anywhere in the pod |
| ID format `BUG-NNN`, sequence 001–050 | the IDs appear in documents, but nothing holds their status |
| *"Current open bugs: 10 (2× P0, 8× P1)"* | **unverifiable** |

Owner ruling (D-R5): **`/app/memory` is canonical; `memory_repo` is deprecated.** That settles which
path to use. It does **not** settle whether those 10 open bugs were fixed, migrated into the
`CR-YYYY-MM-DD-NNN` scheme, or simply lost.

## 2. What survives

**19 legacy IDs are still referenced across 33 documents** in `/app/memory`:

```
BUG-001  BUG-002  BUG-003  BUG-005  BUG-006  BUG-007  BUG-008  BUG-010
BUG-011  BUG-020  BUG-035  BUG-039  BUG-040  BUG-041  BUG-042  BUG-043  BUG-044
BUG-047  BUG-048  BUG-050
```

So the identifiers and much of the surrounding discussion survive. What is missing is the one file
that recorded *state*. Several are already cited as context by live CRs — e.g.
`CR-2026-07-03-011` says it "remediates BUG-001/BUG-002", and the addendum's own do-not-do list
says the restaurant-716 logic is "tracked (BUG-006) and parked intentionally".

## 3. Questions to answer

| # | Question |
|---|---|
| Q1 | For each of the 19 IDs, what is the last recorded status in any surviving document? |
| Q2 | Which are demonstrably fixed — superseded by a later CR that shipped? |
| Q3 | Which are still genuinely open, and of those, which are the 2 P0s the prompt referred to? |
| Q4 | Which exist only as a passing mention with no recoverable content? |
| Q5 | Do any describe behaviour still present in today's code? (verify against `3oct`, per R1) |
| Q6 | Is the full `BUG-001..050` set recoverable from git history, or did `memory_repo` never land in this pod? |

## 4. Method (read-only)

1. Grep every surviving reference and assemble a per-ID dossier.
2. Cross-match each against the 78 registry rows for a superseding CR.
3. For any ID that still sounds live, verify the behaviour in current code — code is truth (R1).
4. Check git history for a deleted `memory_repo` tree (the repo was cloned fresh; 5 commits total,
   so expectations should be low).
5. Produce `INVESTIGATION_REPORT.md` with a status table and a recommendation per ID:
   **closed / superseded / re-register as a new BUG / unrecoverable**.

## 5. Explicit non-goals

No code. No fixes. No new registry rows for the legacy IDs until the owner rules on the report —
re-registering a bug that was fixed months ago would be worse than the current silence.

## 6. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-07-04-002` (registry finish-up, part B) | Was the 39-item `BUG_TRACKER` reconciliation. Its subject files are deprecated, so it is **closed under §15** with the owner's accepted exception; this investigation carries the one still-live question | **DISTINCT — supersedes part B** |
| `CR-2026-10-04-004` (registry reconciliation) | Parent; this is finding F7 split out | **DISTINCT** |
| `CR-2026-07-03-010` (registry hygiene) | Froze the `BUG-NNN` sequence at 050 and declared `BUG_TRACKER_v2` stale. Shipped | RELATED — useful evidence |

**Verdict: DISTINCT.**

## 6a. CORRECTION — 2026-10-06 (Role 1 intake pass): the set is **20**, not 19

`BUG-042` was missing from the list above. It is live in the codebase and was omitted here.

**Root cause of the omission:** this intake's ID set was built **from documents**, and never
cross-checked against source. A direct `grep -oE '\bBUG-[0-9]{3}\b'` across `memory/`, `backend/`,
`frontend/src` and `tests/` returns **20 distinct IDs**. The document sweep returned 19.

Corrected set (20):

```
BUG-001  BUG-002  BUG-003  BUG-005  BUG-006  BUG-007  BUG-008  BUG-010
BUG-011  BUG-020  BUG-035  BUG-039  BUG-040  BUG-041  BUG-042  BUG-043
BUG-044  BUG-047  BUG-048  BUG-050
```

**Consequence for this investigation:** the premise *"19 IDs survive across 33 docs with no status
source"* understated the problem by one, and — more importantly — proved that a documents-only sweep
is not sufficient. When Role 6 runs, **the ID set must be re-derived from source, not from this
document.** Q6 (*"is the full `BUG-001..050` set recoverable from git history"*) gains a sibling:
how many more IDs exist in code that no document mentions?

The finding was raised by the owner and held across two sessions before being applied; recorded in
`INTAKE_PASS_2026-10-06.md`. No status was reconstructed for `BUG-042` — that is Role 6's job, and
it remains unassigned.

## 7. Why P1 and not P3

If the "2× P0" claim was accurate when written, two critical defects may be live and untracked. The
investigation is cheap, entirely read-only, and either clears the ghost or recovers two P0s. Leaving
it unanswered is the expensive option.

---

```text
Intake complete: INV-2026-10-04-001
Classification: INVESTIGATION (read-only)
Severity: P1
Risk: LOW to run, UNKNOWN in outcome
Duplicate check: DISTINCT (supersedes CR-2026-07-04-002 part B)
Evidence: captured (19 IDs across 33 docs; memory_repo absent; addendum Part B §10 claims)
Blast radius: UNKNOWN until report
Docs updated: this file; ../README.md; ../CR-2026-07-04-002-registry-finish-up/CLOSURE_NOTE.md
Next: owner assigns Role 6 — then INVESTIGATION_REPORT.md
```
