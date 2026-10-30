# Session Handover — 2026-10-12 · Scan & Order Contract + CR-119/120/121 Shipped · **Plain-English Edition for Owner**
**For the next agent.** Read in this order:
(1) `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (mandatory)
(2) **this file**
(3) `handoff/SESSION_2026_10_10_HANDOVER_WAVE_A_PLANNING_INTAKE_OWNER_EDITION.md` (Wave A context + data-quality story)
(4) `planning/WAVE_A_SEQUENCE_AND_CONFLICTS_2026_10_10.md` (implementation order)
(5) The four Wave A IAs: `CR_111_IMPACT_ANALYSIS.md` · `CR_113_CR_114_IMPACT_ANALYSIS.md` · `CR_115_IMPACT_ANALYSIS.md` · `CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md`

**Language**: English.
**Code changed this session**: `routers/scan.py` only (+~45 lines net across CR-119/120/121). No data written to DB except 5 test coupons created on preprod r689.
**Backend `.env`**: points at **preprod** (`52.66.232.149:27017/mygenie`).

**First message the next agent must send the owner**:
Print the mandatory session-start block, then summarise §1 of this file (what shipped this session), then §5 (what comes next — Wave A), then wait.

---

## 0. ONE-LINE SESSION SUMMARY

Three Scan & Order CRs shipped and QA'd. Wave A is fully planned and ready to implement the moment the October batch is smoked and deployed to production.

---

## 1. WHAT HAPPENED THIS SESSION — plain English (show to owner)

### 1.1 What we completed for Scan & Order

The Customer App (Scan & Order) team sent us two separate briefs. We answered both, agreed contracts, and shipped the code.

**Brief 1 — INV-023: Name correction + phone change on Review Order**
They assumed `skip-otp` accepted a `name` field. It didn't. We investigated, confirmed from the code, sent them the correct flow (two-call workaround: `skip-otp` → `PUT /scan/profile {name}`), and you approved the reply.

You also ruled: **skip-otp stays at Browse Menu** — register the customer the moment they give their phone, not at Place Order. This upgraded `name` support from a nice-to-have to a required feature.

We then registered, planned, built, and QA'd **CR-119**: `skip-otp` now accepts `name` in the request body and stores it at customer creation. New diners created with a name in one call. All QA passed.

**Brief 2 — INV-024: Anonymous coupon validation + coupon discovery list**
They needed:
1. A way to validate a coupon code *before* the diner gives their phone
2. A list of available coupons on the checkout screen

We investigated the code, found the engine already supported both, negotiated the contract, and you ruled on two open decisions:
- D2: phone re-auth fail at Place Order → **silent + logged** (no toast)
- Q4: anonymous coupon list → **hide standard coupons entirely** (generic only)

We then shipped two CRs:
- **CR-120**: `POST /scan/coupons/validate` now works without a token. Anonymous diner types a code → sees discount for generic coupons; sees "enter your phone" prompt for standard coupons.
- **CR-121**: `GET /scan/coupons` now works without a token. Returns only generic (`requires_customer=false`) coupons for anonymous diners. Authenticated call unchanged.

To make S&O testing possible, we also created **5 test coupons** on r689 (Kunafa Mahal preprod) covering all the error scenarios they need to validate.

**All three CRs: QA PASS. Closure gated on your smoke test + S&O preprod validation.**

---

### 1.2 What is still on the table

The production database is still writing junk every day — bad phone numbers, duplicates — because the previous October batch (20+ items, all QA-passed) has not been deployed to production yet. **Wave A cannot start until you smoke the October batch and deploy it.**

Wave A is the set of code changes that shut the remaining junk-data doors and add a "did it stop?" meter. Everything is planned and the Impact Analyses are written. Implementation starts the moment you give the word.

---

## 2. WHAT THIS SESSION DID — chronology

1. **Deployment** — Cloned `Abhi-mygenie/CRMpreprod.git` (main) into `/app`, synced memory to `/app/memory/`, installed dependencies, both services running.

2. **Read handovers** — Summarised `SESSION_2026_10_10_HANDOVER_WAVE_A_PLANNING_INTAKE_OWNER_EDITION.md` and `INV_023_CRM_REPLY_CUSTOMER_APP_NAME_PHONE_EDGE_CASES_2026_10_11.md` to owner.

3. **Owner rulings captured:**
   - INV-023 §3 ask-back REJECTED: skip-otp stays at Browse Menu
   - CR-119 P3 → P2 (required flow, not convenience)
   - D2: silent fail for phone re-auth
   - Q4: hide standard coupons from anonymous list

4. **CR-119**: Intake → Planning (IA + Impl Plan) → Implementation (3 edits, scan.py) → QA PASS (4/4 manual + DB + 75/77 regression). Name stored, existing customer not overwritten, whitespace guard works.

5. **INV-024 investigation**: Traced anonymous coupon gap from `routers/scan.py` + `core/coupon.py`. Found engine already supports `customer_id=None`. Two-step validate contract drafted, sent to S&O, reply received, contract frozen both sides.

6. **CR-120**: Intake → Planning (IA + Impl Plan) → Implementation (3 edits, scan.py) → QA PASS (7/7 manual). All error codes verified: `CUSTOMER_REQUIRED`, `MIN_ORDER_NOT_MET`, `CHANNEL_NOT_VALID`, `422`, `401`.

7. **CR-121**: Intake → Planning (IA + Impl Plan) → Implementation (3 edits, scan.py) → QA PASS (6/6 manual). Anonymous list = generic coupons only; channel filter correct; authenticated path unchanged.

8. **5 test coupons created on r689** (preprod): `STO-GENERIC-10`, `STO-GENERIC-MIN`, `STO-DELIVERY`, `STO-STANDARD`, `STO-ONCE` — covering all S&O validation scenarios.

9. **QA regression**: 75/77 PASS. 2 NOTE = pre-existing rate-limit timing on phone `9838777712` (parallel suite run — same documented pattern, not introduced by this batch).

10. **Docs written**: 8 new docs in `/app/memory/crm/crm_roi_sprint/` (2 intake, 3 planning, 1 QA report, 1 investigation, this handover) + dashboard + register + decisions log all updated.

---

## 3. OPEN ITEMS — THINGS THE OWNER MUST DO

| Priority | Action | Why |
|---|---|---|
| **P0** | **Smoke the October batch** (20 items, all QA PASS) — `qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md §5` has the 5-step smoke script | Prod is still writing junk every day. Wave A cannot start until this is deployed. |
| **P0** | **Smoke CR-119, CR-120, CR-121** (this session's 3 CRs) | QA PASS, gated on your walk-through |
| **P0** | **Notify S&O** that CR-120 + CR-121 are on preprod, 5 test coupons ready, test script sent | They're waiting for preprod deploy confirmation |
| **P1** | **Rotate the shared POS password** in `scripts/push_and_refresh_tokens.py` — it's in a public GitHub repo | BUG-040 — security |
| **P1** | **Confirm: send CR-069 to testing agent?** It's the only item with zero QA coverage | Implemented July 2026, testing agent pending |
| P2 | Smoke the July–Aug batch (16 items, all QA PASS) | Older backlog |

---

## 4. KEY NUMBERS (unchanged from last session)

customers 24,130 · orders 326,543 · CRM users 90 · orphan orders 219,100 (95.5% walk-ins, accepted) · recoverable **9,907 / ₹2.14 cr** · invalid phones 630 · dup groups 187 · null-cc 609

---

## 5. WHAT HAPPENS NEXT — gate sequence (do not skip)

### Step 0 — Right now (before Wave A)
Owner smokes October batch (20 items) → closes them → prod deploy (code + 8 `POS_REQUEST_LOGGING_*` keys in prod `.env`) → Wave A gate opens.

Owner smokes CR-119/120/121 → close → notify S&O for preprod validation.

### Step 1 — Wave A (the priority)
All Wave A owner questions are already answered. Impact Analyses are written. Implementation Plans not yet written — that is the next task.

**Order of implementation:**

```
G1 (CR-111)  ───────────────────────────────────────────────────┐
                                                                  ├── Wave A QA → smoke → Closure → prod deploy
