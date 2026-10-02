# CR-004 — WhatsApp Module · Discovery Gate Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Sprint:** ROI Measurement Sprint
**Phase:** Phase 0 — Discovery (READ-ONLY)
**Date:** 2026-05-27
**Status:** `cr004_phase_0_discovery_complete_awaiting_planning_gate`
**Agent Mode:** Strict Discovery Agent — **NO CODE CHANGES MADE**

---

## 0. Scope of This Report

Inspect what exists today in CRM under the **WhatsApp** module (Settings / Templates / Automation / Segments) and the runtime trigger code. Classify every piece into one of:

- ✅ **Working** — implemented and exercised by live code
- 🟡 **Partial** — implemented but with gaps / not wired end-to-end
- 🔴 **Not working / Missing** — declared but no runtime, or absent entirely
- 🧪 **Testable now** — can be QA'd without further code changes

---

## 1. Provider & Credentials

| Item | State | Evidence |
|---|---|---|
| **Primary send provider** | AuthKey.io | `core/whatsapp.py` → `AUTHKEY_API_URL = https://console.authkey.io/restapi/requestjson.php` |
| **Template-creation provider** | Meta Graph API v17.0 | `routers/whatsapp.py` → `POST /meta/create-template` calls `https://graph.facebook.com/v17.0/{waba_id}/message_templates` |
| **Template sync (Meta → AuthKey)** | AuthKey migration API | `POST /authkey/sync-templates` calls `wptemplateMigration.php` |
| **Combined create+sync** | Yes | `POST /create-and-sync-template` |
| **Per-user creds stored** | `authkey_api_key`, `brand_number`, `meta_waba_id`, `meta_access_token` (on `users` doc) | `GET/PUT /whatsapp/api-key` |
| **Credential masking toggle** | ✅ Done in CR-009 | `qa/CR_009_..._QA_REPORT.md` |
| **Status webhook (inbound)** | `POST /whatsapp/status-callback` (public, no auth) | `routers/whatsapp.py:1057` |
| **Two-stage approval flow** | Owner creates → Meta approves (pending) → AuthKey sync → ready | `submit_custom_template`, `create_meta_template` |

**Verdict:** ✅ Working. User has confirmed test-message send works → AuthKey path is live.

---

## 2. Templates — Storage & Surfaces

There are **three parallel template surfaces** in the system. This is the single biggest source of confusion in the module.

| Surface | Collection / Source | Used By | Status |
|---|---|---|---|
| **A. Legacy in-CRM templates** | `whatsapp_templates` (Mongo) | `setup-defaults` seeder, old `automation_rules` flow, `WhatsAppTemplate` Pydantic model | 🟡 Partial — still has full CRUD endpoints but **runtime sends do NOT use this** (see §4) |
| **B. Custom (Meta-managed) templates** | `custom_templates` (Mongo) | Owner authors template → submits to Meta → tracked with `meta_template_id`, `status` (draft / pending / approved) | ✅ Working CRUD, depends on Meta approval |
| **C. AuthKey-side templates** | Live API (`getAllTemplate.php`) | `GET /whatsapp/authkey-templates` — fetched on demand by Templates UI; uses `wid` for actual sends | ✅ Working |

**Runtime path used by `trigger_whatsapp_event()`** = Surface **C** (AuthKey `wid`) via `whatsapp_event_template_map` (§3).

**Findings:**
- 🟡 `whatsapp_templates` collection + the legacy `setup-defaults` endpoint create 10 in-CRM templates and 10 `automation_rules` rows that the **send path never reads**. They are zombie artefacts of an earlier architecture.
- 🟡 `get_message_filters` (line 1010) calls a wrong AuthKey URL: `https://api.authkey.io/request?type=getAllTemplate&authkey=...` — this is a *different* (older) AuthKey endpoint than `console.authkey.io/restapi/getAllTemplate.php` used elsewhere. May silently return empty `template_names` filter list.
- ✅ Custom template Meta create + sync flow is fully implemented.

