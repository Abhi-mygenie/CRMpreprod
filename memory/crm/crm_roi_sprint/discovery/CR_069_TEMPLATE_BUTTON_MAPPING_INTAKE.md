# CR-069 — Template Button Variable Mapping & Send-Path Support

**CR ID**: CR-069  
**Date Registered**: 2026-07-29  
**Reporter**: Owner (verbal report via session chat)  
**Classification**: CR (Feature — Gap Fill)  
**Severity**: P1 (core WhatsApp send feature incomplete — dynamic URL buttons broken for all tenants)  
**Risk**: MEDIUM-HIGH (send path is hotspot per addendum §7; 6 files across BE+FE; additive changes but touches `core/whatsapp.py` and `routers/campaigns.py`)  
**Duplicate Check**: DISTINCT — no prior CR covers button variable mapping. CR-023 (Template Builder) handles button *creation* but not *mapping* or *send-path wiring*. CR-020 (Variable Picker) handles body variables only.  
**Source Investigation**: INV-012 (`discovery/INV_012_TEMPLATE_BUTTON_MAPPING_INVESTIGATION.md`)  
**Affected Template**: `final_bill` (wid=41354, tenant: owner@hungry.com / Hungry Keya) — but gap is systemic for ALL templates with dynamic URL buttons across all tenants.

---

## 1. Owner Report (verbatim)

> "final_bill has 2 buttons but in mapping those buttons don't show. One of them has dynamic URL so not sure how that mapping needs to be done. During testing template also these buttons are not visible."

---

## 2. Problem Statement

WhatsApp templates can have **buttons** (URL, Quick Reply, Phone Number). The CRM Template Builder (CR-023) correctly creates templates with buttons and stores the button data in the `custom_templates` MongoDB collection. Meta approves these templates with buttons.

However, **after creation**, the entire CRM pipeline is blind to button components:

- The template list API doesn't return button data
- The mapping UI doesn't show button variable slots
- The WhatsApp preview doesn't render buttons
- The send payload doesn't include button parameter values

For **dynamic URL buttons** (e.g., `https://crm.mygenie.online/{{1}}` on `final_bill`), the `{{1}}` suffix must be resolved at send-time to the invoice token. Currently it is never resolved — the recipient gets a broken button URL.

---

## 3. Evidence Summary (from INV-012)

### E1 — Button data exists in `custom_templates`

```json
{
  "template_name": "final_bill",
  "authkey_wid": "41354",
  "buttons": [
    { "type": "URL", "text": "Feedback", "url_type": "static", "url": "https://g.page/r/CVS6trbBhsHmEBE/review" },
    { "type": "URL", "text": "Bill", "url_type": "dynamic", "url": "https://crm.mygenie.online/{{1}}", "url_base": "https://crm.mygenie.online/", "url_example": "1231231" }
  ]
}
```

### E2 — `einvoice_token` variable exists in registry

`core/whatsapp_variables.py` line 331-341:
```python
{
    "key": "einvoice_token",
    "label": "E-Invoice Token",
    "description": "Invoice token for dynamic URL button suffix.",
    "sources": [{"from": "event", "field": "einvoice_token"}],
    "fills_on_events": ORDER_EVENTS,
}
```

The variable is ready. The plumbing to connect it to the button URL is missing.

### E3 — AuthKey `getAllTemplate.php` does NOT return button data

Raw API response keys: `wid`, `temp_name`, `temp_body`, `temp_language`, `temp_category`, `temp_status`, `error_desc_creation`. No button fields.

### E4 — AuthKey send API (`requestjson.php`) — `buttonValues` not documented

Official docs at `https://authkey.io/whatsapp-api-docs` list `bodyValues` and `headerValues` only. `buttonValues` is undocumented but follows the same naming pattern and may be supported (Meta Cloud API underlying format supports button parameters).

---

## 4. Blast Radius — 10 Affected Surfaces

| # | Surface | File | What's Missing | User Impact |
|---|---|---|---|---|
| **1** | Template card — variable chips | `TemplatesPage.jsx` L664-675 | No button variable chip | No visibility that button needs mapping |
| **2** | Template card — WhatsApp preview | `TemplatesPage.jsx` L677-694 | No button bars below bubble | User doesn't know template has buttons |
| **3** | Template Map dialog — variable slots | `TemplatesPage.jsx` L245-274, L807 | No button URL slot | **Can't map dynamic URL param** |
| **4** | WhatsApp Automation — Test Template modal | `WhatsAppAutomationContent.jsx` L147-173 | No button variable input | Test sends go with incomplete button URL |
| **5** | Campaign Wizard — `isFullyMapped()` | `CampaignWizardPage.jsx` L160-164 | Button not checked | False "fully mapped" green signal |
| **6** | Campaign Wizard — Variable Mapping Grid | `CampaignWizardPage.jsx` L470-487 | No button row | User can't see/verify button mapping |
| **7** | Campaign Wizard — WhatsApp preview | `CampaignWizardPage.jsx` L532-543 | No button bars | User doesn't see buttons |
| **8** | Campaign Wizard — Test Send | `CampaignWizardPage.jsx` + `campaigns.py` L644-770 | Button params not sent | Test recipient gets broken button URL |
| **9** | Backend — Live event-triggered send | `core/whatsapp.py` L695-854 | Button params not resolved or sent | **Real customers get broken button URL** |
| **10** | Backend — Campaign bulk send | `routers/campaigns.py` `_execute_campaign_send()` | Button params not resolved or sent | **Bulk recipients get broken button URL** |

---

## 5. Files WILL Change

