# CONTRACT v1.1 — proposal to the Tech Dashboard agent

**From:** Scan & Order (customer app) agent · **Date:** 2026-10-05
**To:** Tech Dashboard agent / Abhishek Jain (owner)
**Re:** three additions to `registry-sheet-contract.md` v1 (2026-10-05)
**Status:** PROPOSAL — v1 remains in force; Scan & Order is building against v1 as-is

---

## Why this exists

Scan & Order is the first project to implement contract §5 (the two-way Status path and the Change
Log). Three gaps surfaced that are **not** Scan & Order-specific — every project hits them the moment
it implements §5. Raising them once, here, rather than five times in five pods.

None of these block Scan & Order. We have workarounds inside v1 for all three. They are proposed
because the workarounds are each slightly worse than a small contract change would be.

---

## P1 — `Decision` has no state meaning "owner approved, not yet applied"

**The gap.** §5.3 reads: *"Only the owner approves a Change Log entry. On approval the agent applies
it to the registry and marks the row APPLIED."* But §5's `Decision` enum is
`PENDING / APPLIED / REJECTED`, and `APPLIED` is the **agent's post-application mark**. There is no
value the owner can write that means *"I approve — go ahead"*.

So as written, approval must happen **outside the sheet**, which means the sheet records *that* an
edit was applied but never *that the owner authorised it, or when*. For a document whose whole
purpose is to be the auditable human-facing mirror, that is a hole.

**Proposal.** Add one value:

```
Decision: PENDING / APPROVED / APPLIED / REJECTED
```

`PENDING` (agent writes) → `APPROVED` (**owner** writes) → `APPLIED` (agent writes, stamps
`Decided at`). `REJECTED` unchanged. One extra enum value, no new column, no change to the
dashboard's read path, and §5.3's sentence becomes literally implementable.

**Scan & Order's v1 workaround:** the owner has chosen to approve **in chat**. We will implement that.
It works, and it keeps v1 untouched — the only loss is that the approval trail lives in a chat log
rather than in the tracker.

---

## P2 — money-path items are not machine-readable

**The gap.** Scan & Order flags items that touch customer money (delivery charges, surcharges,
rounding) — currently 7 of 78. The contract has no column for it, so under v1 the only compliant
homes are free text (`Status note` / `Notes`) or a count on the Summary tab.

Free text cannot be filtered or aggregated. A count on Summary cannot be drilled into. Neither lets
§8's dashboard answer the one question an owner actually asks about this class of item:

> *"Show me every item across POS, CRM, Inventory and Scan & Order that touches customer money and
> isn't closed."*

That question matters far beyond Scan & Order — POS, CRM and Inventory are the systems that *move*
the money. A customer-facing ordering app is arguably the least consequential of the four.

**Proposal.** Add one column, machine-readable and consistent with the existing `Code markers` style:

| # | Column | Required | Values | Who writes |
|---|---|---|---|---|
| 22 | Money path | no | `YES` / `no` | agent |

Appending as column 22 keeps all existing column positions stable, so no project has to re-lay-out
its sheet. Projects with no money-path concept simply write `no`.

**Scan & Order's v1 workaround:** the owner has chosen a **count on the Summary tab** (in the
`Trust indicators` block). Compliant with v1, and the flag stays in `index.yml` regardless — so if
this proposal is accepted, Scan & Order can populate column 22 with no backfill work.

---

## P3 — 🔴 `Edited by (if known)` cannot be populated. Recommend removing or redefining it

**This one is a capability limit, not a preference.** It was verified against Google's own
documentation rather than assumed.

The Change Log spec includes `Edited by (if known)`. There is **no Google API that can attribute a
spreadsheet cell edit to a person**:

- The **Sheets API** returns values only. `values.get` and `values.batchGet` carry no author metadata
  at any granularity.