---

## 3. Event → Template Mapping (Utility)

| Collection | Purpose | Endpoints |
|---|---|---|
| `whatsapp_event_template_map` | event_key → AuthKey `wid` mapping (the **live** map used at send time) | `GET/PUT/DELETE /whatsapp/event-template-map`, `POST /…/toggle` |
| `whatsapp_template_variable_map` | per-template variable → customer field mappings (with mode = `map` or `text`) | `GET /template-variable-map`, `PUT /template-variable-map/{template_id}` |
| `automation_rules` (legacy) | event_type → local template_id | `GET/POST/PUT/DELETE /whatsapp/automation`, `POST /automation/{id}/toggle`, `GET /automation-with-templates` |

**Verdict:**
- ✅ `whatsapp_event_template_map` flow is the source of truth at runtime.
- 🔴 `automation_rules` flow is **dead code at runtime** — the UI still exposes it via `WhatsAppAutomationContent.jsx` lines 787-816, but `trigger_whatsapp_event()` never reads `automation_rules`. Two CRUD UIs against two collections, only one matters.

---

## 4. Automation Events — Declared vs Emitted

### 4.1 Declared in master list (`models/schemas.py`)

```
POS_EVENTS (11): new_order_customer, new_order_outlet, order_confirmed,
                 order_ready_customer, item_ready, order_served, item_served,
                 order_ready_delivery, order_dispatched, send_bill_manual,
                 send_bill_auto

CRM_EVENTS  (7): reset_password, welcome_message, birthday, anniversary,
                 points_earned, points_expiring, feedback_request
```

`/whatsapp/automation/events` returns this master list and feeds every UI dropdown.

### 4.2 Actually emitted by CRM trigger code (grep `trigger_whatsapp_event(`)

| Event key fired | Source file | Line | In master list? |
|---|---|---|---|
| `send_bill` | `routers/pos.py` | 1462 | 🔴 No (master has `send_bill_manual` / `send_bill_auto`) |
| `first_visit` | `routers/pos.py` | 1477 | 🔴 No |
| `tier_upgrade` | `routers/pos.py`, `routers/points.py` | 1489, 143 | 🔴 No |
| `coupon_earned` | `routers/coupons.py` | 186 | 🔴 No |
| `wallet_credit` | `routers/wallet.py` | 55 | 🔴 No |
| `wallet_debit` | `routers/wallet.py` | 65 | 🔴 No |
| `bonus_points` | `routers/points.py` | 133 | 🔴 No |
| `points_earned` | via `trigger_points_earned_event` | multi | ✅ Yes |
| `birthday` | `core/loyalty_jobs.py` | 105 | ✅ Yes |
| `anniversary` | `core/loyalty_jobs.py` | 205 | ✅ Yes |
| `points_expiring` | `core/loyalty_jobs.py` | 288 | ✅ Yes |
| `feedback_received` | `services/feedback_service.py` | 59 | 🔴 No (master has `feedback_request`) |
| `<dynamic from POS gateway>` | `routers/pos.py` | 2174 | depends on external POS event_type translation |

### 4.3 Declared but never emitted by CRM code

`new_order_customer`, `new_order_outlet`, `order_confirmed`, `order_ready_customer`, `item_ready`, `order_served`, `item_served`, `order_ready_delivery`, `order_dispatched`, `send_bill_manual`, `send_bill_auto`, `reset_password`, `welcome_message`, `feedback_request` — **14 events declared but never fired by CRM**. They can only ever fire if an external POS calls `POST /pos/event` and matches them.

### 4.4 Implication

🔴 **Critical drift:** Owners can map templates to 18 declared events in the UI, but only ~4 of those (`points_earned`, `birthday`, `anniversary`, `points_expiring`) are ever fired by CRM itself.

