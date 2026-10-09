# INTAKE DOC — CR-2026-10-04-004

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-04-004 |
| **Title** | Registry reconciliation — 23 items exist on disk with no registry row; 15 code markers reference unregistered IDs |
| **Classification** | **CR** — documentation / process integrity |
| **Date Registered** | session after 2026-10-03 |
| **Reported By** | Owner, after reviewing the full CR listing |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Severity** | **P1** — §10.1 forbids work without a registered ID, and 23 items are invisible |
| **Risk** | **LOW** — documentation only; no application code in scope |
| **Status** | 📝 REGISTERED → executing backfill under owner approval (same session) |
| **Blast radius** | SMALL in effect, LARGE in visibility — the registry is the project's only index |

## 1. Problem

`change_requests/README.md` is the single registry. Measured this session:

```
registry rows:              52   (47 CR + 5 INV)
ID-shaped folders on disk:  74
non-conforming folder names:  2
```

**23 items have a complete folder — intakes, plans, QA handovers — and no registry row.**

| Type | Count | IDs |
|---|---|---|
| CR | 12 | `02-XX-001`, `02-XX-002`, `04-11-001`, `05-30-001`, `05-30-002`, `06-17-001…004`, `08-06-001`, `09-07-001`, `09-08-001` |
| INV | 7 | `06-17-001…003`, `07-03-002`, `07-03-003`, `09-10-001`, **`10-03-001`** |
| BUG | 3 | `02-XX-001`, `09-08-001`, `09-10-001` |
| PROD-INCIDENT | 1 | `2026-07-02` (folder name contained a colon) |

Only one registry row lacks a folder — `CR-2026-07-03-006`, the tombstone. That one is correct.

## 2. Why it matters, beyond tidiness

**`INV-2026-10-03-001` was unregistered.** That is the UAT secrets and PII exposure
investigation — a static live CRM credential in preprod and real customer PII, including 114
`customer_documents`, in a shared UAT database. The most serious security finding in the project
was invisible to anyone reading the registry.

**Two live P1s on the money path were unregistered.** `BUG-2026-02-XX-001` (delivery charge never
calculated, five fix rounds, one **failed owner smoke on 2026-07-13**, currently awaiting another)
and `CR-2026-02-XX-002` (takeaway surcharge — see §5).

**§10.1 is unenforceable while this gap exists.** "No work without registered ID" cannot be
checked against a registry that is missing a third of its items.

## 3. Audit findings (§10.6 — *"Audit must flag code that exists without a matching registered item"*)

### F1 — 15 IDs carry live code markers but had no registry row

`BUG-2026-02-XX-001`, `BUG-2026-09-08-001`, `BUG-2026-09-10-001`, `CR-2026-02-XX-001`,
`CR-2026-02-XX-002`, `CR-2026-05-30-001`, `CR-2026-05-30-002`, `CR-2026-06-17-001…004`,
`CR-2026-08-06-001`, `CR-2026-09-07-001`.

### F2 — one ghost ID

`INV-2026-08-06-001` appears in a code marker and has **no folder and no row anywhere**. It exists
only as a comment. Origin unknown; recorded rather than guessed at.

### F3 — status drift inside `CR-2026-02-XX-001`

`CR.md` says *"REGISTERED — Planning stage (Role 2)"*. `QA_HANDOVER.md` in the same folder says
*"✅ IMPLEMENTED + testing_agent VERIFIED — 5/5 PASS — awaiting owner smoke"*, and the code markers
confirm it shipped. Registry row records the QA_HANDOVER state, per R1 (code is truth).

### F4 — `CR-2026-02-XX-002` shipped a different design than its intake, without its approval

Split out as **CR-2026-10-04-005** because it affects money shown to customers. See §5.

### F5 — `/app/memory_repo` is absent and the registry's own ID-Scheme section points into it

