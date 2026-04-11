# Backend Team - Changes Required Checklist

**Created:** 2026-03-17  
**Last Updated:** 2026-03-17

---

## Status Legend
- 🔴 **Pending** - Not started
- 🟡 **In Progress** - Being worked on
- 🟢 **Completed** - Done
- 🔵 **Blocked** - Waiting on dependency

---

## 1. POS API Changes Required

### 1.1 Customer Migration API
**Endpoint:** `POST /api/v1/vendoremployee/whatsappcrm/customer-migration`

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 1.1.1 | Return **multiple addresses** per customer | High | 🔴 Pending | Currently returns single address. Need array of addresses with type (home/work/other), is_default flag |
| 1.1.2 | Return `f_name` and `l_name` separately | Low | 🔴 Pending | Currently we combine, but separate fields useful for personalization |
| 1.1.3 | Return `alternate_phone` if available | Medium | 🔴 Pending | For backup contact |
| 1.1.4 | Return `profile_image` URL | Low | 🔴 Pending | For customer display |
| 1.1.5 | Return `company_name` for corporate customers | Medium | 🔴 Pending | Separate from gst_name |
| 1.1.6 | Return customer `tags/labels` if any | Low | 🔴 Pending | For segmentation |
| 1.1.7 | Return `preferred_language` | Low | 🔴 Pending | For WhatsApp template language |
| 1.1.8 | Return `gender` | Low | 🔴 Pending | For personalization |

### 1.2 Order Migration API
**Endpoint:** `POST /api/v1/vendoremployee/whatsappcrm/customer-order-migration`

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 1.2.1 | Return `delivery_address` with full details | High | 🔴 Pending | **Currently only `address_id` is returned, NOT the full address.** We need: address_line_1, address_line_2, city, state, pincode, landmark, lat/lng. (Note: Customer sync DOES return address - this is only missing in Order sync) |
| 1.2.2 | Return `feedback/rating` if given for order | Medium | 🔴 Pending | To sync order-level feedback |
| 1.2.3 | Return `points_earned` per order | Medium | 🔴 Pending | Currently we calculate, but POS should return actual |
| 1.2.4 | Return `points_redeemed` per order | Medium | 🔴 Pending | How many points used in this order |
| 1.2.5 | Return `wallet_used` per order | Medium | 🔴 Pending | Wallet amount used in order |

---

## 2. CRM Backend Changes Required

### 2.1 Customer Schema Updates

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 2.1.1 | Add `addresses` array field | High | 🔴 Pending | To store multiple addresses. Depends on POS API returning multiple addresses (1.1.1) |
| 2.1.2 | Add `f_name` and `l_name` fields | Low | 🔴 Pending | Keep `name` for display, add these for forms |
| 2.1.3 | Add `alternate_phone` field | Medium | 🔴 Pending | Secondary contact |
| 2.1.4 | Add `profile_image` field | Low | 🔴 Pending | Profile picture URL |
| 2.1.5 | Add `company_name` field | Medium | 🔴 Pending | For corporate customers |

### 2.2 Migration Sync Updates

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 2.2.1 | Update customer sync to handle multiple addresses | High | 🔴 Pending | Depends on 1.1.1 |
| 2.2.2 | Map all new fields from POS response | Medium | 🔴 Pending | After POS API updates |
| 2.2.3 | Add validation for address array | Medium | 🔴 Pending | Max addresses, required fields |

### 2.3 Address Management Endpoints (NEW)

**Prerequisite:** Complete 1.1.1 (POS returns multiple addresses) and 2.1.1 (addresses array in schema)

