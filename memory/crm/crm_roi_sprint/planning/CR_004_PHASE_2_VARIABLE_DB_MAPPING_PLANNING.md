# CR-004 — Phase 2 · Variable ↔ DB Schema Mapping Layer — Planning Doc

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2 — Variable ↔ DB Schema Mapping Layer
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr004_p2_planning_drafted_awaiting_owner_signoff`
**Depends on:** P1 (Foundation Cleanup) — must be complete
**Blocks:** P3 (Event Reconciliation), P5 (Segment Broadcasts)

---

## 1. Phase Purpose

P1 unified the variables **list**. P2 binds each variable to its **source of truth** in the DB / event payload, with a single resolver that replaces the brittle 6-entry alias table.

After P2, the answer to "where does `{{customer_name}}` come from?" is one lookup in a registry. No more silent blanks. No more naming mismatches between code and template.

This phase does NOT add new variables. It makes the existing 10 work correctly across all events.

---

## 2. Problem Recap (from Addendum A §1.5)

Of the 10 declared variables:

| Variable | Today's behaviour | P2 fixes |
|---|---|---|
| `customer_name` | ✅ Works | — |
| `points_balance` | ✅ Works | — |
| `wallet_balance` | ✅ Works | — |
| `tier` | 🟡 Works on most events, but `tier_upgrade` event passes `new_tier` not `tier` → blank on upgrade | Resolver reads `event_data.new_tier` → `customer.tier` chain |
| `points_earned` | 🟡 Works only when event_data passes it; no alias from `customer.total_points_earned` | Resolver chain: `event_data.points_earned` → `event_data.points` → `customer.total_points_earned` |
| `points_redeemed` | 🔴 No emitter passes it; resolver has no fallback | Resolver chain: `event_data.points_redeemed` → `customer.total_points_redeemed` |
| `amount` | 🟡 POS passes `order_amount`; wallet passes `amount`; inconsistent | Resolver chain: `event_data.amount` → `event_data.order_amount` → `event_data.bill_amount` → `customer.total_spent` |
| `restaurant_name` | 🔴 Never passed to triggers; resolver returns blank | Resolver fetches from `users` collection (cached per trigger call) |
| `coupon_code` | 🟡 Only filled by `coupon_earned` event | Declared correctly — owner warned if mapped to other events |
| `expiry_date` | 🟡 Only filled by `points_expiring` event | Same |

---

## 3. In-Scope (3 work items)

### Item 1 · Enrich the variable registry

`core/whatsapp_variables.py` (created in P1) gets two new fields per variable:

- `sources`: ordered list of fallback resolution paths
- `fills_on_events`: list of event keys that reliably populate this variable

This becomes a declarative contract: every variable says exactly where its value comes from, in priority order.

**Example shape (illustrative — full content in §11):**
```python
{
    "key": "customer_name",
    "label": "Customer Name",
    "example": "John",
    "description": "...",
    "sources": [
        {"from": "customer", "field": "name"},
        {"from": "customer", "field": "customer_name"},
    ],
    "fills_on_events": "*",  # always available
    "formatter": None,
}
```

### Item 2 · Resolver function — replaces `field_aliases`

New function `resolve_variable(var_key, customer, event_data, brand_data)` in `core/whatsapp.py`:
- Walks the `sources` list for that variable
- Returns first non-empty value
- Applies `formatter` if declared (currency, date, integer)
- Returns `""` if no source resolves

`build_body_values()` becomes a thin loop over `resolve_variable()`. The 6-entry `field_aliases` dict is removed.

### Item 3 · Brand (user) data injection + template-save validator

**3a · Inject brand data once per trigger.** Currently `trigger_whatsapp_event()` only fetches the customer. P2 also fetches the `users` document once and passes it to the resolver, so `restaurant_name` (and future brand-level variables) resolve correctly.

**3b · Validator at template-save time.** `PUT /whatsapp/template-variable-map/{template_id}` returns 200 with a `warnings: []` array when the template is mapped to event `X` but uses a variable that doesn't fill on event `X`. UI displays warnings — does NOT block save (owner may have a reason).

---

## 4. Out of Scope (explicitly NOT in P2)

| Item | Goes to |
|---|---|
| Adding new variables beyond the 10 | Future CR or P9 |
| Renaming events (`first_visit` → `welcome_message` etc.) | P3 |
| Wiring missing emit sites (e.g., `welcome_message` on register) | P3 |
| Adding `channel` field anywhere | P4 |
| SMS-specific variable resolution | P4 |
| Anything broadcast / segment-send | P5 |
| Opt-in / opt-out | P6 |
| Backfilling existing `whatsapp_message_logs.body_values` | Not needed |

---

## 5. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-1 | `GET /api/whatsapp/variables` returns each variable with `sources`, `fills_on_events`, `formatter` fields | curl + JSON inspection |
| AC-2 | A `points_earned` trigger fills `points_earned` variable from `event_data.points_earned` | Unit test |
| AC-3 | A `tier_upgrade` trigger fills `tier` variable from `event_data.new_tier` (not blank) | Unit test |
| AC-4 | A `birthday` trigger fills `restaurant_name` from the `users` collection | Unit test |
| AC-5 | A `coupon_earned` trigger fills `coupon_code` from `event_data.coupon_code` | Unit test |
| AC-6 | A `points_expiring` trigger fills `expiry_date` from `event_data.expiry_date` | Unit test |
| AC-7 | A `wallet_credit` trigger (currently unmapped due to event drift) — when manually mapped — fills `amount` from `event_data.amount` | Unit test |
| AC-8 | Owner saves a `birthday` mapping using `coupon_code` variable → response includes `warnings: ["Variable coupon_code does not fill on event birthday"]` | Manual curl |
| AC-9 | All P1 regression: existing `points_earned` mapping with `customer_name` + `points_balance` still works | Unit test |
| AC-10 | The 6-entry `field_aliases` dict is removed from `core/whatsapp.py`; grep returns zero matches | grep |

---

## 6. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Resolver introduces regression on currently-working `points_earned` / `birthday` / `anniversary` / `points_expiring` triggers | High | Unit tests for each of the 4 wired events before merge; regression-test in testing_agent_v3_fork |
| Extra `users` query per trigger call adds latency | Low | Single doc lookup; trigger is already async + non-blocking via `asyncio.create_task`; no user-perceived latency |
| Formatter (currency) shows "Rs.1000" when owner wants "₹1,000" | Medium | Use "Rs." per project convention (`/app/memory` notes); revisit in future CR if needed |
| Validator warnings get noisy if owner deliberately maps event-irrelevant variables | Low | Warnings are non-blocking; UI can dismiss; owner can ignore |
| `event_data` keys naming inconsistency in callers (e.g., `order_amount` vs `amount`) | Medium | P2 fixes by chaining multiple keys in `sources`; emit sites stay untouched (P3 will reconcile separately) |

---

## 7. Order of Execution

1. **Backend resolver + registry** (Items 1, 2)
2. **Brand data injection** (Item 3a)
3. **Validator endpoint change** (Item 3b)
4. **Tests**
5. **Frontend warnings display**
6. **Lint + smoke + testing_agent_v3_fork (if owner approves D-5 override for P2)**
7. **Docs**

---

## 8. Effort

| Sub-item | Sessions |
|---|---|
| Item 1 — Registry enrichment | 0.5 |
| Item 2 — Resolver function | 1 |
| Item 3a — Brand data injection | 0.5 |
| Item 3b — Validator + warnings | 1 |
| Tests + frontend warning display | 1 |
| Docs + verification | 0.5 |
| **Total** | **~3-4 sessions** |

---

## 9. Owner Sign-off Required

| # | Decision | Default if owner skips |
|---|---|---|
| D2-1 | Approve 3-item scope as drafted | Approved as drafted |
| D2-2 | Validator behaviour: **warn-only** (don't block save) vs **block save on warning** | Warn-only |
| D2-3 | Currency formatter symbol: `Rs.` (project convention) vs `₹` (need PDF font change first) vs `INR ` | `Rs.` |
| D2-4 | Add a `formatter` option for dates (`d MMM yyyy` like "31 Dec 2026") | Yes |
| D2-5 | Testing approach: testing_agent_v3_fork override (like P1) or manual only | Owner picks; default manual |

---

## 10. What Happens Next

Once owner signs off on §9:
- Implementation per §7 + §11 spec below
- P3 (Event Reconciliation) planning starts after P2 is verified

---

# §11 · Implementation Spec — Code-Level Detail (Pickup-Ready)

> Same depth as P1 §11. Implementation agent can execute cold. **Line numbers below assume P1 is already deployed** — i.e., the legacy CRUD/seeder/Pydantic models in `whatsapp.py`, `auth.py`, `helpers.py`, `schemas.py` are already gone. If P1 is not yet deployed, abort and complete P1 first.

## 11.1 Pre-flight Checks

```bash
# 1. Confirm P1 is in place
curl -s "$API/api/whatsapp/variables" | python3 -c "import sys,json; d=json.load(sys.stdin); assert len(d['variables'])==10; print('P1 verified: 10 vars')"
curl -s -o /dev/null -w "%{http_code}\n" "$API/api/whatsapp/templates"  # → must be 404