Conversely, **7+ events that ARE fired by CRM** (`send_bill`, `first_visit`, `tier_upgrade`, `coupon_earned`, `wallet_credit`, `wallet_debit`, `bonus_points`, `feedback_received`) **do not appear in the master list and therefore cannot be mapped to a template through the UI** — meaning those triggers silently no-op because `get_event_template_config()` returns `None`.

This is the **single biggest functional gap** in the WhatsApp module.

---

## 5. Segments / Marketing Broadcasts

| Item | State |
|---|---|
| Segment CRUD | ✅ `segments_router` in `routers/customers.py` |
| Segment WhatsApp config (template + variables + schedule) | ✅ `POST /segments/{id}/whatsapp-config` saves `template_id`, `variable_mappings`, `schedule_type` (now / scheduled / recurring), `recurring_frequency`, `recurring_days`, `recurring_end_option`, etc. |
| Pause / resume config | ✅ `PATCH /segments/{id}/whatsapp-config/toggle` |
| List all configs | ✅ `GET /segments/whatsapp-configs/all` |
| **Send-now action** | 🔴 **MISSING — no endpoint** like `/segments/{id}/send` or `/segments/{id}/whatsapp-config/run` |
| **Scheduled-broadcast worker** | 🔴 **MISSING — `core/scheduler.py` only schedules `daily_loyalty_jobs`** (birthday, anniversary, expiry). No job consults `segment_whatsapp_config` to evaluate `schedule_type` / `recurring_*` and dispatch messages. |
| Broadcast logs | 🟡 `whatsapp_message_logs` schema has `campaign_id` field, but nothing populates it from a segment send. |

🔴 **Verdict:** The entire **marketing-message side of CR-004 is unimplemented at the send layer.** UI saves configs that no worker consumes.

---

## 6. Send Logging & Observability

| Capability | State | Evidence |
|---|---|---|
| Per-message log row | ✅ | `log_message_attempt()` inserts into `whatsapp_message_logs` with id, user_id, customer_id, phone, event_type, template_id/name, status, message_id, error, body_values, resend_count, status_history |
| Status lifecycle | ✅ `pending` → `delivered` / `read` / `rejected` | `MESSAGE_STATUSES` |
| Status webhook | ✅ `POST /whatsapp/status-callback` upserts on `message_id` with `status_history.push` | `routers/whatsapp.py:1057` |
| Stats endpoint | ✅ `GET /whatsapp/message-stats` | groups by status |
| Logs listing | ✅ `GET /whatsapp/message-logs` with status / event_type / campaign / template / search / date filters + pagination |
| Filters meta | 🟡 `GET /whatsapp/message-filters` — pulls templates from a **wrong AuthKey URL** (`api.authkey.io/request`) vs the rest of the code which uses `console.authkey.io/restapi/getAllTemplate.php`. Probably returns empty silently. |
| Resend failed | ✅ `POST /whatsapp/resend` (re-attempts pending/rejected, bumps `resend_count`, appends history) |
| MessageStatus dashboard | ✅ `frontend/src/pages/MessageStatusPage.jsx` (536 lines) |

🟡 **Caveat:** `routers/whatsapp.py:1151` constructs `WhatsAppMessage(template_name=...)` in resend, but the dataclass has **no** `template_name` field (see `core/whatsapp.py:17-26`). **This will raise `TypeError` at resend time.** Bug.

---

## 7. Opt-in / Opt-out / Compliance

| Item | State |
|---|---|
| Customer opt-in field | 🔴 Not found on `customers` schema or in send path |
| Opt-out check before send | 🔴 `trigger_whatsapp_event()` does not consult any opt-in flag |
| Utility vs marketing differentiation at send | 🔴 Same send pipeline used for both — no category-aware throttling, no marketing-only opt-in gate |
| Quiet hours / frequency cap | 🔴 None |

🔴 **Verdict:** Marketing-grade compliance not implemented. Acceptable for utility-only today, blocker before marketing broadcasts go live.

