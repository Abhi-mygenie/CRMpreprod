# Session Handover — 2026-10-09 · CR-096 IMPLEMENTED · Next: QA role

**For the next agent.** Read in this order: (1) `memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md`, (2) this file, (3) `memory/CR_STATUS_DASHBOARD.md` rows 089–104 + BUG-025–033, (4) `memory/DECISIONS_LOG.md` tail, (5) `memory/test_credentials.md`.
**Language**: English only.

---

## 1. FIRST MESSAGE TO OWNER

Show the batch flow table (§2 below), then:

> CR-096 is **IMPLEMENTED** — self-test **15/15 PASS**. The hybrid feedback route is live.
>
> **Recommended next steps (in order):**
> 1. **"choose QA role for CR-096"** → independent QA via `tests/test_cr096_feedback.py`, backend only, brief from `qa/CR_096_QA_HANDOVER.md` → `test_reports/iteration_9.json` + `qa/CR_096_QA_REPORT.md`
> 2. After QA PASS → draft Scan & Order validation note for CR-096 (change-log row already written) → consumer validation + owner smoke
> 3. Then close CR-096 with the Wave 2–3 bundle: CR-098/093/089/085-A/A2/BUG-025–029/CR-102/CR-094
> 4. Owner decision: CR-104 (feedback bonus award) — register as follow-up or WONTFIX?
> 5. Still open: Wave 2–3 smoke (5 steps `qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md §5`), BUG-030 a/b, CR-099 a/b, ENV-001, ENV-002 infra checks, scheduler env-gate, CR-103 parked, data cleanup last

---

## 2. BATCH FLOW TABLE (current state)

| Wave | Item | Plain English | Status | Gate |
|---|---|---|---|---|
| 1 | **CR-084** | Removed OTP-in-response | 🔒 **CLOSED** 2026-10-08 | done |
| 1 | **CR-097** | Removed staff password routes | 🔒 **CLOSED** 2026-10-08 | done |
| 2 | **CR-098** | skip-otp only auth | ✅ QA PASS | owner smoke → closure |
| 2 | **CR-093** | Public `/scan/auth/lookup` | ✅ QA PASS | owner smoke → closure |
| 2 | **CR-089** | Rate limits on skip-otp | ✅ QA PASS | owner smoke → closure |
| 3 | **CR-085-A/A2 + BUG-025–029 + CR-102** | Phone normalisation + guest orders | ✅ QA PASS | owner smoke → closure |
| 4 | **CR-094** | Public loyalty-rules endpoint | ✅ IMPLEMENTED, self-test 13/13 | QA role |
| 4 | **CR-096** ← **YOU ARE HERE** | Hybrid feedback intake | 🟢 **IMPLEMENTED, self-test 15/15** | **QA role** |
| 4 | **CR-095** | Remove orphan cross-tenant scan routes | 📋 registered; GET half waits for CA-2 | planning |
| LAST | **CR-085-B · CR-087 · CR-101 · PROC-001** | Data cleanup | 📋 | strictly last |

---

## 3. WHAT HAPPENED THIS SESSION (CR-096)

Implemented CR-096 per plan (approved 2026-10-09, Q5 yes, Q6 yes). Edit order: E6 → E4 → E5 → E1 → E2 → E3.

**Edits applied:**
- **E6** — `tests/test_cr096_feedback.py` (new, 15 tests F-A…F-M + F-K2 + F-ZZ). Test pattern matches `test_cr093_lookup.py` (sync requests + pymongo).
- **E4** — `models/schemas.py:1150-1151`: `customer_name`/`customer_phone` → `Optional[str] = None` on `Feedback` response model. Fixes the live 500-crash on `GET /api/feedback` for r478/672/762.
- **E5** — `server.py`: added `db.feedback.create_index([("user_id",1),("created_at",-1)])` at startup.
- **E1** — `scan.py` `FeedbackSubmit` schema: +`restaurant_id`, `phone`, `country_code` fields.
- **E2** — `scan.py`: added `_FEEDBACK_IP_LIMIT`, `_FEEDBACK_PHONE_LIMIT`, `optional_customer_token` dependency (reuses `optional_security` from `core.auth`); added `import jwt`, `JWT_SECRET`, `JWT_ALGORITHM` to imports.
- **E3** — `scan.py` `submit_feedback` route rewritten: 3-path logic (token / phone / anonymous), IP+phone rate limits, `identity_source`, `linked`, `order_id_raw`, `feedback_count` update only when linked.

**Import additions to scan.py:**
```
from core.auth import (..., optional_security, JWT_SECRET, JWT_ALGORITHM)  # CR-096
import jwt  # CR-096
```

**Self-test: 15/15 PASS** in 38 s. Regression: 39/42 pass (2 skip, 1 fail — transient log-cleanliness check, not a code defect).

**Exit gate 7/7:**
1. ✅ Registry: CR_STATUS_DASHBOARD.md row 096 → 🟢 IMPLEMENTED
2. ✅ Issue tracker: no new bugs; BUG-031/032/033 already ✅ FIXED
3. ✅ File ownership: scan.py, schemas.py, server.py, tests/test_cr096_feedback.py
4. ✅ Code markers: `# CR-096` on all import additions, constants, function, route, feedback_doc comment
5. ✅ Build/compile/test: 15/15 PASS, backend hot-reload clean
6. ✅ Self-test: complete
7. ✅ QA handover: `qa/CR_096_QA_HANDOVER.md`

---

## 4. FILES CHANGED
- `backend/routers/scan.py` — imports (+3), constants (+2), `optional_customer_token` (~20 lines), `submit_feedback` rewrite (~70 lines)
- `backend/models/schemas.py` — 2 lines (Feedback Optional fields)
- `backend/server.py` — 1 line (feedback index)
- `backend/tests/test_cr096_feedback.py` — new (15 tests)

**NOT changed:** `core/phone.py`, `core/auth.py`, `routers/feedback.py`, `routers/pos.py`, `FeedbackPage.jsx`, stored data

---

## 5. HARD RULES (unchanged from prior session)
- No POS file edits this batch (CR-103 parked)
- No scheduler enablement this batch
- Data cleanup strictly last (CR-085-B/087/101/PROC-001)
- Test fixture: r689 / Kunafa Mahal (`owner@kunafamahal.com / Qplazm@10`)
- Staff login returns `access_token` (top-level), not `data.token`

---

## 6. OPEN OWNER ITEMS
| Item | Needed |
|---|---|
| Wave 2–3 smoke | 5-step smoke (`qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md §5`) → Closure |
| BUG-030 | (a) resolve short id / (b) leave |
| CR-099 | (a) relax Add/Edit phone sanitiser / (b) WONTFIX |
| ENV-001 | enable loyalty on r69 or test on r689 |
| ENV-002 | infra checks I1–I6 on production edge |
| CR-104 | feedback bonus award — decide at CR-096 closure |
| Scheduler gate | register env-gate CR for `daily_loyalty_jobs`? |
| Scan & Order CA-2/4/5/8 | cutover date / names / confirm / steps 2–3 |

---

## 7. KEY PATHS
`backend/routers/scan.py` · `backend/models/schemas.py` · `backend/server.py` · `backend/tests/test_cr096_feedback.py` · `qa/CR_096_QA_HANDOVER.md` · `planning/CR_096_IMPLEMENTATION_PLAN.md` · `memory/CR_STATUS_DASHBOARD.md` · `memory/DECISIONS_LOG.md` · `test_reports/` (next: iteration_9)
