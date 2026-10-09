# IMPACT ANALYSIS — CR-2026-10-04-006 (Google Sheet registry mirror)

**Role:** 2 — PLANNING AGENT · **Stage:** Impact Analysis · **REVISION 3** (re-run after the owner's
tab-model brainstorm — the Sheet layout changed from action-grouped to **gate-based**; see §12–§16)
**Written:** session after 2026-10-03 · **Item registered:** ✅ verified, intake rev 2 complete
**Code reality:** **NONE** — no index, no generator, no Sheet exists
**Risk:** **LOW** (confirmed; C1 eliminated by owner ruling O-G3 — see §6 and §7.1)
**Never coded during Planning.** Nothing in this document has been built.

---

## 1. Item verification (Role 2 step 1)

| Check | Result |
|---|---|
| Registered in `change_requests/README.md` | ✅ row present, "New items raised by this pass (4)" |
| Intake doc complete with Role 1 output block | ✅ rev 2, 16 owner decisions D-G1…D-G16 |
| Duplicate check done at intake | ✅ DISTINCT |
| Owner confirmed scope | ✅ 17 columns (D-G12), 13-value enum (D-G13), Option B tabs (D-G14) |
| Owner confirmed priority | ✅ ahead of sprint item B1 (D-G15) |

## 2. Code reality (Role 2 step 2) — **NONE, but the groundwork is better than expected**

Verified against `3oct`, not assumed:

| Thing | Reality |
|---|---|
| Machine-readable index | **does not exist** |
| Generator script | **does not exist** |
| Google Sheet | **does not exist** |
| `CHANGELOG.md` | **does not exist** |
| Standalone-tooling precedent | ✅ `/app/memory/tools/` holds `probe_config_flags.py`, `probe_restaurant_672.py`. Convention: plain script, `load_dotenv('/app/backend/.env')`, `os.environ[...]`, no fallbacks |
| **Google API client libraries** | ✅ **ALREADY INSTALLED** — `google-api-python-client==2.191.0`, `google-auth==2.49.0.dev0`, `google-auth-httplib2==0.3.0`, `oauthlib==3.3.1` in `backend/requirements.txt` |
| `gspread` | absent — and **not needed**; the official client covers the Sheets v4 API |
| Scheduler capability | ✅ platform cron infra exists (`.emergent/cron/` with `watch_crons.sh`, `dispatch_webhook.sh`). Not required by D-G2, but available if a safety-net run is ever wanted |

**Consequence: zero new dependencies.** `requirements.txt` does not need to change, which removes
the usual "install, freeze, restart" risk from this CR entirely.

## 3. Conflicts (Role 2 step 3)

| # | Conflict | Severity | Resolution |
|---|---|---|---|
| C1 | **`README.md` is narrative + tables, not just tables.** It holds the ID-scheme section, "What this registry is NOT", the Gate 0 block, audit findings F1–F7, closure reasoning, owner-decision tables. A generator that rewrites the whole file would destroy all of it | **HIGH** | The generator must own **only** the row regions, delimited by explicit markers (e.g. `<!-- BEGIN GENERATED: sprint-table -->` / `END`). Everything outside the markers is human-authored and must be preserved byte-for-byte. **This is the single most important constraint in this CR** |
| C2 | `CR-2026-10-04-004` rewrote the registry hours ago | LOW | Same session, same agent, no divergence. The 79-row dataset it produced is this CR's input |
| C3 | No other active item touches `/app/memory/change_requests/README.md` | — | clear |
| C4 | Sprint items B1/B2 touch `backend/`; this CR touches neither | — | **no file overlap, so no serialisation needed.** D-G15's re-ordering costs nothing technically |

## 4. Data flow (Role 2 step 4)

```
    owner decision (chat)  ─┐
    role output (QA, etc.) ─┼─► index.yml  ──► generator ──┬──► README.md  (marked table regions only)
                            │   (source of              │
                            │    truth, typed)          ├──► Google Sheets API v4 ──► 5 tabs
                            │                           │     (Summary · Needs You · In Flight
                            └─ audit (grep/ls) ─────────┤      · Not Moving · Closed)
                                                        └──► CHANGELOG.md (append-only)
```