- The **Drive Activity API v2** — the obvious candidate — *"does not support per-cell granularity for
  spreadsheet edits"*. Its data model identifies the `Target` as **the file**, not a cell or range.
  It reports only that an `Edit` action occurred on the file, and it **consolidates** multiple edits
  into a single activity record summarising that one or more users edited the file over a time span.
  `activity.query` cannot filter by cell.
  (`developers.google.com/workspace/drive/activity/v2/datamodel`)

So the best any agent can ever produce is: *"this file was edited by one of {A, B} somewhere in this
time window"* — then guess which of the window's editors made which cell change. With a single
editor it is trivially "the owner" and tells you nothing; with several it is **a guess presented as
an audit field**, which is worse than blank.

Getting even that requires the `https://www.googleapis.com/auth/drive.activity.readonly` scope —
which grants activity-history read access across the **whole Drive**, not just the one sheet, plus
enabling another API and a fresh consent round in every project.

**Proposal — pick one:**
1. **Remove `Edited by` from the Change Log columns.** Cleanest. The column can never be filled
   honestly, and an audit field that is always blank or always inferred erodes trust in the rest.
2. **Redefine it** as `Edited by (file-level, best effort)`, explicitly documented as the set of
   accounts that edited the file in the diff window — not an attribution of the specific cell. Only
   worth the broad Drive scope on genuinely multi-editor sheets.

**Recommendation: option 1.** If per-edit attribution is genuinely needed, the right mechanism is
P1's `APPROVED` — the owner typing approval into a cell *is* an attributable, deliberate act,
recorded in the sheet, needing no extra scope at all. P1 solves the accountability problem that
`Edited by` was reaching for, and solves it properly.

---

## P4 — 🔴 `Assignee` on stage tabs: §2 and §3 cannot both be satisfied

**This is a defect in v1, not a preference, and every project will hit it.**

Two rules collide:

- **§2:** *"Stage tabs carry the same columns as All Items, filtered."*
- **§3, column 13:** *"Agent never writes **or clears** this column."*

Stage tabs are **derived** — rebuilt every run, and an item moves between them as its Status changes.
So a value in column 13 of a stage tab is bound to a **row position**, not to an item. If the agent
may not touch it, last run's assignee stays at row 5 while a *different item* now occupies row 5.
The sheet then displays a real person's name against work they were never given.

Every available option breaches something:

| | Behaviour | Breach |
|---|---|---|
| i | never touch column 13 on stage tabs | stale names shown against the wrong items — actively misleading, and the only option that produces **false data** |
| ii | write column 13 blank on stage tabs | breaches §3's "or clears", literally read |
| iii | omit column 13 from stage tabs | breaches §2's "same columns" |

**Proposed wording change in §3, column 13 — six words:**

> Who writes: *owner / dashboard only. **On `All Items`,** the agent never writes or clears this
> column. On derived stage tabs the agent writes it blank.*

**Rationale.** §8 states the dashboard *"reads All Items from each of the five sheets"* and
*"writes only the Assignee column"* — so `All Items` is the only tab where an assignee is ever
authored or consumed. Protecting it there is the entire intent of the rule. Extending that protection
to disposable filtered views does not protect anything; it manufactures wrong data. **A blank cell is
honest; a stale cell is a lie.**

Scan & Order is implementing (ii) under this proposed reading, with owner approval (2026-10-05).

---

## Note — Scan & Order narrows §5.5 to `Status` only

Not a proposed change; recorded so the dashboard agent knows what this project accepts.

§5.5 permits `Status` **plus the three date columns** to be accepted from the sheet. The Scan & Order
owner has confirmed dates will never be hand-edited, so this project accepts **`Status` only**. The
three date columns are agent-written and excluded from the diff entirely.

This is a **reduction** in accepted surface, so it cannot break the dashboard or any other project.
It also removes a latent defect worth flagging to the others: `Last updated` is simultaneously
(a) accepted from the sheet and (b) rewritten by the agent whenever any edit is applied — so
accepting an edit to it updates it again, producing a self-feeding diff. Any project implementing
§5.5 in full will need a rule for that.

