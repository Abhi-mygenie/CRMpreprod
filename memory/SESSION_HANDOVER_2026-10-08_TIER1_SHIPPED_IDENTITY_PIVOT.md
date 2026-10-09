# SESSION HANDOVER — 2026-10-07 / 08 · Tier-1 shipped, identity-path pivot registered

**Agent:** E1 · **Owner language:** English · **Operating prompt:** `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (gates, roles, hotspot rules — read Part C before touching `server.py`, `ReviewOrder.jsx`, `LandingPage.jsx`, `AuthContext.jsx`)
**Supersedes:** `SESSION_HANDOVER_2026-10-07.md` (same session, earlier snapshot — keep for detail, this file is authoritative)
**Previous:** `SESSION_HANDOVER_2026-10-06_PLANNING_TIER1.md`

> **Next agent — mandatory first move (owner instruction):**
> 1. Present §1 (what was done) and §2 (decisions already made) to the owner as a summary.
> 2. Present §5 (proposed execution order) as the plan.
> 3. **Then stop and ask** the open questions in §6 and obtain approval **before any role is booted.** Do not re-ask anything in §2 — those are settled.
> 4. Gate rules apply: nothing moves without the owner's phrase (`Planning for <ID>` · `Gate 2 accepted for <ID>` · `Gate 3 accepted for <ID>` · `Smoke PASS <ID>`). Owner said repeatedly: **"stay in role", "do not jump gate".**

---

## 1. What was completed this session

### 1a. Shipped to SMOKE (code live on preview, QA PASS, owner smoke pending)

| Item | What it does | QA | Artefacts (in item folder) |
|---|---|---|---|
| **BUG-2026-10-06-001** — non-QR policy telemetry | Records **allow** decisions as well as blocks (`decision`, `allowed` fields) at 3 checkpoints, only when `allowNonQrOrders === false`; backend two rolling caps (200 blocked / 1000 allowed per rid); C2 now sends `is_authenticated`; landing `console.log` → `logger.order` | **PASS 11/11** `test_reports/iteration_1.json` | IMPACT_ANALYSIS · IMPLEMENTATION_PLAN · SELF_TEST · QA_HANDOVER · QA_REPORT · **SMOKE_BRIEF.md/.pdf** |
| **CR-2026-10-03-003** — feedback → CRM | `FeedbackPage` posts to CRM `POST /scan/feedback` with diner token; Name/Email removed; no token → sign-in card → home page; `setRestaurantScope` restore + `Loading…` gate; newest-order lookup (silent); backend `FeedbackCreate` + `POST/GET /config/feedback` **deleted**; contract test updated, snapshot removed | **PASS 11/11** `test_reports/iteration_2.json` | IMPACT_ANALYSIS · IMPLEMENTATION_PLAN · SELF_TEST · QA_HANDOVER · QA_REPORT · **SMOKE_BRIEF.md/.pdf** · **CRM_NOTE_FEEDBACK_PURGE.md** |

Files changed (markers `BUG-2026-10-06-001` / `CR-2026-10-03-003`):
`frontend/src/utils/orderAccessPolicy.js` · `pages/LandingPage.jsx` · `pages/MenuItems.jsx` · `pages/ReviewOrder.jsx` · `pages/FeedbackPage.jsx` (+`.css`) · `api/services/crmService.js` (+`crmSubmitFeedback`) · `backend/server.py` · NEW `backend/tests/smoke/test_bug_2026_10_06_001.py`, `test_cr_2026_10_03_003.py` · `backend/tests/contracts/test_public_config.py` (feedback route test → 404/405; snapshot file removed).
Test status: `pytest -m smoke` 19/19 · `pytest -m contract` 14/14 · `yarn build` clean (pre-existing warnings only).

**Known limitation shipped knowingly:** feedback `order_id` is never attached — `crmGetOrders` uses v1 `/customer/me/orders` → 404 on CRM v2 (`/scan/orders`). Fixed by **CR-2026-09-15-001** (also breaks Profile "Orders" tab today).

### 1b. Registered / planned (no code)

| Item | Stage | Notes |
|---|---|---|
| **CR-2026-10-07-001** feedback for guests (hybrid phone path) | INTAKE | blocked on CRM **CR-096, w/c 27 Oct** |
| **CR-2026-10-07-002** permanent deletion of OTP-DEFERRED code (31 markers / 8 files) | INTAKE | exit = owner confirms to CRM (CR-084) with evidence |
| **CR-2026-10-08-001** single identity path = skip-otp (remove password page, retire `skipOtp*`) | INTAKE | **P1, HARD DEADLINE w/c 13 Oct** (CRM CR-098 deletes register/login) |
| CR-2026-09-15-002 | re-scoped | 409 branch → delete; 429 + Retry-After → **keep** (now real, CRM-089) |
| CR-2026-10-03-004 | annotated | lookup contract frozen; blocked on CRM CR-093 (13 Oct) |
| CR-2026-09-15-003 | annotated | CRM owns phone normalisation (CR-085); L6 re-ruling pending |
| CR-2026-09-14-001 | annotated | "restore when live" void — superseded by -07-002 |
| **INV-2026-10-03-001** prod data in UAT | advice written | `REMEDIATION_ADVICE.md` — rotate `dp_live_` → restrict UAT → re-seed scrubbed, never restore `customer_documents` → policy. **Not ours to execute**; Registrar to set `blocked_on: [INFRA, CRM]` |

Registry: `change_requests/index.yml` **90 items**, YAML valid. `registry_sync.py` **not run** (owner: "later").

### 1c. New conventions / tooling (owner-ruled)

- **SMOKE_BRIEF is mandatory after every BUG/CR QA PASS** — plain-English brief for the smoke tester, `SMOKE_BRIEF.md` + `.pdf` in the item folder. Control prompt §9 + Role 8 step 1 updated. Generator: `python3 memory/tools/smoke_brief.py <path>.md` (needs `pip install markdown`, uses headless google-chrome; `--all` regenerates every item's).
- `memory/inbox/` created for cross-team documents: CRM wave log, CRM reply, our summaries/drafts.
- `memory/test_credentials.md` created (aliases from `backend/tests/conftest.py`: admin `owner@18march.com` / `Qplazm@10` / rid 478; diner phone `9579504871` @ 478 via `POST {CRM}/scan/auth/skip-otp`, no x-api-key needed in this env).

---

## 2. Decisions already made — DO NOT re-ask

### BUG-2026-10-06-001
D1=a no `policy-disabled` events · D4=b two caps 200/1000 · D5=b no read endpoint (defer to CR-2026-07-04-004) · D6=yes `is_authenticated` on C2.

### CR-2026-10-03-003
D2=a token-only; no-token → honest sign-in card · D3=a ask CRM to purge stray rows (note drafted) · D7=b/i auto-attach newest order via `crmGetOrders(token,1)` (silently fails today, see 1a) · D8=yes remove Name/Email (owner saw UI) · D9=here delete `GET /config/feedback/{rid}` (CR-001 count → 13) · **D10=a** accept guest gap G1–G4 now, follow-up CR-2026-10-07-001 · P1 sign-in CTA → landing page (`/login` is admin-only).

### CRM / identity (owner 2026-10-07 + CRM owner-FINAL 2026-10-08)
- Owner: OTP process is being removed entirely; **new CR for permanent deletion** (→ -07-002); **ask CRM to validate identity path** (asked, answered); **confirm CR-084 to CRM only after our deletion ships**.
- CRM (a): **skip-otp is the ONLY path**; drop the password page; retire `skipOtp*`.
- CRM (b): **CR-098** deletes `register`/`login` **w/c 13 Oct**; 2 of 7,737 customers have a password (test records).
- CRM (c): **skip-otp CREATES** a customer if absent (by design); `lookup` (CR-093) never creates. Recommended order: lookup → skip-otp.
- CRM (d): CR-093 + CR-098 w/c 13 Oct · CR-096 w/c 27 Oct (after CR-085).
- CRM lookup contract frozen: `{phone digits, country_code "+91" opt, restaurant_id}` → `{success,message,data:{exists,name|null}}`; 200 `exists:false`; 400/429+Retry-After; oldest duplicate wins. **Send phone digits + country_code separately** on lookup/skip-otp/feedback.
- Owner: smoke briefs as PDF per item · registry sheet sync deferred · "stay in role / no gate jumping".

### Process facts
- Diner sign-in lives on the **landing page** (phone → check-customer → `skip-otp` or `/password-setup`); `/login` is admin JWT.
- `REACT_APP_BACKEND_URL` is **intentionally commented out** in `frontend/.env` (relative `/api`). QA noted pre-existing console errors on `/review-order` (`[AUTH] CRITICAL: REACT_APP_BACKEND_URL is not set` ×2, loyalty JSON parse) — candidate intake, not registered.
- `REACT_APP_CRM_URL` host is owner-managed and changed twice this week; `REACT_APP_CRM_API_KEY` is absent here and not needed.
- Shared DB: never write to CRM-owned collections or `customer_app_config`; simulate config in Playwright via `page.route` interception.

---

## 3. Owner-side actions outstanding (not agent work)

1. Smoke test both items with the PDFs → reply `Smoke PASS/FAIL BUG-2026-10-06-001` and `… CR-2026-10-03-003`.
2. Send `CR-2026-10-03-003/CRM_NOTE_FEEDBACK_PURGE.md` to CRM (D3).
3. Forward `INV-2026-10-03-001/REMEDIATION_ADVICE.md` to DevOps/CRM (rotation of `dp_live_` is urgent).
4. Decide when to run `registry_sync.py sync --dry-run`.

---

## 4. Pending agent work (all gated)

| Item | Next phrase from owner | Role |
|---|---|---|
| BUG-2026-10-06-001 | `Smoke PASS …` → set CLOSED | Role 8 |
| CR-2026-10-03-003 | `Smoke PASS …` → set CLOSED | Role 8 |
| **CR-2026-10-08-001** | `Planning for CR-2026-10-08-001` | Role 2 |
| CR-2026-10-07-002 | `Planning for CR-2026-10-07-002` | Role 2 |
| CR-2026-10-03-004 | `Planning for CR-2026-10-03-004` (code waits for CR-093 2xx) | Role 2 |
| CR-2026-09-15-001 | `Planning for CR-2026-09-15-001` | Role 2 |
| CR-2026-10-07-001 | wait for CRM CR-096 CONFIRMED (~27 Oct) | — |

---

## 5. Proposed execution order (presented to owner 2026-10-08; awaiting approval)

Driver: **w/c 13 Oct the password page breaks** (CRM deletes register/login).

| # | Item | Why | Depends on |
|---|---|---|---|
| 0 | Close BUG-2026-10-06-001 + CR-2026-10-03-003 after owner smoke | already shipped | owner |
| **1** | **CR-2026-10-08-001 Step 1** — landing always silent `skip-otp` (ignore `skipOtp*`); `/password-setup` → redirect `/<rid>`; 409 → plain error; **429 + Retry-After → wait-time toast** (folds CR-2026-09-15-002) | the deadline item; ~3 files; must be smoked before 13 Oct | none |
| 2 | **CR-2026-10-07-002** — delete OTP-DEFERRED code; exit = CR-084 confirmation to CRM | LOW, no clock; shares `PasswordSetup.jsx` with #1 → run after #1 is in QA | #1 in QA |
| 3 | **CR-2026-10-03-004** — `check-customer` → CRM `lookup`; `loyalty-settings` → `loyalty-rules` | plan now against frozen contract; code when CR-093 returns 2xx on preview | CRM CR-093 (13 Oct) |
| 4 | **CR-2026-10-08-001 Step 2** — delete `PasswordSetup.jsx`, `otpPolicy.js`, `crmRegister`/`crmLogin`; retire `skipOtp*` from model/defaults/contexts/admin | HIGH process (config keys at 13 restaurants); only after CRM CR-098 CONFIRMED and #1 has run a week | CRM CR-098 |
| 5 | **CR-2026-09-15-001** — Profile → CRM v2 adapter | fixes Orders tab + feedback `order_id`; independent | none |
| 6 | **CR-2026-10-07-001** — feedback for guests | blocked till CR-096 | CRM CR-096 (27 Oct) |
| 7 | CR-2026-09-15-003 + L6 ruling | after CRM CR-085; L6 at contract-v2 review | CRM CR-085 |

---

## 6. Open questions for the owner (ask these, in this order, before booting any role)

**On the execution order (§5)**
- Q1 Approve the order as proposed? Any item to pull forward or drop?
- Q2 Fold CR-2026-09-15-002 into CR-2026-10-08-001 Step 1 (rec: yes) or keep separate?

**For CR-2026-10-08-001 Planning (needed before Gate 2)**
- Q3 D1 — two steps (minimal before 13 Oct, cleanup after CR-098 CONFIRMED) vs one shot? (rec: two)
- Q4 D2 — leave `skipOtp*` fields in the 13 config documents, ignored, until contract v2; or propose a field drop to CRM/DevOps now? (rec: leave)
- Q5 D3 — delivery mode today demands an explicit login ("Please login to use delivery"); with skip-otp always, is the skip-otp token sufficient for delivery? (rec: yes)
- Q6 Step 1 changes diner behaviour at every restaurant with a `skipOtp*` flag off (they stop seeing the password page). Owner comfortable shipping that **before** CRM deletes the routes, i.e. as soon as QA passes? (rec: yes — it is the only way to be safe on 13 Oct)

**For CR-2026-10-07-002 Planning**
- Q7 D1 — delete the commented admin "auth" sub-tab shell entirely? (rec: yes)

**Contract / policy**
- Q8 L6 (India-only phones, `isPhoneValid`) — re-rule now or at contract-v2 review? (rec: defer; keep `+91` default). Note: 143 foreign diners at restaurant 541 cannot sign in via the app today.
- Q9 Register an intake for the pre-existing `/review-order` console errors (`REACT_APP_BACKEND_URL is not set` in a POS-auth path; loyalty JSON parse)? (rec: yes, P3)

**Housekeeping**
- Q10 Run `registry_sync.py sync --dry-run` now?
- Q11 Smoke results for the two SMOKE items — any FAIL to route to Bug Fix?

---

## 7. Reference index

| Topic | Path |
|---|---|
| Control prompt (roles, gates, hotspots, §9 artefacts incl. SMOKE_BRIEF) | `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` |
| Contract with CRM v1.0 (§4c feedback row, L4/L6/L7) | `memory/control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` |
| Registry | `memory/change_requests/index.yml` · `README.md` |
| CRM wave log (Wave 1 CR-084/097/090) | `memory/inbox/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS_2026-10-07.md` + `SUMMARY_WAVE1_CRM_CHANGELOG_2026-10-07.md` |
| Our questions to CRM (sent) | `memory/inbox/OUTBOUND_DRAFT_CRM_QUESTIONS_2026-10-07.md` |
| CRM reply (identity rulings a–d, dates, lookup contract, phone format) | `memory/inbox/CRM_REPLY_IDENTITY_RULINGS_2026-10-08.md` |
| Impact of CRM reply on our items | `memory/inbox/IMPACT_OF_CRM_REPLY_2026-10-08.md` |
| BUG-2026-10-06-001 folder | `memory/change_requests/BUG-2026-10-06-001-non-qr-bypass-not-observable/` |
| CR-2026-10-03-003 folder | `memory/change_requests/CR-2026-10-03-003-feedback-wrong-schema-crm-collection/` |
| CR-2026-10-07-001 / -002 / CR-2026-10-08-001 intakes | `memory/change_requests/CR-2026-10-07-001-feedback-hybrid-no-token-path/` · `CR-2026-10-07-002-otp-permanent-deletion/` · `CR-2026-10-08-001-single-identity-path-skip-otp/` |
| INV remediation | `memory/change_requests/INV-2026-10-03-001-uat-secrets-and-pii-exposure/REMEDIATION_ADVICE.md` |
| Smoke brief tool | `memory/tools/smoke_brief.py` |
| Test credentials | `memory/test_credentials.md` |
| Test reports | `test_reports/iteration_1.json` (BUG) · `iteration_2.json` (CR-003) |
| PRD running log | `memory/PRD.md` |

## 8. Environment notes for the next agent
- Services: supervisor-managed; frontend recompiles ~60–90 s after edits.
- Backend tests: `cd /app && TEST_BASE_URL=http://localhost:8001 pytest -m smoke backend/tests/smoke/ -v -n 0` · `-m contract backend/tests/`.
- Diner token for E2E: `curl -X POST $CRM/scan/auth/skip-otp -d '{"phone":"9579504871","restaurant_id":"478"}'` → `.data.token`; browser `localStorage.setItem('crm_token_478', token)`.
- Restaurants: 478 orderable + feedback enabled; 689 all sold out; 716 non-QR carve-out; 698 historical block events.
- Never PUT `/api/config/` or write CRM collections; intercept in Playwright instead.
- Chrome available at `/usr/bin/google-chrome` for PDF rendering.

```text
Handover complete — 2026-10-08
Shipped: BUG-2026-10-06-001 (SMOKE) · CR-2026-10-03-003 (SMOKE)
Registered: CR-2026-10-07-001 · CR-2026-10-07-002 · CR-2026-10-08-001 (P1, deadline w/c 13 Oct)
Decisions settled: §2 — do not re-ask
Open: §6 Q1–Q11
Next agent: summarise §1–§2 → present §5 → ask §6 → wait for phrase
```
