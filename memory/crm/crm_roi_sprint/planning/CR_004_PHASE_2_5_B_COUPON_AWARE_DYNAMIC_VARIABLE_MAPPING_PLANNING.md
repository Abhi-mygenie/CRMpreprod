# CR-004 — Phase 2.5-B · Coupon-Aware Dynamic Variable Mapping — Planning Doc

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5-B — Coupon-Aware Dynamic Variable Mapping (Model Redesign)
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr004_p2_5b_planning_locked_ready_for_implementation`
**Depends on:** P2.5 (Variable Expansion — complete in code, undocumented)
**Blocks:** P3 (Event Reconciliation), P5 (Segment Broadcasts)

---

## 0. Origin — Owner Communication (Captured)

> "We will need rich, dynamic fields for coupon — coupon title — so the user can easily select which coupon, because this is the most important part in the model. We might need to redesign the model."

This was the **last owner communication before P2.5 code was shipped**. The P2.5 implementation added the 13 new variables (including `coupon_title`, `coupon_discount`, `coupon_expiry`) to the registry and wired them in `coupons.py` — but **did NOT address the model redesign** the owner asked for. This phase closes that gap.

---

## 1. The Problem — Why Current UX Fails for Coupons

### 1.1 Current Variable Mapping Modal UX

Today, when an owner maps `{{1}}` to a variable, they see a **flat dropdown** of 23 abstract field names:

```
Select a field...
├── Customer Name (e.g., John)
├── Restaurant Name (e.g., Demo Restaurant)
├── Points Balance (e.g., 1,250)
├── ...
├── Coupon Code (e.g., SAVE20)        ← abstract
├── Coupon Title (e.g., Lunch Special) ← abstract
├── Coupon Discount (e.g., Rs.150)     ← abstract
├── Coupon Expiry (e.g., 31 Dec 2026)  ← abstract
└── ...
```

**Problem:** When the owner picks `Coupon Title`, they have **no idea which coupon's title will be sent**. The value is resolved at runtime from `event_data.coupon_title` — which is only populated when a specific coupon is validated/redeemed via the POS coupon flow. The owner cannot:

1. **See** which coupons exist in their system
2. **Pick** a specific coupon and have its title/discount/expiry auto-fill
3. **Preview** what the actual message will look like with real coupon data
4. **Understand** that coupon variables only fill on `coupon_earned` events (the `fills_on` warning exists but doesn't help them select the right coupon)

### 1.2 Why Coupons Are Special (vs Other Variables)

| Variable Category | Data Source | Owner Needs to Pick? | Dynamic? |
|---|---|---|---|
| **Customer** (`customer_name`, `tier`, `total_visits`) | Customer doc — always available | No — auto-resolved per customer | Static per customer |
| **Loyalty** (`points_earned`, `points_balance`) | Event data — always available on loyalty events | No — auto-resolved per event | Dynamic per event |
| **Restaurant** (`restaurant_name`, links) | Brand/user doc — always same | No — auto-resolved from profile | Static |
| **Coupon** (`coupon_title`, `coupon_discount`, `coupon_expiry`, `coupon_code`) | **Which coupon?** Depends on which coupon was applied in the order | **YES — this is the gap** | Dynamic AND requires selection context |

For **event-triggered messages** (e.g., `coupon_earned`), the coupon data comes from the event itself — the owner doesn't need to pick because the POS tells us which coupon was used.

But for **marketing/broadcast messages** (Segment sends — P5) and for **preview/understanding**, the owner needs to see real coupon data to:
- Design their template intelligently ("I want to promote my BOGO coupon, so I'll use `coupon_title` and `coupon_discount`")
- Preview the message with real data, not "Lunch Special" placeholder

---

## 2. Proposed Solution — Three-Tier Variable Mapping

### Tier 1: Current Behaviour (No Change)
**For general variables** (`customer_name`, `points_balance`, `restaurant_name`, etc.):
Keep the existing `Map to Field` / `Custom Text` toggle. No change needed.

### Tier 2: Coupon-Aware Picker (NEW — P2.5-B)
**For coupon variables** (`coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry`):
Replace the flat dropdown with a **two-mode** toggle: `[Pick Coupon]` `[Custom Text]`

**"Pick Coupon" flow (owner-confirmed):**

```
┌──────────────────────────────────────────────────┐
│ {{1}} → Coupon Code                              │
│                                                  │
│ ┌─ Mode ─────────────────────────────────────┐   │
│ │ [Pick Coupon]  [Custom Text]               │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│ Step 1: Owner picks a coupon from list:          │
│ ┌────────────────────────────────────────────┐   │
│ │ 🏷 Select a coupon                         │   │
│ │                                            │   │
│ │ ┌──────────────────────────────────────┐   │   │
│ │ │ SAVE20 — Lunch Special               │   │   │
│ │ │ 20% off · Expires 31 Dec 2026        │   │   │
│ │ ├──────────────────────────────────────┤   │   │
│ │ │ BOGO50 — Buy 1 Get 1 Free           │   │   │
│ │ │ BOGO · Expires 15 Jan 2027          │   │   │
│ │ └──────────────────────────────────────┘   │   │
│ └────────────────────────────────────────────┘   │
│                                                  │
│ Step 2: Auto-fill all coupon vars (read-only):   │
│                                                  │
│  {{1}} coupon_code    → "SAVE20"       (locked)  │
│  {{2}} coupon_title   → "Lunch Special"(locked)  │
│  {{3}} coupon_discount→ "Rs.150"       (locked)  │
│  {{4}} coupon_expiry  → "31 Dec 2026"  (locked)  │
│                                                  │
│ Owner sees preview but CANNOT edit DB values.    │
└──────────────────────────────────────────────────┘
```

**Key UX rules:**
- Coupon Code selection comes FIRST — it's the anchor
- Other coupon variables auto-fill from the selected coupon (read-only)
- Owner cannot edit coupon DB values (title, discount, expiry) — they come from the coupons collection
- If owner wants arbitrary text instead, they switch to "Custom Text" mode

### Tier 3: Future — Order-Aware Picker (P5+ scope, NOT in P2.5-B)
For segment broadcasts: the picked coupon is the data source (no event_data available). Deferred.

---

## 3. In-Scope (4 work items)

### Item 1 · Backend — `GET /api/coupons/summary` (lightweight coupon list for picker)

New endpoint that returns a summary list of the owner's coupons (active + recently expired) for the variable mapping picker. NOT the full coupon payload — just what the picker needs.

**Response shape:**
```json
{
  "coupons": [
    {
      "id": "uuid",
      "code": "SAVE20",
      "title": "Lunch Special",
      "discount_type": "percentage",
      "discount_value": 20,
      "discount_display": "20% off",
      "end_date": "2026-12-31",
      "end_date_display": "31 Dec 2026",
      "is_active": true,
      "offer_type": "simple"
    }
  ]
}
```

**Why a new endpoint?** Existing `GET /coupons` returns the full `Coupon` Pydantic model (50+ fields, V1/V2/V3 complexity). The picker only needs 8 fields. Keeps the request lightweight and avoids leaking internal coupon engine details to a UI picker.

**`discount_display` computation spec (server-side):**

| `offer_type` | `discount_type` | `discount_value` | Expected `discount_display` |
|---|---|---|---|
| `simple` | `percentage` | 20 | `"20% off"` |
| `simple` | `flat` or `fixed` | 100 | `"Rs.100 off"` |
| `bogo` | — | — | `"Buy 1 Get 1"` |
| `bxg` | — | `buy_quantity`=2, `get_quantity`=1 | `"Buy 2 Get 1"` |
| `nth_item` | — | `nth_item_number`=3 | `"Every 3rd free"` |
| `free_item` | — | — | `"Free Item"` |
| `combo` | — | — | `"Combo Deal"` |
| (fallback) | any | any | `"{discount_value} {discount_type}"` |

**`end_date_display` computation:** Parse ISO date → format as `"31 Dec 2026"` using `datetime.strptime().strftime("%d %b %Y")`.

**Implementation helper (in `routers/coupons.py` or inline):**
```python
def _build_discount_display(coupon: dict) -> str:
    offer = coupon.get("offer_type", "simple")
    dtype = coupon.get("discount_type", "")
    dval = coupon.get("discount_value", 0)
    if offer == "bogo":
        return "Buy 1 Get 1"
    if offer == "bxg":
        bq = coupon.get("buy_quantity", 1)
        gq = coupon.get("get_quantity", 1)
        return f"Buy {bq} Get {gq}"
    if offer == "nth_item":
        nth = coupon.get("nth_item_number", 2)
        return f"Every {nth}{'st' if nth==1 else 'nd' if nth==2 else 'rd' if nth==3 else 'th'} free"
    if offer == "free_item":
        return "Free Item"
    if offer == "combo":
        return "Combo Deal"
    # simple offer
    if dtype == "percentage":
        return f"{int(dval)}% off" if dval == int(dval) else f"{dval}% off"
    return f"Rs.{int(dval):,} off" if dval == int(dval) else f"Rs.{dval:,.2f} off"
