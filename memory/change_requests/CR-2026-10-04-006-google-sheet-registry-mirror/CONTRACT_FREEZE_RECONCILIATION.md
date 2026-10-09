# CONTRACT FREEZE — reconciliation of Scan & Order against registry-sheet-contract v1

**Role:** 6 — INVESTIGATION (read-only; no code written) · **Date:** 2026-10-05
**Contract:** `memory/control/registry-sheet-contract.md` v1 · 2026-10-05
**Brief:** owner brief *"registry sheet onto the shared contract"*, 2026-10-05 (the SO delta)
**Affects:** `CR-2026-10-04-006` — to be amended in place, risk re-rated **LOW → MEDIUM** (owner ruling)
**Purpose:** establish everything that must be settled *before* the contract is frozen. Nothing is built.

---

## 0. Status of the freeze

| | Count |
|---|---|
| Questions the contract **answered** (previously blocking) | **7 of 7** |
| Contract ↔ brief contradictions found | **3** — all resolvable, §2 |
| Gaps still blocking the freeze | **5** — §4, owner rulings needed |
| Changes ready to build once frozen | **19** — §5 |

**Q1 resolved:** `Related` is column **17** and is retained — my count of 20 was missing it. The 21
columns are fully specified. Q2 (Status enum), Q3 (stage mapping), Q4 (Summary shape), Q5 (change-log
protocol), Q6 (Change Log vs `CHANGELOG.md`), Q7 (timestamp home) are all answered below.

## 1. What the contract settles

| Was blocking | Contract answer |
|---|---|
| Q1 — 21 columns, in order | §3. Full list; `Related` is #17 |
| Q2 — Status enum | §3. **8 values**, not my 13. `INTAKE / PLANNING / IMPLEMENTED / QA / SMOKE / CLOSED / PARKED / DUPLICATE` |
| Q3 — Status → stage tab | §2. Tab = Status, one-to-one. `Closed` absorbs CLOSED+PARKED+DUPLICATE. **Blockers is orthogonal** — non-blank `Blocked on`, any Status |
| Q4 — Summary shape | §6. Plain table, 3 blocks, blank row between, plus `Generated <ISO>` and `Pending change-log rows: N` |
| Q5 — change-log protocol | §5. 9 columns, `PENDING/APPLIED/REJECTED`, registry wins on conflict, Phase 1 accepts Status + 3 dates only |
| Q6 — `Change Log` tab vs `CHANGELOG.md` | **Opposite directions, both kept.** Tab = sheet→registry human edits awaiting approval. File = registry→sheet field diffs, our own audit trail. No merge; the file is out of contract scope |
| Q7 — generation timestamp | §6. Moves off the banner into the **Summary** tab as `Generated <ISO timestamp>` |

**D-G13 is superseded.** My 13-value enum (`REGISTERED`, `QA_PASSED`, `AWAITING_OWNER_SMOKE`,
`BLOCKED`, `DEFERRED`, `HELD`, `REVERTED`, `TOMBSTONE`, `REPORT_WRITTEN` …) is retired in favour of
the contract's 8. **No data migration is required** — all 78 Status cells are blank, so nothing is
being translated. The only consequence is that `STATUS_WORKSHEET.md`, which currently advertises 13
values, must be regenerated against the 8.

Note for the later adjudication, not for the freeze: six of my retired values have no obvious contract
home (`QA_PASSED` → QA or SMOKE? `TOMBSTONE` → DUPLICATE or CLOSED? `REVERTED`/`DEFERRED`/`HELD` →
PARKED or CLOSED? `REPORT_WRITTEN` → ?). These will surface during the 78-item pass. They need no
ruling now because nothing auto-translates.

**`BLOCKED` disappearing as a Status is a genuine improvement.** Under §4 a blocked item keeps its
real stage and gains a `Blocked on` party, so the pipeline funnel no longer loses items into a
dead-end bucket — which is exactly what the funnel was for.

## 2. Contract ↔ brief contradictions

