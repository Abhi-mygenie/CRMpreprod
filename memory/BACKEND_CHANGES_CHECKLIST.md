# Backend Team - Changes Required Checklist

**Created:** 2026-03-17  
**Last Updated:** 2026-04-13

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
| 1.1.1 | Return **multiple addresses** per customer | High | 🟢 **Completed** | POS returns `customer_addresses[]` array with full details (id, address, city, pincode, house, floor, road, lat/lng, contact_person, zone_id) |
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
| 1.2.1 | Return `delivery_address` with full details | High | 🟢 **Completed** | POS already returns full `delivery_address` object for delivery orders (verified Apr 2026). Fields: contact_person_name, contact_person_number, address_type, address, pincode, house, floor, road, lat, lng. CRM migration.py now captures this. |
| 1.2.2 | Return `feedback/rating` if given for order | Medium | 🔴 Pending | To sync order-level feedback |
| 1.2.3 | Return `points_earned` per order | Medium | 🔴 Pending | Currently we calculate, but POS should return actual |
| 1.2.4 | Return `points_redeemed` per order | Medium | 🔴 Pending | How many points used in this order |
| 1.2.5 | Return `wallet_used` per order | Medium | 🔴 Pending | Wallet amount used in order |

---

## 2. CRM Backend Changes Required

### 2.1 Customer Schema Updates

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 2.1.1 | Add `addresses` array field | High | 🟢 **Completed** | Added to Customer schema, migration sync, and all APIs |
| 2.1.2 | Add `f_name` and `l_name` fields | Low | 🔴 Pending | Keep `name` for display, add these for forms |
| 2.1.3 | Add `alternate_phone` field | Medium | 🔴 Pending | Secondary contact |
| 2.1.4 | Add `profile_image` field | Low | 🔴 Pending | Profile picture URL |
| 2.1.5 | Add `company_name` field | Medium | 🔴 Pending | For corporate customers |

### 2.2 Migration Sync Updates

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 2.2.1 | Update customer sync to handle multiple addresses | High | 🟢 **Completed** | Maps `customer_addresses[]` → `addresses[]` |
| 2.2.2 | Map all new fields from POS response | Medium | 🔴 Pending | After POS API updates |
| 2.2.3 | Add validation for address array | Medium | 🟢 **Completed** | Validation in address_utils.py |

### 2.3 Address Management Endpoints (NEW)

**Prerequisite:** ✅ Complete

| # | Endpoint | Method | Priority | Status | Notes |
|---|----------|--------|----------|--------|-------|
| 2.3.1 | `/customers/{customer_id}/addresses` | GET | High | 🟢 **Completed** | List all addresses for customer |
| 2.3.2 | `/customers/{customer_id}/addresses` | POST | High | 🟢 **Completed** | Add new address |
| 2.3.3 | `/customers/{customer_id}/addresses/{address_id}` | PUT | High | 🟢 **Completed** | Update address |
| 2.3.4 | `/customers/{customer_id}/addresses/{address_id}` | DELETE | Medium | 🟢 **Completed** | Delete address |
| 2.3.5 | `/customers/{customer_id}/addresses/{address_id}/set-default` | POST | Medium | 🟢 **Completed** | Set as default address |

### 2.4 Customer Self-Service Endpoints (NEW)

**Purpose:** Allow customers to login with phone number and access their own data

| # | Endpoint | Method | Priority | Status | Notes |
|---|----------|--------|----------|--------|-------|
| 2.4.1 | `/customer/send-otp` | POST | High | 🟢 **Completed** | Requires `user_id` (restaurant). Body: `{ "phone": "...", "user_id": "..." }` |
| 2.4.2 | `/customer/verify-otp` | POST | High | 🟢 **Completed** | Requires `user_id`. Returns token + full customer with `addresses[]` |
| 2.4.3 | `/customer/me` | GET | High | 🟢 **Completed** | Returns customer with `addresses[]`. Scoped by restaurant in token |
| 2.4.4 | `/customer/me/addresses` | GET | Medium | 🟢 **Completed** | Returns `{ customer_id, addresses[], total }` |
| 2.4.5 | `/customer/me/addresses` | POST | Medium | 🟢 **Completed** | Add new address. First address auto-default. |
| 2.4.6 | `/customer/me/addresses/{id}` | PUT | Medium | 🟢 **Completed** | Update existing address |
| 2.4.7 | `/customer/me/addresses/{id}` | DELETE | Medium | 🟢 **Completed** | Delete address. Reassigns default if needed. |
| 2.4.8 | `/customer/me/addresses/{id}/set-default` | POST | Medium | 🟢 **Completed** | Set default delivery address |
| 2.4.9 | `/customer/me/points` | GET | Medium | 🟢 **Completed** | Returns points balance, tier, earned/redeemed totals, expiring info, transaction history |
| 2.4.10 | `/customer/me/wallet` | GET | Medium | 🟢 **Completed** | Returns wallet balance, received/used totals, transaction history |
| 2.4.11 | `/customer/me/orders` | GET | Low | 🟢 **Completed** | Returns paginated order history with items, delivery_address, coupon, points earned |

**Authentication Flow:**
```
1. Customer provides phone + user_id (restaurant_id)
2. POST /customer/send-otp → OTP sent, validates restaurant exists
3. POST /customer/verify-otp → Returns customer_token (contains user_id) + FULL customer details with addresses[]
4. GET /customer/me → Same full details (optional, for refresh)
```

**Important:** All customer self-service endpoints are SCOPED BY RESTAURANT. `user_id` is required in OTP flow and embedded in token.

---

### 2.5 POS Gateway Updates

| # | Change Required | Priority | Status | Notes |
|---|-----------------|----------|--------|-------|
| 2.5.1 | POST /pos/customers accepts `addresses[]` | High | 🟢 **Completed** | Removed single address fields |
| 2.5.2 | PUT /pos/customers accepts `addresses[]` | High | 🟢 **Completed** | Replaces existing addresses |
| 2.5.3 | Response includes `addresses[]` | High | 🟢 **Completed** | Full addresses in response |

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
| 2026-04-11 | Added Address Management Endpoints (2.3.x) | - |
| 2026-04-11 | Added Customer Self-Service Endpoints (2.4.x) | - |
| 2026-04-11 | Completed 2.4.1, 2.4.2, 2.4.3 (OTP & /me endpoints) | - |
| 2026-04-11 | Updated verify-otp to return full customer details | - |
| 2026-04-13 | Frontend Address CRUD: Addresses tab on CustomerDetailPage, Add/Edit modals use addresses API | - |
| 2026-04-13 | CustomersPage Add/Edit modals updated for addresses array | - |
| 2026-04-13 | Verified POS Order API returns full delivery_address (not just address_id) — updated 1.2.1 to Completed | - |
| 2026-04-13 | Fixed migration.py to capture delivery_address from POS order sync | - |
| 2026-04-13 | Fixed address list endpoint projection bug (false 404 for customers without addresses) | - |
| 2026-04-13 | Full smoke test passed: Backend 22/22, Frontend 15+ pages — all green | - |

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