# 2. Confirm existing event triggers still log
# Pick a user with AuthKey + active points_earned mapping; trigger a bonus points award; tail logs

# 3. Confirm pytest baseline green
cd /app/backend && python3 -m pytest tests/test_whatsapp_text_mode.py tests/test_whatsapp_variables_endpoint.py -q
```

If any pre-flight fails → STOP, fix P1 first.

---

## STEP 1 · Replace `core/whatsapp_variables.py` with enriched registry

**File:** `/app/backend/core/whatsapp_variables.py`

Overwrite the P1 file (10 simple dicts) with the enriched registry:

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

# Event coverage helpers (DRY — keep this list in sync with §3 of CR-004 P0 main report)
ALL_EVENTS = "*"
LOYALTY_EVENTS = ["points_earned", "bonus_points", "points_redeemed", "tier_upgrade"]
COUPON_EVENTS = ["coupon_earned"]
WALLET_EVENTS = ["wallet_credit", "wallet_debit"]
LIFECYCLE_EVENTS = ["birthday", "anniversary", "welcome_message", "first_visit"]
EXPIRY_EVENTS = ["points_expiring"]
ORDER_EVENTS = ["send_bill", "send_bill_auto", "send_bill_manual", "new_order_customer"]


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


# Lookup map (built once at import) — O(1) access by key
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
python3 -c "
from core.whatsapp_variables import WHATSAPP_VARIABLES, fills_on
assert len(WHATSAPP_VARIABLES) == 10
assert fills_on('customer_name', 'birthday') == True
assert fills_on('coupon_code', 'birthday') == False
assert fills_on('coupon_code', 'coupon_earned') == True
print('OK')
"
```

