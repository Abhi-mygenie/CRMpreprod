# MyGenie CRM - Customer Schema Migration Workbook

> **Purpose**: Mapping existing customer fields to new schema for migration planning
> **Date**: Feb 2026
> **Total Existing Fields**: 35 | **Total New Fields**: ~78

---

## EXISTING FIELDS IN DATABASE

```
_id, address, allergies, anniversary, city, country_code, created_at,
custom_field_1, custom_field_2, custom_field_3, customer_type, dob,
email, favorites, gst_name, gst_number, id, last_synced_at, last_visit,
mygenie_synced, name, notes, phone, pincode, pos_customer_id, tier,
total_points, total_points_earned, total_points_redeemed, total_spent,
total_visits, total_wallet_deposit, user_id, wallet_balance, wallet_used
```

---

## SECTION 1: Basic Information

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Name | `name` | ✅ Mapped | - |
| Phone Number | `phone` | ✅ Mapped | - |
| Email | `email` | ✅ Mapped | - |
| Gender | - | 🆕 Add | - |
| Date of Birth | `dob` | ✅ Mapped | - |
| Anniversary | `anniversary` | ✅ Mapped | - |
| Preferred Language | - | 🆕 Add | - |
| Customer Type | `customer_type` | ✅ Mapped | 'normal'/'corporate' |
| Customer Segment Tag | - | 🆕 Add | Link to segments collection |
| Custom Field 1 | `custom_field_1` | ✅ Keep | Flexible user-defined field |
| Custom Field 2 | `custom_field_2` | ✅ Keep | Flexible user-defined field |
| Custom Field 3 | `custom_field_3` | ✅ Keep | Flexible user-defined field |

---

## SECTION 2: Contact & Marketing Permissions

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| WhatsApp Opt-in Status | - | 🆕 Add | boolean |
| WhatsApp Opt-in Date | - | 🆕 Add | datetime |
| Promo WhatsApp Allowed | - | 🆕 Add | boolean |
| Promo SMS Allowed | - | 🆕 Add | boolean |
| Email Marketing Allowed | - | 🆕 Add | boolean |
| Call Allowed | - | 🆕 Add | boolean |
| Blocked Status | - | 🆕 Add | boolean |

---

## SECTION 3: Loyalty Information

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Loyalty Points Balance | `total_points` | ✅ Mapped | - |
| Points Earned (Lifetime) | `total_points_earned` | ✅ Mapped | - |
| Points Redeemed (Lifetime) | `total_points_redeemed` | ✅ Mapped | - |
| Loyalty Tier | `tier` | ✅ Mapped | Bronze/Silver/Gold/Platinum |
| Wallet Balance | `wallet_balance` | ✅ Mapped | - |
| Total Wallet Deposit | `total_wallet_deposit` | ✅ Mapped | - |
| Wallet Used | `wallet_used` | ✅ Mapped | - |
| Referral Code | - | 🆕 Add | - |
| Referred By | - | 🆕 Add | customer_id reference |
| Membership ID | - | 🆕 Add | - |
| Membership Expiry Date | - | 🆕 Add | datetime |

---

## SECTION 4: Spending & Visit Behaviour (Auto from POS)

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Total Visits | `total_visits` | ✅ Mapped | - |
| Total Spend | `total_spent` | ✅ Mapped | - |
| Average Order Value | - | 🆕 Add | Calculate: total_spent/total_visits |
| Last Visit Date | `last_visit` | ✅ Mapped | - |
| First Visit Date | `created_at` | ✅ Mapped | Use created_at |
| Favorite Item | `favorites` | ⚠️ Restructure | May need array format |
| Favorite Category | - | 🆕 Add | - |
| Preferred Payment Mode | - | 🆕 Add | Cash/Card/UPI/etc. |

---

## SECTION 5: Dining Preferences

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Preferred Dining Type | - | 🆕 Add | Dine-In/Takeaway/Delivery |
| Preferred Time Slot | - | 🆕 Add | - |
| Favorite Table/Section | - | 🆕 Add | - |
| Average Party Size | - | 🆕 Add | integer |
| Diet Preference | - | 🆕 Add | Veg/Non-Veg/Vegan/Jain/Eggetarian |
| Spice Level Preference | - | 🆕 Add | Mild/Medium/Spicy/Extra Spicy |
| Cuisine Preference | - | 🆕 Add | - |
| Allergies | `allergies` | ✅ Mapped | - |

---

## SECTION 6: Address & Location

> **UPDATE (Apr 2026):** Single address fields (`address`, `city`, `pincode`, etc.) have been replaced by an `addresses[]` array on the Customer schema. Each address object contains: id, pos_address_id, is_default, address_type, address, house, floor, road, city, state, pincode, country, latitude, longitude, contact_person_name, contact_person_number, delivery_instructions, zone_id. Address CRUD endpoints available at `/customers/{id}/addresses`.

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| addresses[] | `address`, `city`, `pincode` | 🟢 **Migrated** | Array replaces flat fields. Full CRUD API available. Frontend Addresses tab on detail page. |
| Address Line 2 | - | 🟢 In addresses[] | Part of address object |
| State | - | 🟢 In addresses[] | Part of address object |
| Country | - | 🟢 In addresses[] | Part of address object (default: India) |
| Country Code | `country_code` | ✅ Mapped | +91, +1, etc. (on customer, not address) |
| Delivery Instructions | - | 🟢 In addresses[] | Per-address delivery notes |
| Latitude/Longitude | - | 🟢 In addresses[] | Per-address GPS coordinates |
| Contact Person | - | 🟢 In addresses[] | Per-address contact name & number |

