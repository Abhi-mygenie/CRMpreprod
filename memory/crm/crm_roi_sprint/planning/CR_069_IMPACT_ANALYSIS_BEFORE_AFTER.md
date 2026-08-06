# CR-069 — Impact Analysis & Before/After Screen Comparison

**CR ID**: CR-069  
**Role**: Planning Agent  
**Date**: 2026-07-29  
**Reference Template**: `final_bill` (wid=41354, tenant: owner@hungry.com / Hungry Keya)  
**Source**: CR-069 Intake Doc + INV-012 Investigation  

---

## Template Reference: `final_bill`

**Body**: 7 variables (`{{1}}`–`{{7}}`) — customer name, amount, bill number, payment method, points earned, points redeemed, points balance.

**Buttons** (from `custom_templates` DB):
| # | Label | Type | URL | Needs Mapping? |
|---|---|---|---|---|
| 0 | Feedback | Static URL | `https://g.page/r/CVS6trbBhsHmEBE/review` | NO |
| 1 | Bill | Dynamic URL | `https://crm.mygenie.online/{{1}}` | **YES** — `{{1}}` = invoice token |

---

## SCREEN 1 — Templates Page: Template Card (Variable Chips)

**Location**: WhatsApp > Templates > `final_bill` card  
**File**: `TemplatesPage.jsx` lines 664-675

### BEFORE (current — captured)

The `final_bill` card shows:
```
final_bill  [Approved]                              Map  Preview  [Mapped]
Utility
{{1}} → Customer Name  {{2}} → Amount  {{3}} → Bill Number  {{4}} → Payment Method
{{5}} → Points Earned  {{6}} → Points Redeemed  {{7}} → Points Balance
```

7 green chips for body variables. No indication that the template has buttons. Badge shows "Mapped" (green) — implies everything is configured. **User has zero visibility that a dynamic URL button exists and needs mapping.**

### AFTER (proposed)

```
final_bill  [Approved]  [2 Buttons]                 Map  Preview  [Needs Button Mapping]
Utility
{{1}} → Customer Name  {{2}} → Amount  {{3}} → Bill Number  {{4}} → Payment Method
{{5}} → Points Earned  {{6}} → Points Redeemed  {{7}} → Points Balance
🔗 "Bill" URL {{1}} → ??? (unmapped)
```

Changes:
- New **[2 Buttons]** badge next to "Approved" — indicates template has buttons (light gray/blue info badge)
- New **link-icon chip** row for dynamic URL button variables: `🔗 "Bill" URL {{1}}` — amber (unmapped) or green (mapped)
- Static buttons ("Feedback") do NOT get a chip — nothing to map
- **Mapped/Not Mapped badge logic** changes: amber "Needs Button Mapping" if any dynamic URL button var is unmapped, even if all body vars are mapped
- Templates without buttons: **zero change** — behaves exactly as today

---

## SCREEN 2 — Templates Page: WhatsApp Preview Bubble

**Location**: WhatsApp > Templates > `final_bill` > click "Preview"  
**File**: `TemplatesPage.jsx` lines 677-694

### BEFORE (current — captured)

```
┌─────────────────────────────────────────┐
│ Namaste priti ,                         │
│                                         │
│ We have successfully received your      │
│ payment of Rs.756.1 for the order       │
│ KM-1234 via UPI.                        │
│                                         │
│ - Loyalty Points Earned: 0              │
│ - Loyalty Redeemed: 0                   │
│ - Total Loyalty Earned: 0               │
│                                         │
│ Hungry Keya would love your feedback... │
│                                         │
│ Thank you for choosing us. 🙏           │
│                                  16:40 ✓✓│
└─────────────────────────────────────────┘
```

Body text only. The message ENDS here. **No button bars visible.** The real WhatsApp message shows two tappable buttons below — but the CRM preview hides them entirely.

### AFTER (proposed)