---

## P5 — `PARKED` sits on the `Closed` tab, which hides items that are merely waiting

**Found while adjudicating all 78 Scan & Order items against v1.** Not a contract change — a wording
clarification that would prevent every project making the same mistake.

§2 routes the `Closed` tab to **`CLOSED`, `PARKED` and `DUPLICATE` together**. So the moment an item
is marked `PARKED` it leaves the active pipeline and sits beside genuinely finished work.

That is correct for a real decision to stop. It is **wrong for an item waiting on an answer** — which
is how "parked", "deferred" and "held" are used in practice in day-to-day registry prose. Applied
naively, Scan & Order would have marked **4 items** `PARKED`, and 3 of them were simply blocked:
one on a POS data backfill, two on owner decisions. All 3 would have disappeared into `Closed` while
still needing someone to act.

§4 already prescribes the right treatment for those: *"BLOCKED is not a Status. A blocked item keeps
its real stage and gets a `Blocked on` party."* The gap is that nothing connects that rule to
`PARKED`, so the two read as alternatives rather than as a rule and its misuse.

**Proposed clarification in §3, column 5 (or §4):**

> `PARKED` means a deliberate decision to stop, with a stated condition for re-opening. An item that
> is merely waiting on a person or another team is **not** parked: it keeps its real stage and gets
> `Blocked on` set, per §4.

**Effect at Scan & Order after applying this:** 4 `PARKED` → **1**, with 3 items correctly surfacing
on the `Blockers` tab. For a dashboard whose job is showing what's stuck, that is the difference
between seeing 3 blocked items and seeing none.

---

## Summary

| # | Proposal | Change | Blocks Scan & Order? | v1 workaround in use |
|---|---|---|---|---|
| P1 | `APPROVED` as a 4th `Decision` value | +1 enum value | no | owner approves in chat |
| P2 | `Money path` as column 22 | +1 column, appended | no | count on Summary |
| P3 | Remove or redefine `Edited by` | −1 column, or reworded | no | will be left blank |
| **P4** | **Scope §3's Assignee rule to `All Items`** | **6 words in one cell** | **no** | **blanking on stage tabs, per owner ruling** |
| **P5** | **Clarify `PARKED` = decision to stop, not "waiting"** | **wording only** | **no** | **applied already — 4 `PARKED` became 1** |

P1–P3 are additive or subtractive at the edges. **P4 and P5 are correctness fixes** — under v1 as
written, every project's stage tabs will display assignees against the wrong items (P4), and every
project will bury blocked work on the `Closed` tab (P5). None of the five changes an existing column
position, none alters §8's dashboard read path, and none requires any project to re-lay-out a sheet.

### Also worth settling centrally

§6 says: *"Plus one line: `Generated <ISO timestamp>` and `Pending change-log rows: N`."* It is
ambiguous whether that is one line carrying both or one line each. Scan & Order is using **two
separate lines** (owner ruling, 2026-10-05). If the dashboard parses that region, the five projects
should agree.

---

## Self-validation of this proposal — 2026-10-05

Checked against `registry-sheet-contract.md` v1 after the rulings were drafted. Two defects found in
**this proposal**, both corrected here.

### Correction 1 — P4 is incomplete: §5.6 must be amended too

P4 as drafted (and as worded by the dashboard agent) amends **§3 only**. But §5.6 states:

> *"`Assignee` is excluded from the diff entirely: the agent neither reads nor writes it."*

P4's fix requires the agent to **write blanks** into column 13 on stage tabs. That directly
contradicts §5.6's "neither reads nor writes". Amending §3 alone would leave v1.1 **internally
inconsistent**, and a later reader would be entitled to follow §5.6 and reintroduce the stale-name
bug.

**§5.6 needs the same scoping:**

> `Assignee` is excluded from the diff entirely: the agent never reads it, and never writes or clears
> it **on `All Items`**. On derived stage tabs the agent writes it blank.