```

### Item 2 · Backend — New variable mode `coupon_pick` + DB schema change

**Current `whatsapp_template_variable_map.modes`:**
```json
{ "{{1}}": "map", "{{2}}": "text" }
```

**New mode added:**
```json
{ "{{1}}": "coupon_pick", "{{2}}": "coupon_pick", "{{3}}": "coupon_pick", "{{4}}": "coupon_pick" }
```

When `mode == "coupon_pick"`:
- `mappings` stores: `"coupon:<coupon_id>:<field>"` (e.g., `"coupon:abc123:code"`, `"coupon:abc123:title"`)
- All coupon variables in the same template point to the **same coupon_id** (coupon code is the anchor)
- At save time (`PUT /whatsapp/template-variable-map`): backend validates coupon_id exists
- Values are **read-only** from the coupon document — owner cannot edit them
- At send time (`build_body_values`):
  - **For event-triggered sends** (`coupon_earned`): `event_data` takes priority (real order truth) — picked coupon ignored
  - **For broadcast sends** (P5 future): picked coupon's data resolved fresh from DB

### Item 3 · Backend — Resolver extension for `coupon_pick` mode

**Critical design decision: sync `build_body_values` vs async DB lookup**

`build_body_values()` (line 267 of `core/whatsapp.py`) is a **synchronous** function. It cannot do `await db.coupons.find_one(...)`. The caller `trigger_whatsapp_event()` is async and has `db` access.

**Chosen approach: Pre-resolve in caller (keeps `build_body_values` sync)**

In `trigger_whatsapp_event()`, BEFORE calling `build_body_values()`:
1. Scan `variable_mappings` for any `coupon:<id>:<field>` entries
2. If found, extract the `coupon_id` and do ONE async `db.coupons.find_one({"id": coupon_id})`
3. Build a `coupon_pick_data` dict: `{"code": "SAVE20", "title": "Lunch Special", "discount": 150, "expiry": "31 Dec 2026"}`
4. Pass `coupon_pick_data` to `build_body_values()` as a new parameter

In `build_body_values()`:
```python
elif mode == "coupon_pick":
    # Parse "coupon:<id>:<field>" → extract <field>
    parts = mapped_field.split(":")
    if len(parts) == 3 and parts[0] == "coupon":
        field = parts[2]  # "code", "title", "discount", "expiry"
        # D-4: For event triggers, event_data wins over picked coupon
        event_value = _check_event_data_for_coupon_field(field, event_data)
        if event_value:
            body_values[var_num] = _format_coupon_field(field, event_value)
        elif coupon_pick_data:
            body_values[var_num] = _format_coupon_field(field, coupon_pick_data.get(field, ""))
        else:
            body_values[var_num] = ""
