# CR-004 — Phase 1 · Foundation Cleanup — Planning Doc

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P1 — Foundation Cleanup
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr004_p1_planning_owner_signed_off_awaiting_implementation`
**Depends on:** P0 Discovery (complete), P0 Addendum A (variables / legacy / wired), P0.B (Message Dashboard discovery)
**Blocks:** P2 (Variable ↔ DB), P3 (Event Reconciliation), P4 (Channel Abstraction)

---

## 1. Phase Purpose

Establish one source of truth for templates, events, and variables. Remove dead code and dual-write paths. **No new features. No new behaviour for end users.** This is a debt-cleanup phase whose value is unblocking P2–P9.

---

## 2. In-Scope (3 work items)

### Item 1 · Remove Legacy `whatsapp_templates` + `automation_rules` Surface

**What it removes:**

| Layer | Target |
|---|---|
| Backend — seeder | `routers/auth.py:145-155` `create_default_whatsapp_templates()` + its 2 call sites at lines 184 (register) and 447 (any 2nd call site) |
| Backend — manual reseed | `POST /whatsapp/setup-defaults` (`routers/whatsapp.py:33-67`) |
| Backend — legacy template CRUD | `routers/whatsapp.py:71-145` (create, list, get, update, delete) |
| Backend — legacy automation rule CRUD | `routers/whatsapp.py:147-268` (create, list, get-events, get, update, delete) and `routers/whatsapp.py:797-830` (toggle, automation-with-templates) |
| Backend — helper | `core/helpers.py:319-484` `get_default_templates_and_automation()` |
| Backend — Pydantic models | `models/schemas.py:1171-1226` `WhatsAppTemplate*`, `AutomationRule*` |
| Backend — imports | `routers/whatsapp.py:10-16` clean up unused imports |
| Frontend — legacy modals & handlers | `components/shared/WhatsAppAutomationContent.jsx:264-283` (templateForm + ruleForm state), `:745-770` (handleSaveTemplate/Delete), `:782-826` (handleSaveRule, handleDeleteRule, handleToggleRule) + their JSX surfaces |
| Frontend — calls to dead endpoints | `WhatsAppAutomationContent.jsx:462-463` (templates + automation GETs in `fetchData`) |
| DB — collections | Drop `whatsapp_templates` and `automation_rules` on the connected MongoDB (`mongodb://...@52.66.232.149/mygenie`) via a one-time migration |

**What stays:** `whatsapp_event_template_map`, `whatsapp_template_variable_map`, `custom_templates`, `whatsapp_message_logs`, `segment_whatsapp_config`. These are the real surfaces.

**What `/whatsapp/automation/events` (line 189-229) does:** Returns the master event list — **keep this**. It's used by the live mapping UI.

---

### Item 2 · Single Canonical Variables List (backend-served)

**What it adds:**

| Layer | Target |
|---|---|
| Backend — new endpoint | `GET /api/whatsapp/variables` returning `{variables: [{key, label, example, description}]}` |
| Backend — config module | `core/whatsapp_variables.py` (new) — single Python list of variable dicts |
| Backend — align sample-data | `routers/customers.py:723-751` `get_sample_customer_data()` — ensure keys returned match canonical list exactly (rename / add / drop) |

**What it removes (duplicates):**

| Layer | Target |
|---|---|
| Frontend duplicate 1 | `TemplatesPage.jsx:54-66` `availableVariables` array |
| Frontend duplicate 2 | `WhatsAppAutomationContent.jsx:307-318` `availableVariables` array |

**What it replaces them with:** Both pages call `GET /api/whatsapp/variables` once on mount and store the result in component state. No behaviour change — same 10 variables, same labels, same examples.

**Canonical list (P1 starting point — identical to current UI):**

```
customer_name, points_balance, points_earned, points_redeemed,
wallet_balance, amount, tier, restaurant_name, coupon_code, expiry_date
```

**Explicit non-goal:** No new variables. No DB-schema binding. No alias correction. All of that is **P2**.

---

### Item 3 · Honour `text` Mode at Production Send Time

**The bug (from Addendum A §1.4):** `core/whatsapp.py:204 build_body_values()` ignores `modes`. When owner picks mode=`text` and types `"Welcome to MyGenie"`, real triggers send empty string.

**Decision (owner sign-off needed):**

| Option | Action |
|---|---|
| **A — Honour it (recommended)** | Modify `build_body_values()` to accept `modes` dict; when `modes[var_key] == "text"`, return the mapping string as a literal; otherwise resolve as field key (current behaviour). Propagate `modes` from `get_event_template_config()` (already returns it at line 309). |
| B — Remove it | Strip the mode toggle from both UI files; data-migrate `whatsapp_template_variable_map.modes` to all-`map`; ignore `text` value if present. |

**P1 default: Option A.** Owner can override.

**Test artefact required to ship Item 3:** `/app/backend/tests/test_whatsapp_text_mode.py` covering:
1. mode=`text` → literal sent in body_values
2. mode=`map` → field resolved (unchanged from today)
3. mixed modes within same template → each respected per-variable

---

## 3. Out of Scope (explicitly NOT in P1)

| Item | Goes to |
|---|---|
| Add new variables (`order_id`, `coupon_discount`, etc.) | P2 |
| Bind variables to DB collections | P2 |
| Rename events (`first_visit` → `welcome_message`, `feedback_received` → `feedback_request`, `send_bill` → `send_bill_auto`) | P3 |
| Wire missing emit sites (welcome_message on register, reset_password on OTP) | P3 |
| Add `channel` column to logs | P4 |
| Fix resend `TypeError` | P7 |
| Fix wrong AuthKey URL in `/message-filters` | P7 |
| Opt-in / opt-out | P6 |
| Anything broadcast / segment-send | P5 |

