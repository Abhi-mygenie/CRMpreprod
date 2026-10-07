# CR-030 — Freshmarketer Webhook Endpoint
## Implementation Plan

> **CR ID**: CR-030
> **Status**: 🔵 Planning approved
> **Discovery**: `discovery/CR_030_FRESHMARKETER_WEBHOOK_ENDPOINT_DISCOVERY.md`
> **Effort**: ~2.5 hours
> **Planned date**: 2026-06-26

---

## A. New Endpoint

**Route**: `POST /api/pos/webhook`
**Auth**: `X-API-Key` header (same as DirectSend)
**File**: `/app/backend/routers/pos.py`

---

## B. Pydantic Models (insert after DirectSendRequest)

7 nested models (bottom-up):
1. `FreshmarketerCustomData` — `mobile`, `country_code`, `template_id` + `extra='allow'` for variable label fields
2. `FreshmarketerContact` — `mobile`, `phone`, `first_name`, `last_name`, `email` — `extra='ignore'`
3. `FreshmarketerEventDetails` — `list_id`, `contact_id`
4. `FreshmarketerData` — wraps contact, event_details, custom_data
5. `FreshmarketerBody` — `event_type`, `event`, `event_category`, `event_time`, `id`, `data`
6. `FreshmarketerHeaders` — informational only
7. `FreshmarketerWebhookPayload` — top-level: `Headers` (optional) + `Body`

---

## C. Extraction Logic

**Priority order**: `custom_data` → `contact` → defaults

| Field | Source 1 | Source 2 | Default |
|---|---|---|---|
| `mobile` | `custom_data.mobile` | `contact.mobile` or `contact.phone` | REQUIRED — fail |
| `country_code` | `custom_data.country_code` | — | `"91"` |
| `template_id` | `custom_data.template_id` | — | REQUIRED — fail |
| `name` | `custom_data.model_extra["name"]` | `contact.first_name + last_name` | `""` |
| other vars | `custom_data.model_extra.*` | — | `""` |

**Type coercion**:
- `mobile`: `str(int_or_str).strip()`
- `country_code`: `str(val).strip().replace("+", "")`
- variable label values: `str(val)` for all

---

## D. Idempotency

- Key: `Body.id` (Freshmarketer's webhook unique ID)
- Collection: `webhook_logs` (new)
- On duplicate: return 200 `{"status": "replayed", "original_message_id": "..."}` — no duplicate WhatsApp send
- Index: `(user_id, webhook_id)` unique

---

## E. Audit Logging (webhook_logs collection)

```json
{
  "id": "<uuid>",
  "user_id": "...",
  "webhook_id": "Body.id",
  "event_type": "list.add_contact",
  "source": "freshmarketer",
  "mobile": "...",
  "country_code": "...",
  "template_id": "...",
  "variable_data": {...},
  "whatsapp_sent": true/false,
  "whatsapp_error": null,
  "message_id": "...",
  "raw_payload": {...},
  "created_at": "ISO timestamp"
}
```

---

## F. Event Type Handling

- Phase 1: Only process `list.add_contact`. All other events → log as `"status": "ignored"` + return success.
- Phase 2 (future): Add handlers for `list.remove_contact` etc.

---

## G. Error Handling

| Scenario | Response |
|---|---|
| Missing mobile | `success:false, error: MOBILE_REQUIRED` |
| Missing template_id | `success:false, error: TEMPLATE_ID_REQUIRED` |
| Template not found | `success:false, error: TEMPLATE_NOT_FOUND` |
| Not synced to AuthKey | `success:false, error: AUTHKEY_WID_MISSING` |
| WhatsApp send fail | `success:false, error: <authkey error>` |
| Duplicate webhook | `success:true, status: replayed` |
| Unsupported event | `success:true, status: ignored` |

---

## H. Code Placement in pos.py

- **Models**: Insert AFTER `DirectSendRequest` class
- **Endpoint**: Insert AFTER `pos_direct_send` function, BEFORE `# Messaging routes`
- **~230 new lines total** (models ~80 + endpoint ~150)

---

## I. Regression Risk

**LOW** — New endpoint only. No changes to existing code.

Files touched:
- `routers/pos.py` — NEW models + NEW endpoint (no edits to existing)
- Database — NEW `webhook_logs` collection (no changes to existing collections)

Regression checklist:
- [ ] POST /api/pos/send (DirectSend) still works
- [ ] POST /api/pos/order (Order webhook) still works
- [ ] Coupon validate/apply still works
- [ ] Loyalty earn/redeem still works

---

## J. Test Curl Cases

**1. Valid webhook (expect success or AUTHKEY_WID_MISSING)**
```bash
curl -X POST https://crm-preprod-6.preview.emergentagent.com/api/pos/webhook \
  -H "X-API-Key: dp_live_8ZfL5L5earF4lX8fMWZ_THMDRHxNHzERaHb7Q_zfGks" \
  -H "Content-Type: application/json" \
  -d '{
    "Body": {
      "event_type": "List",
      "event": "list.add_contact",
      "event_category": "system",
      "event_time": 1782486954495,
      "id": "test-webhook-001",
      "data": {
        "custom_data": {
          "mobile": 7602832329,
          "country_code": 91,
          "template_id": "75067eb3-8bdf-428d-95ef-1b14d4ed840d",
          "name": "Parth"
        }
      }
    }
  }'
```

**2. Idempotency (same id, re-run test 1)**
- Expected: `"status": "replayed"`

**3. Mobile fallback from contact**
```bash
# custom_data has no mobile — should use contact.mobile
-d '{ "Body": { "event": "list.add_contact", "id": "test-003",
  "data": { "contact": {"mobile": "9876543210", "first_name": "John"},
  "custom_data": {"template_id": "...", "country_code": 91} } } }'
```

**4. Missing template_id**
- Expected: `"error": "TEMPLATE_ID_REQUIRED"`

**5. Unsupported event type**
```bash
-d '{ "Body": { "event": "list.remove_contact", "id": "test-005",
  "data": { "custom_data": {} } } }'
```
- Expected: `"status": "ignored"`

---

## K. Database Index (add to server.py startup)

```python
await db.webhook_logs.create_index([("user_id", 1), ("webhook_id", 1)], unique=True)
await db.webhook_logs.create_index([("user_id", 1), ("created_at", -1)])
```

---

## L. Success Criteria

- [ ] Accepts Freshmarketer nested envelope
- [ ] Extracts custom_data correctly
- [ ] Int → str coercion for mobile/country_code
- [ ] Contact fallback for mobile and name
- [ ] WhatsApp sent via existing send_single_message
- [ ] Logged to webhook_logs (with raw payload)
- [ ] Logged to whatsapp_message_logs
- [ ] Idempotency on Body.id (no duplicate send)
- [ ] Regression: DirectSend flow unchanged