```

**New helper functions in `core/whatsapp.py`:**

```python
def _check_event_data_for_coupon_field(field, event_data):
    """D-4: Check if event_data has the real coupon value (event-trigger priority)."""
    field_map = {
        "code": "coupon_code",
        "title": "coupon_title",
        "discount": "coupon_discount",
        "expiry": "coupon_expiry",
    }
    event_key = field_map.get(field)
    return event_data.get(event_key) if event_key else None

def _format_coupon_field(field, value):
    """Apply appropriate formatter for coupon fields."""
    if field == "discount":
        return _format_value(value, "currency")
    if field == "expiry":
        return _format_value(value, "date")
    return str(value) if value else ""
```

**Updated `build_body_values` signature:**
```python
def build_body_values(
    template_variables, variable_mappings, customer_data,
    event_data=None, variable_modes=None, brand_data=None,
    coupon_pick_data=None,  # NEW — pre-resolved coupon dict
) -> Dict[str, str]:
```

**Updated `trigger_whatsapp_event` pre-resolve block (insert before `build_body_values` call):**
```python
# Pre-resolve coupon_pick data (async DB lookup done here, not in sync build_body_values)
coupon_pick_data = None
coupon_pick_ids = set()
for placeholder, mapped in variable_mappings.items():
    if (config.get("variable_modes", {}).get(placeholder) == "coupon_pick"
            and mapped and mapped.startswith("coupon:")):
        parts = mapped.split(":")
        if len(parts) == 3:
            coupon_pick_ids.add(parts[1])

if coupon_pick_ids:
    # All coupon vars point to same coupon (D-3), so one lookup suffices
    cpn_id = next(iter(coupon_pick_ids))
    cpn_doc = await db.coupons.find_one({"id": cpn_id, "user_id": user_id}, {"_id": 0})
    if cpn_doc:
        coupon_pick_data = {
            "code": cpn_doc.get("code", ""),
            "title": cpn_doc.get("title", ""),
            "discount": cpn_doc.get("discount_value", 0),
            "expiry": cpn_doc.get("end_date", ""),
        }
