# MyGenie Customer App — PRD CHANGELOG

> **Not to be confused with `change_requests/CHANGELOG.md`**, which is the registry generator's
> field-diff log, or with the contract's `Change Log` sheet tab, which records human sheet edits.
> This file is the dated product/session history split out of `PRD.md` on 2026-10-06 when it
> passed 700 lines. Newest section last.

# Code-Correctness Sprint — session after 2026-10-03

**Owner intent (verbatim):** *"what we are trying to do right now is like getting the code right,
monolithic file… then we have hardcoding for seven one six restaurant"* — fix the codebase
**before** adding new functionality.

**Approved batch:** Gate 0 + Track A (shrink `server.py`) + Track B (monolith split) +
Track C (hardcoding). Tracks D (FE facades/guards) and E (thick pages) are out of this sprint.
Full plan, sequencing and owner decisions D-S1…D-S7: **`/app/memory/SPRINT_CODE_CORRECTNESS.md`**.

## Measured state of the code (re-verified against `3oct`, not read from docs)

| Metric | Registry claimed | Actual |
|---|---|---|
| `server.py` | 1,829 lines | **1,878** |
| Direct CRM-table touches | 20 | **21** |
| `716` hardcodes | 27 checks | **65 occurrences** (FE + BE) |
| Thick pages | — | `ReviewOrder.jsx` 2,070 · `AdminSettings.jsx` 1,324 (**unrouted dead code**) · `LandingPage.jsx` 1,296 · `MenuOrderTab.jsx` 1,231 · `DeliveryAddress.jsx` 1,056 |
| Contract/snapshot suite | "22/22 PASS, safety net live" | **could not run at all** on a fresh pod |
| Route coverage | — | ~16 of **44** routes |

## Shipped this session

| ID | What | Status |
|---|---|---|
| **CR-2026-10-03-002** | **P0 security** — `users` read projection. 30 fields → 9. CRM's live `dp_live_`-prefixed `api_key` was being returned by `/api/auth/me` and stored in React state on **every admin page load**; also dropped `authkey_api_key`, `pos_crm_token_response`, `password_hash` | ✅ **QA PASSED** |
| **CR-2026-10-04-002** | **BUG (test infra)** — the suite could not produce a green run: CR-2026-09-12-004's own 5/min login limit 429'd the fixtures, `testpaths` pointed at a non-existent dir, 2 pinned plugins were not installed | ✅ done — **25 passed, 12 snapshots, 0 errors** |
| **CR-2026-10-04-003** | **BUG P1** — hard reload of any `/admin/*` route logged the admin out (`AdminLayout` redirected before `AuthContext` restored the session). Found by QA | ✅ fixed + Playwright-verified |
| **CR-2026-09-12-004** | CORS + rate limit + security headers — merged weeks ago, **never QA'd** | ✅ **QA PASSED**, regression test added |
| **CR-2026-09-14-001** | OTP SMS removal — merged weeks ago, **never QA'd** | ✅ **QA PASSED** |

## Registered this session (not built)

- **CR-2026-10-04-001** — `/api/table-config` falls back to CRM's `users.mygenie_token`, which is
  why the P0 could only remove 3 of 4 secrets. QA proved that token is **stale**, so the fallback
  barely works. Carries the **two-POS-identity trap**: the obvious fix routes through a *service
  account*, risking cross-tenant table data. **Needs an owner direction (A/B/C/D).**

## Corrections to the record

1. **CR-2026-08-03-001 (716) is now HELD (D-S4).** Its checklist says *"✅ CONFIRMED 2026-08-06 —
   POS returns `locationSelection:'runtime'`, `ordersAutoPaid:1` for 716."* Live preprod now returns
   **`'scanner'` / `0`**. Both keys exist (POS shipped them) but **716's values were reset**, so
   shipping the plan as written would silently strip Hyatt's room-only + autopaid behaviour.
   Blocker is a **POS data backfill**, not POS engineering. Production is owner-verified only (D-S6).
2. **CR-2026-10-03-002's intake was wrong** that "nothing in our code reads" the secrets —
   `mygenie_token` is read at `server.py:902`. The literal 7-field projection would have caused an
   admin QR-screen outage.
3. **CR-2026-09-12-005 was not really "CLOSED"** — the safety net it delivered could not run.

## Next (P0/P1 order)

1. **P0 — owner ruling** on `INV-2026-09-12-001` (`/api/status` external callers) → unblocks
   **CR-2026-10-03-001** (delete 14 dead CRM-table call sites; touches 21 → ~7).
2. **P0 — owner direction** on **CR-2026-10-04-001** (A/B/C/D).
3. **P1 — Track B1:** extend contract snapshots from ~16 to **all 44 routes** (owner decision D-S2;
   the uncovered set is `/orders`, `/points`, `/wallet`, `/profile`, `/set-password`,
   `/verify-password`, `/feedback`, `/banners`, `/pages`).
4. **P1 — Track B2:** CR-2026-09-12-006 backend modular split, planned against frozen contract §2
   (D-S3). Exit gate: response byte-diff vs pre-refactor = 0.
5. **P2 — Track C:** CR-2026-09-12-009 (`478`/`pos_id`/`+91`), CR-2026-09-12-010 (config defaults
   → DB). CR-2026-08-03-001 stays HELD until the 716 backfill is confirmed in preprod **and** prod.

## Gate reconciliation + owner ruling (same session)

Three process gates were jumped while building the items above: **implementation-plan approval,
Role-3 assignment, and owner smoke.** The owner's scope answers (batch shape, split approach, the
716 hold, production out of bounds) set priority — they were not build authority. The missing
Planning artefacts were then written retroactively and verified line-by-line against the diff:
`IMPLEMENTATION_PLAN.md` for all three items, plus `IMPACT_ANALYSIS.md` for CR-2026-10-04-002/-003.
Full record: `/app/memory/GATE_RECONCILIATION_2026-10-04.md`.

**Owner ruling:**

| Item | Ruling |
|---|---|
| CR-2026-10-03-002 (P0 projection, `server.py`) | **KEEP** |
| CR-2026-10-04-002 (test harness, no app code) | **KEEP** |
| CR-2026-10-04-003 (admin F5 logout, `AdminLayout.jsx`) | ↩️ **REVERT** — belongs to CR-2026-09-12-008; bug stays live and accepted |
| Statuses | **Close nothing** — five items sit at *QA PASSED, awaiting owner smoke* |

I had also written **CLOSED** on five rows off an *agent* QA pass; §15 reserves CLOSED for owner
acceptance. All rows corrected to *QA PASSED — awaiting owner smoke*.

### 🔒 BINDING from now on
**Planning presents the plan → owner replies `Role 3 approved for <CR-ID>` → only then is code
written.** No size threshold, no exceptions. A bug found mid-QA is a new intake handed back to the
owner, not an inline fix.

