# CR-023 — WhatsApp Template Builder: Production Readiness — Implementation Plan

**CR**: CR-023
**Status**: `plan_drafted_awaiting_signoff`
**Author**: E1
**Date**: 2026-06-06
**Discovery**: `../discovery/CR_023_WHATSAPP_TEMPLATE_BUILDER_PRODUCTION_READINESS_DISCOVERY.md`
**Mock**: `/app/frontend/public/cr023_mock.html` (owner-approved 2026-06-06)
**Branch**: `5-june`

---

## 1. Locked Decisions (from Q1-Q5)

| Q | Answer | Locks |
|---|---|---|
| Q1 | Buttons in Phase 1 | Quick Reply, URL, Call — up to 3 buttons |
| Q2 | English + Hindi only | 2 languages: `en_US`, `hi` |
| Q3 | Image headers important | Image URL + Upload button in form |
| Q4 | Status tracking critical | Backend polling endpoint + frontend status tracker |
| Q5 | Full-page builder | New `/template-builder` route, replace modal |

---

## 2. Scope — Phase 1 (This Plan)

All 4 P0 fixes + key P1 features. After Phase 1, "Submit to Meta" works for text + image templates with buttons.

| # | Gap | Fix |
|---|---|---|
| G1 | Meta API v17.0 → v21.0 | Update URL |
| G2 | Language `en` → `en_US` | Language code mapping |
| G3 | body_text example format | Verify/fix array wrapping |
| G4 | Media header example missing | Add `header_handle` for image headers |
| G5 | No button UI | Full buttons section (Quick Reply / URL / Call) |
| G6 | No char limits | Inline counters + validation |
| G7 | No name validation | Regex enforcement + hint |
| G8 | No status tracking | New `GET /whatsapp/template-status/{id}` + polling |
| G9 | No duplicate check | Pre-submit name check against Meta |
| G11 | No media upload | URL input + upload placeholder (actual upload deferred) |
| G12 | Poor error display | Surface Meta error details in toast |

**Deferred to Phase 2**: G10 (more languages), G13 (per-template AuthKey sync), G14 (allow_category_change).

---

## 3. Exact File Changes

### 3.1 `backend/routers/whatsapp.py` — 5 edits

**Edit W1 — Meta API version (G1, line 362)**

Before:
```python
meta_url = f"https://graph.facebook.com/v17.0/{waba_id}/message_templates"
```
After:
```python
meta_url = f"https://graph.facebook.com/v21.0/{waba_id}/message_templates"
```

**Edit W2 — Language code mapping (G2, line 286)**

Before:
```python
language = payload.get("language", "en")
```
After:
```python
_LANG_MAP = {"en": "en_US", "en_US": "en_US", "hi": "hi"}
raw_lang = payload.get("language", "en")
language = _LANG_MAP.get(raw_lang, raw_lang)
```

**Edit W3 — Body example format verification (G3, line 318-319)**

Current code wraps correctly: `[body_examples]` → `[["a","b"]]`. Verify and add defensive check:
```python
if "{{" in body_text and body_examples:
    # Meta requires body_text as array of arrays: [["val1","val2"]]
    body_component["example"] = {"body_text": [body_examples]}
```
This is already correct. Add a comment confirming.

**Edit W4 — Media header example (G4, lines 292-304)**

After the existing header component block, add media header example handling:
```python
if header_type in ("image", "video", "document"):
    media_url = payload.get("media_url", "")
    if media_url:
        header_component["example"] = {"header_handle": [media_url]}
```

**Edit W5 — Button components format (G5, lines 332-348)**

Current button handling exists but needs Meta format compliance check. Verify:
- `QUICK_REPLY` buttons only need `type` + `text`
- `URL` buttons need `type` + `text` + `url`
- `PHONE_NUMBER` buttons need `type` + `text` + `phone_number`

Current code is correct. No change needed.

**Edit W6 — New endpoint: template status check (G8)**