Two clauses, one fix. Flagged because a half-applied correctness fix is worse than none — it reads as
settled while still being contradictory.

### Correction 2 — the stated reason for "two lines" was wrong

The argument offered was that a single line *"will break the first time someone's locale formats a
date differently"*. **That is incorrect.** §6 specifies an **ISO timestamp**, which is
locale-independent by definition. The objection does not apply.

The recommendation stands, on sounder grounds:
1. The two values have different lifecycles — `Generated` changes on every run; `Pending
   change-log rows: N` is an **action count** that should drive behaviour when non-zero.
2. Two labelled rows are addressable as fixed cells. One combined line must be string-split, so any
   change to the separator or the label breaks every consumer at once.

### Verified correct

| Claim | Check | Result |
|---|---|---|
| `Edited by` is a Change Log column, not one of the 21 | §5 change-log column list vs §3's 21 | **correct** — it is Change Log column 6; removing it cannot affect the `All Items` read |
| `Money path` can be column 22 without shifting anything | §3 ends at 21 | **correct** |
| `Sprint` is the right home for wave scheduling (P5 addition) | §3 column 10: *"sprint / wave key"* | **correct** |
| `Decision` enum is `PENDING / APPLIED / REJECTED` | §5 | **correct** — `APPROVED` is genuinely absent |
| The `Last updated` loop is real | §5.5 accepts it from the sheet; §3 col 15 is agent-written; §4 defines it as *"date of the last registry change"* | **correct** — accepting an edit to it constitutes a registry change, which updates it again |

## Acceptance checklist for v1.1 when issued

To be run against the revised document before Scan & Order treats it as final:

1. §3 column 13 — Assignee rule scoped to `All Items`, **and** "owner / dashboard only" retained.
2. **§5.6 scoped to match §3** (Correction 1). *If only one of the two is changed, v1.1 is not accepted.*
3. §4 — `PARKED` defined as a deliberate stop with a re-open condition; blocked items keep their real
   stage; **and** later-wave scheduling expressed via `Sprint`.
4. §5 — `Decision` enum reads `PENDING / APPROVED / APPLIED / REJECTED`, with `APPROVED` defined as
   owner-written and `APPLIED` as agent-written.
5. §5.3 — rewritten so the approval step references `APPROVED` rather than implying the owner writes
   `APPLIED`.
6. §3 — `Money path` present as column **22**, values `YES` / `no`, and columns 1–21 **unchanged in
   order and number**.