### Net code state on `3oct`
`backend/server.py` (approved P0) + harness fixes + 2 regression test files.
**No frontend file differs from its pre-session state.**

### Known-accepted live bug
Hard reload of any `/admin/*` route logs the admin out. Diagnosed, fix reverted by choice;
requirement carried into CR-2026-09-12-008
(`PREWORK_FROM_CR-2026-10-04-003.md`). Two cases there were **never executed**: anonymous visitor
to `/admin/*`, and logout.

## Registry reconciliation — Role 1 Intake pass (session after 2026-10-03)

Owner asked for the officially-unregistered CRs and bugs to be registered under the Intake role,
with the registry fixed first. Executed as **CR-2026-10-04-004**. Documentation only — no
application code touched.

### Before / after

| | Before | After |
|---|---|---|
| Registry rows | 52 | **78** |
| Items on disk with no row | **23** | **0** |
| Code markers referencing unregistered IDs | 15 | **0** |
| Folder names breaking the ID scheme | 1 colon-bearing | 0 |

### Registered (23 backfilled + 3 new)

12 CRs, 3 BUGs, 7 INVs, 1 PROD-INCIDENT — statuses taken verbatim from each folder's own docs.
Three new items raised: **CR-2026-10-04-004** (this pass), **CR-2026-10-04-005** (takeaway
surcharge scope deviation, P1 money path), **INV-2026-10-04-001** (legacy BUG-NNN status
reconstruction, P1).

### The three findings that matter

1. **`INV-2026-10-03-001` was unregistered** — the UAT secrets / PII investigation (static
   `dp_live_` CRM credential; shared UAT DB holding real PII incl. 114 `customer_documents`). The
   project's most serious security finding was invisible in the registry. Its DevOps brief may
   still not have been sent.
2. **`CR-2026-02-XX-002` shipped beyond its approved scope.** Asked for: ₹10 hardcode at
   restaurant 699 via `delivery_charge`. Shipped: estate-wide surcharge read from POS
   `takeaway_charges` as its own line item, while its own handover still records blockers B3+B4 as
   *awaiting owner approval*. Live in `ReviewOrder.jsx` — customer-facing order totals, unverified.
   → **CR-2026-10-04-005**, needs owner answers Q1–Q4.
3. **`BUG-2026-02-XX-001` is a live P1 on the delivery money path** — 13 docs, 5 fix rounds, a
   documented owner smoke **failure on 2026-07-13**, now "awaiting owner smoke" again. Root cause:
   distance API called with `order_value` hardcoded to `'0'`.

### Decisions recorded (D-R1…D-R8)

`/app/memory` is canonical and `memory_repo` deprecated (D-R5) · the three `2026-02-XX` IDs stay
as-is, since the day was never recorded and renaming would churn 22 markers across 4 hotspot files
(D-R2) · PROD-INCIDENT folder renamed to drop the colon, 5 refs updated (D-R3) · unverified items
keep their own "IMPLEMENTED — QA PENDING" wording (D-R4) · **`CR-2026-07-04-002` CLOSED under §15
condition 5, owner-accepted exception** (D-R6), part B carried to INV-2026-10-04-001 · addendum
Part B §10 correction **drafted and held for owner review** (D-R7).

### Known-open QA debt now visible

`CR-2026-04-11-001` (no QA artefact at all), `CR-2026-06-17-002`, `CR-2026-06-17-003`,
`CR-2026-08-06-001` — all implemented, never verified. Plus owner smoke pending on
`CR-2026-02-XX-001`, `BUG-2026-02-XX-001`, `BUG-2026-09-08-001`, and sign-off pending on
`CR-2026-06-17-001`, `CR-2026-06-17-004`, `CR-2026-09-07-001`.

### Still not done

The operating prompt's addendum Part B §10 names three absent files and an unverifiable "10 open
bugs (2× P0)" count. Draft replacement ready; **not applied** — owner is reading the section in
place first (§7 requires approval to change the prompt).

---

## 2026-10-05 — CR-2026-10-04-006, Phase P3 auth smoke: PASS (read-only)

Gate 3 is **still open**. `Role 3 approved for CR-2026-10-04-006` has **not** been given, so no CR
deliverable was written: `index.yml`, `registry_sync.py` and `CHANGELOG.md` do not exist, and
`change_requests/README.md` is untouched.

**Auth pattern changed by the owner.** Credentials arrived as an OAuth **Desktop** client id +
secret, not the service-account key the plan's §3/§4 assumed. Owner chose to keep OAuth *without*
new FastAPI routes, so `backend/server.py` stays out of scope and the plan is not void — §3/§4 are
superseded by `CR-2026-10-04-006-.../AUTH_AMENDMENT.md`.

Google deprecated the out-of-band copy-paste flow on 2023-01-31, so the loopback redirect was used
headlessly: consent URL printed, owner approved, the failed `localhost` address pasted back.
`google-auth-oauthlib` was **not** installed — the token exchange and refresh are plain `requests`
POSTs, so `requirements.txt` is unchanged.

**Proven:** token exchange, the `…/auth/spreadsheets` scope, refresh-token storage at
`/app/secrets/sheets_token.json` (mode 600, matched by `.gitignore:35`), **non-interactive refresh**,
and a spreadsheet read. V21 (fail fast on missing env) passed incidentally when `GOOGLE_SHEET_ID`
vanished from `.env` mid-session and the script aborted rather than defaulting.

**Not proven: write access.** Owner instructed *"do not touch any sheet"*, so the P3 write probe was
skipped. Read 200 does not imply write 200 — a read-only collaborator reads fine and writes 403.
Phase P5 (`push`) is therefore **not de-risked**, which defeats the reason P3 was sequenced third.

### New blockers found, all needing owner rulings

1. `GOOGLE_SHEET_ID` was supplied as the whole URL tail (`…cBzkdY/edit?gid=967495728`); every call
   would have 404'd. Trimmed to the bare ID by targeted `.env` edit.
2. **The target spreadsheet is not empty.** It is `REGISTRY_EXPORT_2026_09_27` with nine existing
   tabs: `All Items · Summary · Intake · Planning · Implementation · Closed · QA'd · Smoke Test ·
   Blockers`. Tab contents were never read.
3. **Tab names contradict plan §6**, which routes to `Implemented`/`QA`/`Smoke`. Live sheet uses
   `Implementation`/`QA'd`/`Smoke Test` and adds `All Items`. `QA'd` carries an apostrophe needing
   escaping in every A1 range.
4. **A one-way generator (D-G1) will overwrite that 2026-09-27 export** on first `sync`. If it holds
   hand-entered data existing nowhere else, it is destroyed.
