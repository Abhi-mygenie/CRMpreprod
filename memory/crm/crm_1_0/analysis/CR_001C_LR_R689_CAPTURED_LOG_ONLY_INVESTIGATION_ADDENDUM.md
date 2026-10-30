# CR-001C-LR R689 — Captured-Log-Only Investigation Addendum

> **⚠️ SUPERSEDED 2026-05-26.** Both "pasted payloads" referenced below have been superseded by real, contract-compliant POS payloads landing in production. See `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md` and `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md`. Preserved for history.

**Module:** CR-001C-LR (correction)
**Date:** 2026-05-24
**Restaurant:** *Kunafa Mahal* (`restaurant_id=689`, `user_id=pos_0001_restaurant_689`)
**Mode:** Investigation only — strictly what is stored in CRM-captured JSON logs for the 2 owner-pasted orders. No reliance on the owner-pasted JSON. No code, DB, env, or migration changes.
**Mongo time at investigation:** 2026-05-24 08:47 UTC

> Supersedes nothing. **Companion** to the two prior reports:
> - `CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION.md` (Payload 1)
> - `CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION_868917.md` (Payload 2, order `868917`)
>
> Reason for this addendum: both prior reports inspected the owner-**pasted** JSON. The owner asked specifically to investigate from the **captured payload in JSON logs** for these 2 orders. This report restricts itself to that.

---

## 1. Executive Summary

| Question | Verdict |
|---|---|
| Is there a captured JSON-log entry in CRM for **Payload 1** (the "abhishek jain" submit-order JSON)? | ❌ **No captured request_body for this payload exists anywhere in CRM.** Latest CRM-captured payload for the same customer is order **`868908` from 2026-05-23 11:38 UTC** — different shape, different fields. |
| Is there a captured JSON-log entry in CRM for **Payload 2** (order `868917`)? | ❌ **No.** Zero hits in any CRM log collection or file log for `868917`. |
| Were the corrected fields (`loyalty_points_used`, `loyalty_discount`, `loyalty_idempotency_key`) present in the **last captured** R689 payload (`868908`)? | ❌ **No** — the actually-captured request body for `868908` carries only 15 keys; none are loyalty-redemption fields. |
| Did any alias (`used_loyalty_point`, `redeem_points`, etc.) appear in any captured R689 request body? | ❌ **No.** The POS→CRM mapping in prod strips the alias entirely. |
| Was there any CRM-facing redemption signal for R689 on `/api/pos/orders` or `/api/pos/webhook/payment-received` ever? | ❌ **No.** `points_transactions` redeem count for R689 = **0** (ever). |
| Conclusion | 🟥 **Neither pasted payload was captured by CRM.** Both are POS-internal stages that never POSTed to a CRM endpoint. The only captured R689 evidence we have is the slim 15-key `/api/pos/orders` payload — and that, too, contains no loyalty redemption fields. |

---

## 2. Method — All Log Surfaces Inspected

| Surface | Type | Filter applied | Result |
|---|---|---|---|
| `pos_request_logs` (Mongo, CR-002 middleware) | Per-request JSON capture of `/api/pos/*` | `request_body.order_id ∈ {"868917", 868917}` | **0 hits** |
| `pos_request_logs` | as above | `request_body.bill_id` / `request_body.transaction_id` containing `868917` | **0 hits** |
| `pos_request_logs` | as above | `response_body.data.{order_id,pos_order_id}` containing `868917` | **0 hits** |
| `pos_request_logs` | as above | last 30 entries any-restaurant | latest is `868908` @ 2026-05-23 11:38 UTC; **no entries on 2026-05-24 today** |
| `pos_request_logs` | as above | `restaurant_id ∈ {689, "689"}` | 5 R689 entries, none today, none with loyalty fields |
| `pos_event_logs` | Mongo collection (found by inventory) | total docs | **0** (empty collection) |
| `mygenie_payload_samples` | Mongo collection | search for `868917` and membership id `5ebde664-…` | **0 hits** (only 2 customer samples from R635, unrelated) |
| `orders` | persisted CRM order docs | `pos_order_id ∈ {"868917", 868917}` | **0 hits** |
| `points_transactions` | persisted PT rows | `order_id="868917"` or `idempotency_key~"868917"` | **0 hits** |
| `migration_sync_logs` | sync logs | scope = R689 | irrelevant — migration logs are for backfill, not realtime |
| `/var/log/supervisor/backend.out.log` (preview pod) | uvicorn console | grep `868917` | **0 matches** |
| `/var/log/supervisor/backend.out.log` | as above | grep `5ebde664` (membership id from Payload 1) | **0 matches** |
| `/var/log/supervisor/backend.out.log` | as above | grep `7505242126` (mobile from Payload 1) | **5 matches today** — see §3 |
| `/var/log/nginx/access.log` (preview pod) | nginx access | any `/api/pos/*` today | none routed through this nginx today |