---

## 4. File-Level Checklist (sign-off targets)

### 4.1 Backend changes

- [ ] `routers/auth.py` — remove `create_default_whatsapp_templates()` function + 2 call sites
- [ ] `routers/whatsapp.py` — delete lines 33-145 (setup-defaults + template CRUD), 147-187 (rule CRUD), 231-268 (rule get/update/delete), 797-830 (toggle + automation-with-templates); keep `/automation/events` at 189-229
- [ ] `routers/whatsapp.py` — clean unused imports (`WhatsAppTemplate*`, `AutomationRule*`, `get_default_templates_and_automation`)
- [ ] `routers/whatsapp.py` — add new endpoint `GET /whatsapp/variables`
- [ ] `core/helpers.py` — delete `get_default_templates_and_automation()` (lines 319-484)
- [ ] `core/whatsapp_variables.py` — **new file** with canonical variables list
- [ ] `core/whatsapp.py:build_body_values()` — accept `modes` arg, honour `text` mode
- [ ] `core/whatsapp.py:get_event_template_config()` — already returns `variable_modes`; ensure `trigger_whatsapp_event()` passes it down (line 417 currently calls `build_body_values` without modes)
- [ ] `models/schemas.py` — delete `WhatsAppTemplate`, `WhatsAppTemplateCreate`, `WhatsAppTemplateUpdate`, `AutomationRule`, `AutomationRuleCreate`, `AutomationRuleUpdate` (lines 1171-1226). Keep `AUTOMATION_EVENTS`, `POS_EVENTS`, `CRM_EVENTS`.
- [ ] `routers/customers.py:get_sample_customer_data()` — align response keys with canonical list

### 4.2 Frontend changes

- [ ] `pages/TemplatesPage.jsx` — remove `availableVariables` array (lines 54-66); fetch from `GET /whatsapp/variables` on mount
- [ ] `components/shared/WhatsAppAutomationContent.jsx` — same removal + fetch (lines 307-318)
- [ ] `components/shared/WhatsAppAutomationContent.jsx` — delete legacy state: `templates`, `automationRules`, `editingTemplate`, `templateForm`, `editingRule`, `ruleForm` + their setters and handlers (`handleSaveTemplate`, `handleDeleteTemplate`, `handleSaveRule`, `handleDeleteRule`, `handleToggleRule`); remove related `fetchData()` calls
- [ ] `components/shared/WhatsAppAutomationContent.jsx` — delete legacy JSX: old Template modal + old Rule modal + any legacy template list rendering
- [ ] Grep for any other reference to `/whatsapp/templates` or `/whatsapp/automation` (excluding `/automation/events` and `/automation-with-templates` — which is also deleted)

### 4.3 Tests

- [ ] **New:** `/app/backend/tests/test_whatsapp_text_mode.py` — covers Item 3 acceptance
- [ ] **New:** `/app/backend/tests/test_whatsapp_variables_endpoint.py` — smoke test `GET /whatsapp/variables`
- [ ] Manual: register a new user → confirm 0 rows created in `whatsapp_templates` + `automation_rules`
- [ ] Manual: `curl /whatsapp/templates` → expect 404
- [ ] Manual: `curl /whatsapp/automation` (rules list) → expect 404
- [ ] Manual: `curl /whatsapp/automation/events` → expect 200 with master list (unchanged)

### 4.4 Database migration

- [ ] One-time script `/app/backend/migrations/p1_drop_legacy_whatsapp.py` (not auto-run) that:
  - Counts rows in `whatsapp_templates` and `automation_rules`
  - Logs them
  - Drops both collections
- [ ] Run on the connected external Mongo only after backend + frontend deploy is verified

### 4.5 Documentation

- [ ] Update `/app/memory/PRD.md` — mark P1 complete with date
- [ ] Create implementation report `/app/memory/crm/crm_roi_sprint/implementation/CR_004_PHASE_1_FOUNDATION_CLEANUP_IMPLEMENTATION_REPORT.md`

---

## 5. Acceptance Criteria (broader, end-to-end)

| # | Criterion | Verification |
|---|---|---|
| AC-1 | New user registration creates 0 rows in `whatsapp_templates` and 0 in `automation_rules` | Register a new user via `/api/auth/register`; query Mongo |
| AC-2 | Legacy endpoints return 404 | `curl /whatsapp/templates`, `/whatsapp/automation`, `/whatsapp/setup-defaults`, `/whatsapp/automation-with-templates` |
| AC-3 | `/whatsapp/automation/events` still returns master list | curl + diff with pre-P1 response |
| AC-4 | `GET /whatsapp/variables` returns the canonical 10 variables | curl |
| AC-5 | Templates page + Automation page render the same variable picker, sourced from the API | Browser open + Network tab confirms call to `/whatsapp/variables` |
| AC-6 | Saving a mapping with mode=`text` and typing `"Hello world"` for `{{1}}`, then firing the event, sends `body_values: {"1": "Hello world"}` to AuthKey | Unit test + WhatsApp message log inspection |
| AC-7 | Existing live mappings (mode=`map`) continue to send the correct field value (regression check) | Test `points_earned` for a known customer |
| AC-8 | Legacy modals + buttons gone from the Automation page UI | Manual screenshot |
| AC-9 | `whatsapp_templates` and `automation_rules` collections dropped from connected Mongo | `db.getCollectionNames()` |
| AC-10 | No 500 errors in backend logs during full module exercise (test send + map event + fire event + open dashboard) | Tail `/var/log/supervisor/backend.*.log` |

