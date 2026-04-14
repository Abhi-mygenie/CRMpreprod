# CRM Backend API — Endpoints Written by THIS App

> **Codebase:** `/app/backend/` (FastAPI)
> **Base URL:** `/api`
> **Auth Types:** JWT (CRM staff login) | API Key (`X-API-Key` header, POS systems)

---

## 1. Authentication (`/api/auth`) — `routers/auth.py`
**Auth: None (public)**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/auth/register` | Create new restaurant user account |
| POST | `/auth/login` | Login via MyGenie SSO (calls mygenie-login internally) |
| POST | `/auth/mygenie-login` | Direct MyGenie SSO endpoint (duplicate of /login) |
| POST | `/auth/demo-login` | Demo mode login with test user |
| POST | `/auth/forgot-password/request-otp` | Generate OTP for password reset |
| POST | `/auth/forgot-password/verify-otp` | Verify OTP, get reset token |
| POST | `/auth/forgot-password/reset` | Reset password with token, auto-login |

**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/auth/me` | Get current logged-in user |
| PUT | `/auth/profile` | Update user profile (phone, address) |
| PUT | `/auth/reset-password` | Change password (requires current password) |

**Collections written:** `users`, `otp_tokens`, `loyalty_settings`, `whatsapp_templates`, `automation_rules`

---

## 2. Customer Management (`/api/customers`) — `routers/customers.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/customers` | Create customer |
| GET | `/customers` | List customers (30+ filters, search by name/phone, pagination) |
| GET | `/customers/sample-data` | Get first customer as template preview sample |
| GET | `/customers/sync-status` | Check MyGenie customer sync progress |
| POST | `/customers/sync-from-mygenie` | Start background customer sync from MyGenie API |
| GET | `/customers/segments/stats` | Customer segment statistics (tier, city, inactive) |
| GET | `/customers/{id}` | Get single customer |
| PUT | `/customers/{id}` | Update customer |
| DELETE | `/customers/{id}` | Delete customer + related transactions |
| GET | `/customers/{id}/loyalty-details` | Loyalty conversion rates + active coupons |
| GET | `/customers/{id}/insights` | AI insights (top items, frequency, spending trend) |

**Collections written:** `customers` (flat fields only — NOT the `addresses[]` array), `points_transactions`

**Note:** The `Customer` Pydantic response model does NOT include the `addresses` field. Any `addresses[]` data on the customer doc is silently dropped from API responses.

---

