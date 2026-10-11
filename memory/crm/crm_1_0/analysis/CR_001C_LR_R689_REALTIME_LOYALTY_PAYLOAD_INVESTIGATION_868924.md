# CR-001C-LR R689 — Order `868924` Captured-Log Investigation

> **⚠️ SUPERSEDED 2026-05-26.** POS team has since shipped the contract fixes; `/api/pos/orders` is now being called at bill-finalize with compliant payloads. See `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_CLOSURE_2026_05_26.md` and `handoff/CR_001C_POS_CONTRACT_COMPLIANCE_CLOSURE_2026_05_26.md`. Preserved for history.

**Module:** CR-001C-LR (correction)
**Date:** 2026-05-24
**Restaurant:** *Kunafa Mahal* (`restaurant_id=689`, `user_id=pos_0001_restaurant_689`)
**Order under test:** `868924`
**Mode:** Investigation only. Read-only Mongo + file logs. No code, DB, env, or migration changes.
**Mongo time at investigation:** 2026-05-24 10:44:19 UTC

---

## 1. Executive Summary

| Question | Verdict |
|---|---|
| Did order `868924` reach prod CRM via `POST /api/pos/orders`? | ❌ **No.** Zero hits in `pos_request_logs` for `868924`. |
| Did it reach the preview-pod CRM via `POST /api/pos/orders`? | ❌ **No.** Zero `POST /api/pos/orders` lines in `/var/log/supervisor/backend.out.log` for any order today. |
| Did `868924` get persisted as an `orders` document anywhere? | ❌ **No.** Zero rows in `orders.pos_order_id ∈ {"868924", 868924}`. |
| Did any `points_transactions` row get created? | ❌ **No.** Zero rows. |
| Did POS call any *other* CRM endpoint as part of this test? | ✅ **Yes.** Many `POST /api/pos/customer-lookup`, `POST /api/pos/max-redeemable`, and `GET /api/pos/customers?search=…` calls today (preview-pod log). |
| Were `pos_request_logs` for prod CRM updated today at all? | ❌ **No.** Zero entries since `2026-05-23 11:38:17 UTC`. |
| Net verdict | 🟥 **Same root gap as orders `868917` and Payload 1: POS never POSTs the final order webhook to CRM.** Read-side endpoints work; the commit-side endpoint is not being called at the end of the bill flow. |

---

## 2. Captured Evidence

### 2.1 Mongo collections — `868924` and recent prod-CRM activity

| Source | Query | Result |
|---|---|---|
| `pos_request_logs` | `request_body.order_id ∈ {"868924", 868924}` (and bill_id, transaction_id, response.pos_order_id) | **0 matches** |
| `pos_request_logs` | `created_at ≥ 2026-05-24 00:00 UTC` (any restaurant) | **0 entries** |
| `pos_request_logs` | latest entries for R689 (any time) | last = `868908` @ `2026-05-23 11:38:17 UTC` (>23h old) |
| `orders` | `pos_order_id ∈ {"868924", 868924}` | **0 rows** |
| `orders` | created since `2026-05-24 08:44 UTC` for `user_id=pos_0001_restaurant_689` | **0 rows** |
| `points_transactions` | `order_id="868924"` or `idempotency_key ~ "868924"` | **0 rows** |

### 2.2 Preview-pod uvicorn console (`/var/log/supervisor/backend.out.log`) — today's activity

| Endpoint | Calls today (sample count) | Outcome |
|---|---|---|
| `POST /api/pos/orders` | **0** | — |
| `POST /api/pos/webhook/payment-received` | **0** | — |
| `POST /api/pos/loyalty/redeem` | **0** | — |
| `POST /api/pos/customer-lookup` | ~10+ | 200 OK |
| `POST /api/pos/max-redeemable` | ~10+ | 200 OK |
| `GET /api/pos/customers?search=…` | ~30+ | mix of 200 OK and 401 Unauthorized (auth flakiness on some requests) |

POS / cashier is exercising the **read side** of the CRM API actively today. Searches observed: `9099087407`, `909908740` (partial), `7505242126`, `abhishek+jain`, `ab/abh/abhi/abhishek`, `ar/par/part/parth`, `pa`, `sa/sat`. 401 errors mostly clustered on partial-string searches with what looks like missing or wrong API key during typeahead.