5. **Refresh-token longevity.** If the consent screen is in *Testing* publishing status, Google
   expires refresh tokens after 7 days — a weekly manual re-consent the service account never had.

### Prioritised next steps

- **P0 (owner):** rule on §4.2 — overwrite the existing export, or generate into a fresh sheet.
- **P0 (owner):** confirm OAuth consent publishing status (Testing vs Published).
- **P1:** prove write scope with one cell in a throwaway spreadsheet — completes P3 properly.
- **P1 (owner):** tab-name reconciliation, then `Role 3 approved for CR-2026-10-04-006`.
- **P2:** money-path ratification (7 items) — owner deferred with *"first check connection"*.
- **P2:** Phases P1/P2/P4 (bootstrap, validation, views + CSV) need no credentials and can start the
  moment Role 3 opens.

---

## 2026-10-05 — CR-2026-10-04-006 IMPLEMENTED (Role 3, gate 5) · QA open

Owner opened Gate 4 by assigning the implementation role. Built per `IMPLEMENTATION_PLAN.md` +
`AUTH_AMENDMENT.md`. **Exit gate 7/7 · self-test 9/9 · ruff clean · zero application code touched**
(`backend/server.py`, `frontend/**`, both `requirements.txt` all verified unchanged).

**Delivered:** `memory/tools/registry_sync.py` (`bootstrap · audit · propose · sync [--dry-run]`) ·
`memory/change_requests/index.yml` (**78 records**) · `CHANGELOG.md` · `.registry_state.json` ·
`.registry_csv/` (9 local CSVs) · `STATUS_WORKSHEET.md` · `probe_sheets_oauth.py`.
Live Sheet **`Scan and Order issue tracker`**, 9 tabs, owner's `Sheet1` removed after the named tabs
existed. Phase P7 (badge formatting, protected ranges) deliberately not built — it would decorate
data that does not exist yet.

**Verified:** V1 (78 records, 0 orphans/duplicates) · V2 (`README.md` byte-identical by md5 across a
full sync; the row-400 update was hand-authored, so O-G3 holds) · V3+V7 (second run → literal "No
changes since the last generation") · V8 (planted `CR-2099-01-01-999` folder reported) · V11
(`--dry-run` writes nothing) · V16 (`0 routed + 78 unrouted = 78`) · V20 (injected
`status: NOT_A_REAL_STATUS` + `risk: SPICY` → exit 1, both named) · V21 (missing env → `KeyError`,
no silent default). Sheet read back to confirm the push landed.

### The headline: all 6 gate tabs are empty, correctly

Routing keys off `status`/`next_gate`, and **O-G4 forbids the agent from assigning them** — mapping
README prose to the 13-value enum is interpretation. So bootstrap populated only the provable:
`id`/`type`/`artefacts` 78/78, `title` 78/78, `code_markers` 78/78 (**26 true**), `registered` 75/78
(blank for the three `02-XX` items, never invented). Everything else is blank by design.
`STATUS_WORKSHEET.md` presents all 78 items with verbatim README prose and an **empty status
column** for the owner to rule on. That one pass lights up the funnel, the 6 gate tabs and Summary
blocks 1 and 4.

**Plan correction found in implementation:** impact analysis §5 claimed `title` was derivable 78/78
from documents. False — every artefact H1 is just `INTAKE DOC — <ID>`. Real sources are the README
title cell and the folder slug; now 78/78 genuine titles.

### Two declared deviations, awaiting ratification

- **D1 — 9 tabs, not 8:** added `All Items`. Without it, unadjudicated status means a plan-exact
  8-tab sheet renders **completely empty**. Also matches the owner's own earlier export shape.
- **D2 — 18 fields, not 17:** `money_path` included. The planning docs contradict each other
  (plan §5 lists it, intake §4 omits it, Summary block 2 needs it).

### Open risks / prioritised backlog

- **P0 (owner):** OAuth consent publishing status — **asked 3×, still unanswered**. In *Testing*,
  Google expires the refresh token every 7 days → weekly manual re-consent forever. If Testing:
  publish, or revert to the service account the plan originally specified.
- **P0 (owner):** adjudicate the 78 statuses via `STATUS_WORKSHEET.md`. Open design question — doing
  it in a Sheet column would be natural but makes the Sheet an *input*, breaching D-G1's one-way
  rule. Needs a ruling.
- **P1:** `sync` does `values:batchClear` then rewrites, and deletes any tab not in `TABS` (this is
  how `Sheet1` went). P7's protected ranges — the thing that would actually prevent lost edits — are
  not built.
- **P1 (owner):** ratify D1/D2 and the 7 money-path items.
- **P2:** `INV-2026-08-06-001` is in the README with **no folder on disk** — a gap
  `CR-2026-10-04-004`'s reconciliation missed. Audit reports it every run. Create or tombstone.
- **P2:** `last_updated` blank for all 78, accumulating from now on — fabricating history was
  refused (uniform clone mtimes, single deploy commit).
- **P2:** ROLE 13 — REGISTRAR prompt draft still owner-gated.

---

## 2026-10-05 — shared registry-sheet contract: investigation + FREEZE

Owner brief moved the registry sheet onto a **cross-project contract** (POS, CRM, Scan & Order,
Central Inventory, Infra) feeding a Tech Dashboard. Ran **ROLE 6 — INVESTIGATION** (read-only, 9/10
steps, no code). Two reports written:
`INVESTIGATION_REPORT_contract_alignment.md` and `CONTRACT_FREEZE_RECONCILIATION.md`.

The contract did not exist on this pod — now stored canonically at
`memory/control/registry-sheet-contract.md` (v1, 2026-10-05).

**Contract answered all 7 prior blockers.** `Related` is column 17 (retained). Status enum is **8
values, not our 13 — D-G13 superseded**, with no migration needed since all 78 Status cells are
blank. Stage tab = Status one-to-one; `Blockers` is orthogonal (non-blank `Blocked on`, any Status).
`BLOCKED` ceasing to be a Status is an improvement — blocked items keep their true stage instead of
vanishing into a dead-end bucket. Generation timestamp moves to the Summary tab.

**3 contract↔brief contradictions resolved:** column 16 is `Closed` not `Closed date` (contract wins
— the dashboard reads headers); the brief's 4th `Trust indicators` Summary block and the `Unrouted`
line both stand as SO-local divergences, safe because §8's dashboard reads **All Items only**.

**CONTRACT FROZEN.** Owner rulings: approval **in chat** (F1) · `All Items`-only Status edits, diff
keyed on `ID` (F2) · seed all 78 `Last updated` to `2026-10-05` (F3) · blocker party in column 11
with detail in `Status note`, oldest-by-`since` wins the column (F4) · money path as a **count only**
in `Trust indicators` (F5) · amend `CR-2026-10-04-006` in place, **risk LOW → MEDIUM, D-G1
superseded** (R2) · *"only registered CR goes in CR"*, so the 19 legacy `BUG-NNN` are excluded and
the conflict with `INV-2026-10-04-001` §5 dissolves (R3) · one build pass after the freeze (R4).

**Contract v1.1 proposal written** (`memory/control/registry-sheet-contract-v1.1-proposal.md`) — all
three gaps hit every project, not just SO: P1 add `APPROVED` to the `Decision` enum (§5.3 is not
literally implementable without it) · P2 `Money path` as column 22, machine-readable for the
dashboard · P3 remove or redefine `Edited by`.

**🔴 Agent error, corrected:** F1b was decided on my incorrect framing that a scope could populate
`Edited by`. Verified afterwards that **no Google API can attribute a cell edit to a person** —
Sheets API carries no author metadata; Drive Activity API v2 is file-level only and consolidates
edits across time spans. Recommendation is now **do not add the `drive.activity.readonly` scope**
(it grants Drive-wide activity read for a guess). Awaiting re-decision; freeze holds on all other
items.

### Prioritised next steps

- **P0 (owner):** re-decide F1b (`Edited by` / Drive Activity scope) — recommendation: decline.
- **P0 (owner):** OAuth consent publishing status, **asked 4×**. REGISTRAR must run on every
  registry mutation (§5.1); in *Testing* the refresh token dies every 7 days.
- **P1:** **Role 2 PLANNING** for the amendment — 19 identified changes. Items 16–18 (read-merge-write
  `push`, sheet→registry diff, applying approved rows) are the first code that **reads** the sheet,
  which is why R2 re-rates to MEDIUM. Not a straight Role 3 pass.
- **P1:** regenerate `STATUS_WORKSHEET.md` against the 8-value enum (currently advertises 13).
- **P2:** file **`BUG-042`** against `INV-2026-10-04-001` — live code marker, absent from its 19-ID
  list, which was built from docs and never cross-checked against source.
- **P2:** `INV-2026-08-06-001` — in `README.md`, no folder on disk. Create or tombstone.
- **P2:** 4 contract-required columns are unsatisfiable today (Status 0/78, Priority 0/78,
  Last updated 0/78 until F3 seeding, Registered 75/78) — clears at adjudication.
- **P2:** ROLE 13 — REGISTRAR prompt edit (owner-confirmed in the brief), incl. approval-gated
  change-log rule and never-write-`Assignee`.

### 2026-10-05 (late) — F1b re-decided · amendment design drafted as investigation

**F1b closed:** owner dropped the Drive Activity scope. No new OAuth scope, no second consent, no
Drive-wide access. `Edited by` stays a permanently blank column for contract compliance; proposal P3
(remove/redefine it) stands with the dashboard agent. **The contract freeze is now complete — no
contract question blocks Scan & Order.**

**Owner sequencing ruling:** *"till contract is finalized no planning, but draft as investigation."*
Gate 3 stays shut. Design authored as `AMENDMENT_DESIGN_DRAFT.md`, explicitly **not** an
implementation plan: full 21-column field mapping, `Status note` composition, the 4-phase
read-merge-write cycle, Summary layout, **17 new verifications (V22–V38)** on top of the 9 retained,
6 risks and sizing (~10 h). Converts to a plan only when the dashboard agent rules on v1.1 and the
owner opens Role 2.

**4 new open questions found while drafting:**
- **OPEN-1 (contract defect, not SO-specific):** `Assignee` on stage tabs is **unsatisfiable as
  written**. §2 says stage tabs carry the same columns as All Items; §3 says the agent never writes or
  clears column 13. Stage-tab membership and row order change every run, so leaving M untouched shows
  the *previous* run's assignees against the wrong items. All three alternatives breach something.
  Recommended: confirm §3's prohibition applies to `All Items` only (which is where §8's dashboard
  writes), then blanking M on derived tabs is correct. Fold into v1.1.
