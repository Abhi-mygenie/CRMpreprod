# CR-004 — Phase 1 · Foundation Cleanup — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P1 — Foundation Cleanup
**Sprint:** ROI Measurement Sprint
**Planned:** 2026-05-27 (Planning doc signed off)
**Implemented:** 2026-05-27 (code committed, report written retroactively)
**Status:** `cr004_phase_1_implemented_with_residual`

---

## 1. Summary

P1 was a debt-cleanup phase: remove dead code, unify the variables list, and fix text-mode at send time. **No new features, no new user behaviour.** Three items shipped.

---

## 2. Items Delivered

### Item 1 — Remove Legacy `whatsapp_templates` + `automation_rules` Surface

| Target | Action Taken | Evidence |
|---|---|---|
| Legacy template CRUD (`/whatsapp/templates`, `/whatsapp/setup-defaults`) | **Removed** from `routers/whatsapp.py` | `grep -n "setup-defaults\|POST.*templates\"" routers/whatsapp.py` → 0 matches |
| Legacy automation rule CRUD (`/whatsapp/automation`, `/automation-with-templates`) | **Removed** from `routers/whatsapp.py` | Only `/automation/events` (master list) remains |
| Legacy helper `get_default_templates_and_automation()` | **Removed** from `core/helpers.py` | `grep "get_default_templates_and_automation" core/helpers.py` → 0 matches |
| Legacy Pydantic models (`WhatsAppTemplate*`, `AutomationRule*`) | **Removed** from `models/schemas.py` | `grep "WhatsAppTemplate\|AutomationRule" models/schemas.py` → 0 matches |
| Legacy imports in `routers/whatsapp.py` | **Cleaned** — now imports only `AUTOMATION_EVENTS`, `POS_EVENTS`, `CRM_EVENTS` from schemas; `WHATSAPP_VARIABLES` from variables module | Lines 11-14 |
| Frontend legacy state, handlers, modals | **Removed** from `WhatsAppAutomationContent.jsx` — legacy `templates`, `automationRules`, `templateForm`, `ruleForm` state, handlers (`handleSaveTemplate`, `handleDeleteTemplate`, `handleSaveRule`, `handleDeleteRule`, `handleToggleRule`), and modal JSX all gone | Current file is 1602 lines (down from ~1965 pre-P1) |
| Frontend legacy `availableVariables` hardcoded arrays | **Removed** from both `WhatsAppAutomationContent.jsx` and `TemplatesPage.jsx` — both now fetch from `GET /api/whatsapp/variables` | State: `const [availableVariables, setAvailableVariables] = useState([])` in both files |
| Migration script | **Created** at `/app/backend/migrations/p1_drop_legacy_whatsapp.py` | Manual-run script, drops `whatsapp_templates` + `automation_rules` collections |

### Item 2 — Single Canonical Variables List (Backend-Served)

| Target | Action Taken | Evidence |
|---|---|---|
| New file `core/whatsapp_variables.py` | **Created** with canonical variable registry | File exists, verified |
| New endpoint `GET /api/whatsapp/variables` | **Added** at `routers/whatsapp.py:32-35` | `curl /api/whatsapp/variables` → returns variable list |
| Frontend calls API on mount | Both pages fetch from API | `fetchData()` calls `api.get("/whatsapp/variables")` |

### Item 3 — Honour `text` Mode at Production Send Time

| Target | Action Taken | Evidence |
|---|---|---|
| `build_body_values()` signature | **Updated** to accept `variable_modes` param | `core/whatsapp.py:267` |
| `build_body_values()` logic | **Added** `mode == "text"` branch that returns literal string, not field lookup | `core/whatsapp.py:293-294` |
| `trigger_whatsapp_event()` call site | **Updated** to pass `variable_modes=config.get("variable_modes", {})` | `core/whatsapp.py:466` |

---

## 3. Residual Issue (P1 Incomplete)

| Issue | Severity | Location | Details |
|---|---|---|---|
| **`create_default_whatsapp_templates` call not removed** | 🔴 HIGH | `routers/auth.py:170` | The function call `await create_default_whatsapp_templates(user_id)` still exists at line 170, but the function definition was removed from `core/helpers.py` and never imported in `auth.py`. This means **user registration will crash with `NameError`** if a new user tries to register. The import `from core.helpers import get_default_templates_and_automation` was removed but the call site was missed. |

**Fix required:** Delete line 169-170 from `routers/auth.py`:
```python
    # Create default WhatsApp templates and automation rules
    await create_default_whatsapp_templates(user_id)
```

**Migration status:** The migration script exists but has **not been executed** against the production DB. Legacy collections may still exist.

---

## 4. Files Changed

| File | Change Type | Lines |
|---|---|---|
| `backend/core/whatsapp_variables.py` | NEW | 356 lines |
| `backend/core/whatsapp.py` | MODIFIED | `build_body_values` refactored, text mode honoured |
| `backend/routers/whatsapp.py` | MODIFIED | Legacy CRUD removed, `GET /variables` added, imports cleaned |
| `backend/routers/auth.py` | **PARTIALLY** modified | Legacy import removed but call site at line 170 NOT removed (residual bug) |
| `backend/core/helpers.py` | MODIFIED | `get_default_templates_and_automation()` removed |
| `backend/models/schemas.py` | MODIFIED | Legacy Pydantic models removed; `POS_EVENTS`, `CRM_EVENTS`, `AUTOMATION_EVENTS` kept |
| `backend/migrations/p1_drop_legacy_whatsapp.py` | NEW | Manual migration script |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | MODIFIED | Legacy state/handlers/modals removed, variables fetched from API |
| `frontend/src/pages/TemplatesPage.jsx` | MODIFIED | `availableVariables` fetched from API instead of hardcoded |

---

## 5. Tests Added

| File | Tests | Status |
|---|---|---|
| `backend/tests/test_whatsapp_text_mode.py` | 5 tests (text literal, map default, mixed modes, empty text, map unknown field) | ✅ All pass |
| `backend/tests/test_whatsapp_variables_endpoint.py` | 1 test (canonical list + required fields) | ✅ All pass |

---

## 6. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| AC-1 | New user registration creates 0 rows in legacy collections | ⚠️ **BLOCKED** — registration crashes due to residual `NameError` at `auth.py:170` |
| AC-2 | Legacy endpoints return 404 | ✅ Pass — `/whatsapp/templates`, `/whatsapp/automation`, `/whatsapp/setup-defaults` all 404 |
| AC-3 | `/whatsapp/automation/events` still returns master list | ✅ Pass |
| AC-4 | `GET /whatsapp/variables` returns canonical variables | ✅ Pass (now 23 vars due to P2.5 expansion) |
| AC-5 | Templates + Automation pages source variables from API | ✅ Pass |
| AC-6 | `text` mode sends literal in `body_values` | ✅ Pass (unit test) |
| AC-7 | `map` mode regression OK | ✅ Pass (unit test) |
| AC-8 | Legacy modals/buttons gone from UI | ✅ Pass |
| AC-9 | Legacy collections dropped | ❌ **Not executed** — migration script exists but not run |
| AC-10 | No 500 errors in logs | ✅ Pass (for non-registration flows) |

---

## 7. Status

`cr004_phase_1_implemented_with_residual`

**Residual:** `auth.py:170` call site must be removed before registration works. Migration script must be run against production DB.
