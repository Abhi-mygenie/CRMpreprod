# MyGenie CRM — WhatsApp Event Triggers: Complete Reference

> **For**: POS Team / Integration Partners / Restaurant Owners
> **Version**: 2.0
> **Last Updated**: 2026-06-06
> **Base URL**: `https://{your-crm-domain}/api`

---

## Overview

MyGenie CRM sends automated WhatsApp messages to customers (and staff) based on **27 events**. These events fall into 3 categories:

| Category | Triggered by | Count | Examples |
|---|---|---|---|
| **POS Events** | POS app calls CRM API | 11 | Order confirmed, Bill sent, Order dispatched |
| **CRM Events** | CRM backend automatically | 6 | Welcome message, Points earned, Wallet credit |
| **Cron Events** | Daily scheduler (midnight UTC) | 5 | Birthday wish, Points expiring, Inactive customer |
| **Auto (Order Hook)** | Fired inside `/pos/orders` | 3 | Send bill, Welcome message, Tier upgrade |
| **Not wired** | Defined but no trigger | 1 | Feedback request |

**Total**: 27 event keys (1 not yet active)

---

## Prerequisites (Setup in CRM)

Before any event sends a WhatsApp message, the restaurant owner must:

1. **Configure WhatsApp credentials** in CRM Settings (AuthKey API key, brand number)
2. **Create/approve WhatsApp templates** in AuthKey/Meta console
3. **Map event to template** in CRM > WhatsApp > Automation tab:
   - Select the event (e.g., `send_bill`)
   - Assign a WhatsApp template
   - Map template variables (e.g., `{{1}}` = customer_name, `{{2}}` = amount)
   - Toggle the event **ON** (enabled)

If an event is not mapped or is toggled OFF, the API call succeeds but no WhatsApp is sent.

---

## Authentication

All POS endpoints require:

```
X-API-Key: YOUR_POS_API_KEY
```

Get the API key from: CRM Login Response > `pos_config.api_key`

---

## SECTION A: Auto-Triggered Events (No POS Action Needed)

These events fire **automatically** when certain actions happen. POS does NOT need to call any extra API.

### A1. `send_bill` — Bill Sent to Customer

| Field | Value |
|---|---|
| **Fires when** | Every order is received via `POST /api/pos/orders` |
| **POS action needed** | None — auto-fires inside the order webhook |
| **Recipient** | Customer who placed the order |
| **Template variables available** | `customer_name`, `amount`, `restaurant_order_id`, `payment_method`, `order_date`, `order_time`, `points_earned`, `points_balance`, `loyalty_points_used`, `order_type`, `einvoice_link`, `restaurant_name` |
| **Notes** | This is the primary bill notification. Also attaches e-invoice link if CR-014 is configured. `send_bill_manual` and `send_bill_auto` from POS Events (Section B) also route to this same event internally. |

### A2. `welcome_message` — New Customer Welcome

| Field | Value |
|---|---|
| **Fires when** | A customer's **first ever order** is received via `POST /api/pos/orders` |
| **POS action needed** | None — auto-detected when customer is newly created |
| **Recipient** | The new customer |
| **Template variables available** | `customer_name`, `restaurant_name`, `first_visit_bonus` (points awarded for first visit) |
| **Notes** | Only fires once per customer lifetime. If the customer already exists in CRM (from a previous order or manual add), this will NOT fire. |

### A3. `tier_upgrade` — Loyalty Tier Upgrade

| Field | Value |
|---|---|
| **Fires when** | A customer's loyalty tier increases after an order (e.g., Bronze to Silver) |
| **POS action needed** | None — auto-detected by comparing old tier vs new tier after points calculation |
| **Recipient** | The upgraded customer |
| **Template variables available** | `customer_name`, `old_tier`, `new_tier`, `restaurant_name`, `points_balance`, `amount` |
| **Notes** | Only fires on upgrade, not downgrade. Tier thresholds are configured in CRM > Loyalty Settings. |

---

## SECTION B: POS-Triggered Events (POS Must Call API)

These events require POS to make an explicit API call.

### API Endpoint

```
POST /api/pos/events
```

### Request Format