One direction only (D-G1). The Sheet is a terminal output — nothing reads back from it, so there is
no conflict resolution, no last-write-wins rule, and no pull trigger to design.

**Auth path:** service-account JSON → `google.oauth2.service_account` → Sheets v4. The target Sheet
must be shared with the service-account email. Two new keys in `backend/.env`
(`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`), added by targeted edit —
never by rewriting the file (R11, protected-variable rules).

## 5. 🔴 The finding that shapes the whole CR — field coverage

Role 2 step 6 asks what is affected. The honest answer: **the index cannot be fully populated from
existing documents.** Scanned all 78 item folders:

| Field | Derivable | Missing | Verdict |
|---|---|---|---|
| `id`, `type`, `title` | 78/78 | 0 | ✅ trivial |
| `artefacts` | 78/78 | 0 | ✅ from the filesystem (`ls` each folder) |
| `code_markers` | 78/78 | 0 | ✅ from `grep` — this is the check that caught F1 |
| `related` | 74/78 | 4 | ✅ good |
| `risk` | 75/78 | 3 | ✅ good |
| `severity` | 74/78 | 4 | ✅ good |
| `status`, `status_note` | 79 rows | — | ⚠️ requires normalising prose into the enum — an act of **interpretation**, see below |
| `next_gate` | derived | — | ✅ by rule from `status` |
| `blocked_on` | 68/78 | 10 | ⚠️ partial |
| **`registered`** | **48/78** | **30** | 🔴 poor |
| **`wave_track`** | **38/78** | **40** | 🔴 poor |
| **`files`** | **30/78** | **48** | 🔴 poor |
| **`last_updated`** | **0/78** | **78** | 🔴 **impossible for history** |

Caveat on method, so the numbers are not over-trusted: the detector is a loose regex (any `P0`–`P3`
token counts as a severity hit), so these are **optimistic upper bounds**. True coverage is lower.

### Why `last_updated` cannot be reconstructed

- Filesystem mtimes are uniform: **75 of 78 folders read `2026-10-04`** — the date the repo was
  cloned into this pod. The other 6 are ones this session touched.
- Git cannot help: the repo arrived as a fresh clone, and every folder landed in a single deploy
  commit.

So `last_updated` must start accumulating **from the first generation forward** and be blank or
"unknown" for history. Any other treatment would fabricate dates — the same mistake the `02-XX`
rename would have made.

### `status` normalisation is interpretation, not extraction

Current status cells are prose. Mapping them to one of 13 enum values is a judgement call, and in
my own earlier bucketing script **7 of 92 rows could not be classified at all**. Under the ROLE 13
constraint *"records but never adjudicates"*, a registrar may not invent these. They must be set
from each item's own documents (as `CR-2026-10-04-004` did for the 23 backfilled rows) and anything
ambiguous escalated to the owner rather than guessed.

## 6. Why risk is LOW — and the one thing that isn't

Confirmed, not inherited from intake:

| Factor | Assessment |
|---|---|
| Application code | **none touched** — `backend/`, `frontend/` untouched |
| Customer impact | **zero** — no runtime path, no route, no bundle |
| New dependencies | **none** (§2) |
| Write path into the registry from outside | **none** (D-G1 one-way) |
| Reversibility | total — delete the script, the index and the Sheet; `README.md` restorable from git |
| **Residual risk** | **C1.** A generator that mishandles its markers could wipe the narrative half of a 437-line registry — including the audit findings and closure reasoning written today. Mitigation: marker-delimited regions, a dry-run diff mode, and a guard that aborts if any non-generated region would change |

That residual is a **tooling** risk, fully containable in the implementation plan, and it does not
touch the product. Hence LOW overall — but the marker guard is not optional.

