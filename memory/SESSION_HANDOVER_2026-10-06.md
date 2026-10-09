# SESSION HANDOVER — 2026-10-06 · AUTHORITATIVE

**Supersedes** `SESSION_HANDOVER_2026-10-06_INTAKE.md`, which covers only the first half of the
session. Read this file.

**Roles held, in order:** ROLE 6 (Investigation, read-only) → **ROLE 1 (Intake)** → **ROLE 2
(Planning — impact analysis, then implementation plan)**. All three closed.

**Application code modified: NONE.** `backend/`, `frontend/` and `tests/` verified unmodified by
`git status` at session close. Role 1 forbids coding; Role 2 forbids coding.

**Gate state: GATE 2 PASSED. GATE 3 SHUT.**

---

# ⛔ THE ONE THING THIS SESSION IS WAITING FOR

The implementation plan for `CR-2026-10-04-006` is **written, owner-reviewed and accepted
line-by-line**. Nothing external blocks it.

**It cannot be executed until the owner says, verbatim:**

```
Role 3 approved for CR-2026-10-04-006
```

Do **not** infer this from "go ahead", "looks good", "ship it" or any paraphrase. The owner enforces
the gate literally and has corrected agents for assuming it. If the next message is ambiguous, ask.

---

## 1. Session summary, in order

| # | Phase | Outcome |
|---|---|---|
| 1 | **ROLE 6** — read-only | Confirmed Scan & Order owes the other four projects **nothing**. Registry was 80 items / 80 folders, 0 orphans |
| 2 | Owner asked which role was held | ROLE 6, per the standing *"no planning until the contract is finalised"* instruction |
| 3 | **ROLE 1 booted** | Read §8 Role 1 (lines 252–300) of the operating prompt. *"Never code during Intake."* |
| 4 | Unregistered-item sweep | `audit` showed 0 orphans, so nothing **on disk** was unregistered. Swept every `TYPE-YYYY-MM-DD-NNN` token across `memory/ backend/ frontend/src tests/`: **89 mentioned · 80 registered · 9 unregistered**, 7 of them real |
| 5 | Owner ruled the judgement calls | Severities ratified · `CR-2026-06-XX-001` → DUPLICATE · `CR-2026-07-04-001` unfiled · `INV-2026-09-07-001` paperwork · stale citation fixed in place · `#20`/`#21` stay folded in |
| 6 | **6 rows registered** (80 → 86) | Both P1s **re-verified against live code first**, not trusted from the June reports |
| 7 | 4 documents updated, no new IDs | Incl. **`BUG-042` — the legacy set is 20, not 19**, with the root cause recorded |
| 8 | Plain-English walk-through of the two P1s | Surfaced a third defect the walk-through itself exposed |
| 9 | **`BUG-2026-10-06-001` filed** (86 → 87) | P1 / LOW risk. The non-QR control records blocks and conceals bypasses |
| 10 | Intake session closed | First handover written |
| 11 | Owner supplied the dashboard agent's ruling reply | All 5 proposals approved, 3 additions adopted. **There is no v1.1.1** — fixes went into **v1.1**, final |
| 12 | **ROLE 2 opened** — impact analysis | `IMPACT_ANALYSIS_AMENDMENT.md`. Found the contract's own note block stale, and **Defect B still genuinely open** (§1 vs §5.5) |
| 13 | Owner supplied **contract v1.2** | **D-A8 resolved — at 3 columns, against SO's 1-column recommendation.** All three SO-raised defects now closed |
| 14 | **ROLE 2 step 9** — implementation plan | `IMPLEMENTATION_PLAN_AMENDMENT.md`, 13 phases, 36 verifications |
| 15 | Owner accepted the plan | *"any blockers is fine by line plan ready"* — **GATE 2 PASSED**, open items accepted as known risks |

## 2. Registry: 80 → 87

Pass record: [`change_requests/INTAKE_PASS_2026-10-06.md`](./change_requests/INTAKE_PASS_2026-10-06.md).