New endpoint after line 254:
```python
@router.get("/custom-templates/{template_id}/status")
async def check_template_status(template_id: str, user: dict = Depends(get_current_user)):
    """Check template approval status from Meta and update local record."""
    template = await db.custom_templates.find_one(
        {"id": template_id, "user_id": user["id"]}, {"_id": 0}
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    meta_tid = template.get("meta_template_id")
    if not meta_tid:
        return {"status": template.get("status", "draft"), "meta_status": None}
    
    user_doc = await db.users.find_one(
        {"id": user["id"]}, {"meta_waba_id": 1, "meta_access_token": 1}
    )
    waba_id = user_doc.get("meta_waba_id")
    access_token = user_doc.get("meta_access_token")
    
    if not waba_id or not access_token:
        return {"status": template.get("status", "draft"), "meta_status": "credentials_missing"}
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://graph.facebook.com/v21.0/{meta_tid}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"fields": "name,status,category,language"}
            )
        meta_data = resp.json()
        meta_status = meta_data.get("status", "").upper()
        
        # Map Meta status to our status
        status_map = {"APPROVED": "approved", "REJECTED": "rejected", "PENDING": "pending", "IN_APPEAL": "pending"}
        new_status = status_map.get(meta_status, template.get("status", "pending"))
        
        # Update local record
        reject_reason = meta_data.get("quality_score", {}).get("reasons") or meta_data.get("rejected_reason")
        update_fields = {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}
        if reject_reason:
            update_fields["reject_reason"] = str(reject_reason)
        
        await db.custom_templates.update_one(
            {"id": template_id}, {"$set": update_fields}
        )
        
        return {
            "status": new_status,
            "meta_status": meta_status,
            "meta_template_id": meta_tid,
            "reject_reason": reject_reason,
        }
    except Exception as e:
        return {"status": template.get("status", "pending"), "meta_status": "check_failed", "error": str(e)}
```

**Edit W7 — New endpoint: duplicate name check (G9)**

```python
@router.get("/check-template-name")
async def check_template_name(name: str, user: dict = Depends(get_current_user)):
    """Check if template name already exists on Meta."""
    user_doc = await db.users.find_one(
        {"id": user["id"]}, {"meta_waba_id": 1, "meta_access_token": 1}
    )
    waba_id = user_doc.get("meta_waba_id")
    access_token = user_doc.get("meta_access_token")
    
    if not waba_id or not access_token:
        return {"exists": False, "error": "credentials_missing"}
    
    clean_name = name.strip().lower().replace(" ", "_")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://graph.facebook.com/v21.0/{waba_id}/message_templates",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"name": clean_name, "fields": "name,status", "limit": 1}
            )
        data = resp.json()
        templates = data.get("data", [])
        exists = any(t.get("name") == clean_name for t in templates)
        return {"exists": exists, "clean_name": clean_name}
    except Exception:
        return {"exists": False, "error": "check_failed"}
```

**Edit W8 — Better error response from Meta (G12, lines 380-387)**

Before:
```python
if response.status_code != 200:
    error_msg = response_data.get("error", {}).get("message", "Unknown error")
    ...
    raise HTTPException(status_code=response.status_code, detail=f"Meta API error: {error_msg}")
```
After:
```python
if response.status_code != 200:
    error_obj = response_data.get("error", {})
    error_msg = error_obj.get("message", "Unknown error")
    error_code = error_obj.get("code", "")
    error_subcode = error_obj.get("error_subcode", "")
    user_msg = error_obj.get("error_user_msg", "")
    detail_parts = [f"Meta API error: {error_msg}"]
    if user_msg:
        detail_parts.append(f"Details: {user_msg}")
    if error_code:
        detail_parts.append(f"(code: {error_code}, subcode: {error_subcode})")
    raise HTTPException(status_code=response.status_code, detail=" | ".join(detail_parts))
```