**Inventory of all log-like collections found in this DB:** `cron_job_logs`, `migration_sync_logs`, `mygenie_payload_samples`, `pos_event_logs`, `pos_request_logs`, `whatsapp_event_template_map`, `whatsapp_message_logs`. None contain `868917`. `pos_event_logs` is empty.

---

## 3. What Was Actually Captured for R689 (the only ground-truth evidence)

### 3.1 Last captured `/api/pos/orders` request for R689 — order `868908`

Source: `pos_request_logs.id = 1fdd70b5-df4f-45bd-b668-2544d693e4cb`, `created_at = 2026-05-23 11:38:17.724 UTC`.

**Captured `request_body` keys (exact, complete — 15 total):**

```
associated_order_ids, created_at, cust_mobile, cust_name, items,
order_amount, order_id, order_type, pos_id, restaurant_id, room_info,
table_id, table_name, waiter_id, waiter_name
```

**Captured `request_body` field values (selected):**

| Field | Value |
|---|---|
| `order_id` | `"868908"` |
| `restaurant_id` | `"689"` (string) |
| `cust_mobile` | `"7505242126"` |
| `cust_name` | `"abhishek jain"` |
| `order_amount` | `9177` |
| `order_type` | `"dinein"` |
| **`loyalty_points_used`** | ❌ **absent** |
| **`loyalty_discount`** | ❌ **absent** |
| **`loyalty_idempotency_key`** | ❌ **absent** |
| **`used_loyalty_point`** | ❌ **absent** (alias also stripped) |
| `redeem_points` | ❌ absent |
| `points_redeemed` | ❌ absent |
| `loyalty_redemption_id` | ❌ absent |
| `discount_value` | ❌ absent |
| `cust_membership_id` | ❌ absent (POS↔CRM mapper drops it) |
| `payment_method` / `payment_mode` | ❌ absent |
| `payment_status` | ❌ absent |
| `transaction_id` | ❌ absent |
| `order_sub_total_amount` | ❌ absent |
| `coupon_discount` | ❌ absent |
| `self_discount` | ❌ absent |
| `order_discount` | ❌ absent |
| `tax_amount` / `gst_tax` / `vat_tax` etc. | ❌ absent |
| `use_wallet_balance` / `wallet_used` | ❌ absent |
| `food_detail` / `cart` | ❌ absent (items are sent under `items[]` instead) |
| `partial_payments` | ❌ absent |

**Captured response body (selected):**

```json
{ "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "b8a1c317-867b-4f37-9902-cd50d1acc80e",
    "pos_order_id": "868908",
    "customer_id": "5ebde664-c7b7-46b7-85ab-f5c5319161b9",
    "points_earned": 4588,
    "total_points": 4588,
    "tier": "Gold",
    "loyalty_redeem": null
  }
}
```

`data.loyalty_redeem = null` — the corrected CRM path was traversed but no-op because the captured request had no `loyalty_points_used`.

### 3.2 Today's preview-pod activity for the same customer (`7505242126`)

Source: `/var/log/supervisor/backend.out.log` lines 209-215.

```
GET  /api/pos/customers?search=7505242126&limit=10
GET  /api/pos/customers?search=abhishek+jain&limit=10
GET  /api/pos/customers?search=abhishek+jain&limit=10
GET  /api/pos/customers?search=7505242126&limit=10
POST /api/pos/customer-lookup
```

These are **read-only admin/UI lookups** on the preview pod — not POS realtime traffic. They confirm:
- Today, on R689's customer `7505242126`, the only CRM activity is owner-side investigation.
- Zero `POST /api/pos/orders` and zero `POST /api/pos/webhook/payment-received` calls reached CRM for this customer or for `868917` today.

---

## 4. Key-Name Gaps in the **Captured** Payload (vs. owner-pasted payloads)

The owner correctly suspects the **incoming CRM payload itself has key-name gaps** independent of the corrected-plan loyalty fields. Comparison below uses the only captured ground-truth: order `868908`.

### 4.1 Fields the owner-pasted POS payloads contain but the captured CRM payload does NOT

