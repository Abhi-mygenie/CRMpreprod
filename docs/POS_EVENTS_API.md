# POS Events Webhook API Documentation

## Overview
Single webhook endpoint for POS systems to trigger WhatsApp messages for various order lifecycle events.

## Endpoint

```
POST /api/pos/events
```

## Authentication
Requires `X-API-Key` header with valid POS API key.

```bash
curl -X POST https://your-domain.com/api/pos/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key"
```

## Request Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pos_id` | string | Yes | POS system identifier (e.g., "mygenie") |
| `restaurant_id` | string | Yes | Restaurant ID in POS system |
| `event_type` | string | Yes | Event type (see supported events below) |
| `order_id` | string | Yes | POS order reference |
| `customer_phone` | string | Yes | Customer phone number |
| `event_data` | object | No | Event-specific data for template variables |

### Example Request

```json
{
  "pos_id": "mygenie",
  "restaurant_id": "REST-001",
  "event_type": "order_confirmed",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "order_amount": 1500,
    "customer_name": "John Doe",
    "estimated_time": "15 mins"
  }
}
```

## Supported Events

| Event Type | Recipient | Description | Required event_data |
|------------|-----------|-------------|---------------------|
| `new_order_customer` | Customer | Notify customer when order is placed | - |
| `new_order_outlet` | Outlet | Alert outlet when order is received | `outlet_phone` (optional, uses user phone if not provided) |
| `order_confirmed` | Customer | Confirm order to customer | - |
| `order_ready_customer` | Customer | Notify customer order is ready | - |
| `item_ready` | Customer | Notify customer specific item is ready | `item_name` |
| `order_served` | Customer | Notify customer order is served | - |
| `item_served` | Customer | Notify customer item is served | `item_name` |
| `order_ready_delivery` | Delivery Boy | Alert delivery boy order is ready | `delivery_boy_phone` (required), `delivery_boy_name` |
| `order_dispatched` | Customer | Notify customer order is out for delivery | `tracking_link`, `delivery_boy_name` |
| `send_bill_manual` | Customer | Manually send bill to customer | `order_amount`, `items` |
| `send_bill_auto` | Customer | Auto send bill | `order_amount`, `items` |

## Event Data Fields

Common fields that can be passed in `event_data`:

| Field | Type | Description |
|-------|------|-------------|
| `order_amount` | number | Order total amount |
| `customer_name` | string | Customer name |
| `item_name` | string | Item name (for item_ready/item_served) |
| `table_id` | string | Table identifier |
| `estimated_time` | string | Estimated preparation time |
| `delivery_boy_name` | string | Delivery person name |
| `delivery_boy_phone` | string | Delivery person phone (required for order_ready_delivery) |
| `outlet_phone` | string | Outlet phone (for new_order_outlet) |
| `tracking_link` | string | Order tracking URL |
| `items` | array | List of order items |

## Response

### Success Response

```json
{
  "success": true,
  "message": "Event 'order_confirmed' processed and WhatsApp sent",
  "data": {
    "event_id": "uuid-here",
    "event_type": "order_confirmed",
    "whatsapp_sent": true,
    "message_id": "authkey-message-id",
    "recipient": "9876543210",
    "recipient_type": "customer"
  }
}
```

### Event Trigger Not Configured

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

### Event Trigger Paused

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

### No Template Configured

```json
{
  "success": true,
  "message": "Event 'order_confirmed' received but no WhatsApp template configured",
  "data": {
    "event_id": "uuid-here",
    "event_type": "order_confirmed",
    "whatsapp_sent": false,
    "reason": "No template configured or event disabled"
  }
}
```

### Error Response

```json
{
  "success": false,
  "message": "Invalid event_type. Must be one of: [...]",
  "data": null
}
```

## Error Codes

| Error | Description |
|-------|-------------|
| 401 | Invalid or missing API key |
| 400 | Invalid event_type or missing required fields |

## Event-Specific Examples

### 1. Order Confirmed
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "REST-001",
  "event_type": "order_confirmed",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "order_amount": 1500,
    "estimated_time": "20 mins"
  }
}
```

### 2. Order Ready for Delivery Boy
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "REST-001",
  "event_type": "order_ready_delivery",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "delivery_boy_phone": "9999888877",
    "delivery_boy_name": "Raju",
    "order_amount": 1500,
    "customer_name": "John Doe",
    "address": "123 Main St"
  }
}
```

### 3. Order Dispatched
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "REST-001",
  "event_type": "order_dispatched",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "delivery_boy_name": "Raju",
    "tracking_link": "https://track.example.com/ORD-12345",
    "estimated_time": "30 mins"
  }
}
```

### 4. New Order to Outlet
```json
{
  "pos_id": "mygenie",
  "restaurant_id": "REST-001",
  "event_type": "new_order_outlet",
  "order_id": "ORD-12345",
  "customer_phone": "9876543210",
  "event_data": {
    "outlet_phone": "9988776655",
    "order_amount": 1500,
    "items": ["Butter Chicken", "Naan", "Dal Makhani"]
  }
}
```

## Integration Flow

1. POS system calls `/api/pos/events` when an event occurs
2. CRM validates the API key and event type
3. **CRM checks if event trigger is ACTIVE** (early exit if paused/not configured)
4. CRM looks up the customer by phone
5. CRM checks if a WhatsApp template is configured for this event
6. If configured, CRM sends WhatsApp message via AuthKey
7. Event is logged in `pos_event_logs` collection
8. Response returned to POS

## Notes

- WhatsApp messages are only sent if a template is configured and enabled for the event type in CRM settings
- Events are always logged regardless of whether WhatsApp is sent
- Customer data from CRM is used for template variables when customer exists
