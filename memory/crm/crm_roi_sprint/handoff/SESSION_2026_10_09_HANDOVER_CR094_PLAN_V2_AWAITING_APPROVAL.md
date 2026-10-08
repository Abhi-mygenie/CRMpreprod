# Session Handover — 2026-10-09 · Batch "Customer App identity + public reads" · CR-094 plan v2 awaiting owner approval

**For the next agent.** Read in this order: (1) `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (roles/gates — mandatory), (2) this file, (3) `planning/CR_094_IMPLEMENTATION_PLAN.md` (v2), (4) `memory/CR_STATUS_DASHBOARD.md` rows 084–104 + BUG-025–033, (5) `memory/DECISIONS_LOG.md` tail (2026-10-09 entries), (6) `memory/test_credentials.md`.
**Language**: English only. **No code was changed in the last three roles (Intake → Decisions → Planning).**

---

## 1. FIRST MESSAGE THE NEXT AGENT MUST SEND TO THE OWNER

Print the mandatory session-start block, then **show the owner the whole batch flow (§2 below) as a table**, then end with exactly this ask:

> We are at **CR-094 — Implementation Plan v2 — awaiting your approval**.
> **OWNER APPROVAL REQUIRED** · Reason: v1 was approved, then amended for your rulings Q4 (b) / Q5 (r689) / Q6 (+4 fields, scheduler off) · Risk: LOW · Proposed next step: on "approve v2" + **"choose implementation role for CR-094"** I write the tests first, then the ~40-line route in `scan.py`. I will not proceed until you approve.

Do **not** start coding on this message alone. Do **not** touch CR-096, CR-103, or anything POS.

---

## 2. THE WHOLE BATCH FLOW — what happened, in order (show this to the owner)

Programme: make `skip-otp` the single diner identity path, give the Customer App (Scan & Order team) its missing public reads, harden it, fix phone identity, then clean data last. Gate flow per prompt §4: Intake → IA → Plan → Owner approval → Implementation → Self-test → QA → Owner smoke → Closure.

| Wave | Item | What it is (plain English) | Where it is now | Gate |
|---|---|---|---|---|
| 1 | **CR-084** | Deleted the dev OTP flow (OTP was returned in the response body) | 🔒 **CLOSED** 2026-10-08 (owner smoke PASS, Customer App confirmed their side) | done |
| 1 | **CR-097** | Removed all staff password-management routes/UI (CRM logs in with POS creds only) | 🔒 **CLOSED** 2026-10-08 | done |
| 2 | **CR-098** | Retired customer password register/login — skip-otp only | 🟢 IMPLEMENTED + QA PASS (`iteration_2`) + Scan & Order validated | **owner smoke → closure** |
| 2 | **CR-093** | New public `POST /scan/auth/lookup` → `{exists, name}`; never creates; rate-limited | 🟢 IMPLEMENTED + QA PASS (`iteration_3`) + validated | **owner smoke → closure** |
| 2 | **CR-089** | Rate limits on skip-otp (30/min IP, 5/5 min phone) | 🟢 IMPLEMENTED + QA PASS + validated | **owner smoke → closure** |
| 3 | **CR-085-A** | One canonical phone format (`core/phone.py`) at all 15 write/match points; invalid → reject (CRM) / flag (POS) | 🟢 IMPLEMENTED + QA PASS (`iteration_5`) + validated | **owner smoke → closure** |
| 3 | **CR-085-A2** | Invalid-phone POS bills → **guest order** (no customer created/credited); POS lookup hides flagged | 🟢 IMPLEMENTED + QA/regression PASS (`iteration_6/7`, 68/68) | **owner smoke → closure** |
| 3 | **BUG-025/026/027/029 · CR-102** | Limiter keyed on canonical phone; IP bucket before validation on both routes; skip-otp accepts `country_code`; test hygiene | 🟢 IMPLEMENTED + QA PASS (`iteration_8`) | **owner smoke → closure** |
| 4 | **CR-094** ← **YOU ARE HERE** | Public `GET /scan/loyalty-rules/{rid}` so the app can show "spend ₹500 → earn 25 pts" before login | Plan v1 approved → validated vs POS contract → 3 gaps → owner ruled → **plan v2 written** | **⏸ awaiting owner approval of v2** |
| 4 | **CR-096** | Hybrid feedback intake (token or phone or anonymous; never creates a customer) + fold 2-line `Feedback` schema fix (staff list 500s today) | Plan **APPROVED** 2026-10-09 | implementation gate — opens **after CR-094 ships** (owner order 094 → 096) |
| 5 | **CR-095** | Remove 4 orphan cross-tenant `/scan/config` + `/scan/menu/dietary-tags` routes | 📋 registered; PUT half ready, GET half waits for Customer App cutover date (CA-2) | planning |
| 5 | **CR-100** | Tolerant match for 63 legacy no-country-code customers | 🟡 IA done; plan gate closed by owner | hold |
| 5 | **CR-086** | POS migration must create customers | 📋 | later |
| LAST | **CR-085-B · CR-087 · CR-101 · PROC-001** | Data cleanup (390 junk phones, 44 dups, 63 null-cc, 2 dead hashes, 3 orphans) — **report-first, then write, then full production-DB validation** | 📋 — owner: strictly last, after every code CR above ships | end of batch |

**Owner smoke pending** for the whole Wave 2–3 bundle (5 steps in `qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md` §5) → then Closure role moves 098/093/089/085-A/A2/BUG-025-029/CR-102 to 🔒.

---

## 3. WHAT HAPPENED THIS SESSION (CR-094 detail)

1. Owner opened "implementation role for CR-094"; agent verified plan v1 against code (no drift) and asked for a go.
2. Owner asked instead: *"validate CR-094 against the contract we made for POS — anything missing or mismatched?"* → read-only comparison of `pos_loyalty.py:44-74` / POS contract §3.1 vs plan v1 vs live `loyalty_settings` (41 docs).
   - Shared 15 fields identical ✅. Gaps: per-tier redemption **null in 40/41 docs** and plan silent on it; R6 test pointed at r69 which 404s (BUG-030); POS contract thinner than the new one (per-tier ₹/pt missing → till vs app mismatch); feedback bonus configured but **never awarded by any code**; POS contract doc gaps; birthday/anniversary fields omitted.
3. **Intake role** → registered **CR-103** (POS L-1 parity), **CR-104** (feedback bonus award), **BUG-031** (plan null gap), **BUG-032** (R6 fixture), **BUG-033** (POS doc gaps). Doc: `discovery/SESSION_2026_10_09_INTAKE_CR103_CR104_BUG031_BUG033.md`.
4. **Owner rulings** (`DECISIONS_LOG.md` 2026-10-09, verbatim quoted there):
   - Q4 **(b)** resolve per-tier ₹/pt server-side (never null) · Q5 **r689** fixture · Q6 **add birthday/anniversary fields (29→33) but NO scheduler enabled this batch** (diner can set DOB/anniversary via existing `PUT /scan/profile`)
   - **CR-103 ⏸ PARKED — no POS API or POS contract changes of any kind in this batch**
   - **CR-104 Q-B (c)** — decide at CR-096 closure; `feedback_bonus_*` stay in the payload
   - **BUG-033 accepted** — Customer-App notes go into the CR-094 consumer note; POS-side parks with CR-103
5. **Planning role** → **plan v2** written (`planning/CR_094_IMPLEMENTATION_PLAN.md`): 33 keys, `{**defaults, **doc}` fill, four `*_redemption_value` replaced by `get_redemption_value_for_tier(tier, settings)`, R1–R13, expanded consumer note. Files unchanged from v1. Risk LOW.
6. **Fact surfaced, not registered** (owner has not reacted yet): `server.py:25` starts APScheduler unconditionally and `daily_loyalty_jobs` (birthday/anniversary/expiry) has **no env gate**; last `cron_job_logs` run 2026-05-26 (not running on preview; production unknown). If owner wants "no scheduler" guaranteed → small LOW CR (env gate). Mention once in the flow summary; do not register without owner's word.

---

## 4. PLAN v2 IN ONE SCREEN (what you will build once approved)

- `GET /api/scan/loyalty-rules/{restaurant_id}` — no auth; `lr-ip:{ip}` bucket 60/60 s via `_lookup_rate_limited`; `_normalize_restaurant_id`; 404 if no `users` doc; `settings = {**default_loyalty_settings(rid), **doc}`; pick 33 whitelisted keys; overwrite `bronze/silver/gold/platinum_redemption_value` with `get_redemption_value_for_tier("Bronze"| …, settings)`; `Cache-Control: public, max-age=60`; `_resp(True, "Loyalty rules", data)`.
- Imports: add `Response` to the fastapi import (`scan.py:5`), `default_loyalty_settings` from `core.loyalty`, append `get_redemption_value_for_tier` to `scan.py:19`.
- Markers `# CR-094` on every added line-group.
- Tests `tests/test_cr094_loyalty_rules.py` R1–R13 (pattern `test_cr093_lookup.py`; fixture **r689**; null-tenant example r719; POS parity needs r689 `api_key` read from `users`). Then rerun `test_cr093_lookup.py` + `test_cr089_skip_otp.py` (shared limiter).
- Exit gate: QA handover `qa/CR_094_QA_HANDOVER.md`, dashboard row 094 → 🟢 IMPLEMENTED + transition, change-log row in `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` (placeholder at line ~79 says "row added when implemented") with the §6 consumer note, PRD line, session handover. Then QA role (testing agent, backend only) — ask owner whether to run QA in-session or stop at handover.

