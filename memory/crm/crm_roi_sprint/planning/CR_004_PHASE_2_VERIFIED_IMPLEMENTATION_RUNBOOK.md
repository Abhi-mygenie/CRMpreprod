# CR-004 — Phase 2 · Variable ↔ DB Mapping — VERIFIED Implementation Runbook

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2 — Variable ↔ DB Schema Mapping Layer
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr004_p2_runbook_verified_ready_for_implementation`
**Depends on:** P1 (Foundation Cleanup) — **COMPLETE** (`cr004_phase_1_complete`)
**Blocks:** P3 (Event Reconciliation), P5 (Segment Broadcasts)

> All line numbers verified against live codebase post-P1 on 2026-05-27.
> Owner decisions D2-1 through D2-5 defaulted per plan §9 (scope as drafted, warn-only, Rs. symbol, date formatter on, manual testing).

---

## 0. Pre-flight (run before any code change)

```bash
# 1. P1 in place?
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s "$API/api/whatsapp/variables" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d['variables'])==10; print('P1 OK: 10 vars')"
curl -s -o /dev/null -w "%{http_code}" "$API/api/whatsapp/templates"  # must be 404

# 2. P1 tests still green
cd /app/backend && python3 -m pytest tests/test_whatsapp_text_mode.py tests/test_whatsapp_variables_endpoint.py -q

# 3. Services up
sudo supervisorctl status
```

If any fails → STOP, fix P1 first.

---

## 1. What P2 Does (3 items)

| # | Item | Files touched |
|---|---|---|
| 1 | Enrich variable registry with `sources`, `fills_on_events`, `formatter` | `core/whatsapp_variables.py` (overwrite) |
| 2 | New `resolve_variable()` + `_format_value()` functions; refactor `build_body_values()` to use them; remove `field_aliases` + `get_value()` | `core/whatsapp.py` lines 204-266 |
| 3a | Inject brand data (restaurant_name) in `trigger_whatsapp_event()` | `core/whatsapp.py` lines 389-420 |
| 3b | Save-time validator returns warnings on incompatible event/variable combos | `routers/whatsapp.py` lines 581-605 |
| FE | Surface warnings as toast on save | `WhatsAppAutomationContent.jsx` line 593, `TemplatesPage.jsx` line 143 |
| Tests | 19 new unit tests | `tests/test_whatsapp_resolver.py` (new) |

**Total: 3 backend files edited. 2 frontend files edited. 1 new test file. 0 new dependencies.**

---

## STEP 1 · Overwrite `core/whatsapp_variables.py` with enriched registry

**File:** `/app/backend/core/whatsapp_variables.py`
**Action:** Overwrite entire file.

```python
"""
Canonical WhatsApp template variable registry — P2 enriched.

Each variable declares:
  - key, label, example, description (UI)
  - sources: ordered fallback list (resolver walks until first non-empty)
  - fills_on_events: "*" or list of event keys that reliably populate
                     this variable's sources at trigger time
  - formatter: None | "currency" | "date" | "integer"

Resolution at send time is done by core.whatsapp.resolve_variable().
DO NOT add 'aliases' here — sources is the single source of truth.
"""

ALL_EVENTS = "*"
COUPON_EVENTS = ["coupon_earned"]
EXPIRY_EVENTS = ["points_expiring"]

