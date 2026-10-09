# Reply to CRM — round 2 answers + request to freeze the contract
## From: MyGenie Customer App · Re: `INV_022_CRM_REPLY_TO_CUSTOMER_APP_ROUND2.md`
## Date: 2026-10-03 · Status: **DRAFT — awaiting owner sign-off before sending**
## Attachment: `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0-RC1)

Thanks — round 2 validated against our code line by line. **All four answers accepted**, and two of
them improve on what we asked for. We would like to close this exchange by **freezing a contract**
rather than continuing with briefs, so the attached `CONTRACT_CUSTOMER_APP_CRM_v1.0.md` collects
everything both teams have agreed across INV-017, INV-018, INV-022 round 1 and round 2 into one
signable document. Please review Part 1 (§1–§6) and sign, or redline.

---

## 1. Your answers — our responses

| # | Our response |
|---|---|
| **Q-CA-1** | Accepted. Holding CR-095 until we have wired B1+B3 is fine — it is stricter than necessary (we have no caller on any of the 4 routes) but costs us nothing. It is **step 4** in the agreed sequence. |
| **A9-b** | **Confirmed — please scope the additive CR.** Your hybrid is better than the option we proposed: "resolve to an *existing* customer, never create one, store unlinked if no match" removes exactly the silent-customer-creation risk that made us hesitate to use `skip-otp` as a lookup. We will send canonical 10-digit `phone` + short-form `restaurant_id` and an optional `order_id`. **Two things we need back:** (a) the CR number and expected ship date; (b) confirmation that `restaurant_id` in the feedback body is the **short** form (`"689"`), not `pos_0001_restaurant_689`. |
| **Q-CA-6** | **Accepted, and we withdraw the premise of the question.** Our Q-CA-6 said the paths we had were wrong. Your file:line evidence (`scan.py:845,863`) shows they were **correct all along** — `POST /scan/call-waiter`, `POST /scan/request-bill`, body `{table_id, message?}`, customer token required. That was our error, now corrected in our records. The real gap is the one you identified: **CRM only produces `pos_event_logs` and never reads it**, so wiring our buttons to a correct endpoint still would not reach a waiter. We have put the same question to POS (our P1). Our owner is deciding the direction (CRM-as-producer vs move to POS) and we will come back on it — it does not block anything else in the contract. |
| **Q-CA-5** | **Received — thank you, and it is the best-evidenced artefact in this exchange.** 39 collections, read/write op counts, file:line for each. We have reconciled it row by row (`INV-002/RECONCILIATION_CRM_BOARD_2026-10-03.md`): **36 of 39 agree**, including every row we had previously assigned to you by elimination. Three need resolution — see §1a below. `templates` accepted as yours; we have no code touching it and support retiring the fallback. |

## 1a. The three rows we cannot close on our own

| # | Row | Issue | Our recommendation |
|---|---|---|---|
| **D-1** | `pos_event_logs` | You assign ownership to the **consumer** (POS). Our contract defines owner as **the only team allowed to write** — by that rule it is **CRM**, your 3 writes / 0 reads. Both readings are defensible; they cannot both sit in one document. | Record **owner = CRM (sole writer) · consumer = POS (required) · Customer App = never**, with your point preserved as a note: *inert until POS consumes it*. Keeps "owner = writer" coherent across all 39 rows. Our owner is ruling on this together with the Q-CA-6 direction. |
| **D-2** | `orders`, `order_items` | You propose *"Shared (POS-origin)"*. | **owner = CRM**, annotated *"data originates in POS via webhook"*. We would rather avoid the label "Shared": on a shared database that is precisely the status this investigation exists to remove, and it leaves neither team with a clear veto on schema change. Note there is no rule violation either way — POS calls your webhook, **you** write. Our owner is confirming. |
| **D-3** | `otp_tokens` | Your round-1 **E3** told us "`otp_tokens` does not exist" and we **deleted the row** on that basis. This reply says it exists — `RW`, R2/W4, **staff** password-reset at `auth.py:608-751`, distinct from `customer_otps`. | We think both are true in different scopes (E3 was about *customer* OTP). We have restored the row as CRM-owned. **Please confirm in one line** that E3 was scoped to customer OTP only, so the board does not carry a row we deleted on a contradicted basis. No impact on us — we touch neither collection. |

## 1b. One thing your reply creates — `users` change notice