| ID | Type | Sev / Risk | Next action |
|---|---|---|---|
| `CR-2026-10-06-001` | CR | **P1 / HIGH** | **Owner: rule A/B/C/D** |
| `CR-2026-10-06-002` | CR | **P1 / HIGH** | **Owner: answer Q1–Q3 + ratify the P1 upgrade** |
| `BUG-2026-10-06-001` | BUG | **P1 / LOW** | **Planning — needs no owner ruling** |
| `INV-2026-08-06-001` | INV | P2 / LOW | none — ghost closed, fixes already live |
| `INV-2026-08-03-001` | INV | P2 / LOW | none — subsumed by `CR-2026-08-03-001` (HELD) |
| `CR-2026-09-12-016` | CR | P3 / LOW | Planning, Wave 3. **Run V3 first — it can void the CR** |
| `CR-2026-06-XX-001` | CR | — | none — DUPLICATE, closed on arrival |

Updated without new IDs: `INV-2026-10-04-001` (`BUG-042`) · `INV-2026-09-15-003` (stale citation) ·
`CR-2026-09-07-001` (investigation recorded as paperwork) · `CR-2026-10-04-006` (v1.2, plan accepted).

## 3. THE PLAN — `CR-2026-10-04-006` amendment · what Role 3 will execute

**Authoritative document:**
`change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/IMPLEMENTATION_PLAN_AMENDMENT.md`

**Scope:** bring `registry_sync.py` onto `registry-sheet-contract` **v1.2** — 21 changes, from an
18-column one-way generator to a 22-column read-merge-write mirror with an approval-gated return
path. **Risk MEDIUM** (owner ruling R2). **Touches zero application code by construction.**

### 13 phases

| Phase | Work |
|---|---|
| **P0** | Pre-flight: back up `index.yml`, `.registry_state.json`, `.registry_csv/`; **snapshot all 9 live sheet tabs**; audit clean; record `README.md` md5; confirm the refresh token still exchanges |
| **P1** | Schema + enum: `STATUSES` 13 → **8** · `FIELDS` 18 → **22** (`severity`→`priority`, `wave_track`→`sprint`, drop `next_gate`, add `closed`/`notes`, mirror `money_path`) · `PARTIES` extended · `GATE_TO_TAB` deleted. **`status: null` must stay legal** (contract §4 back-catalogue interim) |
| **P2** | `#20` artefact detection by filename **suffix** · `#21` render-time title truncation ≤120 chars with full text preserved in `Notes` |
| **P3** | Re-bootstrap into the new schema; **rebuild `.registry_state.json` in the same step**; `git diff index.yml` must show renames and new keys only, **no value changes** |
| **P4** | Layout: header **row 1**, no banners · 22 columns in contract order · route by `Status` only · `badge()` deleted · `Blockers` → the full 22-column filter · **10 tabs, `Summary` last**, `Change Log` added · `frozenRowCount` 2 → 1 · autoResize 18 → 22 |
| **P5** | **The 87-row status write** from `STATUS_ADJUDICATION.md` — legal only once P1 ships the enum. 15 `Closed` + 3 `Registered` dates stay blank for the owner to fill **via the sheet**. No date invented |
| **🔴 P6** | **HARD GATE** — `sync --dry-run`, inspect `.registry_csv/` locally. **Nothing is pushed until every check is green.** Last point where a mistake is free |
| **P7** | Read path: `All Items!A2:V` + `Change Log!A2:H`; **column M sliced out at the boundary** |
| **P8** | Diff engine, 8 ordered rules → `PENDING` / `REJECTED` with the contract's reasons |
| **P9** | Merge-write: `All Items` out of `batchClear`, written as **two ranges `A:L` + `N:V`** · `Change Log` **append-only, never cleared** · pending edits **overlaid** so the owner's edit stays visible |
| **P10** | `apply [<ID> <Column>` \| `--all-approved]` → writes `index.yml`, marks `APPLIED`, stamps `Decided at`, **re-pushes immediately** (§5.1) |
| **P11** | All **36** verifications, then **one** owner smoke |
| **P12** | ROLE 13 — REGISTRAR in the operating prompt. **Separate, needs §7 approval.** Nothing depends on it |

### The eight frozen decisions

Ratified on acceptance. **No longer reversible** — the verification set is built on them.

`D-A9` follow the contract at **3 accepted columns** (`Status`, `Registered`, `Closed`) ·
`D-A7` **`APPROVED` cell** primary, chat fallback · `OQ-1` **reject** malformed dates ·
`OQ-2` `Closed` on a non-closed item → **accept + warn** · `OQ-3` paired edits **apply together** ·
`D-A3` **single pass**, no push between P1 and P6 · `D-A4` `#19` **separable** ·
`D-A5` **skip** the pre-amendment owner smoke.