README lines 32–35 link to `/app/memory_repo/BUG_TRACKER.md` and
`BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`. Neither exists. Owner ruling: **`/app/memory` is
canonical**. Registry section corrected under this CR. The *operating prompt's* equivalent section
(addendum Part B §10) is also stale, but editing the prompt needs owner approval (§7) — a draft was
produced and the owner has **held** it for review. Not applied.

### F6 — `CR-2026-07-03-010` is marked ✅ SHIPPED but its job is incomplete

That CR was "Registry hygiene & ID-scheme canonicalization". After it shipped, three `XX`-day IDs
remain, a colon-bearing folder name remained until this session, and 23 items were unregistered.
Recorded as a fact, not re-opened.

### F7 — 19 legacy `BUG-NNN` IDs survive as cross-references with no status source

`BUG-001, 002, 003, 005, 006, 007, 008, 010, 011, 020, 035, 039, 040, 041, 043, 044, 047, 048, 050`
across 33 documents. The tracker that held their status is gone. Split out as
**INV-2026-10-04-001**.

## 4. Scope

**IN:** backfill 23 registry rows with statuses taken verbatim from each folder's own documents ·
correct the registry's own deprecated `memory_repo` links · rename the colon-bearing
PROD-INCIDENT folder and its 5 references · record F1–F7 · close `CR-2026-07-04-002` per §15 with
the owner's accepted exception.

**OUT:** application code of any kind · the operating prompt and addendum (owner holding the draft)
· renaming the three `02-XX` IDs (owner decision: register as-is; 22 code markers across 4 hotspot
files, and the February day was never recorded so any rename would invent a date) · changing any
item's substance · closing anything other than `CR-2026-07-04-002`.

## 5. Owner decisions taken at intake

| # | Decision |
|---|---|
| D-R1 | Backfill all 23 rows — approved as scoped |
| D-R2 | `02-XX` IDs: **register as-is**, canonicalisation as a separate CR later if ever |
| D-R3 | PROD-INCIDENT folder: **rename now** → `PROD-INCIDENT-2026-07-02-001-atlas-slowness-frozen-tab`, 5 references updated |
| D-R4 | Unverified items keep their own wording: `IMPLEMENTED — QA PENDING (unverified since <date>)` |
| D-R5 | `/app/memory` is canonical; `memory_repo` deprecated |
| D-R6 | `CR-2026-07-04-002`: **close under §15 with owner-accepted exception** |
| D-R7 | Addendum §10 correction: **drafted, held for owner review** — not applied |
| D-R8 | Register the takeaway-surcharge deviation as its own item → CR-2026-10-04-005 |

## 6. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| `CR-2026-07-03-010` registry hygiene | Same domain, marked SHIPPED, left this drift behind (F6) | **DISTINCT** |
| `CR-2026-07-04-002` registry finish-up | Targets only `memory_repo` artefacts, which are deprecated | **DISTINCT** — closed under this pass |

**Verdict: DISTINCT.** My earlier claim that `CR-2026-07-04-002` part B covered these 12 missing
rows was wrong and is withdrawn — part B concerns `BUG-011…050` in a different tracker.

## 7. Role note

Registering unregistered items is Role 1. However *"reconcile code-vs-registry drift"* is formally
**Role 11 Closure, step 4**. §144 directs taking the earliest applicable role, so Intake carries
this pass, but a full Closure session across all 78 rows remains available to the owner.

---

```text
Intake complete: CR-2026-10-04-004
Classification: CR (documentation / process integrity)
Severity: P1
Risk: LOW (docs only)
Duplicate check: DISTINCT
Evidence: captured (row/folder counts, 15 code markers, 7 audit findings F1–F7)
Blast radius: SMALL in effect, LARGE in visibility
Docs updated: this file; ../README.md; ../CR-2026-07-04-002-registry-finish-up/CLOSURE_NOTE.md; ../../PRD.md
Next: owner review of the addendum §10 draft; optional Role 11 Closure pass
```
