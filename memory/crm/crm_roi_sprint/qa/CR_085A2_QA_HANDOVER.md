# CR-085-A2 — QA Handover
**Date**: 2026-10-09 · **Implementation Agent** · Plan: `planning/CR_085A2_IMPLEMENTATION_PLAN.md` (owner-approved) · Risk CRITICAL (§14 `routers/pos.py`)

## What changed (one file + tests)
`routers/pos.py` — 18 `# CR-085-A2` markers:
- **E1** `_find_or_create_customer`: invalid/blank `cust_mobile` → `return None, False, 0` (after `pos_customer_id` match, which still wins). `phone_invalid` spread removed (unreachable).
- **E2** `/pos/orders`: `is_guest = customer is None`. Guest → redemption skipped (log `loyalty_redeem_skipped_guest`), 0 points, wallet ignored (log `wallet_used_on_guest_order`), no customer stats write, invoice still generated with `customer=None`, **no** WhatsApp (send_bill/welcome/tier), coupon recorder gets `customer_id=None` (c1). Response additive: `guest_order`, `guest_reason:"invalid_phone"`; `customer_id`/`customer_name`/`tier` may be `null`.
- **E3** `_save_order_and_transactions(customer: Optional[dict])`: `customer_id` null in `orders`, `order_items`, (`points_transactions`/`wallet_transactions` not written for guests — 0 amounts).
- **E4** `payment-received`: invalid phone → early return `{customer_id:null, guest_order:true, transactions, final_bill_amount, original_bill_amount}`; coupon maths extracted unchanged into `_apply_coupon_discount()` (used by both paths). `phone_invalid` spread removed.
- **E5** `customer-lookup`: invalid phone → "Customer not found"; `find_one` adds `phone_invalid: {$ne: true}`.
`tests/test_cr085a_normalization.py`: A9 rewritten (guest), new A7b, A11, A11b, A11c, A12; cleanup extended to `order_items`/`coupon_usage`/`invoices` by internal order id.

## Self-test (2026-10-09) — 68/68 PASS
| Suite | Result |
|---|---|
| `test_cr085a_normalization.py` (A0–A19 + new) | 22/22 ✅ |
| `test_phone_normalize.py` | 12/12 ✅ |
| `test_cr093_lookup.py` | 18/18 ✅ |
| `test_cr089_skip_otp.py` | 15/15 + 1 skip ✅ (run alone after limiter bucket reset — back-to-back suites share `so-ph:` buckets → 429, environmental not regression) |
Baseline customers **7700** before/after. No `qa085*` orders left. Backend log clean.

### Plan matrix coverage
| V | Covered by | Status |
|---|---|---|
| V1 valid phone links/earns | A10 | ✅ |
| V2 junk phone → guest, no tx, no WA, customers unchanged | A11 | ✅ (invoice doc existence not asserted — QA please check `invoices.order_id`) |
| V3 blank phone → guest, no `phone:""` create | A11b | ✅ (NB: a legacy `Customer ` doc `phone:""`, 34 visits, exists under `pos_owner_69_bdd4513c` since 2026-08-13 — G3 evidence, 085-B report row) |
| V4 invalid + `pos_customer_id` → links | A12 | ✅ |
| V5 guest + coupon → `coupon_usage.customer_id null` | — | **QA please** (needs an active coupon on r69) |
| V6 guest + `loyalty_points_used` → `loyalty_redeem null`, no mismatch log | A11c | ✅ |
| V7 guest + `wallet_used` → `wallet_used 0`, no wallet tx | A11c | ✅ |
| V8 payment-received junk → guest, no credit to flagged A6 | A9 | ✅ |
| V9 payment-received valid (A8) | A8 | ✅ |
| V10/V11 lookup junk / flagged → `registered:false`; valid dashed → found | A7b / A7 | ✅ |
| V12 duplicate replay on guest | — | **QA please** |
| V13 CRM Orders page / `GET /pos/customers/{id}/orders` no 500 | — | **QA please** (72% orders already null-customer) |
| R1–R4 3-tenant regression (valid bill → points/redeem/coupon/events) | — | **QA please** |

## QA asks
1. V5, V12, V13, R1–R4 above.
2. Confirm guest `/pos/orders` response has `guest_order:true` and **no** `whatsapp_message_logs` row for the order id.
3. Confirm `payment-received` with `coupon_code` + junk phone still returns `coupon_applied` (E4 helper path).
4. Negative: valid-phone bill still fires `send_bill` (watch `whatsapp_message_logs`).
5. Run suites **one at a time** or clear `scan_lookup_attempts` between them (limiter).
6. Leave baseline at 7700; delete anything you create.

## Rollback
Single commit, code-only, `git revert`. Guest orders written meanwhile remain `customer_id:null` (same shape as 48k existing migration orders).
