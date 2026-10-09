# IMPACT ANALYSIS — AMENDMENT · CR-2026-10-04-006 onto registry-sheet-contract v1.2

> **🔴 Read §20–§23 (REVISION 3) first.** Contract **v1.2** merged 2026-10-06. **All three SO-raised
> defects are closed** — A and C in v1.1, **B in v1.2 as D-A8**.
> **D-A8 was resolved at THREE columns** (`Status` + `Registered` + `Closed`), against SO's
> one-column recommendation: §1 was reconciled *up* to §5.5, not §5.5 down to §1.
> **Nothing external blocks an implementation plan.** Rev 2's claim that the writable surface
> narrowed to one column is **superseded** — it is 3 of 22.
> **There is no v1.1.1**; earlier references to it mean v1.1.
> **Role:** 2 — PLANNING. **Stage: Impact Analysis only.**
> The owner opened Planning for *"impact analysis of CR-2026-10-04-006"*. Role 2 step 9 —
> *"Write Implementation Plan if requested"* — was **not** requested, so **no implementation plan is
> written here**. Gate 3 stays shut. **No code written** (§8 Role 2: *"Never code during Planning"*).
>
> **Date:** 2026-10-06 · **Amends:** `CR-2026-10-04-006` · **Supersedes:** `AMENDMENT_DESIGN_DRAFT.md`
> (Role 6 draft, 2026-10-05), which was written against contract **v1** and a **78**-item registry.
>
> This is the **second** impact analysis for this CR. The first (`IMPACT_ANALYSIS.md`, 520 lines,
> revisions 1–3) covers the original one-way generator and remains valid for it. This document covers
> **only the contract-alignment amendment** and its **21** changes.

---

## 1. Item verification (Role 2 step 1)

| Check | Result |
|---|---|
| Registered in `index.yml` | ✅ `CR-2026-10-04-006`, type CR, folder present |
| Registered in `README.md` | ✅ row present with full status detail |
| Intake complete | ✅ `INTAKE_DOC.md` rev 2 + the 2026-10-06 addendum (v1.1.1 accepted · 21 changes · risk MEDIUM) |
| Prior planning artefacts | ✅ `IMPACT_ANALYSIS.md` (rev 1–3), `IMPLEMENTATION_PLAN.md`, `AUTH_AMENDMENT.md` |
| Prior implementation | ✅ shipped 2026-10-05, exit gate 7/7, self-test 9/9 |
| Prior QA | ✅ `QA_HANDOVER.md`; **owner smoke never performed** |
| Role 2 authority for this pass | ✅ owner opened Planning, 2026-10-06, scoped to impact analysis |

**Verdict: properly registered. Planning may proceed.**

## 2. Code reality (Role 2 step 2) — **FULL baseline, NONE for the amendment**

This is not a greenfield item, which changes the risk profile materially.

| Element | Reality today |
|---|---|
| `memory/tools/registry_sync.py` | **599 lines, live, working.** Commands `bootstrap · audit · propose · sync [--dry-run]` |
| `memory/change_requests/index.yml` | **87 records**, validation PASS |
| Live Google Sheet | `Scan and Order issue tracker`, **9 tabs**, OAuth Desktop token at `/app/secrets/sheets_token.json` |
| Generated artefacts | `CHANGELOG.md`, `.registry_state.json`, `.registry_csv/` (9 CSVs) |
| Contract-aligned behaviour | **0 of 21 changes implemented** |

So the amendment is a **modification of working code against a live external surface**, not new
construction. Every change must preserve the 9 currently-passing verifications while altering the
shape of the only artefact four other projects' dashboard reads.

**Verified against source this session, not from documents:**

| Claim | Evidence |
|---|---|
| Status enum is still the legacy 13 values | `registry_sync.py:45-49` — `REGISTERED, PLANNED, IMPLEMENTED, QA_PASSED, AWAITING_OWNER_SMOKE, CLOSED, PARKED, BLOCKED, DEFERRED, HELD, REVERTED, TOMBSTONE, REPORT_WRITTEN` |
| Schema is 18 fields, not the contract's 22 | `registry_sync.py:56-61` — `FIELDS` list |
| Routing is by `next_gate`, not `Status` | `registry_sync.py:64-71` — `GATE_TO_TAB` |
| Tabs are 9 with Summary **first** | `registry_sync.py:78` — `TABS = ["Summary", "All Items", *GATE_TABS, "Blockers"]` |
| Header is on row 2, banner on row 1 | `.registry_csv/All_Items.csv:1` — `"All items — 86 total · … · READ-ONLY"` |
| `Blockers` has its own 6-column shape | `.registry_csv/Blockers.csv:2` — `Party,Ref,Since,Item,Item title,Severity` |
| Artefact detection is filename-exact | `registry_sync.py:80-87` — `ARTEFACT_FILES` dict keyed on exact names |
| `blocked_on` is a list of `{party,…}` dicts | `registry_sync.py:228-230` validates `blocker.get("party")` |

## 3. 🔴 Six deltas since the design draft was written — it is **stale in six places**

The draft is dated 2026-10-05 against contract **v1** and a **78**-item registry. Neither holds.
Planning from it unamended would ship the wrong thing.

