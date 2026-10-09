# Brief for CRM — Fill in your side of the Shared DB Ownership Board
## From: MyGenie Customer App team
## Ref: INV-2026-09-15-002
## Date: 2026-10-03 · Status: ✅ **SENT and ANSWERED — CRM returned the filled JSON on 2026-10-03.**
>
> **Do not send this file again.** CRM's answer is in
> `crm_reply/INV_022_CRM_OWNERSHIP_BOARD_REPLY.md` (all 39 collections, code-scanned with
> read/write op counts and file:line), machine-readable at `crm_reply/crm_board_reply.json`.
> Reconciliation: `RECONCILIATION_CRM_BOARD_2026-10-03.md` — **36/39 agreed**, 3 ruled by the owner.
> Current authoritative ownership statement: `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` §2.
>
> Note the **Q-CA-6** section at the foot of this brief says our owner flagged the Call Waiter /
> Pay Bill endpoints as incorrect. **They were correct** — CRM proved it with `scan.py:845,863`.
> That premise is withdrawn.

## Why we are asking

We share the `mygenie` MongoDB. To stop silent overwrites and unblock migrations, we built a
one-page visual **Ownership Board** (`OWNERSHIP_BOARD.html`, also served at
`GET /api/docs/ownership-board` on the Customer App backend).

It shows all 33 collections with, per collection:
- what **Customer App** does (Read / Write / nothing),
- what **CRM** does (Read / Write / nothing),
- what **POS** does,
- who each side believes **owns the writes**.

The board has a **"CRM view"** column. Right now that column is filled from your gap-response
email — i.e. *our interpretation* of what you said. We want to replace it with **your own answer**
so the board computes disagreements automatically and we can freeze the map.

## What we need from you — one JSON block

For **every collection** below, fill three fields:

| Field | Allowed values | Meaning |
|---|---|---|
| `crm` | `""`, `"R"`, `"W"`, `"RW"` | What CRM code does to this collection today (live, not planned) |
| `owner` | `"CRM"`, `"Customer App"`, `"POS"`, `"Shared"`, `"Unknown"` | Who *should* own writes going forward, in CRM's opinion |
| `note` | free text, one line | Route or file:line that writes/reads it, or any caveat |

Please do **not** skip collections you don't touch — set `"crm": ""` and tell us who you think owns it.

### Template (copy, fill, send back)

```json
{
 "customer_app_config":       {"crm":"", "owner":"", "note":""},
 "dietary_tags_mapping":      {"crm":"", "owner":"", "note":""},
 "customers":                 {"crm":"", "owner":"", "note":""},
 "feedback":                  {"crm":"", "owner":"", "note":""},
 "users":                     {"crm":"", "owner":"", "note":""},
 "orders":                    {"crm":"", "owner":"", "note":""},
 "points_transactions":       {"crm":"", "owner":"", "note":""},
 "wallet_transactions":       {"crm":"", "owner":"", "note":""},
 "coupons":                   {"crm":"", "owner":"", "note":""},
 "loyalty_settings":          {"crm":"", "owner":"", "note":""},
 "non_qr_blocks":             {"crm":"", "owner":"", "note":""},
 "status_checks":             {"crm":"", "owner":"", "note":""},
 "import_logs":               {"crm":"", "owner":"", "note":""},
 "webhook_logs":              {"crm":"", "owner":"", "note":""},
 "coupon_distributions":      {"crm":"", "owner":"", "note":""},
 "customer_documents":        {"crm":"", "owner":"", "note":""},
 "pos_event_logs":            {"crm":"", "owner":"", "note":""},
 "otp_tokens":                {"crm":"", "owner":"", "note":""},
 "segment_whatsapp_config":   {"crm":"", "owner":"", "note":""},
 "message_logs":              {"crm":"", "owner":"", "note":""},
 "campaigns":                 {"crm":"", "owner":"", "note":""},
 "campaign_runs":             {"crm":"", "owner":"", "note":""},
 "campaign_test_sends":       {"crm":"", "owner":"", "note":""},
 "coupon_transactions":       {"crm":"", "owner":"", "note":""},
 "coupon_usage":              {"crm":"", "owner":"", "note":""},
 "cron_job_logs":             {"crm":"", "owner":"", "note":""},
 "custom_templates":          {"crm":"", "owner":"", "note":""},
 "customer_otps":             {"crm":"", "owner":"", "note":""},
 "invoices":                  {"crm":"", "owner":"", "note":""},
 "loyalty_mismatch_logs":     {"crm":"", "owner":"", "note":""},
 "migration_sync_logs":       {"crm":"", "owner":"", "note":""},
 "order_items":               {"crm":"", "owner":"", "note":""},
 "pos_request_logs":          {"crm":"", "owner":"", "note":""},
 "segments":                  {"crm":"", "owner":"", "note":""},
 "whatsapp_callback_logs":    {"crm":"", "owner":"", "note":""},
 "whatsapp_event_template_map": {"crm":"", "owner":"", "note":""},
 "whatsapp_message_logs":     {"crm":"", "owner":"", "note":""},
 "whatsapp_template_variable_map": {"crm":"", "owner":"", "note":""}
}
```

If CRM touches a collection **not in this list**, add it — that is exactly the kind of gap
we are trying to find.

### Worked example (how we'd expect two rows to look)

```json
 "customer_app_config": {"crm":"RW", "owner":"CRM", "note":"PUT /api/scan/config/{rid} routes/scan.py:412 — admin UI saves loyalty keys"},
 "non_qr_blocks":       {"crm":"",   "owner":"Customer App", "note":"never referenced in CRM code"}
```

## What happens next

1. We paste your JSON into the board → the **"Show disagreements"** view lights up only the
   collections where your `owner` differs from ours.
2. Owner decides the contested ones (O1 config, O2 dietary tags, O4 users).
3. We publish the frozen `OWNERSHIP_MAP.md` and both teams sign it.
4. That unblocks: CR-006 (backend split), CR-010 (config defaults), CR-014 (Mongo→MySQL).

## Still-open questions from the earlier brief (unchanged)

Please also answer these in the same reply — they are listed in `QUESTIONS_FOR_CRM_2026-09-15.md`:
**A1** lock config PUT · **A2** lock dietary-tags PUT · **A3** feedback collection name ·
**B1** four collections missing on UAT · **B2** four unclaimed collections ·
**B3** `restaurant_id` normalisation on config PUT · **B4** six-field stable interface on `users`.

## New question — Call Waiter / Pay Bill endpoints (Q-CA-6, 2026-10-03)

Our Call Waiter and Pay Bill buttons are currently stubs. We had noted `/scan/call-waiter` and `/scan/request-bill` from a previous brief, but our owner has flagged these as incorrect. Please confirm:
1. The correct endpoint paths for Call Waiter and Pay Bill actions
2. The exact request body (we assumed `{table_id, message?}` — correct?)
3. Any auth requirement (customer token required, or open?)

*Answer format for those: one line each, prefixed with the ID.*