| # | Brief says | Contract says | Ruling |
|---|---|---|---|
| X1 | column named `Closed date` | column 16 named **`Closed`** | **Contract wins** — acceptance demands "21 contract columns", and the dashboard reads headers |
| X2 | Summary keeps a 4th block, `Trust indicators` | §6 defines exactly **3 blocks** | **Brief wins, as an SO-local addition.** Safe: §8 says the dashboard reads **All Items only**, so Summary may diverge per project without breaking anything |
| X3 | blank-Status rows reported as `Unrouted` | Status is **required**, and §6 lists all 8 values "zero included" — `UNROUTED` is not one of them | **Brief wins as a declared, temporary deviation.** Needs to be visible as an extra Summary line, not smuggled into the Status block |

## 3. Owner rulings already received (recorded)

| Ruling | Effect |
|---|---|
| **R1 → read-merge-write**, logs required | `push` must read before writing, preserve `Assignee` and un-approved `Status`, overwrite the rest |
| **R2 → amend `CR-2026-10-04-006` in place**, risk **MEDIUM**, D-G1 superseded | the one-way founding decision is formally replaced by the §5 approval-gated two-way path |
| **R3 → "only registered CR goes in CR"** | the 19 legacy `BUG-NNN` are **excluded**. Consistent with `INV-2026-10-04-001` §5's own non-goal, so no conflict remains. CR-2026-10-04-004's 23 items need no action — already indexed |
| **R4 → build in one pass** after the freeze | no double header write, no double re-bootstrap |

## 4. 🔴 Five gaps still blocking the freeze

### F1 — How does the owner *signal* approval? (contract §5.3)

§5.3: *"Only the owner approves a Change Log entry. On approval the agent applies it and marks the
row APPLIED."* But the `Decision` enum is only `PENDING / APPLIED / REJECTED`, and **`APPLIED` is the
agent's own post-application mark**. There is no value the owner can write that means *"I approve,
not yet applied"*. As specified, either the owner types `APPLIED` before it is true, or approval
happens outside the sheet. Unresolvable from the text; needs a ruling.

### F2 — Are Status edits accepted from stage tabs, or only All Items?

§2 calls stage tabs **derived**, and `All Items` the record. But §3 marks Status *"humans may edit"*
without saying where. This matters mechanically: a stage tab is a *filter*, so changing a Status on
it makes the row belong on a different tab, and row positions shift between runs. Position-based
diffing is therefore unsafe — the diff must key on `ID` (column 2), and an edit on a derived tab is
ambiguous by construction.

### F3 — `Last updated` is required but blank for all 78

§3 marks it required, §4 defines it as *"date of the last registry change"*. All 78 are blank.
I previously refused to invent history here (uniform clone mtimes, single deploy commit) and that
still holds for *past* dates — but `index.yml` genuinely last changed on **2026-10-05**, and
`.registry_state.json` tracks every field change from now on. So seeding all 78 to `2026-10-05` is
**defensible fact, not fabrication**, and self-maintaining thereafter. Needs confirmation because it
is a one-time seeding of a required column.

Related, and already known: `Registered` is blank for 3 items (`BUG-2026-02-XX-001`,
`CR-2026-02-XX-001`, `CR-2026-02-XX-002` — the `02-XX` placeholders). §3 says *"owner fills if
missing"*, so these 3 are owner actions, not agent work.

### F4 — `Blocked on` must collapse from structured to single-valued

My `index.yml` holds `blocked_on` as a **list of objects** — `{party, ref, since}`, which is richer
than the contract's single-valued column 11, and supports multiple blockers per item. Contract
column 11 takes one party string from a fixed enum. So:
- the **party** goes to column 11,
- **`ref` and `since` have no column** and must go to `Status note` or `Notes`,
- **multiple blockers** cannot be represented. Pick first? Join with `/`? (Joining breaks the enum,
  which §3 forbids: *"anything that does not fit an enum goes into Status note or Notes"*.)