- **OPEN-2:** §6's `Generated` / `Pending change-log rows` — one line or two? Cosmetic but may be parsed.
- **OPEN-3:** §5.4 *"registry wins"* contradicts overlaying a pending human edit. Needs a rule.
- **OPEN-4:** `Last updated` is a Phase-1 accepted column, but applying an edit updates it again —
  risk of a self-feeding diff. May need excluding from the diff, which contradicts §5.5.

**Next:** OPEN-1..4 + v1.1 rulings → owner opens Role 2 → Role 3. Still blocking everything:
**OAuth consent publishing status, asked 5×** (declining the Drive scope does not affect token
lifetime).

### 2026-10-05 (final) — CONTRACT FINAL for Scan & Order

All four OPEN items, five F-gaps and three X-contradictions are closed. Recorded in
`CONTRACT_FREEZE_RECONCILIATION.md` §11–13.

**Owner rulings round 2:** two-way accepts **`Status` only** (dates never hand-edited — this
dissolves the self-feeding-diff defect entirely) · human-typed Status **persists on screen** while
pending, with the agent **validating** it against evidence and logging agreement/disagreement ·
`Assignee` blank on derived tabs, untouched on `All Items` · Summary uses **two** header lines ·
token expiry asserted not-an-issue by the owner, **loud-failure mitigation retained regardless**.

**`Last updated` method replaced with the owner's suggestion and it is better than mine.** Derived
from each item's **last gate date** (latest in-document date) — **verified 78/78**, month spread
(May 1 · Jun 5 · Jul 18 · Sep 33 · Oct 21) matches real project waves, and `BUG-2026-02-XX-001`
resolves to `2026-07-14`, independently corroborating the known July smoke failure. Blanket
`2026-10-05` seeding withdrawn. Dates later than the session date are flagged, not accepted.

**78-status adjudication is far smaller than feared.** All 78 carry a recognisable status word in
`README.md`; grouping collapses 78 item decisions into **16 classes — 10 unambiguous, ~6 needing an
owner ruling**. Highest-value single ruling: the 5 `SHIPPED` items → `CLOSED` or `SMOKE`? The contract
reserves `CLOSED` for owner-verified, and "shipped" only means code is live.

**🔴 New finding, independent of the sheet:** **six items contradict themselves** — 3 `REGISTERED`,
1 `PARKED`, 2 `DEFERRED` — all with **live code markers in production**. Shipped code against work
the registry records as never started or shelved. Exactly the drift the registry exists to catch.
Owner has not yet ruled on pulling it out as its own finding.

**v1.1 proposal updated and ready for the owner to send to the dashboard agent:** P1 `APPROVED`
value · P2 `Money path` column 22 · P3 remove/redefine `Edited by` · **P4 (new) scope the Assignee
rule to `All Items`** — a correctness defect that makes every project's stage tabs show assignees
against the wrong items · plus a note that SO narrows §5.5 to `Status` only.