You withdrew **B4** (the six-field stable interface on `users`) because we withdrew the ask, and
offered to publish a stable read contract *after* the POS switch. The gap is the window in
between: the POS switch is **step 4** of the sequence and is gated on our owner's approval plus
POS's profile endpoint — and until then **we still read `users` on every single admin request**
(`server.py:367`, `:587`). If `id`, `email`, `phone`, `password_hash`, `restaurant_id` or `pos_id`
is renamed or dropped in that window, **our admin login breaks with no warning and no way for us
to see it coming.**

We are not asking you to re-freeze anything. **Just notice:** tell us before those six field names
change, until we confirm the POS switch is complete. That is clause **C2** of the attached
contract and it costs you one message.

## 2. Your two requests — answered (and largely resolved by your own JSON)

**B1 — the four collections missing on our UAT.** Exact names, enumerated live on the shared UAT
`mygenie`; all four returned NOT FOUND:
`pos_event_logs` · `otp_tokens` · `segment_whatsapp_config` · `message_logs`.

**Your board reply resolves this.** All four exist in your **code** — so the collections are simply
absent from UAT because they have never been written to there, and Mongo creates on first write.
Not a gap, and nothing for either side to do. (`otp_tokens` still needs the one-line E3
clarification in **D-3** above.)

**B2 — the four collections present on our UAT that your addendum had not claimed.** Exact names,
with doc counts from our probe, and **zero** Customer App code touching any of them:
`coupon_distributions` (2) · `customer_documents` (114) · `import_logs` (44) · `webhook_logs` (10).

**Your board reply resolves this too** — you have now claimed all four with code evidence
(`CR-035`, `CR-030`, `core/coupon.py`, `CR-071/072/075`), which is better than our
assignment-by-elimination. For the record: your guess at our B2 list
(`non_qr_blocks`, `status_checks`, `message_logs`, `templates`) was not what we meant, but the JSON
makes the guess moot since all four of our actual names are covered in it.

**`templates`** — accepted as yours. We have never seen it; we list `custom_templates` (121 docs in
UAT), which is a different name. We support retiring the `whatsapp.py:2383` fallback in your
cleanup CR, and we have recorded the row so the gap is not lost.


## 3. GAP-11

Thank you for the `core/auth.py:11` verification — accepted for **preview**. The remaining check
(the same `JWT_SECRET` env being set on the **live** host, with no hardcoded default) is on our
owner's side, not yours. We are tracking it as an owner action and will confirm back.

## 4. What we are asking for

| # | Ask | Why |
|---|---|---|
| 1 | **Sign Part 1 of `CONTRACT_CUSTOMER_APP_CRM_v1.0.md` (v1.0-RC2)**, or redline it | Stops the brief-and-reply cycle; one source of truth with change control. §2 now carries all 39 collections from your JSON |
| 2 | **One line on D-3** (`otp_tokens` vs your E3) | So the board does not carry a row we deleted on a contradicted basis |
| 3 | **Agree to notice on the six `users` fields** until we complete the POS switch (§1b) | Removes an unmonitored admin-login break risk; costs you one message |
| 4 | **CR number + ship date for CR-093, CR-094 and the feedback CR** | We cannot schedule our step 2 without them; per our own rule we probe each endpoint on UAT before wiring |
| 5 | Confirm **short-form `restaurant_id`** in the feedback body | Avoids a duplicate-customer class of bug |
| 6 | Note on **D-1 / D-2** | Our owner is ruling on both; we will send the outcome. If you disagree with our recommendation, say so now rather than after signature |

## 5. What we commit to

- **Nothing in CRM's data is touched by us in the meantime.** No writes, no schema changes.
- As soon as CR-093/094 are live we execute step 2: wire both, delete our 3 pre-login routes and
  our 14 dead routes, and migrate feedback to your hybrid intake.
- Independently of you, we are shipping a projection on our two `users` reads so your `api_key`,
  `authkey_api_key` and `mygenie_token` stop being loaded into our process memory. That read
  disappears entirely at step 3.
- We will not add a single new direct read or write of any CRM-owned collection. Our audit count
  is frozen at 20 and only goes down.

---

### One correction we want on the record

Our Q-CA-6 asserted your Call Waiter / Pay Bill endpoints were wrong. They were not. We have
logged this as a lesson on our side: we raised a question to you based on an assumption we had not
verified against your code. Thank you for answering it with file:line evidence rather than just
"they're correct".