---

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Removed routes still hit by a stale browser tab | High | Routes 404 gracefully; existing error toast pattern fires; refresh fixes |
| `text` mode change accidentally breaks `map` mode resolution | Medium | New unit tests cover both modes; no logic removed, only branched |
| Sample customer data shape change breaks Templates preview rendering | Medium | Bench preview before/after — preview is read-only, won't impact sends |
| Live customers depend on legacy templates (per Addendum A: nothing reads them at runtime, but UI exposes them) | Low | Confirmed read-only zombie. Owner notification: "These templates were not being used by message sends; we've cleaned them up." |
| Migration drops collections on the wrong DB | Low | Script is manual, requires explicit confirmation. Connected DB string is hard-wired in `.env`. |

---

## 7. Order of Execution (within P1)

1. **Backend first**, in this order:
   - Create `core/whatsapp_variables.py` + `GET /whatsapp/variables` endpoint
   - Fix `build_body_values()` for `text` mode + write tests
   - Remove legacy CRUD endpoints
   - Remove legacy seeder + helper
   - Remove legacy Pydantic models
   - Lint + supervisor restart
2. **Frontend second**:
   - Update `TemplatesPage.jsx` + `WhatsAppAutomationContent.jsx` to fetch variables from API
   - Remove all legacy state, handlers, modals, JSX
   - Browser smoke test
3. **Database last**:
   - Run migration script after backend + frontend are green on preview
4. **Docs**:
   - Implementation report + PRD update

---

## 8. Effort (committed)

| Sub-item | Sessions |
|---|---|
| Item 1 — Kill zombies (backend + frontend) | 1 |
| Item 2 — Single variables list | 0.5 |
| Item 3 — `text` mode resolver + tests | 0.5 |
| Migration + docs + verification | 0.5 |
| **Total** | **~2 sessions** |

---

## 9. Owner Sign-off — ✅ LOCKED (2026-05-27)

| # | Item | Owner Decision |
|---|---|---|
| D-1 | Confirm scope: 3 items above, nothing more added | ✅ **Approved as drafted** |
| D-2 | Text mode handling: Option A (honour at send time) vs Option B (remove from UI) | ✅ **A — Honour at send time** |
| D-3 | Migration approach: drop both collections immediately after P1 deploy, or freeze 7 days then drop | ✅ **Immediate drop after P1 deploy goes green** |
| D-4 | Canonical variables list for P1: keep current 10 unchanged (additions deferred to P2) | ✅ **Keep current 10** |
| D-5 | Skip-test policy | ✅ **Override — invoke `testing_agent_v3_fork` for P1** (P1 only — does not change blanket "no testing agent" stance for the rest of the CR unless owner re-confirms per-phase) |

**Locked at:** 2026-05-27
**Locked by:** Owner via chat
**Next action:** Implementation begins per execution order in §7. Will NOT start until owner explicitly says "begin P1".

---

## 10. What Happens Next

Once owner signs off on §9:
- I begin implementation in the order in §7
- Each item ships with its own test before moving to the next
- For P1 — `testing_agent_v3_fork` will be invoked after implementation per D-5 override
- Final implementation report lands in `/app/memory/crm/crm_roi_sprint/implementation/`
- We then move to P2 Planning Doc

**Status:** `cr004_p1_planning_owner_signed_off_awaiting_implementation_kickoff`

End of P1 Planning Doc.

---

# §11 · Implementation Spec — Code-Level Detail (Pickup-Ready)

> This section is written for an implementation agent to execute **cold**, with zero further investigation needed. Every file path, every line range, every code snippet is verified against the live codebase as of 2026-05-27.

## 11.1 Pre-flight Checks (Implementation Agent: run before coding)

```bash
# 1. Confirm services are up
sudo supervisorctl status

# 2. Confirm external Mongo is reachable
cd /app/backend && python3 -c "
from motor.motor_asyncio import AsyncIOMotorClient
import os, asyncio
async def t():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])
    print(await c[os.environ['DB_NAME']].list_collection_names())
asyncio.run(t())
"

# 3. Confirm legacy collections still exist (proves migration will be effective)
# Expected: whatsapp_templates and automation_rules present

# 4. Confirm REACT_APP_BACKEND_URL works
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s "$API/api/whatsapp/automation/events" | head -c 200
```

If any pre-flight fails → STOP and escalate to user before touching code.

---

## 11.2 Step-by-Step Implementation Order

Execute in this exact order. Do not skip ahead — each step has acceptance gates.

### STEP 1 · Create `core/whatsapp_variables.py` (NEW FILE)

**Path:** `/app/backend/core/whatsapp_variables.py`

**Action:** Create with content below (D-4 locks the list to the current 10).

```python
"""
Canonical WhatsApp template variable registry.

Single source of truth for variables that owners can map to template placeholders.
This file is the ONLY place to add/remove variables — both frontend pages
fetch from GET /api/whatsapp/variables which serves this list.

P1 scope (2026-05-27): 10 variables, no DB schema binding yet.
DB binding (source collection + field + formatter) is deferred to P2.
"""

WHATSAPP_VARIABLES = [
    {"key": "customer_name",   "label": "Customer Name",   "example": "John",
     "description": "The customer's full name"},
    {"key": "points_balance",  "label": "Points Balance",  "example": "1,250",
     "description": "Current loyalty points balance"},
    {"key": "points_earned",   "label": "Points Earned",   "example": "50",
     "description": "Points earned in this transaction"},
    {"key": "points_redeemed", "label": "Points Redeemed", "example": "100",
     "description": "Points redeemed in this transaction"},
    {"key": "wallet_balance",  "label": "Wallet Balance",  "example": "Rs.500",
     "description": "Current wallet balance"},
    {"key": "amount",          "label": "Amount",          "example": "Rs.1,000",
     "description": "Transaction or order amount"},
    {"key": "tier",            "label": "Customer Tier",   "example": "Gold",
     "description": "Loyalty tier (Bronze/Silver/Gold/Platinum)"},
    {"key": "restaurant_name", "label": "Restaurant Name", "example": "Demo Restaurant",
     "description": "The brand/outlet name"},
    {"key": "coupon_code",     "label": "Coupon Code",     "example": "SAVE20",
     "description": "Coupon code applied or earned"},
    {"key": "expiry_date",     "label": "Expiry Date",     "example": "31 Dec 2026",
     "description": "Points or coupon expiry date"},
]
```

