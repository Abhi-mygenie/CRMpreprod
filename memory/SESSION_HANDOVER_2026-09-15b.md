> **SUPERSEDED by `SESSION_HANDOVER_2026-09-28.md` — read that instead.**

# SESSION HANDOVER — 2026-09-15 (b) — Shared-DB boundary track
## For the next agent. Read this first, then `LEARNINGS_SHARED_DB_BOUNDARY_2026-09-15.md`.

## UPDATE 2026-09-28 — CRM replied (INV-022) and it is VALIDATED
Read `change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/VALIDATION_OF_CRM_REPLY_INV_022.md` first.
All CRM rows accepted. Headlines: CRM agrees we own config + dietary tags and will remove its 4 routes (CR-095);
CRM builds `POST /scan/auth/lookup` (CR-093) + public `GET /scan/loyalty-rules/{rid}` (CR-094); feedback is
login-only; **admin login must move to MyGenie POS direct** (CRM is not the identity provider) → CR-004 Option D.
Draft reply ready: `REPLY_TO_CRM_INV_022.md` — send after owner confirms **F1–F4** (board decision panel).
Closed by this reply: O3 (JWT fallback removed), O4/B4 (retired), A1/A2/A3/A5/A6, B1/B2/B3, POS P2/P3.
Still open: owner F1–F4, O1 (freeze as A), O5, O7 · POS P1, P4, **P5 (profile endpoint)** · CRM board JSON.

## 0. Your first move

Present the owner with §2 (what we planned) in plain English, then ask the questions in §3
**one group at a time** using `ask_human`. Do not code anything until O1 and O7 are answered.
Respond in English. Owner prefers short, concrete, plain-English answers and tables; he will
challenge any claim that lacks evidence — check code/DB before asserting.

## 1. Where we are (one paragraph)

The Customer App and CRM share one MongoDB (`mygenie`). Owner ruled: **we never read or write
any collection CRM writes; all customer data goes through CRM's `/scan/*` API.** We own only
`customer_app_config`, `dietary_tags_mapping`, `non_qr_blocks`, `status_checks`. POS does not
touch the DB (POS → CRM API → DB). We audited our backend: 20 direct touches on 8 CRM
collections — 14 dead code, 6 live. Nothing has been coded yet; this session was investigation,
documentation, and a visual board. Profile tabs (orders/points/wallet) are 404 for an
unrelated reason: the CRM client still uses v1 paths.

## 2. What we have planned (present this to owner)

| # | Plan item | Status | Blocked on |
|---|---|---|---|
| 1 | **Projection on `users` reads** (server.py L587, L367) — stop loading CRM's API keys | ready to code, P0 | nothing |
| 2 | **Delete 14 dead backend routes** that read CRM tables (old OTP/password/profile shim, `/api/customer/orders|points|wallet|coupons`, feedback GET) | ready to code | **O7** |
| 3 | **Profile tabs → CRM v2 paths** (`/scan/orders`, `/scan/points/history`, `/scan/wallet/history`) in `crmService.js` — CR-2026-09-15-001 | planned | owner "go" |
| 4 | **Feedback → `POST /scan/feedback`**, delete our insert + GET | planned | CRM A9 (body) |
| 5 | **Pre-login features via CRM API** (greet-by-name, checkout pre-fill, points preview) — owner decided O6 = via CRM | planned | CRM B1–B3 |
| 6 | **Admin login off CRM's `users`** — CR-2026-09-15-004 (A: CRM admin-login API · B: own `admin_users`) | registered | CRM C1/C2 → owner A vs B |
| 7 | **Sign OWNERSHIP_MAP.md** → unblocks CR-006 split, CR-010 defaults, CR-014 MySQL | waiting | O1 + CRM D1/D2/E5 + POS P1–P4 |

Decisions already frozen by owner (chat 2026-09-15): **O2 = A** (dietary tags ours) ·
**O6 = via CRM API** · **O4 → CR-004** (no permanent `users` exception).

