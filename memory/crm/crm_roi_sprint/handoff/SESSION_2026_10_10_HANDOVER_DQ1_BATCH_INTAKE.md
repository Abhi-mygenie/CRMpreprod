# Session Handover — 2026-10-10 · Batch **DQ-1 "Data Quality & Cleanup"** registered · next: owner approves batch → Planning Wave A

**For the next agent.** Read in this order: (1) `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (roles/gates — mandatory), (2) this file, (3) intake `discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md`, (4) `planning/DATA_QUALITY_WAVE_CR_PLAN_2026_10_10.md` + `planning/DATA_CLEANUP_GATE_PLAN_2026_10_10.md`, (5) prod facts: `discovery/PROD_DB_INVESTIGATION_2026_10_09.md`, `discovery/PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md`, `discovery/BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md`.
**Language**: English only. **No code was changed this session. No data was written.** Backend `.env` currently points at the **production read-only** Mongo user (`mygenie_mongo_readonly` / `mygenie_db`) — switch back to preprod (`52.66.232.149:27017/mygenie`, commented lines 1–2 of `backend/.env`) **before any implementation or QA** and `sudo supervisorctl restart backend`.

---

## 1. FIRST MESSAGE THE NEXT AGENT MUST SEND TO THE OWNER

Print the mandatory session-start block, then show **§2 (what this batch is, plain English)** and **§3 (execution order table)**, then end with exactly this ask:

> We are at **Batch DQ-1 — registered, awaiting your approval to open Planning for Wave A**.
> **OWNER APPROVAL REQUIRED** · Reason: 7 new CRs + 3 bugs registered; batch composition and 10 open questions need your ruling before any plan is written · Risk: Wave A LOW–MEDIUM (code), Wave C CRITICAL (prod data write — gated by approved reports) · Proposed next step: answer **Q10** (approve batch composition) + **Q1–Q3** (Wave-A items), then say **"choose planning role for CR-111 / 113 / 114 / 115"**.
> I will not proceed until owner approves.

Do **not** start coding on this message alone. Do **not** run `push_and_refresh_tokens.py` against prod (BUG-035). Do **not** touch POS APIs (CR-103 parked rule still stands).

---

## 2. WHAT THIS BATCH IS — plain English (show to owner)

The production database has four kinds of mess: junk/typo phones (630 by the CRM rule), duplicate customers (187 groups), missing country codes (609), and orders with no customer (219,100 — but **95.5 % are anonymous walk-in bills, which the owner ruled are fine**; only **9,924 / ₹2.15 cr** are recoverable). The previous batch closed every **human-facing** door (CRM UI, Customer App) and made POS-facing doors **flag instead of corrupt** — but none of that is on production yet, and three doors still leak silently: the **CSV importer**, **concurrent double-inserts**, and **order sync** (orders arriving before their customer are never re-linked — Brew has 391/391 customers present and 1,128 orders still unlinked).

DQ-1 does four things in order: **A** close the remaining doors and start measuring leakage daily → **B** produce a per-restaurant discrepancy report and get human approval → **C** clean, one restaurant per run, with backup/audit/rollback → **D** add the database-level unique rule so duplicates become impossible.

| Wave | Items | Plain-English outcome |
|---|---|---|
| **A — code** | CR-111 importer validation · CR-113 logging + `phone_invalid` visible to staff (+BUG-028 overflow fix, same page) · CR-114 daily data-quality job · CR-115 sync resilience (401 banner, resume, ordering guard, re-link) · CR-110 amend (BUG-035) | Nothing new leaks; staff can see flagged phones; a daily row per restaurant says "did it leak today?"; sync failures become visible and resumable |
| **B — read-only** | CR-116 report generator · POS brief (P-8…P-15) · S&O note · owner + restaurant approvals | Every restaurant gets a sheet: what will change, what never changes, which rows need *their* decision |
| **C — writes** | CR-117 runner → CR-085-B (phones/cc) → CR-087 (dups + Brew-type backfill) → CR-101 (hygiene) → PROC-001 after each | Data cleaned only from approved rows; losers archived not deleted; rollback per run |
| **D — hard stop** | CR-112 unique index · CR-086 decision (after POS P-15) · 7-day DQ watch → Closure | "Can't happen again" is true at the DB level, proven by 7 zero days |

---

## 3. RECOMMENDED EXECUTION ORDER (show to owner)

| # | Step | Role | Gate / depends on | Why here |
|---|---|---|---|---|
| 0 | **Owner smoke → Closure of previous batch** (`qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md` §5; 20+ 🟢 QA-PASS items) → **prod deploy** | Closure / Release | owner | Prod is still creating null-cc / blank-phone / junk customers daily; cleaning before deploy = cleaning twice |
| 1 | CR-111 importer validation (+BUG-036) | Planning → Impl → QA | Q10 | smallest, closes the last silent junk door |
| 2 | CR-113 logging & visibility (+BUG-028) | Planning → Impl → QA | Q1 | additive only; makes `phone_invalid` and sync outcomes visible |
| 3 | CR-114 daily DQ job | Planning → Impl → QA | Q2 | must exist **before** cleanup to give a *before* number |
| 4 | CR-115 sync resilience + re-link (+BUG-037) | Planning → Impl → QA | Q3 | medium risk — do after 1–3 are green; QA with 3-tenant regression |
| 5 | CR-110 amendment (BUG-035) | Impl (script only) | CR-115 flag exists | never run the current script on prod |
| 6 | **Full regression → owner smoke → Closure Wave A → prod deploy → 3-day DQ baseline** | QA / Closure / Release | — | Wave-A exit |
| 7 | CR-116 report generator; run for all 79 tenants (read-only user) | Planning → Impl | after 6 | report must describe post-deploy data |
| 8 | Draft + owner sends POS brief (P-8/9/10/11/12/14/**15**) and S&O v1.1 note | Planning | — | P-15 decides Palm-group backfill and CR-086 Part C |
| 9 | Approvals: owner all files; restaurants Jeh's Nest · Kunafa · CAFE 103 · Palm House · Cafe Flora · LSD · Craft · Aura · Pav & Pages ×2 · Mill Bakery · mantri; write credential issued | owner | Q5–Q9 | human gate — hard rule |
| 10 | CR-117 runner built + **preprod rehearsal** with same approval format | Planning → Impl → QA | 7 | CRITICAL tooling, prove on preprod first |
| 11 | Wave C runs: system-only tenants → Kunafa / CAFE 103 (twins) → Brew (391 O-A) → **Jeh's Nest last** (94 dup groups with history) → Palm group only after P-15; **PROC-001 after each** | Release (data) | 9, 10 | small-blast first, highest-value-risk last |
| 12 | CR-112 unique index (V2 = 0 everywhere first) | Planning → Impl → QA | 11 | cannot build with duplicates present |
| 13 | CR-086 decision (Part C or close OBSOLETE) per P-15 | Decisions | POS answer | — |
| 14 | 7 consecutive `data_quality_daily` zero days → Closure DQ-1 | Closure | 12 | evidence-based close |

Parallelisable: steps 1–4 can be planned together (one Planning session, four Impact Analyses); step 8 can be drafted during step 6.

---

## 4. WHAT HAPPENED THIS SESSION (chronology)

1. **Investigation (read-only, prod)** — re-probed prod to validate the batch fixes against the same inputs. Corrected two earlier findings: orphan orders are **100 % from `order_sync`**, 95.5 % anonymous (no phone, no `pos_customer_id`) → not recoverable; recoverable = **9,924 / ₹2.15 cr**; **tokens are not all stale** (the `dp_live_` test checks the api_key format → BUG-035). Docs: prod report refreshed; new `BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md` (per-door verdicts, gaps G-1…G-8, logging audit L-1/L-2, checklists S/O/P).
2. **Owner Q&A** → `PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md`: recoverable value by restaurant (Bamboo Yoga ₹1.64 cr never synced; Brew 391/391 linkable now; **Palm group 0/3,000 id matches after completed syncs → P-15**); 630 invalid phones with categories J/F/T/S/B; CSV importer used only by Jeh's Nest (5) + MyGenie Sales (2) → caused Jeh's 94 dups + 327 null-cc; dormant / never-synced tenants; `phone_invalid` invisible in UI.
3. **Owner rulings** (logged in `DECISIONS_LOG.md` 2026-10-10): CSV validate CRM-side · anonymous sync orphans acceptable · concurrent dups → POS contract + daily DQ evidence · no cleanup without per-restaurant report + human approval.
4. **Planning proposals** → `DATA_CLEANUP_GATE_PLAN_2026_10_10.md` (report spec, script behaviour, approval gate, PROC-001 V1–V10, checklist, Q1–Q5) and `DATA_QUALITY_WAVE_CR_PLAN_2026_10_10.md` (7 CRs, 4 waves).
5. **Intake (this role)** → registered CR-111…117, BUG-035…037; carried over 085-B / 087 / 101 / PROC-001 / 086-amend / 110-amend / BUG-028 / ENV-002; CR-103 stays parked. Dashboard (DQ-1 section + transition + header), register rows 65–71, bug registry, decisions log, PRD updated.

---

## 5. OPEN OWNER QUESTIONS (answer before Planning)

| # | Item | Question | Agent recommendation |
|---|---|---|---|
| Q1 | CR-113 (e) | enable prod POS request-log sampling 10 % / 30 d? | yes — forensics for the next incident; TTL exists |
| Q2 | CR-114 | run time; summary surface? | 02:30 IST; API only this batch, dashboard card later |
| Q3 | CR-115 (d) | forward-only re-link inside `customer_sync` now, or after CR-087? | now — it is the structural fix for BUG-037; link-only, no stats |
| Q4 | CR-116 | xlsx for restaurants + md for owner? | yes |
| Q5 | CR-087 / 117 | O-A backfill: link only, or recompute `total_visits/total_spent`? | link only (no retro points/stats); separate approval if owner wants stats |
| Q6 | CR-085-B | F re-parse of unambiguous foreign cc as system action? | yes for 2-digit cc with ≥9 national digits; else restaurant confirms |
| Q7 | CR-085-B / 101 | blank-phone docs **with** history: keep flagged or merge to "Walk-in"? | keep flagged this batch; "Walk-in" bucket is a product decision |
| Q8 | CR-087 | hold Palm group O-A until P-15? | yes |
| Q9 | CR-117 | who issues write-capable prod credential; window? | owner / infra; per-run window, revoke after |
| Q10 | batch | approve composition (merge 113+114? split 115?) → open Planning Wave A | keep as registered; plan 111/113/114/115 in one Planning session |

Outside DQ-1, flagged for owner awareness: **CR-069** (template button mapping) was implemented in an earlier batch but never specifically QA'd by the testing agent; **ENV-002** (prod edge XFF/Cache-Control) still with infra; `daily_loyalty_jobs` ungated, last ran 2026-05-26 (surfaced 2026-10-09, no owner reaction yet).

---

## 6. KEY NUMBERS THE OWNER MAY ASK (prod, 2026-10-10)

| Metric | Value |
|---|---|
| customers / orders / users | 24,130 / 326,543 / 90 (89 with token) |
| Orphan orders total | 219,100 (67.1 %) — all `pos_id:"mygenie"` |
| … anonymous (no phone, no pid) — **accepted** | 209,176 / ₹7.71 cr |
| … recoverable (has pid) | 9,924 / ₹2.15 cr (Bamboo Yoga 975 / ₹1.64 cr; Palm group ~₹46 L held on P-15; Brew 1,128 / ₹1.6 L linkable now) |
| Invalid phones (full rule / junk pattern) | 630 / 71 (≈540 from POS master) |
| Duplicate groups | 187 (118 true + 69 cc-twins); Jeh's Nest 94 true with history |
| Null/empty country_code | 609 (327 null + 282 ""), still growing until deploy |
| Blank-phone legacy customers | 78 |
| Sync failures all-time | 37 (35 × 401; 5 mid-run) |
| Tenants with completed sync in Oct | 11 · dormant since Mar–Jun: ~14 |
| Realtime orphan orders ever | 0 |
| `phone_invalid` / `guest_order` on prod | 0 / 0 (code not deployed) |

---

## 7. FILES TOUCHED THIS SESSION (all docs)
- `discovery/PROD_DB_INVESTIGATION_2026_10_09.md` (refreshed, corrections marked ⚠️)
- `discovery/BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md` (new)
- `discovery/PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md` (+ `_RAW.txt`, `probes/probe4.py`, `probes/probe5.py`) (new)
- `planning/DATA_CLEANUP_GATE_PLAN_2026_10_10.md` (new) · `planning/DATA_QUALITY_WAVE_CR_PLAN_2026_10_10.md` (new)
- `discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md` (new)
- `CR_STATUS_DASHBOARD.md` (header, transition row, DQ-1 section) · `00_register/ROI_MEASUREMENT_CR_REGISTER.md` (rows 65–71) · `BUG_REGISTRY_CAMPAIGNS.md` (BUG-035…037) · `DECISIONS_LOG.md` (2026-10-10 entry) · `PRD.md`
- this handover

**Environment reminder**: restore preprod `MONGO_URL`/`DB_NAME` in `backend/.env` before Planning/Implementation; the prod read-only connection must only be used in Investigation role or by CR-116 later.