| # | Draft says | Reality now | Consequence |
|---|---|---|---|
| **D1** | **21 columns** | contract v1.1 adds **`Money path` as column 22** (proposal P2, owner adopted) | §2's field map is short by one. `money_path` moves from *index-only, surfaced as a count* to a **mirrored column**. The **F5 count-only workaround is superseded** |
| **D2** | Two-way accepts **Status + Registered + Closed** | owner ruling: **`Status` only**. `Last updated` is explicitly *"agent-computed-only; never accepted from the sheet"* (v1.1 §3 col 15, §5.5) | Phase B step 4's allow-list shrinks from 4 columns to **1**. Three columns move to the REJECTED path |
| **D3** | `Last updated` seeded to a blanket `2026-10-05` (F3) | **F3 withdrawn.** Owner's method adopted: derived from each item's **last gate date**, verified 78/78 | **V36 is wrong as written.** Seeding is replaced by derivation, and it must now run over **87** |
| **D4** | **OPEN-1..OPEN-4 are open blockers** | **all four closed.** P4 scopes `Assignee` to `All Items` → draft option (ii) is correct · Summary = **two** separate lines · human-typed Status **persists while pending**, agent validates and logs agreement/disagreement · the `Last updated` self-feed **dissolves** under D2 | The draft's §8 is spent. Four behavioural rules it said *"must be settled before they are written"* now are |
| **D5** | **78** records · *"78 rows"* · *"0 routed + 78 unrouted"* | **87** records after the 2026-10-06 intake pass | Every count in §2, §5, V34, V36, V38 is stale. Re-bootstrap now covers 87 |
| **D6** | **19** changes | **21** — `#20` artefact detection filename-exact, `#21` 16 of 87 titles over the contract's "one line" (longest 362) | Both found during the 78 → 80 backfill, owner-ruled to stay folded in |

**None of these increases risk.** D4 removes four blockers, D2 narrows the dangerous surface from
four columns to one. D1/D3/D5/D6 are corrections of scope, not of difficulty.

## 4. 🔴 Finding A — the contract **on disk** is v1.1 and still lists the defects as open

The owner confirmed in chat that the dashboard agent **accepted v1.1.1**. But
`memory/control/registry-sheet-contract.md` reads:

> `Version 1.1 · 2026-10-06`
> *"Validation of v1.1 against the Scan & Order acceptance checklist is recorded in
> `registry-sheet-contract-v1.1-proposal.md` — **2 defects and 1 pre-existing contradiction remain
> open**… Those are tracked, not applied here."*

