# Session Handover — 2026-10-10 · Wave A Planning + Intake · **plain-English edition for the owner**
**For the next agent.** Read in this order: (1) `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (mandatory), (2) **this file**, (3) `planning/WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md`, (4) the four IAs under `planning/` (CR_111 · CR_113_CR_114 · CR_115 · CR_110_AMEND_BUG_035), (5) `discovery/SESSION_2026_10_10_INTAKE_BUG038_BUG040_CR118.md`, (6) previous handovers `SESSION_2026_10_10_HANDOVER_DQ1_BATCH_INTAKE.md` and `SESSION_2026_10_10_HANDOVER_WAVE_A_IA.md`.
**Language**: English. **No application code was changed. No data was written anywhere.** Backend `.env` points at **preprod** (prod read-only URL kept as a commented line for later read-only work).

**First message the next agent must send the owner**: the mandatory session-start block, then **§1 of this file verbatim** (the plain-English story), then §5 (what happens next), then wait.

---

## 0. START HERE (added 2026-10-11) — Customer App brief INV-023 comes first

**Next agent, in this order:** (1) print the session-start block; (2) **read §5 of `investigations/INV_023_CRM_REPLY_CUSTOMER_APP_NAME_PHONE_EDGE_CASES_2026_10_11.md` to the owner verbatim** (plain-English explanation of the Customer App brief and what we found); (3) ask the owner the two decisions at the end of that section — *send the reply as-is?* and *register any of the three CRM follow-ups (accept `name` in skip-otp · `is_blocked` check in skip-otp · name validation in `PUT /scan/profile`)?*; (4) only then read §1 of this file (the data-quality story) and §5 (Wave A gates); (5) wait for the owner.

**What INV-023 is in one line:** the Customer App team asked how to fix a diner's name and phone on the Review Order screen; we answered from the code (no change needed — `PUT /scan/profile` exists, repeat `skip-otp` works), found that their assumption "login accepts `name`" is **wrong** (every new diner gets an empty name), and we want to ask them to log diners in at *Place Order* instead of *Browse Menu* to stop creating junk customers. Nothing was coded, nothing was written to any database. Reply draft is §0–§4 of the INV-023 doc, awaiting owner approval.

---

## 1. THE STORY SO FAR — plain English (show to owner)

### 1.1 What is wrong with the data today (production, as of 10 Oct 2026)
Four kinds of mess exist in the live CRM database:

| Mess | How much | Where it came from |
|---|---|---|
| **Junk phone numbers** (0000000000, 9999999999, 11-digit typos…) | 630 customers | ~540 came in from the **POS customer master** through sync; ~90 from the CRM itself (CSV importer, old real-time code) |
| **Duplicate customers** (same restaurant, same phone, two records) | 187 groups (118 real, 69 only because one copy has country code `+91` and the other has blank) | mostly the **CSV importer** in its early days (Jeh's Nest: 94 groups), plus two tills creating the same diner at the same second |
| **Missing country code** | 609 customers | old code paths that never wrote it |
| **Orders with no customer attached** | 219,100 (67 % of all orders) | **all** came from the historical **order sync**, not from live bills. **95.5 % of them are walk-in bills with no phone and no customer** — you ruled on 10 Oct those are **fine, not a defect**. Only **9,907 orders / ₹2.14 crore** are "recoverable" (a customer id is on the bill but the customer record arrived later or never) |

Confirmed this session with a fresh look at **September 2026**: ~83 % of all bills, both live and synced, have no customer at all. Where a customer *was* attached, the CRM linked it correctly (389/389 synced, 3,461/3,461 live). So the linking machinery is healthy; the leftovers are walk-ins plus one historical hole (Brew: 1,128 orders whose customers arrived months later and were never re-attached).

### 1.2 Why cleaning now would be pointless
The previous batch (CR-085/093/100 etc.) closed every **human-facing** door — CRM screens and Customer App now reject bad phones — and made POS-facing doors **flag instead of corrupt**. But **none of that is deployed to production yet**, and three doors still leak silently: the **CSV importer**, **two tills inserting the same diner at the same instant**, and **order sync never going back to attach orders once the customer appears**. Cleaning before closing the doors means cleaning twice. Hence the plan:

| Wave | In one sentence | Writes data? |
|---|---|---|
| **A — code** (this is where we are) | Close the remaining doors and start **measuring** leakage so we can prove it stopped | No — code only |
| **B — look** | Produce a per-restaurant report of exactly what would change; you and the restaurants approve rows | No — read-only |
| **C — clean** | Fix approved rows only, one restaurant per run, with backup/audit/rollback | **Yes — approved rows only** |
| **D — lock** | Add the database rule that makes duplicates impossible; watch 7 clean days; close | Index only |

### 1.3 Wave A — the code fixes, in plain words (what this session planned)

| Group | Change requests | What it does for you |
|---|---|---|
| **G1 Importer** — CR-111 (BUG-036) | CSV import uses the same phone rule as everywhere else. `0000000000` and `1234567890` are rejected with a clear reason in the preview; `09876543210` is auto-corrected. Indian numbers only for now. | the last silent junk door is shut |
| **G2 Observability** — CR-113 + CR-114 (BUG-028, BUG-038, BUG-039) | Every synced order records **why** it has no customer (`linked` / `no customer yet` / `invalid phone` / `walk-in`). Sync summaries count flagged phones, merges, unlinked orders. Guest payments with a bad phone leave a trace. Staff can **filter "Invalid phone"** on the Customers page and see a badge. A **script you run by hand** (your ruling — no cron yet) writes one data-quality row per restaurant: duplicates, unflagged junk, missing country codes, walk-ins, orphan orders. On prod, 100 % of POS calls will be logged for 7 days (your ruling) so we can see exactly what POS sends. Also fixes BUG-038 (see §2) and classifies POS placeholder ids correctly (BUG-039). Live bills will now also store the POS customer id (your approval). | "did it leak today?" becomes a number, not a guess |
| **G3 Sync resilience** — CR-115 (BUG-037), two slices | **A**: when the POS login expires mid-sync, the CRM flags the restaurant, shows a Dashboard banner "POS connection expired — log in again", and lets staff **resume from the page where it stopped** (both customer and order sync). "Sync customers first" rule already existed; it will now return a proper 409 (your ruling). **B**: when a customer finally arrives via sync, the CRM **automatically attaches** their earlier orders — by POS customer id only (your ruling), link only, no points or visit counts changed. | half-finished syncs stop being invisible; the Brew pattern cannot re-form |
| **G4 Token script** — CR-110 amendment (BUG-035, BUG-040) | The script that refreshes expired POS tokens currently selects **all** restaurants (wrong field test) and has the shared POS password written in the file. It will be rewritten to target only broken tenants, dry-run first, ask for the password interactively, and never print tokens. **Must be proven on preprod first** (your ruling) — we have no evidence yet that the "refreshed" token actually works for syncing. | safe to run on production |

Order of work: **G1 and G2 in parallel → G3-A → G3-B → G4**. G2 must land before G3 because both edit the same sync loops and G3 uses vocabulary G2 defines.

### 1.4 Waves B–D — the data corrections, in plain words (already planned earlier, unchanged)

| Step | What | Who decides |
|---|---|---|
| **CR-116** report generator (Wave B) | For every restaurant: an Excel with 6 sheets — junk phones by category, duplicates (true vs country-code twins), missing country codes, orphan orders (recoverable / pending / walk-in), hygiene items, and a preview of what the validator would say — plus a one-page summary for you | you approve every file; 12 named restaurants approve their own flagged rows |
| **POS brief** (Wave B) | Asks to the POS team: server-to-server sync credential (P-8), validate phones at POS (P-9), send country code (P-10), send customer id + phone on bills when a customer was selected (P-11), confirm walk-in billing is by design (P-12 — now backed by the September numbers), dedupe their master (P-14), **is the order's customer id the same id as in the customer list? (P-15 — Palm House group has 0 of 3,000 matching)**, **new P-16** provisioning hook / restaurant list, **new P-17** never send placeholder ids like `0` | you send |
| **CR-117** cleanup runner (Wave C) | A script that refuses to run without an approved file, backs up the restaurant first, applies only approved rows, archives losers instead of deleting, can roll back a run, and re-validates after. Rehearsed on preprod first | you issue a write credential per run window |
| **CR-085-B / CR-087 / CR-101** (Wave C) | The actual fixes: country code → `+91`; re-parse foreign numbers; flag junk; merge duplicates keeping the oldest; attach recoverable orders (link only); hygiene. Order: small system-only restaurants → Kunafa / CAFE 103 (twins) → Brew (391 customers) → Jeh's Nest last (94 groups with history) → Palm House group only after P-15 is answered | per-restaurant approvals |
| **CR-112** unique index (Wave D) | Database-level rule: one phone per restaurant. Can only be created once duplicates are zero. After 7 consecutive clean daily snapshots → batch closes | — |

### 1.5 Beyond this batch — what you asked for today
**CR-118 "zero-touch provisioning"** (registered, next batch): today a restaurant exists in the CRM only after its owner logs in once; ~110+ POS restaurants have never done so and therefore have **no data at all** in the CRM (that is why "89 tenants" ≠ "200+ restaurants"). You asked that the CRM account be created the moment a restaurant is created on the POS, with a one-time catch-up sync for the existing ones. This needs two things from POS (P-8 credential, P-16 hook/list) and is planned after DQ-1.

---

## 2. WHAT THIS SESSION DID (chronology)

1. Switched backend `.env` from prod read-only back to **preprod**; restarted backend; `/api/health` 200.
2. **Planning role** — read the code behind every Wave A item and wrote four Impact Analyses + the sequence/conflict map. Key findings (code is truth):
   - The "sync customers before orders" guard **already exists** (docs were stale) — you chose to upgrade its response to 409 anyway.
   - The Customers API **strips** the `phone_invalid` flag from responses (schema has no such field) — must be added for the badge.
   - **BUG-038**: a typo in customer sync (`phone_match` vs `phone_match_doc`) makes every "same phone already exists" case crash for that record → counted as *failed*, existing customer never updated, Migration page mislabels merges as failures.
   - The token script hard-codes the shared POS password (public repo) and nobody ever verified that the token it stores works for syncing.
   - Resume-from-page is cheap because progress is already saved per page.
3. **Owner Q&A** — you ruled: 4-group composition; 100 % / 7-day POS request logging on prod; CR-114 is a manual script (no cron); re-link in scope, link-only; BUG-038 fixed inside CR-113; 409 for the guard; resume for both syncs; prod snapshot to a file; token script needs preprod proof; re-link by POS customer id only; store POS customer id on live orders. All in `DECISIONS_LOG.md` (three 2026-10-10 entries).
4. **Two production read-only probes** (no writes): (a) the 17 "customer id but blank phone" orders are all CAFE 103, Jun–Jul 2026, with **placeholder ids `0` / `9223372036854775807`** — not recoverable; investigation doc corrected (recoverable = 9,907 / ₹2.14 cr); (b) **September 2026**: 83–84 % walk-in bills on both paths, 0 placeholder ids, all identified orders linked.
5. **Intake role** — registered **BUG-038, BUG-039, BUG-040, CR-118**, POS asks **P-16, P-17**; updated bug registry, CR register (row 72), dashboard, decisions log, PRD.

---

## 3. OPEN ITEMS / THINGS THE OWNER MUST DO (outside the CRM code)
- **Rotate the shared POS password** that sits in `scripts/push_and_refresh_tokens.py` (BUG-040) — the repo is public.
- **Owner smoke + Closure of the previous batch and its prod deploy** (`qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md` §5) — still the Wave-A exit prerequisite; prod is still writing junk daily until then.
- Prod `.env` for CR-113(e): all 8 `POS_REQUEST_LOGGING_*` keys must exist (`ENABLED=true`, `SAMPLE_RATE=1.0`, `TTL_DAYS=7`) or the backend will not start.
- Still outside DQ-1, flagged before: CR-069 never specifically QA'd; ENV-002 with infra; `daily_loyalty_jobs` last ran 2026-05-26.

---

## 4. KEY NUMBERS (prod, read-only, 2026-10-09/10)
customers 24,130 · orders 326,543 · CRM users 90 (89 with token; POS has 200+ restaurants) · orphan orders 219,100 (95.5 % walk-in, accepted) · recoverable **9,907 / ₹2.14 cr** (Bamboo Yoga ₹1.64 cr never synced; Palm group ~₹46 L held on P-15; Brew 1,128 / ₹1.6 L linkable) · invalid phones 630 · dup groups 187 · null-cc 609 · Sept-2026: 23,162 orders, 19,312 walk-in, 0 placeholder ids.

---

## 5. WHAT HAPPENS NEXT (gate sequence — do not skip)
0. **INV-023 first** (see §0): owner approves the Customer App reply → agent hands §0–§4 of the INV-023 doc to the owner to send; if owner wants the CRM follow-ups → "choose intake role" to register them (they are small, LOW risk, not Wave A).
1. Owner says **"choose planning role for implementation planning of Group 1"** and/or **"… Group 2"** → Implementation Plans (edit-by-edit, verification matrix) → owner approves → **"choose implementation role"** → code → self-test → QA (no testing agent — owner opt-out stands; use pytest + manual) → owner smoke.
2. Then Group 3-A → 3-B → Group 4 (G4's preprod proof: refresh one test tenant's token, run a sync, expect 200).
3. Wave A exit: all green → Closure → **prod deploy (code + .env)** → run `data_quality_snapshot.py --all` on 3 calendar days (file output on prod; infra runs it) → Wave B (CR-116 report; POS brief with P-8…P-17).
4. Parked for later: CR-118 provisioning (needs POS P-8/P-16) · CR-086 Part C decision (after P-15) · CR-112 index (after Wave C).

**Do not**: run `push_and_refresh_tokens.py` on prod · touch POS APIs (CR-103 parked) · write to prod · use the testing agent · start coding from this handover alone.

---

## 6. FILES TOUCHED THIS SESSION (all docs + one env line)
**2026-10-11 addendum**: `investigations/INV_023_CRM_REPLY_CUSTOMER_APP_NAME_PHONE_EDGE_CASES_2026_10_11.md` (new, incl. §5 plain-English) · `CR_STATUS_DASHBOARD.md` (INV-023 transition row) · `PRD.md` · this file (§0, §5 step 0).

`backend/.env` (preprod restored) · `planning/CR_111_IMPACT_ANALYSIS.md` · `planning/CR_113_CR_114_IMPACT_ANALYSIS.md` · `planning/CR_115_IMPACT_ANALYSIS.md` · `planning/CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md` · `planning/WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md` · `discovery/SESSION_2026_10_10_INTAKE_BUG038_BUG040_CR118.md` · `discovery/PROD_DB_INVESTIGATION_2026_10_09.md` (⚠️ Finding 4) · `BUG_REGISTRY_CAMPAIGNS.md` (+BUG-038/039/040) · `00_register/ROI_MEASUREMENT_CR_REGISTER.md` (row 72) · `CR_STATUS_DASHBOARD.md` (rows 111/113/114/115/BUG-035/038/039/040/118 + 3 transition rows + header) · `DECISIONS_LOG.md` (+3) · `PRD.md` · `handoff/SESSION_2026_10_10_HANDOVER_WAVE_A_IA.md` · this file.

```text
Session end: PLANNING (Wave A IA ×4) + INTAKE (BUG-038/039/040, CR-118) + INVESTIGATION (INV-023 Customer App brief, 2026-10-11)
Code changed: NONE · Data written: NONE · Prod access: read-only probes ×2
Owner questions open: NONE for Wave A
Next: explain INV-023 §5 to owner → owner decisions → then PLANNING (Implementation Plan, Group 1 / Group 2) on owner's word
```