```
┌─────────────────────────────────────────┐
│ Namaste priti ,                         │
│                                         │
│ We have successfully received your      │
│ payment of Rs.756.1 for the order       │
│ KM-1234 via UPI.                        │
│ ...                                     │
│ Thank you for choosing us. 🙏           │
│                                  16:40 ✓✓│
├─────────────────────────────────────────┤
│  ↗ Feedback                             │
├─────────────────────────────────────────┤
│  ↗ Bill                                 │
└─────────────────────────────────────────┘
```

Changes:
- **Button bars** rendered below the message body, separated by thin borders (matching real WhatsApp look)
- Static URL buttons show label only: `↗ Feedback`
- Dynamic URL buttons show label: `↗ Bill`
- Styling: light border, center-aligned text, link-colored, same WhatsApp green bubble background
- Templates without buttons: **zero change**

---

## SCREEN 3 — Templates Page: Map Dialog (Top)

**Location**: WhatsApp > Templates > `final_bill` > click "Map"  
**File**: `TemplatesPage.jsx` lines 245-274, 798-960

### BEFORE (current — captured)

Dialog title: "Map Template Variables — final_bill · Event: send_bill"

WhatsApp preview bubble at top (body text only).

Then variable slots:
```
{{1}}    [Map] [Text] [Menu]     Customer Name    e.g. John         ▼
{{2}}    [Map] [Text] [Menu]     Amount           e.g. Rs.1,000     ▼
{{3}}    [Map] [Text] [Menu]     Bill Number      e.g. KM-1234      ▼
{{4}}    [Map] [Text] [Menu]     Payment Method   e.g. UPI          ▼
{{5}}    [Map] [Text] [Menu]     Points Earned    e.g. 50           ▼
{{6}}    [Map] [Text] [Menu]     Points Redeemed  e.g. 100          ▼
{{7}}    [Map] [Text] [Menu]     Points Balance   e.g. 1,250        ▼

                                          [Cancel]  [Save Mappings]
```

7 body variable slots. Dialog ends. **No button URL section.** The dynamic URL `{{1}}` on the "Bill" button is completely invisible.

### AFTER (proposed)

```
Dialog title: "Map Template Variables — final_bill · Event: send_bill"

┌─ WhatsApp Preview (with button bars) ─────────────────┐
│ Namaste priti , ...                                    │
│ Thank you for choosing us. 🙏              16:40 ✓✓   │
├────────────────────────────────────────────────────────┤
│  ↗ Feedback                                            │
├────────────────────────────────────────────────────────┤
│  ↗ Bill                                                │
└────────────────────────────────────────────────────────┘

── Body Variables ──────────────────────────────────────

{{1}}    [Map] [Text] [Menu]     Customer Name    e.g. John         ▼
{{2}}    [Map] [Text] [Menu]     Amount           e.g. Rs.1,000     ▼
  ...
{{7}}    [Map] [Text] [Menu]     Points Balance   e.g. 1,250        ▼

── Button URL Parameters ──────────────────────────────  ← NEW SECTION

🔗 "Bill" button URL {{1}}
     [Map] [Text]               E-Invoice Token  e.g. c70c5c76...  ▼
     Base URL: https://crm.mygenie.online/
     Full URL preview: https://crm.mygenie.online/c70c5c76dff54277...

ℹ️ "Feedback" button — static URL, no mapping needed.

                                          [Cancel]  [Save Mappings]
```

Changes:
- **Preview bubble** now shows button bars (same as Screen 2)
- **New "Button URL Parameters" section** below body variables
  - Only shows slots for buttons with `url_type: "dynamic"`
  - Each slot shows: button label, the URL `{{N}}` placeholder, Map/Text picker
  - Static buttons shown as info note: "Feedback — static URL, no mapping needed"
  - Base URL shown as read-only context
  - Full URL preview updates live as mapping is selected
- **Same variable picker** (Map/Text/Menu) reused from body variables — can pick `einvoice_token` from the "Order & Bill" block
- Templates without buttons: **section doesn't appear — zero change**

---