### Verifications: 9 retained + 27 amendment = **36**

Retained and currently passing: V1 V2 V3 V7 V8 V11 V16 V20 V21.
Amendment: V22–V40, V42–V49. **V41 withdrawn** (contract v1.2 makes empty tabs valid).
Added during planning: **V48** (`CHANGELOG.md` and the `Change Log` tab stay independent) ·
**V49** (`index.yml` titles **not** truncated on disk).

### 🔴 Two things Role 3 must not get wrong

1. **The irreversible point is the first push after P6.** The live sheet has no version history we
   control and four other projects' dashboard reads it. The **only** rollback is P0's 9-tab snapshot.
2. **`changelog()` at `registry_sync.py:536` is NOT the contract's `Change Log` tab.** One is the
   generator's field-diff log in `CHANGELOG.md`; the other is human sheet edits with a
   `PENDING/APPROVED/APPLIED/REJECTED` lifecycle. Merging them destroys the approval trail. New code
   is named `sheet_change_log()`; `changelog()` is left untouched. **V48** asserts both survive.

**Band (b) is deferrable.** P1–P6 + P11 deliver a fully compliant one-way mirror with every tab
populated. If P7–P10 slip, nothing is lost.

## 4. Accepted as known risks — owner ruled *"any blockers is fine"*

Recorded so they are not re-raised as blockers, and not forgotten either.

1. **🔴 D-A2 — OAuth consent publishing status. 7th ask, still unanswered.** Contract §5.1 makes
   REGISTRAR run on **every** registry mutation. In *Testing*, Google expires the refresh token every
   7 days and the mirror **stops silently** while four other projects keep reading a stale tab. P0
   step 5 catches a dead token before the amendment starts; **nothing stops one dying afterwards.**
2. **Column M is protected by omission, not permission.** V25 asserts on the request payload.
   Protected ranges — original plan phase P7 — were never built and are out of scope.
3. **OQ-1 is worth sending to the dashboard agent.** All five projects will hit malformed dates and
   the obvious implementations differ: reject · coerce · accept-as-string.

## 5. Verified from source this session

Nothing below came from a prior document. All re-read on `3oct`:

| Claim | Evidence |
|---|---|
| `walkin` is an exempt scan type | `frontend/src/utils/orderAccessPolicy.js:20`, `:63` |
| The policy lists its own 5 exceptions | `orderAccessPolicy.js:11-17` (HC1, HC4–HC7) |
| Status check skipped when `table_id` is `'0'` | `frontend/src/pages/ReviewOrder.jsx:1168`, `:1281` |
| **No `allowNonQrOrders` check in the backend** | `backend/server.py` — string absent |
| Multi-menu landing skip | `frontend/src/pages/LandingPage.jsx:232`, `:278`, `:883` |
| Skip keyed to the literal `'716'` | `ReviewOrder.jsx:1153`, `:1281` (`skipTableCheckFor716`) |
| Telemetry fires only on block | `LandingPage.jsx:538`, `MenuItems.jsx:489`, `ReviewOrder.jsx:901` |
| Allow decisions go to the customer's browser | `LandingPage.jsx:527` |
| Backend telemetry endpoint already exists | `server.py:1687` → `non_qr_blocks`, index `rid_ts_desc` |
| Legacy `BUG-NNN` set is 20, not 19 | source grep across `memory/ backend/ frontend/src tests/` |
| Legacy 13-value enum still live | `registry_sync.py:45-49` |
| 18 fields, routing by `next_gate`, Summary first | `registry_sync.py:56-61`, `:64-71`, `:78` |
| `changelog()` already exists | `registry_sync.py:536` |

## 6. Registry health at close

```
AUDIT — 87 indexed, 87 item folders
folders not in index: 0          index entries with no folder: 0
folders without a well-formed ID: 0
in README but not in index: 1    ← CR-2026-07-03-006, intentional ⚰️ TOMBSTONE
in index but not in README: 0
code markers live but status REGISTERED (F1 tripwire): 0
index validation: PASS
routing: 4 routed + 83 unrouted = 87
titles over 120 chars: 16 of 87  ← none of the 7 new rows
```

Backend at close: `GET /api/healthz` → `{"ok": true, "mongo": "up"}`.

