# CRM reply — Shared DB Ownership Board (our side filled in)

## From: MyGenie CRM · Re: `CRM_BRIEF_OWNERSHIP_BOARD.md` (Customer App, INV-2026-09-15-002)
## Date: 2026-09-28 · Status: **✅ APPROVED & SENT (owner authorised 2026-09-28)**

Method: every value below was derived from a read-only scan of the CRM codebase
(`/app/backend`, all `.py`, excluding `__pycache__`). `crm` reflects **live code today**, not
planned. Read ops = `find / find_one / count_documents / aggregate / distinct`.
Write ops = `insert_* / update_* / replace_one / delete_* / find_one_and_update / bulk_write`.
Index creation is noted separately as an ownership signal.

Legend for `crm`: `""` none · `R` read-only · `W` write-only · `RW` read+write.

```json
{
 "customer_app_config":       {"crm":"RW", "owner":"Customer App", "note":"read scan.py:717,750; write scan.py:759,763 — ALL via orphan GET/PUT /scan/config/{rid}, removed by CR-095. After CR-095 CRM touches = none. Customer App owns via its own backend."},
 "dietary_tags_mapping":      {"crm":"RW", "owner":"Customer App", "note":"read scan.py:776,791; write scan.py:796,801 — orphan GET/PUT /scan/menu/dietary-tags/{rid}, removed by CR-095. After CR-095 CRM touches = none."},
 "customers":                 {"crm":"RW", "owner":"CRM", "note":"core entity (R=132,W=65). pos.py (lookup/create/merge), customers.py, scan.py. Shared-READ by Customer App + POS; CRM owns writes."},
 "feedback":                  {"crm":"RW", "owner":"CRM", "note":"write scan.py:834 + services/feedback_service.py:26; read feedback_service.py:83, analytics_service.py:510. See A9-b for the no-token intake contract."},
 "users":                     {"crm":"RW", "owner":"CRM", "note":"restaurant/staff accounts (R=45,W=28). routers/auth.py + core/auth.py. Customer App withdrew the users-freeze ask (Q-CA-3) and will stop reading users once admin login moves to POS."},
 "orders":                    {"crm":"RW", "owner":"Shared (POS-origin)", "note":"POS webhook pos.py + migration.py write (R=34,W=6); CRM reads for loyalty/analytics/scan. Data originates in POS; CRM persists + enriches. Owner call: POS vs Shared."},
 "points_transactions":       {"crm":"RW", "owner":"CRM", "note":"loyalty earn/redeem ledger (R=10,W=16). core/loyalty.py, routers/points.py, pos.py."},
 "wallet_transactions":       {"crm":"RW", "owner":"CRM", "note":"wallet credit/debit ledger (R=4,W=3). routers/wallet.py — placeholder module, 0 active tenants."},
 "coupons":                   {"crm":"RW", "owner":"CRM", "note":"coupon definitions (R=33,W=10). core/coupon.py, routers/coupons.py, pos.py."},
 "loyalty_settings":          {"crm":"RW", "owner":"CRM", "note":"per-tenant loyalty config (R=39,W=4). core/loyalty.py, routers/points.py. Feeds B3 /scan/loyalty-rules/{rid} (CR-094)."},
 "non_qr_blocks":             {"crm":"",   "owner":"Customer App", "note":"never referenced anywhere in CRM code."},
 "status_checks":             {"crm":"",   "owner":"Customer App", "note":"never referenced anywhere in CRM code."},
 "import_logs":               {"crm":"RW", "owner":"CRM", "note":"customer import history (R=1,W=1). routers/customers.py import flow (CR-035)."},
 "webhook_logs":              {"crm":"RW", "owner":"CRM", "note":"Freshmarketer webhook idempotency + audit (R=1,W=2,IDX=2). routers/pos.py webhook (CR-030)."},
 "coupon_distributions":      {"crm":"W",  "owner":"CRM", "note":"write-only distribution record (W=1). core/coupon.py."},
 "customer_documents":        {"crm":"RW", "owner":"CRM", "note":"hotel guest ID docs (R=6,W=3,IDX=2). routers/customers.py + migration.py (CR-071/072/075). Stored in S3."},
 "pos_event_logs":            {"crm":"W",  "owner":"POS", "note":"WRITE-ONLY in CRM (W=3, R=0): call-waiter scan.py:859, request-bill scan.py:877, pos.py:2484. CRM never reads it → consumer must be POS. If POS does not read it, it is dead (see Q-CA-2 / Q-CA-6)."},
 "otp_tokens":                {"crm":"RW", "owner":"CRM", "note":"STAFF password-reset OTP (R=2,W=4). routers/auth.py:608-751. Distinct from customer scan OTP (customer_otps)."},
 "segment_whatsapp_config":   {"crm":"RW", "owner":"CRM", "note":"per-segment WhatsApp config (R=3,W=4). routers/customers.py segments."},
 "message_logs":              {"crm":"W",  "owner":"CRM", "note":"legacy pre-CR-004 log (W=1, R=0), effectively dead. Superseded by whatsapp_message_logs."},
 "campaigns":                 {"crm":"RW", "owner":"CRM", "note":"campaign defs + state machine (R=19,W=21). routers/campaigns.py, core/campaign_jobs.py."},
 "campaign_runs":             {"crm":"RW", "owner":"CRM", "note":"per-send execution runs (R=4,W=5,IDX=2). routers/campaigns.py."},
 "campaign_test_sends":       {"crm":"W",  "owner":"CRM", "note":"test-send audit (W=1). routers/campaigns.py."},
 "coupon_transactions":       {"crm":"RW", "owner":"CRM", "note":"coupon usage audit trail (R=3,W=1). core/coupon.py."},
 "coupon_usage":              {"crm":"RW", "owner":"CRM", "note":"idempotent redemption records (R=25,W=4,IDX=3). core/coupon.py, pos.py. Idempotency key (user_id, order_id)."},
 "cron_job_logs":             {"crm":"RW", "owner":"CRM", "note":"scheduler execution logs (R=1,W=2). core/scheduler.py, routers/cron.py."},
 "custom_templates":          {"crm":"RW", "owner":"CRM", "note":"user-authored WA templates → Meta submission (R=17,W=13). routers/whatsapp.py."},
 "customer_otps":             {"crm":"RW", "owner":"CRM", "note":"CUSTOMER scan-and-order OTP (R=2,W=3). scan.py:193-287. May shift toward POS/Customer-App auth later (ties to Q-CA-3 + CR-089/CR-090)."},
 "invoices":                  {"crm":"RW", "owner":"CRM", "note":"e-invoice records, token-indexed (R=3,W=3,IDX=2). services/invoice_generator.py, routers/invoices.py."},
 "loyalty_mismatch_logs":     {"crm":"W",  "owner":"CRM", "note":"CRM-vs-POS loyalty drift audit, write-only (W=1). core/loyalty.py."},
 "migration_sync_logs":       {"crm":"RW", "owner":"CRM", "note":"POS data migration sync logs (R=3,W=6,IDX=1). routers/migration.py."},
 "order_items":               {"crm":"RW", "owner":"Shared (POS-origin)", "note":"line items per order (R=16,W=6,IDX=4). Written by POS webhook + migration; read by analytics/coupon. Same owner question as orders."},
 "pos_request_logs":          {"crm":"W",  "owner":"CRM", "note":"POS request audit, write-only when POS_REQUEST_LOGGING_ENABLED (W=1,IDX=4). routers/pos.py."},
 "segments":                  {"crm":"RW", "owner":"CRM", "note":"customer segment definitions (R=9,W=4). routers/customers.py segments_router."},
 "whatsapp_callback_logs":    {"crm":"W",  "owner":"CRM", "note":"raw AuthKey webhook payload audit, write-only (W=1,IDX=2). routers/whatsapp.py status-callback."},
 "whatsapp_event_template_map": {"crm":"RW", "owner":"CRM", "note":"event→template bindings (R=9,W=3). routers/whatsapp.py."},
 "whatsapp_message_logs":     {"crm":"RW", "owner":"CRM", "note":"every WA send attempt + delivery status (R=15,W=6,IDX=4). routers/whatsapp.py, core/whatsapp.py."},
 "whatsapp_template_variable_map": {"crm":"RW", "owner":"CRM", "note":"template→variable mappings + modes (R=3,W=3). routers/whatsapp.py."},

 "templates": {"crm":"R", "owner":"CRM", "note":"NOT on your board — adding it. Read-only fallback lookup at whatsapp.py:2383 (R=1,W=0). Appears to be a dead/legacy alias of custom_templates. Flagging so the gap is recorded; recommend we retire the fallback in a future cleanup CR."}
}
```