## SCREEN 4 — WhatsApp Automation: Test Template Modal

**Location**: WhatsApp > Automation > any event with `final_bill` mapped > click "Test"  
**File**: `WhatsAppAutomationContent.jsx` lines 108-215

### BEFORE (current)

```
┌─ Test Template ─────────────────────────────┐
│ final_bill                                   │
│ Event: send_bill                             │
│                                              │
│ Send Test To:  [+91] [9876543210]           │
│                                              │
│ Template Variables:                          │
│ ┌─ {{1}} ──────── [Manual] [Mapped] ──────┐ │
│ │ [Enter value for {{1}}              ]    │ │
│ └──────────────────────────────────────────┘ │
│ ┌─ {{2}} ──────── [Manual] [Mapped] ──────┐ │
│ │ ...                                      │ │
│   ... (7 body variable inputs)              │
│                                              │
│ Preview:                                     │
│ ┌──────────────────────────────────────────┐ │
│ │ Namaste Test User, ...         16:40 ✓✓  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│                              [Send Test]     │
└──────────────────────────────────────────────┘
```

7 body variable inputs. Preview shows body only. **No button variable inputs.** Test send fires with `bodyValues` only — dynamic URL button gets no token.

### AFTER (proposed)

```
┌─ Test Template ─────────────────────────────┐
│ final_bill                                   │
│ Event: send_bill                             │
│                                              │
│ Send Test To:  [+91] [9876543210]           │
│                                              │
│ Template Variables:                          │
│ ┌─ {{1}} ──────── [Manual] [Mapped] ──────┐ │
│ │ [Enter value for {{1}}              ]    │ │
│ └──────────────────────────────────────────┘ │
│   ... (7 body variable inputs)              │
│                                              │
│ Button URL Parameters:              ← NEW    │
│ ┌─ 🔗 "Bill" URL {{1}} ── [Manual] [Mapped]┐│
│ │ [c70c5c76dff54277a23144256ba5a543]       │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ Preview:                                     │
│ ┌──────────────────────────────────────────┐ │
│ │ Namaste Test User, ...         16:40 ✓✓  │ │
│ ├──────────────────────────────────────────┤ │
│ │  ↗ Feedback                              │ │
│ ├──────────────────────────────────────────┤ │
│ │  ↗ Bill                                  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│                              [Send Test]     │
└──────────────────────────────────────────────┘
```

Changes:
- **New "Button URL Parameters" section** with input for the dynamic URL button `{{1}}`
- "Mapped" mode pulls `einvoice_token` example value; "Manual" mode lets user type any token
- **Preview bubble** shows button bars
- **Send Test** backend call includes `buttonValues` in the AuthKey payload
- Templates without buttons: **zero change**

---

## SCREEN 5 — Campaign Wizard: Template Dropdown

**Location**: Marketing > Campaigns > New > Step 2 "Choose Message Template"  
**File**: `CampaignWizardPage.jsx` lines 126-137, 160-164

### BEFORE (current — captured)

Template dropdown shows:
```
final_bill (7 variables, fully mapped)    ← FALSE green signal
```

`isFullyMapped()` counts 7 body variables, all mapped → returns `true`. **The unmapped dynamic URL button variable is invisible.** User proceeds thinking everything is configured.

### AFTER (proposed)

```
final_bill (7 body + 1 button variable, needs button mapping)    ← CORRECT amber signal
```

Changes:
- Variable count includes button dynamic URL variables: `7 body + 1 button`
- `isFullyMapped()` checks BOTH body vars AND button vars
- If button var is unmapped: shows "needs button mapping" in amber
- Templates without buttons: shows exactly as today, e.g., `loyalty_bill (9 variables, fully mapped)` — **zero change**

---

## SCREEN 6 — Campaign Wizard: Variable Mapping Grid + WhatsApp Preview

**Location**: Marketing > Campaigns > New > Step 2 after selecting `final_bill`  
**File**: `CampaignWizardPage.jsx` lines 470-543