### 2.3 Customer the cashier was searching for: `9099087407`

| Field | Value |
|---|---|
| Phone | `9099087407` |
| Name | `satish prsad ` |
| Customer id | `e52e63c4-f9ab-4bd8-b7fc-232be8d3d7f8` |
| **`user_id` (restaurant scope)** | **`pos_0001_restaurant_474`** ⚠️ |
| Tier | `Bronze` |
| `total_points` | `120` |
| `total_points_redeemed` | (not material) |

⚠️ **This customer does NOT exist under R689.** They belong to restaurant `474`. The R689 customer lookup for `9099087407` returns nothing — which matches the `401 Unauthorized` storm in the preview log (these failed lookups are scoped to the cashier's API key and likely tried R689 first, found nothing, then fell back to other restaurants).

---

## 3. Where the Order Went (or didn't)

Based on the evidence, here are the three possibilities — and one is fact:

| Possibility | Evidence | Verdict |
|---|---|---|
| A) POS posted `868924` to prod CRM `/api/pos/orders` | Would show in `pos_request_logs` (CR-002 middleware writes there on every prod `/api/pos/*` hit, latest before today is `868908`). | ❌ **Did not happen.** Zero entries since 2026-05-23 11:38. |
| B) POS posted `868924` to preview-pod CRM `/api/pos/orders` | Would show in preview-pod `/var/log/supervisor/backend.out.log` as a `POST /api/pos/orders` access line. | ❌ **Did not happen.** Zero `POST /api/pos/orders` lines today. |
| C) POS finalized the bill internally (POS UI) but did NOT call CRM's order webhook at all | (a) Preview log shows POS hitting the read endpoints (customer-lookup, max-redeemable) but never the commit endpoint. (b) No `pos_request_logs` for `868924`. (c) No `orders` row. | ✅ **This is what happened.** |

**Net:** POS UI computed and printed the bill locally; CRM was never told the order finalized. Therefore CRM cannot redeem, cannot earn, cannot record the order. Same root gap as `868917` and Payload 1.

---

## 4. Loyalty Field Audit — N/A

There is no captured payload to audit for `868924`. The order never reached CRM, so there are no fields to inspect on the commit side.

For completeness — the only related captures today are on the calculator endpoint:

| Captured endpoint | Used corrected schema? | Notes |
|---|---|---|
| `POST /api/pos/max-redeemable` | ✅ Yes (per code wiring — `compute_max_redeemable` shared helper) | Returned 200 multiple times. Response payload not captured by middleware on preview-pod (logging disabled there). |
| `POST /api/pos/customer-lookup` | n/a — read-only | Returned 200 multiple times. |

So POS is reading the corrected calculator output correctly, but never closing the loop with a `/api/pos/orders` commit.

---

## 5. CRM Redemption Readiness

❌ **N/A — no payload to redeem against.**

Customer counters unchanged. No PT row written. No orders persisted.

`5ebde664-…` (`abhishek jain`, the Payload 1 customer): still `total_points=4588`, `total_points_redeemed=0`, unchanged.

---

## 6. Gap List for POS Team (escalated from prior reports)

The fundamental gap for `868924` is **more upstream** than the field-rename gap identified in the previous two reports:

### 6.1 Critical: `/api/pos/orders` is not being called at end-of-bill

POS today:
- ✅ Calls `/api/pos/customer-lookup` to attach a customer to the bill
- ✅ Calls `/api/pos/max-redeemable` to compute the redeemable cap
- ❌ **Does NOT call `/api/pos/orders` when the cashier finalizes the bill**

Without this final POST, CRM cannot:
- Persist the order (no `orders.pos_order_id=868924`)
- Earn points (no PT earn row)
- Redeem points (no PT redeem row, no counter mutation)
- Apply wallet, coupon, or any other CRM-side flow tied to the order webhook

**This is the first thing POS must wire up.** Field-name corrections (`loyalty_points_used` vs `used_loyalty_point`) are secondary — they only matter once the call is actually made.

### 6.2 Secondary: 401 Unauthorized storm during customer typeahead