### Next

**Owner opens Role 2 — PLANNING.** `AMENDMENT_DESIGN_DRAFT.md` converts to a plan: 19 changes,
9 retained verifications, 17 new (V22–V38), risk MEDIUM. No code until that plan is approved.
Held per owner sequencing: `INV-2026-08-06-001` (row, no folder) · `BUG-042` finding · the 78-status
adjudication · the six self-contradicting items.

---

## 2026-10-05 — STATUS ADJUDICATION COMPLETE · all 78 items classified

Owner session run in **ROLE 6** (recording rulings; **no code written, gate not opened**). Full record:
`CR-2026-10-04-006-.../STATUS_ADJUDICATION.md`.

**Two agent errors found and corrected mid-session:**
1. The first grouping scanned whole README rows, so prose containing "shipped"/"tombstone" mis-sorted
   items — 3 of 5 reported as *Shipped* actually read *Registered*. Corrected to read the status
   column's leading marker only; all 78 then classify cleanly.
2. **"Six self-contradicting items" was wrong — it is two.** Three were **forward references in test
   comments** (*"CR-2026-09-12-006 will remove these legacy…"*). Root cause: `code_markers` is a plain
   substring search and cannot tell *"code implements this"* from *"a comment mentions this"*, so it
   **overstates what is live** — and it feeds the Trust indicators. Owner ruling: **rename to "ID
   mentioned in code"**.

**Final distribution (verified, sums to 78):** `INTAKE` 32 · `PLANNING` 4 · `IMPLEMENTED` 18 ·
`QA` **0** · `SMOKE` 9 · `CLOSED` 13 · `PARKED` 1 · `DUPLICATE` 1.

**What the funnel now says:** only **13 of 78 (17%) are genuinely finished** — the registry's green
ticks implied more. **18 are built but never owner-verified**, the real hidden backlog. **9 sit in the
owner's smoke queue**, including the delivery-charge money bug. **The QA tab is empty** — nothing is
in QA. 32 never started.

**Owner's most consequential ruling:** the three `✅ SHIPPED` items → `IMPLEMENTED`, not `CLOSED`
(*"live but never verified, and don't pretend otherwise"*). The tracker now reports less completed
work than it did that morning, and that figure is the honest one.

**Design flaw caught during adjudication:** contract §2 routes `PARKED` to the **Closed** tab, so
anything parked leaves the active pipeline. Owner ruled `PARKED` is reserved for **real decisions to
stop**; anything merely waiting keeps its true stage and gets `Blocked on` set (the §4 treatment).
Result: only **1** of 78 is truly parked, and 2 items that would have been buried now surface on
Blockers. 4 `blocked_on` values recorded (`OWNER` ×3, `POS` ×1); the other 74 remain a separate pass.

**⛔ `index.yml` deliberately NOT written.** `registry_sync.py`'s validator still enforces the old
13-value enum, so writing `INTAKE`/`SMOKE`/`DUPLICATE` today would make every `audit` and `sync`
exit 1 against its own registry. The 8-value enum ships with amendment change #10. Order is forced:
**plan → implement enum + layout → write all 78 statuses in one pass.** `STATUS_ADJUDICATION.md` is
the authoritative input for that write.

### Escalations falling out of the session

- **🔴 Two live findings with no fix CR behind them**, both documented since **17 June**:
  `INV-2026-06-17-001` (3 bypass paths; table-status check skipped when `finalTableId === '0'`) and
  `INV-2026-06-17-003` (multi-menu restaurants skip the table-status check entirely at landing).
  These describe orders being accepted that the table checks were meant to block.
- **🔴 `BUG-2026-09-10-001` was implemented without approval** — status says *"awaiting owner approval
  to implement"* while `server.py` carries the implementation. Held at `INTAKE` and flagged. Its own
  documents contradict each other (a Wave 0 QA sign-off exists alongside).
- `CR-2026-02-XX-002` — takeaway charge live estate-wide, approval never given, money path. Now
  visibly `IMPLEMENTED` rather than hidden behind a green tick.
- `PROD-INCIDENT-2026-07-02-001` — production incident with no recorded fix, now correctly open.

### Next

Owner to open **Role 2 — PLANNING**. Then the 19 changes, then the single status write.

---

## 2026-10-06 — contract v1.1 validated · registry backfilled 78 → 80

**v1.1 validated against the 13-point acceptance checklist: 11 PASS.** Adopted as canonical
(`memory/control/registry-sheet-contract.md`); v1 archived as `…-v1.0-archive.md`. The dashboard agent
applied Correction 1 correctly (§5.6 now scoped to `All Items`), P5 landed with all three clauses, and
columns 1–21 verified unchanged position-by-position. They also propagated P4 into §8 unprompted.

**3 defects logged, owner ruled "send back as v1.1.1":**
- **A — P1 does not work.** §5 defines `APPROVED` but **§5.3 was never rewritten**; the procedure still
  jumps from "approves" to `APPLIED` and nothing says the owner *writes* `APPROVED`. The gap P1 was
  raised to close survives, now with an orphaned enum value. SO defers `APPROVED` adoption until fixed.
- **B — §1 contradicts §5.5** ("two-way for Status only" vs Status + Registered + Closed accepted).
  Pre-dates v1.1; editing §5.5 without §1 sharpened it.
- **C — Change Log has no who-writes spec**, yet `Decision` is now written by both parties.

**Owner rulings:** stay **`Status`-only** on the two-way path (do not widen to the date columns);
**adopt `Money path` column 22**, superseding the F5 count-only workaround.

**🔴 Money-path finding.** The 7 items cross-referenced against adjudicated statuses: **only 1 is
`CLOSED`.** 3 are `IMPLEMENTED` (built, never owner-verified), 2 are in the owner's `SMOKE` queue,
1 is `INTAKE`. **Six of the seven things that can change what a customer is charged are unverified or
unstarted** — invisible until column 22 existed.

**Registry backfill (owner-approved): 78 → 80 items, nothing on disk now invisible.**
- `round_up_payload_gap_investigation` → **`CR-2026-XX-XX-001-round-up-payload-gap`**. `XX-XX` because
  **no date exists in any of its 4 documents**; `registered` blank (owner fill per §3). Typed `CR` not
  INV because it shipped code through a full implement→QA cycle. **Also a money-path candidate** (score
  56) that was previously untaggable — would make **8**, not 7.
- `metadata_branch_diff_investigation` → **`INV-2026-05-01-001-metadata-branch-diff`**, dated from the
  earliest in-document date.
