# CRM 1.0 — Scope and Rules

## In Scope

- POS order ingestion endpoint (`POST /api/pos/orders`) and all its side effects
- CRM collections: `orders`, `order_items`, `customers`, `points_transactions`, `wallet_transactions`, `coupons`, `coupon_usage`, `loyalty_settings`, `whatsapp_event_template_map`, `whatsapp_template_variable_map`, `whatsapp_message_logs`, `automation_rules`, `feedback`, `pos_event_logs`
- CRM frontend pages that display order, customer, loyalty, wallet, coupon, and WhatsApp data
- CRM backend routes that serve data to those pages
- WhatsApp automation trigger flow from order events
- Loyalty points earn/redeem/bonus/expiry flow
- Coupon validation and usage tracking from POS orders
- Wallet debit/credit flow from POS orders
- Data scoping by restaurant/user/customer
- Customer auto-creation and matching logic
- Customer running-total accuracy

## Out of Scope

- POS application code (MyGenie side)
- Changing the POS → CRM order payload contract
- Frontend redesign or UX overhaul
- Scan & Order customer app (unless shared collections/routes are affected)
- New module development (e.g., reservations, inventory)
- Production deployment of CRM 1.0 changes
- CR-001 (pre-sprint, token push) — already validated
- CR-002 (pre-sprint, request logging) — already validated
- AuthKey.io API key procurement for restaurant 478 (operator responsibility)
- Multi-restaurant support expansion (separate future sprint)
- `CRM_EXTERNAL_URL` / `api_base_url` production configuration

## Strict Rules

### Lifecycle
1. Every CR must follow: **Intake → Analysis → Planning → Implementation → QA → Final Baseline Update**
2. No implementation shall begin without explicit owner approval of the analysis and plan
3. Placeholder documents do not constitute approval

### No Regression
4. CRM 1.0 must NOT disturb validated CR-001 token push behavior
5. CRM 1.0 must NOT disturb validated CR-002 POS request logging behavior
6. CRM 1.0 must NOT break existing POS → CRM order ingestion that is currently working

### Code Discipline
7. No code changes during intake or analysis phases
8. All code changes must be documented in implementation reports
9. All code changes must be tested and documented in QA reports

### Data Safety
10. No direct modification of production MongoDB data during analysis
11. Test data used during QA must be clearly identified and cleaned up
12. No deletion of existing customer, order, or transaction records

### Documentation
13. Every CR must have: analysis doc, plan doc, implementation report, QA report
14. Final baseline update must record what changed and what the new validated state is
15. Open gaps must be registered in `CRM_1_0_OPEN_GAPS_REGISTER.md`