---

## 8. Frontend Surface Map

| Page / Component | LOC | Backend endpoints touched |
|---|---|---|
| `pages/SettingsPage.jsx` | 106 | `/whatsapp/api-key` (GET/PUT) |
| `pages/TemplatesPage.jsx` | 566 | `/whatsapp/authkey-templates`, `/whatsapp/custom-templates*`, `/whatsapp/template-variable-map*`, `/customers/sample-data` |
| `components/shared/WhatsAppAutomationContent.jsx` | 1965 | `/whatsapp/templates`, `/whatsapp/automation*`, `/whatsapp/automation/events`, `/whatsapp/api-key`, `/whatsapp/authkey-templates`, `/whatsapp/event-template-map*`, `/whatsapp/template-variable-map*`, `/whatsapp/custom-templates*`, `/whatsapp/test-template` |
| `pages/SegmentsPage.jsx` | 1689 | `/segments*`, `/segments/whatsapp-configs/all`, `/customers/segments/stats` |
| `pages/MessageStatusPage.jsx` | 536 | `/whatsapp/message-stats`, `/whatsapp/message-logs`, `/whatsapp/message-filters`, `/whatsapp/resend`, `/whatsapp/status-callback` |

---

## 9. Buckets — Final Summary

### ✅ Working (testable now)

1. AuthKey credential save + test-message send (`/whatsapp/test-template`)
2. Meta credential save + custom-template Meta-create + AuthKey-sync flow
3. AuthKey template listing (`/whatsapp/authkey-templates`)
4. Event → AuthKey-wid mapping CRUD + toggle (`whatsapp_event_template_map`)
5. Template → variable mapping CRUD with `map` / `text` modes
6. Runtime CRM triggers for: `points_earned`, `birthday`, `anniversary`, `points_expiring`
7. Status callback ingestion + status_history audit trail
8. Message logs listing, filtering (except template-name filter), pagination
9. Resend dialog UI (but see bug §6)
10. Segment CRUD + WhatsApp-config persistence (save / pause / resume)

### 🟡 Partial — wired but with gaps

1. Legacy `whatsapp_templates` + `automation_rules` CRUD exposed but unused at runtime (dead surface)
2. `/whatsapp/message-filters` calls wrong AuthKey URL → template-name filter likely empty
3. POS event triggers exist but events declared in master list are mostly unfired by CRM code (only fired if external POS calls `/pos/event`)
4. POS gateway internal-event translation (`internal_event` mapping in `pos.py:2174`) — not audited here, needs cross-walk
5. Variable aliases in `core/whatsapp.py:230` only cover ~6 fields; many seeded template variables (e.g. `restaurant_name`, `expiry_date`, `amount`, `points_earned`, `points_redeemed`, `coupon_code`) have no alias fallback

### 🔴 Not working / Missing