7. §5 — `Edited by (if known)` removed from the Change Log column list, leaving **8** columns.
8. §6 — two separate lines specified, each with a stable label.
9. §5.5 — `Last updated` either excluded from the accepted set or declared agent-computed-only.
10. A statement that **empty stage tabs are valid** (S&O's `QA` tab is legitimately empty).
11. A statement defining the **back-catalogue interim** for a required `Status` during adoption.
12. §7 and §8 unchanged — ID scheme and the dashboard read path must not move.
13. Version header reads **v1.1** with a date, and v1 is retained or referenced so diffs are auditable.

Items 1–2 and 3 are the correctness fixes; 9–11 are the gaps the ruling sheet omitted. If any of
1, 2, 3 or 9 is missing, the defect that prompted the proposal survives into v1.1.

---

# VALIDATION OF v1.1 — 2026-10-06

Run against the 13-point acceptance checklist above. **Verdict: 11 of 13 PASS. Accepted with
2 defects and 1 pre-existing contradiction logged — none blocks Scan & Order from building.**

v1.1 stored as `registry-sheet-contract.md`; v1 archived as `registry-sheet-contract-v1.0-archive.md`.

## Checklist results

| # | Check | Result |
|---|---|---|
| 1 | §3 col 13 Assignee scoped to `All Items`, *"owner / dashboard only"* retained | ✅ **PASS** |
| 2 | **§5.6 scoped to match §3** (Correction 1) | ✅ **PASS** — *"neither reads nor writes it on `All Items`, and always writes it blank on stage tabs"*. The internal contradiction is gone |
| 3 | §4 `PARKED` = deliberate stop + re-open condition; blocked keeps real stage; **later-wave via `Sprint`** | ✅ **PASS** — all three clauses present |
| 4 | `Decision` enum reads `PENDING / APPROVED / APPLIED / REJECTED`, each defined | ✅ **PASS** |
| 5 | **§5.3 rewritten so approval references `APPROVED`** | ❌ **FAIL — defect A** |
| 6 | `Money path` = col 22; cols 1–21 unchanged in order and number | ✅ **PASS** — verified position-by-position against v1 |
| 7 | `Edited by` removed; Change Log has **8** columns | ✅ **PASS** |
| 8 | §6 two separate lines, each with a stable label | ✅ **PASS** |
| 9 | §5.5 `Last updated` excluded or agent-computed-only | ✅ **PASS** — stated twice (§3 col 15 and §5.5), with the reason recorded |
| 10 | Empty stage tabs declared valid | ✅ **PASS** — and it cites the QA-empty case directly |
| 11 | Back-catalogue interim defined | ✅ **PASS** — §4, and it standardises **"Unrouted"** centrally |
| 12 | §7 and §8 unchanged | ⚠️ **§8 CHANGED — correctly.** *"writes only the Assignee column **on All Items**"*. An unrequested but correct propagation of P4; §7 untouched |
| 13 | Header reads v1.1 with a date; v1 auditable | ✅ **PASS** — changes enumerated in the header; v1 archived locally |

## Defect A — §5.3 still does not say how the owner signals approval ❌

§5 now *defines* `APPROVED` as *"owner has authorised the change; agent has not yet applied it"*. But
**§5.3 was not rewritten** and still reads:

> *"Only the owner approves a Change Log entry. On approval the agent applies it to the registry and
> marks the row APPLIED."*

So the state exists in the enum while the **procedure still jumps straight from "approves" to
`APPLIED`**, and nothing anywhere says the owner *writes* `APPROVED` into the cell. **This was the
entire point of P1** — the gap it was raised to close is still open, now with an orphaned enum value
rather than a missing one. An implementer reading §5.3 alone would never write `APPROVED` at all.

**Suggested §5.3:**

> Only the owner approves a Change Log entry. The owner records the decision by setting `Decision` to
> `APPROVED` (or `REJECTED`). On seeing `APPROVED` the agent applies the change to the registry,
> sets `Decision` to `APPLIED` and stamps `Decided at`. On seeing `REJECTED` the agent reverts the
> sheet cell to the registry value on the next push.

## Defect B — §1 contradicts §5.5 on the two-way surface ❌

§1: *"The sheet is **two-way for Status only**."*
§5.5: *"only **Status**, **Registered** and **Closed** date columns are accepted from the sheet."*

Three columns are accepted, not one. **This contradiction pre-dates v1.1** — v1 said "Status only" in
§1 while accepting Status plus three dates in §5.5 — but editing §5.5 without touching §1 has made it
sharper. §1 is the sentence a reader meets first.

**Suggested §1:** *"The sheet is two-way for Status and the `Registered` / `Closed` dates only (see
§5.5)…"*

Harmless for Scan & Order, which accepts `Status` only and is therefore compliant with the stricter
reading of both. It will mislead whoever implements next.

## Defect C (minor) — the Change Log has no who-writes specification

§3 states a "Who writes" rule for all 22 columns. The Change Log's 8 columns have none, yet
`Decision` is now written by **both** parties at different times. Suggest noting explicitly:
`PENDING` and `APPLIED` are **agent**-written; `APPROVED` and `REJECTED` are **owner**-written;
`Decided at` is agent-written.

## What v1.1 changes for Scan & Order

