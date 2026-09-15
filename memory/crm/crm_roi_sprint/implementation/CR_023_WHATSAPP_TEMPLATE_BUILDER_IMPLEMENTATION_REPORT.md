# CR-023: WhatsApp Template Builder — Production Readiness — Implementation Report

## Change Request ID: CR-023
## Date: 2026-06-06 (Phases 1-3 implemented in session 5)
## Status: 🟡 IMPLEMENTED — Awaiting owner E2E test
## Retroactive documentation: 2026-06-18

---

## Summary

Full WhatsApp template builder: Meta API v21 integration for template submission, 10-check Meta compliance validation, "Add Variable" button with auto-increment, dynamic URL buttons for e-invoices, WhatsApp live preview, status tracking with auto-polling.

---

## Phase 1: Template Builder Foundation

### Backend — Files Modified
- `routers/whatsapp.py` — 6 new endpoints for custom template lifecycle

### Backend Endpoints
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/whatsapp/custom-templates` | Create custom template (draft) |
| `GET` | `/api/whatsapp/custom-templates` | List custom templates |
| `PUT` | `/api/whatsapp/custom-templates/{id}` | Update template |
| `DELETE` | `/api/whatsapp/custom-templates/{id}` | Delete template |
| `POST` | `/api/whatsapp/custom-templates/{id}/submit` | Submit to Meta via Graph API v21.0 |
| `GET` | `/api/whatsapp/custom-templates/{id}/status` | Check Meta approval status |
| `GET` | `/api/whatsapp/check-template-name` | Check if template name already exists on Meta |
| `POST` | `/api/whatsapp/create-meta-template` | Direct Meta template creation |
| `POST` | `/api/whatsapp/authkey/sync-templates` | Sync templates from AuthKey after Meta approval |
| `POST` | `/api/whatsapp/create-and-sync-template` | Create on Meta + sync to AuthKey in one call |

### Frontend — Files Created/Modified
- `pages/TemplateBuilderPage.jsx` (712 LOC) — Full-page template builder

### Frontend Features
- Template name input with validation (lowercase, underscores, no leading underscore)
- 5 header types: None, Text, Image, Video, Document
- Body textarea with character limit display
- Footer field (60 char limit)
- Buttons UI: Up to 3 buttons, 3 types (URL, Phone, Quick Reply)
- WhatsApp live preview (real-time rendering)
- Status tracker with auto-polling (draft → pending → approved/rejected)
- Duplicate name warning (checks Meta before submission)

### DB Collection
- `custom_templates` — Per-user template drafts with Meta submission status

---

## Phase 2: Meta Compliance Validation (V1-V10)

### Frontend — `validateMetaCompliance()` function
| Check | Rule | Severity |
|---|---|---|
| V1 | Single-brace `{1}` detection → must be `{{1}}` | Error |
| V2 | Variables must be sequential `{{1}}, {{2}}, {{3}}` | Error |
| V3 | Footer must not contain variables | Error |
| V4 | Header allows max 1 variable `{{1}}` | Error |
| V5 | URL button validation (valid URL format) | Error |
| V6 | Phone button validation (valid phone format) | Warning |
| V7 | Quick Reply text required | Error |
| V8 | Media header URL required when type is image/video/document | Error |
| V9 | Template name no leading underscore | Error |
| V10 | Example values must not contain curly braces | Warning |

### Frontend UX
- Real-time inline warnings for V1, V3, V4, V9
- Full error box on submit attempt (all 10 checks)
- Green checkmark when all validations pass

### Backend Safety Net
- `create_meta_template()` in `routers/whatsapp.py` runs V1-V4 checks server-side before calling Meta API
- Returns detailed Meta error messages on rejection

---

## Phase 3: Add Variable + Dynamic URL Button

### "Add Variable" Button
- Orange pill button below body textarea
- Inserts `{{N}}` at cursor position (auto-increments: max existing + 1)
- Header gets separate "Add {{1}}" button — disabled after first use (Meta 1-var limit)

### Dynamic URL Button
- Static/Dynamic radio toggle on URL buttons
- **Static**: single URL input
- **Dynamic**: Base URL input + `{{1}}` chip + Sample URL input
- Labels: "BASE URL" / "SAMPLE URL (REQUIRED BY META)"
- Backend sends `example` array to Meta for dynamic URLs

### New Variable
- `einvoice_token` added to `core/whatsapp_variables.py` (41 total vars, Order/Bill block)
- Raw 32-char hex token for dynamic URL button suffix

---

## Files Changed Summary

| File | LOC | What Changed |
|---|---|---|
| `routers/whatsapp.py` | 1551 | 10 new endpoints, Meta API v21, compliance validation, sync |
| `pages/TemplateBuilderPage.jsx` | 712 | Full builder UI, validation, preview, status tracking |
| `core/whatsapp_variables.py` | +1 var | `einvoice_token` added (41 total) |

---

## QA Acceptance Criteria

| # | Criteria | How to Verify |
|---|---|---|
| AC1 | Create template draft | `POST /api/whatsapp/custom-templates` → 200, template in DB |
| AC2 | List/update/delete templates | CRUD operations return correct data |
| AC3 | Duplicate name detection | `GET /api/whatsapp/check-template-name?name=existing` → `{exists: true}` |
| AC4 | V1: Single-brace detection | Body with `{1}` → validation error "use {{1}}" |
| AC5 | V2: Sequential variable check | Body with `{{1}} {{3}}` → error "missing {{2}}" |
| AC6 | V3: Footer no variables | Footer with `{{1}}` → error |
| AC7 | V4: Header max 1 variable | Header with `{{1}} {{2}}` → error |
| AC8 | V9: No leading underscore | Name `_test` → error |
| AC9 | Meta submission | `POST /api/whatsapp/create-meta-template` → calls Meta Graph API, returns status |
| AC10 | Status check polling | `GET /api/whatsapp/custom-templates/{id}/status` → returns Meta status |
| AC11 | Add Variable auto-increment | Click "Add Variable" twice → inserts `{{1}}` then `{{2}}` |
| AC12 | Dynamic URL button | URL button with Dynamic toggle → payload includes `example` array |
| AC13 | AuthKey sync after Meta approval | `POST /api/whatsapp/authkey/sync-templates` → syncs approved templates |
| AC14 | WhatsApp preview renders correctly | Template preview shows formatted message matching WhatsApp style |

---

**End of CR-023 Implementation Report**