### 3.2 `frontend/src/pages/TemplateBuilderPage.jsx` — NEW FILE

New full-page template builder replacing the modal. Key sections:

1. **Top bar**: Back button, template name display, status pill, Save Draft / Submit to Meta buttons
2. **Left panel (form)**: Basic Info, Header, Body + examples, Footer, Buttons
3. **Right panel**: WhatsApp preview, Status tracker, Template list

State management:
```javascript
const [template, setTemplate] = useState({
    template_name: "", category: "utility", language: "en_US",
    header_type: "none", header_content: "", media_url: "",
    body: "", footer: "", buttons: [],
    body_examples: [], header_examples: []
});
const [status, setStatus] = useState("new"); // new|draft|pending|approved|rejected
const [nameError, setNameError] = useState("");
const [duplicateWarning, setDuplicateWarning] = useState("");
const [submitting, setSubmitting] = useState(false);
```

Validations (G6, G7):
```javascript
const NAME_REGEX = /^[a-z0-9_]+$/;
const LIMITS = { name: 512, body: 1024, footer: 60, header_text: 60, button_text: 25 };

const validateName = (name) => {
    if (!name) return "Template name is required";
    if (!NAME_REGEX.test(name)) return "Only lowercase letters, numbers, and underscores allowed";
    if (name.length > LIMITS.name) return `Max ${LIMITS.name} characters`;
    return "";
};
```

Button UI (G5):
```jsx
// Button types: QUICK_REPLY (text only), URL (text + url), PHONE_NUMBER (text + phone)
// Max 3 buttons. Add/remove with type selector per row.
```

Status polling (G8):
```javascript
// After submit, poll every 30 seconds for 5 minutes, then every 2 minutes
useEffect(() => {
    if (status === "pending" && templateId) {
        const interval = setInterval(async () => {
            const res = await api.get(`/whatsapp/custom-templates/${templateId}/status`);
            if (res.data.status !== "pending") {
                setStatus(res.data.status);
                clearInterval(interval);
            }
        }, 30000);
        return () => clearInterval(interval);
    }
}, [status, templateId]);
```

Duplicate check (G9):
```javascript
// Debounced check on name blur
const checkDuplicate = async (name) => {
    const res = await api.get(`/whatsapp/check-template-name?name=${name}`);
    if (res.data.exists) setDuplicateWarning(`"${res.data.clean_name}" already exists`);
    else setDuplicateWarning("");
};
```

~400-500 lines estimated.

### 3.3 `frontend/src/App.js` — 1 edit

Add route for the new page:
```jsx
import TemplateBuilderPage from "@/pages/TemplateBuilderPage";
...
<Route path="/template-builder" element={<ProtectedRoute><TemplateBuilderPage /></ProtectedRoute>} />
<Route path="/template-builder/:id" element={<ProtectedRoute><TemplateBuilderPage /></ProtectedRoute>} />
```

### 3.4 `frontend/src/pages/TemplatesPage.jsx` — 2 edits

**Edit T1**: Change "Add Template" button to navigate to `/template-builder` instead of opening modal:
```jsx
// Before: setShowAddTemplate(true)
// After:  navigate("/template-builder")
```

**Edit T2**: Change "Edit" button on draft cards to navigate:
```jsx
// Before: openEditCustomTemplate(ct)
// After:  navigate(`/template-builder/${ct.id}`)
```