**Acceptance:** File exists, valid Python, no syntax errors (`python3 -c "from core.whatsapp_variables import WHATSAPP_VARIABLES; print(len(WHATSAPP_VARIABLES))"` returns `10`).

---

### STEP 2 · Add `GET /whatsapp/variables` endpoint

**File:** `/app/backend/routers/whatsapp.py`

**Insert after line 30** (after `router = APIRouter(...)`), before the now-to-be-deleted `/setup-defaults` route:

```python
from core.whatsapp_variables import WHATSAPP_VARIABLES

@router.get("/variables")
async def list_template_variables():
    """Return canonical template variables list (Phase 1: 10 vars, flat)."""
    return {"variables": WHATSAPP_VARIABLES}
```

**Acceptance:**
```bash
curl -s "$API/api/whatsapp/variables" | python3 -m json.tool
# Must return {"variables": [...10 objects...]}
```

> Note: This endpoint has **no auth** intentionally — it's a static lookup, no per-user data. If owner objects, wrap in `Depends(get_current_user)` (1-line change).

---

### STEP 3 · Honour `text` mode in `build_body_values()`

**File:** `/app/backend/core/whatsapp.py`

**Change A — function signature** at line 204:

Find:
```python
def build_body_values(
    template_variables: List[str],
    variable_mappings: Dict[str, str],
    customer_data: Dict[str, Any],
    event_data: Dict[str, Any] = None
) -> Dict[str, str]:
```

Replace with:
```python
def build_body_values(
    template_variables: List[str],
    variable_mappings: Dict[str, str],
    customer_data: Dict[str, Any],
    event_data: Dict[str, Any] = None,
    variable_modes: Dict[str, str] = None,
) -> Dict[str, str]:
```

**Change B — body-build loop** at lines 254-268. Find:
```python
    for var in template_variables:
        # Extract number from {{1}}, {{2}}, etc.
        var_num = var.strip("{}") if var else ""
        if not var_num:
            continue
        
        # Get the mapped field for this variable
        mapped_field = variable_mappings.get(var, "")
        
        if mapped_field:
            value = get_value(mapped_field)
            body_values[var_num] = value
        else:
            body_values[var_num] = ""
```

Replace with:
```python
    modes = variable_modes or {}
    for var in template_variables:
        # Extract number from {{1}}, {{2}}, etc.
        var_num = var.strip("{}") if var else ""
        if not var_num:
            continue

        # Get the mapped field for this variable
        mapped_field = variable_mappings.get(var, "")
        mode = modes.get(var, "map")  # default to map for backward compat

        if not mapped_field:
            body_values[var_num] = ""
            continue

        if mode == "text":
            # Literal text — owner typed it directly, do NOT resolve as field key
            body_values[var_num] = str(mapped_field)
        else:
            # mode == "map" (default) — resolve as field key via aliases
            body_values[var_num] = get_value(mapped_field)
```

**Change C — call site** in `trigger_whatsapp_event()` at line 417. Find:
```python
        body_values = build_body_values(
            template_variables,
            variable_mappings,
            customer,
            event_data
        )
```

Replace with:
```python
        body_values = build_body_values(
            template_variables,
            variable_mappings,
            customer,
            event_data,
            variable_modes=config.get("variable_modes", {}),
        )
```

(`config["variable_modes"]` is already populated by `get_event_template_config()` at line 309 — no other change needed.)

**Acceptance:** Tests in STEP 9 must pass.

---

### STEP 4 · Delete legacy backend endpoints

**File:** `/app/backend/routers/whatsapp.py`

**Delete the following line ranges (verified 2026-05-27):**

| Lines | What |
|---|---|
| 33-67 | `POST /setup-defaults` |
| 71-90 | `POST /templates` (create) |
| 92-110 | `GET /templates` (list) |
| 112-117 | `GET /templates/{template_id}` |
| 119-131 | `PUT /templates/{template_id}` |
| 133-145 | `DELETE /templates/{template_id}` |
| 147-182 | `POST /automation` (create rule) |
| 184-187 | `GET /automation` (list rules) |
| 231-236 | `GET /automation/{rule_id}` |
| 238-261 | `PUT /automation/{rule_id}` |
| 263-268 | `DELETE /automation/{rule_id}` |
| 797-808 | `POST /automation/{rule_id}/toggle` |
| 810-830 | `GET /automation-with-templates` |

**Keep:** `GET /automation/events` at lines 189-229 — this is the master event list, still used by the live mapping UI.

**Clean unused imports at line 10-16.** Find:
```python
from core.helpers import get_default_templates_and_automation
from core.whatsapp import send_single_message, WhatsAppMessage
from models.schemas import (
    WhatsAppTemplate, WhatsAppTemplateCreate, WhatsAppTemplateUpdate,
    AutomationRule, AutomationRuleCreate, AutomationRuleUpdate,
    AUTOMATION_EVENTS, POS_EVENTS, CRM_EVENTS
)
```

Replace with:
```python
from core.whatsapp import send_single_message, WhatsAppMessage
from core.whatsapp_variables import WHATSAPP_VARIABLES
from models.schemas import (
    AUTOMATION_EVENTS, POS_EVENTS, CRM_EVENTS
)
```

(Removes `get_default_templates_and_automation`, all 6 legacy Pydantic models.)

