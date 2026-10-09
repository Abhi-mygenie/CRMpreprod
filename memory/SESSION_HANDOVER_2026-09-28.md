# SESSION HANDOVER — 2026-09-28 — Shared-DB boundary track (supersedes 2026-09-15b)
## For the next agent. Read in this order:
1. this file · 2. `LEARNINGS_SHARED_DB_BOUNDARY_2026-09-15.md` · 3. `change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/OWNER_RESPONSES_F1-F4_2026-09-28.md` · 4. `.../VALIDATION_OF_CRM_REPLY_INV_022.md`

## 0. Your first move — ASK, don't file

The owner wants to be asked **before** the next CRM brief goes out. Open with a 6-line recap (§1), then
use `ask_human` for the questions in §3, **Group 0 first**. Do not send/finalise `REPLY_TO_CRM_INV_022.md`
and do not write code until Group 0 is answered. Respond in English; short tables; evidence before claims —
the owner challenges anything stated as fact without a "why" (see F2 lesson).

## 1. Where we are (recap to present)

- Rule (owner): Customer App never reads/writes CRM collections; CRM never touches ours
  (`customer_app_config`, `dietary_tags_mapping`, `non_qr_blocks`, `status_checks`). POS → CRM API → DB.
- Audit (INV-003): 20 direct touches on 8 CRM collections — 14 dead, 6 live. No code changed yet.
- CRM replied (INV-022, 2026-09-28) and **every row validated against our code — accepted**:
  CRM removes its 4 config/dietary routes (CR-095); builds `POST /scan/auth/lookup` (CR-093) and public
  `GET /scan/loyalty-rules/{rid}` (CR-094); `POST /scan/feedback` is token-only `{rating,message?,order_id?}`;
  **admin login must go to MyGenie POS directly** (CRM is not the identity provider) → CR-004 Option D.
- Owner answered F1–F4 (see §2). Reply to CRM is **DRAFT v2, not sent**.
- Visual board: `GET /api/docs/ownership-board` — disagreements view is now empty (teams agree on every collection).

## 2. Owner's F1–F4 answers and what they require

| # | Owner | Required next |
|---|---|---|
| F1 | "We identify the customer and send details to CRM; ask CRM how feedback must be stored — their endpoint." | Confirm wording of **A9-b** (already drafted in reply v2) → send. |
| F2 | "Why lose?" (the points preview in no-token paths) | Present §1 of `OWNER_RESPONSES_F1-F4` and get a pick: retry skip-otp at checkout + lookup name + "log in to see points" (recommended) / accept loss / insist CRM return points (CRM said no). |
| F3 | "Will approve after checking impact and new flow." | **Write `CR-2026-09-15-004/IMPACT_AND_NEW_FLOW.md`** then present. Content: current flow (login → `db.users` → bcrypt → `refresh_pos_token`) vs new flow (POS `vendoremployee/login` → POS profile → `restaurants[0].id` → our JWT); files/routes touched (`server.py` L354–400 `get_current_user`, L513–630 login, L410 `refresh_pos_token`, `Login.jsx`, `AuthContext.jsx` `/api/auth/me`); failure modes (POS down, multi-restaurant admin, password change propagation); rollback; test plan with `test_credentials.md`. POS profile endpoint = TBD until P5. |
| F4 | "Yes." | Frozen. Already in reply v2 (Q-CA-1 = remove now). |

## 3. Questions to ask the owner

**Group 0 — before the CRM brief goes out**
1. F2 — which option? (see §2)
2. F1 — OK with A9-b wording in `REPLY_TO_CRM_INV_022.md`? (read it to him in one sentence)
3. OK to send reply v2 + `CRM_BRIEF_OWNERSHIP_BOARD.md` to CRM now, with Q-CA-3 marked "in principle, approval pending"? Or hold everything until F3 is approved?
4. OK to send POS **P5** (admin profile endpoint path; can `restaurants[]` have >1) + P1 (`pos_event_logs` consumer) + P4 (phone format) now?

**Group 1 — unblocks code (no CRM dependency)**
5. **O7** — approve deleting the 14 dead CRM-table call sites? (zero user impact)
6. Go on **CR-2026-09-15-001** — profile tabs to v2 paths with the A2/A4/A5/A6 field adapters?
7. Ship the interim `users` projection fix (P0) until CR-004 lands?

**Group 2 — freeze on board**
8. **O1** — freeze as A (CRM already agreed; matches OD-7)?
9. **O5** — Call Waiter / Pay Bill: wire to `/scan/call-waiter` + `/scan/request-bill` (`table_id`) now, or leave stub?

**Group 3 — after F3 doc is read**
10. **F3** — approve POS-direct admin login?

## 4. Files the owner forwards (after Group 0)

| To | File |
|---|---|
| CRM | `INV-003/REPLY_TO_CRM_INV_022.md` (v2) |
| CRM | `INV-002/CRM_BRIEF_OWNERSHIP_BOARD.md` (they never received it) |
| POS | `INV-002/QUESTIONS_FOR_POS_2026-09-15.md` — **add P5** before sending; P2/P3 are closed (CRM E4/C1) |

## 5. Closed / frozen so far
O2 = A (dietary tags ours) · O3 resolved (CRM removed JWT fallback) · O4 → CR-004 · O6 = via CRM API ·
F4 = yes · CRM A1/A2/A3/A5/A6/B1–B4 answered · POS P2/P3 answered by CRM.

## 6. Artefacts (all under `/app/memory`)
- `change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/` — INVESTIGATION_REPORT · CRM_BRIEF_ENDPOINT_VALIDATION · crm_replies/INV_022… · VALIDATION_OF_CRM_REPLY_INV_022 · OWNER_RESPONSES_F1-F4_2026-09-28 · REPLY_TO_CRM_INV_022 (DRAFT v2)
- `change_requests/INV-2026-09-15-002-shared-db-collection-ownership-map/` — OWNERSHIP_BOARD.html (+ route) · CRM_BRIEF_OWNERSHIP_BOARD · QUESTIONS_FOR_* · OWNERSHIP_MAP.md (**still untouched — sign only after CRM board JSON + POS P1/P4/P5**)
- `change_requests/CR-2026-09-15-004-admin-login-users-table-dependency/INTAKE_DOC.md` (Option D, owner gate)
- Code changed in whole track: one route `GET /api/docs/ownership-board` in `server.py`. Nothing else.

## 7. Do-not-repeat
- Don't send a CRM brief with a position the owner hasn't confirmed (F1 lesson).
- Don't state a loss/limitation as fact without the fix next to it (F2 lesson).
- Don't call POS-direct admin login "approved" (F3 is pending the impact doc).
- Don't edit `OWNERSHIP_MAP.md` early. Don't describe POS as writing the DB.