---

## STEP 2 · Add resolver + formatter in `core/whatsapp.py`

**File:** `/app/backend/core/whatsapp.py`

**Edit A · New imports at top (after existing imports):**
```python
from core.whatsapp_variables import (
    WHATSAPP_VARIABLES, VARIABLES_BY_KEY, get_variable, fills_on
)
```

**Edit B · New helpers — insert before `build_body_values` (which is at line 204):**

```python
def _format_value(value, formatter: Optional[str]) -> str:
    """Apply a formatter to a resolved value. Returns "" for None."""
    if value is None or value == "":
        return ""
    if formatter == "currency":
        try:
            n = float(value)
            return f"Rs.{int(n):,}" if n.is_integer() else f"Rs.{n:,.2f}"
        except (ValueError, TypeError):
            return str(value)
    if formatter == "integer":
        try:
            return f"{int(float(value)):,}"
        except (ValueError, TypeError):
            return str(value)
    if formatter == "date":
        from datetime import datetime
        try:
            if isinstance(value, str):
                # Try ISO first
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                return dt.strftime("%d %b %Y")
            return str(value)
        except (ValueError, TypeError):
            return str(value)
    return str(value)


def resolve_variable(
    var_key: str,
    customer: Dict[str, Any],
    event_data: Optional[Dict[str, Any]] = None,
    brand: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Resolve a single template variable via its registry source chain.

    Replaces the legacy `field_aliases` dict + ad-hoc resolution.
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

        # Special case: 0 is a valid integer value (e.g., points_balance=0)
        if value == 0 and entry.get("formatter") == "integer":
            return _format_value(0, entry.get("formatter"))

    return ""
```

