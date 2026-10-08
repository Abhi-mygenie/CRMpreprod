# CR-085-A2 — Implementation Plan
## Invalid-phone bills → GUEST ORDER (G) on W1/W2 · POS `customer-lookup` hides `phone_invalid` records (W5)

**Date**: 2026-10-09 · **Role**: Planning Agent · **Risk**: **CRITICAL** (edits `routers/pos.py` `_find_or_create_customer`, `/pos/orders` realtime path, `/pos/webhook/payment-received`, `/pos/customer-lookup` — addendum §14 "do NOT change POS order ingestion / customer identity rules without owner approval"). Full gate + full POS order regression.
**Parent**: CR-085-A (implemented 2026-10-09, QA PASS, closure gated on this follow-up). Deviation record: `handoff/SESSION_2026_10_09_HANDOVER_CR089_CR085A.md` §085-A2.
**Frozen decisions** (`DECISIONS_LOG.md` 2026-10-09 ×3): (1) invalid phone on a bill → `customer_id: null`, no customer created or credited, `pos_customer_id` match still runs first and wins; (2) POS `customer-lookup` must not return `phone_invalid:true` records; (3) W3/W4 POS create/update + `customer_sync` keep **F**; (4) no stored document changed (085-B deferred, report-first); (5) **c1**: coupon on guest bill → usage recorded `customer_id:null`, per-user/specific-users skipped, `core/coupon.py` untouched (CR-082 `requires_customer` stays queued).
**Effort**: ~2.5 h impl + 1 h QA (incl. 3-tenant POS regression).
**Gate**: ⏸ OWNER APPROVAL REQUIRED before implementation.

---

## 0. Code reality (read-only probe 2026-10-09)
| Fact | Evidence |
|---|---|
| W1 `_find_or_create_customer` normalises then **always** phone-matches/creates; invalid → doc with `phone_invalid:true` (F) | `pos.py:682-716` |
| `/pos/orders` consumes `customer` on 20 lines after the call (tier, redemption, wallet, stats update, order save, invoice, 3 WhatsApp triggers, coupon recorder, response) | `pos.py:1356-1716` |
| `_save_order_and_transactions` writes `customer["id"]` into `orders`, `order_items`, `points_transactions`, `wallet_transactions` | `pos.py:893, 1011, 1058, 1071` |
| W2 `payment-received` normalises then find-or-creates (F); no order document is written by this route — only customer stats + `points_transactions` | `pos.py:1747-2046` |
| W5 `customer-lookup` normalises + `phone_match`; **no** `phone_invalid` filter | `pos.py:2059-2060` |
| `create_invoice(..., customer=None)` already tolerated (`if customer:` guards) | `services/invoice_generator.py:761, 306, 312` |
| `build_order_event_context` never reads the `customer` argument | `core/whatsapp.py:352-450` |
| Coupon recorder: `validate_coupon_for_customer` skips per-user limit when `customer_id` falsy → `None` is safe | `core/coupon.py:1769, 2036` |
| `POSOrderWebhook.cust_mobile: str` (required, may be `""`); `user_id` = pos_customer_id optional | `pos.py:1198-1201` |
| Preview DB: `phone_invalid:true` customers = **0** (no realtime invalid bill has hit preview since 085-A) · last-90d orders 2,746 → **1,546 invalid/blank `cust_mobile`** (24 carry `pos_customer_id`), 1,208 already `customer_id:null` (migration path) · all-time `customer_id:null` = 48,200 / 67,386 (72%) → CRM reads already tolerate null | probe `/tmp/probe_085a2.py` |
| Tenant with most invalid bills (90d): `pos_0001_restaurant_788` 1,140 · `_478` 165 · `_618` 74 | same probe |

Blank `cust_mobile` (`""`) normalises to `invalid` → today W1 creates/links a `Customer ` doc with `phone:""`. G fixes G3 (blank-phone create) for realtime too.