1. **Event drift** — 7+ events fired by code are absent from master list, so they cannot be mapped to templates (silent no-op). 14 events declared but never fired by CRM.
2. **Segment broadcast send** — no `POST /segments/{id}/send` endpoint and no scheduler worker reading `segment_whatsapp_config`. Whole marketing path is mock-configured but not dispatched.
3. **Opt-in / opt-out** — no enforcement layer
4. **Utility vs marketing category gate** — single send pipeline
5. **Resend bug** — `WhatsAppMessage(template_name=...)` will raise `TypeError` (field doesn't exist)
6. **Welcome / first_visit naming mismatch** — code fires `first_visit`, master list calls it `welcome_message`
7. **Feedback naming mismatch** — code fires `feedback_received`, master list calls it `feedback_request`
8. **send_bill naming mismatch** — code fires `send_bill`, master list has `send_bill_manual` and `send_bill_auto`
9. **`reset_password` event** — declared but no auth endpoint emits it (no OTP-on-forgot-password trigger found)

---

## 10. What Can Be Tested Immediately (no code change)

| # | Test | Pass criteria |
|---|---|---|
| T1 | `PUT /whatsapp/api-key` then `POST /whatsapp/test-template` | Test message delivered; log row in `whatsapp_message_logs` with `status=pending`, eventually `delivered` after callback |
| T2 | `POST /whatsapp/meta/create-template` then `POST /whatsapp/authkey/sync-templates` | `custom_templates` row created with `meta_template_id`, status `pending` |
| T3 | `PUT /whatsapp/event-template-map` for `points_earned` + add bonus points to a customer | Outbound message fires; log row created |
| T4 | `PUT /whatsapp/event-template-map` for `birthday` then `POST /cron/trigger` | Birthday job awards points and fires WhatsApp |
| T5 | `GET /whatsapp/message-stats` and `/message-logs` | Counts and rows return |
| T6 | `POST /whatsapp/status-callback` with sample AuthKey payload | Log row status flips to `delivered` / `read` / `rejected`, `status_history` appended |
| T7 | `POST /segments/{id}/whatsapp-config` save | Config persisted, visible in `/segments/whatsapp-configs/all` |
| T8 | Try to map a template to event `send_bill` or `wallet_credit` via UI | **Will fail / not be selectable** — confirms event drift gap |
| T9 | `POST /whatsapp/resend` with a rejected message id | **Will raise TypeError** — confirms resend bug |

---

## 11. What Needs Further Mapping / Implementation (for Planning Gate)

Ordered by P0 → P2.

### P0 — Required before any marketing send

1. **Reconcile `AUTOMATION_EVENTS` master list with what code actually fires.** Add to master list: `send_bill`, `first_visit` (or rename to `welcome_message` in code), `tier_upgrade`, `coupon_earned`, `wallet_credit`, `wallet_debit`, `bonus_points`, `feedback_received` (or rename to `feedback_request` in code). Decide naming once and apply consistently. Update `pos_descriptions` / `crm_descriptions`.
2. **Decide deprecation path for legacy `automation_rules` + `whatsapp_templates`.** Either delete the dead endpoints or back-fill the runtime to read from them. Recommendation: deprecate and remove.
3. **Segment broadcast send-now endpoint** + **scheduled / recurring broadcast worker** in `core/scheduler.py`. Without this, "marketing" is non-functional.
4. **Fix resend `TypeError`** — `WhatsAppMessage(template_name=...)` is invalid.
5. **Opt-in / opt-out** field on `customers`, enforced for marketing category in `trigger_whatsapp_event()` and in the broadcast worker.

### P1 — Should-have

6. **Wrong AuthKey URL** in `/whatsapp/message-filters` — align with `console.authkey.io` URL used elsewhere.
7. **Utility vs marketing category** — derive from template (Meta returns category), tag the message log row, gate marketing on opt-in only.
8. **Welcome / reset_password / feedback triggers** — wire missing emit sites (auth router for OTP, customer-create for welcome, feedback service rename).
9. **POS gateway `internal_event` mapping audit** (`pos.py:2174`) — list which external POS event names map to which internal events, ensure target events are in the master list.

### P2 — Nice-to-have

10. Per-template variable alias library cleanup
11. Quiet hours + per-customer frequency cap
12. Segment send dry-run / preview count + cost estimate
13. Bulk resend selection enhancements (already partially in MessageStatusPage)

---

## 12. Strict Non-Goals For Discovery Gate

- No code edits
- No DB writes
- No real WhatsApp messages sent during this report
- No template renaming / event renaming
- No deployment changes

---

## 13. Status

```
cr004_phase_0_discovery_complete_awaiting_planning_gate
```

**Recommended next agent (when picked up):**
> `CR-004 Planning Agent` — convert §11 P0/P1/P2 into a phased implementation plan with explicit acceptance criteria per phase. Get owner sign-off on **event-list reconciliation** and **segment broadcast architecture** before any code change.

End of CR-004 Discovery Gate Report.
