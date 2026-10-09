# STATUS ADJUDICATION — owner session 2026-10-05

**Role:** 6 — INVESTIGATION (recording owner rulings; **no code written, gate not opened**)
**Scope:** assign one of the 8 contract statuses to all 78 items. Owner rulings only — the agent
proposed and measured, the owner decided.
**Contract:** `memory/control/registry-sheet-contract.md` v1, FINAL for SO

---

## 0. Two agent errors corrected during this session

1. **Grouping method was wrong.** The first pass scanned whole `README.md` rows, so prose containing
   "shipped" or "tombstone" mis-sorted items — 3 of 5 items reported as *Shipped* actually read
   *Registered*. Corrected to read the **status column's leading marker** only. All 78 classify
   cleanly under the corrected method.
2. **"Six self-contradicting items" was wrong — it is two.** Inspection of the actual markers showed
   3 of the 5 were **forward references in test comments** (e.g. *"CR-2026-09-12-006 will remove these
   legacy…"*), i.e. a test noting future work, not shipped code. Root cause: `code_markers` is a
   plain substring search for the ID and cannot distinguish *"code implements this"* from
   *"a comment mentions this"*. **It therefore overstates how much work is live, and it feeds the
   Trust indicators block.** Owner ruling: **rename the column to "ID mentioned in code"** so it is
   at least honest (option b).

## 1. Settled rulings

| # | Group | Items | Status assigned |
|---|---|---|---|
| B1 | 📝 Registered / Intake complete | 31 | `INTAKE` |
| B1 | 📋 Plan written (the non-contradicting one) | 1 | `PLANNING` |
| B1 | 🛑 Held · 🔒 Deferred · 🅿️ Parked | 3 | `PARKED` — **but see §3, this buries them on the Closed tab** |
| B1 | 🧪 QA passed, awaiting owner smoke/ack | 4 | `SMOKE` |
| D1 | 🚧 Implemented — *owner smoke pending* | 4 | `SMOKE` — `BUG-2026-02-XX-001`, `CR-2026-07-03-000`, `CR-2026-09-14-001`, `CR-2026-10-04-006` |
| D1 | 🚧 Implemented — *QA pending or unstated* | 9 | `IMPLEMENTED` |
| D2 | ✅ genuinely complete (closed / executed / resolved / 10-10 and 22-22 passes) | 9 | `CLOSED` |
| D2 | ✅ but says "awaiting owner smoke" — `CR-2026-02-XX-001` | 1 | `SMOKE` |
| D2 | **✅ SHIPPED** — `CR-2026-07-03-001`, `-003`, `-010` | 3 | **`IMPLEMENTED`** — owner: *"live but never verified, and don't pretend otherwise"* |
| D2 | ✅ implemented + QA passed, no sign-off — `CR-2026-06-17-004` | 1 | `IMPLEMENTED` (same ruling) |
| D4 | ⚠️ `CR-2026-02-XX-002` — takeaway charge, live estate-wide, approval never given, **money path** | 1 | `IMPLEMENTED` |
| D5 | ↩️ `CR-2026-10-04-003` — fix built then withdrawn; **bug still live**; subsumed by `CR-2026-09-12-008` | 1 | `DUPLICATE`, with the live bug noted |
| D5 | ❌ `CR-2026-09-12-017` — premise disproved by investigation | 1 | `CLOSED` |
| D6 | 📋 `BUG-2026-09-10-001` — **implemented without the approval it is recorded as awaiting** | 1 | **`INTAKE`, and flagged** (owner ruling) |

**Owner's most consequential ruling — D2, the three "✅ SHIPPED" items.** The registry's green tick
was doing double duty: for 9 items it meant verified and done, for 3 it meant only *"the code went
live"*. The owner split them, choosing `IMPLEMENTED` over `CLOSED`. The tracker now reports less
completed work than it did this morning, and that figure is the honest one.

## 2. Still open at the end of the session

| # | Item | Needs |
|---|---|---|
| D3 | the **7 🔬 investigations** | owner chose *"4 → CLOSED, the 3 with live findings stay open"* — **which 3**, and what status "stay open" maps to, is proposed in §4 and awaiting confirmation |
| D5 | `CR-2026-09-12-003` | owner asked to be walked through — §5 |
| §3 | the `PARKED` → Closed-tab consequence | newly surfaced; may revise B1's 3 items and D3 |

## 3. 🔴 Surfaced during the session: `PARKED` hides items on the Closed tab

Contract §2 routes the `Closed` tab to **`CLOSED`, `PARKED` and `DUPLICATE` together**. So anything
marked `PARKED` leaves the active pipeline and lands beside genuinely finished work.

That is correct for a real decision to stop — e.g. the 🅿️ item parked because *"India-only confirmed
by owner"*. It is **wrong for an item merely waiting on an answer**, which would vanish from view
while still needing something.

Contract §4 already prescribes the better treatment: *"BLOCKED is not a Status. A blocked item keeps
its real stage and gets a `Blocked on` party."* Applied properly, an item held pending an owner
decision should be `PLANNING` (its true stage) with `Blocked on = OWNER` — which surfaces it on the
**Blockers** tab instead of burying it in Closed.

**This may revise up to 4 items** — the 🛑 Held and 🔒 Deferred items from B1, plus `CR-2026-09-12-003`.
Needs an owner ruling (§6).

## 4. Proposed resolution of D3 — the 7 investigations

**Stay open (3)** — findings delivered but unaddressed:

| Item | Finding | Proposed |
|---|---|---|
| `INV-2026-06-17-001` | **3 live bypass paths**; table-status check skipped when `finalTableId === '0'` | `IMPLEMENTED` + raise a child CR for the fix |
| `INV-2026-06-17-003` | multi-menu restaurants (e.g. 716) **skip the table-status check entirely** at landing | `IMPLEMENTED` + raise a child CR |
| `INV-2026-09-12-001` | *"deletion wording withdrawn pending owner decision"* | `IMPLEMENTED`, `Blocked on = OWNER` |

Rationale for `IMPLEMENTED` rather than `CLOSED`: for an investigation the report **is** the
deliverable, so it is produced (gate 5a) but not owner-accepted or resolved — and §4 reserves
`CLOSED` for *"owner verified / subsumed / resolved"*. Neither bypass-path finding has a visible
child CR carrying the fix, so closing the investigation would close the finding with it.

**Close (4):**

| Item | Why |
|---|---|
| `INV-2026-06-17-002` | explicitly *"knowledge request, not a bug — root cause: N/A"* |
| `INV-2026-07-03-002` | restaurant 709 provisioning — ops task, report delivered |
| `INV-2026-07-03-003` | restaurant 698 provisioning — ops task, report delivered |
| `PROD-INCIDENT-2026-07-02-001` | re-investigation report written — **but see caveat** |

**Caveat on the incident.** Its status says only *"RE-INVESTIGATION REPORT WRITTEN"*. Nothing
anywhere states the Atlas slowness was actually **fixed**. Marking it `CLOSED` asserts resolution
that no document supports. It is a 5th candidate to stay open.

## 5. Walkthrough — `CR-2026-09-12-003`

**What it was.** *"Remove OTP echo + persistent throttled OTP store (GAP-003)"*, originally **P0**:
the backend endpoint `/api/auth/send-otp` was handing the OTP back in its own response — a one-time
password leaking to anyone who could call it.

**What the investigation found (2026-09-14).** Three things that changed the picture entirely:
1. the frontend **never calls that endpoint** — it is dead code;
2. **CRM is already the SMS provider**, called directly from the frontend;
3. the blocker that `CR-2026-09-12-017` was supposedly waiting on is **invalid**.

Because nothing reachable calls the leaking endpoint, severity was downgraded **P0 → P1 / LOW**.

**What is left, and why nothing has been done.** The work was split and both halves deliberately
deferred:
- **Part A** — delete the `otp_for_testing` key. One line, zero dependencies. Deferred until *you*
  confirm OTP works end-to-end on a real device.
- **Parts B + C** — Mongo-backed OTP store and an attempt cap. Deferred until the OTP feature is
  actually switched on.

The folder holds an intake and an impact analysis, **no implementation plan**, and the effort column
literally reads *"deferred"*. Two things are needed from you: confirmation that a real SMS arrives on
a test phone for `crmSendOtp`, and a decision on whether OTP gets turned on. Then Part A is a
one-line change.

**So its true state is: planning done, waiting on you.** Which makes it exactly the case §3 is about.
- If `PARKED` → it lands on the **Closed** tab and disappears, despite a live P1 and an unanswered
  question.
- If `PLANNING` + `Blocked on = OWNER` → it shows on the **Blockers** tab, which is where something
  waiting on you belongs.

**Recommendation: `PLANNING`, `Blocked on = OWNER`.**

---

## 6. ✅ ADJUDICATION COMPLETE — all 78 items have a status

Final owner rulings, 2026-10-05:

| Ref | Ruling |
|---|---|
| D5 | `CR-2026-09-12-003` → **`PLANNING`, `Blocked on = OWNER`** — stays visible on the Blockers tab |
| §3 | **`PARKED` is reserved for real decisions to stop.** Anything waiting on an answer keeps its true stage and gets `Blocked on` set — the §4 treatment |
| D3 | The 3 investigations with unaddressed findings → **`IMPLEMENTED`** |
| D3 | `PROD-INCIDENT-2026-07-02-001` **stays open** → `IMPLEMENTED`. 4 open, 3 closed. No document states the Atlas slowness was fixed, so no fix is asserted |

### §3 applied to the three former `PARKED` candidates

| Item | Marker | Real state | Assigned |
|---|---|---|---|
| `CR-2026-08-03-001` | 🛑 HELD | Implementation plan **complete**; shipping as planned would break Hyatt's room-only + autopaid behaviour. Blocker is a **POS data backfill**, not a decision to stop | `PLANNING`, `Blocked on = POS` |
| `CR-2026-09-12-015` | 🔒 DEFERRED | Intake + impact analysis only, no plan. Waiting on git access + 6 repo secrets + a dependency closing. Scheduled, not abandoned | `PLANNING`, `Blocked on = OWNER`, `Sprint = Wave 2` |
| `CR-2026-09-15-003` | 🅿️ PARKED | *"India-only confirmed by owner. Re-open if international numbers introduced."* — a **genuine decision to stop** | `PARKED` ✅ |

So only **1** of the 78 is truly parked. Two that would have been buried on the Closed tab now surface
on Blockers, where something waiting on a person belongs.

### Final distribution — sums to 78, verified

| Status | Items | Share | Reading |
|---|---|---|---|
| `INTAKE` | **32** | 41% | logged, not started |
| `PLANNING` | 4 | 5% | being planned, or planned and blocked |
| `IMPLEMENTED` | **18** | 23% | **built or live, but never verified by the owner** |
| `QA` | **0** | 0% | nothing is currently in QA |
| `SMOKE` | **9** | 12% | **waiting on the owner to verify** |
| `CLOSED` | 13 | 17% | genuinely finished |
| `PARKED` | 1 | 1% | stopped by decision |
| `DUPLICATE` | 1 | 1% | subsumed elsewhere |
| **TOTAL** | **78** | | |

### What the funnel says now that it exists

- **Only 13 of 78 items — 17% — are genuinely finished.** Before this session the registry's green
  ticks implied more.
- **18 items are built but unverified**, the second-largest bucket. That is the real backlog: work
  that consumed effort, is in the product, and nobody has confirmed.
- **9 items are sitting in the owner's smoke queue**, including the delivery-charge money bug.
- **The QA tab is empty.** Everything that passed QA moved to SMOKE, and everything awaiting QA is
  IMPLEMENTED. Nothing is in QA right now — an honest and slightly uncomfortable reading.
- **32 items never started.** Intake is doing its job as an inbox, but it is 41% of the registry.

### `Blocked on` recorded so far — 4 of 78

| Item | Party | Why |
|---|---|---|
| `CR-2026-09-12-003` | `OWNER` | confirm OTP works on a real device; decide whether OTP is turned on |
| `CR-2026-08-03-001` | `POS` | POS data backfill for restaurant 716 |
| `CR-2026-09-12-015` | `OWNER` | git access + 6 repo secrets (dependency close also outstanding → `Status note`) |
| `INV-2026-09-12-001` | `OWNER` | deletion wording withdrawn pending an owner decision |

The remaining 74 `blocked_on` values are still unauthored — a separate pass. Known candidates from
earlier sessions (`INV-2026-10-03-001` → OPS, `CR-2026-10-03-001` → OWNER on `/api/status`) are not
recorded here because this session's remit was `status` only.

## 7. ⛔ Why `index.yml` has NOT been written

**The adjudicated statuses are recorded in this document only.** `index.yml` still holds 78 blank
statuses, deliberately, for a hard technical reason:

`registry_sync.py`'s validator currently enforces the **old 13-value enum** (D-G13). Writing
`INTAKE`, `PLANNING`, `SMOKE` or `DUPLICATE` into `index.yml` today would make every subsequent
`audit` and `sync` **exit 1** with *"status not in [...]"* — the tool would refuse to run against its
own registry. The 8-value enum arrives with change #10 of the amendment.

So the order is forced: **plan → implement the enum and layout → then write these 78 statuses in one
pass.** This document is the authoritative input for that write. Consistent with the owner's
instruction to stay at the gate.

## 8. Falling out of this session — needs owner attention

1. **Two live findings with no fix behind them.** `INV-2026-06-17-001` (3 bypass paths; table-status
   check skipped when `finalTableId === '0'`) and `INV-2026-06-17-003` (multi-menu restaurants skip
   the table-status check entirely at landing). Both documented since **17 June**. Neither has a
   child CR. These describe orders being accepted that the table checks were meant to block.
2. **`BUG-2026-09-10-001` was implemented without approval.** Status reads *"plan written — awaiting
   owner approval to implement"*, while `backend/server.py` carries the implementation
   (*"Emergent object storage removed — local disk used instead"*). Held at `INTAKE` and flagged per
   owner ruling. A `QA_REPORT_WAVE_0_SIGNOFF.md` also exists alongside, so its own documents disagree
   with each other.
3. **`CR-2026-02-XX-002`** — takeaway charge live estate-wide, approval never given, touches money.
   Recorded `IMPLEMENTED`, which is now visible rather than hidden behind a green tick.
4. **`PROD-INCIDENT-2026-07-02-001`** — a production incident with no recorded fix, now correctly
   showing as open rather than closed.
5. **`code_markers` to be renamed "ID mentioned in code"** (owner ruling) — it cannot distinguish
   implementation from a passing mention, and it currently overstates what is live.

---

## 9. Registry backfill — 2026-10-06 · 78 → 80 items

Owner instruction: *"Yes, ID both — gets the registry to 80 items with nothing invisible."*

| New ID | Was | Contents |
|---|---|---|
| `CR-2026-XX-XX-001-round-up-payload-gap` | `round_up_payload_gap_investigation` | investigation report + implementation plan + implementation report + QA report — a **completed plan→implement→QA lifecycle** |
| `INV-2026-05-01-001-metadata-branch-diff` | `metadata_branch_diff_investigation` | investigation report + Phase 1 cherry-pick plan + Phase 1 file-restore execution report |

**Root cause of their invisibility.** `CR-2026-07-03-010` (registry hygiene / ID-scheme
canonicalisation) listed both **by name** under *"files NOT touched"*, treating them as closed folders
whose internal artefacts were out of scope. The CR whose job was to canonicalise every ID explicitly
excluded the only two items that had no ID. They stayed invisible to every count, the Summary tab and
the Tech Dashboard until `CR-2026-10-04-006`'s audit reported *"folders without a well-formed ID"*.

**Verified after backfill:** 80 indexed · 80 item folders · **0** folders without a well-formed ID ·
0 orphans · 0 duplicates · `registered` derived 76/80.

**Judgement calls, cheap to reverse:**
- `CR-2026-XX-XX-001` uses `XX-XX` because **no date exists in any of its four documents** — month
  and day both unknown; year assumed 2026 in line with every other item. `registered` is blank, which
  per contract §3 is an owner fill.
- Its `Type` was set **CR**, not INV, because it shipped code through a full implement→QA cycle. The
  folder name said "investigation" and its first artefact is an investigation report, so INV is
  arguable.
- `INV-2026-05-01-001` dated from the **earliest** in-document date (`2026-05-01`; the other is
  `2026-05-13`).

**Both are Unrouted** — status not adjudicated, since neither was part of the 78-item session. This is
a valid transitional state under contract v1.1 §4, and it exercises the back-catalogue clause SO
asked to have added. The adjudicated total therefore stands at **78 of 80**, with 2 pending.

**`round_up` is a money-path candidate** that could not previously be tagged — it scored 56 on
money-path keyword density in `IMPACT_ANALYSIS.md` §16.1 but was unindexable. With column 22 adopted
and an ID assigned, it can now be tagged. That would make **8** money-path items, not 7.

## 10. Two defects in `registry_sync.py` found during the backfill

Both are in already-shipped code and are **not** fixed — the gate is closed. To be added to the
amendment as changes #20 and #21.

**#20 — artefact detection is exact-filename only.** `ARTEFACT_FILES` matches literal names
(`IMPLEMENTATION_PLAN.md`, `QA_REPORT.md`…). Both backfilled folders use prefixed names
(`ROUND_UP_PAYLOAD_GAP_IMPLEMENTATION_PLAN.md`), so **`artefacts` came out blank for both despite 7
documents between them**. The sheet would report no artefacts for an item carrying a full QA report.
Fix: match on filename **suffix**, not equality.

**#21 — titles exceed the contract's "one line".** Titles are derived from the README title cell,
which in many rows carries a full descriptive sentence. The longest is **362 characters**, and
**16 of the 80 exceed 120**. Contract §3 column 4 specifies *"one line"*. Needs a truncation rule —
with the full text preserved in `Status note` or `Notes` rather than discarded.
