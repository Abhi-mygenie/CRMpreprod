# CR-001C-LR Realtime Order Redemption Verification Report

**Module:** CR-001C-LR (Realtime Order Redemption Verification)
**Date:** 2026-05-24
**Status:** `cr001c_lr_realtime_order_redemption_inconclusive`
**Requested by:** Owner
**Trigger:** POS team reported POS-side issue fixed; owner placed a realtime loyalty test order.

---

## 1. Executive Summary

| Item | Value |
|---|---|
| **Verdict** | **INCONCLUSIVE** |
| **Restaurant** | R689 — Kunafa Mahal |
| **Owner-reported order_id** | `868933` (POS-side) |
| **Owner-reported restaurant_order_id** | `009476` |
| **Order reached CRM?** | **NO** — order 868933 is absent from `pos_request_logs`, `orders`, and every other collection in the database. |
| **Points cut?** | **NO** — zero redeem `points_transactions` rows exist for R689. |
| **CRM-side readiness** | **CONFIRMED** — 52/52 QA, alias addendum live, shared helper wired into `/api/pos/orders`. |
| **Root cause** | POS backend did not call CRM's `POST /api/pos/orders` for order 868933. Same pattern as the 2026-05-24 R689 investigation (orders 868917–008976). |

---

## 2. Test Context

| Item | Value |
|---|---|
| Restaurant ID | `689` |
| Restaurant name | Kunafa Mahal |
| Owner-reported order_id | `868933` |
| Owner-reported restaurant_order_id | `009476` |
| POS response to owner | `{ message: "Order placed successfully", order_id: 868933, daily_token: "0013", restaurant_order_id: "009476" }` |
| Customer name / phone | Unknown (not provided by owner) |
| Points applied in POS | Unknown (not provided by owner) |
| Expected discount | Unknown (not provided by owner) |
| Endpoint captured | **NONE** — order never arrived at CRM |
| Approximate test time | 2026-05-24 ~14:00+ UTC (owner reported during this session) |

---

## 3. Payload Capture

**Order 868933 payload: NOT RECEIVED by CRM.**

No `pos_request_logs` entry exists for order_id `868933` (searched as both string and integer). No entry exists in any database collection for this order ID.

### Nearest order that DID land (868932, for reference only)

The most recent `/api/pos/orders` entry in `pos_request_logs` is order **868932**, received at `2026-05-24T13:53:22 UTC`:

| Field | Present? | Value | Notes |
|---|---|---|---|
| `order_id` | YES | `"868932"` | Different order from owner's test |
| `restaurant_id` | YES | `"689"` | Same restaurant |
| `cust_mobile` | YES | `"0000000000"` | Guest customer |
| `cust_name` | YES | `"Guest"` | Not a loyalty test customer |
| `order_amount` | YES | `0` | Zero amount |
| `loyalty_points_used` | **NO** | NOT PRESENT | No loyalty field in payload |
| `used_loyalty_point` | **NO** | NOT PRESENT | No alias present either |
| `used_loyalty_points` | **NO** | NOT PRESENT | No alias present either |
| `loyalty_discount` | **NO** | NOT PRESENT | |
| `loyalty_idempotency_key` | **NO** | NOT PRESENT | |
| `payment_status` | n/a | not in payload | |

**868932 is a Guest order with amount 0 and zero loyalty fields — not the loyalty test order.**

---

## 4. Redemption Execution Evidence

**NONE** — no redeem occurred.

- Zero `points_transactions` rows with `transaction_type="redeem"` exist for `user_id="pos_0001_restaurant_689"`.
- No order 868933 exists in the `orders` collection.
- No customer counter changes attributable to a redemption.

---

## 5. Customer Counter Reconciliation

**NOT APPLICABLE** — order never reached CRM. No redemption was triggered. Customer counters are unchanged from their pre-test state.

For reference, the customer most likely tested (abhishek jain, phone 7505242126, the only named R689 customer in recent order history) last had:
- `total_points`: 4588 (as of order 868908 on 2026-05-23)
- `tier`: Gold

These values should be unchanged since the test order never reached CRM.

---

## 6. Earn-on-Net Validation

**NOT APPLICABLE** — no order processed, no earn calculation executed.

---

## 7. Idempotency / Duplicate Check

**NOT APPLICABLE** — no redeem PT row exists, so no duplicates to check.

---

## 8. Response Evidence

**NONE** — CRM never received the request, so no CRM response was generated for order 868933.

The POS response shown by the owner (`{ message: "Order placed successfully", order_id: 868933 }`) is the POS's internal acknowledgment. It does NOT confirm CRM receipt.

---

## 9. Issues Found

### Issue 1: POS not calling CRM `/api/pos/orders` for order 868933

**Severity:** BLOCKING
**Impact:** Loyalty redemption cannot execute because CRM never receives the final order payload.
**Evidence:**
- `pos_request_logs` has zero entries for order_id 868933.
- The `orders` collection has no document with pos_order_id 868933.
- Full-database scan across all collections returned zero matches for 868933.