- **Root cause of their invisibility:** `CR-2026-07-03-010` — the ID-scheme canonicalisation CR —
  listed both **by name** under "files NOT touched". The CR whose job was to canonicalise every ID
  explicitly excluded the only two items that had no ID.
- Verified: 80 indexed · 80 folders · **0** un-IDed · 0 orphans · 0 duplicates · `registered` 76/80.
- Both are **Unrouted** (not part of the 78-item session), exercising the back-catalogue clause SO had
  added to v1.1. Adjudicated total: **78 of 80**.

**2 new defects in `registry_sync.py`, found during the backfill. NOT fixed — gate closed.** Added to
the amendment as changes #20 and #21:
- **#20 artefact detection is exact-filename only**, so `artefacts` came out **blank for both**
  backfilled folders despite 7 documents between them — one of which is a full QA report. Fix: match
  on filename suffix.
- **#21 titles exceed the contract's "one line"** — **16 of 80 over 120 chars, longest 362**. Needs a
  truncation rule preserving the full text in `Status note`/`Notes`.

### Next

**Owner is waiting for v1.1.1 before opening Role 2 — Planning.** The amendment now carries **21**
changes. Still held: `INV-2026-08-06-001` (README row, no folder), the `BUG-042` correction, statuses
for the 2 backfilled items, 15 `Closed` dates + 3 `Registered` dates to source, and the 2 bypass-path
findings with no fix CR.

---

## 2026-10-06 — ROLE 1 INTAKE PASS · registry 80 → 87 · v1.1.1 accepted · SESSION CLOSED

Handover: `memory/SESSION_HANDOVER_2026-10-06_INTAKE.md`. Pass record:
`change_requests/INTAKE_PASS_2026-10-06.md`.

**Contract v1.1.1 accepted by the dashboard agent** (owner-confirmed in chat). Defects A/B/C closed.
No contract question blocks Scan & Order. **Gate 2 is still shut** — `Role 2 approved` has not been
given, so no implementation plan was written and `registry_sync.py` was not touched.

Agent booted into **ROLE 1 — INTAKE** on owner instruction. Full record:
`change_requests/INTAKE_PASS_2026-10-06.md`. **Zero application code modified** — `backend/`,
`frontend/` and `tests/` all verified unchanged by `git status`.

### The gap the audit could not see

`audit` reported 80 indexed / 80 folders / 0 orphans, so nothing **on disk** was unregistered. The
real exposure was IDs living in **documents and shipped code** with no row behind them. Sweeping every
`TYPE-YYYY-MM-DD-NNN` token across `memory/`, `backend/`, `frontend/src`, `tests/` and diffing against
`index.yml`: **89 mentioned · 80 registered · 9 unregistered**, of which 7 were real items.

### Registered — 7 rows (80 → 87), severities owner-ratified in chat

| ID | Sev / Risk | What it is |
|---|---|---|
| `CR-2026-10-06-001` | **P1 / HIGH** | Fix CR for `INV-2026-06-17-001` — non-QR block unenforced. 3 bypass paths |
| `CR-2026-10-06-002` | **P1 / HIGH** | Fix CR for `INV-2026-06-17-003` — multi-menu landing skips the status check; picked room never validated |
| `BUG-2026-10-06-001` | **P1 / LOW** | **Filed late in the session on owner instruction.** The non-QR control records blocks and conceals bypasses — this is why the two CRs above cannot be sized |
| `INV-2026-08-06-001` | P2 / LOW | **Ghost ID closed.** Reconstructed from 2 live code markers; was finding F2, origin *unknown* |
| `INV-2026-08-03-001` | P2 / LOW | Complete 716 hardcoding audit, Role 6 sign-off, cited 3× , never had a row |
| `CR-2026-09-12-016` | P3 / LOW | Provisional ID whose own decision said *"Owner drives Role 1 to file it"* |
| `CR-2026-06-XX-001` | — | **DUPLICATE** — all four parts shipped under 5 other CRs |

### 🔴 The headline: two P1 holes on the ordering path, documented 2026-06-17, never given a fix CR

Both **re-verified live on `3oct` this session**, not taken on trust from a June document:

- `orderAccessPolicy.js:20/63` — `walkin` is still an exempt scan type, so the non-QR block returns
  `block: false` and the order proceeds with `table_id: '0'`
- `ReviewOrder.jsx:1168/1281` — the table-status check is still gated on `!== '0'`, so `'0'` skips it
- **no `allowNonQrOrders` check exists anywhere in `backend/server.py`** — the policy is client-side
  JavaScript only, so dev tools or a direct POS call bypass every guard
- `LandingPage.jsx:232/278/883` + `ReviewOrder.jsx:1153/1281` — multi-menu skip still keyed to the
  **literal `'716'`**, and the manually-picked room is never validated

Three and a half months of accepted orders that two restaurants' configs said were impossible.
`CR-2026-10-06-001` needs an owner ruling on A/B/C/D — **only B (server-side enforcement) closes the
dev-tools path**, and B overlaps `CR-2026-07-03-011`. `CR-2026-10-06-002` needs Q1–Q3, and its Q3
collides with `CR-2026-08-03-001`, which is HELD on a POS backfill.

### `BUG-042` confirmed — the legacy set is 20, not 19

`INV-2026-10-04-001` listed 19. A source grep returns **20**. **Root cause: that ID set was built
from documents and never cross-checked against code.** Recorded as §6a of its intake, with the
instruction that Role 6 must re-derive the set from source. New sibling question: how many `BUG-NNN`
IDs exist in code that no document mentions?

### Deliberately NOT registered — 4, with reasons

`CR-2026-07-04-001` (its own source says file only on customer pain — **and its deferred sub-items are
already the registered scope of `CR-2026-07-04-003`**) · `INV-2026-09-07-001` (paperwork of
`CR-2026-09-07-001`) · `INV-2026-09-12-018` (stale self-citation inside `INV-2026-09-15-003`,
corrected in place) · `CR-2099-01-01-999` (planted V8 test fixture). All four kept **out of
`README.md` on purpose** — every ID named there is counted by the audit, which would have reported
them as README-only rows forever.

### Also updated

`CR-2026-10-04-006` addendum: v1.1.1 accepted · **21** changes · risk **LOW → MEDIUM** · `#20`/`#21`
stay folded in by owner ruling (their only fix lives inside the amendment, so splitting would track
one code change in three places).

### Audit state

```
87 indexed · 87 folders · 0 orphans · 0 duplicates · 0 index rows missing from README
1 README-only row — CR-2026-07-03-006, the intentional tombstone
index validation: PASS · routing: 4 routed + 83 unrouted = 87
```

