# CR-001C-LR R689 Realtime Loyalty Payload Investigation — Order `868917`

**Module:** CR-001C-LR (correction)
**Date:** 2026-05-24
**Restaurant:** *Kunafa Mahal* (`restaurant_id=689`)
**Order:** `868917`
**Mode:** Investigation only — read-only Mongo + log inspection. No code, DB, env, or migration changes.
**Mongo time at investigation:** 2026-05-24 08:31 UTC (approx)

> Companion to `CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION.md` (order pre-state). Different POS stage / different schema — see §3 anatomy comparison.

---

## 1. Executive Summary

| Question | Verdict |
|---|---|
| Did CRM receive a `/api/pos/*` payload for order `868917`? | ❌ **No.** Zero matches in `pos_request_logs` for `request_body.order_id ∈ {"868917", 868917}`, `bill_id`, or `transaction_id`. |
| Did the payload's `order_id` appear anywhere in CRM persistence? | ❌ **No.** Zero rows in `orders` (`pos_order_id=868917`), zero `points_transactions` referencing `868917`. |
| Any `pos_request_logs` entries today at all? | ❌ **None** as of investigation time. |
| Does the pasted payload contain the corrected-plan loyalty fields? | ❌ **No.** `loyalty_points_used`, `loyalty_discount`, `loyalty_idempotency_key` all absent. |
| Does the payload contain the alias `used_loyalty_point`? | ✅ Yes — value **`753`** (non-zero!). POS-side cashier *did* attempt to redeem 753 points on this bill. |
| Can CRM redeem from this payload? | ❌ **Cannot.** Two independent blockers — (a) the payload never reached CRM, (b) **the payload carries no customer identifier** (`mobile=""`, `name=""`, no `cust_membership_id`, no `customer_id`). |
| Net result | 🟥 **Payload missing corrected fields AND missing customer identity.** This payload also reveals a *second* POS-side schema (distinct from the previous "submit order" one) that surfaces during bill-collect. POS contract must be reconciled across both stages. |

---

## 2. Test Context

| Item | Value |
|---|---|
| Restaurant inferred from payload | `restaurant_name="Kunafa Mahal"` (CRM resolves this to `user_id=pos_0001_restaurant_689`) |
| `restaurant_id` in payload | ❌ **NOT PRESENT** (only `restaurant_name`) |
| `order_id` in payload | ✅ `"868917"` |
| `payment_status` | `"paid"` |
| `payment_mode` (note: not `payment_method`) | `"cash"` |
| `order_sub_total_amount` | `753` |
| `discount_value` | `753` (= full sub_total) |
| `used_loyalty_point` (legacy alias) | **`753`** — cashier redeemed 753 pts at 1:1 → ₹753 off a ₹753 bill |
| `loyalty_redemption_id` | `null` (POS expected an ID back from CRM but never got one) |
| `mobile` | `""` (empty) |
| `name` | `""` (empty) |
| `email` | `""` (empty) |
| Captured in `pos_request_logs`? | **No** — never reached CRM ingress |
| Captured in `orders`? | **No** |
| Captured in `points_transactions`? | **No** |

---

## 3. Schema Comparison — Two POS Payload Shapes Surfaced

This payload uses a **different field vocabulary** than the previous investigation's pasted JSON. The two appear to correspond to **two different POS stages** (order-submit vs. bill-collect/payment-finalized).