## 7. Owner decisions — **ALL FOUR RESOLVED** (same session)

| # | Decision | Ruling | Consequence |
|---|---|---|---|
| **O-G1** | low-coverage fields (`registered` 30, `wave_track` 40, `files` 48 missing) | **Blank initially, then authored by hand in a 78-item pass** | ⚠️ *Interpretation flagged:* the owner's answer quoted both options, read as "ship blank, then do the hand pass". The hand pass is a **78-item manual authoring task** and is scoped as a **separate work item**, not folded silently into this CR. To be confirmed at the implementation gate |
| **O-G2** | `last_updated` for history | **Blank until first touched** | no fabricated dates; the field accumulates from the first generation forward |
| **O-G3** | markdown generation scope | ✅ **Option (c) — generate the SHEET ONLY. `README.md` stays hand-maintained** | **C1, the highest residual risk in this CR, is eliminated.** No markers, no byte-diff guard, no risk of destroying the narrative sections. Roughly half the work. New consequence in §7.1 |
| **O-G4** | ambiguous statuses | **Escalate each to the owner** | consistent with the ROLE 13 constraint *"records but never adjudicates"*. No status is ever guessed or defaulted |

### 7.1 🔴 New consequence of O-G3 — divergence replaces destruction

Option (c) removes the dangerous coupling, but it introduces a milder one that must be designed for,
not discovered later: **`index.yml` and `README.md` will both hold status, and nothing keeps them in
step.** The "one source, two renderings" benefit of the original design is given up.

Proposed handling, for the implementation plan:

1. **`index.yml` is authoritative for tracking** (status, severity, gate, queues). It feeds the Sheet.
2. **`README.md` remains authoritative for narrative** — the ID scheme, audit findings F1–F7,
   closure reasoning, owner-decision tables. None of it is machine-generated.
3. **The generator's audit reports divergence between the two** on every run, as a dedicated section
   of the change log. Divergence then surfaces loudly instead of rotting silently — which is exactly
   how `CR-2026-09-12-005` came to read "CLOSED, safety net live" while its suite could not run.

Also unaddressed by design: the **6 items that appear as rows in two different tables**
(`CR-2026-07-03-007`, `-011`, `CR-2026-07-04-002`, `-003`, `-004`, `CR-2026-09-12-001`) stay as they
are, since the markdown is no longer regenerated. The divergence audit will flag them.

### 7.2 Making "never update from the Sheet" physically true, not just procedurally true

Owner confirmation (same session): **status is never updated from the Sheet, and a change log is
always generated for the last changes.** D-G1 and D-G10 already state this. One gap remains between
the design and the tool:

**Google Sheets will still let you type into a cell.** Nothing reads it back, so such an edit is not
"rejected" — it is silently overwritten on the next regeneration, with no trace of what it said.
That is the worst of both worlds: the edit feels accepted and then vanishes.

Three mitigations for the implementation plan, in order of preference:

1. **Protect every range** via the Sheets API (`addProtectedRange`) so the owner's own account gets a
   warning on edit — "this sheet is generated; edit `index.yml` instead". Costs one extra API call
   per tab.
2. **A banner row** on each tab: *"GENERATED — do not edit. Source: `change_requests/index.yml`.
   Last generated: <timestamp>."*
3. **Overwrite reporting** — if a regeneration replaces a cell whose value differs from what the
   generator last wrote, record it in the change log under "overwritten local edits" rather than
   discarding it silently.

(1) and (2) together make the rule self-evident at the point of use. (3) is the safety net for the
case where someone edits anyway.

### Change log — scope confirmed

| Property | Value |
|---|---|
| Location | `memory/change_requests/CHANGELOG.md`, **append-only** |
| Trigger | every regeneration, without exception |
| Scope | **all field changes since the previous generation** — not only status |
| Entry fields | `id` · `field` · `from → to` · `authority` (owner smoke / QA / role output) · `date` |
| Empty case | an explicit **"no changes since <timestamp>"** line. Silence is never the output |
| Echoed | in chat at the same time, so the owner sees it without opening a file |