So the canonical document still carries **Defect A** (§5.3 never rewritten, so `APPROVED` is an
orphaned enum value with no defined way for the owner to write it), **Defect B** (§1 *"two-way for
Status only"* vs §5.5 accepting three columns), and **Defect C** (Change Log has no who-writes spec).

**Why this blocks the plan, not the analysis.** Three of the 21 changes — the Change Log's
`Decision` lifecycle, the approval path, and the two-way allow-list — are written *directly against
the clauses that are still defective in the file on disk*. An implementation plan would have to pick
between the accepted-but-unseen v1.1.1 wording and the stale text, and either choice is a guess.

**Owner decision required (D-A1):** supply the v1.1.1 text so it can be merged as canonical, or
rule that SO implements against its own recorded reading of the three fixes. **Recommendation:** get
the text. This document is read by five projects; a local interpretation would diverge silently.

Note that Defect B is already *de facto* resolved by the owner's "Status only" ruling (D2) — the
ruling picks §1 over §5.5. Defects A and C remain genuinely unresolved in writing.

## 5. 🔴 Finding B — the Intake tab will go **empty again** the moment this ships, unless the status write is in the same pass

This is the most consequential finding in this analysis and it is **new** — it did not exist when
the draft was written, because the condition that creates it was created by yesterday's intake pass.

**The mechanism:**

1. Today, routing keys off **`next_gate`** (`registry_sync.py:64-71`). Four of the seven rows I
   filed on 2026-10-06 carry `next_gate: Planning`, which is why the **Intake tab shows 3 items** —
   the first time any gate tab has been non-empty.
2. Change #2 of the amendment **retires `next_gate`** and routes by **`Status`** instead, one-to-one
   per contract §2.
3. All 87 `Status` cells are **blank**, and cannot be filled until change **#10** ships the 8-value
   enum — writing `INTAKE` today fails the validator at `registry_sync.py:222-227`.

**Net effect if the changes ship in isolation: 3 routed → 0 routed. The sheet regresses to the
all-tabs-empty state that deviation D1 was invented to work around.** The owner would, reasonably,
read that as the amendment having broken the tool.

**Mitigation — a sequencing constraint, not extra work.** The enum change (#10), the layout changes,
and the single status write from `STATUS_ADJUDICATION.md` must land in **one pass**, in that order,
before the first post-amendment `sync`. This was already recorded as a constraint in
`STATUS_ADJUDICATION.md` (*"⛔ `index.yml` deliberately NOT written"*). What is new is that it is now
a **regression risk**, not merely a sequencing preference.

The implementation plan must carry this as an exit-gate condition: **no `sync` is run against the
live sheet between the enum change and the status write.**

## 6. Conflicts (Role 2 step 3)

| Potential conflict | Assessment |
|---|---|
| Other work in `registry_sync.py` | **None.** Sole owner is this CR; `git status` shows the file unmodified since its own implementation |
| The 2026-10-06 intake pass (7 new rows) | **Compatible.** All seven use the current schema (`severity`, `wave_track`), so the re-bootstrap renames them with the other 80. Titles were authored to the one-line rule, so none adds to `#21`'s backlog |
| `CR-2026-09-12-006` (backend modular split) | **No overlap.** Different file tree; this CR touches zero application code |
| `CR-2026-07-04-004` (client telemetry) | No overlap with this CR. *(It is a reuse target for `BUG-2026-10-06-001`, unrelated here)* |
| `INV-2026-08-06-001` reconstruction | Added `code_markers: true` on a row; no schema effect |
| ROLE 13 — REGISTRAR prompt edit (change #19) | **Blocked by §7** — editing the operating prompt needs owner approval. Independent of the code changes; can ship separately |
| Live sheet contains a 2026-09-27 hand-made export | Already superseded — the sheet was rebuilt on 2026-10-05. **No longer a risk** |

**No blocking conflicts.**

## 7. Data flow (Role 2 step 4)

**Today — one directional arrow, no return path:**

```
index.yml ──bootstrap/propose──▶ in-memory records ──render──▶ batchClear + write ──▶ Google Sheet
                                           └──▶ .registry_csv/ (9 local CSVs)
                                           └──▶ CHANGELOG.md, .registry_state.json
```

**After the amendment — a second arrow appears, and it is the entire risk:**

```
                   ┌──── Phase A: read All Items!A2:V + Change Log!A2:I  (col M excluded) ◀─┐
                   ▼                                                                        │
index.yml ──▶ records ──▶ Phase B diff ──▶ Change Log rows (PENDING / REJECTED)             │
                   │                                                                        │
                   └──▶ Phase C: render 87 rows, overlay PENDING, write A:L + N:V ──────────┘
                                                                     │
          owner approves in chat ──▶ Phase D: `apply` ──▶ ✍️ index.yml MUTATED ──▶ re-push
```

**The single new hazard, stated precisely:** `index.yml` — the machine source of truth, and the input
to four other projects' dashboard — becomes **writable from a human-edited Google Sheet**. That is
the whole of why risk moves LOW → MEDIUM.

**Three structural containments, all verifiable:**

| Containment | Where | Verified by |
|---|---|---|
| Diffing is keyed on **`ID`** (column B), never on row position | Phase A step 1 | V27, V30 |
| The accepted-column allow-list is now **`Status` alone** (D2) | Phase B step 4 | V27, V28 |
| `index.yml` mutates **only** via an explicit `apply` command — never during `sync` | Phase D | V27 (`index.yml` unchanged after a sheet edit), V32 |

## 8. Risk (Role 2 step 5) — **MEDIUM confirmed**, and now better contained than when rated

Owner rated MEDIUM under ruling R2 on 2026-10-05. **Re-verified and upheld.** Two factors have since
*reduced* the exposure:

- **D2** narrows the writable surface from 4 columns to **1** (`Status`). Three date columns move to
  the REJECTED path, and `Last updated` becomes structurally unwritable — which is also what
  **dissolves OPEN-4's self-feeding diff entirely**, rather than papering over it.
- **D4** closes four behavioural unknowns. The draft itself said they *"must be settled before they
  are written, not after"*; they are settled.

**Why it does not drop to LOW:** a write path into the machine registry exists where none did
before, and the registry feeds a cross-project dashboard. The failure mode is **silent wrong data in
four other projects**, not a local crash.

**Two risks that are unchanged and un-mitigated:**

1. **Column M is protected by omission, not by permission.** Nothing in the Sheets API prevents a
   future edit from including M in a range. V25 asserting on the *request payload* is the only guard;
   the real guard — protected ranges, plan phase **P7** — was deliberately never built.
2. **🔴 OAuth refresh-token lifetime — unanswered, now the 6th ask.** Contract §5.1 makes REGISTRAR
   run on **every** registry mutation. If the consent screen is in *Testing*, Google expires the
   refresh token every 7 days and the mirror **silently stops updating** while four other projects'
   dashboard keeps reading the stale tab. Declining the Drive scope (F1b) did not affect this.
   **This is the single largest operational risk in the item and it is not a code problem.**

## 9. Affected files and downstream consumers (Role 2 step 6)

### Files that WILL change (Role 2 step 11)

| File | Change | Scale |
|---|---|---|
| `memory/tools/registry_sync.py` | all 21 changes: `STATUSES` 13 → 8 · `FIELDS` 18 → 22 · `TABS` 9 → 10, Summary last · routing by Status · header row 1 · `Blockers` to the full column set · read-merge-write · diff · `apply` · artefact suffix match (#20) · title truncation (#21) | the whole file; ~599 lines today |
| `memory/change_requests/index.yml` | re-bootstrap into the new schema; then the **single 87-row status write** | all 87 records |
| `memory/change_requests/CHANGELOG.md` | appended by the run | append-only |
| `memory/tools/.registry_state.json` | **rebuilt in the same step** as the re-bootstrap | regenerated |
| `memory/tools/.registry_csv/*.csv` | regenerated; 9 → 10 files, 22 columns | regenerated |
| `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` | change #19 only — ROLE 13 REGISTRAR. **§7 owner approval required; can ship separately** | 1 new role block |

### Files that WILL NOT be touched (Role 2 step 11)

**Explicit, and an exit-gate assertion:**

- `backend/server.py` — and no new route is added. The `AUTH_AMENDMENT.md` decision stands
- `backend/requirements.txt`, `frontend/package.json` — **no new dependency**; the token exchange is
  plain `requests`, `google-auth-oauthlib` was never installed
- `frontend/**` — nothing
- `tests/**` — nothing
- `backend/.env` — `GOOGLE_SHEET_ID` already present and already trimmed to the bare ID
- `/app/secrets/sheets_token.json` — unchanged, mode 600, `.gitignore:35`
- `memory/change_requests/README.md` — **must stay byte-identical across a sync** (ruling O-G3,
  currently verified by V2 via md5)
- Any other item's folder or artefacts

### Downstream consumers — **this is the part that is not local**

| Consumer | Exposure |
|---|---|
| **Tech Dashboard** | Reads `All Items` from all five project sheets and concatenates on `Project` (contract §8). A wrong header row, a missing column, or a shifted column position **breaks the read for all five**, not just SO |
| POS · CRM · Central Inventory · Infra | Share the contract. SO is the **first** project to implement v1.1/v1.1.1 — our column order and header strings become the de facto reference |
| Dashboard's write path | Writes **only** `Assignee` on `All Items` (§8). Our column M handling must not disturb it — V25, V26 |
| `STATUS_ADJUDICATION.md` | The authoritative input for the 87-row status write |
| `registry_sync.py audit` | Used by every future intake pass to prove 0 orphans |

**Blast radius: MEDIUM-to-LARGE on reporting, ZERO on the customer app.** No customer-facing
behaviour can change — the item cannot touch `backend/` or `frontend/` by construction.

## 10. Verification matrix (Role 2 step 10)

**Carried forward — 9, all currently passing, all must keep passing:** V1 (record count, 0
orphans/duplicates) · V2 (`README.md` byte-identical by md5) · V3 + V7 (second run reports no
changes) · V8 (planted folder detected) · V11 (`--dry-run` writes nothing) · V16 (routing sums) ·
V20 (invalid enum → exit 1) · V21 (missing env → fail fast, no silent default).

**New — 17 from the draft, with four corrected for the D1–D6 deltas:**

| V | Check | Change vs draft |
|---|---|---|
| V22 | Header on row 1 of all **10** tabs; no banner anywhere | — |
| V23 | Exactly **22** columns, contract order, exact header strings | **corrected: 21 → 22 (D1)** |
| V24 | `Project` = `SO` on all **87** rows | **corrected: 78 → 87 (D5)** |
| V25 | **Column M absent from every write request** — assert on the request payload | — |
| V26 | Type into `Assignee`, run `sync` twice → value survives both | — |
| V27 | Edit `Status` on `All Items` → one `PENDING` row; `index.yml` **unchanged**; edit **still visible** after the push | — |
| V28 | Edit a non-`Status` column → `REJECTED` with the §5.5 reason; cell reverts next push | **widened: now covers `Registered` and `Closed` too (D2)** |
| V29 | Edit `Status` on a **stage** tab → `REJECTED`, *"edit on a derived tab"* | — |
| V30 | Hand-add a row with an unknown ID → `REJECTED`, *"unknown ID"* | — |
| V31 | Invalid `Status` value → `REJECTED`, *"not a contract Status value"* | — |
| V32 | `apply` → `index.yml` updated, row `APPLIED`, `Decided at` stamped, sheet re-pushed | — |
| V33 | `Change Log` never cleared or reordered across 3 consecutive runs | — |
| V34 | Summary Status counts **+ Unrouted = `All Items` row count** (owner's acceptance criterion) | now against **87** |
| V35 | Tab order matches §2 exactly, **Summary last** | — |
| V36 | `Last updated` **derived from each item's last gate date**, 87/87 populated; dates later than the session date **flagged, not accepted** | **rewritten: blanket seeding withdrawn (D3)** |
| V37 | Two blockers on one item → column 11 shows the **older** party; both appear in `Status note` | — |
| V38 | `.registry_state.json` rebuilt during re-bootstrap → first post-migration run logs **0** changes, not 87 | now **87** |

**Five further verifications this analysis adds:**

| V | Check | Why |
|---|---|---|
| **V39** | `Money path` renders in column **22** as `YES`/`no`, and columns 1–21 hold their exact v1.1 positions | D1. A shifted column breaks the dashboard for all five projects |
| **V40** | **Gate tabs are non-empty after the status write** — `INTAKE` ≥ 32, `SMOKE` ≥ 9, `CLOSED` ≥ 13, and routed + unrouted = 87 | Finding B. This is the regression guard |
| **V41** | **No `sync` is executed against the live sheet between the enum change and the status write** — asserted by sequence, not by inspection | Finding B. Prevents publishing an all-empty sheet |
| **V42** | `#20` — artefact suffix matching populates `Artefacts` for the two backfilled folders (7 documents between them, one a full QA report, both currently **blank**) | #20 is otherwise untestable |
| **V43** | `#21` — **0** of 87 titles exceed the contract's one-line limit after truncation, and every truncated title's full text survives in `Status note` or `Notes` | #21 is a contract-compliance breach, not cosmetic |

**Total: 9 retained + 22 new = 31 verifications.**

## 11. Owner decisions surfaced (Role 2 step 7)

| # | Decision | Blocking? | Recommendation |
|---|---|---|---|
| **D-A1** | **Supply the accepted v1.1.1 text**, or authorise SO to implement against its own recorded reading of Defects A and C. The file on disk is still v1.1 and still lists them as open (§4) | **BLOCKS the implementation plan.** Does not block this analysis | **Get the text.** Five projects read this document; a local interpretation diverges silently |
| **D-A2** | **🔴 OAuth consent publishing status — Testing or Published? 6th ask.** In *Testing*, Google kills the refresh token every 7 days and the mirror stops silently while the dashboard reads stale data | Does not block code. **Blocks the item being trustworthy in operation** | Publish, or revert to the service account the original plan specified |
| **D-A3** | Ratify the sequencing constraint from Finding B: enum → layout → status write, **one pass, no interim `sync`** | Should be ratified before Role 3 | Accept. It costs nothing and prevents a visible regression |
| **D-A4** | Ratify that `#20`/`#21` stay folded in (already ruled 2026-10-06) and that `#19` (ROLE 13 prompt edit) **may ship separately** under §7 | No | Accept — decoupling #19 removes a §7 dependency from the code path |
| **D-A5** | **Owner smoke on the original implementation is still outstanding.** It shipped 2026-10-05 and was never owner-verified. The amendment rewrites most of that code | No | Skip it. Smoking code that is about to be replaced has no value; smoke once, after the amendment |
| **D-A6** | Ratify deviations **D1** (10th tab / `All Items`) and **D2** (`money_path` as a field) from the original implementation. D2 is now **moot** — v1.1 adopts `Money path` as column 22, so the deviation becomes compliance | No | Ratify D1; record D2 as resolved by the contract |

## 12. Sizing — revised from the draft

| Band | Changes | Draft | Revised |
|---|---|---|---|
| Layout and schema | 1–15 | ~3–4 h | **~4–5 h** (22 columns not 21; 87 rows not 78) |
| Read-merge-write + diff + apply | 16–18 | ~4–5 h | **~3–4 h** (allow-list is 1 column, not 4 — D2) |
| Tooling defects | 20–21 | — | **~1–1.5 h** (#21 needs a truncation rule that preserves full text) |
| ROLE 13 prompt edit | 19 | ~0.5 h | ~0.5 h, **separable** |
| Verifications | V22–V43 | ~2 h | **~2.5 h** (22 new, not 17) |
| Status write | — | — | **~0.5 h** (mechanical, from `STATUS_ADJUDICATION.md`) |

**Total ≈ 12–14 h.** Still not a single Role 3 pass. Recommended split: **(a)** schema + layout +
enum + status write — ships a correct, fully-populated one-way sheet with no read path; **(b)**
read-merge-write + diff + apply — the only part that carries MEDIUM risk. Splitting means the
layout work is not held hostage to **D-A1**, since Defects A and C affect only the Change Log and
approval path, i.e. band (b).

## 13. Conclusion

The amendment is **well-understood, correctly scoped, and lower-risk than when it was rated** — D2
narrowed the write surface to a single column and D4 closed all four behavioural unknowns. It cannot
touch customer-facing code by construction.

Two things stand in the way, and neither is engineering:

1. **D-A1** — the canonical contract on disk contradicts the accepted state. Band (b) cannot be
   planned against it.
2. **D-A2** — six asks unanswered on token lifetime. A mirror that silently stops is worse than no
   mirror, because four other projects would keep reading it.

And one thing must not be forgotten in implementation: **Finding B.** Ship the layout without the
status write and every gate tab empties, including the Intake tab that only started working
yesterday.

---

```text
Planning complete: CR-2026-10-04-006 (amendment)
Stage: Impact Analysis
Code reality: FULL baseline (599-line working tool, 87 records, live 9-tab sheet) / NONE of the 21 amendment changes
Risk: MEDIUM (R2 upheld; write surface narrowed 4 columns → 1 by the Status-only ruling)
Files WILL change: memory/tools/registry_sync.py · memory/change_requests/index.yml · CHANGELOG.md · .registry_state.json · .registry_csv/* · (change #19 only) control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md
Files WILL NOT touch: backend/server.py · backend/requirements.txt · frontend/** · tests/** · frontend/package.json · secrets/sheets_token.json · change_requests/README.md (byte-identical, O-G3)
Owner decisions: D-A1 (v1.1.1 text — BLOCKS the implementation plan) · D-A2 (OAuth publishing status, 6th ask) · D-A3 (sequencing) · D-A4 (#20/#21 folded, #19 separable) · D-A5 (skip pre-amendment smoke) · D-A6 (ratify D1; D2 moot)
Verifications: 9 retained + 22 new = 31
Docs: this file; supersedes AMENDMENT_DESIGN_DRAFT.md (stale in 6 places, §3)
Next: Gate approval. Implementation plan NOT written — not requested, and D-A1 blocks band (b)
```

---

# REVISION 2 — contract v1.1 **FINAL** · 2026-10-06

The dashboard agent's ruling reply landed: **all five proposals approved, three additions adopted,
`Contract v1.1 is final. You are clear to open Role 2 — Planning.`**

**Terminology correction first:** there is no v1.1.1. The defects were folded into **v1.1**, which is
now final. Everything in this document and in `INTAKE_DOC.md` that says "v1.1.1" means **v1.1 final**.

**And the clauses were already merged.** `control/registry-sheet-contract.md` was checked
line-by-line against the ruling reply — all nine rulings are present in the file. The only stale
thing was the file's own note block, which still declared the defects open. That block is now
corrected.

## 14. D-A1 — **CLOSED**, with one residual that is not ours to decide

§4's Finding A is resolved. The ruling is specific enough to implement from:

| Ruling | Clause now in the file | Effect on the amendment |
|---|---|---|
| **P4** | §3 col 13 — *"Agent never writes or clears Assignee on All Items. On stage tabs, Assignee is always blank — the column exists for layout consistency only."* | **OPEN-1 closed in the contract's own words.** Draft option (ii) is now the mandated behaviour, not a local workaround |
| **P5** | §4 — *"PARKED means a deliberate decision to stop work with a defined re-open condition… Work scheduled for a later wave is expressed via `Sprint`, not PARKED."* | **Ratifies our adjudication verbatim** — see §16 |
| **P1** | §5 Decision enum = `PENDING / APPROVED / APPLIED / REJECTED`, each defined | **Defect A resolved.** §5.3 is now literally implementable |
| **P2** | §3 col 22 — `Money path`, `YES/no` | Confirms delta **D1**. No existing column shifts |
| **P3** | `Edited by` **removed** from the Change Log | **New delta — see §15** |
| Summary | §6 — two separate lines, `Generated: <ISO>` then `Pending change-log rows: N` | **OPEN-2 closed.** Note the **colon** after `Generated` |
| Addition 1 | §3 col 15 + §5.5 — `Last updated` agent-computed-only, never accepted | Confirms **D2/D3**. **OPEN-4 dissolved** |
| Addition 2 | §2 — *"Empty stage tabs are valid and expected… must not treat an empty tab as missing data or an error."* | **Downgrades Finding B — see §17** |
| Addition 3 | §4 — back-catalogue interim: blank Status, counted `Unrouted`, *"a valid transitional state"*, agent surfaces the count until zero | **Legitimises all 87 blank Status cells.** Our SO-local `Unrouted` line is now contract-sanctioned, not a deviation |

### 🔴 D-A8 — Defect B is **still open in the contract text**, and it is the one decision left

Checked the merged file directly. The two clauses still disagree:

- **§1** — *"The sheet is two-way for **Status only**, and sheet → registry never happens without
  owner approval."*
- **§5.5** — *"In Phase 1 only **Status**, **Registered** and **Closed** date columns are accepted
  from the sheet."*

The `Last updated` addition removed one of the four columns, but it did not reconcile these two. So
the accepted set is either **1 column or 3**, and the file says both.

| | If §1 governs | If §5.5 governs |
|---|---|---|
| Accepted from sheet | `Status` only | `Status`, `Registered`, `Closed` |
| Phase B allow-list | 1 column | 3 columns |
| V28 | rejects edits to `Registered`/`Closed` | must **accept** them |
| Risk | smallest possible write surface | three writable columns into the registry |

**This is the only thing still blocking the read-merge-write band.** It is a two-line code
difference but an opposite-behaviour verification difference, and getting it wrong means either
silently rejecting legitimate owner date edits or accepting edits the contract forbids.

**Recommendation: §1 governs — `Status` only.** Three reasons: the owner already ruled that way
(delta **D2**); §1 is the clause the dashboard agent *quoted* when summarising v1.1; and a date typed
into the sheet has no audit value that the registry's own gate dates don't already carry. **This
also needs telling back to the dashboard agent**, because POS, CRM and Inventory will hit the same
contradiction and may resolve it the other way — which would break the shared contract in practice
while both projects believe they are compliant.

### D-A7 — approval mechanism: chat, or the `APPROVED` cell?

The ruling leaves this to us: *"You may want to switch from chat approval to the `APPROVED` cell —
it's a free audit trail. Your call."*

| | Chat approval (as drafted) | `APPROVED` cell |
|---|---|---|
| Audit trail | lives in a chat log, outside the repo | **in the sheet, timestamped, alongside the change** |
| `apply` trigger | `registry_sync.py apply <ID> <Column>` typed by the agent | agent reads `APPROVED` rows and applies them |
| Extra read surface | none | **the `Decision` column becomes owner-writable** |
| Failure mode | approval said in chat, never applied — silent | a typo in the cell is logged, visible, and recoverable |

**Recommendation: adopt the `APPROVED` cell**, and keep `apply` as the command that acts on it. It is
the only mechanism that makes the Change Log self-documenting, and it costs one extra accepted
column on one tab — materially smaller than the Phase-1 surface we are already building. It also
resolves **Defect C** completely rather than by implication.

## 15. 🔴 New delta **D7** — Change Log is **8 columns, not 9**

P3 removed `Edited by`. The draft's Phase A step 2 reads `Change Log!A2:I`, which is now **wrong by
one column** — it would read an empty column and, worse, a future write keyed to `I` would land one
cell to the right of `Note`.

| | Draft (v1) | v1.1 final |
|---|---|---|
| Change Log columns | 9 — `… Decision · Decided at · Edited by · Note` | **8** — `Logged at · ID · Column · Old value (registry) · New value (sheet) · Decision · Decided at · Note` |
| Read range | `Change Log!A2:I` | **`Change Log!A2:H`** |
| `All Items` read range | `A2:U` (21 cols) | **`A2:V`** (22 cols — D1) |
| Write ranges | `A:L` + `N:U` | **`A:L` + `N:V`** |

Confirmed by the ruling: *"it's a Change Log column only, no impact on the 21-column schema or the
dashboard's All Items read."* True for the schema; it **does** change our read and write ranges.

**New verification — V44:** read ranges are `All Items!A2:V` and `Change Log!A2:H`; write ranges are
`A:L` and `N:V`; **column M appears in no range in either direction** (extends V25).

## 16. P5 ratifies the status adjudication — no rework

Worth recording because it could easily have gone the other way. `STATUS_ADJUDICATION.md` §3 had
already reasoned, independently and before the ruling, that `PARKED` buries items on the `Closed`
tab and must be reserved for genuine stops:

| Item | Our adjudication | P5 says | Match |
|---|---|---|---|
| `CR-2026-09-12-015` (Wave 2, waiting on git access + 6 repo secrets) | `PLANNING` · `Blocked on = OWNER` · `Sprint = Wave 2` | *"Work scheduled for a later wave is expressed via Sprint, not PARKED. The Sprint clause covers your Wave 2 item (CR-2026-09-12-015)"* | ✅ **exact, named** |
| `CR-2026-09-15-003` (*"India-only confirmed by owner. Re-open if international numbers introduced."*) | stays `PARKED` | *"a deliberate decision to stop work with a defined re-open condition"* | ✅ |
| The 2 held/deferred items waiting on answers | keep their real stage + `Blocked on` | *"A blocked item is never PARKED"* | ✅ |

**Zero rework.** The 87-row status write can proceed from `STATUS_ADJUDICATION.md` as it stands.

## 17. Finding B — **downgraded** from regression risk to a surfacing obligation

Addition 2 and Addition 3 change the reading materially, and in our favour:

- an empty stage tab is now **explicitly valid** — *"must not treat an empty tab as missing data or
  an error"*;
- a blank `Status` is now an **explicitly valid transitional state** for a back-catalogue adoption.

So routing 3 → 0 is no longer a contract violation or a data error. **But it is still a visible loss
of the only working gate tabs**, and Addition 3 imposes a new positive duty: *"the agent should
surface the unrouted count to the owner until it reaches zero."*

Revised position: the sequencing constraint (**D-A3**) stands as a **recommendation**, not a
correctness requirement. **V40 relaxes** from *"tabs must be non-empty"* to *"routed + unrouted = 87,
and the unrouted count is surfaced on Summary"* — which our `Unrouted` line already does. **V41 is
withdrawn**: publishing an all-blank-Status sheet is now sanctioned, so forbidding an interim `sync`
is over-engineering.

## 18. Revised verification count

| | Rev 1 | Rev 2 |
|---|---|---|
| Retained | 9 | 9 |
| New | 22 | **22** — V41 withdrawn, V44 added; V40 relaxed |
| **Total** | 31 | **31** |

## 19. Revised blocking position

| Band | Blocked? |
|---|---|
| **(a)** schema · layout · 22 columns · enum · tab order · header row 1 · `Blockers` full column set · `#20` · `#21` · status write | **NOT BLOCKED.** Fully specified. Can be planned and implemented now |
| **(b)** read-merge-write · diff · `apply` | **Blocked on D-A8 only** (1-column or 3-column allow-list). D-A7 shapes it but either answer is implementable |

D-A1 is closed. **D-A2 — the OAuth publishing status, now the 7th ask — remains the largest
operational risk in the item and is still unanswered.** §5.1 requires a REGISTRAR run on every
registry mutation; a refresh token that dies every 7 days means the mirror stops silently while four
other projects keep reading the stale tab.

---

```text
Planning complete (rev 2): CR-2026-10-04-006 (amendment)
Stage: Impact Analysis — contract v1.1 FINAL reconciled
Code reality: FULL baseline (599-line working tool, 87 records, live 9-tab sheet) / NONE of the 21 amendment changes
Risk: MEDIUM (R2 upheld)
Contract: v1.1 FINAL — all 9 rulings verified present in control/registry-sheet-contract.md; its stale "defects open" note block corrected
Deltas: D1-D6 (rev 1) + D7 (Change Log 9 → 8 cols; read A2:H, All Items A2:V, write A:L + N:V)
Defect A: RESOLVED (P1) · Defect C: RESOLVED by implication (P1+P3), fully closed if D-A7 adopts the APPROVED cell
Defect B: 🔴 STILL OPEN — §1 "Status only" vs §5.5 "Status, Registered, Closed" → D-A8
Owner decisions: D-A8 (accepted-set contradiction — BLOCKS band (b); recommend §1, Status only, and tell the dashboard agent) · D-A7 (chat vs APPROVED cell; recommend the cell) · D-A2 (OAuth publishing status, 7th ask) · D-A3 (sequencing, now advisory) · D-A4 · D-A5 · D-A6
Verifications: 9 retained + 22 new = 31 (V41 withdrawn, V44 added, V40 relaxed)
P5 check: status adjudication ratified verbatim — zero rework
Next: band (a) is unblocked and ready for an implementation plan on request. Band (b) waits on D-A8
```

---

# REVISION 3 — contract **v1.2** · D-A8 resolved · 2026-10-06

**Contract v1.2 received and merged.** D-A8 is closed, and the dashboard agent used our ID for it.

**It was resolved against our recommendation**, which is recorded here plainly: we argued for §1
(`Status` only, one column); the ruling went to **three columns — `Status` + `Registered` +
`Closed`** — and reconciled §1 *up* to match §5.5 rather than §5.5 *down* to match §1.

`§1` now reads *"two-way for Status and the two date columns Registered and Closed"*. `Last updated`
stays agent-computed-only, so the self-feeding diff (old OPEN-4) remains dissolved.

## 20. What the three-column ruling changes

| | Rev 2 position | v1.2 |
|---|---|---|
| Phase B allow-list | 1 column (`Status`) | **3 columns** (`Status`, `Registered`, `Closed`) |
| Writable share of the schema | 1 of 22 | **3 of 22** |
| V28 scope | rejects `Registered`/`Closed` edits | **must accept them**; rejects only columns 1–4, 6–13, 15, 17–22 |
| Delta **D2** | "owner ruled Status only" | **superseded by the contract — see D-A9** |

### 🔴 D-A9 — the contract now overrides an earlier owner ruling, and that needs acknowledging

Delta **D2** in §3 of this document records an owner ruling, made in chat, that the accepted set is
**`Status` only**. Contract v1.2 says **three columns**. These cannot both be implemented.

**SO will follow the contract**, because it is the shared artefact and four other projects build
against it — a local deviation here would be exactly the silent divergence we raised D-A8 to prevent.
But this is an owner ruling being overridden by a document, not by a person, so it is logged rather
than assumed. **If the "Status only" ruling was a deliberate SO-local tightening, say so and it
becomes a declared deviation with a recorded reason.** Otherwise D2 is closed as superseded.

### The ruling has a concrete upside we should credit

It converts a **pending owner chore into a supported workflow**. Outstanding in the registry today:

- **3 items with a blank `Registered`** (the `02-XX` IDs, never dated)
- **15 `Closed` dates and 3 `Registered` dates with no source**, carried as an owner action since the
  status adjudication

Under rev 2's one-column reading, those 18 dates could only be fixed by hand-editing `index.yml`.
Under v1.2 the owner types them into the sheet, they appear as `PENDING` rows, and `apply` writes
them to the registry with an audit trail. **That is a better answer than the one we recommended**,
and it closes a chore that has been open since the adjudication pass.

### What it costs

The write surface triples. The containment argument in §8 of this document — *"the writable surface
narrowed from 4 columns to 1"* — **no longer holds** and is superseded by this revision. Accurate
position: **3 of 22 columns are writable**, down from the draft's 4, up from rev 2's 1.

The three structural containments in §7 are unchanged and still carry the risk:
ID-keyed diffing · an explicit allow-list · `index.yml` mutating **only** via `apply`, never during
`sync`. **Risk stays MEDIUM** — the exposure is wider than rev 2 but the mechanism is identical, and
two of the three newly-writable columns are dates, which cannot change an item's routing, priority
or blocking state. A bad date is visibly wrong; a bad `Status` moves an item between tabs.

## 21. Three things v1.2 does not specify — SO must decide, and the dashboard agent should know

These arise *only* because dates are now writable. None existed under the one-column reading.

| # | Question | SO's proposed answer |
|---|---|---|
| **OQ-1** | A date column accepts free text. What happens to `6 Oct`, `2026-13-01`, `tomorrow`? §3 says `YYYY-MM-DD` but §5 defines no validation | **REJECT** with reason *"not a YYYY-MM-DD date"*, by the same route as an invalid `Status` (V31). Silently applying a malformed date into the registry would corrupt the field the dashboard sorts on |
| **OQ-2** | `Closed` is *"required when Status is CLOSED/PARKED/DUPLICATE"* — but nothing forbids setting it on an `INTAKE` item. Accept, or reject as inconsistent? | **Accept and log a warning in `Note`.** Rejecting would block the legitimate case of an owner dating a closure *before* adjudicating the Status. The Summary's `Closed` count must key off `Status`, never off a populated `Closed` cell |
| **OQ-3** | An owner closing an item edits **two** cells — `Status` → `CLOSED` and `Closed` → a date. That is two `PENDING` rows for one logical act | **Log both, apply both on one approval**, keyed on `ID`. Approving a Status without its date would leave a `CLOSED` item with no `Closed` date, breaching §3's "required when" |

OQ-1 is the one worth sending back: all five projects will hit it, and the obvious implementations
differ (reject · coerce · accept-as-string).

## 22. Verification changes

| V | Change |
|---|---|
| **V28** | **Narrowed** — now asserts rejection only for columns outside the three-column set. Must no longer reject `Registered` or `Closed` |
| **V27** | **Widened** — the PENDING/visible-edit behaviour must hold for all three accepted columns, not just `Status` |
| **V45** | **NEW** — edit `Registered` in the sheet → `PENDING`; `apply` → `index.yml` updated, `Last updated` recomputed **once**, and the next `sync` reports **no further change** (proves no loop via the recompute) |
| **V46** | **NEW** — malformed date (`6 Oct`, `2026-13-01`) → `REJECTED`, reason *"not a YYYY-MM-DD date"*; `index.yml` untouched (OQ-1) |
| **V47** | **NEW** — `Closed` populated on an item whose `Status` is not CLOSED/PARKED/DUPLICATE → accepted with a `Note` warning, **and the Summary `Closed` count does not change** (OQ-2) |

**Revised total: 9 retained + 25 new = 34.**

## 23. Blocking position — **both bands are now clear**

| Band | State |
|---|---|
| **(a)** schema · layout · 22 columns · 8-value enum · tab order · header row 1 · `Blockers` full column set · `#20` · `#21` · the 87-row status write | **UNBLOCKED** |
| **(b)** read-merge-write · diff · `apply` | **UNBLOCKED.** D-A8 closed. D-A7 shapes the approval trigger but either answer is implementable; OQ-1..OQ-3 are SO-side rulings, not external dependencies |

**Nothing external blocks an implementation plan.** What remains open is owner preference (D-A7),
three SO rulings (OQ-1..OQ-3), and one operational risk:

**🔴 D-A2 — OAuth consent publishing status. Unanswered on the 7th ask.** §5.1 requires a REGISTRAR
run on every registry mutation. In *Testing*, Google expires the refresh token every 7 days and the
mirror **stops silently** while four other projects keep reading the stale tab. This is now the only
thing that can make a correctly-implemented item fail in production, and it is not a code problem.

---

```text
Planning complete (rev 3): CR-2026-10-04-006 (amendment)
Stage: Impact Analysis — contract v1.2 merged
Contract: v1.2 · all three SO-raised defects CLOSED (A and C in v1.1, B in v1.2 as D-A8)
D-A8 outcome: resolved at THREE columns (Status + Registered + Closed) — against SO's one-column recommendation; §1 reconciled up to §5.5
Code reality: FULL baseline (599-line working tool, 87 records, live 9-tab sheet) / NONE of the 21 amendment changes
Risk: MEDIUM upheld — writable surface is 3 of 22 columns (draft 4 → rev2 1 → v1.2 3); rev 2's "narrowed to 1" containment claim is SUPERSEDED
Deltas: D1-D6 (rev 1) · D7 Change Log 8 cols (rev 2) · D-A9 contract overrides the earlier "Status only" owner ruling (rev 3)
Upside credited: the 3 blank Registered + 15 unsourced Closed dates become an owner sheet-edit workflow instead of a hand-edit chore
New SO rulings needed: OQ-1 malformed dates (recommend REJECT) · OQ-2 Closed on a non-closed item (recommend accept + warn) · OQ-3 paired Status+Closed edits (recommend apply together)
Verifications: 9 retained + 25 new = 34 (V28 narrowed, V27 widened, V45/V46/V47 added)
Owner decisions: D-A9 (acknowledge the override) · D-A7 (chat vs APPROVED cell; recommend the cell) · OQ-1..OQ-3 · D-A2 (OAuth publishing status, 7th ask) · D-A3 (advisory) · D-A4 · D-A5 · D-A6
Files WILL change / WILL NOT touch: unchanged from rev 1 §9
Next: NOTHING EXTERNAL BLOCKS. Implementation plan can be written on explicit request (Role 2 step 9)
```