**Acceptance:**
```bash
sudo supervisorctl restart backend
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/whatsapp/templates"        # → 404
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/whatsapp/automation"       # → 404
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/whatsapp/setup-defaults" -X POST  # → 404
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/whatsapp/automation-with-templates"  # → 404
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/whatsapp/automation/events"  # → 200 (kept)
```

---

### STEP 5 · Delete legacy seeder in `routers/auth.py`

**File:** `/app/backend/routers/auth.py`

**Delete:**
1. Line 10: `from core.helpers import get_default_templates_and_automation`
2. Lines 145-155: entire `async def create_default_whatsapp_templates(user_id: str):` function
3. Line 184: `await create_default_whatsapp_templates(user_id)` (in `register`)
4. Line 447: `await create_default_whatsapp_templates(user_id)` (in the second register flow)
5. Surrounding comment lines if present (e.g., line 183 "# Create default WhatsApp templates and automation rules" — delete the comment too)

**Acceptance:** Register a new user via `POST /api/auth/register`, then:
```bash
cd /app/backend && python3 -c "
from motor.motor_asyncio import AsyncIOMotorClient
import os, asyncio
async def t():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    # Find the just-created user by email
    u = await c.users.find_one({'email': 'p1test@example.com'})
    tpls = await c.whatsapp_templates.count_documents({'user_id': u['id']})
    rules = await c.automation_rules.count_documents({'user_id': u['id']})
    print('templates:', tpls, 'rules:', rules)
asyncio.run(t())
"
# Expected: templates: 0 rules: 0
```

---

### STEP 6 · Delete legacy helper in `core/helpers.py`

**File:** `/app/backend/core/helpers.py`

**Delete lines 319-484** — the entire `def get_default_templates_and_automation(user_id: str) -> tuple:` function.

Leave the imports at the top intact (other functions in the file may use them — verify before pruning).

**Acceptance:** Backend still starts. `grep -rn "get_default_templates_and_automation" /app/backend` returns zero matches.

---

### STEP 7 · Delete legacy Pydantic models

**File:** `/app/backend/models/schemas.py`

**Delete lines 1171-1226** (verified):
- `WhatsAppTemplateCreate` (1172-1177)
- `WhatsAppTemplateUpdate` (1179-1185)
- `WhatsAppTemplate` (1187-1198)
- comment line 1200 "# Automation Rule Models"
- `AutomationRuleCreate` (1201-1206)
- `AutomationRuleUpdate` (1208-1213)
- `AutomationRule` (1215-1225)

**Keep lines 1227+:** `POS_EVENTS`, `CRM_EVENTS`, `AUTOMATION_EVENTS` — still used.

Also delete line 1171 comment `# WhatsApp Template Models`.

**Acceptance:** `grep -rn "from models.schemas import.*WhatsAppTemplate\|from models.schemas import.*AutomationRule" /app/backend` returns zero matches. Backend starts cleanly.

---

### STEP 8 · Align `customers/sample-data` response

**File:** `/app/backend/routers/customers.py`

**At lines 723-751**, the response keys already match the canonical list except for one missing key. Update:

Find lines 735-750:
```python
    return {
        "sample": {
            "customer_name": customer.get("name", ""),
            "phone": customer.get("phone", ""),
            "points_balance": str(customer.get("total_points", 0)),
            "points_earned": str(customer.get("total_points_earned", 0)),
            "points_redeemed": str(customer.get("total_points_redeemed", 0)),
            "wallet_balance": f"₹{customer.get('wallet_balance', 0)}",
            "amount": f"₹{customer.get('total_spent', 0)}",
            "tier": customer.get("tier", ""),
            "coupon_code": "",
            "expiry_date": "",
            "order_id": "",
            "visit_count": str(customer.get("total_visits", 0))
        },
        "restaurant_name": restaurant_name
    }
```

Replace with:
```python
    return {
        "sample": {
            "customer_name":   customer.get("name", ""),
            "points_balance":  str(customer.get("total_points", 0)),
            "points_earned":   str(customer.get("total_points_earned", 0)),
            "points_redeemed": str(customer.get("total_points_redeemed", 0)),
            "wallet_balance":  f"Rs.{customer.get('wallet_balance', 0)}",
            "amount":          f"Rs.{customer.get('total_spent', 0)}",
            "tier":            customer.get("tier", ""),
            "restaurant_name": restaurant_name,
            "coupon_code":     "",
            "expiry_date":     "",
        },
        "restaurant_name": restaurant_name,
    }
```

**Changes:**
- Drop `phone`, `order_id`, `visit_count` (not in canonical list)
- Add `restaurant_name` inside `sample` (was only top-level — broke preview lookup)
- Replace `₹` with `Rs.` to match PDF convention (handoff summary §Critical Info)
- Keep top-level `restaurant_name` for backward compat

**Acceptance:** `curl -H "Authorization: Bearer $TOKEN" "$API/api/customers/sample-data"` returns exactly the 10 canonical keys inside `sample`.

---

### STEP 9 · Backend tests

**File:** `/app/backend/tests/test_whatsapp_text_mode.py` (NEW)