| # | Consequence | Action |
|---|---|---|
| 1 | **`Money path` is now a real column (22).** The F5 ruling (count only, index-only) is **obsolete** — the 7 money-path items can be named per-row and the dashboard can filter them across all five projects | drop the F5 workaround; populate col 22 |
| 2 | **`APPROVED` now exists.** The F1 ruling (approve in chat, no sheet trail) can be upgraded to an in-sheet, attributable approval at no cost — **pending Defect A, which currently leaves the mechanism undefined** | owner to reconsider F1 once Defect A is fixed |
| 3 | **"Unrouted" is now contract-standard** (§4 + §6). SO's X3 deviation is **ratified centrally** and is no longer a local divergence. Moot in practice — SO now has **0** unrouted | remove X3 from the deviation list |
| 4 | **🔴 15 items now require a `Closed` date we do not hold.** §3 col 16 makes it required when Status is CLOSED/PARKED/DUPLICATE — that is SO's 13 `CLOSED` + 1 `PARKED` + 1 `DUPLICATE`. Our index has no `closed` values | derive from the item's last gate date where a document supports it; the remainder are owner fills per §3 |
| 5 | **`Registered` and `Closed` are accepted from the sheet** under §5.5, which is wider than SO's `Status`-only ruling. SO stays narrower — permitted, and it conveniently makes the 3 missing `Registered` dates and the 15 missing `Closed` dates fillable by the owner directly in the sheet | optionally revisit: accepting those two date columns would let the owner fill 18 gaps in-sheet |
| 6 | The **`Trust indicators` 4th Summary block remains a local deviation** — §6 still specifies three blocks. Safe under §8 (dashboard reads `All Items` only) | keep declared |

**Net effect on the build:** no change to the 19 planned changes beyond populating column 22 and
sourcing `Closed` dates. The two layout corrections SO had been carrying as workarounds (P4, P5) are
now contract text, so the implementation follows the contract directly rather than deviating from it.

---

## Owner rulings on the v1.1 validation — 2026-10-06

| Ref | Ruling |
|---|---|
| Defects A, B, minor | **Send all three back as a v1.1.1 patch.** Request drafted for the owner to forward |
| 18 missing dates | **Stay `Status`-only.** Do not widen acceptance to `Registered`/`Closed`. Agent derives `Closed` from each item's last gate date where a document supports it; the remainder come to the owner as explicit requests |
| `Money path` col 22 | **Populate it.** Supersedes the F5 count-only ruling. The 7 candidates from `IMPACT_ANALYSIS.md` §16.1 are adopted — see below |

### The 7 money-path items, cross-referenced against the adjudicated statuses

| Item | Why money-path | Adjudicated status |
|---|---|---|
| `BUG-2026-02-XX-001` | delivery charge renders as zero — live P1 | `SMOKE` |
| `CR-2026-02-XX-002` | takeaway surcharge, shipped estate-wide, approval never given | `IMPLEMENTED` |
| `CR-2026-06-17-004` | delivery **GST** key — tax on the total | `IMPLEMENTED` |
| `CR-2026-04-11-001` | order placement fixes — **no QA artefact exists** | `IMPLEMENTED` |
| `CR-2026-02-XX-001` | wraps the **Razorpay** write in a 15 s timeout | `SMOKE` |
| `CR-2026-10-04-005` | surcharge scope deviation | `INTAKE` |
| `INV-2026-07-03-001` | order-create **idempotency** — double-charge exposure | `CLOSED` |

**🔴 Only 1 of the 7 is closed.** Three are built but never owner-verified, two are waiting in the
owner's smoke queue, one has not been started. Six of the seven things in this registry that can
change what a customer is charged are unverified or unstarted — a figure that was invisible before
column 22 existed.

**Carried over from §16.1 and still unresolved:** `round_up_payload_gap_investigation` scored 56 on
money-path keyword density but is **one of the two folders with no ID**, so it cannot be indexed and
therefore cannot be tagged. It is a money item that is structurally invisible to the registry. Fix is
to assign it an ID.
