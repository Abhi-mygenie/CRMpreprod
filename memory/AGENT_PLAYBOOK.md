# Agent Playbook — Common Task Recipes

> Short, copy-pasteable recipes for recurring development tasks. Each recipe is ≤30 lines.
> If a recipe is missing for a task you're doing, **add it after you finish** — that's how this file grows.

---

## Index

1. [Add a new WhatsApp variable to the registry](#1-add-a-new-whatsapp-variable-to-the-registry)
2. [Add a new field to the Profile page](#2-add-a-new-field-to-the-profile-page)
3. [Add a new POS field forward to a WhatsApp event](#3-add-a-new-pos-field-forward-to-a-whatsapp-event)
4. [Add a new event_template_map entry for a tenant](#4-add-a-new-event_template_map-entry-for-a-tenant)
5. [Add a new collection + Pydantic model](#5-add-a-new-collection--pydantic-model)
6. [Debug a stuck-Pending message_log row](#6-debug-a-stuck-pending-message_log-row)
7. [Create a new CR discovery doc](#7-create-a-new-cr-discovery-doc)
8. [Close a CR (move to qa + update register + dashboard)](#8-close-a-cr-move-to-qa--update-register--dashboard)
9. [Add data-testid to a frontend component](#9-add-data-testid-to-a-frontend-component)
10. [Probe and explain a tenant's mapping issue](#10-probe-and-explain-a-tenants-mapping-issue)

---

## 1. Add a new WhatsApp variable to the registry

**File**: `backend/core/whatsapp_variables.py`

**Step**: Append a new dict to the `WHATSAPP_VARIABLES` list.

```python
{
    "key": "payment_method",                  # what templates reference
    "description": "Payment method used for the order",
    "example": "UPI",
    "sources": [
        {"from": "event", "field": "payment_method"},   # primary
        # add fallback sources only if needed
    ],
    # "formatter": "currency" / "integer" / "date" / "time" / "titlecase"  (optional)
    "applies_to": ORDER_EVENTS,               # constrain to certain events; or omit for all
}
```

**Then**: ensure the source emitter (e.g. `routers/pos.py:1462`) forwards the field in `event_data`. See recipe #3.

**Verify**: run procedure #12 from `RUNBOOK.md`; the new key should appear in the tenant's variable mapping dropdown.

---

## 2. Add a new field to the Profile page

**Backend** (`backend/routers/auth.py:204`): add the field name to the `allowed` whitelist in `PUT /api/auth/profile`:
```python
allowed = {
    "phone", "address",
    "<new_field>",   # ← add here
}
```

**Optionally**: add server-side validation regex BEFORE the whitelist line if the field has a format constraint (GSTIN, pincode, PAN, etc.).

**Frontend** (`frontend/src/pages/ProfilePage.jsx`): add a labeled `<Input>` (or `<Select>` for enums), `data-testid="profile-<field>-input"`, validation message, and include in form state.

**Verify**: PUT a value, GET the profile, confirm round-trip.

---

## 3. Add a new POS field forward to a WhatsApp event

**File**: `backend/routers/pos.py` (search for `trigger_whatsapp_event`)

Each callsite passes an `event_data` dict. Add the field:
```python
asyncio.create_task(trigger_whatsapp_event(
    db=db,
    user_id=user_id,
    event_key="send_bill",
    customer={...},
    event_data={
        ...existing keys...,
        "payment_method": order_data.payment_method,        # ← new
        "order_created_at": order_data.order_created_at,    # ← new
    },
))
```

**If the field is missing from `POSOrderWebhook`**: add it to the schema (`backend/routers/pos.py` `OrderItem`/`POSOrderWebhook` Pydantic class) as `Optional[<type>] = None`.

---

## 4. Add a new event_template_map entry for a tenant

This is **owner-driven via admin UI today** (and via CR-016 will become fully dynamic).

For diagnostic / seeding purposes, the schema:
```python
{
    "user_id": "<tenant_id>",
    "event_key": "<event_name>",
    "template_id": "<string-template-id>",   # use STRING per CR-015 canonical decision (pending owner Q1)
    "template_name": "<human-friendly>",
    "is_enabled": True,
    "created_at": <ISO timestamp>,
    "updated_at": <ISO timestamp>,
}
```

⚠️ Per project rule, DB writes from ad-hoc scripts need owner approval. Document the intended write in a CR before executing.

---

## 5. Add a new collection + Pydantic model

**Pydantic model**: `backend/models/schemas.py`
```python
class MyEntity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None
```

**Index hint** (run once via a startup script or migration):
```python
await db.my_entities.create_index([("user_id", 1), ("name", 1)], unique=True)
```

**CRUD endpoints**: add a new file `backend/routers/my_entities.py` and include it in `backend/server.py` router list.

---

## 6. Debug a stuck-Pending message_log row

```python
# Find the row
row = await db.whatsapp_message_logs.find_one({"id": "<row-id>"})
print(row.get("message_id"), row.get("status"), row.get("event_type"))

# Look up callbacks
async for cb in db.whatsapp_callback_logs.find({"logid": row.get("message_id")}).sort("received_at", 1):
    print(cb.get("received_at"), cb.get("verdict"), cb.get("verdict_reason"))
```

**Verdict interpretation**:
- `applied` → webhook found row and updated it correctly. If still Pending, check `status_history` for state-machine guard rejection.
- `no_matching_row` → row's `message_id` is null OR doesn't match the logid. Send-side may be on old code (CR-004 P3.5 closure check).
- `rejected_no_logid` → parser couldn't extract logid from payload. AuthKey field name may have changed.
- `unknown_status` → AuthKey sent a status enum we don't map. Extend the mapping in `routers/whatsapp.py::message_status_callback`.

**Or zero callbacks**: AuthKey URL likely points elsewhere — verify registration per RUNBOOK procedure #4.

Full debug tree: PRD.md §14.

---

## 7. Create a new CR discovery doc

**Path**: `/app/memory/crm/crm_roi_sprint/discovery/CR_<NNN>_<SLUG>_DISCOVERY.md`

**Mandatory sections** (in order):
1. CR metadata header (code, lifecycle stage, date, owner, tenant)
2. Problem statement (3-5 lines)
3. Current state evidence (file:line refs, DB probes, sample data)
4. Proposed model / approach
5. Out of scope (with "why deferred" for each)
6. Risks (with prob × impact)
7. Owner-only decisions (numbered Qs with recommended defaults)
8. Effort estimate (per-track LoC + days)
9. Definition of done
10. PARK status block with resume signal

**After writing**:
- Add row to register `00_register/ROI_MEASUREMENT_CR_REGISTER.md`
- Add row to `CR_STATUS_DASHBOARD.md` with ⏸ light
- Add 1 line to PRD.md §11
- Append a decision entry to `DECISIONS_LOG.md` for the registration itself

---

## 8. Close a CR (move to qa + update register + dashboard)

**Phases to complete first**: discovery + planning + implementation must all be done.

1. Write `qa/CR_<NNN>_<SLUG>_LIVE_TEST_REPORT.md`:
   - Executive summary
   - Test environment
   - Stage-by-stage trace (or per-AC verification)
   - Acceptance criteria matrix N/N pass
   - Performance metrics (if applicable)
   - What was proven that wasn't before
   - Decisions / observations
   - Closure declaration

2. Update implementation closeout doc header: status → `<cr>_closed_live_test_passed`.

3. Update `00_register/ROI_MEASUREMENT_CR_REGISTER.md` row: status → closed; add QA link.

4. Update `CR_STATUS_DASHBOARD.md`: 🟢 light; clear blockers column; add transition row at top of recent transitions.

5. Update PRD.md §5 (if a major CR) or §11 (if minor).

6. Append decision entry to `DECISIONS_LOG.md`.

7. Call `finish` tool with summary.

---

## 9. Add data-testid to a frontend component

Per project rule: every interactive or info-critical element MUST have `data-testid`.

Naming: `kebab-case`, describes function not style.

```jsx
<Button data-testid="profile-save-btn" onClick={onSave}>Save</Button>
<Input data-testid="profile-gstin-input" value={gstin} ... />
<div data-testid="profile-validation-error">{error}</div>
<Select data-testid="profile-state-select">
  ...
</Select>
```

**Rule**: unique per element; no duplicates; no omissions.

---

## 10. Probe and explain a tenant's mapping issue

When a customer reports "WhatsApp shows wrong values" (the bug that surfaced CR-015):

```python
UID = "pos_<tenant>"
TEMPLATE_ID = <int or str>

# 1. Check event_template_map row's template_id TYPE
em = await db.whatsapp_event_template_map.find_one({"user_id": UID, "event_key": "<event>"})
print(f"event_map template_id: {em.get('template_id')!r}  type={type(em.get('template_id')).__name__}")

# 2. Check variable_map row's template_id TYPE
vm = await db.whatsapp_template_variable_map.find_one({"user_id": UID, "template_id": TEMPLATE_ID})
print(f"variable_map (int lookup): {'FOUND' if vm else 'NOT FOUND'}")
vm = await db.whatsapp_template_variable_map.find_one({"user_id": UID, "template_id": str(TEMPLATE_ID)})
print(f"variable_map (str lookup): {'FOUND' if vm else 'NOT FOUND'}")

# 3. Look at actual mappings stored
if vm:
    print("mappings:", vm.get("mappings"))
    print("modes:", vm.get("modes"))

# 4. Check what's actually in the latest send's body_values
row = await db.whatsapp_message_logs.find_one(
    {"user_id": UID, "event_type": "<event>"},
    sort=[("created_at", -1)]
)
print(f"latest send body_values: {row.get('body_values')}")
print(f"latest send authkey_raw_response: {row.get('authkey_raw_response')}")
```

**Common findings**:
- `body_values` is `{}` → resolver returned empty → check Bug #1 (type mismatch) or Bug #2 (bad var_keys).
- `body_values` is populated but template still shows "Test" → AuthKey-side template issue or wrong template_id sent.
- One slot is empty in `body_values` → that slot's mapping is invalid or the field isn't in event_data.

Cross-reference: `CR_015_WHATSAPP_VARIABLE_MAPPING_FIDELITY_DISCOVERY.md` for full bug taxonomy.

---

**End of agent playbook. Add new recipes as you invent them.**