Keep the modal code for now (don't delete — can be removed in cleanup phase).

---

## 4. Implementation Sequence

| # | Step | Files | Verify |
|---|---|---|---|
| 1 | Backend P0 fixes (W1-W4) | `routers/whatsapp.py` | curl Meta API with test payload |
| 2 | Backend new endpoints (W6-W7) | `routers/whatsapp.py` | curl status check + name check |
| 3 | Backend error improvement (W8) | `routers/whatsapp.py` | Submit invalid template, check error detail |
| 4 | Frontend: create TemplateBuilderPage.jsx | new file | Screenshot — form renders with all sections |
| 5 | Frontend: App.js route + TemplatesPage navigation | 2 files | Click "Add Template" → navigates to builder |
| 6 | E2E test: Submit a real text template to Meta | full stack | Template appears in Meta Business Manager as PENDING |
| 7 | E2E test: Submit template with image header | full stack | Header media accepted |
| 8 | E2E test: Submit template with buttons | full stack | Buttons render in WhatsApp preview |
| 9 | Status polling: Submit → wait → check status updates | full stack | Status changes from pending → approved/rejected |
| 10 | Docs: update dashboard, register, decisions, PRD | memory/ | All governance docs current |

---

## 5. Acceptance Criteria

| # | AC | Test method |
|---|---|---|
| AC1 | Meta API URL uses v21.0 | Code inspection |
| AC2 | Language sent as `en_US` not `en` | Backend log of Meta payload |
| AC3 | Body examples formatted as `[["val1","val2"]]` | Backend log of Meta payload |
| AC4 | Image header includes `header_handle` example | Backend log of Meta payload |
| AC5 | Template name input enforces `[a-z0-9_]` with inline error | Screenshot |
| AC6 | Body shows char counter `N / 1024`, red when over | Screenshot |
| AC7 | Footer shows char counter `N / 60` | Screenshot |
| AC8 | Buttons: can add up to 3 (Quick Reply / URL / Call), remove individually | Screenshot |
| AC9 | Button text shows `N / 25` char counter | Screenshot |
| AC10 | Duplicate name warning shown before submit | Screenshot + curl |
| AC11 | Meta error message shown in detail (not generic) | Submit invalid → check toast |
| AC12 | Status tracker shows Draft → Submitted → Pending → Approved/Rejected | Screenshot |
| AC13 | Status auto-polls and updates when Meta approves/rejects | Observation |
| AC14 | "Add Template" from Templates page navigates to `/template-builder` | Screenshot |
| AC15 | "Edit" on draft navigates to `/template-builder/{id}` with pre-filled form | Screenshot |
| AC16 | WhatsApp preview updates live with form content | Screenshot |
| AC17 | Save as Draft works (no Meta submission) | curl check `custom_templates` |
| AC18 | Submit to Meta creates template on Meta + saves locally as pending | curl + Meta Business Manager |

---

## 6. Rollback Strategy

| Step | Rollback |
|---|---|
| Backend edits | `git checkout -- backend/routers/whatsapp.py` |
| New frontend page | `rm frontend/src/pages/TemplateBuilderPage.jsx` + revert App.js route |
| TemplatesPage nav changes | `git checkout -- frontend/src/pages/TemplatesPage.jsx` |

No DB migrations. Custom templates collection schema unchanged (additive fields only: `reject_reason`).

---

## 7. Effort Estimate

| Component | Estimate |
|---|---|
| Backend fixes (W1-W8) | ~2 hours |
| TemplateBuilderPage.jsx (new) | ~4 hours |
| App.js + TemplatesPage nav | ~30 min |
| E2E testing with Meta | ~1 hour |
| Docs | ~30 min |
| **Total** | **~8 hours (~1 day)** |

---

## 8. Risks

| # | Risk | P | I | Mitigation |
|---|---|---|---|---|
| R1 | Meta access_token expired | M | H | Check before submit; surface "Token expired, update in Settings" |
| R2 | v21.0 has different component format | L | H | Web-searched and confirmed format is same |
| R3 | Image header `header_handle` needs Media API upload, not raw URL | M | M | Try URL first; if Meta rejects, add Media API upload |
| R4 | Status polling hammers Meta API | L | L | Poll every 30s for 5 min, then every 2 min, max 30 min |

---

## 9. Open Questions (None)

All decisions locked via Q1-Q5 + mock approval.

---

**END OF PLAN — CR-023 Phase 1**