WHATSAPP_VARIABLES = [
    {
        "key": "customer_name",
        "label": "Customer Name",
        "example": "John",
        "description": "The customer's full name.",
        "sources": [
            {"from": "customer", "field": "name"},
            {"from": "customer", "field": "customer_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "points_balance",
        "label": "Points Balance",
        "example": "1,250",
        "description": "Current loyalty points balance after this event.",
        "sources": [
            {"from": "event", "field": "points_balance"},
            {"from": "event", "field": "balance_after"},
            {"from": "customer", "field": "total_points"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": "integer",
    },
    {
        "key": "points_earned",
        "label": "Points Earned",
        "example": "50",
        "description": "Points earned in this transaction.",
        "sources": [
            {"from": "event", "field": "points_earned"},
            {"from": "event", "field": "points"},
            {"from": "event", "field": "bonus_points"},
            {"from": "event", "field": "birthday_bonus"},
            {"from": "event", "field": "anniversary_bonus"},
            {"from": "event", "field": "first_visit_bonus"},
        ],
        "fills_on_events": [
            "points_earned", "bonus_points", "birthday", "anniversary",
            "first_visit", "welcome_message", "send_bill", "send_bill_auto",
        ],
        "formatter": "integer",
    },
    {
        "key": "points_redeemed",
        "label": "Points Redeemed",
        "example": "100",
        "description": "Points redeemed in this transaction.",
        "sources": [
            {"from": "event", "field": "points_redeemed"},
            {"from": "event", "field": "redeemed_points"},
            {"from": "customer", "field": "total_points_redeemed"},
        ],
        "fills_on_events": ["points_redeemed"],
        "formatter": "integer",
    },
    {
        "key": "wallet_balance",
        "label": "Wallet Balance",
        "example": "Rs.500",
        "description": "Current wallet balance after this event.",
        "sources": [
            {"from": "event", "field": "wallet_balance"},
            {"from": "customer", "field": "wallet_balance"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": "currency",
    },
    {
        "key": "amount",
        "label": "Amount",
        "example": "Rs.1,000",
        "description": "Transaction or order amount.",
        "sources": [
            {"from": "event", "field": "amount"},
            {"from": "event", "field": "order_amount"},
            {"from": "event", "field": "bill_amount"},
            {"from": "event", "field": "discount"},
            {"from": "customer", "field": "total_spent"},
        ],
        "fills_on_events": [
            "send_bill", "send_bill_auto", "send_bill_manual",
            "wallet_credit", "wallet_debit", "coupon_earned",
            "new_order_customer",
        ],
        "formatter": "currency",
    },
    {
        "key": "tier",
        "label": "Customer Tier",
        "example": "Gold",
        "description": "Loyalty tier (Bronze/Silver/Gold/Platinum).",
        "sources": [
            {"from": "event", "field": "new_tier"},
            {"from": "customer", "field": "tier"},
            {"from": "customer", "field": "membership_tier"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "restaurant_name",
        "label": "Restaurant Name",
        "example": "Demo Restaurant",
        "description": "The brand/outlet name.",
        "sources": [
            {"from": "brand", "field": "restaurant_name"},
        ],
        "fills_on_events": ALL_EVENTS,
        "formatter": None,
    },
    {
        "key": "coupon_code",
        "label": "Coupon Code",
        "example": "SAVE20",
        "description": "Coupon code applied or earned.",
        "sources": [
            {"from": "event", "field": "coupon_code"},
        ],
        "fills_on_events": COUPON_EVENTS,
        "formatter": None,
    },
    {
        "key": "expiry_date",
        "label": "Expiry Date",
        "example": "31 Dec 2026",
        "description": "Points or coupon expiry date.",
        "sources": [
            {"from": "event", "field": "expiry_date"},
        ],
        "fills_on_events": EXPIRY_EVENTS,
        "formatter": "date",
    },
]

VARIABLES_BY_KEY = {v["key"]: v for v in WHATSAPP_VARIABLES}


def get_variable(key: str):
    """Return the registry entry for a variable key, or None."""
    return VARIABLES_BY_KEY.get(key)


def fills_on(var_key: str, event_key: str) -> bool:
    """Return True if the variable reliably fills on the given event."""
    v = VARIABLES_BY_KEY.get(var_key)
    if not v:
        return False
    fills = v.get("fills_on_events")
    if fills == ALL_EVENTS:
        return True
    return event_key in (fills or [])
```

**Acceptance:**
```bash
cd /app/backend && python3 -c "
from core.whatsapp_variables import WHATSAPP_VARIABLES, fills_on
assert len(WHATSAPP_VARIABLES) == 10
assert fills_on('customer_name', 'birthday') == True
assert fills_on('coupon_code', 'birthday') == False
assert fills_on('coupon_code', 'coupon_earned') == True
assert fills_on('tier', 'tier_upgrade') == True
print('STEP 1 OK')
"
```

---

## STEP 2 · Add resolver + formatter + refactor build_body_values in `core/whatsapp.py`

**File:** `/app/backend/core/whatsapp.py`

### Edit A — Add import at top (after line 10 `from dataclasses import dataclass`):

```python
from core.whatsapp_variables import VARIABLES_BY_KEY, get_variable
```

### Edit B — Insert new helpers BEFORE `build_body_values` (insert before line 204):

```python
def _format_value(value, formatter):
    """Apply a formatter to a resolved value. Returns "" for None."""
    if value is None or value == "":
        return ""
    if formatter == "currency":
        try:
            n = float(value)
            return f"Rs.{int(n):,}" if n == int(n) else f"Rs.{n:,.2f}"
        except (ValueError, TypeError):
            return str(value)
    if formatter == "integer":
        try:
            return f"{int(float(value)):,}"
        except (ValueError, TypeError):
            return str(value)
    if formatter == "date":
        from datetime import datetime as dt
        try:
            if isinstance(value, str):
                d = dt.fromisoformat(value.replace("Z", "+00:00"))
                return d.strftime("%d %b %Y")
            return str(value)
        except (ValueError, TypeError):
            return str(value)
    return str(value)


def resolve_variable(var_key, customer, event_data=None, brand=None):
    """
    Resolve a single template variable via its registry source chain.
    Replaces the legacy field_aliases dict.
    Returns "" if no source yields a non-empty value.
    """
    entry = get_variable(var_key)
    if not entry:
        return ""
    event_data = event_data or {}
    brand = brand or {}

    for source in entry.get("sources", []):
        scope = source.get("from")
        field = source.get("field")
        if not scope or not field:
            continue
        if scope == "customer":
            value = customer.get(field)
        elif scope == "event":
            value = event_data.get(field)
        elif scope == "brand":
            value = brand.get(field)
        else:
            continue

        if value not in (None, "", 0):
            return _format_value(value, entry.get("formatter"))
        # 0 is valid for integers (e.g., points_balance=0)
        if value == 0 and entry.get("formatter") in ("integer", "currency"):
            return _format_value(0, entry.get("formatter"))

    return ""
```

### Edit C — Replace `build_body_values` (lines 204-266) entirely:

Find the entire function from `def build_body_values(` through the closing `return body_values`.

Replace with:

```python
def build_body_values(
    template_variables: List[str],
    variable_mappings: Dict[str, str],
    customer_data: Dict[str, Any],
    event_data: Dict[str, Any] = None,
    variable_modes: Dict[str, str] = None,
    brand_data: Dict[str, Any] = None,
) -> Dict[str, str]:
    """
    Build the bodyValues dict for AuthKey send.
    For each {{n}}: text mode → literal; map mode → resolve via registry.
    """
    body_values = {}
    modes = variable_modes or {}

    for var in template_variables:
        var_num = var.strip("{}") if var else ""
        if not var_num:
            continue
        mapped_field = variable_mappings.get(var, "")
        mode = modes.get(var, "map")

        if not mapped_field:
            body_values[var_num] = ""
            continue

        if mode == "text":
            body_values[var_num] = str(mapped_field)
        else:
            body_values[var_num] = resolve_variable(
                mapped_field, customer_data, event_data, brand_data,
            )

    return body_values
```

**What's deleted:** The `field_aliases` dict (lines 227-234), the `get_value()` inner function (lines 236-245), and the old loop body (lines 247-264) — all replaced by the resolver.

**Verify deletion:**
```bash
grep -n "field_aliases" /app/backend/core/whatsapp.py
# Must return 0 matches
```

---

## STEP 3 · Inject brand data in `trigger_whatsapp_event()` (same file)

**File:** `/app/backend/core/whatsapp.py`

### Edit A — Replace lines 389-420 (the body of trigger_whatsapp_event from "try:" through "body_values = build_body_values"):

Find:
```python
    try:
        # 1. Get user's AuthKey API key
        api_key = await get_user_authkey(db, user_id)
        if not api_key:
            logger.debug(f"No AuthKey API key for user {user_id}, skipping WhatsApp trigger")
            return None
        
        # 2. Get template configuration for this event
        config = await get_event_template_config(db, user_id, event_type)
        if not config:
            logger.debug(f"No template configured for event {event_type}, skipping")
            return None
        
        if not config.get("is_enabled", True):
            logger.debug(f"Event {event_type} is disabled, skipping")
            return None
        
        template_id = config["template_id"]
        variable_mappings = config.get("variable_mappings", {})
        
        # 3. Get template details to find variables
        # Fetch from authkey templates cache or use stored mapping
        template_variables = list(variable_mappings.keys()) if variable_mappings else []
        
        # 4. Build body values from mappings (P1: pass modes for text-mode support)
        body_values = build_body_values(
            template_variables,
            variable_mappings,
            customer,
            event_data,
            variable_modes=config.get("variable_modes", {}),
        )
```

Replace with:
```python
    try:
        # 1. Get user's AuthKey API key + brand data (combined query)
        user_doc = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "authkey_api_key": 1, "restaurant_name": 1},
        )
        if not user_doc:
            return None
        api_key = user_doc.get("authkey_api_key")
        if not api_key:
            logger.debug(f"No AuthKey API key for user {user_id}, skipping WhatsApp trigger")
            return None
        brand_data = {"restaurant_name": user_doc.get("restaurant_name", "")}

        # 2. Get template configuration for this event
        config = await get_event_template_config(db, user_id, event_type)
        if not config:
            logger.debug(f"No template configured for event {event_type}, skipping")
            return None

        if not config.get("is_enabled", True):
            logger.debug(f"Event {event_type} is disabled, skipping")
            return None

        template_id = config["template_id"]
        variable_mappings = config.get("variable_mappings", {})

        # 3. Build body values via P2 registry resolver
        template_variables = list(variable_mappings.keys()) if variable_mappings else []
        body_values = build_body_values(
            template_variables,
            variable_mappings,
            customer,
            event_data,
            variable_modes=config.get("variable_modes", {}),
            brand_data=brand_data,
        )
```

**Note:** `get_user_authkey()` at line 269 is no longer called here. It has no other callers (verified by grep). Leave the function in place (no harm) — or optionally delete lines 269-272 if you want to clean up.

---

## STEP 4 · Validator in `PUT /whatsapp/template-variable-map/{template_id}`

**File:** `/app/backend/routers/whatsapp.py`

### Replace lines 581-605 (the `save_template_variable_mapping` function):

Find:
```python
@router.put("/template-variable-map/{template_id}")
async def save_template_variable_mapping(
    template_id: str,
    data: dict,
    user: dict = Depends(get_current_user)
):
    """Save variable mappings for a template."""
    now = datetime.now(timezone.utc).isoformat()
    
    # Filter out "none" values
    clean_mappings = {k: v for k, v in (data.get("mappings") or {}).items() if v and v != "none"}
    
    await db.whatsapp_template_variable_map.update_one(
        {"user_id": user["id"], "template_id": template_id},
        {"$set": {
            "user_id": user["id"],
            "template_id": template_id,
            "template_name": data.get("template_name", ""),
            "mappings": clean_mappings,
            "modes": data.get("modes") or {},
            "updated_at": now
        }},
        upsert=True
    )
    return {"message": "Variable mappings saved", "template_id": template_id, "mappings": clean_mappings}
```

Replace with:
```python
@router.put("/template-variable-map/{template_id}")
async def save_template_variable_mapping(
    template_id: str,
    data: dict,
    user: dict = Depends(get_current_user)
):
    """Save variable mappings for a template + return warnings for incompatible event/variable combos."""
    from core.whatsapp_variables import fills_on

    now = datetime.now(timezone.utc).isoformat()
    clean_mappings = {k: v for k, v in (data.get("mappings") or {}).items() if v and v != "none"}
    modes = data.get("modes") or {}

    await db.whatsapp_template_variable_map.update_one(
        {"user_id": user["id"], "template_id": template_id},
        {"$set": {
            "user_id": user["id"],
            "template_id": template_id,
            "template_name": data.get("template_name", ""),
            "mappings": clean_mappings,
            "modes": modes,
            "updated_at": now,
        }},
        upsert=True,
    )

    # P2: Compute warnings — check each map-mode variable against events using this template
    warnings = []
    event_mappings = await db.whatsapp_event_template_map.find(
        {"user_id": user["id"], "template_id": template_id},
        {"_id": 0, "event_key": 1},
    ).to_list(50)

    for em in event_mappings:
        event_key = em.get("event_key")
        if not event_key:
            continue
        for placeholder, var_key in clean_mappings.items():
            if modes.get(placeholder) == "text":
                continue
            if not fills_on(var_key, event_key):
                warnings.append({
                    "event": event_key,
                    "placeholder": placeholder,
                    "variable": var_key,
                    "message": f"Variable '{var_key}' does not reliably fill on event '{event_key}'.",
                })

    return {
        "message": "Variable mappings saved",
        "template_id": template_id,
        "mappings": clean_mappings,
        "warnings": warnings,
    }
```

---

## STEP 5 · Frontend — surface warnings in both pages

### WhatsAppAutomationContent.jsx (line 590-616)

Find:
```jsx
    const handleSaveVariableMapping = async () => {
        setSavingVariableMapping(true);
        try {
            await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid,
                template_name: mappingTemplate.temp_name,
                mappings: variableMappings,
                modes: variableMappingModes
            });
```

Replace `await api.put(...)` line with:
```jsx
            const res = await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid,
                template_name: mappingTemplate.temp_name,
                mappings: variableMappings,
                modes: variableMappingModes
            });
            const warnings = res.data?.warnings || [];
            if (warnings.length > 0) {
                warnings.forEach(w => toast.warning(w.message, { duration: 5000 }));
            }
```

### TemplatesPage.jsx (line 140-155)

Find:
```jsx
            await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid, template_name: mappingTemplate.temp_name,
                mappings: variableMappings, modes: variableMappingModes
            });
```

Replace with:
```jsx
            const res = await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid, template_name: mappingTemplate.temp_name,
                mappings: variableMappings, modes: variableMappingModes
            });
            const warnings = res.data?.warnings || [];
            if (warnings.length > 0) {
                warnings.forEach(w => toast.warning(w.message, { duration: 5000 }));
            }
```

---

## STEP 6 · Create tests

**File:** `/app/backend/tests/test_whatsapp_resolver.py` (NEW)

```python
"""
P2: resolver + registry tests.
Covers Addendum A 1.5 fixes and AC-2 through AC-9.
"""
from core.whatsapp import build_body_values, resolve_variable
from core.whatsapp_variables import fills_on


# --- resolve_variable direct tests ---

def test_customer_name_from_customer():
    assert resolve_variable("customer_name", {"name": "Alice"}, {}, {}) == "Alice"

def test_points_earned_from_event():
    assert resolve_variable("points_earned", {}, {"points_earned": 50}, {}) == "50"

def test_points_earned_falls_to_bonus():
    assert resolve_variable("points_earned", {}, {"birthday_bonus": 100}, {}) == "100"

def test_tier_uses_new_tier_from_event():
    assert resolve_variable("tier", {"tier": "Bronze"}, {"new_tier": "Gold"}, {}) == "Gold"

def test_tier_falls_back_to_customer():
    assert resolve_variable("tier", {"tier": "Silver"}, {}, {}) == "Silver"

def test_restaurant_name_from_brand():
    assert resolve_variable("restaurant_name", {}, {}, {"restaurant_name": "Demo Cafe"}) == "Demo Cafe"

def test_restaurant_name_blank_without_brand():
    assert resolve_variable("restaurant_name", {}, {}, {}) == ""

def test_amount_currency_formatter():
    assert resolve_variable("amount", {}, {"amount": 1500}, {}) == "Rs.1,500"

def test_amount_falls_back_to_order_amount():
    assert resolve_variable("amount", {}, {"order_amount": 750.50}, {}) == "Rs.750.50"

def test_wallet_balance_zero():
    assert resolve_variable("wallet_balance", {"wallet_balance": 0}, {}, {}) == "Rs.0"

def test_points_balance_integer_formatter():
    assert resolve_variable("points_balance", {"total_points": 1250}, {}, {}) == "1,250"

def test_coupon_code_from_event():
    assert resolve_variable("coupon_code", {}, {"coupon_code": "SAVE20"}, {}) == "SAVE20"

def test_expiry_date_iso_formatted():
    assert resolve_variable("expiry_date", {}, {"expiry_date": "2026-12-31T00:00:00Z"}, {}) == "31 Dec 2026"

def test_unknown_variable():
    assert resolve_variable("nonexistent", {}, {}, {}) == ""


# --- build_body_values integration ---

def test_build_with_resolver_and_brand():
    body = build_body_values(
        ["{{1}}", "{{2}}", "{{3}}"],
        {"{{1}}": "customer_name", "{{2}}": "restaurant_name", "{{3}}": "amount"},
        {"name": "Eve"}, {"amount": 1000}, {"{{1}}": "map", "{{2}}": "map", "{{3}}": "map"},
        {"restaurant_name": "Pizza Hub"},
    )
    assert body == {"1": "Eve", "2": "Pizza Hub", "3": "Rs.1,000"}

def test_text_mode_still_works():
    body = build_body_values(
        ["{{1}}"], {"{{1}}": "Hello literal"}, {"name": "X"}, {}, {"{{1}}": "text"}, {},
    )
    assert body == {"1": "Hello literal"}


# --- fills_on coverage ---

def test_fills_on_universal():
    assert fills_on("customer_name", "birthday") is True
    assert fills_on("customer_name", "wallet_credit") is True

def test_fills_on_coupon_code():
    assert fills_on("coupon_code", "coupon_earned") is True
    assert fills_on("coupon_code", "birthday") is False

def test_fills_on_expiry_date():
    assert fills_on("expiry_date", "points_expiring") is True
    assert fills_on("expiry_date", "birthday") is False
```

**Run:**
```bash
cd /app/backend && python3 -m pytest tests/test_whatsapp_resolver.py -v
# All 19 tests must pass.
```

Also re-run P1 tests for regression:
```bash
cd /app/backend && python3 -m pytest tests/test_whatsapp_text_mode.py tests/test_whatsapp_variables_endpoint.py -q
# All 6 must still pass.
```

---

## STEP 7 · Lint + restart + smoke

```bash
cd /app/backend && python3 -m ruff check core/whatsapp.py core/whatsapp_variables.py routers/whatsapp.py --fix
sudo supervisorctl restart backend
sleep 3

# Smoke
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -s "$API/api/whatsapp/variables" | python3 -c "
import sys,json
d = json.load(sys.stdin)
for v in d['variables']:
    assert 'sources' in v, f'{v[\"key\"]} missing sources'
    assert 'fills_on_events' in v
print('All 10 have enriched schema')
"

# Verify field_aliases removed
grep -n "field_aliases" /app/backend/core/whatsapp.py && echo "FAIL: field_aliases still present" || echo "OK: field_aliases removed"
```

---

## STEP 8 · Documentation

Create: `/app/memory/crm/crm_roi_sprint/implementation/CR_004_PHASE_2_VARIABLE_DB_MAPPING_IMPLEMENTATION_REPORT.md`

Same structure as P1 report. Include:
- Summary (3 items shipped)
- Files changed
- Tests (19 new + 6 regression)
- Acceptance criteria (AC-1 through AC-10 from the original P2 plan)
- Status: `cr004_phase_2_complete`

Update `/app/memory/PRD.md` — P2 entry.

---

## Acceptance Criteria (from original plan)

| # | Criterion | How to verify |
|---|---|---|
| AC-1 | `GET /api/whatsapp/variables` returns `sources`, `fills_on_events`, `formatter` per variable | curl |
| AC-2 | `points_earned` trigger fills from `event_data.points_earned` | Unit test `test_points_earned_from_event` |
| AC-3 | `tier_upgrade` trigger fills `tier` from `event_data.new_tier` | Unit test `test_tier_uses_new_tier_from_event` |
| AC-4 | `birthday` trigger fills `restaurant_name` from `users` collection | Unit test `test_restaurant_name_from_brand` + integration (trigger_whatsapp_event fetches user doc) |
| AC-5 | `coupon_earned` fills `coupon_code` from event | Unit test `test_coupon_code_from_event` |
| AC-6 | `points_expiring` fills `expiry_date` formatted | Unit test `test_expiry_date_iso_formatted` |
| AC-7 | `wallet_credit` amount resolves from `event_data.amount` | Unit test `test_amount_currency_formatter` |
| AC-8 | Save mapping with mismatched event/variable → response has `warnings[]` | Manual curl (see STEP 4 acceptance in original plan) |
| AC-9 | P1 regression: existing `points_earned` with `customer_name` + `points_balance` still works | Unit test `test_build_with_resolver_and_brand` + P1 regression suite |
| AC-10 | `field_aliases` dict removed from `core/whatsapp.py` | `grep -n field_aliases /app/backend/core/whatsapp.py` → 0 matches |

---

## Rollback

| Failure | Action |
|---|---|
| Backend won't start after STEP 2 | `git checkout HEAD -- /app/backend/core/whatsapp.py /app/backend/core/whatsapp_variables.py`, restart |
| Resolver returns wrong values | Revert STEP 2 only; P1 build_body_values still works |
| Validator breaks save | Revert STEP 4 only; mapping save reverts to no-warning |

---

## Execution Order Summary

1. STEP 1 — Overwrite `core/whatsapp_variables.py`
2. STEP 2 — Add resolver + refactor `build_body_values` in `core/whatsapp.py`
3. STEP 3 — Inject brand data in `trigger_whatsapp_event` (same file)
4. STEP 4 — Validator in `routers/whatsapp.py`
5. STEP 5 — Frontend warnings (2 files)
6. STEP 6 — Tests
7. STEP 7 — Lint + restart + smoke
8. STEP 8 — Docs

Steps 1-4 are backend (sequential — each builds on prior).
Step 5 is frontend (can parallel with Step 6).
Steps 7-8 are final.

---

**Status:** `cr004_p2_runbook_verified_ready_for_implementation`

Implementation agent: execute steps 1-8 in order. Do not deviate without flagging the owner.