## Notes on contested rows (for the "Show disagreements" view)

- **O1 `customer_app_config` + O2 `dietary_tags_mapping`** — we agree these are **Customer App-owned**.
  CRM's only touch is the 4 orphan routes being deleted in **CR-095**; after that CRM = none. No conflict.
- **`pos_event_logs`** — CRM is a **write-only producer** (Call Waiter / Pay Bill). We never read it.
  Proposed owner = **POS** (the consumer). This matches your Q-CA-2. If POS also doesn't read it, it is dead.
- **`orders` / `order_items`** — CRM writes them but the data **originates in POS** (webhook + migration).
  We marked owner = **Shared (POS-origin)**; owner to confirm POS vs Shared.
- **O4 `users`** — CRM-owned. Your side withdrew the freeze ask (Q-CA-3); no conflict expected.

## Still-open questions from your earlier brief (`QUESTIONS_FOR_CRM_2026-09-15.md`)

- **A1 (lock config PUT)** — resolved by CR-095 (route deleted, not locked).
- **A2 (lock dietary-tags PUT)** — resolved by CR-095 (route deleted).
- **A3 (feedback collection name)** — `feedback` (confirmed; write at scan.py:834).
- **B1 (four collections missing on UAT)** — need the exact four names from you to answer against UAT DB.
- **B2 (four unclaimed collections)** — candidates from our scan: `non_qr_blocks`, `status_checks` (CRM-none → yours), plus `message_logs`, `templates` (legacy/dead on our side). Confirm which four you meant.
- **B3 (restaurant_id normalisation on config PUT)** — N/A once CR-095 removes the PUT.
- **B4 (six-field stable interface on `users`)** — withdrawn per Q-CA-3; we will publish a stable read contract if you still need it post-POS-switch.