```python
"""
P1 Item 3 acceptance: build_body_values must honour modes['text'].
Covers the bug discovered in Addendum A §1.4 where text mode
worked in preview but was silently ignored at real send time.
"""
import pytest
from core.whatsapp import build_body_values


def test_text_mode_literal_substitution():
    """mode=text → literal string substituted as-is."""
    result = build_body_values(
        template_variables=["{{1}}", "{{2}}"],
        variable_mappings={"{{1}}": "customer_name", "{{2}}": "Welcome to MyGenie"},
        customer_data={"name": "John"},
        event_data={},
        variable_modes={"{{1}}": "map", "{{2}}": "text"},
    )
    assert result == {"1": "John", "2": "Welcome to MyGenie"}


def test_map_mode_field_resolution_default():
    """No modes dict passed → defaults to map mode (backward compat)."""
    result = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": "customer_name"},
        customer_data={"name": "Alice"},
        event_data={},
    )
    assert result == {"1": "Alice"}


def test_mixed_modes_per_variable():
    """Different modes per variable within one template."""
    result = build_body_values(
        template_variables=["{{1}}", "{{2}}", "{{3}}"],
        variable_mappings={
            "{{1}}": "customer_name",
            "{{2}}": "Hello",
            "{{3}}": "points_balance",
        },
        customer_data={"name": "Bob", "total_points": 500},
        event_data={},
        variable_modes={"{{1}}": "map", "{{2}}": "text", "{{3}}": "map"},
    )
    assert result == {"1": "Bob", "2": "Hello", "3": "500"}


def test_text_mode_with_empty_mapped_value_yields_empty():
    """If mapped string is empty AND mode=text, still empty output."""
    result = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": ""},
        customer_data={},
        event_data={},
        variable_modes={"{{1}}": "text"},
    )
    assert result == {"1": ""}


def test_map_mode_unknown_field_yields_empty_not_literal():
    """mode=map + unknown field key → empty (NOT the field key as literal)."""
    result = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": "nonexistent_field"},
        customer_data={"name": "X"},
        event_data={},
        variable_modes={"{{1}}": "map"},
    )
    assert result == {"1": ""}
```

**File:** `/app/backend/tests/test_whatsapp_variables_endpoint.py` (NEW)

```python
"""
P1 Item 2 acceptance: GET /api/whatsapp/variables returns the canonical list.
"""
import os
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"] if "REACT_APP_BACKEND_URL" in os.environ else None
# Fallback: read from frontend .env
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip()


def test_variables_endpoint_returns_canonical_list():
    r = requests.get(f"{BASE}/api/whatsapp/variables", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert "variables" in data
    keys = {v["key"] for v in data["variables"]}
    expected = {
        "customer_name", "points_balance", "points_earned", "points_redeemed",
        "wallet_balance", "amount", "tier", "restaurant_name",
        "coupon_code", "expiry_date",
    }
    assert keys == expected, f"Missing: {expected - keys}, Extra: {keys - expected}"
    # Every variable has required fields
    for v in data["variables"]:
        assert {"key", "label", "example", "description"}.issubset(v.keys())
```

**Run:**
```bash
cd /app/backend && python3 -m pytest tests/test_whatsapp_text_mode.py tests/test_whatsapp_variables_endpoint.py -v
```

**Acceptance:** Both files green, 6 tests pass.

---

### STEP 10 · Frontend — `WhatsAppAutomationContent.jsx` cleanup

**File:** `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx`

**Edits required (verified line numbers):**

**A. Remove legacy state (line 225-226):**
```jsx
const [templates, setTemplates] = useState([]);
const [automationRules, setAutomationRules] = useState([]);
```
Delete both lines.

**B. Remove legacy modal state (lines 265-283):**
```jsx
// Template form state
const [showTemplateModal, setShowTemplateModal] = useState(false);
const [editingTemplate, setEditingTemplate] = useState(null);
const [templateForm, setTemplateForm] = useState({
    name: "", message: "", media_type: null, media_url: "", variables: []
});

// Automation rule form state
const [showRuleModal, setShowRuleModal] = useState(false);
const [editingRule, setEditingRule] = useState(null);
const [ruleForm, setRuleForm] = useState({
    event_type: "", template_id: "", is_enabled: true, delay_minutes: 0
});
```
Delete all 14 lines.

**C. Replace `availableVariables` (lines 307-318) with API-fetched state:**
Find:
```jsx
const availableVariables = [
    { key: "customer_name", label: "Customer Name", example: "John" },
    ...
];
```
Replace with:
```jsx
const [availableVariables, setAvailableVariables] = useState([]);
```

**D. Update `fetchData()` (lines 459-512):**

Find lines 461-469:
```jsx
const [templatesRes, rulesRes, eventsRes, apiKeyRes] = await Promise.all([
    api.get("/whatsapp/templates"),
    api.get("/whatsapp/automation"),
    api.get("/whatsapp/automation/events"),
    api.get("/whatsapp/api-key")
]);
setTemplates(templatesRes.data.templates || templatesRes.data || []);
setAutomationRules(rulesRes.data);
setAvailableEvents(eventsRes.data.events || []);
```
Replace with:
```jsx
const [eventsRes, apiKeyRes, varsRes] = await Promise.all([
    api.get("/whatsapp/automation/events"),
    api.get("/whatsapp/api-key"),
    api.get("/whatsapp/variables"),
]);
setAvailableEvents(eventsRes.data.events || []);
setAvailableVariables(varsRes.data.variables || []);
```

**E. Delete legacy handlers (lines 742-831):**
Delete entire blocks:
- `handleSaveTemplate` (742-758)
- `handleEditTemplate` (760-770)
- `handleDeleteTemplate` (772-781)
- `handleSaveRule` (784-800)
- `handleEditRule` (802-811)
- `handleDeleteRule` (813-822)
- `handleToggleRule` (824-831)

**F. Delete `getTemplateName` (lines 852-856):**
```jsx
const getTemplateName = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    return template?.name || "Unknown Template";
};
```
Delete. (No other code calls this — confirmed by grep.)

**G. Delete legacy modal JSX:**
- Template Modal (lines 1645-1753) — entire `<Dialog open={showTemplateModal}>...</Dialog>` block
- Automation Rule Modal (lines 1755-1848) — entire `<Dialog open={showRuleModal}>...</Dialog>` block