**Historical context:** This is the **same pattern** observed during the 2026-05-24 R689 realtime investigation (orders 868917, 868924, 868925, 868928, 868929, 868931, 008976 — none reached CRM). See `analysis/CR_001C_LR_R689_REALTIME_LOYALTY_PAYLOAD_INVESTIGATION.md`.

### Issue 2: Most recent order that DID land (868932) has no loyalty fields

**Severity:** INFORMATIONAL
**Impact:** Even when POS does call `/api/pos/orders`, the payload does not include `loyalty_points_used` / `used_loyalty_point` / `used_loyalty_points`.
**Evidence:** `pos_request_logs` for 868932 shows the request body with zero loyalty-related fields.
**Note:** This was a Guest order with amount 0, so it may not be representative of a real loyalty test.

### Issue 3: No R689 order in pos_request_logs carries loyalty fields

**Severity:** BLOCKING (for loyalty verification)
**Evidence:** All 5 recent `/api/pos/orders` entries for R689 (868904, 868908, 868932) contain zero loyalty fields. The `loyalty_points_used` / `used_loyalty_point` / `used_loyalty_points` field has never been present in any R689 payload reaching CRM.

---

## 10. Recommendation

**Inconclusive — need another POS test order with confirmation that the order reaches CRM.**

### CRM readiness confirmed:
- 52/52 static QA PASS (including alias addendum)
- Shared `redeem_loyalty_points` helper wired into `/api/pos/orders` handler
- `used_loyalty_point` / `used_loyalty_points` aliases accepted
- Idempotency, auto-cap, earn-on-net, counter parity all verified in controlled QA

### POS team action items:
1. **Confirm POS is actually calling CRM's `POST /api/pos/orders`** at bill-collect/finalize time. The POS internal "Order placed successfully" response does NOT mean CRM was called.
2. **Include loyalty fields** in the payload when the customer has redeemed points:
   - `used_loyalty_point` (POS legacy name, accepted by CRM) OR `loyalty_points_used` (canonical)
3. **Verify the CRM endpoint URL** POS is targeting — must be `https://crm.mygenie.online/api/pos/orders` (production) or the preview URL.
4. **Send the order at bill-collect time**, not just at order-creation time. The loyalty redemption fields must be in the final payload.
5. After placing a test order, **verify in POS backend logs** that an HTTP POST to CRM's `/api/pos/orders` was made and received an HTTP 200 response.

### Verification criteria for next attempt:
- Order appears in `pos_request_logs` with a matching order_id
- Payload includes `used_loyalty_point` (or canonical) with a positive integer value
- CRM response shows `data.loyalty_redeem` block
- `points_transactions` has a `transaction_type="redeem"` row for the order
- Customer `total_points` decreased and `total_points_redeemed` increased

---

## 11. Final Status

`cr001c_lr_realtime_order_redemption_inconclusive`

CRM is ready. The test order (868933) never reached CRM's `/api/pos/orders` endpoint. POS team must confirm their backend is actually calling CRM at bill-finalize time and including loyalty redemption fields in the payload. Once a new test order lands in CRM with loyalty fields, this verification can be re-run.

---

## Appendix A: Timeline of R689 Orders Reaching CRM

| Order | Timestamp (UTC) | Customer | Amount | Loyalty Fields | Source |
|---|---|---|---|---|---|
| 868904 | 2026-05-23 11:37:44 | Guest (0000000000) | ₹775 | NONE | pos_request_logs |
| 868908 | 2026-05-23 11:38:17 | abhishek jain (7505242126) | ₹9177 | NONE | pos_request_logs |
| 868932 | 2026-05-24 13:53:22 | Guest (0000000000) | ₹0 | NONE | pos_request_logs |
| **868933** | **NEVER** | **—** | **—** | **—** | **NOT IN pos_request_logs** |

All orders that reached CRM from R689 have **zero loyalty fields** in their payloads. No `loyalty_points_used`, `used_loyalty_point`, or `used_loyalty_points` has ever been sent by POS in any R689 order payload.

## Appendix B: CRM Readiness Evidence

| Check | Status |
|---|---|
| `redeem_loyalty_points` helper in `core/loyalty.py` | ✅ Implemented |
| `POSOrderWebhook.loyalty_points_used` with `AliasChoices` | ✅ Live |
| Redeem-before-earn wiring in `pos_order_webhook` | ✅ Live |
| Earn-on-net (`order_amount − redeemed_value`) | ✅ Implemented (Q-CORR-3 Option B) |
| Hard-fail on redeem error (Q-CORR-2 Option C) | ✅ Implemented |
| Idempotency fallback `f"order_{order_id}"` (Q-CORR-4 Option A) | ✅ Implemented |
| Static QA | 52/52 PASS |
| Alias addendum (`used_loyalty_point` / `used_loyalty_points`) | ✅ Live |