### BEFORE (current)

Left side — Variable Mapping Grid:
```
┌─ Variable Mapping ──────────────────┐
│ {{1}}  →  customer_name             │
│ {{2}}  →  total_amount              │
│ {{3}}  →  bill_number               │
│ {{4}}  →  payment_method            │
│ {{5}}  →  points_earned             │
│ {{6}}  →  points_redeemed           │
│ {{7}}  →  points_balance            │
│ All 7 variables mapped ✓            │
└─────────────────────────────────────┘
```

Right side — WhatsApp Preview:
```
┌─────────────────────────────┐
│ Namaste priti , ...         │
│ Thank you. 🙏    16:40 ✓✓  │
└─────────────────────────────┘
```

Grid shows 7 body variable rows only. "All 7 variables mapped ✓" — **false completeness signal**. Preview shows body only, no buttons.

### AFTER (proposed)

Left side — Variable Mapping Grid:
```
┌─ Variable Mapping ──────────────────┐
│ {{1}}  →  customer_name             │
│ {{2}}  →  total_amount              │
│ {{3}}  →  bill_number               │
│ {{4}}  →  payment_method            │
│ {{5}}  →  points_earned             │
│ {{6}}  →  points_redeemed           │
│ {{7}}  →  points_balance            │
│                                     │
│ 🔗 Button URLs                      │  ← NEW
│ "Bill" {{1}}  →  einvoice_token     │
│                                     │
│ All 7 body + 1 button mapped ✓      │
└─────────────────────────────────────┘
```

Right side — WhatsApp Preview:
```
┌─────────────────────────────┐
│ Namaste priti , ...         │
│ Thank you. 🙏    16:40 ✓✓  │
├─────────────────────────────┤
│  ↗ Feedback                 │  ← NEW
├─────────────────────────────┤
│  ↗ Bill                     │  ← NEW
└─────────────────────────────┘
```

Changes:
- **New "Button URLs" sub-section** in the mapping grid with `🔗` prefix
- Count updates: "All 7 body + 1 button mapped ✓"
- **WhatsApp Preview** renders button bars
- Templates without buttons: **zero change** to grid or preview

---

## SCREEN 7 — Campaign Wizard: Test Send Panel

**Location**: Marketing > Campaigns > New > Step 2 > "Send Test Message" panel  
**File**: `CampaignWizardPage.jsx` line 490-516 → `campaigns.py` line 644-770

### BEFORE (current)

```
┌─ Send Test Message ─────────────────────────┐
│ Verify the template renders correctly.       │
│ [9999999999]                   [Send Test]   │
└──────────────────────────────────────────────┘
```

Test fires with `bodyValues` only. Dynamic URL button token is NOT included.

### AFTER (proposed)

**No visible UI change** on this panel — the phone input + Send Test button stays the same.

**Backend change**: the `test_send_campaign` endpoint resolves button variable mappings and includes `buttonValues: {"1": "<token>"}` in the AuthKey payload. The test recipient's "Bill" button now works.

---

## SCREEN 8, 9, 10 — Backend Send Paths (No Visible UI — Payload Changes Only)

These are invisible to the user but affect what the WhatsApp recipient sees:

| # | Send Path | Before | After |
|---|---|---|---|
| 8 | Campaign test-send | `bodyValues` only | `bodyValues` + `buttonValues` |
| 9 | Live event trigger (`send_bill`) | `bodyValues` only | `bodyValues` + `buttonValues` |
| 10 | Campaign bulk send | `bodyValues` only | `bodyValues` + `buttonValues` |

**What the WhatsApp recipient sees:**

BEFORE: Taps "Bill" button → opens `https://crm.mygenie.online/` (broken — no token)  
AFTER: Taps "Bill" button → opens `https://crm.mygenie.online/c70c5c76dff54277a23144256ba5a543` (correct invoice)

---

## Summary: Files WILL Change