| File | LOC (current) | Surfaces Fixed | Change Type | Risk |
|---|---|---|---|---|
| `backend/routers/whatsapp.py` | 2311 | #1, #2, #3 | Enrichment adds `buttons` from `custom_templates`; mapping save accepts button keys | LOW (additive enrichment) |
| `backend/core/whatsapp.py` | 923 | #9 | `WhatsAppMessage` gains `button_values`; `send_single_message` adds `buttonValues` to payload; `trigger_whatsapp_event` resolves button mappings | **MEDIUM** (send path — hotspot) |
| `backend/routers/campaigns.py` | 1111 | #8, #10 | Test-send + bulk-send resolve and pass button values | **MEDIUM** (campaign send — hotspot) |
| `frontend/src/pages/TemplatesPage.jsx` | 1096 | #1, #2, #3 | Enrichment display; button bars in preview; button slots in Map dialog | LOW (additive UI) |
| `frontend/src/pages/CampaignWizardPage.jsx` | 690 | #5, #6, #7 | `isFullyMapped` includes buttons; mapping grid shows button row; preview shows buttons | LOW (additive UI) |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | 1427 | #4 | Test Template modal shows button variable inputs | LOW (additive UI) |

## 6. Files WILL NOT Change

| File | Reason |
|---|---|
| `core/whatsapp_variables.py` | `einvoice_token` already exists — no registry change needed |
| `core/coupon.py` | No coupon logic involved |
| `core/loyalty.py` | No loyalty logic involved |
| `routers/pos.py` | POS order ingestion unchanged |
| `core/campaign_jobs.py` | Calls `_execute_campaign_send` — inherits fix automatically |
| `models/schemas.py` | No Pydantic model change |
| `services/invoice_generator.py` | Invoice generation unchanged |
| `core/scheduler.py` | Scheduler unchanged |

---

## 7. Acceptance Criteria

### Data Layer
- **AC-1**: `GET /api/whatsapp/authkey-templates` response includes `buttons` array for templates that have a matching `custom_templates` record with buttons.
- **AC-2**: `PUT /api/whatsapp/template-variable-map/{template_id}` accepts and stores button variable keys (e.g., `"btn_url_{{1}}": "einvoice_token"`) alongside body variable mappings.

### Mapping UI (Templates Page)
- **AC-3**: Template card variable chips show button dynamic URL variables with a link icon and mapped/unmapped state.
- **AC-4**: WhatsApp preview bubble renders button bars below the message body (static buttons as labels, dynamic URL button showing resolved URL).
- **AC-5**: Map dialog shows a "Button URL Parameters" section below body variables. Each dynamic URL button `{{N}}` gets a mapping slot with the same Map/Text/Menu picker as body variables.

### Test Template (Automation Page)
- **AC-6**: Test Template modal shows button variable inputs below body variable inputs. User can enter manual value or use mapped value.
- **AC-7**: Test send includes button params in the AuthKey payload.

### Campaign Wizard
- **AC-8**: `isFullyMapped()` returns false if any dynamic URL button variable is unmapped.
- **AC-9**: Variable Mapping Grid shows button variable rows with `🔗` prefix.
- **AC-10**: WhatsApp preview renders button bars.
- **AC-11**: Campaign test-send includes button params in the AuthKey payload.

### Send Path (Backend)
- **AC-12**: `send_single_message()` includes `buttonValues` in the AuthKey payload when button values are present.
- **AC-13**: `trigger_whatsapp_event()` resolves button variable mappings from the template-variable-map and passes values to the message.
- **AC-14**: `_execute_campaign_send()` resolves button variable mappings per recipient and passes values to each message.

### Regression Safety
- **AC-15**: Templates WITHOUT buttons behave identically to today (zero regression).
- **AC-16**: Static URL buttons and Quick Reply buttons don't produce mapping slots (only dynamic URL buttons do).
- **AC-17**: Existing body variable mappings are not affected by button mapping additions.

---

## 8. Open Questions (carried from INV-012, partially answered)

| # | Question | Status |
|---|---|---|
| **Q1** | Does AuthKey's send API (`requestjson.php`) accept `buttonValues`? | UNKNOWN — undocumented. Will test empirically during implementation with a live test send. If rejected, escalate to AuthKey (same pattern as CR-040). |
| **Q2** | Naming convention for button variable keys in the mapping dict? | PROPOSED: `btn_url_{{N}}` where N is the button index (0-based) that has a dynamic URL. Avoids collision with body `{{N}}`. |

---

## 9. Estimated Effort

| Phase | Effort |
|---|---|
| Backend enrichment (GAP-1) | ~30 min |
| Frontend Map dialog + chips + preview (GAP-2, Surfaces 1-3) | ~2 hrs |
| Frontend Campaign Wizard (Surfaces 5-7) | ~1 hr |
| Frontend Test Template modal (Surface 4) | ~30 min |
| Backend send path (GAP-3, Surfaces 8-10) | ~1.5 hrs |
| Testing + QA | ~1 hr |
| **Total** | **~6-7 hrs** |

---

## 10. Recommended Priority & Sequence

**Priority**: P1 — the "Bill" button is broken on every live send for `final_bill`. Customer taps "Bill" and gets an incomplete URL.

**Sequence**: Ready for Planning gate immediately. No external blockers (Q1 will be tested empirically).

---

## 11. Cross-References

| Item | Relationship |
|---|---|
| **INV-012** | Source investigation — full root cause trace |
| **CR-023** | Template Builder (created buttons) — this CR completes the pipeline |
| **CR-020** | Variable Picker (body variables) — button mapping reuses the same picker |
| **CR-014** | E-Invoice (generates `einvoice_token`) — the token this button needs |
| **CR-004** | WhatsApp send infrastructure — this CR extends the payload |

---

*End of CR-069 Intake Document*