**Edit C · Refactor `build_body_values` (currently lines 204-269):**

Replace the entire function body — keep the signature added in P1:

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
    Build the bodyValues dict ({"1": "...", "2": "..."}) for AuthKey send.

    For each variable {{n}} in template_variables:
      - if modes[{{n}}] == "text": pass the literal string from mappings
      - else (map mode, default): resolve via core.whatsapp_variables registry
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
                mapped_field,
                customer_data,
                event_data,
                brand_data,
            )

    return body_values
```

**Edit D · Inject brand_data in `trigger_whatsapp_event` (currently line 366):**

Find lines 392-422 (the body of `trigger_whatsapp_event` that fetches api_key and config). Add brand fetch and pass-through:

```python
        # 1. Get user's AuthKey API key + brand data (one combined query)
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

        # 3. Build body values via registry resolver
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

Delete the now-redundant `get_user_authkey()` helper at line 272 if it has no other callers (verify with `grep -rn "get_user_authkey" /app/backend`). If still used elsewhere, leave it.

**Edit E · Remove `field_aliases`:**

The `field_aliases` dict at lines 230-237 (inside `build_body_values`) and the `get_value()` inner function at lines 239-252 are no longer used. Both were embedded inside the old `build_body_values` and disappear with the rewrite in Edit C. Confirm via:
```bash
grep -n "field_aliases" /app/backend/core/whatsapp.py
# Expected: 0 matches
```

**Acceptance:** `core/whatsapp.py` lints clean. Unit tests in STEP 5 pass.

---

## STEP 3 · Extend `GET /whatsapp/variables` response (no code change actually)

The endpoint already returns whatever is in `WHATSAPP_VARIABLES`. After STEP 1, it automatically includes the new `sources`, `fills_on_events`, `formatter` fields.

**Acceptance:**
```bash
curl -s "$API/api/whatsapp/variables" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for v in d['variables']:
    assert 'sources' in v, f'{v[\"key\"]} missing sources'
    assert 'fills_on_events' in v, f'{v[\"key\"]} missing fills_on_events'
print('All 10 variables have enriched schema')
"
```

---

## STEP 4 · Validator at `PUT /whatsapp/template-variable-map/{template_id}`

**File:** `/app/backend/routers/whatsapp.py`

Locate the existing endpoint at lines ~771-795 (P1 line numbers may shift slightly — find by route decorator):

```python
@router.put("/template-variable-map/{template_id}")
async def save_template_variable_mapping(
    template_id: str,
    data: dict,
    user: dict = Depends(get_current_user)
):
```

**Edit:** Add an optional `event_key` lookup to validate against. The template-variable-map doesn't directly know which event it'll be used on, but we can cross-check against existing `whatsapp_event_template_map` rows that reference this template.

Replace the function body with:

```python
    """Save variable mappings for a template + return warnings if mapped to events that don't fill the chosen variables."""
    from core.whatsapp_variables import fills_on

    now = datetime.now(timezone.utc).isoformat()

    # Filter out "none" values
    clean_mappings = {k: v for k, v in (data.get("mappings") or {}).items() if v and v != "none"}
    modes = data.get("modes") or {}

    # Save the mapping
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

    # Compute warnings: for each event currently mapped to this template,
    # check each variable_key against fills_on(var, event).
    # Skip warnings for variables in "text" mode (literal — coverage doesn't apply).
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
                    "message": f"Variable '{var_key}' does not reliably fill on event '{event_key}'."
                })

    return {
        "message": "Variable mappings saved",
        "template_id": template_id,
        "mappings": clean_mappings,
        "warnings": warnings,
    }
```

**Acceptance:**
```bash
# Setup: map template T to event "birthday"
curl -X PUT "$API/api/whatsapp/event-template-map" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mappings":[{"event_key":"birthday","template_id":"<wid>","template_name":"X","is_enabled":true}]}'

# Save variable mapping that uses coupon_code (which does NOT fill on birthday)
curl -X PUT "$API/api/whatsapp/template-variable-map/<wid>" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"template_name":"X","mappings":{"{{1}}":"coupon_code"},"modes":{"{{1}}":"map"}}'

# Response must include warnings array with the birthday/coupon_code message.
```

---

## STEP 5 · Backend tests

**File:** `/app/backend/tests/test_whatsapp_resolver.py` (NEW)

```python
"""
P2: resolver + registry tests.
Covers Addendum A §1.5 fixes and AC-2 through AC-9.
"""
import pytest
from core.whatsapp import build_body_values, resolve_variable
from core.whatsapp_variables import fills_on


# --- resolve_variable direct tests ---

def test_customer_name_from_customer_name_alias():
    assert resolve_variable("customer_name", {"name": "Alice"}, {}, {}) == "Alice"

def test_points_earned_from_event_data():
    val = resolve_variable("points_earned", {"total_points_earned": 999}, {"points_earned": 50}, {})
    assert val == "50"

def test_points_earned_falls_through_to_customer_field():
    val = resolve_variable("points_earned", {"total_points_earned": 999}, {}, {})
    assert val == "999"

def test_tier_upgrade_uses_new_tier_from_event():
    val = resolve_variable("tier", {"tier": "Bronze"}, {"new_tier": "Gold"}, {})
    assert val == "Gold"

def test_tier_falls_back_to_customer_tier():
    val = resolve_variable("tier", {"tier": "Silver"}, {}, {})
    assert val == "Silver"

def test_restaurant_name_from_brand():
    val = resolve_variable("restaurant_name", {}, {}, {"restaurant_name": "Demo Cafe"})
    assert val == "Demo Cafe"

def test_restaurant_name_blank_without_brand():
    val = resolve_variable("restaurant_name", {}, {}, {})
    assert val == ""

def test_amount_currency_formatter():
    val = resolve_variable("amount", {}, {"amount": 1500}, {})
    assert val == "Rs.1,500"

def test_amount_falls_back_to_order_amount():
    val = resolve_variable("amount", {}, {"order_amount": 750.50}, {})
    assert val == "Rs.750.50"

def test_wallet_balance_zero_displays_as_zero():
    val = resolve_variable("wallet_balance", {"wallet_balance": 0}, {}, {})
    assert val == "Rs.0"

def test_points_balance_integer_formatter():
    val = resolve_variable("points_balance", {"total_points": 1250}, {}, {})
    assert val == "1,250"

def test_coupon_code_from_event():
    val = resolve_variable("coupon_code", {}, {"coupon_code": "SAVE20"}, {})
    assert val == "SAVE20"

def test_expiry_date_iso_formatted():
    val = resolve_variable("expiry_date", {}, {"expiry_date": "2026-12-31T00:00:00Z"}, {})
    assert val == "31 Dec 2026"

def test_unknown_variable_returns_empty():
    assert resolve_variable("non_existent", {}, {}, {}) == ""


# --- build_body_values integration ---

def test_build_body_values_with_resolver_and_brand():
    body = build_body_values(
        template_variables=["{{1}}", "{{2}}", "{{3}}"],
        variable_mappings={"{{1}}": "customer_name", "{{2}}": "restaurant_name", "{{3}}": "amount"},
        customer_data={"name": "Eve"},
        event_data={"amount": 1000},
        variable_modes={"{{1}}": "map", "{{2}}": "map", "{{3}}": "map"},
        brand_data={"restaurant_name": "Pizza Hub"},
    )
    assert body == {"1": "Eve", "2": "Pizza Hub", "3": "Rs.1,000"}


def test_build_body_values_text_mode_still_works_post_p2():
    body = build_body_values(
        template_variables=["{{1}}"],
        variable_mappings={"{{1}}": "Welcome literally"},
        customer_data={"name": "X"},
        event_data={},
        variable_modes={"{{1}}": "text"},
        brand_data={},
    )
    assert body == {"1": "Welcome literally"}


# --- fills_on coverage tests ---

def test_fills_on_universal_variable():
    assert fills_on("customer_name", "birthday") is True
    assert fills_on("customer_name", "wallet_credit") is True

def test_fills_on_coupon_code_only_for_coupon_events():
    assert fills_on("coupon_code", "coupon_earned") is True
    assert fills_on("coupon_code", "birthday") is False

def test_fills_on_expiry_date_only_for_expiry_events():
    assert fills_on("expiry_date", "points_expiring") is True
    assert fills_on("expiry_date", "birthday") is False
```