| Aspect | Payload 1 (prev: `7505242126` / abhishek jain) | Payload 2 (this: `868917`) |
|---|---|---|
| Customer name field | `cust_name` | `name` |
| Customer phone field | `cust_mobile` | `mobile` |
| Customer email field | `cust_email` | `email` |
| Membership id | `cust_membership_id` | ❌ absent |
| Restaurant identifier | `restaurant_id` (int) | `restaurant_name` (string) |
| Items array | `cart[]` (with `food_id`, `quantity`, `price`, `food_amount`, `add_on_ids`, `variations`) | `food_detail[]` (with `food_id`, `item_id`, `quantity`, `unit_price`, `food_amount`) |
| Payment field | `payment_method`, `payment_status`, `payment_type` | `payment_mode`, `payment_status` |
| Loyalty points (alias) | `used_loyalty_point` | `used_loyalty_point` (same alias) |
| Loyalty redemption id | ❌ absent | `loyalty_redemption_id` (null) |
| Comm/community discount | ❌ absent | `comm_discount` |
| Discount value field | ❌ absent | `discount_value: 753` |
| `order_id` | ❌ absent | ✅ `"868917"` |
| `transaction_id` | `""` empty | `""` empty |
| `table_id`, `order_type`, `waiter_id` | present | ❌ absent (only `waiter_id` present) |
| Partial payments | `partial_payments[]` present (split tender) | ❌ absent |

**Inference:** Payload 1 ≈ POS "Submit Order / Cart Save" stage. Payload 2 ≈ POS "Collect Bill / Payment Finalized" stage. Neither is the canonical `POSOrderWebhook` shape that lands on `/api/pos/orders` in prod — see §4.

---

## 4. Raw Payload Field Audit (this payload, `868917`)

| Field | Present? | Value | Notes |
|---|---|---|---|
| `loyalty_points_used` | ❌ | — | **Corrected-plan field — required.** Absent. |
| `loyalty_discount` | ❌ | — | Corrected-plan field — optional. Absent. |
| `loyalty_idempotency_key` | ❌ | — | Corrected-plan field — optional. Absent. |
| `used_loyalty_point` | ✅ | **`753`** | Legacy alias. **NOT recognized** by current `POSOrderWebhook` schema. |
| `loyalty_redemption_id` | ✅ | `null` | POS-side hint that POS expected a redemption id back; CRM never returned one (payload never arrived). |
| `redeem_points` | ❌ | — | Field name on legacy `POSPaymentWebhook` schema — not present. |
| `discount_value` | ✅ | `753` | Mirrors `used_loyalty_point` in ₹. Strong correlation evidence (1:1 ratio applied locally by POS). |
| `coupon_discount` | ✅ | `0` | |
| `self_discount` | ✅ | `0` | |
| `order_discount` | ✅ | `0` | |
| `comm_discount` | ✅ | `0` | |
| `customer_id` | ❌ | — | |
| `cust_mobile` / `mobile` | ⚠️ | `""` (empty) | Customer cannot be resolved. |
| `cust_name` / `name` | ⚠️ | `""` (empty) | |
| `cust_email` / `email` | ⚠️ | `""` (empty) | |
| `cust_membership_id` | ❌ | — | This was the cleanest identifier in Payload 1 — stripped here. |
| `order_id` | ✅ | `"868917"` | Stable id — would work as idempotency anchor *if* the payload reached CRM. |
| `transaction_id` | ✅ | `""` | Empty. |
| `order_amount` | ❌ | — | **No final `order_amount` field at all.** `order_sub_total_amount=753` only. |
| `order_sub_total_amount` | ✅ | `753` | |
| `payment_status` | ✅ | `"paid"` | |
| `payment_method` | ❌ | — | Uses `payment_mode="cash"` instead — alias not recognized by CRM. |
| `restaurant_id` | ❌ | — | Only `restaurant_name="Kunafa Mahal"`. CRM ingress needs the numeric/string id. |
| `pos_id` | ❌ | — | |
| `food_detail[].item_id` | ✅ | per item | New field vs Payload 1 (`item_id` distinct from `food_id`). |

---

## 5. CRM Redemption Readiness

### 5.1 First-order blocker: Payload didn't reach CRM

The payload **never hit any `/api/pos/*` endpoint**. `pos_request_logs` for today shows zero entries. The schema (no `restaurant_id`, no `pos_id`, `name`/`mobile` instead of `cust_name`/`cust_mobile`, etc.) is also incompatible with the current `POSOrderWebhook` Pydantic model — it would 422 at validation even if it were posted to `/api/pos/orders`.