### Original options (retained for the record)


Four, all consequences of §5. None can be answered by reading code:

| # | Decision | Options |
|---|---|---|
| **O-G1** | **Low-coverage fields** (`registered` 30 missing, `wave_track` 40, `files` 48) | (a) leave blank and fill opportunistically as items are touched · (b) author them by hand now in a 78-item pass · (c) drop the three columns · (d) blank now, revisit after the first generation |
| **O-G2** | **`last_updated` for history** | (a) blank until first touched · (b) literal `"unknown"` · (c) seed everything with the generation date — **not recommended, it fabricates history** |
| **O-G3** | **Keep the 11 existing tables or collapse them?** Also: **6 items currently appear as rows in two tables each** (`CR-2026-07-03-007`, `-011`, `CR-2026-07-04-002`, `-003`, `-004`, `CR-2026-09-12-001`) — a live drift vector, since the same item can show two different statuses | (a) one canonical generated table + keep the narrative sections · (b) regenerate all 11 sections, deduplicating by ID · (c) leave the markdown alone entirely and generate **only** the Sheet |
| **O-G4** | **Ambiguous statuses** — where an item's documents do not clearly map to one of the 13 values | (a) escalate each to the owner · (b) default to `REGISTERED` and flag in the change log |

**O-G3 option (c) deserves a look.** Generating only the Sheet avoids C1 — the highest residual
risk in this CR — entirely, and the markdown registry stays hand-maintained as it is today. It gives
up the "one source of truth, two renderings" benefit, but it is materially safer and roughly half
the work. Planning's view: worth taking if the Sheet is what you actually want to live in.

## 8. Files that WILL change (Role 2 step 11)

Nothing is written until the implementation gate opens; this declares intent.

| File | Action | Risk |
|---|---|---|
| `memory/change_requests/index.yml` | **new** — typed index, 78 records | LOW |
| `memory/tools/registry_sync.py` | **new** — generator, auditor, change-log writer | LOW |
| `memory/change_requests/CHANGELOG.md` | **new** — append-only | LOW |
| ~~`memory/change_requests/README.md`~~ | ❌ **NOT TOUCHED** — O-G3 ruled Sheet-only generation. **C1 eliminated** | — |
| `backend/.env` | **+2 keys** by targeted edit only | LOW — never rewrite the file |

## 9. Files that WILL NOT be touched

`backend/server.py` · anything under `backend/` other than the two `.env` keys · all of
`frontend/` · `requirements.txt` (no new deps) · `package.json` · the frozen contract §1–§6 ·
`OWNERSHIP_MAP.md` · the operating prompt and addendum — **including the ROLE 13 addition and the
held §10 correction, both still owner-gated (§7)** · any item's substance or status, which this CR
mirrors rather than re-adjudicates · the 5 Code-Correctness Sprint items.

## 10. Verification matrix (Role 2 step 10)

| # | Check | Method | Pass condition |
|---|---|---|---|
| V1 | Index covers every item | count vs `ls` | 78 records, 0 orphans, 0 missing |
| V2 | ~~Narrative sections survive regeneration~~ → **`README.md` is never written** | `git diff` after a full run | **0 changes to README.md** (O-G3) |
| V3 | Round-trip stability | generate twice | second run produces no diff |
| V3b | **Divergence audit works** (§7.1) | set a status in `index.yml` that differs from `README.md` | divergence reported in the change log |
| V4 | Sheet matches index | compare row counts and a field sample per tab | exact match, 5 tabs |
| V5 | Tab rules correct | status-based assertion | every item appears in exactly one of Needs You / In Flight / Not Moving / Closed |
| V6 | Change log fires | change one status, regenerate | one entry with field, from→to, authority, date |
| V7 | "No changes" is explicit | regenerate with no edits | log says so rather than emitting nothing |
| V8 | Audit catches drift | add a fake folder, regenerate | reported as unregistered |
| V9 | `code_markers` accuracy | spot-check 5 known-true IDs | matches `grep` |
| V10 | No secret in any artefact | grep index, Sheet and log | zero credentials; service-account JSON stays outside the repo |
| V11 | Dry-run mode writes nothing | run with `--dry-run` | no file or API mutation |
| V12 | Owner smoke | owner opens the Sheet | Summary legible, Needs You correct |