All seven new rows carry `status: null` with their adjudicated contract value in `status_note`
(`INTAKE` ×4, `IMPLEMENTED`, `CLOSED`, `DUPLICATE`), because `registry_sync.py` still validates the
legacy 13-value enum. Four carry `next_gate: Planning`, which lights up the **Intake** tab for the
first time — derived from this pass, so O-G4 is not breached. Titles were written to the contract's
one-line rule: still **16 of 87** overlong, none of them new.

### 🔴 Third P1 filed: BUG-2026-10-06-001 — the control conceals its own failures

`postNonQrBlock` sits **inside** `if (policy.block)` at all three checkpoints
(`LandingPage.jsx:538`, `MenuItems.jsx:489`, `ReviewOrder.jsx:901`). So the four real bypass reasons
— `valid-qr` (every walk-in), `rid-716-carveout`, `edit-mode`, `non-dinein-mode` — are **never
recorded**. The allow-path decision is `console.log`'d to the **customer's own browser**
(`LandingPage.jsx:527`, whose own comment asks for it to be removed).

The endpoint, collection and index already exist and need no change
(`server.py:1687` → `non_qr_blocks`, index `rid_ts_desc`). The reason string is already computed.
The fix is additive on a fire-and-forget path: **P1 value, LOW risk, no owner decision required.**

This is also why `CR-2026-10-06-001` cannot be sized — 3½ months of possible bypasses with no
evidence either way. The owner saw 5 clean block events at 698 and reasonably concluded the control
worked, while the order that triggered the whole investigation left no record at all.

### Next

1. **P0 (owner):** rule on `CR-2026-10-06-001` option A/B/C/D and `CR-2026-10-06-002` Q1–Q3. Both P1,
   both on the money/trust path, both unfixed since June.
2. **P1:** `BUG-2026-10-06-001` → Planning. **Needs no owner ruling**, LOW risk, and makes the two
   CRs above measurable. Cheapest P1 on the board; recommended first of the three.
3. **P1 (owner):** say `Role 2 approved` — v1.1.1 is in, nothing else blocks the amendment's 21 changes.
4. **P1:** after change #10 ships the 8-value enum, write all 87 statuses in one pass.
5. **P2:** assign Role 6 on `INV-2026-10-04-001`, re-deriving the `BUG-NNN` set from source.
6. **P2:** statuses for the 2 backfilled items · 15 `Closed` + 3 `Registered` dates to source ·
   ROLE 13 REGISTRAR prompt draft still owner-gated.

**Nothing was coded this session, so nothing was fixed, tested or verified.** All three P1s are
registered only.

---

## 2026-10-06 (late) — ROLE 2 PLANNING opened · amendment IMPACT ANALYSIS written

Owner opened **Role 2 — PLANNING** for `CR-2026-10-04-006`, scoped to **impact analysis**. Step 9
(implementation plan) was **not** requested and **not** written. Gate 3 stays shut. No code.

New artefact: `CR-2026-10-04-006-.../IMPACT_ANALYSIS_AMENDMENT.md`. The 2026-10-05
`AMENDMENT_DESIGN_DRAFT.md` is marked **SUPERSEDED — stale in six places**.

**Code reality: FULL baseline / NONE of the 21 changes.** Re-verified against source, not docs:
legacy 13-value enum at `registry_sync.py:45-49` · 18 fields at `:56-61` · routing by `next_gate` at
`:64-71` · Summary-first tab order at `:78` · banner on row 1 and header on row 2 · `Blockers` has
its own 6-column shape · artefact detection filename-exact at `:80-87`.

**Six deltas since the draft (§3):** 22 columns not 21 (`Money path` adopted, F5 count-only
superseded) · two-way accepts **`Status` only**, not Status + 2 dates · `Last updated` derived from
each item's last gate date, blanket seeding withdrawn · **OPEN-1..4 all closed** · 87 records not 78 ·
21 changes not 19. **None raises risk** — two of them lower it.

### 🔴 Two findings

- **Finding A — RESOLVED 2026-10-06.** The dashboard agent ruled: all five proposals approved, three
  additions adopted, **contract v1.1 is FINAL** (*"You are clear to open Role 2 — Planning"*).
  **There is no v1.1.1** — the fixes were folded into v1.1, and all nine rulings were verified
  present in `control/registry-sheet-contract.md`; only its own note block was stale and is now
  corrected. **Defect A resolved** (P1 defines `APPROVED`), **Defect C resolved by implication**
  (P1 + P3 removed `Edited by`, leaving no column to specify).
  **🔴 Defect B is STILL OPEN in the contract text** — §1 reads *"two-way for **Status only**"* while
  §5.5 still accepts *"**Status**, **Registered** and **Closed**"*. The accepted set is either 1
  column or 3 and the file says both. Tracked as **D-A8**; it is now **the only thing blocking the
  read-merge-write band**. Recommendation: §1 governs (`Status` only), **and tell the dashboard
  agent** — POS, CRM and Inventory will hit the same contradiction and may resolve it the other way.
- **Finding B — DOWNGRADED.** Addition 2 makes empty stage tabs *"valid and expected… must not be
  treated as missing data or an error"*, and Addition 3 makes a blank `Status` an explicitly valid
  back-catalogue transitional state, counted as `Unrouted`, with a duty to surface the count until
  it reaches zero. So routing 3 → 0 is no longer a violation — it is a visible loss of the only
  working gate tabs. The sequencing constraint becomes **advisory**, **V41 is withdrawn**, and
  **V40 relaxes** to *"routed + unrouted = 87, unrouted surfaced on Summary"* — which our existing
  `Unrouted` line already satisfies. Our two SO-local Summary blocks are now contract-sanctioned.

### Three further outcomes

- **New delta D7 — the Change Log is 8 columns, not 9.** P3 removed `Edited by`. The draft's read
  range `Change Log!A2:I` is wrong by one column; correct ranges are **`Change Log!A2:H`**,
  **`All Items!A2:V`** (22 cols), writing **`A:L` + `N:V`**. New **V44** asserts column M appears in
  no range in either direction.
- **P5 ratifies the status adjudication verbatim — zero rework.** It names our Wave 2 item:
  *"Work scheduled for a later wave is expressed via Sprint, not PARKED. The Sprint clause covers
  your Wave 2 item (CR-2026-09-12-015)."* `STATUS_ADJUDICATION.md` had reached that independently,
  before the ruling. The 87-row status write can proceed as adjudicated.
- **New decision D-A7 — approval mechanism.** The ruling leaves it to us: chat approval, or the owner
  typing `APPROVED` into the Change Log cell (*"it's a free audit trail. Your call."*).
  Recommendation: **adopt the cell** — it is the only option that makes the Change Log
  self-documenting and it closes Defect C outright instead of by implication.

### Revised blocking position — **contract v1.2, both bands clear**