| Field in pasted JSON | Stage of payload | Present in captured CRM payload? | Implication |
|---|---|---|---|
| `cust_membership_id` (Payload 1) | POS order-submit | ❌ **Stripped** | The cleanest customer id is lost. CRM falls back to phone-match. |
| `cust_email` | both | ❌ **Stripped** | CRM cannot enrich customer profile on the fly. |
| `cust_dob`, `cust_anniversary` | Payload 1 | ❌ Stripped | Birthday/anniversary cron has no realtime trigger. |
| `payment_method` (P1) / `payment_mode` (P2) | both | ❌ Stripped | CRM cannot record tender mode. |
| `payment_status` | both | ❌ Stripped | CRM treats every hit as paid implicitly. |
| `transaction_id` | both | ❌ Stripped (and empty when present) | No POS-side tx anchor. |
| `order_sub_total_amount` | both | ❌ Stripped | CRM has only `order_amount`; cannot separate pre-tax base. |
| `tax_amount`, `gst_tax`, `vat_tax`, `service_tax`, `service_gst_tax_amount` | P1 | ❌ All stripped | Tax breakdown lost. |
| `self_discount`, `coupon_discount`, `order_discount`, `comm_discount`, `discount_value`, `discount_type` | both | ❌ All stripped | All discount components invisible to CRM. |
| `tip_amount`, `tip_tax_amount`, `delivery_charge`, `round_up` | P1 | ❌ Stripped | All extra charges invisible. |
| `partial_payments[]` | P1 | ❌ Stripped | Split-tender (cash + card + UPI) lost. |
| `paid_room`, `room_id`, `address_id` | P1 | ❌ Stripped (note: `room_info` IS captured) | Room-billing details partially captured via CR-001A Phase 2 only. |
| `food_detail[]` / `cart[]` | both | ✅ Captured as `items[]` (mapped via CR-001A Phase 1 aliases) | Working as intended. |
| `used_loyalty_point` (P1 = 0, P2 = 753) | both | ❌ **Stripped** | **The whole reason we are doing CR-001C-LR.** |
| `loyalty_redemption_id` | P2 only | ❌ Stripped | POS expected an id back from CRM; never got one. |
| `use_wallet_balance` | both | ❌ Stripped (note: `wallet_used` is on CRM schema but POS doesn't send it) | Wallet flow is also affected by mapping gaps. |
| `discount_member_category_*` | P1 | ❌ Stripped | |
| `usage_id` | P1 | ❌ Stripped | |
| `print_kot`, `billing_auto_bill_print`, `auto_dispatch` | P1 | ❌ Stripped | Out-of-scope for loyalty but documents the gap. |
| `waiter_id`, `table_id` | both | ✅ Captured | Working. |

### 4.2 Schema vocabulary mismatch

| Concept | Payload 1 vocab | Payload 2 vocab | Captured CRM vocab | Corrected CRM schema expects |
|---|---|---|---|---|
| Customer name | `cust_name` | `name` | `cust_name` | `cust_name` |
| Customer phone | `cust_mobile` | `mobile` | `cust_mobile` | `cust_mobile` (required) |
| Customer email | `cust_email` | `email` | (stripped) | `cust_email` (optional) |
| Items | `cart[]` | `food_detail[]` | `items[]` | `items[]` |
| Payment field | `payment_method` | `payment_mode` | (stripped) | `payment_method` |
| Loyalty points | `used_loyalty_point` | `used_loyalty_point` | (stripped) | **`loyalty_points_used`** |
| Restaurant id | `restaurant_id` (int) | `restaurant_name` only | `restaurant_id` (string) | `restaurant_id` (string) |
| Pos id | (absent) | (absent) | `pos_id` | `pos_id` (default `"mygenie"`) |

**Two payload-vocab variations on the POS side**, one transport-stripped variation arriving at CRM. The corrected schema expects the canonical CRM names — none of which are populated on the redemption side today.

---

## 5. CRM Redemption Readiness — From Captured Evidence Only

| Path | Captured for R689? | Carries any loyalty signal? | Verdict |
|---|---|---|---|
| `POST /api/pos/orders` | ✅ 5 captures, latest `868908` | ❌ no `loyalty_points_used`, no `used_loyalty_point`, no `redeem_points`, no `loyalty_redemption_id` | Cannot redeem |
| `POST /api/pos/webhook/payment-received` | ❌ never captured for R689 | n/a | Cannot redeem |
| `POST /api/pos/loyalty/redeem` | ❌ never captured for R689 | n/a | (Not the primary path post-correction anyway) |
| `POST /api/pos/customer-lookup` | ✅ captured today (preview pod admin) | n/a | Read-only |
| `GET /api/pos/customers?search=…` | ✅ captured today (preview pod admin) | n/a | Read-only |

**Net:** zero captured CRM-side evidence of *any* loyalty redemption signal for R689 — across all endpoints, both pasted payloads, and the prior `868908` order.

---

## 6. Points Transaction & Customer Counter Evidence (Captured State)

| Check | Result |
|---|---|
| `points_transactions` rows with `order_id="868917"` | 0 |
| `points_transactions` rows with `idempotency_key` containing `868917` | 0 |
| `points_transactions` redeem rows for R689 (any time, any order) | **0** |
| Customer `5ebde664-…` (`abhishek jain`, R689) `total_points_redeemed` | **0** (unchanged) |
| Customer `5ebde664-…` `total_points` | **4588** (= `points_earned` from order `868908`, unchanged) |
| Customer's `tier` | `Gold` |

---

## 7. Gap List for POS Team — From Captured Evidence Only

### 7.1 Primary: corrected loyalty fields never reach CRM

POS deployment to prod must add **all three** of these fields to the outbound `/api/pos/orders` payload mapper:

| Field | Type | Trigger |
|---|---|---|
| `loyalty_points_used` | `int` > 0 | Required when cashier has Applied a redemption |
| `loyalty_discount` | `float` ≥ 0 | Optional — informational |
| `loyalty_idempotency_key` | `string` | Optional — server falls back to `f"order_{order_id}"` |

### 7.2 Secondary: many non-loyalty fields also stripped at the POS↔CRM bridge

While these are out of strict LR scope, **the same mapper that strips loyalty fields strips many others**. POS team should review the full bridge mapping (see §4.1) — opening this up is the actual right place to fix CR-001C-LR because the fix is one mapping change away.

### 7.3 Tertiary: schema vocabulary divergence between POS stages

POS has at least two internal payload shapes (Payload 1 cart-submit vs. Payload 2 bill-collect) with different field names (`cust_name`/`name`, `cust_mobile`/`mobile`, `payment_method`/`payment_mode`, `cart`/`food_detail`). Whichever stage POS designates as the final-bill realtime hit to CRM **must** use the canonical `POSOrderWebhook` field names; intermediate POS stages can keep their internal vocab.

### 7.4 Workflow gap reconfirmed by captured evidence

The preview-pod log shows `/api/pos/customer-lookup` was used today — meaning the cashier/owner *can* select a customer programmatically. POS UI must use this to attach a customer **before** Apply-Loyalty is enabled. The Payload 2 example (`mobile=""`, `name=""`, yet `used_loyalty_point=753`) is the smoking gun for this workflow gap.

---

## 8. Recommendation

🟥 **Both pasted payloads — and the only CRM-captured payload for R689 to date — are missing the corrected loyalty fields.** POS must extend the POS↔CRM bridge mapping to forward `loyalty_points_used` (+ optionally `loyalty_discount`, `loyalty_idempotency_key`) on the final `/api/pos/orders` payload, *and* enforce customer-required workflow before Apply-Loyalty.

**Concrete next step:** after the bridge mapping is updated, place a NEW realtime test order on R689 with a real `cust_mobile` and `loyalty_points_used > 0`. The capture in `pos_request_logs` will then carry the corrected fields and CRM will mutate `customers.total_points` / `total_points_redeemed` and write a redeem PT row — observable via the same queries used in this addendum.

**No CRM-side change is required.** The corrected schema and helper are already live in preview (51/51 QA passing) and waiting for POS to start sending the fields.

---

## 9. Final Status

`cr001c_lr_r689_realtime_payload_missing_loyalty_fields`

(Same status as both companion reports — independently re-confirmed using only captured CRM-side evidence.)

---

## Appendix A — Queries Used

All queries are read-only Mongo filters; no writes. Reproducible via the previous shell snippets.

```python
# pos_request_logs full-coverage search for 868917
db.pos_request_logs.find({'$or':[
    {'request_body.order_id': {'$in':['868917',868917]}},
    {'request_body.bill_id':  {'$in':['868917',868917]}},
    {'request_body.transaction_id': {'$in':['868917',868917]}},
    {'response_body.data.pos_order_id': {'$in':['868917',868917]}},
    {'response_body.data.order_id': {'$in':['868917',868917]}},
]})  # → 0 hits

# Other log surfaces
db.pos_event_logs.count_documents({})                  # 0 (empty collection)
db.mygenie_payload_samples.count_documents({})         # 2 (unrelated R635 customer samples)
db.orders.find({'pos_order_id': {'$in':['868917',868917]}})  # 0
db.points_transactions.find({'$or':[
    {'order_id':'868917'}, {'idempotency_key':{'$regex':'868917'}}]})  # 0

# File logs
grep "868917" /var/log/supervisor/backend.out.log       # 0 matches
grep "5ebde664" /var/log/supervisor/backend.out.log     # 0 matches
grep "7505242126" /var/log/supervisor/backend.out.log   # 5 matches (today admin lookups only)
```

**Strict rules adhered to:** No code, DB, env, migration, deploy, L4, L5, Coupon, or Wallet changes. `/app/memory/final/` untouched. Read-only investigation only.