## 11. Severity and risk re-verification (Role 2 step 5)

**Severity P2 — confirmed.** No customer impact; a workaround exists (the markdown).
**Risk LOW — confirmed**, with the §6 caveat that C1 is a real hazard to project records and must be
mitigated by markers, a dry-run mode and the V2 guard.

Note for the record: the owner has prioritised this **ahead of sprint item B1** (D-G15). Since the
file sets do not overlap (C4), that is purely a sequencing choice with no technical cost. It does
leave three money-path items awaiting owner smoke and `/api/status` unanswered.

---

---

# REVISION 3 — gate-based Sheet layout

The owner re-opened the layout in a brainstorm and chose a **pipeline** model over the
action-grouped one. Rationale, in the owner's framing: the Sheet should show *where work physically
sits in the gate flow*, not what the owner should do about it. **D-G14 (Option B, 5 tabs) is
superseded.**

## 12. Tab model — 8 tabs (supersedes D-G14)

| # | Tab | Holds | ~Today |
|---|---|---|---|
| 1 | **Summary** | CTO dashboard — §14 | — |
| 2 | **Intake** | Gate 1 | ~31 |
| 3 | **Planning** | Gates 2 + 3 together (impact analysis + implementation plan) | **~4** |
| 4 | **Implemented** | Gates 5 + 6 (built, self-tested) | ~15 |
| 5 | **QA** | Gates 7–9 | ~6 |
| 6 | **Smoke** | Gate 10 | ~6 |
| 7 | **Closed** | delivered **and** terminal-but-undelivered — parked, deferred, reverted, tombstoned all fold in here (D-G18) | ~26 |
| 8 | **Blockers** | cross-cutting, **items repeat here by design**, grouped by party | ~12 |

**Owner Approval (gate 4) gets no tab** (D-G17) — it is expressed as a `BLOCKED-YOU` badge wherever
the item already sits.

### 12.1 The funnel is the headline

```
Intake       ████████████████████████████████  31
Planning     ████                               4
Implemented  ███████████████                    15
QA           ██████                             6
Smoke        ██████                             6
Closed       ██████████████████████████        26
```

31 registered against 4 planned: the project registers faster than it decides. The bottleneck is
the **Planning gate**, not engineering capacity. This shape is arguably the single most valuable
output of the whole CR, and it is visible only once the data is in one place.

### 12.2 ✅ No schema change needed for tab routing

The obvious worry — "gate tabs need a `gate_reached` column" — is unfounded. The tab is derivable
from the 17 columns already agreed:

> **tab = the gate immediately preceding `next_gate`** (i.e. the last gate completed),
> with all terminal statuses absorbed into **Closed**.

Validated against real items:

| Item | `status` | `next_gate` | → Tab | Correct? |
|---|---|---|---|---|
| CR-2026-08-03-001 (716) | `HELD` | Implementation | **Planning** + `BLOCKED-YOU` | ✅ plan is written, owner held it |
| CR-2026-10-03-004 | `BLOCKED` | Planning | **Intake** + `BLOCKED-CRM` | ✅ |
| CR-2026-02-XX-001 | `AWAITING_OWNER_SMOKE` | Closure | **Smoke** | ✅ |
| CR-2026-10-03-002 | `QA_PASSED` | Smoke | **QA** | ⚠️ see O-G7 |
| CR-2026-10-04-003 | `REVERTED` | — | **Closed** | ✅ |

This is why **tab = where it sits** and **badge = whether it is moving** must stay two separate
facts. A single field would flatten "plan finished, owner held it" and "intake finished, CRM silent"
into the same cell.