Also the enum expands: contract adds `BACKEND`, `SO`, `INV`, `INFRA` to my `POS / CRM / OWNER / OPS /
INTERNAL`. (`SO` appearing in SO's own sheet is odd but harmless.)

Every `blocked_on` is empty on all 78 today, so **nothing is lost right now** — but the rule must be
fixed before the adjudication populates them, and the Blockers tab will be empty until then.

### F5 — `money_path` has no home in the contract

Deviation D2 added `money_path` as an index field, and my old Summary counted it. The contract has no
money-path column and the brief does not mention it. The 7 money-path items are still awaiting your
ratification. Options: keep it index-only (not mirrored), surface it in `Notes`, or fold it into the
`Trust indicators` block X2 preserves. It should not silently vanish — it is the money path.

## 5. The 19 changes ready to build once frozen

| # | Change | Size |
|---|---|---|
| 1 | Drop banner; header row 1; frozen rows 2 → 1 | S |
| 2 | Re-order tabs to §2: All Items first, **Summary last** (currently Summary is first) | S |
| 3 | Add `Change Log` tab, and **exclude it from `batchClear`** — it is append-only | M |
| 4 | Replace 18 headers with the 21 contract columns in contract order | S |
| 5 | `Project` = `SO` on every row | S |
| 6 | `Severity` → `Priority`; `Wave / track` → `Sprint` (index field renames) | S |
| 7 | Add index fields `area`, `closed`, `notes`; retire `next_gate`, `badge` | M |
| 8 | Fold `next_gate` + badge text into `Status note` | S |
| 9 | `Type` derivation: 5 CRs → `BUG`; `PROD-INCIDENT` → `INCIDENT`; support `GAP` | S |
| 10 | Retire the 13-value enum for the contract's 8; regenerate `STATUS_WORKSHEET.md` against 8 | S |
| 11 | Stage tabs = Status filter, same 21 columns | M |
| 12 | Blockers tab = non-blank `Blocked on`, **any Status**, same 21 columns (replaces my party-grouped layout) | M |
| 13 | Summary → plain 3-block table + `Generated <ISO>` + `Pending change-log rows: N` | M |
| 14 | Summary extra line for `Unrouted` (X3) | S |
| 15 | Summary 4th block `Trust indicators` (X2) | S |
| 16 | **Read-merge-write `push`**: read All Items, key by `ID`, preserve col 13 and pending Status | **L** |
| 17 | Sheet→registry **diff** → append `PENDING` rows to Change Log; non-Phase-1 columns → `REJECTED` with reason | **L** |
| 18 | Apply `APPLIED` rows to `index.yml`; revert `REJECTED` cells on next push | **L** |
| 19 | Operating prompt: add **ROLE 13 — REGISTRAR** incl. the approval-gated change-log rule and never-write-`Assignee` | M |

Items 16–18 are the real work and the real risk — they are the first code in this project that
**reads** the sheet, which is precisely why R2 re-rates the CR to MEDIUM.

## 6. Re-stated run report (pre-change, measured)

| Metric | Value |
|---|---|
| Items on the sheet | **78** |
| Outstanding registrations from CR-2026-10-04-004 | **0** — all 23 already indexed |
| Unrouted (blank Status) | **78** |
| No `Registered` date | **3** (`02-XX` placeholders; owner-fill per §3) |
| Type after §4 derivation | CR **56** · INV 13 · BUG **8** · INCIDENT 1 · GAP 0 |
| Items with live code markers | 26 |
| Required columns unsatisfiable today | **4** — Status 0/78, Priority 0/78, Last updated 0/78, Registered 75/78 |

## 7. Carried forward unchanged

- **`BUG-042` carries a live code marker and is absent from `INV-2026-10-04-001`'s 19-ID list.** Still
  needs filing against that investigation. Unaffected by R3 — R3 decides registration, this is a
  defect in the surviving-ID list itself.
- **`INV-2026-08-06-001` is in `README.md` with no folder on disk.** Audit reports it every run.
- **P7 protected ranges were never built**, and change 1 removes the `READ-ONLY, edits are
  overwritten` banner — the only existing warning. After the freeze, read-merge-write makes
  overwriting *less* destructive for Status and Assignee, but columns 1–4 and 6–12 are still
  rewritten silently with nothing on screen saying so.
- **OAuth consent publishing status: still unanswered (4th ask).** If *Testing*, the refresh token
  expires every 7 days and REGISTRAR — which must run on **every** registry mutation — breaks weekly.
  This matters far more now that the sheet is on the critical path for a cross-project dashboard.

---

```text
Investigation complete: contract freeze reconciliation (amends CR-2026-10-04-006)
Root cause: n/a — specification reconciliation, not a defect
Classification: CONFIG
Confidence: HIGH — contract answered 7/7 prior blockers; 3 contradictions and 5 gaps are textual and cited
Steps used: 9/10
Evidence: memory/control/registry-sheet-contract.md · owner brief 2026-10-05 · memory/change_requests/index.yml
          memory/tools/registry_sync.py (HEADERS/route/push) · INV-2026-10-04-001/INTAKE_DOC.md §2,§5
          CR-2026-10-04-004/INTAKE_DOC.md F1 · CR-2026-10-04-006/{INTAKE_DOC,IMPACT_ANALYSIS,IMPLEMENTATION_PLAN,AUTH_AMENDMENT,QA_HANDOVER}.md
Recommendation: Owner decision on F1–F5 to freeze → then Role 2 PLANNING for the amendment (19 changes,
                3 of them a new sheet-read path) → then Role 3
Report: memory/change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/CONTRACT_FREEZE_RECONCILIATION.md
```

---

## 8. ✅ CONTRACT FROZEN — owner rulings, 2026-10-05

`registry-sheet-contract.md` **v1 is frozen** for Scan & Order. All five §4 gaps and all three §2
contradictions are settled. Build may proceed to Role 2 PLANNING.

| Ref | Decision | Consequence |
|---|---|---|
| **F1** | Approval happens **in chat**, not in the sheet | Zero contract change. `Decision` goes `PENDING` → (chat) → `APPLIED`. **Accepted loss:** the sheet records that an edit was applied, never that the owner authorised it or when. Raised as proposal P1 for v1.1 |
| **F1b** | Add the Drive Activity scope to populate `Edited by` | ⚠️ **See §9 — this is not achievable as understood. Needs re-decision.** |
| **F2** | Status edits accepted from **`All Items` only** | Stage tabs are agent-generated; human edits there log `REJECTED`, reason *"edit on a derived tab"*. Diff keys on `ID` (column 2), never on row position |
| **F3** | Seed all 78 `Last updated` to **2026-10-05** | Factual — the date `index.yml` was created. Self-maintaining from `.registry_state.json` after. The 3 `02-XX` items' `Registered` remains an **owner fill** per §3 |
| **F4** | Party in column 11; detail into **`Status note`** | Format: `BLOCKED: POS — <ref> (since YYYY-MM-DD); OWNER — <ref> (since YYYY-MM-DD)`. When several blockers exist, column 11 shows the **oldest by `since`** — factual, deterministic, surfaces the longest-standing drag. Nothing is discarded |
| **F5** | Money path = **count only**, in the `Trust indicators` Summary block | `money_path` stays an `index.yml` field, not mirrored per row. Which 7 items are flagged is not visible in the sheet, and not machine-readable for the dashboard. Raised as proposal P2 for v1.1 |
| **X1** | Column 16 is **`Closed`** (contract), not `Closed date` (brief) | Contract wins — §8's dashboard reads headers |
| **X2** | Summary keeps a 4th `Trust indicators` block | SO-local divergence. Safe: §8 reads **All Items only** |
| **X3** | Blank-Status rows reported as `Unrouted` | Extra Summary line, outside the 8-value Status block. Temporary — clears when adjudication runs |
| **R2** | Amend `CR-2026-10-04-006` in place; risk **LOW → MEDIUM**; **D-G1 superseded** | The one-way founding decision is replaced by §5's approval-gated two-way path |
| **R3** | *"Only registered CR goes in CR"* | The 19 legacy `BUG-NNN` are excluded. Matches `INV-2026-10-04-001` §5's own non-goal — conflict dissolved. CR-2026-10-04-004's 23 items need no action |
| **R4** | One pass after the freeze | No double header write, no double re-bootstrap |
| **v1.1** | Proposal approved for drafting | Written: `memory/control/registry-sheet-contract-v1.1-proposal.md` (P1 `APPROVED` · P2 `Money path` col 22 · P3 remove/redefine `Edited by`) |

**Still open, owner to check:** OAuth consent screen publishing status (Testing vs Published). Asked
4×. If *Testing*, the refresh token expires every 7 days and REGISTRAR — which must run on **every**
registry mutation per §5.1 — breaks weekly, on a sheet five projects' dashboard depends on.

## 9. 🔴 F1b must be re-decided — `Edited by` is not technically achievable

The F1b ruling was made on my framing that adding a scope *"can fill"* `Edited by`. **That framing
was wrong, and the correction is on me.** Verified against Google's documentation after the ruling:

- **Sheets API:** values only. No author metadata at any granularity.
- **Drive Activity API v2:** *"does not support per-cell granularity for spreadsheet edits."* Its
  data model's `Target` is **the file**, not a cell or range. It reports only that an `Edit` occurred,
  and **consolidates** multiple edits into one record summarising that one or more users edited the
  file across a time span. `activity.query` cannot filter by cell.
  (`developers.google.com/workspace/drive/activity/v2/datamodel`)

So the best obtainable answer is *"the file was edited by one of {A, B} within this window"* — and
attributing a given cell to one of them is **a guess rendered as an audit field**. On a
single-editor sheet it always resolves to the owner and carries no information.

The price for that: the `drive.activity.readonly` scope grants activity-history read across the
**entire Drive**, plus enabling another API and a fresh browser consent round.

**Recommendation: do not add the scope.** Leave `Edited by` blank, and rely on proposal **P1** —
the owner typing `APPROVED` into a cell is a deliberate, attributable, in-sheet act requiring no
extra scope. P1 solves the accountability problem `Edited by` was reaching for, properly. Note this
also sits oddly with the F1 ruling: F1 declined an in-sheet approval trail, while F1b sought to buy
a weaker identity signal at the cost of a broad new scope.

**Pending this re-decision, the freeze holds for every other item.** `Edited by` stays in the layout
as a blank column for contract compliance, and no new scope is requested.

---

## 10. F1b RE-DECIDED — 2026-10-05

**Owner ruling: drop the Drive Activity scope; `Edited by` stays blank.**

- No new OAuth scope requested. The token continues to hold `…/auth/spreadsheets` only.
- No second browser consent round.
- No Drive-wide activity-history access.
- `Edited by (if known)` remains in the Change Log layout as a permanently blank column, for
  contract compliance. Proposal **P3** (remove or redefine it) stands with the dashboard agent.

**§4 and §9 are now fully closed. The freeze is complete** — every gap is settled and no contract
question blocks Scan & Order.

**Owner ruling on sequencing:** *"till contract is finalized no planning, but draft as
investigation."* So Gate 3 stays shut. The technical design for the 19 changes is authored as a
**Role 6 investigation draft** — `AMENDMENT_DESIGN_DRAFT.md` — explicitly **not** an
`IMPLEMENTATION_PLAN.md` and explicitly **not** a Gate 3 artefact. It converts to one only after the
contract is finalised (i.e. the dashboard agent rules on v1.1 P1/P2/P3) and the owner opens Role 2.

---

## 11. Owner rulings round 2 — 2026-10-05

> **Role 6 note:** the step budget (10) is exceeded — the owner's *"how u suggest"* questions required
> three further read-only measurements (`last_updated` derivability, README status-word coverage,
> status-class grouping). Treated as an owner-granted extension. Still **no code written**.

| Ref | Ruling | Effect |
|---|---|---|
| **Token expiry** | Owner: *"no it wont"* — consent screen is not in Testing | Accepted and recorded as an owner assertion. **Mitigation retained:** the tool will report a dead/expired token as a loud, named failure rather than a silent no-op, so if the assertion is ever wrong it surfaces immediately instead of quietly serving a stale sheet to the dashboard |
| **OPEN-3** (2b) | Only `Status` will be hand-edited, to values like SMOKE / CLOSED, **for the agent to validate** | Human-typed Status **persists on screen** while `PENDING`. §5.4's "registry wins" narrows to a true concurrent conflict: it fires only if the registry's own value for that same field changed in the same cycle, in which case the cell reverts and the log row carries the reason. **New requirement:** the agent *validates* the typed Status against evidence (artefacts present, code markers live) and records agreement or disagreement in the Change Log `Note` |
| **OPEN-4** (2c) | Owner: *"no we will not edit"* dates | **Phase 1 accepts `Status` only.** The three date columns are excluded from the diff and are agent-written. The self-feeding-diff problem **dissolves entirely**. This is *narrower* than §5.5 (which accepts Status + 3 dates) — a reduction in surface, therefore safe, but recorded as an SO deviation so the dashboard agent knows |
| **F3 superseded** (3) | `Last updated` = the item's **last gate date**, not a blanket seed | **Verified derivable 78/78.** Taken as the latest in-document date across each item's own `.md` files. Month distribution (May 1 · Jun 5 · Jul 18 · Sep 33 · Oct 21) matches the project's real activity waves, and `BUG-2026-02-XX-001` resolves to `2026-07-14`, independently corroborating the known July smoke failure. **Caveat:** a document quoting a future or planned date could overshoot; any derived date later than the session date will be flagged, not silently accepted. Strictly better than the earlier blanket `2026-10-05` seeding, which is withdrawn |
| **78 statuses** (3) | Owner: derive from registry or last implementation | **Verified: all 78 carry a recognisable status word in `README.md`.** Grouping them collapses 78 item-level decisions into **16 classes, of which 10 map unambiguously and ~6 need an owner ruling**. See §12 |
| **OPEN-1** (2a) | Owner asked for a recommendation | See §12.2 — recommend the column stays present but **always blank** on derived tabs |
| **Registry items** (4) | *"as u suggest"* | `INV-2026-08-06-001`: inspect its README row; create a folder if there is real content, else mark `DUPLICATE` with the origin recorded. `BUG-042`: file as an amendment finding against `INV-2026-10-04-001`. **Both held** until the contract is final, per the owner's sequencing instruction |
| **Sequencing** | *"first we freeze contract then move to anything"* | No build, no registry writes. Contract finalisation is the only live workstream |

## 12. Suggestions requested by the owner

### 12.1 The 78 statuses — 16 classes, ~6 real decisions

Status word found in `README.md`, grouped, with the count of items that have **live code in
production**:

| README says | Items | Code live | Proposed contract Status | Needs a ruling? |
|---|---|---|---|---|
| REGISTERED | 22 | **3** | `INTAKE` | no |
| CLOSED | 12 | 4 | `CLOSED` | no |
| QA | 8 | 8 | `QA` | no |
| INVESTIGATION | 8 | 0 | `INTAKE` or `PLANNING`? | **yes** |
| SMOKE | 7 | 5 | `SMOKE` | no |
| SHIPPED | 5 | 3 | `CLOSED` or `SMOKE`? | **yes** |
| PARKED | 4 | **1** | `PARKED` | no |
| DEFERRED | 4 | **2** | `PARKED` | no |
| IMPLEMENTED | 1 | 0 | `IMPLEMENTED` | no |
| PLANNED | 1 | 0 | `PLANNING` | no |
| HELD | 1 | 0 | `PARKED` | no |
| REVERTED | 1 | 0 | `CLOSED` or `PARKED`? | **yes** |
| TOMBSTONE | 1 | 0 | `DUPLICATE` or `CLOSED`? | **yes** |
| AUDIT | 1 | 0 | `QA` or `IMPLEMENTED`? | **yes** |
| REPORT WRITTEN | 1 | 0 | `CLOSED` or `IMPLEMENTED`? | **yes** |
| nothing recognisable | 1 | 0 | individual look | **yes** |

**The single highest-value ruling is `SHIPPED` (5 items).** The contract reserves `CLOSED` for
*"owner verified / subsumed / resolved"*. "Shipped" means the code is live — which is not the same as
the owner having verified it. If shipped-but-unverified maps to `SMOKE`, those 5 land in your
smoke-test queue rather than being quietly counted as done.

**🔴 Six items contradict themselves and need individual attention regardless of class:** 3 marked
REGISTERED, 1 PARKED and 2 DEFERRED **have live code markers in production**. Work recorded as
not-started or shelved, with code shipped for it. This is exactly the tripwire the registry exists to
catch, and it is a finding in its own right — independent of the sheet layout.

### 12.2 OPEN-1 recommendation — Assignee on derived tabs

Keep the column **present on every tab** (satisfying "same columns"), and have the agent write it
**blank on the derived stage tabs only**, never touching it on `All Items`.

Rationale: the stage tabs are disposable filtered views rebuilt every run, so a value left in place
there is attached to a *row position*, not to an item — meaning the next run displays it beside a
different item. **A blank cell is honest; a stale cell is a lie.** `All Items` remains the single
place an assignee lives, which is also the only tab §8's dashboard reads or writes. The cost is one
word of wording in §3: the never-write rule should say *"on All Items"*.

---

## 13. ✅ CONTRACT FINAL FOR SCAN & ORDER — 2026-10-05

| Ref | Ruling |
|---|---|
| **OPEN-1** (2a) | **Approved.** `Assignee` column present on all 10 tabs; written **blank on derived stage tabs**; **never written or cleared on `All Items`**. Raised centrally as proposal **P4** |
| **OPEN-2** (2d) | **Two separate lines** on Summary: `Generated <ISO timestamp>` and `Pending change-log rows: N` |
| **v1.1** | Owner will send `memory/control/registry-sheet-contract-v1.1-proposal.md` to the dashboard agent. Updated with **P4** (Assignee wording fix) and the **§5.5 narrowing note** (SO accepts `Status` only) |

**All four OPEN items are now closed. All five F-gaps are closed. All three X-contradictions are
resolved.** No contract question blocks Scan & Order.

### Final decision set, consolidated

| Area | Settled position |
|---|---|
| Direction | Two-way for **`Status` only**. Dates agent-written, excluded from the diff |
| Approval | **In chat.** `PENDING` → (chat) → `APPLIED`. No in-sheet approval trail (P1 proposed centrally) |
| Pending edits | Human-typed Status **persists on screen** while `PENDING`. Registry wins only on a true concurrent conflict, with the reason logged |
| Validation | Agent validates each typed Status against evidence (artefacts, code markers) and records agreement/disagreement in the Change Log `Note` |
| Edit source | `All Items` only. Stage-tab edits → `REJECTED`, *"edit on a derived tab"*. Diff keyed on `ID`, never row position |
| `Assignee` | Blank on stage tabs; untouched on `All Items`; excluded from the diff |
| `Edited by` | Permanently blank. **No Drive Activity scope.** Removal proposed centrally (P3) |
| `Last updated` | **Item's last gate date** — latest in-document date, verified derivable 78/78. Dates after the session date are flagged, not accepted. Blanket seeding withdrawn |
| `Registered` | 75/78 derived from the ID; 3 `02-XX` items are **owner fills** |
| `Money path` | `index.yml`-only; count in the `Trust indicators` Summary block. Column 22 proposed centrally (P2) |
| `Blocked on` | Oldest party by `since` in column 11; full detail into `Status note`. Nothing discarded |
| Columns | **21**, contract order. Column 16 is `Closed` |
| Tabs | **10**, contract order, Summary **last** |
| Status enum | **8 contract values.** Our 13-value enum (D-G13) retired |
| Summary | 3 contract blocks + `Unrouted` line + SO-local `Trust indicators` block + 2 header lines |
| Legacy `BUG-NNN` | **Excluded** — *"only registered CR goes in CR"* (R3) |
| CR record | `CR-2026-10-04-006` amended in place; **risk LOW → MEDIUM**; **D-G1 superseded** (R2) |
| Token expiry | Owner asserts not in Testing. Loud-failure mitigation retained regardless |

### Immediate next step

Owner to open **Role 2 — PLANNING**. `AMENDMENT_DESIGN_DRAFT.md` converts to an
`IMPLEMENTATION_PLAN.md` carrying 19 changes, 9 retained verifications and 17 new ones (V22–V38).
**No code until that plan is owner-approved.**

### Held pending that, per the owner's sequencing instruction

1. `INV-2026-08-06-001` — registry row with no folder: create or mark `DUPLICATE`.
2. `BUG-042` — amendment finding against `INV-2026-10-04-001`, whose 19-ID list was built from
   documents and never cross-checked against source.
3. The 78-status adjudication — **16 classes, ~6 owner rulings** (§12.1). Highest-value single ruling:
   do the 5 `SHIPPED` items map to `CLOSED` or to `SMOKE`?
4. **🔴 Six self-contradicting items** — 3 `REGISTERED`, 1 `PARKED`, 2 `DEFERRED`, all with **live
   code markers in production**. Shipped code against work the registry records as never started or
   shelved. Independent of the sheet; owner has not yet said whether to pull this out as its own
   finding.
