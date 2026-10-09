# Paste-ready message to the CRM agent — 2026-10-03

> Short version for chat. The full detail is in
> `INV-003/REPLY_TO_CRM_ROUND2_AND_FREEZE.md` and `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md`
> (v1.0-RC3). Attach both if the agent can read files.

---

Thanks — round 2 and the ownership board both received and reconciled against our code line by
line. **All your answers accepted.** Your board is the best-evidenced artefact in this exchange;
36 of our 39 rows matched yours, and you cleared every row we had previously assigned to you only
by elimination.

**We want to stop trading briefs and freeze a contract.** Attached is
`CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0-RC3) — ground rules, all 39 ownership rows, the identity
contract, every endpoint we consume with its agreed field quirks, the limitations both sides
accept, the 4-step execution sequence, and change control. Please **sign Part 1 (§1–§6) or redline
it**.

**Decisions on our side you should know:**

1. **A9-b confirmed — please scope the additive CR.** Your hybrid is better than what we asked
   for: resolving to an *existing* customer and storing unlinked rather than creating one removes
   exactly the risk we were worried about. We will send canonical 10-digit `phone` + short-form
   `restaurant_id` + optional `order_id`.
2. **Q-CA-6 — we withdraw our own question.** Your `scan.py:845,863` evidence shows
   `POST /scan/call-waiter` and `POST /scan/request-bill` with `{table_id, message?}` and a
   customer token were **correct all along**. That was our error. The real gap is the one you
   identified: you produce `pos_event_logs` and never read it, so nothing reaches a waiter. We
   have put that to POS.
3. **`pos_event_logs` ownership — we have assigned it to CRM, not POS.** Our contract defines
   "owner" as *the only team allowed to write*, and you are the sole writer (3 writes, 0 reads).
   Your point is preserved as a note: **consumer = POS, required; inert until POS consumes it.**
   If you object, say so before signature.
4. **`orders` / `order_items` — owner = CRM**, annotated *"data originates in POS via webhook"*.
   We would rather not use the label "Shared": on a shared database that is the exact status this
   investigation exists to remove, and it leaves neither team a clear veto on schema change. No
   rule violation either way — POS calls your webhook, **you** write.
5. **B1 / B2 are resolved by your own JSON.** For the record: B1 = `pos_event_logs`, `otp_tokens`,
   `segment_whatsapp_config`, `message_logs` (all exist in your code; absent from our UAT only
   because never written there). B2 = `coupon_distributions`, `customer_documents`, `import_logs`,
   `webhook_logs` — all four now claimed by you with code evidence.
6. **`templates`** accepted as yours; we support retiring the `whatsapp.py:2383` fallback in a
   cleanup CR.

**Five things we need back:**

| # | Ask |
|---|---|
| 1 | **Sign Part 1** of the attached contract, or redline it |
| 2 | **One line on `otp_tokens`.** Your round-1 **E3** said it does not exist and we deleted the row on that basis; your board says it exists as the **staff** password-reset store (`auth.py:608-751`). We assume E3 was scoped to *customer* OTP — please confirm, so our board isn't carrying a row we removed on a contradicted basis. No impact on us either way. |
| 3 | **Notice on the six `users` fields.** You withdrew B4 because we withdrew the ask — but the POS switch that removes our dependency is step 3 and is gated on our owner plus POS, and until then we read `users` on **every admin request**. If `id`, `email`, `phone`, `password_hash`, `restaurant_id` or `pos_id` is renamed or dropped in that window, our admin login breaks with no warning. **We are not asking you to re-freeze anything — just tell us before those six names change.** |
| 4 | **CR numbers + ship dates** for CR-093 (`/scan/auth/lookup`), CR-094 (`/scan/loyalty-rules/{rid}`) and the feedback CR. We cannot schedule our side without them, and we will probe each endpoint on UAT before wiring. |
| 5 | **Confirm `restaurant_id` in the feedback body is the short form** (`"689"`), not `pos_0001_restaurant_689`. |

**What we commit to meanwhile:** we touch nothing of yours — no writes, no schema changes, no new
direct reads. Our audit count is frozen at 20 direct touches and only goes down. Independently of
you we are shipping a field projection on our two `users` reads so your `api_key`,
`authkey_api_key` and `mygenie_token` stop being loaded into our process memory; that read
disappears entirely at step 3.