## 13. Blockers tab — grouped by party, not by item (D-G19)

A flat per-item list hides the structure. Blockers here form **chains up to three deep**:

```
CR-2026-10-03-006 (franchise outlet picker)
    ├── blocked on O-13 ................................ POS
    └── must follow CR-2026-09-15-004
                       ├── blocked on O-14 ............. POS
                       └── blocked on F3 ............... OWNER
```

Two items, four blockers, two parties. A flat tab shows two rows and communicates nothing.

**Sections by party**, each sorted by wait duration:

| Party | Items | What is owed |
|---|---|---|
| **POS** | ~4 | O-13 response shape · O-14 profile path · 716 flag backfill |
| **CRM** | ~3 | CR-093 · CR-094 · CR-096 |
| **OWNER** | ~6 | `/api/status` ruling · F3 · ROLE 13 · CR-2026-10-04-005 Q1–Q4 · 3 pending smokes |
| **INTERNAL** | ~3 | behind another of our own CRs |

Value: *"POS owes three answers and they block four items"* is the conversation to have with POS.
That sentence does not exist anywhere today.

### 13.1 🔴 This one DOES need a schema change

`blocked_on` is currently a **single free-text string**. Grouping by party, sorting by age and
rendering chains all require structure it cannot carry. Needed:

| Field | Type | Example |
|---|---|---|
| `blocked_on.party` | enum | `POS` · `CRM` · `OWNER` · `OPS` · `INTERNAL` |
| `blocked_on.ref` | string | `O-13` · `CR-093` · `F3` · `CR-2026-09-15-004` |
| `blocked_on.since` | date | when the wait started |

An item can hold **several** of these (CR-2026-09-15-004 has two). So `blocked_on` becomes a **list
of records** in `index.yml`, flattened to text for display. Column count moves **17 → 19** if
rendered as separate columns, or stays 17 with one rendered cell. Owner decision **O-G5**.

## 14. Summary tab — CTO dashboard (D-G20)

Four blocks, readable in ten seconds:

**Block 1 — pipeline funnel** (§12.1)

**Block 2 — risk at a glance**

| Metric | Today |
|---|---|
| Open P0 / P1, oldest named | — |
| 💰 **Money-path items open** | **3** — delivery charge · takeaway surcharge · payment-path timeouts |
| 🔥 Items touching hotspot files | ReviewOrder · server.py · CartContext · LandingPage |
| Security items open | **1** — UAT secrets / PII |

**Block 3 — who is holding us up** (§13)

**Block 4 — trust indicators** (can the registry be believed?)

| Metric | Today |
|---|---|
| QA debt — built, never verified | **4** |
| Live code markers with status still `REGISTERED` | 0 ← the F1 tripwire, now permanent |
| `index.yml` ↔ `README.md` divergence | 0 ← §7.1 |
| No movement in 30 / 60 / 90 days | ⚠️ unavailable at first, §15 |

Block 4 is what makes the dashboard trustworthy rather than merely pretty: it answers *"is this
telling me the truth?"* before anyone acts on blocks 1–3.

### 14.1 🔴 "Closed: 26" would mislead a CTO

Folding parked/deferred/reverted/tombstoned into Closed is right for the **tab**, wrong for the
**metric**. Roughly 11 of the 26 were never delivered. The Summary must split it:

```
Closed: 26   →   Delivered 15   |   Dropped / Parked 11
```

**And a harder number still:** of those ~15 delivered, **exactly one** — `CR-2026-09-12-002` — has
passed owner smoke and been formally closed under §15. The rest are agent-QA'd at best.

```
Delivered 15   →   Owner-accepted 1   |   Awaiting owner 14
```

That cell is the most honest number the project can produce, and it is the one most likely to be
mis-reported upward as "15 shipped". Planning's recommendation: put it on the dashboard.

## 15. Badges (D-G17) — and what they cost

