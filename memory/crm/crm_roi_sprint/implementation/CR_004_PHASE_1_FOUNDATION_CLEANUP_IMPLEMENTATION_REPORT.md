# CR-004 — Phase 1 · Foundation Cleanup — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P1 — Foundation Cleanup
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr004_phase_1_complete`

---

## 1. Summary

Phase 1 shipped 3 items per the signed-off plan. Zero scope expansion. No new features — this is a debt-cleanup phase.

- **Item 1:** Removed legacy `whatsapp_templates` + `automation_rules` dead surface (endpoints, seeder, Pydantic models, frontend modals/handlers)
- **Item 2:** Created single canonical variables list served from `GET /api/whatsapp/variables` (replaces 2 hardcoded frontend duplicates)
- **Item 3:** Fixed `text` mode bug in `build_body_values()` — mode=text now passes literal strings at production send time (was only honoured in preview)

---

## 2. Files Changed

| File | Action | Purpose |
|---|---|---|
| `/app/backend/core/whatsapp_variables.py` | **New** | Canonical 10-variable registry |
| `/app/backend/core/whatsapp.py` | Edit | `build_body_values()` now accepts `variable_modes` param + honours text mode; call site in `trigger_whatsapp_event()` passes modes |
| `/app/backend/routers/whatsapp.py` | Edit | Added `GET /variables`; removed legacy endpoints (setup-defaults, template CRUD, automation rule CRUD, toggle, automation-with-templates); cleaned imports; fixed pre-existing duplicate code at end of file |
| `/app/backend/routers/auth.py` | Edit | Removed `create_default_whatsapp_templates()` function + 2 call sites in register flows; removed legacy import; fixed pre-existing duplicate code at end of file |
| `/app/backend/core/helpers.py` | Edit | Deleted `get_default_templates_and_automation()` (165 lines) |
| `/app/backend/models/schemas.py` | Edit | Deleted 6 legacy Pydantic models (WhatsAppTemplate*, AutomationRule*) |
| `/app/backend/routers/customers.py` | Edit | Aligned `sample-data` response with canonical 10 variables |
| `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Edit | Removed legacy state, handlers, modals; variables now fetched from API |
| `/app/frontend/src/pages/TemplatesPage.jsx` | Edit | Replaced hardcoded `availableVariables` with API-fetched state |

---

## 3. Tests

| File | Tests | Result |
|---|---|---|
| `tests/test_whatsapp_text_mode.py` | 5 | All PASS |
| `tests/test_whatsapp_variables_endpoint.py` | 1 | PASS |

---

## 4. Migration

| Collection | Rows dropped | DB |
|---|---|---|
| `whatsapp_templates` | 140 | mygenie @ 52.66.232.149 |
| `automation_rules` | 140 | mygenie @ 52.66.232.149 |

Migration script: `/app/backend/migrations/p1_drop_legacy_whatsapp.py`

---

## 5. Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| AC-1 | New user registration creates 0 rows in legacy collections | PASS (collections dropped) |
| AC-2 | Legacy endpoints return 404 | PASS (templates, setup-defaults, automation, automation-with-templates) |
| AC-3 | `/whatsapp/automation/events` still returns master list (18 events) | PASS |
| AC-4 | `GET /whatsapp/variables` returns canonical 10 variables | PASS |
| AC-5 | Both frontend pages source variables from API | PASS (verified via screenshot) |
| AC-6 | mode=text sends literal at production time | PASS (unit test) |
| AC-7 | mode=map still resolves correctly (regression) | PASS (unit test) |
| AC-8 | Legacy modals + buttons gone from Automation page | PASS (screenshot verified) |
| AC-9 | Legacy collections dropped | PASS (migration verified) |
| AC-10 | No 500 errors in backend logs | PASS |

---

## 6. Status

```
cr004_phase_1_complete
```

End of CR-004 Phase 1 Implementation Report.