## 3. Open questions to ask the owner

**Group 0 — confirm CRM reply (new, 2026-09-28)**
- **F1** feedback login-only (drop name/email) — accept?
- **F2** degraded-guest checkout loses points preview — accept?
- **F3** admin login → POS direct (CR-004 Option D) — approve?
- **F4** tell CRM "remove the 4 config/dietary routes now" — yes?
→ then send `REPLY_TO_CRM_INV_022.md` + `CRM_BRIEF_OWNERSHIP_BOARD.md` to CRM, and P5 to POS.

**Group 1 — unblocks code today**
- **O7** — Approve deleting the 14 dead CRM-table call sites now? (zero user impact)
- **Go on CR-2026-09-15-001** — fix profile tabs to v2 paths?
- OK to ship the `users` projection fix immediately?

**Group 2 — ownership**
- **O1** — `customer_app_config` writes: A Customer App only (CRM locks PUT) · B key partition · C CRM only. (His standing decision OD-7 = A; CRM's PUT is live so he must confirm.)

**Group 3 — security / scope**
- ~~O3~~ — resolved by INV-022 E1 (fallback removed; live-host check pending).
- **O5** — Call Waiter / Pay Bill: implement now (App→CRM) · App→CRM→POS · leave stub?

**Group 4 — when CRM replies**
- ~~CR-004 A vs B~~ → now **F3** (Option D, POS direct).

## 4. What the owner must send to other teams

| To | File | Purpose |
|---|---|---|
| CRM | `change_requests/INV-2026-09-15-003-direct-crm-table-access-audit/CRM_BRIEF_ENDPOINT_VALIDATION.md` | **Main brief.** Rows A1–A10, B1–B3, C1–C2, D1–D2, E1–E5 — CRM fills "confirm" column |
| CRM | `change_requests/INV-2026-09-15-002-shared-db-collection-ownership-map/CRM_BRIEF_OWNERSHIP_BOARD.md` | per-collection JSON → paste into board "Import CRM JSON" |
| POS | `change_requests/INV-2026-09-15-002-shared-db-collection-ownership-map/QUESTIONS_FOR_POS_2026-09-15.md` | P1–P4 (pos_event_logs, import/webhook logs, pos_id, phone format) |

When replies arrive: paste CRM JSON into the board, tick "Reply received" per item, then update
`OWNERSHIP_MAP.md` (still untouched — do not edit before O1 + CRM + POS replies).

## 5. Artefacts created this session

- `OWNERSHIP_BOARD.html` (served at `GET /api/docs/ownership-board`) — lanes App/DB/CRM/POS,
  view toggle, decision panel O1–O7 / P1–P4 / A1–A6 / B1–B4, markdown export, CRM JSON import.
  Decisions persist in the owner's browser localStorage — the owner's "Copy frozen summary" output
  is the source of truth; ask him to paste it.
- `INV-2026-09-15-003/INVESTIGATION_REPORT.md` — the 20-site audit with line numbers.
- `CR-2026-09-15-004/INTAKE_DOC.md` — admin-login `users` dependency.
- `LEARNINGS_SHARED_DB_BOUNDARY_2026-09-15.md` — rules, verified facts, mistakes to avoid.
- Registry rows added in `change_requests/README.md`; PRD.md appended.

## 6. Code changed this session

Only `backend/server.py`: one new route `GET /api/docs/ownership-board` (serves the HTML).
Nothing else. CORS fix and jsconfig removal were from the earlier part of the session.

## 7. Do-not-repeat

- Don't call a shared collection "low risk" without reading one real document (feedback lesson).
- Don't say POS writes the DB.
- Don't propose "exceptions" to the no-CRM-table rule — register a CR instead.
- Don't edit `OWNERSHIP_MAP.md` early.
- The pre-login endpoints question is CRM's to answer (public vs login-first); don't re-litigate with owner.
