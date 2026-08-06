# INV-012 — Template Button Mapping Missing in CRM

**Investigation ID**: INV-012  
**Date**: 2026-07-29  
**Role**: Investigation Agent  
**Reporter**: Owner (verbal report via session chat)  
**Template**: `final_bill` (wid=41354, tenant: owner@hungry.com / Hungry Keya)  
**Risk**: MEDIUM (WhatsApp template mapping — HIGH-risk module per addendum)

---

## 1. Owner Report

> "final_bill template has 2 buttons but in mapping those buttons don't show.
> One of them has a dynamic URL so not sure how that mapping needs to be done."

---

## 2. Hypotheses

| # | Hypothesis | Status |
|---|---|---|
| H1 | AuthKey API doesn't return button data in template listing | ✅ CONFIRMED |
| H2 | Frontend mapping UI only extracts body variables, ignores button components | ✅ CONFIRMED |
| H3 | AuthKey send API doesn't support button parameter injection (`buttonValues`) | ✅ CONFIRMED (per official docs) |

---

## 3. Evidence

### E1 — AuthKey `getAllTemplate.php` raw response for `final_bill`

```json
{
  "wid": 41354,
  "temp_name": "final_bill",
  "temp_body": "Namaste {{1}}, ...",
  "temp_language": "en",
  "temp_category": "Utility",
  "temp_status": 1,
  "error_desc_creation": null
}
```

**Keys returned**: `wid`, `temp_name`, `temp_body`, `temp_language`, `temp_category`, `temp_status`, `error_desc_creation`.  
**Button data**: ABSENT. No `buttons`, `temp_buttons`, `components`, or any button-related field.

### E2 — Frontend variable extraction (`TemplatesPage.jsx` line 246)

```js
const variables = (template.temp_body.match(/\{\{\d+\}\}/g) || [])
    .filter((v, i, a) => a.indexOf(v) === i);
```

Extracts ONLY from `temp_body`. Zero awareness of button components.  
The mapping modal iterates `mappingTemplate.variables` (line 807) — body-only slots.

### E3 — AuthKey send API payload (`core/whatsapp.py` lines 61–66)

```python
payload = {
    "country_code": "...",
    "mobile": "...",
    "wid": "...",
    "type": "text",
    "bodyValues": message.body_values or {}
}
```

Only `bodyValues` and optional `headerValues`. No `buttonValues` field.

### E4 — AuthKey official documentation (crawled 2026-07-29)

AuthKey send API docs at `https://authkey.io/whatsapp-api-docs` list parameters:
- `bodyValues`: pass body variables
- `headerValues`: header file name + URL
- **No `buttonValues` or button parameter field documented**

### E5 — Tenant Meta WABA status

```json
"meta_waba_id": null,
"meta_access_token": null,
"meta_app_id": null
```

This tenant has NO Meta WABA configured. Cannot query Meta Graph API for full template structure (which would include buttons).

---

## 4. Root Cause

**Classification**: PLAN_GAP + BACKEND/API

The CRM was never designed to handle template button components. Three distinct gaps exist:

| Gap | Layer | Description |
|---|---|---|
| **GAP-1** (Data) | AuthKey API | `getAllTemplate.php` doesn't return button component data. CRM has no way to discover that a template has buttons. |
| **GAP-2** (UI) | Frontend | Variable mapping modal only shows body `{{N}}` variables. No section for button parameters. |
| **GAP-3** (Send) | Backend | `send_single_message()` sends `bodyValues` only. AuthKey's documented send API has no `buttonValues` field. |

### Impact

- **Static buttons** (Quick Reply, static URL, phone call): Work fine — no runtime parameters needed.
- **Dynamic URL buttons** (e.g., `https://example.com/{{1}}`): The `{{1}}` suffix is never resolved. Either AuthKey resolves it from something else, or the button URL is incomplete at delivery time.

### Blast Radius

Any tenant with templates containing dynamic URL buttons. Currently affects at least `final_bill` (wid=41354) for Hungry Keya tenant.

---

## 5. What Needs to Happen (Options)

### Option A — AuthKey-side inquiry (LOWEST effort, recommended first step)

Contact AuthKey support and ask:
1. Does `getAllTemplate.php` have a parameter to return button components?
2. Does the send API (`requestjson.php`) support a `buttonValues` field for dynamic URL buttons?
3. If yes to #2, what is the payload format?

**Why first**: If AuthKey doesn't support button params in their send API, no amount of CRM changes will fix the dynamic URL issue.

### Option B — Meta Graph API template query (MEDIUM effort, solves GAP-1)

For tenants with `meta_waba_id` configured, query `GET /v21.0/{WABA_ID}/message_templates?name=final_bill` to get the full template structure including button components. This solves the data gap but:
- Hungry Keya tenant has `meta_waba_id: null` — won't work without WABA setup
- Still need AuthKey send API to support button params (GAP-3)

### Option C — Full CRM button mapping feature (HIGH effort, ~2-3 days)

Build end-to-end support:
1. **Backend**: New endpoint or enrichment to get template button structure (Meta Graph API query or manual config)
2. **Frontend**: Button mapping section in the variable mapping modal — show button slots with type, label, and dynamic param input
3. **Send path**: Extend `send_single_message()` to include `buttonValues` in the AuthKey payload (pending AuthKey confirmation)
4. **Campaign send**: Wire button params through campaign execution

**Prerequisite**: Option A answer must confirm AuthKey supports `buttonValues` in send API.

---

## 6. Open Questions for Owner

| # | Question | Options |
|---|---|---|
| **Q1** | Has AuthKey support been contacted about `buttonValues` support? | (a) Yes — share response. (b) No — I'll draft the inquiry for you. |
| **Q2** | Is the dynamic URL button on `final_bill` critical for delivery (i.e., does the message fail without it, or does it just show a static base URL)? | (a) Critical — messages fail. (b) Cosmetic — base URL shows, dynamic part is missing. (c) Unknown — need to test. |
| **Q3** | Should we prioritize this as a CR (feature request) or is it blocking current operations? | (a) P1 — blocking sends. (b) P2 — important but body variables work fine. (c) P3 — backlog. |
| **Q4** | Would you like to set up Meta WABA for Hungry Keya tenant (in Settings) so we can query full template structure from Meta? | (a) Yes. (b) Not now. |

---

## 7. Investigation Summary

```
Investigation complete: INV-012
Root cause: CRM has no button component support — AuthKey API doesn't return
            button data, CRM UI only maps body variables, send API has no 
            buttonValues field.
Classification: PLAN_GAP + BACKEND/API
Confidence: HIGH
Steps used: 8/10
Evidence: discovery/INV_012_TEMPLATE_BUTTON_MAPPING_INVESTIGATION.md
Recommendation: Option A first (AuthKey inquiry) → then Planning for Option C 
                if AuthKey confirms support.
Report: this document
```

---

*End of INV-012*