Implemented as Sheets **conditional-format rules set once**, not colour re-applied per run, so new
rows inherit formatting automatically.

| Badge | Source | Derivable? |
|---|---|---|
| 🚫 `BLOCKED-POS` / `-CRM` / `-YOU` / `-INTERNAL` | `blocked_on.party` | ✅ once O-G5 lands |
| ⏸ `PARKED` / `DEFERRED` | `status` | ✅ |
| 🔴 `P0` / `P1` | `severity` | ✅ 74/78 |
| 🔥 `HOTSPOT` | `files` ∩ hotspot list | ⚠️ **partial — `files` is only populated for 30/78** |
| 💰 `MONEY-PATH` | — | 🔴 **not derivable — needs manual tagging** (O-G6) |
| ⏳ `AGE` | `last_updated` | 🔴 **blank for history** — mtimes are uniform (75/78 = clone date), git has one deploy commit. Accumulates from first generation forward only |

Two of the six most valuable badges cannot be fully computed from existing data. Neither is a
blocker — both degrade gracefully — but the dashboard will look sparse in those columns on day one
and should not be presented as complete.

## 16. Owner decisions from rev 3 — **ALL FOUR RESOLVED** (owner: *"as suggested"*)

| # | Decision | Ruling |
|---|---|---|
| **O-G5** | `blocked_on` structure | ✅ **Option (a)** — a **list of `{party, ref, since}` records in `index.yml`**, rendered to a single cell on the gate tabs. **Column count stays 17.** The Blockers tab, being a generated view, renders `party` / `ref` / `since` as its own columns for grouping — no change to the agreed schema |
| **O-G6** | `MONEY-PATH` tagging | ✅ **Option (b)** — mechanism approved: Planning proposes, owner ratifies. **List proposed in §16.1 — still needs the owner's eyes before it is authoritative** |
| **O-G7** | `QA_PASSED` vs `AWAITING_OWNER_SMOKE` | ✅ **Option (b) — keep both tabs.** Chosen over merging because the owner's brainstorm explicitly asked to see *"what is QA'd and what is smoke test"* as separate things. Boundary defined in §16.2 |
| **O-G8** | Dashboard honesty split | ✅ **Option (a)** — show **both** breakdowns: Delivered / Dropped, and Owner-accepted / Awaiting owner |

### 16.1 `MONEY-PATH` candidates — PROPOSED, awaiting ratification

Derived by keyword density across each item's documents (`razorpay`, `delivery_charge`,
`order total`, `subtotal`, `gst`, `tax`, `payment`, `idempoten`), then filtered by whether the item
can actually change a figure a customer sees or is charged:

| Item | Hits | Why it is money-path |
|---|---|---|
| `BUG-2026-02-XX-001` | 178 | delivery charge renders as zero — **live P1** |
| `CR-2026-02-XX-002` | 169 | takeaway surcharge, shipped estate-wide |
| `CR-2026-06-17-004` | 74 | delivery **GST** key — tax on the total |
| `CR-2026-04-11-001` | 49 | order placement fixes — **no QA artefact exists** |
| `CR-2026-02-XX-001` | 22 | wraps the **Razorpay** write in a 15 s timeout |
| `CR-2026-10-04-005` | 16 | the surcharge scope deviation |
| `INV-2026-07-03-001` | 15 | order-create **idempotency** — double-charge exposure |

**Recommend tagging all seven.** Two notes for the owner:

- `INV-2026-07-03-001` (idempotency / double charge) is the one I would least expect to be on a
  mental list of money items, and arguably the most severe class of defect on it.
- `round_up_payload_gap_investigation` scored 56 but is one of the **two folders with no ID at all**
  (finding F1/F5 territory). It cannot be tagged because it cannot be indexed. Flagging it here
  rather than letting it fall through the gap a second time.

### 16.2 QA vs Smoke tab boundary (O-G7)

