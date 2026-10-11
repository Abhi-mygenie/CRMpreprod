# CR-030 — Freshmarketer Webhook Endpoint
## Discovery Document

> **CR ID**: CR-030
> **Registered**: 2026-06-26
> **Status**: 📋 Registered — discovery in progress
> **Owner**: Abhishek
> **Related CRs**: CR-DIRECT-SEND (POST /api/pos/send — already implemented)

---

## 1. Problem Statement

The external system (Freshmarketer / Freshworks CRM) sends WhatsApp trigger webhooks in a
**nested envelope format**. Our existing `POST /api/pos/send` endpoint expects a **flat JSON**
at root level and cannot parse the Freshmarketer envelope.

---

## 2. Actual Webhook Payload (as provided by owner)

```json
{
  "Headers": {
    "X-API-Key": "dp_live_uoGGN5EdxQJ8x6TogPmAPyA0Dd8epYJDD0JDl59zZ6Q",
    "Content-Type": "application/json;charset=UTF-8"
  },
  "Body": {
    "event_type": "List",
    "data": {
      "contact": {
        "country": "test_contact_country",
        "address": "test_contact_address",
        "city": "test_contact_city",
        "facebook": "https://www.facebook.com/test_contact/",
        "mobile": "1234567890",
        "last_name": "test_contact_lname",
        "linkedin": "https://www.linkedin.com/in/test_contact/",
        "middle_name": "test_contact_mname",
        "time_zone": "test_contact_timezone",
        "zipcode": "123456",
        "twitter": "https://twitter.com/test_contact/",
        "phone": "1234567890",
        "company": "test_contact_company",
        "state": "test_contact_state",
        "first_name": "test_contact_fname",
        "email": "testuser@freshmarketer.com"
      },
      "event_details": {
        "list_id": "100",
        "contact_id": "200"
      },
      "custom_data": {
        "country_code": 91,
        "name": "Parth",
        "mobile": 7602832329,
        "template_id": "64da2a07-7a73-49a9-8e0c-7b7545623215"
      }
    },
    "id": "812db6e0-6595-4212-9748-a61728ed9096",
    "event": "list.add_contact",
    "event_category": "system",
    "event_time": 1782486954495
  }
}
```

---

## 3. Key Observations

### 3.1 Payload Structure
| Block | Purpose |
|---|---|
| `Body.data.contact` | Standard Freshmarketer contact record |
| `Body.data.event_details` | Event-specific IDs (list_id, contact_id) |
| `Body.data.custom_data` | **Our parameters** — mobile, country_code, template_id, variable label fields |
| `Body.event`, `Body.event_type` | Event classification metadata |
| `Body.id`, `Body.event_time` | Webhook envelope metadata (idempotency, ordering) |

### 3.2 Our Parameters Live in `custom_data`
```json
"custom_data": {
  "country_code": 91,           ← integer (not string)
  "mobile": 7602832329,         ← integer (not string)
  "template_id": "64da2a07-...",
  "name": "Parth"               ← variable label fields
}
```

### 3.3 `mobile` appears in two places
- `data.contact.mobile` → standard Freshmarketer contact field (string)
- `data.custom_data.mobile` → our field (integer) — **`custom_data` takes priority**

### 3.4 Type differences vs `/api/pos/send`
| Field | `/api/pos/send` expects | Freshmarketer sends |
|---|---|---|
| `mobile` | string | integer in `custom_data` |
| `country_code` | string | integer in `custom_data` |
| `template_id` | string | string (fine) |

---

## 4. Gap Analysis

| Gap | Description |
|---|---|
| G1 | `/api/pos/send` cannot parse nested `data.custom_data` |
| G2 | `mobile` and `country_code` arrive as integers — need coercion to string |
| G3 | No raw webhook audit log exists today |
| G4 | No idempotency check on `Body.id` (duplicate webhook protection) |

---

## 5. Proposed Solution — Option B (Dedicated Endpoint)

**New endpoint**: `POST /api/pos/webhook`

- Auth: `X-API-Key` header (same as `/api/pos/send`)
- Accepts full Freshmarketer envelope
- Extracts `Body.data.custom_data` for our parameters
- Coerces `mobile` and `country_code` to strings
- Falls back to `Body.data.contact.*` fields if `custom_data` fields missing
- Logs full raw webhook body to a new `webhook_logs` collection (or existing `pos_event_logs`)
- Reuses the same send logic as `/api/pos/send` (no duplication)
- Returns same `POSResponse` format

---

## 6. Files That Will Be Touched

| File | Change |
|---|---|
| `routers/pos.py` | Add `POST /webhook` endpoint + `WebhookPayload` Pydantic model |
| `models/schemas.py` | Optionally add `FreshmarketerWebhookBody` model |
| DB | Log to `pos_event_logs` or new `webhook_logs` collection |

**High-risk files touched**: `routers/pos.py` (2929 LOC — Section 8 high-risk)
**Regression required**: Full POS order flow + coupon validate/apply

---

## 7. Open Questions for Planning

- Q1: Should duplicate webhooks (same `Body.id`) be silently ignored or return a 200 with `"already_processed"`?
- Q2: Log to existing `pos_event_logs` or new `webhook_logs` collection?
- Q3: Should `Body.data.contact` fields be used as fallback (e.g. `contact.first_name` → `name` if not in `custom_data`)?
- Q4: Should other `event_type` values (e.g. `list.remove_contact`) be handled or rejected with a clear error?