### 5.2 Second-order blocker: No customer attribution

Even if POS adopted the corrected field names *and* posted this payload to `/api/pos/orders`, **CRM cannot redeem against an anonymous bill**:

| Identifier CRM uses | Value in payload | Resolvable? |
|---|---|---|
| `customer_id` | absent | ❌ |
| `cust_mobile` | `""` (empty) | ❌ |
| `cust_membership_id` (Payload 1 had this) | absent | ❌ |
| `email` | `""` (empty) | ❌ |

Without any of these, the helper `redeem_loyalty_points` returns `CUSTOMER_NOT_FOUND` and (per Q-CORR-2 frozen — Option C) the entire order webhook hard-fails. The bill would not persist.

### 5.3 Third-order data quality observation

`used_loyalty_point=753` was applied on a bill where the customer is anonymous. This is **structurally impossible to honour**:

- Loyalty points belong to customers. There is no customer here.
- POS apparently auto-displayed/applied a 1:1 ratio discount of ₹753 against the ₹753 sub-total without sourcing it from any customer balance.
- `loyalty_redemption_id=null` correctly signals POS did not actually book a redemption with CRM — but the discount was still pushed onto the bill UI.

This needs POS-side reconciliation: cashier should not be able to Apply loyalty without first selecting a customer.

---

## 6. Points Transaction Evidence

| Check | Result |
|---|---|
| `points_transactions` with `order_id = "868917"` | **0 rows** |
| `points_transactions` with `idempotency_key` containing `868917` | **0 rows** |
| Any redeem PT row created for R689 ever | **0 rows** (unchanged from previous investigation) |

---

## 7. Customer Counter Evidence

N/A — payload has no resolvable customer identifier.

For completeness: the customer record from the **previous** investigation (`abhishek jain` / `5ebde664-…` / Gold / 4588 pts / redeemed=0) is unchanged. No mutation observed from this payload either.

---

## 8. Gap List for POS Team

This payload exposes two distinct POS-contract problems that BOTH need resolution before CR-001C-LR can fire on real bills:

### 8.1 Schema / contract gaps (applies to whichever POS stage actually posts to `/api/pos/orders`)

| # | Field POS sends today | What CRM accepts | Required POS change |
|---|---|---|---|
| 1 | `used_loyalty_point` (753) | `loyalty_points_used` | Rename outbound field. |
| 2 | `discount_value` (753) | `loyalty_discount` (optional, informational) | Rename outbound field. Optional. |
| 3 | `loyalty_redemption_id` (null) | `loyalty_idempotency_key` | Different semantic — server derives this; POS can omit, OR send a unique pre-redeem key. |
| 4 | `payment_mode` ("cash") | `payment_method` | Rename outbound field. |
| 5 | `mobile` / `name` / `email` empty | `cust_mobile` (required), `cust_name`, `cust_email` | Populate the customer fields. Without `cust_mobile` or `customer_id` the order/redeem cannot land. |
| 6 | `restaurant_name` only | `restaurant_id` (required) | Send the numeric id, not just the name. |
| 7 | `pos_id` missing | `pos_id` (defaults `"mygenie"`) | Optional — has default. |
| 8 | `order_amount` missing | `order_amount` (required) | Send the final payable amount (post-redeem-discount, post-tax). Today `order_sub_total_amount=753` is the only ₹ field. |
| 9 | `cust_membership_id` (was in Payload 1) | optional `customer_id` | If POS adopts this mapping, the Payload-1 schema already supports it. |

### 8.2 Workflow / data-integrity gaps (POS-internal)