| Tab | Means | `status` |
|---|---|---|
| **QA** | agent/testing QA has passed; owner smoke not yet scheduled | `QA_PASSED` |
| **Smoke** | queued for or undergoing owner smoke | `AWAITING_OWNER_SMOKE` |

Transition `QA_PASSED` → `AWAITING_OWNER_SMOKE` is a deliberate act (smoke being requested), not
automatic — otherwise the QA tab would always be empty and the distinction the owner asked for would
be lost.

### Original options (retained for the record)


| # | Decision | Options |
|---|---|---|
| **O-G5** | `blocked_on` structure (§13.1) | (a) list of `{party, ref, since}`, rendered to one cell — stays 17 columns · (b) three separate columns — 17 → 19 · (c) keep free text and drop party grouping |
| **O-G6** | `MONEY-PATH` tagging (§15) | (a) owner tags them · (b) Planning proposes a list and owner ratifies — the obvious three are `BUG-2026-02-XX-001`, `CR-2026-10-04-005`, `CR-2026-02-XX-001` · (c) drop the badge |
| **O-G7** | `QA_PASSED` vs `AWAITING_OWNER_SMOKE` (§12.2) | these are nearly the same state, so the Smoke tab may duplicate QA. (a) merge into one tab · (b) keep both and let `QA_PASSED` mean "QA done, smoke not yet scheduled" |
| **O-G8** | Dashboard honesty split (§14.1) | (a) show Delivered / Dropped **and** Owner-accepted / Awaiting owner · (b) Delivered / Dropped only · (c) raw Closed count |

## 17. Verification matrix — rev 3 additions

| # | Check | Pass condition |
|---|---|---|
| V13 | Tab routing | every item resolves to exactly one gate tab via the §12.2 rule; 0 unrouted |
| V14 | Blockers repetition is intentional | blocked items appear in **both** their gate tab and Blockers; Summary totals do **not** double-count |
| V15 | Party grouping | every blocker row carries a party from the enum; 0 `UNKNOWN` |
| V16 | Funnel arithmetic | tab counts sum to 78 **excluding** Blockers |
| V17 | Honesty split | Closed = Delivered + Dropped; Delivered = Owner-accepted + Awaiting owner |
| V18 | Badge rules survive regeneration | conditional-format rules intact after a full run; new rows inherit |
| V19 | Graceful degradation | missing `files` / `last_updated` render blank, never a false negative |

## 18. Rev 3 impact on risk and files — **no change**

Risk stays **LOW**. The layout change is entirely in the generator's output shape: more tabs, richer
grouping, conditional formatting. It touches **no additional file**, adds **no dependency**, and
does not reintroduce C1 — `README.md` is still never machine-written (O-G3).

The only structural consequence is §13.1, and that is a change to a **new** file (`index.yml`) that
does not exist yet.

---

```text
Planning complete: CR-2026-10-04-006
Stage: Impact Analysis — REVISION 3 (gate-based layout)
Code reality: NONE (no index, generator, Sheet or changelog exists)
Risk: LOW (C1 marker-handling is the one real hazard; containable)
Files WILL change: memory/change_requests/index.yml (new) · memory/tools/registry_sync.py (new) ·
                   memory/change_requests/CHANGELOG.md (new) ·
                   memory/change_requests/README.md (marked regions only, pending O-G3) ·
                   backend/.env (+2 keys, targeted edit)
Files WILL NOT touch: backend/server.py · frontend/** · requirements.txt · package.json ·
                      contract §1–§6 · OWNERSHIP_MAP.md · operating prompt + addendum (ROLE 13
                      and §10 both owner-gated) · all sprint items
Owner decisions: O-G1..O-G8 ALL RESOLVED. Outstanding: ratify the 7 money-path items (§16.1),
                 rule on the ROLE 13 draft, confirm the 78-item hand-authoring pass is separate
Docs: change_requests/CR-2026-10-04-006-google-sheet-registry-mirror/IMPACT_ANALYSIS.md
Next: Implementation Plan (Role 2 step 9) — awaiting owner request
```
