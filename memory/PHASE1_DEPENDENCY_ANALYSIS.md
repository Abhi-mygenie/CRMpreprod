# MyGenie CRM - Phase 1 Schema Migration: Dependency Analysis

> **Purpose**: Map all dependencies before adding new fields to customer schema
> **Date**: Feb 2026

---

## 📁 FILES AFFECTED BY CUSTOMER SCHEMA

### Backend Files
| File | Impact | Changes Needed |
|------|--------|----------------|
| `/app/backend/models/schemas.py` | **HIGH** | Add new fields to `CustomerBase`, `CustomerCreate`, `CustomerUpdate`, `Customer` models |
| `/app/backend/routers/customers.py` | **MEDIUM** | Update create/update logic for new fields |
| `/app/backend/routers/pos.py` | **MEDIUM** | Update `POSCustomerCreate`, `POSCustomerUpdate`, auto-create logic |
| `/app/backend/scripts/import_db.py` | **LOW** | No change needed (handles any fields) |
| `/app/backend/scripts/export_db.py` | **LOW** | No change needed (exports all fields) |

### Frontend Files
| File | Impact | Changes Needed |
|------|--------|----------------|
| `/app/frontend/src/App.js` | **HIGH** | Update customer form, filters, display |
| `/app/frontend/src/lib/constants.js` | **LOW** | Add new constants (gender options, lead sources, etc.) |

---

## 🔍 DETAILED DEPENDENCY MAP

### 1. Pydantic Models (`/app/backend/models/schemas.py`)

**CustomerBase (lines 34-52)** - Base fields for create/update:
```python
# CURRENT FIELDS
name, phone, country_code, email, notes, dob, anniversary,
customer_type, gst_name, gst_number, address, city, pincode,
allergies, custom_field_1, custom_field_2, custom_field_3, favorites
```

**Customer (lines 77-108)** - Full response model:
```python
# CURRENT FIELDS (adds to CustomerBase)
id, user_id, total_points, wallet_balance, total_visits,
total_spent, tier, created_at, last_visit, pos_customer_id, mygenie_synced
```

### 2. Customer Router (`/app/backend/routers/customers.py`)

**Create Customer (line 148)**: Maps `CustomerCreate` → DB document
**Update Customer (line 424)**: Uses `CustomerUpdate.model_dump()`
**MyGenie Sync (line 19)**: Maps MyGenie fields → our schema
**QR Register (line 529)**: Creates customer without auth

### 3. POS Router (`/app/backend/routers/pos.py`)

**POSCustomerCreate (line 35)**: Full customer creation schema
**POSCustomerUpdate (line 76)**: Partial update schema
**Auto-create in order webhook (line 402)**: Creates minimal customer

### 4. Frontend (`/app/frontend/src/App.js`)

**newCustomer state (line 666-677)**:
```javascript
{
  name: "", phone: "", email: "", notes: "",
  dob: "", anniversary: "", customer_type: "normal",
  gst_name: "", gst_number: "", address: "", city: "", pincode: "",
  allergies: [], custom_field_1: "", custom_field_2: "", custom_field_3: ""
}
```

**Customer filters (line 654)**:
```javascript
{ search: "", tier: "all", customer_type: "all", city: "" }
```

---

## 📋 PHASE 1 FIELDS TO ADD

### Section 1: Basic Information (3 new fields)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `gender` | Optional[str] | None | "male", "female", "other", "prefer_not_to_say" |
| `preferred_language` | Optional[str] | None | "en", "hi", "regional" |
| `segment_tags` | Optional[List[str]] | [] | Array of segment IDs |

### Section 2: Contact & Marketing Permissions (7 new fields)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `whatsapp_opt_in` | bool | False | - |
| `whatsapp_opt_in_date` | Optional[str] | None | ISO datetime |
| `promo_whatsapp_allowed` | bool | True | - |
| `promo_sms_allowed` | bool | True | - |
| `email_marketing_allowed` | bool | True | - |
| `call_allowed` | bool | True | - |
| `is_blocked` | bool | False | - |

### Section 3: Loyalty (4 new fields)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `referral_code` | Optional[str] | None | Unique code |
| `referred_by` | Optional[str] | None | customer_id |
| `membership_id` | Optional[str] | None | External membership |
| `membership_expiry` | Optional[str] | None | ISO datetime |

### Section 4: Behavior (3 new fields)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `avg_order_value` | float | 0.0 | Calculated |
| `favorite_category` | Optional[str] | None | - |
| `preferred_payment_mode` | Optional[str] | None | "cash", "card", "upi" |

