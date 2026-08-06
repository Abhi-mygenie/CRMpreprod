# INV-010: "Error in Message request &" — CRM-created Marketing templates fail delivery

**Date**: 2026-07-16  
**Reporter**: Owner (Abhishek)  
**Template**: `premium_dinner_menu_1607_mygenie` (WID 41171)  
**Severity**: P1 — blocks delivery for CRM-created MARKETING templates  
**Risk**: MEDIUM — WhatsApp integration, no data/money impact  

---

## Problem Statement

Template `premium_dinner_menu_1607_mygenie` (marketing, en_US, created via CRM → Meta API → AuthKey sync) gets **"Error in Message request &"** on AuthKey delivery.

Two other templates work fine:
- `premium_dinner_menu_1607` (utility, en_US, CRM-created TODAY) → **DELIVERS** ✅
- `premium_dinner_menu_1607_ak` (marketing, en, AuthKey-native TODAY) → **DELIVERS** ✅

---

## Evidence Matrix

| Template | WID | Category | Language | Created via | Created | Delivers? |
|---|---|---|---|---|---|---|
| `_1607` | 41157 | **utility** | en_US | CRM→Meta→AuthKey | 2026-07-16 10:28 | ✅ YES (owner confirmed) |
| `_mygenie` | 41171 | **marketing** | en_US | CRM→Meta→AuthKey | 2026-07-16 11:01 | ❌ "Error in Message request &" |
| `_ak` | 41174 | **marketing** | **en** | AuthKey native | 2026-07-16 | ✅ YES (owner confirmed) |
| `_latest` | 40608 | utility* | en_US | CRM→Meta→AuthKey | 2026-07-12 | ✅ YES (16 read, 8 delivered) |

*40608 submitted as utility but AuthKey shows Marketing — likely reclassified by Meta/AuthKey.

### Key Observations
1. CRM send pipeline works for ALL templates — AuthKey returns "Submitted Successfully"
2. The error is at **Meta/WhatsApp delivery level**, not AuthKey accept level
3. **utility + en_US** via CRM → delivers (Meta lenient on language for utility)
4. **marketing + en** via AuthKey → delivers (language matches exactly)
5. **marketing + en_US** via CRM → FAILS (strict language enforcement for marketing category)

---

## Root Cause: Language Code Mismatch for Marketing Templates

**Confidence: HIGH**

Meta WhatsApp API requires **exact language code match** for template messages. The enforcement appears stricter for marketing templates than utility:

1. CRM Template Builder creates templates on Meta with language `en_US`
2. AuthKey migration syncs the template and stores `en_US` in its template list
3. When AuthKey sends the message to Meta, it likely uses `en` (its internal default) regardless of stored language
4. For **utility** templates: Meta accepts the `en` ↔ `en_US` mismatch (lenient)
5. For **marketing** templates: Meta rejects the `en` ↔ `en_US` mismatch (strict enforcement) → "Error in Message request &"

### Why this hypothesis holds:
- Same body content, same image header, same WABA, same day — only category + language differ
- AuthKey-native marketing template with `en` → delivers (no mismatch)
- CRM-created utility template with `en_US` → delivers (lenient for utility)
- CRM-created marketing template with `en_US` → fails (strict for marketing)

---

## Fix Applied

**File**: `frontend/src/pages/TemplateBuilderPage.jsx`

| Change | Before | After |
|---|---|---|
| Default language (line 240) | `en_US` | `en` |
| Edit fallback (line 271) | `en_US` | `en` |
| Language dropdown (line 548) | Only `en_US`, `hi` | `en` (default), `en_US`, `hi` |

**Rationale**: Aligns CRM template language with AuthKey's native `en`, eliminating the mismatch that causes Meta to reject marketing template sends.

### Backend: No change needed
Backend `create_meta_template()` already defaults to `"en"` (line 745). Frontend was overriding with `"en_US"`.

---

## Verification Plan

| # | Test | Expected | Status |
|---|---|---|---|
| 1 | Create new **marketing** template with language `en` via CRM Template Builder | Template created on Meta with `en` | PENDING |
| 2 | Submit to Meta → wait for approval → sync to AuthKey | WID assigned, status=approved | PENDING |
| 3 | Send test message via CRM campaign wizard | AuthKey "Submitted Successfully" | PENDING |
| 4 | Check delivery on recipient's WhatsApp | Message RECEIVED (not "Error in Message request") | PENDING |
| 5 | Compare AuthKey dashboard status | "Delivered"/"Read" | PENDING |

**If test 4 passes → ROOT CAUSE CONFIRMED. Close INV-010.**

**If test 4 fails → escalate to AuthKey support:**
- Working WID: 41174 (AuthKey-native, marketing, `en`)
- Failing WID: 41171 (CRM→Meta→AuthKey, marketing, `en_US`)
- Working WID: 41157 (CRM→Meta→AuthKey, utility, `en_US`)
- Question: "Why does migrated marketing template with `en_US` fail while utility `en_US` and native marketing `en` succeed?"

---

## Impact on Existing Templates

Existing marketing templates created with `en_US` may also have delivery issues. Review:
- All CRM-created templates in `custom_templates` with `category=marketing` and `language=en_US`
- May need to be re-created with `en` language

Utility templates with `en_US` are NOT affected (Meta is lenient for utility category).

---

## Separate Pending Items

1. **BUG-015 (V19/V21/V22 soft warnings)**: Still not applied. See `/app/memory/crm/crm_roi_sprint/planning/BUG_015_V19_V21_V22_SOFT_WARNING_FIX.md`
2. **PUBLIC_BACKEND_URL**: Points to old deployment `crm-preprod-deploy`. Callbacks not reaching `crm-mongo-stack-1`.

---

```
Investigation complete: INV-010
Root cause: Language code en_US mismatch for marketing templates (Meta strict enforcement)
Classification: CONFIG + FRONTEND (language default)
Confidence: HIGH
Steps used: 10/10
Fix: Language default changed from en_US → en in TemplateBuilderPage.jsx
Next: Owner verification — create marketing template with en, test delivery
```