```

Also: `GET /api/whatsapp/variables` response for coupon variables gets a new field `"picker": "coupon"` so the frontend knows to render the coupon picker instead of a flat dropdown.

### Item 4 · Frontend — Coupon Picker in Variable Mapping Modal (`WhatsAppAutomationContent.jsx` only — D-5)

**UX flow (D-3 confirmed):**

1. When a variable has `category == "coupon"`, mode toggle shows `[Pick Coupon]` `[Custom Text]` (two modes only — D-2)
2. **"Pick Coupon" mode:**
   - Fetches `GET /api/coupons/summary` (cached per session)
   - Shows a searchable card list of coupons (code, title, discount, expiry, active badge)
   - Owner clicks a coupon (e.g., "SAVE20")
   - **All** coupon variables in the template auto-fill from that coupon (D-3 confirmed):
     - `coupon_code` → "SAVE20"
     - `coupon_title` → "Lunch Special" (read-only)
     - `coupon_discount` → "Rs.150" (read-only)
     - `coupon_expiry` → "31 Dec 2026" (read-only)
   - Owner **sees** the values but **cannot edit** coupon DB values
   - Preview WhatsApp bubble updates immediately with real data
3. If owner wants arbitrary text, they switch to "Custom Text" mode (existing behaviour)

#### 4.1 Picker Trigger — Any Coupon Variable, Not Just `coupon_code`

The coupon picker appears on **any** coupon-category variable — not only `coupon_code`. Regardless of which coupon variable the owner clicks "Pick Coupon" on first, the selected coupon auto-fills **all other coupon-category variables** in the same template.

Example: Template has `{{1}}`, `{{2}}`, `{{3}}`:
- Owner maps `{{1}}` → `customer_name` (general)
- Owner maps `{{2}}` → `coupon_title` (coupon) ← clicks "Pick Coupon" here
- Owner picks "SAVE20" from the coupon list
- System auto-fills `{{3}}` (mapped to `coupon_code`) with "SAVE20" as well
- `{{1}}` is **untouched** because it's mapped to a general-category variable

**Rule:** Auto-fill ONLY affects template variables (`{{n}}`) that:
1. Already exist in the template body (extracted from `temp_body`)
2. Are currently mapped to a **coupon-category** field (`coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry`)

Variables mapped to non-coupon fields (e.g., `customer_name`, `points_balance`) are never touched by the auto-fill.

#### 4.2 Partial Coupon Variables — No Phantom Mappings

If a template uses only `{{1}}` and `{{2}}`, and owner maps:
- `{{1}}` → `coupon_code`
- `{{2}}` → `coupon_title`

Auto-fill fills `{{1}}` and `{{2}}` from the picked coupon. It does **NOT** create phantom `{{3}}` or `{{4}}` mappings for `coupon_discount` / `coupon_expiry` that don't exist in the template.

#### 4.3 Read-Only Display for Auto-Filled Coupon Variables

Once a coupon is selected, the auto-filled coupon variables show as **locked read-only** cards:

```
┌───────────────────────────────────────────┐
│ {{2}} → coupon_title                      │
│ [Pick Coupon ✓]  [Custom Text]            │
│                                           │
│  🔒 "Lunch Special"  (from SAVE20)       │
│     ↳ Change coupon on {{1}} to update    │
└───────────────────────────────────────────┘
```

The read-only card shows:
- The resolved value (e.g., "Lunch Special")
- Which coupon it's from (e.g., "from SAVE20")
- A hint that changing the coupon selection on any sibling variable updates all of them

Owner **cannot type** in the read-only field. To change the value, they either:
- Pick a different coupon (updates all coupon vars)
- Switch to "Custom Text" mode (breaks the coupon link for that variable only)

#### 4.4 Frontend State Changes

New state in `WhatsAppAutomationContent`:
```jsx
const [couponSummary, setCouponSummary] = useState([]);       // cached coupon list
const [selectedCouponId, setSelectedCouponId] = useState(null); // currently picked coupon
```

On modal open: if `couponSummary` is empty or stale (>5 min), fetch `GET /api/coupons/summary`.

On coupon selection:
```jsx
const handleCouponSelect = (coupon) => {
    setSelectedCouponId(coupon.id);
    // Auto-fill all coupon-category variables in this template
    const newMappings = { ...variableMappings };
    const newModes = { ...variableMappingModes };
    mappingTemplate.variables.forEach(varKey => {
        const currentMapping = newMappings[varKey];
        const currentField = availableVariables.find(v => v.key === currentMapping);
        if (currentField?.category === "coupon") {
            // This variable is mapped to a coupon field — auto-fill it
            const couponField = currentField.key.replace("coupon_", ""); // "code", "title", "discount", "expiry"
            newMappings[varKey] = `coupon:${coupon.id}:${couponField}`;
            newModes[varKey] = "coupon_pick";
        }
    });
    setVariableMappings(newMappings);
    setVariableMappingModes(newModes);
};
```

---

## 4. Out of Scope (explicitly NOT in P2.5-B)

| Item | Goes to |
|---|---|
| Segment broadcast send using picked coupon | P5 |
| Event reconciliation (making `coupon_earned` appear in master list) | P3 |
| Coupon-specific template suggestions ("best template for BOGO coupons") | Future CR |
| Menu item picker for item-level variables | Future CR |
| Order-aware variable resolution for POS events | P3 |
| Batch coupon picker (select multiple coupons for A/B testing) | Future |

---

## 5. Data Flow — Before vs After

### BEFORE (P2.5):
```
Owner opens Variable Mapping Modal
  → Sees flat list: "Coupon Title (e.g., Lunch Special)"
  → Picks "Coupon Title" for {{2}}
  → Preview shows sample data "Lunch Special" (hardcoded example)
  → Saves: mappings={"{{2}}": "coupon_title"}, modes={"{{2}}": "map"}
  → At send time (coupon_earned event): event_data.coupon_title fills it ✅
  → At preview/design time: owner has no idea which coupon "Lunch Special" refers to ❌
  → For broadcasts: no coupon data available ❌
