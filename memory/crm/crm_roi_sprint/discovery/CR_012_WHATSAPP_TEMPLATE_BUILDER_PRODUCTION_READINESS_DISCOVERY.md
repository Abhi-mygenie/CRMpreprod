# CR-012 — WhatsApp Template Builder Production Readiness

**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr012_registered_discovery_complete`
**Depends on:** CR-004 (WhatsApp module — P2.5-B complete)
**Related to:** CR-004 (same WhatsApp module, separate scope — template *creation* vs template *variable mapping*)

---

## 1. Purpose

The "Add Template" page in CRM is currently a prototype. It allows owners to create a WhatsApp template with name, category, language, header, body, footer — and submit it to Meta via Graph API. However, it is **not production-ready** for Meta's WhatsApp Business API standards. This CR covers the gap analysis, refactoring, and missing features needed to make the template builder production-grade.

This CR is **separate from CR-004** — CR-004 handles variable mapping, event triggers, and the send pipeline. CR-012 handles the template *creation and submission* UI and backend.

---

## 2. Current State — What Exists

| Area | Frontend (`TemplatesPage.jsx`) | Backend (`routers/whatsapp.py`) | Status |
|---|---|---|---|
| Template Name | Free text input | `template_name.strip().lower().replace(" ", "_")` | Prototype |
| Category | 3 options (Marketing / Utility / Authentication) | Maps to Meta `category.UPPER()` | OK |
| Language | 2 options (English / Hindi) | Passes to Meta `language` field | Incomplete |
| Header (Text) | Text input with `{{1}}` support + example value | Builds `HEADER` component with `example.header_text` | OK |
| Header (Media) | Raw URL text input for Image / Video / Document | Builds `HEADER` with `format: IMAGE/VIDEO/DOCUMENT` | Prototype |
| Body | Textarea with `{{n}}` extraction + example values per variable | Builds `BODY` component with `example.body_text` | OK |
| Footer | Plain text input | Builds `FOOTER` component | OK |
| Buttons | **Schema exists (`buttons: []`) but ZERO UI** | Builds `BUTTONS` component with `QUICK_REPLY / URL / PHONE_NUMBER` | **Broken — no UI** |
| Authentication OTP | Category selectable but no OTP-specific fields | No `add_security_recommendation`, no `code_expiration_minutes`, no `OTP` button type | **Missing** |
| Preview | Basic WhatsApp bubble (header text + body + footer) | N/A | Prototype |
| Meta API | N/A | Graph API **v17.0** (outdated — current is v21) | Outdated |
| Status tracking | Saved as `status: "pending"` locally | No polling/webhook to update from Meta | **Missing** |
| Save as Draft | Saves to `custom_templates` collection | CRUD endpoints exist | OK |
| Submit to Meta | Calls `POST /create-and-sync-template` | Meta create → AuthKey sync (combined) | OK |

---

## 3. Gap Analysis — 16 Gaps Identified

### Phase 1 — Critical (ship blockers)

| # | Gap | Severity | Detail |
|---|---|---|---|
| **G1** | **Buttons UI completely missing** | **HIGH** | Backend builds Meta `BUTTONS` component correctly from `buttons: []` — but the frontend has **zero UI** to add/edit/remove buttons. No Quick Reply, URL, or Phone Number button builder. Buttons are critical for marketing CTAs and authentication OTP. |
| **G2** | **Authentication template has no OTP flow** | **HIGH** | When `category = Authentication`, Meta requires: `BODY` with `add_security_recommendation: true`, `FOOTER` with `code_expiration_minutes`, and an `OTP` button (`COPY_CODE` or `ONE_TAP`). Current UI shows generic body/footer/header fields — no OTP-specific fields. |
| **G4** | **Template name validation missing** | **MEDIUM** | Meta requires: lowercase letters, numbers, underscores only. Max 512 chars. No spaces, no special chars. Backend does basic cleanup but frontend has no validation, no real-time feedback. |
| **G6** | **Character limits not enforced** | **MEDIUM** | Meta limits: Header text = 60 chars, Body = 1024 chars, Footer = 60 chars. No char counters in UI. |

### Phase 2 — Important (production polish)

| # | Gap | Severity | Detail |
|---|---|---|---|
| **G3** | **Meta Graph API version is v17.0** | **MEDIUM** | Current code calls `graph.facebook.com/v17.0/...`. Production should use **v21**. v17 may be deprecated. |
| **G5** | **Language list incomplete** | **MEDIUM** | Only English + Hindi. Need 10+ Indian languages (Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese) + Arabic, Urdu for restaurant demographics. |
| **G7** | **Media header has no file upload or preview** | **MEDIUM** | Image/Video/Document headers accept only a raw URL. No file upload, no image preview, no URL validation. |
| **G10** | **No template status tracking after Meta submission** | **MEDIUM** | After submission, template is saved as `status: "pending"`. No mechanism to check if Meta approved or rejected. Owner stuck at "pending" forever. |
| **G16** | **Backend missing OTP button types** | **MEDIUM** | Button builder only handles `QUICK_REPLY`, `URL`, `PHONE_NUMBER`. Missing `OTP` type with `otp_type` (COPY_CODE / ONE_TAP), `autofill_text`, `package_name`, `signature_hash`. |

### Phase 3 — Nice to have

| # | Gap | Severity | Detail |
|---|---|---|---|
| **G8** | **No live preview for media headers** | LOW | Image header shows nothing in preview. Should render thumbnail. |
| **G9** | **Preview doesn't substitute example values** | LOW | Preview shows raw `{{1}}` instead of the example values the user typed. |
| **G11** | **No rejection reason display** | LOW | Meta rejection reason not stored or shown. |
| **G12** | **Body variable numbering not validated** | LOW | User could type `{{1}}` and `{{5}}` (skipping 2,3,4). Meta requires sequential. |
| **G13** | **No duplicate template name check** | LOW | Two templates with same name → Meta rejects second. Should check locally. |
| **G14** | **Edit flow doesn't sync back to Meta** | LOW | Editing resets `status: "draft"` locally but doesn't delete/update the Meta-side template. |
| **G15** | **Footer allows variables** | LOW | Meta does NOT allow `{{n}}` in footer. No validation to prevent. |

---

## 4. Recommended Phased Implementation

### Phase 1 — Critical (3-4 sessions)

| Item | Work |
|---|---|
| **P1-A: Buttons Builder UI** | Add button section to Add Template modal: Quick Reply (text only), URL (text + URL), Phone Number (text + phone). Max 3 buttons per Meta spec. Add/remove/reorder. Render in preview. |
| **P1-B: Authentication OTP Template** | When `category = "authentication"`: hide body textarea (Meta auto-generates), show `code_expiration_minutes` input (1-90), show OTP button type selector (COPY_CODE / ONE_TAP), show ONE_TAP-specific fields (package_name, signature_hash). Backend: build Meta auth component format. |
| **P1-C: Template Name Validation** | Regex: `/^[a-z0-9_]+$/`. Real-time red border + helper text. Max 512 chars. Block submission if invalid. |
| **P1-D: Character Limit Counters** | Show `X/60` for header, `X/1024` for body, `X/60` for footer. Orange at 80%, red at 100%. Block submission if exceeded. |

### Phase 2 — Production Polish (2-3 sessions)

| Item | Work |
|---|---|
| **P2-A: API Version Upgrade** | Change `v17.0` → `v21` in backend Meta URL. Test with real submission. |
| **P2-B: Language Expansion** | Add 12+ languages to frontend dropdown. Map to Meta language codes. |
| **P2-C: Media URL Validation + Preview** | Validate URL format. For image headers: show thumbnail preview in bubble. For video: show play icon placeholder. |
| **P2-D: Template Status Polling** | Add `GET /whatsapp/template-status/{meta_template_id}` that checks Meta API for status. Poll on page load or add manual "Check Status" button. Store approval/rejection result. |
| **P2-E: OTP Backend** | Add `OTP` button type to backend builder with `otp_type`, `autofill_text`, `package_name`, `signature_hash`. Build Auth-specific component format. |

### Phase 3 — Polish (1-2 sessions)

| Item | Work |
|---|---|
| P3-A | Example value substitution in preview |
| P3-B | Rejection reason display |
| P3-C | Sequential variable numbering validation |
| P3-D | Duplicate name check (local) |
| P3-E | Footer variable prevention |
| P3-F | Edit → Meta sync (delete old + create new) |

---

## 5. Files Affected

| File | Changes |
|---|---|
| `frontend/src/pages/TemplatesPage.jsx` | Buttons builder UI, auth OTP conditional fields, name validation, char counters, language expansion, media preview |
| `backend/routers/whatsapp.py` | API v21 upgrade, OTP button types, auth component format, template status endpoint |
| `backend/models/schemas.py` | Possibly: button type enum if we want stricter validation |

---

## 6. Dependencies

| Dependency | Status |
|---|---|
| CR-004 P2.5-B (Coupon Picker in Variable Mapping) | ✅ Complete — no conflict |
| Meta WABA ID + Access Token configured | Required — already in Settings page (CR-009) |
| AuthKey API key | Required — already in Settings page |

---

## 7. Effort Estimate

| Phase | Sessions |
|---|---|
| Phase 1 (buttons + auth OTP + name validation + char limits) | 3-4 |
| Phase 2 (API upgrade + languages + media + status tracking + OTP backend) | 2-3 |
| Phase 3 (polish) | 1-2 |
| **Total** | **6-9 sessions** |

---

## 8. Out of Scope

- Template *variable mapping* (owned by CR-004 P2.5-B — done)
- Template *send pipeline* (owned by CR-004 P3+ — future)
- Segment broadcast sends (CR-004 P5 — future)
- WhatsApp provider switch (AuthKey → other) — different CR

---

## 9. Strict Non-Goals For This Registration

- No code changes
- No DB / env / deploy / migration changes
- No edits to CR-004 docs or CRM 1.0 baseline
- No real Meta API calls

---

## 10. Status

```
cr012_registered_discovery_complete
```

**Next:** Phase 1 Planning doc with exact code-level specs per item (P1-A through P1-D).

End of CR-012 Registration + Discovery.