| File | Screens Fixed | Nature of Change |
|---|---|---|
| `backend/routers/whatsapp.py` | 1, 2, 3, 4 | Add `buttons` to enrichment projection + enrichment loop |
| `frontend/src/pages/TemplatesPage.jsx` | 1, 2, 3 | Button chips + preview buttons + Map dialog button section |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | 4 | Test modal button inputs + preview buttons |
| `frontend/src/pages/CampaignWizardPage.jsx` | 5, 6, 7 | Dropdown count + grid section + preview buttons + isFullyMapped |
| `backend/core/whatsapp.py` | 9 | WhatsAppMessage.button_values + send payload + event trigger resolution |
| `backend/routers/campaigns.py` | 8, 10 | Test-send + bulk-send button resolution |

## Files WILL NOT Change

`core/whatsapp_variables.py`, `core/coupon.py`, `core/loyalty.py`, `routers/pos.py`, `core/campaign_jobs.py`, `models/schemas.py`, `services/invoice_generator.py`, `core/scheduler.py`

---

## Verification Matrix

| V# | Acceptance Criteria | How to Verify |
|---|---|---|
| V1 | Button chips on template card | Open Templates page → `final_bill` → see `🔗 "Bill" URL {{1}}` chip |
| V2 | Button bars in template preview | Click Preview on `final_bill` → buttons below bubble |
| V3 | Button slots in Map dialog | Click Map on `final_bill` → "Button URL Parameters" section with `"Bill" URL {{1}}` |
| V4 | Map + save `einvoice_token` to button | Select `einvoice_token` for button slot → Save → reload → mapping persists |
| V5 | Test Template modal button inputs | Automation → send_bill → Test → button input visible |
| V6 | Campaign dropdown count | Wizard Step 2 → dropdown shows `7 body + 1 button` |
| V7 | Campaign mapping grid button row | Select `final_bill` → grid shows `🔗 "Bill" {{1}} → einvoice_token` |
| V8 | Campaign preview buttons | Preview bubble shows Feedback + Bill bars |
| V9 | Campaign test-send button payload | Send test → check backend log → `buttonValues` present |
| V10 | Live event send button payload | Trigger POS order → check `whatsapp_message_logs` → confirm button value resolved |
| V11 | No-button templates unchanged | Check `loyalty_bill` (no buttons) → zero visual change |
| V12 | Static buttons no mapping slot | Check `hungrybill_2` (1 static button) → button shown in preview but no mapping slot |

---

## Open Questions Carried Forward

| # | Question | Status |
|---|---|---|
| **Q1** | Does AuthKey's `requestjson.php` accept `buttonValues`? | UNKNOWN — test empirically with a live test-send during implementation |

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| AuthKey rejects `buttonValues` (Q1) | Test with a single test-send first. If rejected, only include `buttonValues` when AuthKey confirms support — body-only sends remain unaffected |
| Button variable key collision with body variables | Use `btn_url_{{N}}` prefix — distinct namespace from body `{{N}}` |
| Existing mappings break | Button mappings are NEW keys in the same dict — existing body mappings untouched |
| Templates without buttons regress | All new code gated by `if (buttons?.length > 0)` — zero execution path for buttonless templates |

---

```
Planning complete: CR-069
Stage: Impact Analysis
Code reality: PARTIAL (button data exists in DB, not surfaced)
Risk: MEDIUM-HIGH
Files WILL change: routers/whatsapp.py, core/whatsapp.py, routers/campaigns.py,
                   TemplatesPage.jsx, CampaignWizardPage.jsx, WhatsAppAutomationContent.jsx
Files WILL NOT touch: core/whatsapp_variables.py, core/coupon.py, core/loyalty.py,
                      routers/pos.py, core/campaign_jobs.py, models/schemas.py
Owner decisions: none required (additive changes, no policy ambiguity)
Docs: planning/CR_069_IMPACT_ANALYSIS_BEFORE_AFTER.md
Next: Owner approval → Implementation
```

*End of CR-069 Impact Analysis*