## 7. Why every `Status` cell is still blank

`registry_sync.py` validates the **legacy 13-value** enum. The contract's 8 values are not writable
until **P1** of the plan. Writing one today makes every `audit` and `sync` exit 1 against its own
registry.

All 7 new rows carry `status: null` with the adjudicated value in `status_note` — `INTAKE` ×4,
`IMPLEMENTED`, `CLOSED`, `DUPLICATE`. Contract v1.2 §4 explicitly sanctions this as a
*"valid transitional state"* for back-catalogue adoption, with a duty to surface the unrouted count
until it reaches zero — which the Summary's `Unrouted` line already does.

**Forced order, unchanged:** P1 enum → P4 layout → **P5 writes all 87 statuses in one pass**.

## 8. Open on the owner, in priority order

1. **`Role 3 approved for CR-2026-10-04-006`** — the only thing blocking execution.
2. **P0 — `CR-2026-10-06-001`:** option A/B/C/D. **Only B closes the dev-tools path.** B overlaps
   `CR-2026-07-03-011` — plan together if chosen.
3. **P0 — `CR-2026-10-06-002`:** Q1–Q3 and ratify the P2 → P1 upgrade. Q3 collides with
   `CR-2026-08-03-001`, which is HELD on a POS backfill.
4. **P1 — `BUG-2026-10-06-001`** can go to Planning any time; it needs nothing from the owner and
   makes the two ordering P1s measurable.
5. **P1 — D-A2**, the OAuth publishing status.
6. **P2 —** Role 6 on `INV-2026-10-04-001`, re-deriving the `BUG-NNN` set **from source** ·
   `INV-2026-10-03-001` DevOps brief still unconfirmed as sent.

## 9. Carried forward unchanged

- **6 of 7 money-path items unverified** — 3 `IMPLEMENTED`, 2 `SMOKE`, 1 `INTAKE`, 1 `CLOSED`. The
  `round_up` backfill is a probable 8th.
- `BUG-2026-02-XX-001` delivery charge (`order_value` hardcoded `'0'`) — awaiting owner smoke after a
  documented failure on 2026-07-13.
- `BUG-2026-09-10-001` — implemented without approval; held at INTAKE, flagged.
- `CR-2026-10-04-005` — takeaway surcharge live estate-wide, approval never given.
- `CR-2026-10-04-001` — table-config POS-token fallback 401s; replacement token risks cross-tenant data.
- `PROD-INCIDENT-2026-07-02-001` — production incident with no recorded fix.
- `CR-2026-10-03-001` — blocked on an owner ruling on whether `/api/status` is called externally.
- `CR-2026-09-12-005-B1` (44-route snapshots) → blocks `CR-2026-09-12-006` (backend split).
- Known-accepted live bug: hard reload of any `/admin/*` route logs the admin out.

## 10. What a new agent must not do

1. **Do not execute the plan without `Role 3 approved for CR-2026-10-04-006`**, verbatim.
2. **Do not re-open the eight frozen decisions** (§3). They were settled on acceptance and the
   36-check verification set depends on them.
3. **Do not write contract statuses into `index.yml` before P1.** It breaks the validator against its
   own registry.
4. **Do not push to the live sheet before P6 is green.** That push is irreversible; the only rollback
   is P0's snapshot, and four other projects read that sheet.
5. **Do not fix `BUG-2026-10-06-001`, `CR-2026-10-06-001` or `CR-2026-10-06-002` on sight.** All
   three are registered only — never planned, coded, tested or verified.
6. **Do not name a non-registered ID in `change_requests/README.md`.** Every ID there is counted by
   the audit and becomes a permanent README-only row. The four deliberate non-registrations live in
   `INTAKE_PASS_2026-10-06.md` §4 for exactly this reason.
7. **Do not merge `changelog()` with the `Change Log` tab** (§3).

---

```text
Session closed: 2026-10-06
Roles: 6 (Investigation) → 1 (Intake) → 2 (Planning: impact analysis + implementation plan) — all closed
Registry: 80 → 87 items · audit clean · validation PASS
Gates: GATE 2 PASSED (plan accepted line-by-line) · GATE 3 SHUT
Application code: NONE modified
Fixes applied: NONE — nothing was coded, so nothing was tested or verified
Blocking: one sentence from the owner — "Role 3 approved for CR-2026-10-04-006"
```