```json
{
  "pos_id": "0001",
  "restaurant_id": "523",
  "event_type": "order_confirmed",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "customer_name": "Raj Kumar",
    "order_amount": 850.00
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `pos_id` | string | Yes | POS system identifier (must match CRM config) |
| `restaurant_id` | string | Yes | Restaurant ID in POS system |
| `event_type` | string | Yes | One of the event keys listed below |
| `order_id` | string | Yes | POS order reference (used for idempotency) |
| `customer_phone` | string | Yes | Customer's phone number |
| `event_data` | object | No | Extra data for template variables (varies per event) |

### Response

**Success** (WhatsApp sent):
```json
{
  "success": true,
  "message": "Event 'order_confirmed' processed and WhatsApp sent",
  "data": {
    "event_id": "uuid",
    "event_type": "order_confirmed",
    "whatsapp_sent": true
  }
}
```

**Event not configured** (no template mapped):
```json
{
  "success": true,
  "message": "Event 'order_confirmed' not configured",
  "data": {
    "event_type": "order_confirmed",
    "whatsapp_sent": false,
    "reason": "Event trigger not configured"
  }
}
```

**Event paused**:
```json
{
  "success": true,
  "message": "Event 'order_confirmed' is paused",
  "data": {
    "event_type": "order_confirmed",
    "whatsapp_sent": false,
    "reason": "Event trigger is paused"
  }
}
```

---

### B1. `new_order_customer` — Order Placed (Customer Notification)

| Field | Value |
|---|---|
| **When to fire** | Immediately after a new order is placed |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `order_amount`, `order_type`, `restaurant_name` |

```json
{
  "pos_id": "0001",
  "restaurant_id": "523",
  "event_type": "new_order_customer",
  "order_id": "ORD-001",
  "customer_phone": "9876543210",
  "event_data": {
    "customer_name": "Raj Kumar",
    "order_amount": 850.00,
    "order_type": "dine_in"
  }
}
```

### B2. `new_order_outlet` — Order Placed (Outlet/Kitchen Notification)

| Field | Value |
|---|---|
| **When to fire** | Immediately after a new order is placed |
| **Recipient** | Outlet phone (from `event_data.outlet_phone` or restaurant's configured phone) |
| **Recommended `event_data`** | `outlet_phone`, `customer_name`, `order_amount`, `order_type` |
| **Special** | Customer lookup is skipped for outlet events. If `outlet_phone` is not in event_data, falls back to restaurant's phone from CRM profile. |

```json
{
  "pos_id": "0001",
  "restaurant_id": "523",
  "event_type": "new_order_outlet",
  "order_id": "ORD-001",
  "customer_phone": "9876543210",
  "event_data": {
    "outlet_phone": "9999888877",
    "customer_name": "Raj Kumar",
    "order_amount": 850.00
  }
}
```

### B3. `order_confirmed` — Order Confirmed by Outlet

| Field | Value |
|---|---|
| **When to fire** | When the outlet/kitchen accepts/confirms the order |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `order_amount`, `estimated_time` |

### B4. `order_ready_customer` — Order Ready for Pickup/Serve

| Field | Value |
|---|---|
| **When to fire** | When kitchen marks the entire order as ready |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `order_amount` |

### B5. `item_ready` — Specific Item Ready

| Field | Value |
|---|---|
| **When to fire** | When a specific item in the order is ready |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `item_name`, `order_amount` |

### B6. `order_served` — Order Served

| Field | Value |
|---|---|
| **When to fire** | When waiter marks the order as served to the customer |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `order_amount` |

### B7. `item_served` — Specific Item Served

| Field | Value |
|---|---|
| **When to fire** | When a specific item is served |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `item_name` |

### B8. `order_ready_delivery` — Order Ready for Delivery Boy

| Field | Value |
|---|---|
| **When to fire** | When kitchen marks order ready for delivery |
| **Recipient** | Delivery boy (phone from `event_data.delivery_boy_phone`) |
| **Required `event_data`** | `delivery_boy_phone` (MANDATORY) |
| **Special** | Will fail if `delivery_boy_phone` is not provided. |

```json
{
  "pos_id": "0001",
  "restaurant_id": "523",
  "event_type": "order_ready_delivery",
  "order_id": "ORD-001",
  "customer_phone": "9876543210",
  "event_data": {
    "delivery_boy_phone": "9111222333",
    "delivery_boy_name": "Ravi"
  }
}
```

### B9. `order_dispatched` — Order Out for Delivery

| Field | Value |
|---|---|
| **When to fire** | When order leaves the restaurant for delivery |
| **Recipient** | Customer |
| **Recommended `event_data`** | `customer_name`, `order_amount`, `delivery_boy_name`, `estimated_delivery_time` |

### B10. `send_bill_manual` — Manual Bill Send

| Field | Value |
|---|---|
| **When to fire** | When cashier manually triggers "Send Bill" from POS |
| **Recipient** | Customer |
| **Notes** | Internally maps to `send_bill` event. Same template, same variables. |

### B11. `send_bill_auto` — Auto Bill Send

| Field | Value |
|---|---|
| **When to fire** | When POS auto-sends bill after payment |
| **Recipient** | Customer |
| **Notes** | Internally maps to `send_bill` event. Same template, same variables. |

---

## SECTION C: CRM-Triggered Events (Triggered by CRM Admin Actions)

These events fire when CRM admin performs actions through the CRM dashboard. No POS integration needed.

### C1. `reset_password` — Password Reset OTP

| Field | Value |
|---|---|
| **Fires when** | Customer requests "Forgot Password" via `POST /api/auth/forgot-password` |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `otp`, `restaurant_name` |

### C2. `coupon_earned` — Coupon Applied for Customer

| Field | Value |
|---|---|
| **Fires when** | CRM admin applies a coupon for a customer via `POST /api/coupons/apply` |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `coupon_code`, `discount`, `coupon_title`, `coupon_expiry` |

### C3. `wallet_credit` — Wallet Top-Up

| Field | Value |
|---|---|
| **Fires when** | CRM admin credits a customer's wallet via `POST /api/wallet/credit` |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `wallet_amount`, `wallet_balance`, `restaurant_name` |

### C4. `wallet_debit` — Wallet Payment

| Field | Value |
|---|---|
| **Fires when** | CRM admin debits a customer's wallet via `POST /api/wallet/debit` |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `wallet_amount`, `wallet_balance`, `restaurant_name` |

### C5. `bonus_points` — Manual Bonus Points

| Field | Value |
|---|---|
| **Fires when** | CRM admin manually awards bonus points via `POST /api/points/adjust` |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `bonus_points`, `points_balance`, `restaurant_name` |

### C6. `points_redeemed` — Points Redeemed on Order

| Field | Value |
|---|---|
| **Fires when** | Customer redeems loyalty points to pay for an order (via loyalty redemption flow) |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `points_redeemed`, `points_balance`, `amount`, `restaurant_name` |

### C7. `points_earned` — Loyalty Points Earned

| Field | Value |
|---|---|
| **Fires when** | Customer earns points (after order, after bonus, after coupon). Fires via internal helper `trigger_points_earned_event()` |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `points_earned`, `points_balance`, `restaurant_name` |

---

## SECTION D: Daily Cron Events (Automatic, Runs at Midnight UTC)

These events run on a daily schedule via APScheduler. No manual trigger needed. The cron job scans all tenants and all customers.

### D1. `birthday` — Birthday Wish

| Field | Value |
|---|---|
| **Fires when** | Customer's date of birth matches today's date |
| **Schedule** | Daily at 00:00 UTC |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `birthday_bonus` (points awarded), `restaurant_name` |
| **Notes** | Awards birthday bonus points if configured in Loyalty Settings. Only fires once per year per customer. |

### D2. `anniversary` — Signup Anniversary Wish

| Field | Value |
|---|---|
| **Fires when** | Customer's CRM signup date anniversary matches today |
| **Schedule** | Daily at 00:00 UTC |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `anniversary_bonus` (points awarded), `restaurant_name` |
| **Notes** | Awards anniversary bonus points if configured. Only fires once per year per customer. |

### D3. `points_expiring` — Points Expiry Reminder

| Field | Value |
|---|---|
| **Fires when** | Customer has loyalty points that will expire within N days (configurable in Loyalty Settings) |
| **Schedule** | Daily at 00:00 UTC |
| **Recipient** | Customer |
| **Template variables** | `customer_name`, `expiring_points`, `expiry_date`, `restaurant_name` |

### D4. `coupon_expiring` — Coupon Expiry Reminder

| Field | Value |
|---|---|
| **Fires when** | An active coupon is expiring within N days and the customer has used it before |
| **Schedule** | Daily at 00:00 UTC |
| **Recipient** | Customers who have used the coupon |
| **Template variables** | `customer_name`, `coupon_code`, `coupon_expiry`, `restaurant_name` |

### D5. `inactive_customer` — Win-Back Message

| Field | Value |
|---|---|
| **Fires when** | Customer has not placed an order in 30+ days |
| **Schedule** | Daily at 00:00 UTC |
| **Recipient** | Inactive customer |
| **Template variables** | `customer_name`, `last_visit_date`, `restaurant_name` |
| **Notes** | Designed for win-back campaigns. Sends once, not repeated daily. |

---

## SECTION E: Not Yet Active

### E1. `feedback_request` — Post-Visit Feedback

| Field | Value |
|---|---|
| **Status** | Defined in event list but **no active trigger** in backend code |
| **Intended use** | Request feedback from customer after dining/order |
| **Template variables** | `customer_name`, `restaurant_name`, `feedback_link` |
| **Notes** | Event key exists and can be mapped to a template. But no code currently fires it. Would need a trigger added (e.g., fire X minutes after order completion, or via `POST /api/pos/events`). POS can already fire it manually via the events API (Section B). |

---

## Quick Reference: All 27 Events

| # | Event Key | Category | Trigger Source | Recipient |
|---|---|---|---|---|
| 1 | `send_bill` | Auto | `POST /pos/orders` (every order) | Customer |
| 2 | `welcome_message` | Auto | `POST /pos/orders` (first order only) | New customer |
| 3 | `tier_upgrade` | Auto | `POST /pos/orders` (when tier changes) | Customer |
| 4 | `new_order_customer` | POS | `POST /pos/events` | Customer |
| 5 | `new_order_outlet` | POS | `POST /pos/events` | Outlet phone |
| 6 | `order_confirmed` | POS | `POST /pos/events` | Customer |
| 7 | `order_ready_customer` | POS | `POST /pos/events` | Customer |
| 8 | `item_ready` | POS | `POST /pos/events` | Customer |
| 9 | `order_served` | POS | `POST /pos/events` | Customer |
| 10 | `item_served` | POS | `POST /pos/events` | Customer |
| 11 | `order_ready_delivery` | POS | `POST /pos/events` | Delivery boy |
| 12 | `order_dispatched` | POS | `POST /pos/events` | Customer |
| 13 | `send_bill_manual` | POS | `POST /pos/events` (maps to send_bill) | Customer |
| 14 | `send_bill_auto` | POS | `POST /pos/events` (maps to send_bill) | Customer |
| 15 | `reset_password` | CRM | `POST /auth/forgot-password` | Customer |
| 16 | `points_earned` | CRM | Auto after order/bonus/coupon | Customer |
| 17 | `points_redeemed` | CRM | Loyalty redemption flow | Customer |
| 18 | `bonus_points` | CRM | `POST /points/adjust` (admin) | Customer |
| 19 | `coupon_earned` | CRM | `POST /coupons/apply` (admin) | Customer |
| 20 | `wallet_credit` | CRM | `POST /wallet/credit` (admin) | Customer |
| 21 | `wallet_debit` | CRM | `POST /wallet/debit` (admin) | Customer |
| 22 | `birthday` | Cron | Daily midnight UTC | Customer |
| 23 | `anniversary` | Cron | Daily midnight UTC | Customer |
| 24 | `points_expiring` | Cron | Daily midnight UTC | Customer |
| 25 | `coupon_expiring` | Cron | Daily midnight UTC | Customer |
| 26 | `inactive_customer` | Cron | Daily midnight UTC | Customer |
| 27 | `feedback_request` | **Not active** | No trigger wired | Customer |

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| API returns 200 but `whatsapp_sent: false` | Event not mapped to template in CRM | CRM > WhatsApp > Automation > Map the event |
| API returns 200 but `reason: "Event trigger is paused"` | Event toggled OFF | CRM > WhatsApp > Automation > Toggle ON |
| Customer didn't receive WhatsApp | Template not approved by Meta, or AuthKey credentials wrong | Check CRM > WhatsApp > Message Status for delivery status |
| `send_bill` not firing | Usually already auto-fired by `/pos/orders`. If POS also calls `/pos/events` with `send_bill_manual`, it fires twice. | Use one or the other, not both |
| `welcome_message` not firing | Customer already exists in CRM (not truly new) | Expected behavior — only fires on first-ever order |
| Birthday/anniversary not firing | Customer DOB not set, or cron hasn't run yet | Check customer profile for DOB. Cron runs at midnight UTC. |

---

**End of document.**