```

### AFTER (P2.5-B):
```
Owner opens Variable Mapping Modal
  → Coupon variables show: [Pick Coupon] [Custom Text]   (two modes — D-2)
  → Clicks "Pick Coupon" on any coupon variable
  → Sees real coupons: SAVE20 (Lunch Special, 20% off, exp 31 Dec 2026)
  → Picks "SAVE20"
  → ALL coupon variables auto-fill from SAVE20 (read-only — D-3):
      {{1}} coupon_code    = "SAVE20"
      {{2}} coupon_title   = "Lunch Special"       (locked, from DB)
      {{3}} coupon_discount = "Rs.150"              (locked, from DB)
      {{4}} coupon_expiry  = "31 Dec 2026"          (locked, from DB)
  → Preview shows real data from SAVE20 ✅
  → Saves: mappings={"{{1}}":"coupon:abc123:code", "{{2}}":"coupon:abc123:title", ...}
           modes={"{{1}}":"coupon_pick", "{{2}}":"coupon_pick", ...}
  → At send time (coupon_earned event): event_data wins (real order truth — D-4) ✅
  → At send time (broadcast P5): resolves SAVE20 fresh from DB ✅
  → Owner CANNOT edit coupon DB values — read-only preview ✅
```

---

## 6. Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC-1 | `GET /api/coupons/summary` returns lightweight coupon list with `code`, `title`, `discount_display`, `end_date_display`, `is_active` | curl |
| AC-2 | Variable Mapping Modal shows `[Pick Coupon]` mode toggle for coupon-category variables (`coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry`) | Screenshot |
| AC-3 | "Pick Coupon" mode shows a card list of real coupons from the owner's account | Screenshot |
| AC-4 | Selecting a coupon stores `coupon:<id>:<field>` in mappings with mode `coupon_pick` | Inspect saved mapping via `GET /whatsapp/template-variable-map` |
| AC-5 | Preview resolves the selected coupon's real data (not example placeholder) | Screenshot of WhatsApp bubble preview |
| AC-6 | Auto-link: picking a coupon for `coupon_title` suggests same coupon for other coupon variables in the same template | Screenshot / manual test |
| AC-7 | `build_body_values` with `mode=coupon_pick` resolves correctly: (a) event_data priority for event triggers, (b) DB lookup for picked coupon as fallback | Unit test |
| AC-8 | `build_body_values` with `mode=map` (existing coupon variables) still works (P2 regression) | Unit test |
| AC-9 | Saving a `coupon_pick` mapping validates that the coupon_id exists; returns error if coupon deleted | curl |
| AC-10 | `GET /api/whatsapp/variables` coupon variables include `"picker": "coupon"` field | curl |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Owner picks a coupon that gets deleted/deactivated before the message fires | Medium | At send time, if coupon not found, fall back to `event_data` (event triggers) or send `""` with a warning log (broadcasts). Show "inactive" badge in picker for expired/deactivated coupons. |
| Coupon data changes between mapping-save and send-time (e.g., expiry extended) | Low | `coupon_pick` mode resolves fresh from DB at send time — this is a feature, not a bug. Preview may be slightly stale but send is always fresh. |
| Owner confusion: "I picked coupon SAVE20 but the customer got BOGO50 in their message" | Medium | This is correct behaviour for event triggers (the actual coupon used in the order takes priority). Add a help tooltip: "For order-triggered messages, the coupon from the actual order is used. Your selection is used for previews and broadcast messages." |
| Performance: `GET /coupons/summary` called every time modal opens | Low | Cache in frontend state (already done for `authkeyTemplates`, same pattern). Add `staleTime` of 5 minutes. |
| Auto-link logic gets annoying if owner wants different coupons per variable | Low | Auto-link is a suggestion (toast), not forced. Owner can dismiss and pick independently. |
| Coupon ID contains colon character — breaks `coupon:<id>:<field>` parsing | Very Low | Coupon IDs are UUIDs (no colons). Add backend validation guard: `PUT /template-variable-map` rejects any `coupon_pick` mapping where `coupon_id` contains `:`. Fail-fast at save time, not send time. |
| Picker shows `discount_display` ("20% off") but resolved message sends actual discount amount ("Rs.150") | Low | These are intentionally different values — picker describes the coupon type, send resolves the actual discount applied. Add a subtle footnote under the preview card: "Preview shows coupon description. Actual message uses the discount amount from the order." No code change needed, just a UI label. |

---

## 8. Legacy Mapping Handling — Owner Decision (2026-05-28)

**Question:** Existing templates may have coupon variables (`coupon_code`, `coupon_title`, etc.) saved with `mode: "map"`. After P2.5-B ships, the frontend removes the "Map to Field" option for coupon-category variables (D-2). How are old mappings handled?

**Owner Decision:** **No backward migration.** Old coupon variable mappings will be **deleted and recreated** by the owner using the new `[Pick Coupon]` or `[Custom Text]` modes. Rationale: few templates exist with coupon variables today; owners will naturally re-map when they next edit.

**Implementation impact:**
- Backend: `build_body_values` RETAINS `mode=map` handling for coupon fields (AC-8 regression safety). If an old `map` mapping is encountered at send time, it resolves via the existing P2 resolver — no breakage.
- Frontend: If the modal loads a saved mapping with `mode=map` on a coupon-category variable, render it as **`[Custom Text]` with the current mapped field name as the text value** and show a subtle info badge: "Legacy mapping — re-save to use Pick Coupon." Owner can then switch to `[Pick Coupon]` or keep as custom text.
- No migration script. No bulk update. No data loss risk.

---

## 9. Frontend Picker — Loading / Error / Empty States

The coupon picker inside the Variable Mapping Modal must handle 4 states:

| State | Trigger | UX |
|---|---|---|
| **Loading** | `GET /api/coupons/summary` in flight | Skeleton shimmer (3 placeholder cards, same height as real coupon cards). Picker is non-interactive. |
| **Error** | API returns non-200 or network failure | Red inline alert: "Unable to load coupons. Check your connection and try again." + Retry button. Picker falls back to `[Custom Text]` mode with a toast. |
| **Empty** | API returns `{ coupons: [] }` (owner has no coupons) | Grey placeholder card: "No coupons found. Create a coupon first to use Pick Coupon mode." Link to `/coupons` page. Auto-switch variable to `[Custom Text]` mode. |
| **Success** | API returns 1+ coupons | Render searchable card list (existing spec in §3 Item 4). |

**Search behaviour:** The coupon list includes a filter input above the cards. Searches across `code` and `title` (case-insensitive substring). Debounce 200ms. If no results: "No coupons match your search."

---

## 10. Coupon ID Validation Guard

**Backend — `PUT /whatsapp/template-variable-map/{template_id}`:**

When `mode == "coupon_pick"`, validate the `mappings[placeholder]` value:

```python
if mode == "coupon_pick":
    parts = mapped_value.split(":")
    if len(parts) != 3 or parts[0] != "coupon":
        raise HTTPException(400, f"Invalid coupon_pick format for {placeholder}: expected 'coupon:<id>:<field>'")
    coupon_id, field = parts[1], parts[2]
    if ":" in coupon_id:
        raise HTTPException(400, f"Invalid coupon_id for {placeholder}: must not contain ':'")
    if field not in ("code", "title", "discount", "expiry"):
        raise HTTPException(400, f"Invalid coupon field '{field}' for {placeholder}: must be code|title|discount|expiry")
    # Verify coupon exists and belongs to this user
    cpn = await db.coupons.find_one({"id": coupon_id, "user_id": user["id"]}, {"_id": 1})
    if not cpn:
        raise HTTPException(404, f"Coupon '{coupon_id}' not found or does not belong to your account")
