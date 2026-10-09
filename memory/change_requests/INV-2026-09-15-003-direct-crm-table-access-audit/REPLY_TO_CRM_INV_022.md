# Reply to CRM — INV-022 answers (Q-CA-1…5)
## From: MyGenie Customer App · Re: `INV_022_CRM_REPLY_TO_CUSTOMER_APP_ENDPOINT_VALIDATION.md` · Date: 2026-09-28
## Status: ✅ **SENT — and ANSWERED by CRM (round 2, received 2026-10-03). SUPERSEDED.**
>
> **Do not send this file.** It is kept as the audit trail of what we asked. Everything in it has
> been answered; the current outbound document is
> **`REPLY_TO_CRM_ROUND2_AND_FREEZE.md`** plus **`control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md`**.
>
> **One correction to the record:** the **Q-CA-6** question below asserts that
> `/scan/call-waiter` and `/scan/request-bill` were the wrong endpoint paths. **They were correct.**
> CRM answered with file:line evidence (`scan.py:845,863`) — correct paths, body `{table_id, message?}`,
> customer token required. The premise of Q-CA-6 is withdrawn; see
> `VALIDATION_OF_CRM_REPLY_ROUND2.md` §2 correction 1.
>
> Original status line: APPROVED 2026-10-03 — READY TO SEND. Owner confirmed: F1 wording (A9-b)
> approved; F2 = option (a) blank/silent when CRM down (no retry); F3 pending impact doc;
> F4 frozen yes. Q3 send-now approved by owner.

Thank you — every row validated against our code. **All accepted.** Ground rules 1–3 agreed, including the symmetric rule (CRM never touches `customer_app_config`, `dietary_tags_mapping`, `non_qr_blocks`, `status_checks`).

| # | Answer |
|---|---|
| **Q-CA-1** | **Already true today — remove the 4 routes now.** Our `RestaurantConfigContext` reads `GET /api/config/{rid}` on our own backend; dietary tags via our `GET /api/dietary-tags/available`. No Customer App code calls `GET/PUT /scan/config/{rid}` or `GET/PUT /scan/menu/dietary-tags/{rid}`. CR-095 is ungated from our side. |
| **Q-CA-2** | **Customer App does not read `pos_event_logs`** and never will. Our Call Waiter / Pay Bill buttons are stubs today. Before wiring them we need to confirm the correct endpoint paths and request body — see **Q-CA-6** below. If nothing in CRM reads `pos_event_logs`, the consumer is POS or it is dead — we have asked POS the same question (our P1). |
| **Q-CA-3** | **Direction accepted in principle; final owner approval pending our impact/new-flow review (our CR-2026-09-15-004) and the POS profile-endpoint answer.** We already call POS `/auth/vendoremployee/login` with the admin's credentials during our admin login (to obtain a POS token for QR/admin ops). We will extend that to POS profile → `restaurants[0].id` (short rid) + name, mint our own admin JWT, and **stop reading CRM `users`** (our CR-2026-09-15-004). We will **not** call POS's CRM-token registration. The "frozen `users` fields" ask is withdrawn. Open with POS (we are asking): profile endpoint path; whether `restaurants[]` can have more than one entry. |
| **Q-CA-4** | **Validated.** <br>**B1** `POST /scan/auth/lookup` → replaces our `check-customer` on the landing page; we will not use `skip-otp` for lookup. <br>**B2** login already precedes checkout in every skip-otp flow (landing page calls `skip-otp` on phone submit → token → points via `/scan/loyalty`). In our degraded-guest fallback (skip-otp failed / OTP unavailable), points preview is intentionally left blank — no retry at checkout, no UI message. Owner decision 2026-10-03: option (a), accepted. <br>**B3** `GET /scan/loyalty-rules/{rid}` → replaces our `loyalty-settings` read; field list covers what we use. <br>**A9 — question back to you (A9-b):** we will always *identify* the diner — customer token when we have one, otherwise `phone` (10-digit) + `restaurant_id` (`"689"`) captured on the landing page — and send `rating`, `message`, `order_id`. How do you want to receive and store that? (i) token-only as today → we call `skip-otp` first; (ii) accept `{phone, restaurant_id}` in the body when no token and resolve/create server-side; (iii) other. Should `order_id` be mandatory when feedback follows an order? Your endpoint, your rule — we comply. <br>Please proceed with CR-093 / CR-094. |
| **Q-CA-5** | Attached: `CRM_BRIEF_OWNERSHIP_BOARD.md` (per-collection JSON template). Please return the JSON; we paste it into the board and the disagreement view updates automatically. |

**Field-mapping notes we will handle on our side (no action for CRM):** A2 no `skip` (we'll wait for CR-088), raw order doc mapping; A4 no `order_id`; A5 balance from `/scan/loyalty`; A6 `end_date`; A10 `table_id`; phone exact 10 digits; token `restaurant_id` full form.

**Q-CA-6 (new — Call Waiter / Pay Bill endpoints)**
Our Call Waiter and Pay Bill buttons are currently stubs. We had noted `/scan/call-waiter` and `/scan/request-bill` from an earlier brief, but our owner has flagged these as incorrect. Please confirm: (i) the correct endpoint paths for these two actions; (ii) the exact request body (we assumed `{table_id, message?}` — is that right?); (iii) any auth requirement (customer token, or open?).

**Two small requests**
1. When CR-093/094/095 land, send the refreshed OpenAPI + contract v2.1 so we can diff.
2. GAP-11 (live host runs the no-fallback JWT build) — please confirm when verified.

**Our sequencing commitment:** (1) you ship B1+B3 → (2) we wire them and delete our 3 pre-login routes + 14 dead routes → (3) we switch admin login to POS → (4) you remove the 4 routes (already safe) and we sign the ownership map.