**H. Audit for stragglers:** After edits, run:
```bash
grep -nE "templates\.|automationRules|editingTemplate|editingRule|templateForm|ruleForm|showTemplateModal|showRuleModal|handleSaveTemplate|handleDeleteTemplate|handleSaveRule|handleDeleteRule|handleToggleRule|getTemplateName" /app/frontend/src/components/shared/WhatsAppAutomationContent.jsx
```
Expected: zero matches (apart from comments or the legitimate `templateVariableMappings`/`templates` in URL strings — review each match manually).

---

### STEP 11 · Frontend — `TemplatesPage.jsx` cleanup

**File:** `/app/frontend/src/pages/TemplatesPage.jsx`

**Edit lines 54-66:**

Find:
```jsx
const availableVariables = [
    { key: "customer_name", label: "Customer Name", example: "John" },
    { key: "points_balance", label: "Points Balance", example: "500" },
    ...
];
```

Replace with:
```jsx
const [availableVariables, setAvailableVariables] = useState([]);
```

**Add fetch in component's main `useEffect`** — find the existing `useEffect(() => { ... }, [])` (it loads initial data; look near line 70-100 — implementation agent should locate by reading the file) and inside the loader add:
```jsx
const varsRes = await api.get("/whatsapp/variables");
setAvailableVariables(varsRes.data.variables || []);
```

**Acceptance:** Templates page renders, variable picker shows the same 10 chips, browser Network tab confirms `/whatsapp/variables` is called.

---

### STEP 12 · Lint & smoke

```bash
# Backend
cd /app/backend && python3 -m ruff check routers/whatsapp.py routers/auth.py core/helpers.py core/whatsapp.py models/schemas.py routers/customers.py

# Frontend
cd /app/frontend && yarn lint  # or rely on hot-reload errors

# Service restart (lint may need backend restart if helpers.py shrank significantly)
sudo supervisorctl restart backend
sleep 2
curl -s "$API/api/whatsapp/variables" | head
curl -s "$API/api/whatsapp/automation/events" | head -c 200
```

Take **one** smoke screenshot of the WhatsApp Automation page in the preview URL after frontend hot-reloads. Verify:
- Page loads, no console errors
- Variable picker chips render (10 chips)
- Event mapping rows render (POS + CRM tabs)
- No legacy "Create Template" / "Add Rule" buttons visible

---

### STEP 13 · Database migration script

**File:** `/app/backend/migrations/p1_drop_legacy_whatsapp.py` (NEW — folder may need creating)

```python
"""
P1 one-time migration: drop legacy whatsapp_templates + automation_rules collections.

These collections are unused at runtime (confirmed in Addendum A §2.2) but
still hold rows from past signups. Drop them after P1 deploy goes green.

Run manually:
    cd /app/backend && python3 migrations/p1_drop_legacy_whatsapp.py
"""
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("ERROR: MONGO_URL or DB_NAME not set", file=sys.stderr)
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Connected to {db_name}")

    # Pre-check counts
    tpl_count = await db.whatsapp_templates.count_documents({})
    rule_count = await db.automation_rules.count_documents({})
    print(f"whatsapp_templates: {tpl_count} rows")
    print(f"automation_rules:   {rule_count} rows")

    if tpl_count == 0 and rule_count == 0:
        print("Both collections already empty. Nothing to drop.")
        return

    confirm = input(f"Drop both collections from '{db_name}'? Type YES to confirm: ")
    if confirm != "YES":
        print("Aborted. No changes made.")
        return

    await db.whatsapp_templates.drop()
    await db.automation_rules.drop()
    print("Both collections dropped.")

    # Verify
    remaining = await db.list_collection_names()
    assert "whatsapp_templates" not in remaining
    assert "automation_rules" not in remaining
    print("Verified: collections no longer in DB.")


if __name__ == "__main__":
    asyncio.run(main())
```

**Execution policy (D-3 locked):** Run immediately after backend + frontend deploy is green on the preview URL and STEP 12 acceptance passes.

**Acceptance:** Script exits with `Verified: collections no longer in DB.`

---

### STEP 14 · Invoke `testing_agent_v3_fork` (D-5 override)

After STEPS 1-13 are green, call the testing subagent with this task JSON:

```json
{
  "original_problem_statement_and_user_choices_inputs": "CR-004 P1 Foundation Cleanup. Owner-locked decisions: D-1 scope as drafted, D-2 honour text mode, D-3 immediate collection drop, D-4 keep current 10 vars, D-5 invoke testing_agent_v3_fork for P1.",
  "features_or_bugs_to_test": [
    "GET /api/whatsapp/variables returns canonical 10 variables",
    "POST /api/whatsapp/setup-defaults returns 404 (deleted)",
    "GET /api/whatsapp/templates returns 404 (deleted)",
    "GET /api/whatsapp/automation returns 404 (deleted)",
    "GET /api/whatsapp/automation-with-templates returns 404 (deleted)",
    "GET /api/whatsapp/automation/events still returns 200 with master event list (kept)",
    "POST /api/auth/register creates a new user but DOES NOT insert any rows in whatsapp_templates or automation_rules collections",
    "build_body_values honours mode=text — verify by setting whatsapp_event_template_map + whatsapp_template_variable_map with mode=text and triggering a points_earned event; confirm WhatsApp log row body_values contains the literal text",
    "build_body_values still honours mode=map (regression) — existing points_earned trigger still resolves customer fields correctly",
    "Frontend Automation page loads with no console errors and renders variable picker chips from /api/whatsapp/variables",
    "Frontend Templates page loads with no console errors and renders variable picker chips from /api/whatsapp/variables",
    "Legacy 'Create Template' and 'Add Rule' buttons + modals are gone from the UI"
  ],
  "files_of_reference": [
    "/app/backend/routers/whatsapp.py — verify deletions",
    "/app/backend/core/whatsapp.py:build_body_values — verify text mode honoured",
    "/app/backend/core/whatsapp_variables.py — new canonical list",
    "/app/backend/routers/auth.py — verify create_default_whatsapp_templates removed and not called",
    "/app/backend/models/schemas.py — verify legacy Pydantic models removed",
    "/app/backend/migrations/p1_drop_legacy_whatsapp.py — verify migration script exists",
    "/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx — verify legacy modals + handlers + state removed",
    "/app/frontend/src/pages/TemplatesPage.jsx — verify availableVariables fetched from API"
  ],
  "required_credentials": "Use /app/memory/test_credentials.md if it has values; otherwise register a fresh test user during testing.",
  "testing_type": "both",
  "agent_to_agent_context_note": "P1 is a CLEANUP phase, no new user-facing features. Critical regression risk: events that already work (points_earned, birthday, anniversary, points_expiring) must continue to fire correctly. Critical new behaviour: text mode must now persist through to actual sent body_values.",
  "prev_test_files_and_folder": "/app/backend/tests/test_whatsapp_text_mode.py, /app/backend/tests/test_whatsapp_variables_endpoint.py — created in P1",
  "mocked_api": {"has_mocked_apis": false, "mocked_apis_list": []},
  "other_misc_info": "External MongoDB is hard-wired. AuthKey key may not be set for the test user — that is expected and triggers should still log gracefully without sending. Do NOT send real WhatsApp messages."
}
```