Multiple `GET /api/pos/customers?search=ab&limit=10 HTTP/1.1 401 Unauthorized` in preview log indicates the typeahead is hitting CRM without the API key (or with the wrong one) on some keystrokes, then recovering after token refresh. Cosmetic — but worth fixing on POS to reduce noise and avoid intermittent UX hiccups.

### 6.3 Tertiary (still relevant): payload field renames once POS does start posting

When POS begins calling `/api/pos/orders`, the corrected fields are still required:

| POS-side current name | Required CRM name |
|---|---|
| `used_loyalty_point` | **`loyalty_points_used`** |
| `mobile` | `cust_mobile` |
| `name` | `cust_name` |
| `payment_mode` | `payment_method` |
| `discount_value` | ❌ do NOT map to `loyalty_discount`; leave loyalty_discount unset |
| `loyalty_redemption_id` | ❌ do NOT send; CRM derives idempotency from `order_id` |

---

## 7. Recommendation

🟥 **Payload missing — POS must first wire up the end-of-bill `POST /api/pos/orders` call before any field-level investigation can move forward.**

**Order of operations for POS:**

1. **(P0) Wire end-of-bill action to `POST /api/pos/orders`** with the current canonical schema (`order_id`, `cust_mobile`, `restaurant_id`, `order_amount`, `items[]`, etc.). Verify with a non-loyalty test bill first — that confirms the connection is live.
2. **(P0) Add `loyalty_points_used`** (rename of `used_loyalty_point`) when the cashier has Applied loyalty.
3. **(P0) Gate Apply-Loyalty on customer-selected** (no anonymous redeems).
4. **(P1) Use per-customer `ratio_per_point`** from the loyalty blob; drop local 1:1 assumption.
5. **(P2) Investigate 401 storm** on customer typeahead.

**No CRM-side change required.** All the corrected logic is live in preview at 51/51 QA and waiting for POS to call the endpoint with the corrected field names.

---

## 8. Final Status

`cr001c_lr_r689_realtime_payload_not_received` *(new sub-status — escalated from prior `cr001c_lr_r689_realtime_payload_missing_loyalty_fields` because the gap is now "no payload arrived at all" rather than "wrong fields in arrived payload")*

If you'd prefer to stay with the existing taxonomy: `cr001c_lr_r689_realtime_payload_missing_loyalty_fields` still applies (worst case — no fields present because no payload present).

---

## Appendix A — Queries Used

```python
# pos_request_logs full coverage for 868924
db.pos_request_logs.find({'$or':[
    {'request_body.order_id': {'$in':['868924',868924]}},
    {'request_body.bill_id':  {'$in':['868924',868924]}},
    {'request_body.transaction_id': {'$in':['868924',868924]}},
    {'response_body.data.pos_order_id': {'$in':['868924',868924]}},
]})  # → 0

# pos_request_logs since 2026-05-24 00:00 UTC
db.pos_request_logs.count_documents({'created_at': {'$gte': datetime(2026,5,24,0,0,0,tzinfo=timezone.utc)}})  # → 0

# orders persisted
db.orders.find({'pos_order_id': {'$in':['868924',868924]}})  # → 0
db.orders.find({'user_id':'pos_0001_restaurant_689', 'created_at':{'$gte':'2026-05-24T08:44'}})  # → 0

# points_transactions linked
db.points_transactions.find({'$or':[{'order_id':'868924'},{'idempotency_key':{'$regex':'868924'}}]})  # → 0

# customer lookup
db.customers.find_one({'user_id':'pos_0001_restaurant_689','phone':'9099087407'})  # → None
db.customers.find_one({'phone':'9099087407'})  # → satish prsad @ pos_0001_restaurant_474
```

```bash
# preview-pod uvicorn console grep
grep "868924" /var/log/supervisor/backend.out.log                    # → 0
grep "POST /api/pos/orders" /var/log/supervisor/backend.out.log      # → 0 today
grep "/api/pos" /var/log/supervisor/backend.out.log | tail -50       # → only read-side endpoints today
```

**Strict rules adhered to:** No code, DB, env, migration, deploy, L4, L5, Coupon, or Wallet changes. `/app/memory/final/` untouched. Read-only investigation only.