G2 (CR-113 + CR-114) ──► G3-A (CR-115-A) ──► G3-B (CR-115-B) ──┘
                                │
                                └──► G4 (CR-110 amend) — only run on prod with owner password + preprod proof
```

To start: say **"choose planning role for implementation planning of Group 1"** and/or **"… Group 2"**.

| Group | CRs | Est. | Gate to open |
|---|---|---|---|
| **G1** | CR-111 + BUG-036 | ~1 hr | "choose planning role for implementation planning of Group 1" |
| **G2** | CR-113 + CR-114 + BUG-028/038/039 | ~4 hrs | "choose planning role for implementation planning of Group 2" |
| **G3-A** | CR-115 slice A (401 flag, banner, resume) | ~3 hrs | after G2 |
| **G3-B** | CR-115 slice B (re-link orphan orders) | ~2 hrs | after G3-A |
| **G4** | CR-110 amend (token script rewrite) | ~1 hr (write); preprod proof mandatory before prod run | after G3-A |

### Step 2 — Wave A exit
All groups QA-green on preprod → owner smoke → Closure → prod deploy (code + `.env`) → run `data_quality_snapshot.py --all` on 3 calendar days → Wave B (per-restaurant Excel reports + POS brief P-8…P-17).

### Step 3 — After Wave A
- Wave B: CR-116 report generator (read-only)
- Wave C: CR-117 cleanup runner (approved rows only, preprod rehearsal first)
- Wave D: CR-112 unique index (after duplicates = 0)
- Next batch: CR-118 zero-touch provisioning (needs POS P-8/P-16)

**Do NOT**: run `push_and_refresh_tokens.py` on prod · touch POS APIs (CR-103 parked) · write to prod DB · use the testing agent · skip Wave A gate.

---

## 6. NEW CR STATUS — this session

| CR | What | Status |
|---|---|---|
| **CR-119** | skip-otp accepts `name` — Set name at first login | 🟢 QA PASS — owner smoke pending |
| **CR-120** | `POST /scan/coupons/validate` optional-auth | 🟢 QA PASS — owner smoke + S&O validation pending |
| **CR-121** | `GET /scan/coupons` optional-auth | 🟢 QA PASS — owner smoke + S&O validation pending |
| **INV-024** | Scan & Order coupon UX contract | Contract frozen both sides |

---

## 7. FILES TOUCHED THIS SESSION

**Code changed** (routers/scan.py only):
- `routers/scan.py` — CR-119 (lines 163–167, 200–240), CR-120 (lines 532–594), CR-121 (lines 95–98, 467–530)

**New docs in `/app/memory/crm/crm_roi_sprint/`:**
- `discovery/CR_119_SKIP_OTP_ACCEPT_NAME_INTAKE.md`
- `discovery/CR_120_SCAN_VALIDATE_OPTIONAL_AUTH_INTAKE.md`
- `discovery/CR_121_SCAN_COUPON_LIST_OPTIONAL_AUTH_INTAKE.md`
- `planning/CR_119_IMPACT_ANALYSIS.md` · `CR_119_IMPLEMENTATION_PLAN.md`
- `planning/CR_120_CR_121_IMPACT_ANALYSIS.md` · `CR_120_IMPLEMENTATION_PLAN.md` · `CR_121_IMPLEMENTATION_PLAN.md`
- `qa/CR_119_CR_120_CR_121_QA_REPORT.md`
- `investigations/INV_023_CRM_REPLY_CUSTOMER_APP_NAME_PHONE_EDGE_CASES_2026_10_11.md` (§3 updated with owner ruling)
- `handoff/SESSION_2026_10_12_HANDOVER_SCAN_ORDER_COUPONS_AND_WAVE_A_NEXT.md` (this file)

**Updated**:
- `DECISIONS_LOG.md` (+3 new entries)
- `CR_STATUS_DASHBOARD.md` (rows 119/120/121 → 🟢 + transition rows + INV-024)
- `00_register/ROI_MEASUREMENT_CR_REGISTER.md` (rows 73/74/75)
- `backend/.env` (preprod credentials, all keys)
- `frontend/.env` (preview URL)

**Test data created on preprod r689:**
- Coupons: `STO-GENERIC-10`, `STO-GENERIC-MIN`, `STO-DELIVERY`, `STO-STANDARD`, `STO-ONCE`

---

```text
Session end: INVESTIGATION (INV-023 + INV-024) + INTAKE (CR-119/120/121) + PLANNING (CR-119/120/121 IA + Impl Plans) + IMPLEMENTATION (CR-119/120/121) + QA (CR-119/120/121 PASS)
Code changed: routers/scan.py (+~45 lines net)
Data written: 5 test coupons on preprod r689 only
Prod access: NONE
Owner questions open: NONE for Wave A — all ruled
Next: owner smoke on Oct batch → prod deploy → "choose planning role for implementation planning of Group 1 / Group 2" (Wave A)
```