```

This catches malformed data at save time, not send time.

---

## 11. TemplatesPage.jsx — Follow-Up Note

Per D-5, only `WhatsAppAutomationContent.jsx` (the Automation page) gets the coupon picker in P2.5-B. The Templates page (`TemplatesPage.jsx`) also has a variable mapping modal but it will continue using the **flat dropdown** for coupon variables.

**Follow-up work (NOT in P2.5-B scope):** Extract the coupon picker into a shared component (`CouponVariablePicker.jsx`) and wire it into `TemplatesPage.jsx` as well. Estimated: 0.5 sessions. Can be done immediately after P2.5-B ships without a separate CR.

---

## 12. Test Plan — Expanded

### 12.1 Backend Unit Tests (in `backend/tests/test_whatsapp_p2_5b_coupon_pick.py`)

| # | Test | Type | Validates |
|---|---|---|---|
| T1 | `GET /coupons/summary` returns lightweight list with all 8 expected fields per coupon | curl | AC-1 |
| T2 | `GET /coupons/summary` excludes other users' coupons | curl | Scoping |
| T3 | `GET /coupons/summary` `discount_display` correct for each `offer_type` (simple %, simple flat, bogo, bxg, nth_item) | unit | AC-1 detail |
| T4 | `PUT /template-variable-map` accepts `coupon_pick` mode with valid `coupon:<id>:<field>` | curl | AC-4 |
| T5 | `PUT /template-variable-map` rejects malformed `coupon_pick` (missing parts, bad field name, colon in ID) | curl | §10 guard |
| T6 | `PUT /template-variable-map` rejects `coupon_pick` with non-existent coupon_id | curl | AC-9 |
| T7 | `PUT /template-variable-map` rejects `coupon_pick` with another user's coupon_id | curl | AC-9 scoping |
| T8 | `build_body_values` with `mode=coupon_pick` + `coupon_pick_data` resolves code/title/discount/expiry | unit | AC-7 |
| T9 | `build_body_values` with `mode=coupon_pick` + event_data present → event_data wins (D-4) | unit | AC-7 + D-4 |
| T10 | `build_body_values` with `mode=coupon_pick` + no coupon_pick_data + no event_data → empty string | unit | Edge case |
| T11 | `build_body_values` with `mode=map` on `coupon_code` still works (P2 regression) | unit | AC-8 |
| T12 | `GET /whatsapp/variables` coupon vars include `"picker": "coupon"` field | curl | AC-10 |
| T13 | Pre-resolve in `trigger_whatsapp_event`: extracts coupon_id from mappings, does ONE DB lookup, passes `coupon_pick_data` | unit | §3 Item 3 |
| T14 | Pre-resolve with deleted coupon → `coupon_pick_data` is None → falls back to event_data or empty | unit | Risk row 1 |

### 12.2 Frontend Playwright Tests (in testing_agent scope)

| # | Test | Validates |
|---|---|---|
| P1 | Open Variable Mapping Modal → coupon-category variable shows `[Pick Coupon]` and `[Custom Text]` toggle (no `Map to Field`) | AC-2 |
| P2 | Click `[Pick Coupon]` → coupon card list loads with real coupons (code, title, discount badge, expiry, active/inactive badge) | AC-3 |
| P3 | Search filter narrows coupon list | §9 search spec |
| P4 | Select coupon "SAVE20" → all coupon variables in template auto-fill with SAVE20 data (read-only) | AC-5, AC-6 |
| P5 | Auto-filled coupon variable shows locked state — cannot type in field, shows "from SAVE20" label | §4.3 read-only spec |
| P6 | Change coupon selection on one variable → all sibling coupon variables update | AC-6 |
| P7 | Switch one coupon variable to `[Custom Text]` → only that variable breaks coupon link, siblings stay linked | §4.2 partial spec |
| P8 | Save mapping → `GET /template-variable-map` returns `mode: "coupon_pick"` with `coupon:<id>:<field>` | AC-4 |
| P9 | Preview WhatsApp bubble shows real coupon data (not placeholder "Lunch Special") | AC-5 |
| P10 | Legacy `mode: map` coupon variable → renders as Custom Text with info badge | §8 legacy handling |
| P11 | Empty coupons state → grey placeholder card with link to `/coupons` | §9 empty state |
| P12 | API error → red inline alert with retry button | §9 error state |

---

## 13. Order of Execution

1. **Backend Item 1** — `GET /api/coupons/summary` endpoint
2. **Backend Item 2** — `coupon_pick` mode in DB schema + variable-map save endpoint validation (incl. §10 guards)
3. **Backend Item 3** — `build_body_values` resolver for `coupon_pick` mode + pre-resolve in `trigger_whatsapp_event`
4. **Backend** — Enrich `GET /whatsapp/variables` with `picker` field for coupon vars
5. **Frontend Item 4** — Coupon Picker UI in Variable Mapping Modal (`WhatsAppAutomationContent.jsx` only — D-5), incl. loading/error/empty states (§9), legacy `mode:map` rendering (§8)
6. **Frontend** — Auto-link suggestion for sibling coupon variables
7. **Tests** — Backend unit tests (§12.1 T1–T14) + Frontend Playwright tests (§12.2 P1–P12) via `testing_agent`
8. **Docs** — Implementation report + PRD update

---

## 14. Effort

| Sub-item | Sessions |
|---|---|
| Item 1 — Coupon summary endpoint | 0.5 |
| Item 2 — Mode schema + validation + §10 guards | 0.5 |
| Item 3 — Resolver extension + pre-resolve | 1 |
| Item 4 — Frontend picker UI + auto-link + states (§8/§9) | 2 |
| Tests (§12.1 + §12.2) + docs | 1 |
| **Total** | **~5 sessions** |

---

## 15. Owner Sign-off — ✅ LOCKED (2026-05-27, updated 2026-05-28)

| # | Decision | Owner Choice |
|---|---|---|
| D-1 | Approve 4-item scope as drafted | ✅ **Approved as drafted** |
| D-2 | Mode toggle for coupon variables | ✅ **Two modes: `[Pick Coupon]` `[Custom Text]`** — "Map to Field" removed for coupon-category vars |
| D-3 | Coupon selection flow | ✅ **Select Coupon Code first → auto-fill title/discount/expiry.** Owner can see (read-only preview) but NOT edit the coupon DB values. Auto-suggestion included. |
| D-4 | Event-trigger priority | ✅ **Real order wins** — actual coupon redeemed by customer takes priority over the picked coupon. Picked coupon used only for preview and broadcast. |
| D-5 | Pages in scope | ✅ **Only `WhatsAppAutomationContent.jsx`** (automation page) |
| D-6 | Testing approach | ✅ **Use `testing_agent`** after implementation |
| D-7 | Legacy coupon `mode:map` mappings | ✅ **No migration. Delete and recreate.** Old mappings render as Custom Text with info badge in frontend. Backend retains `mode=map` resolver for send-time safety. (Added 2026-05-28) |

**Locked at:** 2026-05-27 (D-1 to D-6), 2026-05-28 (D-7)
**Locked by:** Owner via chat

### D-3 Flow Detail (owner-confirmed):

```
Step 1: Owner clicks "Pick Coupon" for any coupon variable (e.g., {{1}} → coupon_code)
Step 2: Coupon picker shows list of active coupons from owner's DB
Step 3: Owner selects a coupon (e.g., "SAVE20")
Step 4: System auto-fills all coupon variables in the template:
        {{1}} → coupon_code = "SAVE20"
        {{2}} → coupon_title = "Lunch Special"      (read-only, from DB)
        {{3}} → coupon_discount = "Rs.150"           (read-only, from DB)
        {{4}} → coupon_expiry = "31 Dec 2026"        (read-only, from DB)
