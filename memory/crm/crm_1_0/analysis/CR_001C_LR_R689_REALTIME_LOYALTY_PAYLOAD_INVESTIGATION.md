# CR-001C-LR R689 Realtime Loyalty Payload Investigation
> **CONTRIBUTING-FACTOR NOTE — 2026-05-25** — While this investigation centred on the realtime POS payload missing loyalty fields, the `payment_status` mismatch (`"paid"` from POS vs CRM's `"success"`-only gate) was a contributing factor to silent order rejection on some flows. That gate has now been **REMOVED** from `backend/routers/pos.py` (`_validate_order`). CRM accepts any `payment_status` and stores it as-sent. Tracker: `cr001c_lr_payment_status_gate_removed` in `CR_001_INDEX.md`. The R689 payload comparison tables below remain accurate as a snapshot.


**Module:** CR-001C-LR (correction)
**Date:** 2026-05-24
**Restaurant:** 689 — *Kunafa Mahal* (`user_id = pos_0001_restaurant_689`)
**Mode:** Investigation only — read-only Mongo + log inspection. No code, DB, env, or migration changes.
**Mongo time at investigation:** 2026-05-24 08:23:29 UTC

---

## 1. Executive Summary

| Question | Verdict |
|---|---|
| Did CRM receive a fresh realtime order payload for R689 today? | ❌ **No.** Latest captured `/api/pos/*` hit for R689 is order `868908` at **2026-05-23 11:38:17 UTC** (>21h ago). |
| Was a payload supplied to this investigation? | ✅ Yes — owner-pasted POS-internal JSON for R689 (cashier-side, pre-CRM-hop). |
| Does that payload contain the three corrected-plan fields (`loyalty_points_used`, `loyalty_discount`, `loyalty_idempotency_key`)? | ❌ **No.** None of the three are present. |
| Does it contain a legacy/alias loyalty field? | ⚠️ `used_loyalty_point: 0` is present — value is **zero**, and the alias is **not recognized** by the current corrected `POSOrderWebhook` schema. |
| Can CRM redeem points from this payload? | ❌ **Cannot.** Zero signal: corrected fields absent; alias name unmapped; alias value = 0. |
| Did the **last** real CRM hit (order `868908`) carry any redemption signal? | ❌ **No.** The 15-key prod-shape payload that actually arrived at `/api/pos/orders` carries no loyalty redemption fields at all. |
| Net result for the LR correction trigger | 🟥 **Payload is missing the corrected loyalty fields.** POS integration must be updated to embed `loyalty_points_used` (+ optional `loyalty_discount`, `loyalty_idempotency_key`) on `/api/pos/orders` before CRM can commit redemption from the order payload. |

---

## 2. Test Context

| Item | Value |
|---|---|
| `restaurant_id` | `689` |
| Restaurant name | `Kunafa Mahal` |
| Authed CRM user (resolved from API key) | `pos_0001_restaurant_689` |
| Last captured prod hit endpoint | `POST /api/pos/orders` |
| Last captured prod hit time | `2026-05-23 11:38:17.724 UTC` |
| Last captured prod `order_id` | `868908` (CRM `data.order_id = b8a1c317-867b-4f37-9902-cd50d1acc80e`) |
| Owner-pasted payload `order_id` | **NOT PRESENT** (no top-level `order_id`/`id`); `transaction_id=""` (empty) |
| Owner-pasted payload customer | `cust_name="abhishek jain"`, `cust_mobile="7505242126"`, `cust_membership_id="5ebde664-c7b7-46b7-85ab-f5c5319161b9"` (matches CRM customer record exactly — Gold tier, 4588 pts) |

> ⚠️ The owner-pasted JSON does NOT correspond to a fresh `pos_request_logs` entry — no record of it was found at the CRM ingress. This is consistent with it being the **POS-internal raw payload at the cashier/Apply stage**, before any HTTP call to CRM is made (or before the field-mapping layer between POS and `/api/pos/orders`).

---

## 3. Raw Payload Field Audit

### 3.1 Owner-pasted payload (POS-internal raw)

| Field | Present? | Value | Notes |
|---|---|---|---|
| `loyalty_points_used` | ❌ | — | **Corrected-plan field — required for trigger.** |
| `loyalty_discount` | ❌ | — | Corrected-plan field — optional, informational. |
| `loyalty_idempotency_key` | ❌ | — | Corrected-plan field — optional, server falls back to `f"order_{order_id}"` if `order_id` present. |
| `used_loyalty_point` | ✅ | `0` | Singular alias from POS-side. **Not** in CRM schema. Even if remapped, value is 0 → no redemption signal. |
| `used_loyalty_points` | ❌ | — | Plural form not present either. |
| `loyalty_points` | ❌ | — | |
| `redeem_points` | ❌ | — | This is the field name the *legacy* `/api/pos/webhook/payment-received` schema recognizes — not in the order payload. |
| `points_redeemed` | ❌ | — | |
| `loyalty_redeem_points` | ❌ | — | |
| `loyalty_discount_amount` | ❌ | — | |
| `loyalty_amount` | ❌ | — | |
| `loyalty_value` | ❌ | — | |
| `discount_loyalty` | ❌ | — | |
| `order_discount` | ✅ | `0` | Generic order discount, zero. |
| `coupon_discount` | ✅ | `0` | |
| `self_discount` | ✅ | `0` | |
| `customer_id` | ❌ (top-level) | — | But `cust_membership_id="5ebde664-…"` matches CRM `customers.id` exactly — see §8 recommendation. |
| `cust_mobile` | ✅ | `"7505242126"` | Matches CRM record (Gold tier, 4588 pts, redeemed=0). |
| `phone` | ❌ (alternate) | — | Not used — `cust_mobile` is the canonical field. |
| `order_id` | ❌ | — | **No top-level `order_id`.** `transaction_id=""` also empty. Idempotency cannot be derived. |
| `transaction_id` | ✅ | `""` | Empty string. |
| `order_amount` | ✅ | `0` | ⚠️ **Anomalous** — sub_total is 1087 but final `order_amount` is 0. Out of LR scope but worth flagging. |
| `order_sub_total_amount` | ✅ | `1087` | |
| `payment_status` | ✅ | `"paid"` | |
| `payment_method` | ✅ | `"cash"` | |
| `restaurant_id` | ✅ | `689` (int — not string!) | Schema expects `str` — Pydantic will coerce. |

### 3.2 Last actual CRM-ingress payload (order `868908`, prod, 2026-05-23)

Pulled from `pos_request_logs.request_body` — represents what genuinely lands on `/api/pos/orders` in prod.

| Field | Present? | Value | Notes |
|---|---|---|---|
| `loyalty_points_used` | ❌ | — | Confirms prod POS not yet sending corrected field. |
| `loyalty_discount` | ❌ | — | |
| `loyalty_idempotency_key` | ❌ | — | |
| `used_loyalty_point` (alias) | ❌ | — | Even the alias is **stripped** by POS↔CRM mapping. |
| `redeem_points` | ❌ | — | |
| `customer_id` | ❌ | — | CRM looks up by `cust_mobile` instead. |
| `cust_mobile` | ✅ | `"7505242126"` | |
| `cust_membership_id` | ❌ | — | **Stripped** by POS↔CRM mapping (present in 3.1, absent here). |
| `order_id` | ✅ | `"868908"` | Stable pos_order_id — sufficient for derived idempotency key if loyalty signal were present. |
| `order_amount` | ✅ | `9177` | |
| `order_sub_total_amount` | ❌ | — | Stripped. |
| `payment_status` | ❌ | — | Stripped. |
| `payment_method` | ❌ | — | Stripped. |
| `transaction_id` | ❌ | — | Stripped. |

**Full key-set on actual prod ingress (15 keys):** `associated_order_ids, created_at, cust_mobile, cust_name, items, order_amount, order_id, order_type, pos_id, restaurant_id, room_info, table_id, table_name, waiter_id, waiter_name`.

---

## 4. Endpoint / Log Evidence

| Source | Finding |
|---|---|
| `pos_request_logs` for `request_body.restaurant_id ∈ {689, "689"}` | 5 captured entries; latest at 2026-05-23 11:38:17 UTC. **No entry today.** |
| `matched_restaurant_id` on log doc | `689` |
| `matched_user_id` | `pos_0001_restaurant_689` |
| `matched_via_auth` | `api_key` |
| `path` on every R689 entry | `/api/pos/orders` (none on `/api/pos/webhook/payment-received` ever) |
| `response_status` (latest 5) | All `200`, all `verdict=success` |
| `response_body.data.loyalty_redeem` (latest 3) | **`null`** on every one |
| `response_body.data.points_earned / total_points` (order 868908) | `4588 / 4588` (earn-only, no redeem) |
| `points_transactions` for R689 with `transaction_type="redeem"` | **0 rows** total (ever) |
| Owner-pasted payload corresponded to which log row? | **None** — no matching entry in `pos_request_logs` (no `order_id`, no recent `7505242126 @ R689` hit since 2026-05-23 11:38). |

---

## 5. CRM Redemption Readiness

### 5.1 With the owner-pasted payload (as-is)

❌ **CRM cannot redeem.** Reasons:

1. **No `loyalty_points_used`** — the corrected schema field is absent. Without this, the order webhook short-circuits the redeem step entirely (`if order_data.loyalty_points_used and order_data.loyalty_points_used > 0` at `routers/pos.py:1270`).
2. **`used_loyalty_point` (alias) is present but = 0** — even if a field-alias bridge existed, zero would still skip the redeem branch.
3. **No `order_id`** at the top level (only `transaction_id=""`). The server-derived idempotency key fallback `f"order_{order_id}"` (Q-CORR-4) cannot resolve a stable key.
4. **`order_amount = 0`** — the redeem step needs the order total to cap the discount; zero would tank `compute_max_redeemable`'s `min(bill × max_percent%, …)` cap to 0 even if a redemption was requested.

### 5.2 With the actual prod ingress payload (order 868908)

❌ **CRM cannot redeem.** The 15-key prod-shape payload contains no loyalty redemption signal in any form. The corrected `POSOrderWebhook` schema accepts the three optional fields with sensible defaults, so payloads without them simply skip the redeem path — exactly what happened on `868908` (`loyalty_redeem=null`).

### 5.3 Fields CRM **would** use if POS adds them

| Field | Source if POS sends it | Fallback if POS omits it |
|---|---|---|
| `loyalty_points_used` (int > 0) | required to trigger redeem | none — no redeem happens |
| `customer` to redeem against | resolved via `cust_mobile` (works today) or `customer_id` (cleaner) | `cust_mobile` |
| `order_id` (for idempotency) | `order_id` field already on schema (already sent: `868908`) | required — see §3.2 |
| `loyalty_idempotency_key` | explicit POS-provided key | server derives `f"order_{order_id}"` (Q-CORR-4 frozen) |
| `loyalty_discount` (₹) | informational cross-check | server recomputes from `ratio_per_point × loyalty_points_used` |

---

## 6. Points Transaction Evidence

| Check | Result |
|---|---|
| Redeem PT rows ever, scope = `user_id=pos_0001_restaurant_689` | **0** |
| Most recent earn PT row for R689 cust `abhishek jain` (id `5ebde664-…`) | Yes — order `868908` on 2026-05-23 (4588 pts earned) |
| Any `points_transactions` with `idempotency_key` starting `order_868…` | **0** |
| Any PT row tied to today's owner-pasted payload | **0** (no order_id, no corresponding ingress) |

**Conclusion:** zero redemption activity has occurred on R689 — CR-001C-LR's corrected path has never been exercised in prod for this restaurant.

---

## 7. Customer Counter Evidence

Customer record (`customers.id = 5ebde664-c7b7-46b7-85ab-f5c5319161b9`, R689):

| Field | Value |
|---|---|
| `name` | `abhishek jain ` |
| `phone` | `7505242126` |
| `tier` | `Gold` |
| `total_points` | `4588` |
| `total_points_redeemed` | **`0`** |

No change observed against the owner-pasted payload — because no corresponding CRM ingress occurred and even if it had, with `loyalty_points_used` absent the redeem branch is skipped (zero counter mutation).

---

## 8. Gap List for POS Team

The POS integration must send the following on the final `/api/pos/orders` payload **whenever the cashier has applied a loyalty redemption**:

| # | Field | Required? | Type | Notes |
|---|---|---|---|---|
| 1 | `loyalty_points_used` | ✅ **REQUIRED** when redeeming | `int` > 0 | The points POS decided to redeem locally on Apply. Source of truth for the CRM commit. |
| 2 | `loyalty_discount` | optional | `float` ≥ 0 | The ₹ discount POS displayed to the cashier. Server recomputes from tier-aware `ratio_per_point`; this field is used only for cross-check / variance flagging. Safe to omit. |
| 3 | `loyalty_idempotency_key` | optional | `string` | Explicit POS-side key. If omitted, server derives `f"order_{order_id}"`. POS retries of the same `order_id` are then automatically idempotent (Q-CORR-4 frozen). |
| 4 | `order_id` | ✅ **REQUIRED** (already on schema, already sent in prod) | `string` | Stable per-order id from POS — must be unique and re-sent unchanged on retries. The owner-pasted payload has **no** `order_id` — POS must populate this on the final payload. |
| 5 | `order_amount` | ✅ **REQUIRED** (already on schema) | `float` > 0 | Final payable amount **after** loyalty discount. Owner-pasted payload showed `order_amount=0` while `order_sub_total_amount=1087` — POS must populate the final amount, otherwise the auto-cap math collapses to zero. |
| 6 | `cust_mobile` | ✅ **REQUIRED** (already sent) | `string` | Used for customer lookup. Continue sending. |
| 7 | `customer_id` (optional, cleaner) | optional | `string` | If POS adopts `cust_membership_id` → `customer_id` mapping at the POS↔CRM bridge, customer lookup becomes id-based and disambiguates duplicate-phone customers. The owner-pasted payload contains `cust_membership_id="5ebde664-…"` which already matches CRM's `customers.id` — wiring this through is straightforward. |

### Anti-patterns observed today

| Observed | Why it's wrong | Correct shape |
|---|---|---|
| POS payload uses `used_loyalty_point` (singular, legacy alias) | CRM corrected schema doesn't accept this alias. Even if 0/absent the field name itself isn't recognized. | Rename to `loyalty_points_used` (corrected schema) on the outbound mapping. |
| POS↔CRM mapping strips `cust_membership_id` | Loses the cleaner id-based path; CRM falls back to phone matching. | Forward `cust_membership_id` as `customer_id` on `/api/pos/orders`. |
| Owner-pasted payload has `order_amount=0` while sub-total is 1087 | CRM cap math depends on `order_amount`. Zero kills the cap. | POS must populate `order_amount` with the final payable (post-loyalty-discount, post-tax). |
| Owner-pasted payload has no `order_id` and empty `transaction_id` | No stable idempotency anchor. Retries can double-deduct (and even auto-fallback fails). | Always send `order_id` (POS prod payloads do — example: `868908` on the 2026-05-23 hit). |
| Calling `/api/pos/loyalty/redeem` on cashier-click (old design) | Already deprecated. Primary path is now `/api/pos/orders`. | Embed redemption in the order payload; the standalone `/loyalty/redeem` endpoint is testing-only. |

---

## 9. Recommendation

🟥 **Payload missing fields — POS must add fields before CRM redemption can work.**

**Concrete next steps:**

1. **POS team:** add `loyalty_points_used` (and optionally `loyalty_discount`, `loyalty_idempotency_key`) to the outbound `/api/pos/orders` payload mapper. Forward `order_id` and final `order_amount` (post-discount). Optionally forward `cust_membership_id` as `customer_id`. Reference doc: `/app/memory/crm/crm_1_0/handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` (GREEN-LIGHT).
2. **Owner / QA:** after POS adoption, place a fresh realtime test order on R689 with a chosen `loyalty_points_used > 0`. Re-run this investigation against the new `pos_request_logs` entry.
3. **No CRM-side action required** — the corrected path is live in preview at 51/51 QA and waits for POS to start sending the fields. The CRM-side hard-fail behavior (Q-CORR-2 frozen) ensures the bill won't silently diverge if any redeem error occurs once POS does send the fields.

**No retest is conclusive until** POS adds the corrected fields and a real `/api/pos/orders` hit is captured with `loyalty_points_used > 0`.

---

## 10. Final Status

`cr001c_lr_r689_realtime_payload_missing_loyalty_fields`

---

## Appendix A — Evidence Pointers

| Evidence | Location |
|---|---|
| Frozen plan (corrected schema fields) | `/app/memory/crm/crm_1_0/planning/CR_001C_LR_REDEMPTION_TRIGGER_CORRECTION_PLAN.md` §5.2 |
| POS handoff doc (what to send) | `/app/memory/crm/crm_1_0/handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` §3.3 |
| CRM corrected schema (live in preview) | `/app/backend/routers/pos.py` lines 1107-1216 (`POSOrderWebhook` with the 3 new fields) |
| CRM redeem trigger code | `/app/backend/routers/pos.py` line 1270 (`if order_data.loyalty_points_used and order_data.loyalty_points_used > 0`) |
| Shared helper | `/app/backend/core/loyalty.py` (`redeem_loyalty_points`, `compute_max_redeemable`) |
| Last R689 prod ingress evidence | `pos_request_logs.id = 1fdd70b5-df4f-45bd-b668-2544d693e4cb` (order `868908`, 2026-05-23 11:38:17 UTC) |
| CRM customer record under test | `customers.id = 5ebde664-c7b7-46b7-85ab-f5c5319161b9` @ `user_id=pos_0001_restaurant_689` (Gold tier, 4588 pts, redeemed=0) |
| Investigation Mongo time | `2026-05-24 08:23:29 UTC` |

**Strict rules adhered to:** No code, DB, env, migration, deploy, L4, L5, Coupon, or Wallet changes were made. `/app/memory/final/` untouched.