## 3. QR Code Registration (`/api/qr`) — `routers/customers.py`
**Auth: None (public)**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/qr/generate` | Generate QR code for customer self-registration (JWT required) |
| POST | `/qr/register/{restaurant_id}` | Customer self-registers via QR scan (no auth) |

**Collections written:** `customers`, `points_transactions` (first visit bonus)

---

## 4. Segments (`/api/segments`) — `routers/customers.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/segments` | Create segment with filter rules |
| GET | `/segments` | List all segments (auto-refreshes counts) |
| POST | `/segments/preview-count` | Preview customer count for filters |
| GET | `/segments/whatsapp-configs/all` | Get all segment WhatsApp configs |
| GET | `/segments/{id}` | Get single segment |
| GET | `/segments/{id}/customers` | Get customers matching segment filters |
| PUT | `/segments/{id}` | Update segment |
| DELETE | `/segments/{id}` | Delete segment + WhatsApp config |
| GET | `/segments/{id}/whatsapp-config` | Get WhatsApp automation config for segment |
| POST | `/segments/{id}/whatsapp-config` | Save WhatsApp config for segment |
| DELETE | `/segments/{id}/whatsapp-config` | Remove WhatsApp config |
| PATCH | `/segments/{id}/whatsapp-config/toggle` | Pause/resume automation |

**Collections written:** `segments`, `segment_whatsapp_config`

---

## 5. Points (`/api/points`) — `routers/points.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/points/transaction` | Create earn/redeem/bonus transaction |
| POST | `/points/earn` | Quick earn based on bill amount + tier % |
| GET | `/points/transactions/{customer_id}` | Get transaction history |
| GET | `/points/expiring/{customer_id}` | Get expiring points info |
| POST | `/points/process-expiry-reminders` | Process expiry reminders (current user) |
| POST | `/points/expire` | Expire old points (current user) |
| POST | `/points/process-birthday-bonus` | Process birthday bonuses (current user) |
| POST | `/points/process-anniversary-bonus` | Process anniversary bonuses (current user) |

**Collections written:** `customers` (points, tier, visits, spent), `points_transactions`

**Customer fields written by cron jobs:** `last_birthday_bonus_year`, `last_anniversary_bonus_year`, `last_points_expiry`

---

## 6. Loyalty Settings (`/api/loyalty`) — `routers/points.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/loyalty/settings` | Get loyalty program configuration |
| PUT | `/loyalty/settings` | Update loyalty settings |

**Collections written:** `loyalty_settings`

---

## 7. Wallet (`/api/wallet`) — `routers/wallet.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/wallet/transaction` | Credit/debit wallet |
| GET | `/wallet/transactions/{customer_id}` | Transaction history |
| GET | `/wallet/balance/{customer_id}` | Current balance |

**Collections written:** `customers` (wallet_balance), `wallet_transactions`

---

## 8. Coupons (`/api/coupons`) — `routers/coupons.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/coupons` | Create coupon |
| GET | `/coupons` | List coupons |
| GET | `/coupons/{id}` | Get coupon |
| PUT | `/coupons/{id}` | Update coupon |
| DELETE | `/coupons/{id}` | Delete coupon |
| POST | `/coupons/{id}/toggle` | Activate/deactivate |
| POST | `/coupons/validate` | Validate coupon (full checks) |
| POST | `/coupons/apply` | Apply coupon + record usage |
| GET | `/coupons/{id}/usage` | Get usage history |

**Collections written:** `coupons`, `coupon_usage`

---

## 9. Feedback (`/api/feedback`) — `routers/feedback.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/feedback` | Create feedback entry |
| GET | `/feedback` | List feedback (filter by status, rating) |
| PUT | `/feedback/{id}/resolve` | Mark as resolved |

**Collections written:** `feedback`, `customers` (feedback_count, last_rating)

---

## 10. Analytics (`/api/analytics`) — `routers/feedback.py` + `routers/analytics.py`
**Auth: JWT**

| Method | Route | Source File | Purpose |
|--------|-------|-------------|---------|
| GET | `/analytics/dashboard` | feedback.py | Full dashboard stats (customers, orders, revenue, points, wallet, coupons) |
| GET | `/analytics/item-performance` | analytics.py | Menu item sales analytics |
| GET | `/analytics/item-performance/export` | analytics.py | Export item data |
| GET | `/analytics/item-customers/{item_name}` | analytics.py | Customers who ordered a specific item |
| GET | `/analytics/customer-lifecycle` | analytics.py | Customer lifecycle stage distribution |
| GET | `/analytics/customer-lifecycle/trend` | analytics.py | Lifecycle trend over time |
| GET | `/analytics/customer-lifecycle/customers` | analytics.py | Customers in a lifecycle stage |
| GET | `/analytics/customer-lifecycle/export` | analytics.py | Export lifecycle data |

**Collections read:** `customers`, `orders`, `order_items`, `points_transactions`, `wallet_transactions`, `coupons`, `coupon_usage`, `feedback`, `loyalty_settings`

---

## 11. POS Gateway (`/api/pos`) — `routers/pos.py`
**Auth: API Key (`X-API-Key` header)**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/pos/customers` | Create customer from POS |
| PUT | `/pos/customers/{id}` | Update customer from POS |
| POST | `/pos/customer-lookup` | Lookup by phone (returns loyalty info, NO addresses) |
| POST | `/pos/max-redeemable` | Calculate max redeemable points for a bill |
| POST | `/pos/orders` | Full order webhook (items, points, wallet, WhatsApp triggers) |
| POST | `/pos/webhook/payment-received` | Legacy payment webhook (DUPLICATE of /orders, missing validations) |
| POST | `/pos/events` | Trigger WhatsApp event (order confirmed, ready, dispatched, etc.) |

**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/pos/api-key` | Get POS API key |
| POST | `/pos/api-key/regenerate` | Regenerate API key |

**Collections written:** `customers` (flat fields only), `orders`, `order_items`, `points_transactions`, `wallet_transactions`, `pos_event_logs`

---

## 12. Messaging (`/api/messaging`) — `routers/pos.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/messaging/send` | Send message (MOCK — provider not integrated) |

**Collections written:** `message_logs`

---

## 13. WhatsApp (`/api/whatsapp`) — `routers/whatsapp.py`
**Auth: JWT**

### Internal Templates
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/whatsapp/setup-defaults` | Create default templates + automation rules |
| POST | `/whatsapp/templates` | Create template |
| GET | `/whatsapp/templates` | List templates |
| GET | `/whatsapp/templates/{id}` | Get template |
| PUT | `/whatsapp/templates/{id}` | Update template |
| DELETE | `/whatsapp/templates/{id}` | Delete template |