Run:
```bash
cd /app/backend && python3 -m pytest tests/test_whatsapp_resolver.py -v
# All 19 tests must pass.
```

---

## STEP 6 · Frontend — surface warnings in Variable Mapping modal

**File:** `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx`

Locate `handleSaveVariableMapping` (~line 626-653 in the post-P1 file). Modify to inspect the response's `warnings` array:

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
        // … success toast …
```

Replace the `await` line with:
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

Same edit pattern in `TemplatesPage.jsx` if it also calls this endpoint (verify).

**Acceptance:** Open the variable mapping modal, map a template to a variable that doesn't fill on the mapped event → save → see warning toasts.

---

## STEP 7 · Lint + smoke + (optional) testing_agent_v3_fork

```bash
cd /app/backend && python3 -m ruff check core/whatsapp.py core/whatsapp_variables.py routers/whatsapp.py
cd /app/backend && python3 -m pytest tests/ -q
sudo supervisorctl restart backend
```

**Owner-decided testing path** (per D2-5):
- If `testing_agent_v3_fork` override: call it with the JSON in STEP 8
- If manual only: execute the curl matrix in §11.2

---

## STEP 8 · `testing_agent_v3_fork` payload (if D2-5 override)

```json
{
  "original_problem_statement_and_user_choices_inputs": "CR-004 P2 Variable ↔ DB Schema Mapping Layer. Owner decisions: D2-1 scope as drafted, D2-2 warn-only, D2-3 Rs. symbol, D2-4 date formatter on, D2-5 testing_agent_v3_fork override.",
  "features_or_bugs_to_test": [
    "GET /api/whatsapp/variables returns 10 variables each with sources, fills_on_events, formatter fields",
    "resolve_variable returns customer_name from customer.name",
    "resolve_variable returns tier from event_data.new_tier on tier_upgrade event",
    "resolve_variable returns restaurant_name from brand data",
    "resolve_variable applies currency formatter for amount (Rs.1,500)",
    "resolve_variable applies integer formatter for points_balance with thousand separator",
    "resolve_variable applies date formatter for expiry_date (31 Dec 2026)",
    "resolve_variable returns empty string for unknown variable key",
    "build_body_values with mode=text still passes literal (P1 regression)",
    "build_body_values with mode=map uses resolver chain",
    "trigger_whatsapp_event fetches users doc for brand_data and resolver fills restaurant_name in body_values when triggered for any wired event (test points_earned)",
    "PUT /whatsapp/template-variable-map returns warnings array; warning fires when template mapped to event birthday uses variable coupon_code; no warning when same template uses customer_name",
    "Frontend: saving variable mapping with a coverage mismatch surfaces a toast warning to the owner",
    "Regression: existing points_earned trigger still fires and customer_name + points_balance resolve correctly",
    "Regression: existing birthday cron trigger still fires and resolver fills customer_name + points_balance + restaurant_name correctly",
    "field_aliases dict is removed from core/whatsapp.py (grep returns zero matches)"
  ],
  "files_of_reference": [
    "/app/backend/core/whatsapp_variables.py — enriched registry",
    "/app/backend/core/whatsapp.py:resolve_variable, _format_value, build_body_values, trigger_whatsapp_event",
    "/app/backend/routers/whatsapp.py — save_template_variable_mapping (warnings)",
    "/app/backend/tests/test_whatsapp_resolver.py — 19 unit tests",
    "/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx:handleSaveVariableMapping"
  ],
  "required_credentials": "Use /app/memory/test_credentials.md if populated; otherwise register a fresh test user. AuthKey API key may or may not be set on user — triggers must NOT send real WA messages during testing.",
  "testing_type": "both",
  "agent_to_agent_context_note": "P2 builds on P1. The 4 wired CRM events (points_earned, birthday, anniversary, points_expiring) must continue to work post-refactor. Critical net-new: restaurant_name should now resolve correctly (was always blank pre-P2). Critical net-new: validator warnings on incompatible event/variable combos.",
  "prev_test_files_and_folder": "/app/backend/tests/test_whatsapp_text_mode.py, test_whatsapp_variables_endpoint.py (P1), test_whatsapp_resolver.py (P2)",
  "mocked_api": {"has_mocked_apis": false, "mocked_apis_list": []},
  "other_misc_info": "DO NOT send real WhatsApp messages. Mock the AuthKey HTTP call at the httpx level if needed. External Mongo is hard-wired."
}
```

---

## STEP 9 · Documentation

- Create `/app/memory/crm/crm_roi_sprint/implementation/CR_004_PHASE_2_VARIABLE_DB_MAPPING_IMPLEMENTATION_REPORT.md`
- Update PRD.md: P2 entry → Implemented + Owner Verification Pending

---

## 11.2 Cross-File Reference Map (P2-specific)

| Concern | File | Lines (post-P1) |
|---|---|---|
| Enriched variable registry | `core/whatsapp_variables.py` | rewrite |
| Resolver + formatter | `core/whatsapp.py` | new helpers before `build_body_values` |
| `build_body_values` refactor | `core/whatsapp.py` | replace body |
| `trigger_whatsapp_event` brand injection | `core/whatsapp.py` | function body |
| Validator endpoint | `routers/whatsapp.py:save_template_variable_mapping` | body replacement |
| Frontend warnings | `WhatsAppAutomationContent.jsx:handleSaveVariableMapping` | small diff |
| Tests | `tests/test_whatsapp_resolver.py` | new file |

## 11.3 Rollback Plan

| Failure | Rollback |
|---|---|
| Backend fails to start after STEP 2 | `git checkout HEAD -- /app/backend/core/whatsapp.py /app/backend/core/whatsapp_variables.py`, restart |
| Resolver returns wrong values for existing events | Revert STEP 2 only; existing alias-based build_body_values still works (kept as `_legacy_build_body_values` during transition if cautious) |
| Validator endpoint breaks variable-map save | Revert STEP 4; mapping save endpoint reverts to no-warning behaviour |

## 11.4 Definition of Done (P2)

- [ ] All 9 implementation steps green
- [ ] All 19 unit tests pass
- [ ] testing_agent_v3_fork (if invoked) returns zero failures
- [ ] `grep -n field_aliases /app/backend/core/whatsapp.py` → 0 matches
- [ ] Implementation report committed
- [ ] PRD.md updated
- [ ] Status: `cr004_phase_2_complete_owner_verification_pending`

---

**Implementation agent: this section is your P2 runbook. Do not deviate without flagging the owner.**

End of P2 Planning Doc.