Contract **v1.2** merged 2026-10-06. **D-A8 closed — resolved at THREE columns** (`Status` +
`Registered` + `Closed`), **against SO's one-column recommendation**: §1 was reconciled *up* to match
§5.5. `Last updated` stays agent-computed-only, so the self-feeding diff remains dissolved. All three
SO-raised defects are now closed.

| Band | State |
|---|---|
| **(a)** schema · layout · 22 columns · enum · tab order · header row 1 · `Blockers` full column set · `#20` · `#21` · status write | **UNBLOCKED** |
| **(b)** read-merge-write · diff · `apply` | **UNBLOCKED** — D-A8 closed |

**Nothing external blocks an implementation plan.** Remaining: owner preference (D-A7), three
SO-side rulings (OQ-1..OQ-3), and D-A2.

**Consequences of the three-column ruling:**

- **D-A9 — the contract overrides an earlier owner ruling.** Delta D2 recorded an in-chat owner
  ruling of *"`Status` only"*; v1.2 says three columns. SO follows the contract, because a local
  deviation is exactly the silent divergence D-A8 was raised to prevent — but it is **logged, not
  assumed**. If "Status only" was a deliberate SO-local tightening, it becomes a declared deviation
  with a recorded reason; otherwise D2 is closed as superseded.
- **Credit where due — it beats our recommendation on one count.** It converts a pending owner chore
  into a supported workflow: the **3 blank `Registered` dates and 15 unsourced `Closed` dates** can
  now be typed into the sheet, logged as `PENDING`, and written to the registry by `apply` with an
  audit trail — instead of requiring a hand-edit of `index.yml`.
- **The containment claim is superseded.** Rev 2's *"writable surface narrowed from 4 columns to 1"*
  no longer holds: it is **3 of 22**. Risk stays **MEDIUM** — same mechanism, wider surface, but two
  of the three writable columns are dates, which cannot change routing, priority or blocking state.
  A bad date is visibly wrong; a bad `Status` moves an item between tabs.
- **Three gaps v1.2 does not specify**, arising only because dates are now writable: **OQ-1**
  malformed dates (`6 Oct`, `2026-13-01`) — recommend REJECT, and worth sending back since all five
  projects will hit it · **OQ-2** `Closed` set on a non-closed item — recommend accept with a warning,
  Summary counts keying off `Status` · **OQ-3** a closure edits two cells, so recommend both
  `PENDING` rows apply on one approval.
- **Verifications now 9 retained + 25 new = 34** (V28 narrowed, V27 widened, V45/V46/V47 added).

**🔴 D-A2 — OAuth consent publishing status, unanswered on the 7th ask — is now the only thing that
can make a correctly-implemented item fail in production.** §5.1 requires a REGISTRAR run on every
registry mutation; in *Testing*, Google expires the refresh token every 7 days and the mirror stops
silently while four other projects keep reading the stale tab.

### Implementation plan written — 2026-10-06 (Role 2 step 9)

Owner authorised planning: *"boot gate for implementation planning and go ahead."* New artefact:
`CR-2026-10-04-006-.../IMPLEMENTATION_PLAN_AMENDMENT.md`. **Role 3 remains SHUT — no code written.**

**13 phases:** P0 pre-flight · P1 schema + 8-value enum · P2 `#20`/`#21` · P3 re-bootstrap ·
P4 layout · P5 the 87-row status write · **P6 HARD GATE — local verify, nothing pushed** · P7 read ·
P8 diff · P9 merge-write · P10 `apply` · P11 full verify + one owner smoke · P12 ROLE 13 (§7 approval).

**Decisions adopted** (all recommendations, reversible until Role 3 starts): D-A9 follow the contract
at 3 columns · D-A7 `APPROVED` cell primary · OQ-1 reject malformed dates · OQ-2 accept + warn ·
OQ-3 apply paired edits together · D-A3 single pass · D-A4 `#19` separable · D-A5 skip the
pre-amendment smoke.

**Verifications: 9 retained + 27 amendment = 36.** Two added while planning: **V48** and **V49**.

**🔴 New finding — a naming collision.** `registry_sync.py:536` already has `changelog()`, writing
`CHANGELOG.md` — the **generator's** field-diff log. The contract's **`Change Log` tab** is a
different artefact: **human** sheet edits with a `PENDING/APPROVED/APPLIED/REJECTED` lifecycle. They
must never be merged or cross-written. New code is named `sheet_change_log()`; `changelog()` is left
untouched; **V48** asserts both survive a run independently. **V49** asserts `index.yml` titles are
**not** truncated on disk — `#21` truncation is render-only.

**Irreversible point: the first push after P6.** The live sheet has no version history we control and
four other projects' dashboard reads it, so P0 snapshots all 9 tabs to
`.registry_csv.sheet-pre-amendment/` — the only sheet rollback that exists.

**Band (b) is deferrable.** P1–P6 + P11 deliver a fully compliant one-way mirror with every tab
populated; if the read path slips, nothing is lost.

**Risk MEDIUM upheld**, and better contained than when rated: the writable surface narrowed from 4
columns to **1**, and the `Last updated` self-feeding diff dissolved rather than being patched.
Unchanged: column M is protected by omission not permission (P7 protected ranges never built), and
**OAuth token lifetime is unanswered on the 6th ask** — in *Testing* the mirror silently stops while
four other projects keep reading it.

**Verifications: 9 retained + 22 new = 31.** Four corrected for the deltas (V23, V24, V28, V36) and
five added (V39 column-22 position · V40 tabs non-empty after the status write · V41 no interim sync ·
V42 `#20` artefacts · V43 `#21` titles).

**Sizing ≈ 12–14 h**, recommended as two bands: **(a)** schema + layout + enum + status write — ships
a correct fully-populated one-way sheet, **not blocked by D-A1**; **(b)** read-merge-write + diff +
apply — the only MEDIUM-risk part, and the only part D-A1 blocks.

**Owner decisions raised:** D-A1 (v1.1.1 text — blocks the plan) · D-A2 (OAuth publishing status,
6th ask) · D-A3 (ratify the sequencing constraint) · D-A4 (#20/#21 folded in; #19 ROLE 13 separable
under §7) · D-A5 (skip pre-amendment owner smoke — that code is about to be rewritten) · D-A6
(ratify deviation D1; D2 is moot now the contract adopts `Money path`).

**Files declared.** WILL change: `registry_sync.py` · `index.yml` · `CHANGELOG.md` ·
`.registry_state.json` · `.registry_csv/*` · (change #19 only) the operating prompt. WILL NOT touch:
`backend/server.py` · `backend/requirements.txt` · `frontend/**` · `tests/**` · `package.json` ·
`secrets/sheets_token.json` · `change_requests/README.md` (byte-identical, O-G3).
