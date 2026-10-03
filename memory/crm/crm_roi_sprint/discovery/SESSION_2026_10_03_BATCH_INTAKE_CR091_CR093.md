# Batch Intake — CR-091, CR-092, CR-093
## Session: 2026-10-03
## Source investigations: INV-019-A, INV-019-B, CR-091 verbal discussion

---

## CR-091 — Customer WhatsApp Reply → FreshSales Feedback Loop

**Type**: NEW FEATURE  
**Severity**: P1  
**Risk**: HIGH  
**Effort**: ~3–4 hrs  
**Source**: Owner verbal discussion 2026-10-03 (session INV-019)

### Problem statement
When a WhatsApp message is sent to a lead via the Freshmarketer webhook
(`POST /api/pos/webhook`), the customer's reply comes back to AuthKey.
AuthKey fires the reply to the SAME `POST /api/whatsapp/status-callback`
endpoint. Currently this endpoint only handles delivery receipts
(sent/delivered/read/failed). There is zero code to:
- Detect that a payload is a customer reply (inbound) vs a delivery receipt
- Look up which template was sent to that phone
- Match the reply against a configured condition
- Call the FreshSales API based on the match

### Owner decisions locked (2026-10-03)
| # | Decision |
|---|---|
| D1 | Same `/status-callback` URL receives both delivery receipts AND customer replies |
| D2 | FreshSales action differs per template (config table: template → condition → action) |
| D3 | AuthKey sends parsed reply — CRM consumes it, no NLP needed |
| D4 | Phone is source of truth for contact lookup in FreshSales |
| D5 | Single shared FreshSales API key (backend `.env`) — NOT per-restaurant |
| D6 | Only fire FreshSales when reply matches configured condition — else log + ignore |
| D7 | This is internal MyGenie infra only — NOT a per-restaurant feature |
| D8 | Scoped to restaurant 836 (`pos_0001_restaurant_836`) exclusively |

### Open questions (BLOCKING planning)
| # | Question |
|---|---|
| Q1 | What field/value in the AuthKey payload distinguishes inbound reply from delivery receipt? |
| Q2 | FreshSales API action shape — update-contact-field / add-note / trigger-workflow / other? |
| Q3 | Where does the reply-condition config live — hardcoded `.env`, new DB collection, or config file? |

### Blast radius
| Layer | Change |
|---|---|
| Backend | `routers/whatsapp.py` — extend `status-callback` inbound detection (HIGH-risk file) |
| Backend | New `core/freshsales.py` — FreshSales HTTP client |
| Backend | New `whatsapp_reply_logs` collection — inbound reply audit trail |
| Backend | New reply-condition config collection or `.env` entries |
| Frontend | NONE |

### Duplicate check
Grepped CR-001 through CR-090: no existing CR for FreshSales reply handling.
DISTINCT.

---

## CR-092 — Template Purpose Badges (Direct-Send vs Event-Automation)

**Type**: NEW FEATURE (UI enrichment)  
**Severity**: P2  
**Risk**: LOW  
**Effort**: ~1.5 hrs  
**Source**: INV-019-A (2026-10-03)

### Problem statement
On the Templates page, all 37 AuthKey templates for restaurant 836 look
identical — no visual signal whether a template is:
- Used for CRM event automation (`whatsapp_event_template_map`)
- Used for Freshmarketer direct-send (`whatsapp_message_logs.reference_type=freshmarketer_webhook`)
- Completely unused

The data to distinguish exists in two collections but is never queried during
the `GET /authkey-templates` enrichment pass.

### Root cause
PLAN_GAP — "template purpose" concept never modelled. The enrichment at
`routers/whatsapp.py:get_authkey_templates()` already does one pass to add
media/button metadata from `custom_templates`. A second pass was never added
to check `whatsapp_event_template_map` or `whatsapp_message_logs`.

### Proposed solution
Backend: extend `get_authkey_templates()` to add:
```python
t["is_event_mapped"]  = bool  # wid found in whatsapp_event_template_map
t["is_direct_send"]   = bool  # wid found in whatsapp_message_logs via authkey_wid join
```
Frontend: render badge chips on each template card:
- Green `Event` badge when `is_event_mapped=True`
- Blue `Direct` badge when `is_direct_send=True`
- No badge = unused

### Open questions
| # | Question |
|---|---|
| Q1 | Should both badges show simultaneously if a template is used for BOTH purposes? |
| Q2 | Badge label copy — "Event" / "Direct" or something more descriptive? |

### Blast radius
| Layer | Change |
|---|---|
| Backend | `routers/whatsapp.py` — 2 extra DB lookups in `get_authkey_templates()` (HIGH-risk file, additive only) |
| Frontend | `TemplatesPage.jsx` — add badge chips on AuthKey template card (read `is_event_mapped`, `is_direct_send`) |

