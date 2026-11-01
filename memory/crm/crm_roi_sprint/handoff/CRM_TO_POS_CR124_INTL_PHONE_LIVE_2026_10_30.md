# CRM → POS — CR-124: International Phone Number Support — LIVE on preview

**To:** POS team (MyGenie POS agent)
**From:** CRM team
**Date:** 2026-10-30
**Re:** CR-124 — CRM now accepts international phone numbers with non-Indian country codes
**Status:** LIVE on CRM preview. **Owner sends; agents never send.**
**Breaking changes:** NONE. All existing Indian payloads work identically.

---

## 1. Summary

CRM now stores and matches customers with **any valid country code**, not just `+91`. Hotels serving international guests (UK, US, UAE, etc.) can now have their phone numbers stored correctly instead of being stripped or flagged invalid.

**This is 100% additive.** POS does not need to change anything. Existing Indian-number payloads produce identical results. The new capabilities activate only when POS starts sending non-`+91` country codes (your CR-473).

---

## 2. What changed on POS-facing routes

| Route | Before CR-124 | After CR-124 | Breaking? |
|---|---|---|---|
| `POST /pos/customers` | `country_code` accepted but only `"+91"` validated correctly; non-India phones flagged `phone_invalid` | **Any valid `+XX` accepted.** Non-India: 6-15 digits valid. India (`+91`): unchanged (10 digits, starts 6-9). | **NO** |
| `PUT /pos/customers/{id}` | Same | Same improvement | **NO** |
| `POST /pos/customer-lookup` | International phones often not found (mangled on storage) | International phones found by correct `{phone, country_code}` match | **NO** |
| `POST /pos/orders` (`cust_mobile`) | `"+447911123456"` → stripped to junk digits → guest order or flagged customer | **Auto-detects** `cc="+44"`, `phone="7911123456"` → links/creates customer correctly. Indian `"9876543210"` unchanged. | **NO** |
| `POST /pos/webhook/payment-received` | Same stripping issue | Same auto-detection fix | **NO** |
| `GET /pos/customers/search` | Partial search on `phone` field | Unchanged — partial search works on stored digits | **NO** |
| `POST /pos/trigger-event` | Fallback customer data had hardcoded `country_code: "+91"` | Uses detected cc from phone | **NO** |

**Response shapes:** Unchanged. `country_code` field was already present in all customer responses — it now correctly reflects the stored value instead of always being `"+91"`.

---

## 3. New capability — international phone examples

### 3.1 Create international customer
```
POST /api/pos/customers
X-API-Key: <api_key>
Content-Type: application/json

{
    "name": "John Smith",
    "phone": "7911123456",
    "country_code": "+44",
    "restaurant_id": "689"
}
```
Response:
```json
{
    "success": true,
    "message": "Customer created successfully",
    "data": {
        "customer_id": "<uuid>",
        "name": "John Smith",
        "phone": "7911123456",
        "created_at": "2026-10-30T..."
    }
}
```
Stored: `phone: "7911123456"`, `country_code: "+44"` ✅

### 3.2 Lookup international customer
```
POST /api/pos/customer-lookup
X-API-Key: <api_key>
Content-Type: application/json

{ "phone": "7911123456" }
```
With `country_code: "+44"` stored, the customer is found. ✅

### 3.3 Order with raw E.164 phone (auto-detection)
```
POST /api/pos/orders
X-API-Key: <api_key>
Content-Type: application/json

{
    "cust_mobile": "+447911123456",
    "order_amount": 1500.0,
    "restaurant_id": "689",
    "order_id": "ORD-12345",
    ...
}
```
CRM auto-detects: `cc="+44"`, `phone="7911123456"` → links to existing UK customer or creates new. ✅

### 3.4 Indian phone — unchanged
```
POST /api/pos/orders
{ "cust_mobile": "9876543210", ... }
```
Same as before: `cc="+91"`, `phone="9876543210"` ✅

---

## 4. Phone validation rules (updated)

| Country code | Phone digits | Validation |
|---|---|---|
| `+91` (India) | Exactly 10 digits, must start with 6/7/8/9, not all-same digits | **Unchanged from CR-085** |
| Any other (`+44`, `+1`, `+971`, etc.) | 6-15 digits | **NEW — relaxed for international** |
| Junk phone with `+91` | `0000000000`, `1234567890`, etc. | Still flagged `phone_invalid: true` — **unchanged** |

### Known country code auto-detection (raw E.164 without explicit `country_code` param)
CRM recognizes 22 prefixes: `+1, +7, +27, +33, +34, +39, +44, +49, +61, +62, +65, +66, +81, +82, +86, +91, +234, +254, +353, +852, +966, +971`

For unlisted prefixes, CRM uses best-effort regex detection. **Recommendation:** always send `country_code` as a separate field when you have it — this is always correct regardless of prefix list.

---

## 5. Validation on preview

**No validation required from POS** — these are additive changes. But if you'd like to confirm:

| # | Action | Expected |
|---|---|---|
| P1 | `POST /pos/customers` with `phone: "7911123456", country_code: "+44"` | `success: true`, stored `cc: "+44"` |
| P2 | `POST /pos/customer-lookup` with `phone: "7911123456"` | `registered: true`, customer found |
| P3 | `POST /pos/orders` with `cust_mobile: "+447911123456"` | Links to P1 customer, `guest_order: false` |
| P4 | `POST /pos/orders` with `cust_mobile: "9876543210"` | **Unchanged** — Indian customer, full loyalty |
| P5 | `POST /pos/customers` with `phone: "0000000000", country_code: "+91"` | Flagged `phone_invalid: true` — **unchanged** |

---

## 6. Recommendation for POS (CR-473)

When POS frontend ships CR-473 (international phone inputs):
- Send `country_code` as a separate field on `POST /pos/customers` and `PUT /pos/customers/{id}`
- For `POST /pos/orders`, you can either: (a) send `cust_mobile` with `+` prefix (E.164 raw — CRM auto-detects), or (b) add a `country_code` field to the order payload (CRM already reads it if present)
- **Option (b) is preferred** — explicit cc is always more reliable than auto-detection

---

## 7. Related CRs
- **CR-085** (canonical phone, 2026-10-09) — foundation; CR-124 extends it
- **CR-473** (POS frontend international inputs) — your side; CRM is now ready to receive
- **BACKEND_BRIEF_INTL_PHONE_2026_10_24** — the original brief that triggered CR-124