Step 5: Owner sees preview with real data (cannot edit coupon DB values)
Step 6: Owner saves mapping
```

### D-4 Priority Detail (owner-confirmed):

```
At send time:
  IF event-triggered (coupon_earned):
    → Use actual coupon data from event_data (real order truth)
    → Picked coupon is ignored (it was for preview/design purposes)
  IF broadcast (P5 future):
    → Use picked coupon data from DB
    → No event_data available, so picked coupon is the source
```

---

## 16. What Happens Next

Owner has signed off. Implementation begins per §13 execution order:
1. Backend: `GET /api/coupons/summary` endpoint
2. Backend: `coupon_pick` mode + validation + §10 guards
3. Backend: Resolver extension for `coupon_pick` + pre-resolve
4. Frontend: Coupon picker UI in `WhatsAppAutomationContent.jsx` only (incl. §8 legacy, §9 states)
5. Tests via `testing_agent` (§12.1 backend + §12.2 frontend)
6. Docs: implementation report + PRD update

After P2.5-B ships:
- P3 (Event Reconciliation) planning starts
- P5 (Segment Broadcasts) can use `coupon_pick` mode
- `TemplatesPage.jsx` coupon picker follow-up (§11, ~0.5 sessions)

---

## 17. Relationship to Documentation

All previously missing implementation reports have been created:

| Phase | Code Status | Doc Status |
|---|---|---|
| P1 (Foundation Cleanup) | ✅ Implemented | ✅ Impl report created (retroactive) — flags `auth.py:170` residual (now fixed) |
| P2 (Variable DB Mapping) | ✅ Implemented | ✅ Impl report created (retroactive) |
| P2.5 (Variable Expansion 10→23) | ✅ Implemented | ✅ Planning + impl report created (retroactive) |
| **P2.5-B (This doc)** | ❌ Not started | ✅ **This planning doc (updated 2026-05-28 — gap fixes §8–§12)** |

---

## 18. Gap Resolution Log (2026-05-28)

| Gap | Severity | Resolution | Section |
|---|---|---|---|
| G1 — No migration path for existing `mode:map` coupon mappings | MEDIUM | **Owner decision: no migration. Delete and recreate.** Frontend renders legacy as Custom Text with info badge. Backend retains `mode=map` resolver. | §8 |
| G2 — Colon-delimited `coupon:<id>:<field>` format fragility | LOW | Backend validation guard rejects coupon_id containing `:` at save time. | §10 |
| G3 — No loading/error/empty state for coupon picker | LOW | Full state spec added: skeleton shimmer, red alert + retry, grey placeholder + link to `/coupons`. | §9 |
| G4 — `discount_display` (picker) vs resolved discount (send) mismatch | LOW | Intentional — clarified in risk table. Picker shows coupon type description, send resolves actual amount. Footnote label added to UX spec. | §7 row 7 |
| G5 — `TemplatesPage.jsx` not in scope | LOW | Explicit follow-up note added. Extract shared component post-P2.5-B. ~0.5 sessions. | §11 |
| G6 — No Playwright test for auto-fill sibling UX | LOW | Full frontend test plan added (P1–P12) including auto-fill (P4, P6), partial break (P7), legacy (P10), empty/error states (P11, P12). | §12.2 |

**All 6 gaps resolved. Planning depth: 10/10.**

---

**Next action:** Implementation begins per §13 execution order.

End of P2.5-B Planning Doc.