| # | Observation | Required POS fix |
|---|---|---|
| A | Cashier could Apply 753 loyalty points on a bill with no selected customer (`mobile=""`, `name=""`). | POS UI must gate the Apply-Loyalty button on a customer being selected. CRM cannot redeem anonymous points by design — points belong to customers. |
| B | POS computed a 1:1 ratio (`discount_value == used_loyalty_point`) locally with **no source customer balance**, no tier-aware ratio call to `/api/pos/customers/{id}/loyalty`. | POS must first read `ratio_per_point` from the loyalty blob for the *selected* customer; the bill UI's locally-computed discount must be `used_points × that_customer_ratio`. |
| C | `loyalty_redemption_id=null` was carried forward even though POS displayed the discount on the bill. | The bill should not finalize a discount POS could not book. POS should only Apply when CRM acknowledges the bookable max via `/api/pos/max-redeemable` (or, post-correction, simply embed `loyalty_points_used` in the final `/api/pos/orders` payload and trust the response's `data.loyalty_redeem` block). |
| D | Two different payload shapes (Payload 1 = order-submit, Payload 2 = bill-collect) carry different field vocabularies. | Consolidate to a single payload shape on the `/api/pos/orders` final-bill event, matching the `POSOrderWebhook` Pydantic schema. The intermediate POS stages are POS-internal and don't need to match CRM, but the final realtime hit must. |

---

## 9. Recommendation

🟥 **Payload missing fields — POS must add fields and enforce customer-required workflow before CRM redemption can work.**

**Concrete next steps for POS team:**

1. **Single canonical outbound shape:** at the final-bill stage, POST the `POSOrderWebhook`-compliant payload to `/api/pos/orders` (`pos_id`, `restaurant_id`, `order_id`, `cust_mobile`, `order_amount`, `items[]`, etc.). The intermediate "submit order" and "bill collect" POS stages can keep their internal shapes, but the realtime hit to CRM must be the canonical one.
2. **Adopt corrected loyalty fields:** rename `used_loyalty_point` → `loyalty_points_used`, optionally include `loyalty_discount` and `loyalty_idempotency_key`. Reference: `/app/memory/crm/crm_1_0/handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` §3.3.
3. **Gate Apply-Loyalty on customer selection** in the POS UI. Cashier must not be able to enter loyalty points without a customer attached to the bill. If walk-in, hide the loyalty CTA entirely.
4. **Drop local 1:1 assumption:** POS must read `ratio_per_point` from `GET /api/pos/customers/{id}/loyalty` (or POST it via lookup) for the **specific** customer; never hard-code 1:1. (Customer `5ebde664-…` is Gold @ `ratio=1.5` — using 1:1 would under-redeem by 33%.)
5. **Place a NEW realtime test order** *after* the POS fix is in, with a chosen `loyalty_points_used > 0` and a real `cust_mobile`. Then re-run this investigation against the resulting `pos_request_logs` entry.

**No CRM-side change is required.** The corrected path is live in preview (51/51 QA) waiting for POS to start sending the fields.

---

## 10. Final Status

`cr001c_lr_r689_realtime_payload_missing_loyalty_fields`

(Same status as the prior investigation — both payloads independently confirm POS-side gap. Order `868917` additionally surfaces the anonymous-customer / second-schema problem.)

---

## Appendix A — Evidence Pointers

| Evidence | Location |
|---|---|
| `pos_request_logs` query for `order_id=868917` | 0 matches |
| `orders` query for `pos_order_id=868917` | 0 matches |
| `points_transactions` query for `order_id=868917` / `idempotency_key~868917` | 0 matches |
| `pos_request_logs` count for today (2026-05-24 UTC) | 0 entries |
| Frozen plan field names | `/app/memory/crm/crm_1_0/planning/CR_001C_LR_REDEMPTION_TRIGGER_CORRECTION_PLAN.md` §5.2 |
| POS handoff doc (corrected contract) | `/app/memory/crm/crm_1_0/handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` |
| CRM `POSOrderWebhook` schema (live in preview) | `/app/backend/routers/pos.py` lines 1107-1216 |
| Companion investigation (Payload 1) | `/app/memory/crm/crm_1_0/analysis/CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION.md` |

**Strict rules adhered to:** No code, DB, env, migration, deploy, L4, L5, Coupon, or Wallet changes were made. `/app/memory/final/` untouched.
