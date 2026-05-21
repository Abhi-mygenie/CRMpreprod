# CRM 1.0 Sprint

## Sprint Name
CRM 1.0

## Sprint Objective
Stabilize POS → CRM data flow so that when an order comes from MyGenie POS into CRM, the restaurant owner can log in to CRM and see correct and useful data across: orders, customers, order items, customer profile, order history, WhatsApp automation, loyalty points, coupons, and wallet.

## Accepted Baseline

### CR-001 (Pre-Sprint) — CRM Token Push
- CRM pushes `users.api_key` to MyGenie POS as `crm_token`
- POS accepted the token
- Real login/re-login validated
- Final status: `cr_001_validated_end_to_end`

### CR-002 (Pre-Sprint) — POS Request Logging
- CRM logs inbound `/api/pos/*` requests into `pos_request_logs`
- Validated verdicts: success, business_rejection, auth_failed, validation_failed, not_found
- Final status: `cr_002_pos_request_logging_validated_end_to_end`

### POS → CRM Order Ingestion (Validated)
- Restaurant 478 / 18march
- POS order id: `868855`, CRM order id: `2e490cb8-8cfd-4fed-955a-7d30f505763e`
- user_id: `pos_0001_restaurant_478`
- Side writes confirmed: `orders`, `order_items`, `customers`, `points_transactions`

### CR-003 (Pre-Sprint) — Investigation
- Report: `/app/memory/crm/CR_003_POS_ORDER_DATA_MAPPING_AND_TRIGGER_FLOW_INVESTIGATION.md`
- Key gaps identified (coupon bypass, WhatsApp automation mismatch, missing running totals, etc.)

## CR List

| # | CR | Name | Priority |
|---|---|---|---|
| 1 | CR-001 | POS Order Data Mapping & CRM Visibility | P0 |
| 2 | CR-002 | WhatsApp Automation Trigger Flow | P1 |
| 3 | CR-003 | Loyalty Points Flow | P1 |
| 4 | CR-004 | Coupon Code Flow | P1 |
| 5 | CR-005 | Wallet Flow | P1 |

## Recommended CR Order
1. **CR-001** first — all other modules depend on correct base data mapping
2. **CR-002** through **CR-005** can proceed after CR-001, in listed order

## Lifecycle Rule
Each CR follows this lifecycle strictly:
```
Intake → Analysis → Planning → Implementation → QA → Final Baseline Update
```

## WARNING
No implementation work shall begin on any CR without explicit owner approval of the analysis and plan for that CR. Placeholder documents in the `analysis/`, `planning/`, `implementation/`, and `qa/` folders are structural scaffolds only and do not constitute implementation approval.