| # | Endpoint | Method | Priority | Status | Notes |
|---|----------|--------|----------|--------|-------|
| 2.3.1 | `/customers/{customer_id}/addresses` | GET | High | 🔴 Pending | List all addresses for customer |
| 2.3.2 | `/customers/{customer_id}/addresses` | POST | High | 🔴 Pending | Add new address |
| 2.3.3 | `/customers/{customer_id}/addresses/{address_id}` | PUT | High | 🔴 Pending | Update address |
| 2.3.4 | `/customers/{customer_id}/addresses/{address_id}` | DELETE | Medium | 🔴 Pending | Delete address |
| 2.3.5 | `/customers/{customer_id}/addresses/{address_id}/set-default` | POST | Medium | 🔴 Pending | Set as default address |

### 2.4 Customer Self-Service Endpoints (NEW)

**Purpose:** Allow customers to login with phone number and access their own data

| # | Endpoint | Method | Priority | Status | Notes |
|---|----------|--------|----------|--------|-------|
| 2.4.1 | `/customer/send-otp` | POST | High | 🟢 Completed | Send OTP to customer phone. Body: `{ "phone": "9876543210" }` |
| 2.4.2 | `/customer/verify-otp` | POST | High | 🟢 Completed | Verify OTP & return token. Body: `{ "phone": "...", "otp": "123456" }` |
| 2.4.3 | `/customer/me` | GET | High | 🟢 Completed | Get own details (requires customer token from OTP verify) |
| 2.4.4 | `/customer/me/addresses` | GET | Medium | 🔴 Pending | Get own addresses (after addresses array implemented) |
| 2.4.5 | `/customer/me/points` | GET | Medium | 🔴 Pending | Get own points balance & history |
| 2.4.6 | `/customer/me/wallet` | GET | Medium | 🔴 Pending | Get own wallet balance & history |
| 2.4.7 | `/customer/me/orders` | GET | Low | 🔴 Pending | Get own order history |

**Authentication Flow:**
```
1. Customer enters phone number
2. POST /customer/send-otp → OTP sent via WhatsApp/SMS
3. POST /customer/verify-otp → Returns customer_token
4. GET /customer/me (Header: Authorization: Bearer {customer_token})
```

**Note:** This is separate from restaurant owner authentication. Customers get limited access to their own data only.

---

## 3. API Documentation Updates

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 3.1 | Document unmapped fields from Customer Migration | High | 🟢 Completed | Added to API_DOCUMENTATION.md |
| 3.2 | Document unmapped fields from Order Migration | High | 🟢 Completed | Added to API_DOCUMENTATION.md |
| 3.3 | Update customer schema documentation | Medium | 🔴 Pending | After schema changes |

---

## 4. Future Enhancements

| # | Enhancement | Priority | Status | Notes |
|---|-------------|----------|--------|-------|
| 4.1 | Two-way sync (CRM → POS) for customer updates | Medium | 🔴 Pending | Currently one-way only |
| 4.2 | Incremental sync (only changed records) | Medium | 🔴 Pending | Currently full sync each time |
| 4.3 | Webhook for real-time customer updates from POS | High | 🔴 Pending | Instead of polling/manual sync |
| 4.4 | Conflict resolution for duplicate customers | Medium | 🔴 Pending | Same phone, different data |

---

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-03-17 | Created checklist | - |
| 2026-03-17 | Added POS API requirements for multiple addresses | - |
| 2026-03-17 | Documented unmapped fields in API docs | - |

---

## Notes

1. **Multiple Addresses Format (Proposed):**
```json
{
  "addresses": [
    {
      "id": "addr_001",
      "type": "home",
      "is_default": true,
      "address_line_1": "123 Main St",
      "address_line_2": "Apt 4B",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "country": "India",
      "landmark": "Near XYZ Mall",
      "lat": 19.0760,
      "lng": 72.8777
    },
    {
      "id": "addr_002",
      "type": "work",
      "is_default": false,
      ...
    }
  ]
}
```

2. **Dependencies:**
   - CRM changes (2.1.x, 2.2.x) depend on POS API changes (1.1.x, 1.2.x)
   - Coordinate with POS team before starting CRM updates