**Acceptance:** Read `/app/test_reports/iteration_<N>.json` returned by the agent. ALL test items must be `pass`. Any `fail` → fix in P1, do not move to P2.

---

### STEP 15 · Documentation

**File:** `/app/memory/crm/crm_roi_sprint/implementation/CR_004_PHASE_1_FOUNDATION_CLEANUP_IMPLEMENTATION_REPORT.md` (NEW)

Use the same shape as the CR-003 Phase 3 implementation report (already in repo). Include:
- Summary (3 items shipped)
- Files changed table
- Tests added
- Migration result (counts dropped)
- Acceptance criteria table (each AC marked Pass/Fail)
- Status: `cr004_phase_1_complete_owner_verification_pending`

**File:** `/app/memory/PRD.md`

Update P1 entry from "Planning signed off" → "Implemented (date), Owner Verification Pending."

---

## 11.3 Cross-File Reference Map (verified line numbers)

| Concern | File | Lines |
|---|---|---|
| Legacy seeder helper | `core/helpers.py` | 319-484 |
| Legacy seeder call in register | `routers/auth.py` | 184, 447 |
| Legacy seeder import | `routers/auth.py` | 10 |
| Legacy seeder function definition | `routers/auth.py` | 145-155 |
| Legacy Pydantic models | `models/schemas.py` | 1171-1226 |
| Legacy CRUD: setup-defaults | `routers/whatsapp.py` | 33-67 |
| Legacy CRUD: templates | `routers/whatsapp.py` | 71-145 |
| Legacy CRUD: automation rules | `routers/whatsapp.py` | 147-187, 231-268, 797-830 |
| Keep: /automation/events | `routers/whatsapp.py` | 189-229 |
| Variable resolver | `core/whatsapp.py:build_body_values` | 204-269 |
| Trigger call site (pass modes) | `core/whatsapp.py:trigger_whatsapp_event` | 417-422 |
| get_event_template_config (already returns modes) | `core/whatsapp.py` | 278-310 |
| Sample data endpoint | `routers/customers.py:get_sample_customer_data` | 723-751 |
| Frontend legacy state | `WhatsAppAutomationContent.jsx` | 225-226, 265-283 |
| Frontend availableVariables (dup 1) | `WhatsAppAutomationContent.jsx` | 307-318 |
| Frontend availableVariables (dup 2) | `TemplatesPage.jsx` | 54-66 |
| Frontend dead API calls | `WhatsAppAutomationContent.jsx` | 461-468 |
| Frontend dead handlers | `WhatsAppAutomationContent.jsx` | 742-831 |
| Frontend `getTemplateName` (orphan after handlers removed) | `WhatsAppAutomationContent.jsx` | 852-856 |
| Frontend legacy Template modal JSX | `WhatsAppAutomationContent.jsx` | 1645-1753 |
| Frontend legacy Rule modal JSX | `WhatsAppAutomationContent.jsx` | 1755-1848 |

---

## 11.4 Rollback Plan (if something breaks mid-deploy)

| Failure point | Rollback |
|---|---|
| Backend fails to start after STEP 4 | `git checkout HEAD -- /app/backend/routers/whatsapp.py /app/backend/routers/auth.py /app/backend/core/helpers.py /app/backend/models/schemas.py`, restart |
| Frontend white-screens after STEP 10/11 | `git checkout HEAD -- /app/frontend/src/components/shared/WhatsAppAutomationContent.jsx /app/frontend/src/pages/TemplatesPage.jsx`, frontend hot-reloads |
| text-mode test fails | Revert `build_body_values` signature change only; investigate logic before retry |
| Migration script aborts | Already aborts cleanly without dropping. No rollback needed. |
| Post-migration: legacy data unexpectedly needed | Cannot recover dropped data. Per D-3 owner accepted this risk. If needed, restore from external Mongo backup separately. |

---

## 11.5 Definition of Done (P1)

- [ ] All 13 implementation steps green
- [ ] All 6 unit tests pass
- [ ] testing_agent_v3_fork iteration report shows zero failures
- [ ] Migration ran successfully on connected Mongo
- [ ] Implementation report committed to `/app/memory/crm/crm_roi_sprint/implementation/`
- [ ] PRD.md updated
- [ ] Status flipped to `cr004_phase_1_complete_owner_verification_pending`

---

**Implementation agent: this section is your runbook. Do not deviate without flagging the owner.**

End of §11.
