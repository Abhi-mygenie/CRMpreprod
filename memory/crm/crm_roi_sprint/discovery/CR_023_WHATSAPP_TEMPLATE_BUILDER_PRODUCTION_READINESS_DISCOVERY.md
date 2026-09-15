# CR-023 — WhatsApp Template Builder: Production Readiness — Discovery

**CR**: CR-023
**Status**: `cr023_discovery_phase_0_complete_mock_next`
**Date opened**: 2026-06-06
**Owner**: Abhi
**Tenant**: All (affects template creation for every restaurant)

---

## 1. Problem Statement

The "Add New Template" modal on the Templates page cannot successfully submit templates to Meta for approval. The UI form exists with basic fields (name, category, language, header, body, footer, preview) and the backend has Meta Graph API + AuthKey sync wiring, but multiple gaps prevent real-world use.

Owner report: "adding a template is not working, user is not able to add a template and submit to meta"

---

## 2. Current State (What Exists)

### Frontend (`TemplatesPage.jsx`)
- Add New Template modal with fields: name, category (3 options), language (2 options), header (none/text/image/video/document), body (with `{{n}}` variable detection), body example values (auto-rendered), header example, footer, WhatsApp preview
- "Save as Draft" → saves to `custom_templates` collection
- "Submit to Meta" → calls `POST /whatsapp/create-and-sync-template`
- Edit / Delete / Submit buttons on draft cards

### Backend (`routers/whatsapp.py`)
- CRUD endpoints for `custom_templates` collection (create, list, update, delete, submit-status-change)
- `POST /meta/create-template` — transforms to Meta Graph API format, calls `POST https://graph.facebook.com/v17.0/{waba_id}/message_templates`
- `POST /authkey/sync-templates` — calls AuthKey migration API to sync all templates
- `POST /create-and-sync-template` — combined: Meta Stage 1 → AuthKey Stage 2

### Credentials (verified in DB)
- `meta_waba_id`: configured ✅
- `meta_access_token`: configured ✅
- `authkey_api_key`: configured ✅
- `brand_number`: configured ✅

---

## 3. Gap Analysis (14 Gaps)

### P0 — Submission Blockers (likely causing failures)

| # | Gap | Current | Required | Impact |
|---|---|---|---|---|
| G1 | Meta API version | `v17.0` (2023) | `v21.0` (2025) | May be deprecated, different format requirements |
| G2 | Language code format | `"en"` | `"en_US"` | Meta rejects incorrect locale codes |
| G3 | `body_text` example format | `[body_examples]` → `[["a","b"]]` | `[["a","b"]]` (array of arrays) | Need to verify wrapping is correct |
| G4 | Media header example | Not sent for image/video/doc headers | `example.header_handle` with media asset ID | Media header templates rejected |

### P1 — Functional Gaps

| # | Gap | Current | Required | Impact |
|---|---|---|---|---|
| G5 | No button UI | `buttons: []` in state, no UI to add | Up to 3 buttons (Quick Reply, URL, Call) | Can't create CTA/marketing templates |
| G6 | No character limits | No validation | Name: 512, Body: 1024, Footer: 60, Header: 60 | Confusing errors from Meta |
| G7 | No template name format enforcement | Accepts any text | Lowercase `a-z`, `0-9`, `_` only | Name silently transformed; user confused |
| G8 | No template status tracking | Status set to "pending" locally, never updated | Poll Meta API or webhook for APPROVED/REJECTED | User can't see if template was approved |
| G9 | No duplicate name check | No pre-check | Meta rejects duplicates within WABA | Cryptic Meta error |

### P2 — UX & Quality

| # | Gap | Current | Required | Impact |
|---|---|---|---|---|
| G10 | Only 2 languages | English, Hindi | 70+ Meta-supported languages | Limits regional restaurant owners |
| G11 | No media upload | URL text input only | Upload or hosted URL + media handle | Requires external hosting |
| G12 | Poor error display | Generic toast error | Show Meta's specific error message | Can't diagnose failures |
| G13 | Blanket AuthKey sync | Migrates ALL templates | Per-template sync preferred | Heavy operation, potential conflicts |

### P3 — Nice to Have

| # | Gap | Current | Required | Impact |
|---|---|---|---|---|
| G14 | No `allow_category_change` | Not sent | Boolean flag to control auto-recategorization | Minor — Meta defaults to true |

---

## 4. Proposed Phase Plan

### Phase 1: P0 Fixes + P1 Core (make it actually work)
- Fix G1 (API version), G2 (language codes), G3 (example format), G4 (media examples)
- Add G6 (validation), G7 (name enforcement), G9 (duplicate check), G12 (error display)
- **Gate**: After Phase 1, "Submit to Meta" should successfully create a basic text template

### Phase 2: Button Support + Status Tracking
- G5 (button UI — Quick Reply, URL, Call)
- G8 (status polling — check Meta approval status)
- **Gate**: Full template types creatable, status visible

### Phase 3: Polish
- G10 (more languages), G11 (media upload), G13 (per-template AuthKey sync), G14 (category change flag)

---

## 5. Out of Scope
- Template deletion from Meta (only local delete exists today)
- Template versioning / edit-after-approval flow
- Template analytics (sends, reads, failures per template)
- Bulk template creation / CSV import

---

## 6. Risks

| # | Risk | P | I | Mitigation |
|---|---|---|---|---|
| R1 | Meta access_token expired | M | H | Check token validity before submission; surface clear error |
| R2 | AuthKey sync format changed | L | M | Log AuthKey response; degrade gracefully |
| R3 | Meta rejects template for content policy (not format) | M | M | Clear error display; link to Meta template guidelines |
| R4 | Rate limiting on Meta API | L | L | Only manual creation; not automated |

---

## 7. Owner Questions — ANSWERED (2026-06-06)

| Q | Answer | Locked |
|---|---|---|
| Q1. Button support | **a) Yes, Phase 1** — Quick Reply, URL, Call buttons needed | Buttons in Phase 1 scope |
| Q2. Languages | **b) English + Hindi only** for now | 2 languages |
| Q3. Media headers | **a) Yes, image headers important** | Image upload/URL in Phase 1 |
| Q4. Status tracking | **a) Critical — real-time APPROVED/REJECTED/PENDING** | Status polling in Phase 1 |
| Q5. Form layout | **b) Full-page template builder** | Replace modal with dedicated page |

---

## 8. Next Gate

**→ HTML mock design** after Q1-Q5 answers. Mock will show the improved template creation form with all P0+P1 fixes visible. Owner reviews mock → approve → planning doc → implementation.

---

## 9. Definition of Done (full CR)

1. "Submit to Meta" successfully creates a text template on Meta (PENDING status)
2. Body variable examples correctly formatted
3. Template name validated (lowercase, underscore only)
4. Character limits enforced with inline hints
5. Language codes correct (en_US, hi, etc.)
6. Meta API error messages surfaced clearly to user
7. Duplicate name pre-check before submission
8. Template status reflected in CRM (at minimum: draft/pending/approved/rejected)
9. All existing custom_templates functionality preserved (Save as Draft, Edit, Delete)

---

**PARK STATUS**:
```
status:         cr023_discovery_phase_0_complete_mock_next
parked_reason:  Awaiting Q1-Q5 owner answers before HTML mock
resume_signal:  Owner answers Q1-Q5
```

---

**END OF DISCOVERY — CR-023**
