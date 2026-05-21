# CRM 1.0 — Sprint Intake

## Background

MyGenie POS sends order data to CRM via `POST /api/pos/orders`. The ingestion pipeline creates records in `orders`, `order_items`, `customers`, and `points_transactions`. This has been validated end-to-end for restaurant 478.

However, the CR-003 investigation revealed multiple gaps in how this data flows through the CRM's downstream modules — WhatsApp automation, loyalty points, coupons, and wallet — and how it surfaces in the CRM UI for restaurant owners.

## Why This Sprint Exists

CRM 1.0 exists to close the gap between "order arrives in DB" and "restaurant owner sees correct, actionable data in CRM UI." Specifically:

1. **Base data mapping** may have field mismatches, missing running totals, or scoping issues that make CRM screens inaccurate.
2. **WhatsApp automation** does not fire after orders because the active trigger code reads `whatsapp_event_template_map` (0 rows) while seeded config lives in `automation_rules` (10 rows).
3. **Loyalty points** may not earn correctly for all order amounts and tiers; running totals on the customer record are not updated.
4. **Coupon processing** is bypassed by `/api/pos/orders` — coupon_code and coupon_discount are stored but not validated, and no `coupon_usage` record is created.
5. **Wallet** deductions work but wallet-related running totals on customer records are not updated.

## Known Validated Flows

| Flow | Status | Evidence |
|---|---|---|
| POS → CRM auth (X-API-Key) | Validated | CR-001 end-to-end |
| POS request logging | Validated | CR-002 end-to-end |
| Order insert into `orders` | Validated | Reference order 868855 |
| Order items insert into `order_items` | Validated | 2 items for order 868855 |
| Customer auto-create | Validated | Customer "abhi live" created |
| First visit bonus | Validated | 50 points awarded |
| Duplicate order rejection | Validated | Tested during CR-003 investigation |

## Known Gaps (from CR-003 Investigation)

| Gap ID | Description | Severity |
|---|---|---|
| GAP-1 | Orders below min_order_value earn 0 points (by design) | Awareness |
| GAP-2 | `/api/pos/orders` does not validate/record coupon usage | MEDIUM |
| GAP-3 | Customer running-total fields (total_points_earned, total_wallet_used, etc.) never updated | LOW |
| GAP-4 | `automation_rules` (10 rows) orphaned; active code reads `whatsapp_event_template_map` (0 rows) | LOW-MEDIUM |
| GAP-5 | No `authkey_api_key` for restaurant 478 | LOW (config) |
| GAP-6 | `order_items` missing some OrderItem schema fields | LOW |
| GAP-7 | `pos_customer_id` null when POS doesn't send user_id | LOW |
| GAP-8 | Item prices = 0 in reference order | LOW (POS behavior) |
| GAP-9 | No feedback loop from order flow | LOW |
| GAP-10 | order_created_at / order_updated_at null from POS | LOW |

## Success Criteria for CRM 1.0

When CRM 1.0 is complete, a restaurant owner should be able to:

1. Log into CRM and see all POS orders correctly on the dashboard
2. Open any customer profile and see accurate: visits, total spent, points balance, wallet balance, tier, order history
3. See WhatsApp messages triggered automatically after order events (if AuthKey configured and templates mapped)
4. See loyalty points correctly earned, with accurate balances and transaction history
5. See coupon usage correctly tracked when POS sends coupon data
6. See wallet transactions correctly recorded with accurate balances
7. All data correctly scoped by restaurant/user — no cross-restaurant data leaks