### Custom Templates (AuthKey/Meta)
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/whatsapp/custom-templates` | Create custom template |
| GET | `/whatsapp/custom-templates` | List custom templates |
| PUT | `/whatsapp/custom-templates/{id}` | Update custom template |
| DELETE | `/whatsapp/custom-templates/{id}` | Delete custom template |
| PUT | `/whatsapp/custom-templates/{id}/submit` | Submit for approval |
| POST | `/whatsapp/meta/create-template` | Create via Meta API |
| POST | `/whatsapp/authkey/sync-templates` | Sync from AuthKey |
| POST | `/whatsapp/create-and-sync-template` | Create + sync |

### Automation Rules
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/whatsapp/automation` | Create automation rule |
| GET | `/whatsapp/automation` | List rules |
| GET | `/whatsapp/automation/events` | List available events |
| GET | `/whatsapp/automation/{id}` | Get rule |
| PUT | `/whatsapp/automation/{id}` | Update rule |
| DELETE | `/whatsapp/automation/{id}` | Delete rule |
| POST | `/whatsapp/automation/{id}/toggle` | Enable/disable rule |
| GET | `/whatsapp/automation-with-templates` | Rules with template details |

### Event-Template Mapping
| Method | Route | Purpose |
|--------|-------|---------|
| PUT | `/whatsapp/event-template-map` | Map event to template |
| POST | `/whatsapp/event-template-map/{key}/toggle` | Toggle event |
| GET | `/whatsapp/event-template-map` | Get all mappings |
| DELETE | `/whatsapp/event-template-map/{key}` | Remove mapping |
| GET | `/whatsapp/template-variable-map` | Get variable mappings |
| PUT | `/whatsapp/template-variable-map/{id}` | Update variable mapping |

### WhatsApp Settings & Messaging
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/whatsapp/api-key` | Get AuthKey/Meta credentials |
| PUT | `/whatsapp/api-key` | Save credentials |
| GET | `/whatsapp/authkey-templates` | Fetch templates from AuthKey API |
| POST | `/whatsapp/test-template` | Send test message |
| GET | `/whatsapp/message-stats` | Message delivery stats |
| GET | `/whatsapp/message-logs` | Message log history |
| GET | `/whatsapp/message-filters` | Available filter options |
| POST | `/whatsapp/status-callback` | Delivery status webhook (from AuthKey) |
| POST | `/whatsapp/resend` | Resend failed message |

**Collections written:** `whatsapp_templates`, `automation_rules`, `custom_templates`, `whatsapp_event_template_map`, `whatsapp_template_variable_map`, `whatsapp_message_logs`

---

## 14. Migration (`/api/migration`) — `routers/migration.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/migration/status` | Check migration status |
| POST | `/migration/skip-permanently` | Skip migration prompt |
| POST | `/migration/confirm` | Confirm and start migration |
| POST | `/migration/revert` | Revert full migration |
| POST | `/migration/revert-customers` | Revert customer migration only |
| POST | `/migration/revert-orders` | Revert order migration only |
| POST | `/migration/sync-orders` | Sync orders from MyGenie |
| GET | `/migration/sync-orders/status` | Order sync progress |

**Collections written:** `customers`, `orders`, `order_items`, `points_transactions`, `wallet_transactions`, `users`

---

## 15. Cron Jobs (`/api/cron`) — `routers/cron.py`
**Auth: JWT**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/cron/status` | Scheduler status + recent job logs |
| POST | `/cron/trigger` | Run all loyalty jobs for current user |
| POST | `/cron/trigger-all-users` | Run all loyalty jobs for ALL users |

**Collections written:** `customers`, `points_transactions`, `cron_job_logs`

---

## 16. Root (`/api`) — `server.py`
**Auth: None**

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | API info |
| GET | `/health` | Health check |

---

## Total: 82 endpoints across 12 routers

### Collections this app writes to (18):
`users`, `customers` (flat fields + loyalty fields), `loyalty_settings`, `points_transactions`, `wallet_transactions`, `coupons`, `coupon_usage`, `segments`, `segment_whatsapp_config`, `whatsapp_templates`, `automation_rules`, `custom_templates`, `whatsapp_event_template_map`, `whatsapp_template_variable_map`, `whatsapp_message_logs`, `feedback`, `orders`, `order_items`, `otp_tokens`, `pos_event_logs`, `cron_job_logs`, `message_logs`
