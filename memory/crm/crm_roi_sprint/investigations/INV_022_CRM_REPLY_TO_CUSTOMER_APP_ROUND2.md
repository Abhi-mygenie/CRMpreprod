# CRM reply (round 2) — answers to Customer App's INV-022 response

## From: MyGenie CRM · Re: `REPLY_TO_CRM_INV_022.md` (Customer App, 2026-09-28/10-03)
## Date: 2026-09-28 · Status: **DRAFT — awaiting owner review before send**

Thanks — all row validations received and noted. Replies below.

| # | Topic | CRM answer |
|---|---|---|
| **Q-CA-1** | Remove 4 routes | Agreed. `GET`+`PUT /scan/config/{rid}` and `GET`+`PUT /scan/menu/dietary-tags/{rid}` (scan.py:717,740,772,785) are confirmed orphan — no CRM consumer. Scheduled for removal under **CR-095** (awaiting our PLANNING→IMPLEMENTATION gate). We will remove after you have wired B1+B3 per the agreed sequencing. |
| **A9-b** | Feedback intake (no token) | **Our recommendation: hybrid.** (1) If a customer token is present, use it (today's behaviour, scan.py:816 `verify_customer_token`). (2) If no token, accept `{phone (canonical 10-digit), restaurant_id}` in the body; we resolve to an **existing** customer by canonical phone and attach. (3) If no match, we store the feedback **unlinked** (`customer_id: null`) with `phone`+`restaurant_id` rather than create a new customer — so feedback never becomes a silent customer-creation vector. `order_id` **optional** (recommended when feedback follows an order; we link it if present). This depends on canonical phone normalisation (**CR-085**); until that ships we match on exact 10-digit. Confirm and we will scope it as a small additive CR. |
| **Q-CA-6** | Call Waiter / Pay Bill | The endpoints **do exist in CRM and the paths you had are correct**: `POST /scan/call-waiter` and `POST /scan/request-bill` (scan.py:845,863). Body = `{table_id, message?}` (`TableAction`). Auth = **customer token required** (`verify_customer_token`). Each writes one doc to `pos_event_logs` `{type: call_waiter|request_bill, user_id, customer_id, table_id, message, status:"pending", created_at}`. **Important caveat:** CRM only *produces* these events — we never read `pos_event_logs`. For the buttons to do anything, **POS must consume `pos_event_logs`** and notify staff. So "correct path, yes" — but the action is only real if POS reads the collection. This is the same open question we raised to POS. Owner to confirm direction: keep these in CRM as producers (POS consumes), or move them to POS entirely. |
| **Q-CA-5** | Ownership board | Filled JSON returned in companion doc `INV_022_CRM_OWNERSHIP_BOARD_REPLY.md`. We added one collection not on your board — `templates` (legacy read-only fallback, likely dead). |

## Your two small requests

1. **Refreshed OpenAPI + contract v2.1 after CR-093/094/095 land** — agreed. We will send the updated `/api/openapi.json` subset + a contract diff once those three CRs are implemented and QA-passed. (Exposing `/api/openapi.json` is tracked as part of CR-088.)
2. **GAP-11 — live host runs the no-fallback JWT build** — **verified in CRM preview**: `core/auth.py:11` is `JWT_SECRET = os.environ['JWT_SECRET']` with **no hardcoded fallback** (the old `dinepoints-secret-key-2024` default is gone, removed under CR-027), and `JWT_SECRET` is set in the backend env. ⚠️ This confirms the *preview* build only — **owner to confirm the same env/secret is set on the live host** (we can't read production from here).

## Sequencing — we accept your proposed order

1. CRM ships **B1** (`POST /scan/auth/lookup`, CR-093) + **B3** (`GET /scan/loyalty-rules/{rid}`, CR-094)
2. Customer App wires them, deletes its 3 pre-login routes + 14 dead routes
3. Customer App switches admin login to POS
4. CRM removes the 4 orphan routes (**CR-095**) and both sides sign the ownership map

## Open items back to you / owner

- **B1 / B2** (the "four missing / four unclaimed collections") — need your exact four names each to reconcile against our scan (candidates listed in the ownership-board reply).
- **A9-b** — please confirm the hybrid recommendation (or pick token-only / full accept-and-create).
- **Q-CA-6 direction** — keep Call Waiter / Pay Bill in CRM (POS consumes `pos_event_logs`) or move to POS?