## 1. Target behaviour (per frozen decisions)
| Point | Today (085-A) | After 085-A2 |
|---|---|---|
| W1 `/pos/orders`, invalid/blank phone, no `pos_customer_id` match | create/link flagged customer; points + stats + WhatsApp credited to it | **guest order**: `orders.customer_id:null`, `order_items.customer_id:null`; no customer write, no points, no wallet, no WhatsApp, no welcome/tier; invoice still generated (customer=None); coupon usage still recorded with `customer_id:null` (per-user limit n/a); response `customer_id:null, guest_order:true, guest_reason:"invalid_phone"` |
| W1, invalid phone **with** `pos_customer_id` that matches | link by pos id | unchanged — link by pos id (first path) |
| W1, `loyalty_points_used>0` on a guest bill | redeem against flagged customer | redemption **skipped**, logged `loyalty_redeem_skipped_guest`, response `loyalty_redeem:null`; order NOT rejected (CR-007 rule) |
| W1, `wallet_used>0` on a guest bill | wallet check against flagged customer | order NOT rejected; wallet not debited; `wallet_transactions` not written; warning logged `wallet_used_on_guest_order`; response `wallet_used:0, wallet_balance_after:0` |
| W2 `payment-received`, invalid phone | create/link flagged; earn/redeem | **no customer**: skip find/create, redeem, earn, stats; coupon maths unchanged (needs no customer); response `customer_id:null, customer_name:null, guest_order:true, transactions:[], final_bill_amount, original_bill_amount` |
| W5 `customer-lookup` with invalid phone, or stored record `phone_invalid:true` | returns record `registered:true` | `success:false, "Customer not found", data.registered:false` (same shape as today's miss) |
| W3/W4/W6/W7/W8–W15 | — | **untouched** |

## 2. Edits (file : location : change) — `routers/pos.py` only

### E1 — `_find_or_create_customer` (`pos.py:667-716`)
After the `pos_customer_id` lookup miss (line 681) and `normalize_phone` (683):
```python
# CR-085-A2 (G): invalid/blank phone → guest order; never match or create by phone.
if _pst == "invalid":
    return None, False, 0
```
Remove the two `phone_invalid` spreads (`:716`) — unreachable after the guard (keep `phone_raw` spread). Docstring: "Returns (None, False, 0) when phone invalid and no pos_customer_id match (guest order)."

### E2 — `pos_order_webhook` (`pos.py:1355-1732`) — one `is_guest` flag, 7 guarded blocks
1. After the call (`:1358`): `is_guest = customer is None`.
2. **3b redemption** (`:1369`): condition becomes `if not is_guest and order_data.loyalty_points_used ...`; add `elif is_guest and order_data.loyalty_points_used: logger.warning("loyalty_redeem_skipped_guest pos_order=%s ...")`.
3. **4 points** (`:1436-1449`): `if loyalty_enabled and not is_guest:` else zero `pts` dict (existing else-branch reused).
4. **5 wallet** (`:1452-1460`): `if is_guest: if wallet_used > 0: warning "wallet_used_on_guest_order"; wallet_used = 0.0; current_wallet = 0.0; new_wallet_balance = 0.0` else today's code.
5. **6 customer stats** (`:1463-1511`): wrap in `if not is_guest:`; guest branch sets `new_points = 0`, `new_tier = None`, `new_total_visits/new_total_spent` unused.
6. **7 save** (`:1514`): `_save_order_and_transactions(order_data, user, customer, ...)` — see E3 (accepts `None`).
7. **8 invoice + WhatsApp** (`:1520-1597`): `updated_customer = None if is_guest else {**customer, ...}`; `build_order_event_context(order_data, updated_customer or {}, ...)`; invoice call unchanged (`customer=None` ok); **all three `trigger_whatsapp_event` blocks wrapped in `if not is_guest:`** (nothing deliverable: no valid phone). `old_tier` read moved inside the guard.
8. **Coupon recorder** (`:1634`): `customer_id=customer["id"] if customer else None` (recorder already tolerates `None`).
9. **Response** (`:1707-1731`): `customer_id: customer["id"] if customer else None`, `customer_name: customer.get("name") if customer else None`, `tier: new_tier` (None for guest), `+ "guest_order": is_guest`, `+ "guest_reason": "invalid_phone" if is_guest else None`. Additive keys only.

### E3 — `_save_order_and_transactions` (`pos.py:869-1080`)
Signature `customer: Optional[dict]`; `_cid = customer["id"] if customer else None`; use `_cid` at `:893`, `:1011`, `:1058`, `:1071`. Points/wallet tx blocks already gated on `points_earned > 0` / `wallet_used > 0`, which are 0 for guests → no tx written.

### E4 — `pos_payment_received` (`pos.py:1747-1873`)
```python
_ph, _cc, _pst = normalize_phone(webhook_data.customer_phone)
if _pst == "invalid":  # CR-085-A2 (G)
    final_bill_amount = webhook_data.bill_amount
    resp = {"customer_id": None, "customer_name": None, "guest_order": True, "guest_reason": "invalid_phone", "transactions": []}
    # coupon discount maths reused (extract today's lines 1893-1919 into local helper `_apply_coupon_discount(user_id, code, amount) -> (amount, block|None)`)
    ... → return POSResponse(success=True, message="Payment processed (guest – invalid phone)", data=resp)
customer = await db.customers.find_one(phone_match(...))
```
Remove `phone_invalid` spread at `:1767` (unreachable). Rest unchanged.

### E5 — `pos_customer_lookup` (`pos.py:2059-2060`)
```python
_ph, _cc, _pst = normalize_phone(lookup_data.phone)  # CR-085 W5
if _pst == "invalid":  # CR-085-A2
    return POSResponse(success=False, message="Customer not found", data={"registered": False})
customer = await db.customers.find_one({**phone_match(user["id"], _ph, _cc), "phone_invalid": {"$ne": True}}, {"_id": 0})
```

### E6 — tests (`tests/test_cr085a_normalization.py`)
- `test_A9_webhook_invalid_matches_flagged` → rename `test_A9_webhook_invalid_is_guest`: assert `data.customer_id is None`, `guest_order True`, customers count for `0000000000` unchanged, **no** new `points_transactions` for A6 id.
- New `test_A11_pos_orders_invalid_guest`: `/pos/orders` with `cust_mobile:"0000000000"`, `order_amount:120` → 200, `data.customer_id None`, `guest_order True`, `points_earned 0`; Mongo: `orders.customer_id None`, `order_items.customer_id None`, no `points_transactions` for the order, customers count unchanged.
- New `test_A12_pos_orders_invalid_with_pos_customer_id_links`: same body + `user_id: <A5 pos_customer_id>` → links to A5 (`customer_id == A5.id`, `guest_order False`).
- New `test_A11b_pos_orders_blank_phone_guest`: `cust_mobile:""` → guest, no `Customer ` doc created.
- New `test_A7b_pos_customer_lookup_hides_flagged`: lookup `0000000000` → `registered:false`; lookup of A6 (flagged) → `registered:false`.
- New `test_A11c_guest_with_loyalty_points_used`: `loyalty_points_used: 10, loyalty_discount: 5` → 200, `loyalty_redeem null`, order saved.
- Existing A2/A5/A6/A8/A10/A13/A14/A16 unchanged (regression).

## 3. Edit order
E6 tests (red) → E3 (`_save_order_and_transactions` None-safe) → E1 guard → E2 realtime guards (top→bottom) → E4 webhook → E5 lookup → run `test_cr085a_normalization.py`, `test_cr089_skip_otp.py`, `test_cr093_lookup.py`, `test_phone_normalize.py` → 3-tenant POS regression (R1–R4 below) → QA handover.

## 4. Verification matrix
| # | Case | Expected |
|---|---|---|
| V1 | `/pos/orders` valid phone (A10 regression) | links existing, points earned, WhatsApp send_bill fired — unchanged |
| V2 | `/pos/orders` `0000000000`, no pos id | 200 · `customer_id null` · `guest_order true` · `points_earned 0` · `orders` doc with `customer_id null` · `order_items` null · 0 `points_transactions` · customers count unchanged · invoice doc created (`customer_id ""`) · 0 `whatsapp_message_logs` for order |
| V3 | `/pos/orders` `""` phone | as V2; no `phone:""` customer created |
| V4 | `/pos/orders` invalid phone + matching `pos_customer_id` | linked by pos id, full loyalty, `guest_order false` |
| V5 | V2 + `coupon_code` valid | `coupon_usage.recorded true`, `coupon_usage` doc `customer_id null` |
| V6 | V2 + `loyalty_points_used 10` | 200, `loyalty_redeem null`, warning logged, no `loyalty_mismatch_logs` row |
| V7 | V2 + `wallet_used 20` | 200, `wallet_used 0`, no `wallet_transactions`, warning logged |
| V8 | `payment-received` `0000000000` | 200 · `customer_id null` · `guest_order true` · customers count unchanged · 0 `points_transactions` |
| V9 | `payment-received` `+91 90000 00124` (A8 regression) | unchanged — links, earns |
| V10 | `customer-lookup` `0000000000` | `registered false` |
| V11 | `customer-lookup` A6 flagged doc phone / dashed valid (A7) | flagged → `registered false`; valid → `registered true` |
| V12 | Duplicate order replay (same `pos_order_id`) on guest | "Duplicate order" 200 — `_validate_order` unchanged |
| V13 | CRM Orders page / `GET /pos/customers/{id}/orders` | guest orders listed with no customer; no 500 (48k null-customer orders already exist) |
| V14 | `pytest tests/` full | all PASS; customers baseline **7700** after cleanup |
| R1–R4 | 3-tenant POS regression (r69 owner, 788, 478): valid bill → points · redemption · coupon · event webhook | unchanged |

## 5. Files WILL change / WILL NOT touch
**WILL**: `backend/routers/pos.py` (E1–E5), `backend/tests/test_cr085a_normalization.py` (E6).
**WILL NOT**: `core/phone.py`, `core/loyalty.py`, `core/coupon.py`, `core/whatsapp.py`, `services/invoice_generator.py`, `routers/customers.py`, `routers/scan.py`, `routers/migration.py`, `models/schemas.py`, any frontend file, any stored document (no migration, no `$unset`).

## 6. Risks & mitigations
| Risk | Level | Mitigation |
|---|---|---|
| Realtime path raises on `None` customer in a block I missed | HIGH | E3 first; `is_guest` branches top→bottom; V2/V5/V6/V7 exercise every block; outer `except` already returns 500 (no silent corruption) |
| Tenant 788 (1,140 invalid bills / 90d) sees loyalty "stop" | MEDIUM | expected per owner ruling; POS note states: send `pos_customer_id` or a valid phone to keep attribution |
| POS UI shows "Customer not found" for junk phones it previously saw as registered | LOW | intended (owner YES); POS note |
| Guest orders invisible to Customer App `/scan/orders` | NONE | by design — no identity |
| `order_items.customer_id null` breaks AI/analytics queries | LOW | 144,336 null rows already exist |
| Response shape change | NONE | additive keys only; `customer_id` may now be `null` (POS note) |

## 7. Rollback
Code-only; `git revert` of the single commit. No document migrated. Guest orders written while live stay as `customer_id:null` (same shape as 48k existing migration orders) — no restore needed.

## 8. Outputs on completion
Dashboard 085 → 🟢 085-A2 IMPLEMENTED · `# CR-085-A2` markers at E1–E5 · `qa/CR_085A2_QA_HANDOVER.md` · wave change-log POS row updated to "guest order LIVE" + "customer-lookup hides flagged" · second POS validation note · Scan & Order: no change (skip-otp/lookup untouched) · session handover.

---

```
Planning complete: CR-085-A2
Stage: Implementation Plan
Code reality: PARTIAL (085-A F behaviour live; G not started; lookup filter absent)
Risk: CRITICAL
Files WILL change: backend/routers/pos.py · backend/tests/test_cr085a_normalization.py
Files WILL NOT touch: core/*, services/*, routers/customers.py, routers/scan.py, routers/migration.py, models/schemas.py, frontend/*, stored data
Owner decisions: (c) FINAL 2026-10-09 = c1 (coupon usage recorded with customer_id:null; per-user/specific-users skipped; CR-082 stays queued). (a) wallet accept/no-debit and (b) invoice yes / WhatsApp no — proposed defaults, stand unless overridden
Docs: planning/CR_085A2_IMPLEMENTATION_PLAN.md
Next: Gate approval → Implementation
```

**OWNER APPROVAL REQUIRED**
Reason: edits POS order ingestion + customer identity rules in `routers/pos.py` (addendum §14, CRITICAL file); changes live loyalty behaviour for bills with junk/blank phones.
Risk: CRITICAL
Proposed next step: owner confirms defaults (a)(b)(c) or overrides → "choose implementation role for CR-085-A2".
I will not proceed until owner approves.