---

## 5. HARD RULES LEARNED IN THIS BATCH (do not break)
- Owner is strict on gates: "update docs and decision, don't jump gate". Record decisions first, then ask for the role switch. Never code on a plan that has an open amendment.
- Owner reads plain English — when asked "explain", explain who it affects (Scan & Order vs POS vs internal) and whether it blocks the current gate.
- **Nothing POS this batch**: no `routers/pos*.py`, no POS contract edits. CR-103 parked.
- **No scheduler enablement this batch.**
- Data cleanup (085-B/087/101) is strictly last; PROC-001 production-DB validation is mandatory after it.
- r69 (The Goan Kitchen, owner's login tenant) has user id `pos_owner_69_bdd4513c` → short id `69` 404s on every `/scan` route (BUG-030, owner a/b pending) and loyalty is off there (ENV-001). Use **r689 / Kunafa Mahal** (`owner@kunafamahal.com`) as the loyalty fixture.
- Dates in this programme's docs run on the sprint calendar (2026-10-09); keep using it.
- Testing agent for QA is fine for this sprint (owner's "no testing_agent_v3" rule in the ALPHA prompt was superseded — iterations 1–8 exist).
- Secrets: never print; test password lives in `test_credentials.md` and is passed via `CRM_TEST_OWNER_PASSWORD` env.

---

## 6. OPEN OWNER ITEMS (besides approving v2)
| Item | Needed from owner |
|---|---|
| Wave 2–3 smoke | 5-step smoke (`qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md` §5) → Closure |
| BUG-030 | (a) resolve short id via `users.restaurant_id` / (b) leave |
| CR-099 | (a) relax Add/Edit phone sanitiser / (b) WONTFIX |
| ENV-001 | enable loyalty on r69 for live points test, or test on r689 |
| Scheduler gate | register env-gate CR for `daily_loyalty_jobs`? (fact in §3.6) |
| Scan & Order | still owe CA-2 cutover date, CA-4, CA-5, CA-8; CA-1 is owner's |
| Consumer notes to send | `handoff/CRM_REPLY_TO_SCAN_ORDER_VALIDATIONS_ACCEPTED_CA_FOLLOWUPS_2026_10_09.md` + BUG-025/CR-102 change-log entry |

---

## 7. KEY PATHS
`backend/routers/scan.py` (target) · `backend/core/helpers.py:32` (`get_redemption_value_for_tier`) · `backend/core/loyalty.py:27` (`default_loyalty_settings`) · `backend/routers/pos_loyalty.py:44` (POS L-1, read-only reference, DO NOT EDIT) · `backend/tests/test_cr093_lookup.py` (test pattern) · `planning/CR_094_IMPLEMENTATION_PLAN.md` · `planning/CR_096_IMPLEMENTATION_PLAN.md` (next) · `discovery/SESSION_2026_10_09_INTAKE_CR103_CR104_BUG031_BUG033.md` · `memory/DECISIONS_LOG.md` · `memory/CR_STATUS_DASHBOARD.md` · `memory/BUG_REGISTRY_CAMPAIGNS.md` · `crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` (rows 56–60 new) · `test_reports/iteration_1..8.json`.

Services: backend 8001 / frontend 3000 via supervisor, hot reload; preview URL = `REACT_APP_BACKEND_URL` in `frontend/.env`. Baseline customers ≈ 7705 (drifts with POS till traffic — read, don't hardcode).

---

## 8. APPENDED 2026-10-09 — CR-094 IMPLEMENTED (plan v2). Implementation exit gate 7/7. Next role: QA

**What happened after §1–§7**: owner approved plan v2 and opened the implementation gate ("choose implementation role for CR-094 plan v2"). Implemented edit-by-edit per plan, tests first.

| Exit gate | Status |
|---|---|
| 1 Registry updated | ✅ dashboard row 094 🟢 IMPLEMENTED + transition; register row 42 slug; BUG-031/032 ✅ FIXED |
| 2 Issue tracker | ✅ `BUG_REGISTRY_CAMPAIGNS.md` 031/032 FIXED |
| 3 File ownership | ✅ `routers/scan.py` (CR-094 section after `lookup_customer`), `tests/test_cr094_loyalty_rules.py` |
| 4 Code markers | ✅ `# CR-094` on imports, constants, route |
| 5 Build/compile/test | ✅ backend hot-reloaded, route 200; ruff F821 clean (one pre-existing F401 `calculate_tier` unused — not ours, left) |
| 6 Self-test | ✅ 13/13 + shared-limiter regression 24 pass / 1 skip |
| 7 QA handover | ✅ `qa/CR_094_QA_HANDOVER.md` |

**Issues found (none in the route itself):**
- **NOTE-1 ENV**: preview edge (Cloudflare → ingress) rewrites `Cache-Control` to `no-store, no-cache, must-revalidate` on every route incl. `/api/health`; origin sends `public, max-age=60`. R7 asserts against `http://localhost:8001` (override via `CRM_ORIGIN_URL`). Owner to decide whether to register **ENV-002** and verify on the production domain.
- **NOTE-2 test design**: 61 sequential edge round-trips exceed the 60 s window → R5 fires 61 concurrent calls with a fresh random IP. Reuse this pattern for any ≥60/min limiter test.
- Pre-existing, unchanged: r69 → 404 (BUG-030); `loyalty_enabled:false` on r69 (ENV-001).

**Live evidence** (preview, r689): 33 keys; per-tier ₹ 1.0/2.0/3.0/4.0; r719 (null per-tier) → all 1.0; `max_redemption_amount` 110.0 / null; birthday 100 / anniversary 150; 15 shared keys == POS L-1; 61st call/min 429 + Retry-After; `loyalty_settings` unchanged.

**NEXT AGENT — first message to owner**: show the batch flow table (§2, with CR-094 now 🟢 IMPLEMENTED, self-test 13/13) and recommend, in order:
1. **"choose QA role for CR-094"** → independent QA via testing agent, backend only, brief from `qa/CR_094_QA_HANDOVER.md` → `test_reports/iteration_9.json` + `qa/CR_094_QA_REPORT.md`.
2. Owner decision: register ENV-002 (edge Cache-Control rewrite)? yes/no.
3. After QA PASS → draft Scan & Order validation note for CR-094 (change-log row already written) → owner sends → consumer validation + owner smoke → Closure with the Wave 2–3 bundle.
4. Then **"choose implementation role for CR-096"** (plan already approved; order 094 → 096 is owner-locked). Reminder: CR-096 must carry `country_code` in its schema and fold the `Feedback` name/phone Optional fix (Q5).
5. Still parked/owner: Wave 2–3 smoke (5 steps), BUG-030 a/b, CR-099 a/b, ENV-001, scheduler env-gate fact (§3.6), CR-103 parked (no POS this batch), CR-104 at 096 closure, data cleanup last.