### Duplicate check
No existing CR covers template purpose visualisation. DISTINCT.

---

## CR-093 — Direct-Send Config Access for AuthKey-Only Templates

**Type**: NEW FEATURE (two bundled gaps)  
**Severity**: P1  
**Risk**: MEDIUM  
**Effort**: ~3 hrs  
**Source**: INV-019-B + additional finding (2026-10-03)

### Problem statement

**Gap A — Wrong dialog on AuthKey template cards (INV-019-B)**

The `Map` button on every AuthKey template card opens the event-automation
variable mapping dialog (`whatsapp_template_variable_map`) which maps
`{{1}}` → Customer Name, Order Amount, etc. (CRM event variables).

For Freshmarketer/direct-send templates, the correct dialog is
`Set Labels` which maps `{{1}}` → `name`, `{{2}}` → `demo_time`
(Freshmarketer `custom_data` keys). `Set Labels` is only rendered
inside the CRM custom templates section (`displayDrafts.map(ct => ...)`
line 606) — it is physically unreachable from an AuthKey template card.

**Gap B — 28 of 37 AuthKey templates have no local CRM record**

The sync endpoint (`POST /authkey/sync-templates`) only back-fills
`authkey_wid` on EXISTING local records by name match. It never imports
new records from AuthKey. Templates created on WhatsApp/Meta outside the
CRM builder remain AuthKey-only forever. Without a local record:
- `Set Labels` cannot be rendered (no `id` to PATCH)
- Template cannot be used as `template_id` in the webhook payload
- Direct-send capability is permanently blocked

Current state for restaurant 836:
- 37 AuthKey templates total
- 9 have local CRM records
- 28 are AuthKey-only — cannot be configured for direct-send

### Root cause
PLAN_GAP — two gaps compounding each other:
1. `Set Labels` dialog is gated behind CRM section, not available on AuthKey section
2. Sync never imports new templates, so AuthKey-only templates can never get local records

### Proposed solution

**Phase 1 — Sync import (unblocks everything)**  
Extend `POST /authkey/sync-templates` with an import step:
for every AuthKey template with no name-matching local record,
create a minimal `custom_templates` document:
```
template_name, body, variables, authkey_wid, status=approved,
category from AuthKey, language from AuthKey
```
This gives all 37 templates a local record, making `Set Labels` reachable.

**Phase 2 — Surface Set Labels on AuthKey template cards**  
Extend `GET /authkey-templates` enrichment to return `local_template_id`
(the CRM UUID) when a local record exists for that `authkey_wid`.
Frontend: render a `Set Labels` button on AuthKey template cards when
`local_template_id` is present — wired to the existing `openLabelsModal`.

### Open questions
| # | Question |
|---|---|
| Q1 | On sync import, should ALL 28 missing templates be created, or only specific ones owner selects? |
| Q2 | Phase order: implement Phase 1 (sync import) first, then Phase 2 (UI surface)? Or together? |
| Q3 | Should the `Map` button be hidden or relabelled for known direct-send templates to avoid confusion? |

### Blast radius
| Layer | Change |
|---|---|
| Backend | `routers/whatsapp.py` — extend `sync_authkey_templates()` with import loop (HIGH-risk file) |
| Backend | `routers/whatsapp.py` — extend `get_authkey_templates()` enrichment to return `local_template_id` |
| Frontend | `TemplatesPage.jsx` — render `Set Labels` on AuthKey template cards when `local_template_id` present |
| DB | New `custom_templates` documents created on sync (non-destructive, additive) |

### Duplicate check
No existing CR covers sync import or Set Labels on AuthKey cards. DISTINCT.

---

## Intake output summary

```
Intake complete: CR-091, CR-092, CR-093
Source: INV-019-A, INV-019-B, owner verbal discussion 2026-10-03

CR-091 | FreshSales Reply Loop        | P1 | HIGH   | Blocked: Q1–Q3
CR-092 | Template Purpose Badges      | P2 | LOW    | Blocked: Q1–Q2 (optional)
CR-093 | Direct-Send Config Access    | P1 | MEDIUM | Blocked: Q1–Q3

Hotspot files: routers/whatsapp.py (all three), TemplatesPage.jsx (CR-092, CR-093)
Money-critical: NO (none touch loyalty/coupon/POS/auth)
Next: owner answers Q1–Q3 on CR-091 (highest priority) → Planning
      owner answers Q1–Q3 on CR-093 → Planning
      CR-092 can go directly to Planning (questions are optional)
```
