# INV-008: Template `\n` Encoding — CRM vs AuthKey vs Meta

**Date**: 2026-07-16
**Role**: Investigation Agent
**Risk**: HIGH (WhatsApp delivery — real customers)
**Owner query**: "Is there any difference if we make template from CRM, AuthKey and Meta in text or media templates? There is `\n` getting created which is not happening when creating from AuthKey. Can it impact delivery?"

---

## Investigation Summary

| Field | Value |
|---|---|
| Root Cause | AuthKey API encoding format — cosmetic, NOT functional |
| Classification | BACKEND/API (third-party) |
| Confidence | HIGH |
| Steps Used | 8/10 |
| Impact on Delivery | **NONE** |

---

## Hypotheses Tested

| # | Hypothesis | Result |
|---|---|---|
| H1 | CRM frontend sends literal `\n` text instead of actual newlines | **ELIMINATED** — textarea captures actual newlines, JSON serializes correctly |
| H2 | CRM backend sends wrong encoding to Meta API | **ELIMINATED** — `httpx` `json=` correctly serializes newlines in JSON wire format |
| H3 | AuthKey's API returns escaped encoding (`\n` as two chars) for all templates | **CONFIRMED** — AuthKey escapes newlines and apostrophes in `temp_body` field |

---

## Evidence

### 1. CRM Database (custom_templates collection)

All 16 synced templates store **actual newline characters** (ASCII 10). No literal backslash-n anywhere.

Example — `premium_lunch_menu`:
```
CRM body: "...Kitchen! 😊\n\nHere's today's menu..."
           ^^^^^^^^ actual newline chars (ASCII 10)
```

### 2. AuthKey API Response (getAllTemplate.php)

The **same template** (`premium_lunch_menu`, wid=40605) returned by AuthKey:
```
AuthKey temp_body: "...Kitchen! 😊\\n\\nHere\\'s today\\'s menu..."
                    ^^^^ literal backslash+n  ^^^ escaped apostrophe
```

**Character inspection** at position 23: `ord=92` (ASCII backslash `\`), confirming literal two-character `\n` text.

### 3. Encoding Comparison — ALL 39 AuthKey Templates

| Source | Encoding | Count |
|---|---|---|
| AuthKey-native templates | Literal `\n` + escaped `\'` | 37/39 |
| CRM-created → synced to AuthKey | Same AuthKey encoding in API response | Same |
| Mixed (both encodings) | 2 templates | Rare edge case |

**Key finding**: AuthKey uses the same escaped encoding for ALL templates in their API — regardless of whether created from AuthKey console, CRM, or Meta directly. This is AuthKey's **API serialization format**.

### 4. CRM Frontend Already Handles This

The CRM already unescapes AuthKey's encoding before display:

**TemplatesPage.jsx (line 212)**:
```javascript
_rawTpls.forEach(t => {
  if (t.temp_body) t.temp_body = t.temp_body.replace(/\\n/g, "\n").replace(/\\'/g, "'");
});
```

**CampaignWizardPage.jsx (line 131)**:
```javascript
message: (t.temp_body || t.message || "").replace(/\\n/g, "\n").replace(/\\'/g, "'"),
```

---

## How Template Creation Differs (CRM vs AuthKey vs Meta)

### Flow Comparison

| Step | CRM Template Builder | AuthKey Console | Meta Business Suite |
|---|---|---|---|
| **1. Author** | User types in CRM textarea | User types in AuthKey UI | User types in Meta UI |
| **2. Submit** | CRM → Meta Graph API (`POST /{waba_id}/message_templates`) | AuthKey submits to Meta (their internal API) | Direct on Meta |
| **3. Sync** | AuthKey sync (`wptemplateMigration.php`) | Already on AuthKey | AuthKey sync needed |
| **4. Storage on Meta** | Actual newlines | Actual newlines | Actual newlines |
| **5. Storage on AuthKey** | AuthKey's escaped format | AuthKey's escaped format | AuthKey's escaped format |

### Text vs Media Templates

There is **no encoding difference** between text and media templates regarding newlines in the body. The body text handling is identical. The only difference is:
- **Text templates**: `header_type=none` or `header_type=text`
- **Media templates**: `header_type=image/video/document` + additional `header_handle` for Meta approval and `send_media_url` for delivery

The `\n` behavior in the body is the same for both.

---

## Why Delivery Is NOT Impacted

1. **WhatsApp uses Meta's stored template** — When a message is sent, Meta's Cloud API renders the template from Meta's own storage where newlines are stored correctly.

2. **AuthKey only sends variable values** — The `bodyValues` dict (`{"1": "John", "2": "500"}`) fills in `{{1}}`, `{{2}}` placeholders. AuthKey does NOT re-send the template body text.

3. **AuthKey's `temp_body` is display-only** — The `getAllTemplate.php` response is for dashboard/API display, not for message delivery.

4. **CRM sends correctly to Meta** — Verified: CRM's `create_meta_template()` passes actual newlines via `httpx` JSON serialization. Meta stores them correctly.

---

## Recommendation

**No code change needed for delivery.** The `\n` is a cosmetic difference in AuthKey's API encoding.

If the user is seeing literal `\n` text on **AuthKey's own dashboard/console**, that is an AuthKey display behavior — not something the CRM controls.

If the user is seeing literal `\n` in the **CRM UI**, check which page:
- TemplatesPage and CampaignWizardPage already have the unescaping fix
- Any new page consuming `temp_body` should apply the same pattern:
  ```javascript
  body.replace(/\\n/g, "\n").replace(/\\'/g, "'")
  ```

**Next**: No action needed unless owner reports specific page where `\n` displays literally in the CRM UI.

---

## Investigation Output

```
Investigation complete: INV-008
Root cause: AuthKey API serialization escapes newlines as literal \n text
Classification: BACKEND/API (third-party — AuthKey.io encoding)
Confidence: HIGH
Steps used: 8/10
Evidence: /app/memory/crm/crm_roi_sprint/investigations/INV_008_TEMPLATE_NEWLINE_ENCODING_INVESTIGATION.md
Recommendation: No code change needed — delivery not impacted
Report: This file
```