---

## SECTION 7: Corporate Information

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Company Name | `gst_name` | ⚠️ Rename | Rename to company_name |
| GST Number | `gst_number` | ✅ Mapped | - |
| Billing Address | - | 🆕 Add | - |
| Credit Limit | - | 🆕 Add | decimal |
| Payment Terms | - | 🆕 Add | Net 30/Net 60/etc. |
| Department/Table | - | 🆕 Add | - |

---

## SECTION 8: Customer Source & Journey

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Lead Source | - | 🆕 Add | Walk-in/Swiggy/Zomato/Instagram/Referral/Airbnb |
| Campaign Source | - | 🆕 Add | UTM tracking |
| First Contact Date | `created_at` | ✅ Mapped | - |
| Last Interaction Date | - | 🆕 Add | datetime |
| Assigned Salesperson | - | 🆕 Add | staff_id reference |

---

## SECTION 9: WhatsApp CRM Tracking

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Last WhatsApp Message Sent | - | 🆕 Add | datetime |
| Last WhatsApp Response | - | 🆕 Add | datetime |
| Last Campaign Clicked | - | 🆕 Add | campaign_id reference |
| Last Coupon Used | - | 🆕 Add | coupon_id reference |
| Automation Status Tag | - | 🆕 Add | Link to automation_rules |

---

## SECTION 10: Special Occasions

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Kids Birthday | - | 🆕 Add | array of dates |
| Spouse Name | - | 🆕 Add | - |
| Festival Preference | - | 🆕 Add | Diwali/Eid/Christmas/etc. |
| Special Dates | - | 🆕 Add | array of {date, label} |

---

## SECTION 11: Feedback & Flags

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Last Rating | - | 🆕 Add | 1-5 stars |
| NPS Score | - | 🆕 Add | -100 to 100 |
| Complaint Flag | - | 🆕 Add | boolean |
| VIP Flag | - | 🆕 Add | boolean |
| Blacklist Flag | - | 🆕 Add | boolean |
| Internal Notes | `notes` | ✅ Mapped | - |

---

## SECTION 12: AI/Advanced (MyGenie CRM Differentiator)

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| Predicted Next Visit Date | - | 🆕 Add | datetime |
| Churn Risk Score | - | 🆕 Add | 0-100 |
| Recommended Offer Type | - | 🆕 Add | Discount/Freebie/Points/etc. |
| Price Sensitivity Score | - | 🆕 Add | Low/Medium/High |

---

## SECTION 13: System Fields

| New Field | Existing Field | Status | Notes |
|-----------|---------------|--------|-------|
| _id | `_id` | ✅ Mapped | MongoDB ObjectId |
| id | `id` | ✅ Mapped | Custom customer ID |
| user_id | `user_id` | ✅ Mapped | Restaurant/User reference |
| pos_customer_id | `pos_customer_id` | ✅ Mapped | POS system customer ID (bridge between our DB and POS API) |
| mygenie_synced | `mygenie_synced` | ✅ Mapped | Sync status boolean |
| last_synced_at | `last_synced_at` | ✅ Mapped | datetime |
| created_at | `created_at` | ✅ Mapped | datetime |
| updated_at | - | 🆕 Add | datetime |

---

## MIGRATION SUMMARY

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Mapped | 28 | Direct mapping, no change needed |
| ⚠️ Restructure | 2 | `favorites`, `gst_name` need minor changes |
| 🆕 Add | ~50 | New fields to add |

---

## MIGRATION PHASES

### Phase 1: Non-Breaking Additions
Add new fields with `null` defaults - zero impact on existing data/code

**Fields to add:**
- Basic: gender, preferred_language, segment_tag
- Contact Permissions: all 7 fields
- Loyalty: referral_code, referred_by, membership_id, membership_expiry
- Behaviour: avg_order_value, favorite_category, preferred_payment_mode

### Phase 2: Address & Corporate Expansion
- Address: address_line_2, state, country, delivery_instructions, map_location
- Corporate: billing_address, credit_limit, payment_terms, department

### Phase 3: Journey & WhatsApp CRM
- Journey: lead_source, campaign_source, last_interaction_date, assigned_salesperson
- WhatsApp: all 5 tracking fields

### Phase 4: Preferences & Occasions
- Dining: all 7 preference fields
- Occasions: all 4 fields

### Phase 5: Feedback, Flags & AI
- Feedback: last_rating, nps_score, complaint_flag, vip_flag, blacklist_flag
- AI: all 4 advanced fields

### Phase 6: Cleanup & Restructure
- Rename `gst_name` → `company_name`
- Restructure `favorites` to array format if needed
- Add `updated_at` timestamp

---

## NOTES

1. **custom_field_1/2/3** - Retained in Basic Information for user flexibility
2. All new fields should default to `null` to avoid breaking existing records
3. Consider indexing: phone, email, user_id, tier, lead_source, created_at
4. WhatsApp CRM tracking enables powerful automation features
5. AI fields are for future ML/prediction capabilities

---

## RELATED COLLECTIONS

| Collection | Purpose |
|------------|---------|
| `users` | Restaurant owners (user_id reference) |
| `segments` | Customer segmentation rules |
| `feedback` | Detailed feedback records |
| `points_transactions` | Points history |
| `wallet_transactions` | Wallet history |
| `coupons` | Coupon definitions |
| `automation_rules` | WhatsApp automation rules |
| `whatsapp_templates` | Message templates |