---

## 🚀 IMPLEMENTATION STEPS

### Step 1: Update Backend Models (`schemas.py`)

```
1.1 Add new Optional fields to CustomerBase
1.2 Add new Optional fields to Customer response model
1.3 Add new Optional fields to CustomerUpdate
```

### Step 2: Update Customer Router (`customers.py`)

```
2.1 Update create_customer() to include new fields with defaults
2.2 Update register_via_qr() to include new fields with defaults
2.3 Verify update_customer() handles new fields (should work with model_dump)
2.4 Update sync_customers_from_mygenie() if applicable
```

### Step 3: Update POS Router (`pos.py`)

```
3.1 Add new fields to POSCustomerCreate (Optional)
3.2 Add new fields to POSCustomerUpdate (Optional)
3.3 Update auto-create logic in _find_or_create_customer()
3.4 Update pos_payment_received() auto-create logic
```

### Step 4: Update Frontend (`App.js`)

```
4.1 Add new fields to newCustomer state with defaults
4.2 Add new input fields to customer form (if needed in Phase 1)
4.3 Add new filter options (if needed in Phase 1)
4.4 Update customer display to show new fields
```

### Step 5: Test & Verify

```
5.1 Test create customer with new fields
5.2 Test update customer with new fields
5.3 Test POS create/update endpoints
5.4 Verify existing customers still work (backward compatible)
```

---

## ⚠️ RISKS & MITIGATIONS

| Risk | Mitigation |
|------|------------|
| Existing data missing new fields | All new fields have `Optional` type with `None`/`False`/`0.0` defaults |
| API breaking changes | New fields are additive, not modifying existing ones |
| Frontend form too complex | Add new fields in UI gradually, backend ready first |
| MyGenie sync issues | New fields won't affect sync (only mapped fields used) |

---

## ✅ BACKWARD COMPATIBILITY CHECKLIST

- [x] All new fields are `Optional`
- [x] All new fields have sensible defaults
- [x] No existing field names changed
- [x] No existing field types changed
- [x] API response structure unchanged (additive only)
- [x] Existing queries won't break

---

## 📊 SUMMARY

| Category | Count |
|----------|-------|
| **New fields (Phase 1)** | 17 |
| **Files to modify** | 4 |
| **Breaking changes** | 0 |
| **Risk level** | LOW |

**Ready to proceed with implementation?**

---

## ✅ PHASE 1 IMPLEMENTATION STATUS

| Step | File | Status | Notes |
|------|------|--------|-------|
| 1 | `/app/backend/models/schemas.py` | ✅ Complete | Added 17 new fields to CustomerBase, CustomerUpdate, Customer |
| 2 | `/app/backend/routers/customers.py` | ✅ Complete | Updated create, QR register, and update logic |
| 3 | `/app/backend/routers/pos.py` | ✅ Complete | Updated POS schemas and auto-create logic |
| 4 | `/app/frontend/src/App.js` | ✅ Complete | Updated state for newCustomer, resetForm, editData |

### Backward Compatibility Verified
- ✅ Backend health check passing
- ✅ Frontend compiles without errors
- ✅ Existing customers load correctly (Pydantic handles missing fields with defaults)
- ✅ New customers will have all new fields populated

### Next Steps (Roadmap)
- Orders list/detail view per customer (with delivery_address display)
- Top items display per customer
- Order notes view
- City filter to search within addresses array
- Address fields on QR registration page
- WhatsApp campaign integration
- Advanced analytics/AI insights

---

## ✅ PHASE 2 IMPLEMENTATION STATUS

| Step | File | Status | Notes |
|------|------|--------|-------|
| 2.1 | `/app/backend/models/schemas.py` | ✅ Complete | Added 8 fields to CustomerBase, CustomerUpdate, Customer |
| 2.2 | `/app/backend/routers/customers.py` | ✅ Complete | Updated create and QR register |
| 2.3 | `/app/backend/routers/pos.py` | ✅ Complete | Updated POS schemas and 3 auto-create locations |
| 2.4 | `/app/frontend/src/App.js` | ✅ Complete | Updated state, resetForm, editData |

### Phase 2 Fields Added (8 total)
- **Corporate**: `billing_address`, `credit_limit`, `payment_terms`
- **Address**: `address_line_2`, `state`, `country`, `delivery_instructions`, `map_location`

### Running Total
- Phase 1: 17 fields
- Phase 2: 8 fields
- **Total new fields: 25**
