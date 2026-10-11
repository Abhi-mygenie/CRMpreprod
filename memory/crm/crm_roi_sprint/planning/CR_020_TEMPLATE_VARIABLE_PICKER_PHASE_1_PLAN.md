# CR-020 — Template Variable Picker: Grouped UX + Menu Variable Family
# Phase 1 Plan

**Sprint**: ROI Measurement / CRM
**Status**: `cr020_planning_phase_1_awaiting_signoff`
**HTML mock**: approved 2026-06-05 (`/app/scripts/cr020_mock.html`, served at `/cr020_mock.html`)
**Prerequisite reads**: discovery doc `CR_020_TEMPLATE_VARIABLE_PICKER_GROUPED_UX_DISCOVERY.md`
**Effort estimate**: ~1.5 days (backend ~2h, frontend ~8h, validation ~2h)

---

## 0. Owner Answers (locked 2026-06-05)

| # | Answer |
|---|---|
| Q1 | **Static menu binding** — owner picks items from menu API (use case: "send today's menu") |
| Q2 | **Deferred** (follows from Q1 static-only) |
| Q3 | **POS menu sync** — menu data comes from MyGenie POS API (`GET /api/menu/items`, `GET /api/menu/categories`) |
| Q4 | **fills_on() + curated list** (deterministic suggested chips) |
| Q5 | **Per-owner localStorage** (recently used) |
| Q6 | **Order/Bill → Loyalty → Customer → Coupon → Brand → Feedback → Menu** (menu last) |
| Q7 | **Yes** — lucide-react icons (Receipt, Star, User, Ticket, Building2, MessageSquare, UtensilsCrossed) |
| Q8 | **Reusable component** — extract `<VariablePicker />` |
| Q9 | **Use existing preview endpoint** if present; else client-side (current approach works, keep it) |

---

## 1. Live API Validation Protocol (MANDATORY before implementation)

**Every backend change and every API consumed by frontend must be validated with live curl calls before implementation is considered complete.** This is the owner's explicit requirement.

### 1.1 Pre-implementation baseline validation

Before writing any code, validate that existing APIs work correctly with authenticated calls:

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# Step 0: Login to get token
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@kunafamahal.com","password":"<PASSWORD>"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# V1: GET /api/whatsapp/variables — must return 37 variables, no `block` field
curl -s "$API_URL/api/whatsapp/variables" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); vs=d['variables']; print(f'Count={len(vs)} HasBlock={\"block\" in vs[0]}')"
# Expected: Count=37 HasBlock=False

# V2: GET /api/whatsapp/template-variable-map — must return existing mappings
curl -s "$API_URL/api/whatsapp/template-variable-map" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Mappings={len(d[\"mappings\"])}')"

# V3: GET /api/customers/sample-data — must return sample with all 37 keys
curl -s "$API_URL/api/customers/sample-data" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'SampleKeys={len(d[\"sample\"])} HasMenuSample={\"menu_item_name\" in d[\"sample\"]}')"
# Expected: HasMenuSample=False (pre-implementation)

# V4: GET /api/menu/items — must return menu items from POS sync
curl -s "$API_URL/api/menu/items" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'MenuItems={d.get(\"total\",0)}')"

# V5: GET /api/menu/categories — must return categories
curl -s "$API_URL/api/menu/categories" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Categories={d.get(\"total\",0)}')"
```

### 1.2 Post-implementation validation (run after each backend change)

```bash
# V6: GET /api/whatsapp/variables — must now return 40 variables (37 + 3 menu), ALL with `block` field
curl -s "$API_URL/api/whatsapp/variables" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
vs=d['variables']
print(f'Count={len(vs)}')
print(f'AllHaveBlock={all(\"block\" in v for v in vs)}')
blocks = set(v['block'] for v in vs)
print(f'Blocks={sorted(blocks)}')
menu_vars = [v for v in vs if v['block']=='menu']
print(f'MenuVars={[v[\"key\"] for v in menu_vars]}')
"
# Expected: Count=40, AllHaveBlock=True, Blocks=['brand','coupon','customer','feedback','loyalty','menu','order_bill'], MenuVars=['menu_item_name','menu_item_price','menu_category_name']

# V7: GET /api/customers/sample-data — must include menu sample values
curl -s "$API_URL/api/customers/sample-data" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d['sample']
for k in ['menu_item_name','menu_item_price','menu_category_name']:
    print(f'{k}={s.get(k, \"MISSING\")}')
"
# Expected: menu_item_name=Veg Biryani, menu_item_price=Rs.299, menu_category_name=Biryani

# V8: PUT /api/whatsapp/template-variable-map/{id} — must accept menu_pick mode
curl -s -X PUT "$API_URL/api/whatsapp/template-variable-map/TEST_VALIDATION" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "TEST_VALIDATION",
    "template_name": "cr020_test",
    "mappings": {"{{1}}": "customer_name", "{{2}}": "menu_item:12345:name"},
    "modes": {"{{1}}": "map", "{{2}}": "menu_pick"}
  }' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Status={d.get(\"message\",\"FAIL\")}')"
# Expected: Status=Variable mappings saved

# V9: Cleanup test mapping
curl -s -X PUT "$API_URL/api/whatsapp/template-variable-map/TEST_VALIDATION" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"template_id": "TEST_VALIDATION", "template_name": "cr020_cleanup", "mappings": {}, "modes": {}}' > /dev/null

# V10: Verify existing mappings still load correctly (no regression)
curl -s "$API_URL/api/whatsapp/template-variable-map" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
for m in d['mappings']:
    tid = m['template_id']
    mc = len(m.get('mappings',{}))
    print(f'  {tid}: {mc} mappings')
"
```

### 1.3 Frontend validation (screenshots after each UI component)

After each frontend component is complete, take a screenshot to verify:

```
S1: Mapping modal renders with WhatsApp preview + slot rows
S2: Clicking a slot trigger opens the grouped popover
S3: Popover shows search + suggested chips + 7 blocks in correct order
S4: Expanding Order/Bill block shows all 14+1 variables with green/amber dots
S5: Expanding Menu block shows 3 new variables
S6: Selecting a variable closes popover, updates slot + preview
S7: Menu Pick mode opens sub-popover with items/categories tabs
S8: Picking a menu item + field (name/price) shows locked binding
S9: Save mappings succeeds (no 422, no 500)
S10: Reload page — mappings persist correctly
```

---

## 2. Backend Changes

### 2.1 `backend/core/whatsapp_variables.py` — Add `block` field + 3 menu vars

**Change type**: edit existing file (search_replace)

**2.1.1 Add `block` field to every existing variable entry**

Map the existing `category` field to the new `block` grouping:

| Existing `category` | New `block` value | Popover section name |
|---|---|---|
| `general` (customer_name) | `customer` | Customer |
| `general` (restaurant_name) | `brand` | Brand / Links |
| `loyalty` | `loyalty` | Loyalty |
| `wallet` (wallet_balance, amount, wallet_used) | `order_bill` | Order / Bill |
| `order` | `order_bill` | Order / Bill |
| `coupon` | `coupon` | Coupon |
| `feedback` | `feedback` | Feedback |
| `links` | `brand` | Brand / Links |

Special cases:
- `customer_name` → block `customer` (not `general`)
- `restaurant_name` → block `brand` (not `general`)
- `amount` → block `order_bill` (it's bill amount, not wallet)
- `wallet_balance` → block `customer` (it's a customer attribute)
- `wallet_used` → block `order_bill` (it's an order-level deduction)

**2.1.2 Add 3 new menu variable entries at the end of WHATSAPP_VARIABLES**

```python
# ── Menu (CR-020: static owner-bound menu items from POS API) ──
{
    "key": "menu_item_name",
    "label": "Menu Item Name",
    "example": "Veg Biryani",
    "description": "Name of a menu item picked by the owner.",
    "category": "menu",
    "block": "menu",
    "picker": "menu_item",
    "sources": [],  # resolved from static binding, not event_data
    "fills_on_events": ALL_EVENTS,
    "formatter": None,
},
{
    "key": "menu_item_price",
    "label": "Menu Item Price",
    "example": "Rs.299",
    "description": "Price of a menu item picked by the owner.",
    "category": "menu",
    "block": "menu",
    "picker": "menu_item",
    "sources": [],
    "fills_on_events": ALL_EVENTS,
    "formatter": "currency",
},
{
    "key": "menu_category_name",
    "label": "Menu Category Name",
    "example": "Biryani",
    "description": "Name of a menu category picked by the owner.",
    "category": "menu",
    "block": "menu",
    "picker": "menu_category",
    "sources": [],
    "fills_on_events": ALL_EVENTS,
    "formatter": None,
},
```

Update `VARIABLES_BY_KEY`, `COUPON_VARIABLE_KEYS` (no change needed — they auto-derive).

**File**: `/app/backend/core/whatsapp_variables.py`
**Lines affected**: Every variable entry (add `"block": "..."` field), plus ~20 new lines at end.

---

### 2.2 `backend/routers/whatsapp.py` — Add `menu_pick` validation in save endpoint

**File**: `/app/backend/routers/whatsapp.py`
**Function**: `save_template_variable_mapping()` (line 601)

Add a validation block for `menu_pick` mode (mirrors the existing `coupon_pick` validation at line 614):

```python
# CR-020: Validate menu_pick mode entries
for placeholder, mapped_value in clean_mappings.items():
    if modes.get(placeholder) != "menu_pick":
        continue
    parts = mapped_value.split(":")
    if len(parts) != 3 or parts[0] not in ("menu_item", "menu_category"):
        raise HTTPException(
            400,
            f"Invalid menu_pick format for {placeholder}: expected 'menu_item:<id>:<field>' or 'menu_category:<id>:<field>'"
        )
    entity_type, entity_id, field = parts[0], parts[1], parts[2]
    if entity_type == "menu_item" and field not in ("name", "price"):
        raise HTTPException(400, f"Invalid menu_item field '{field}' for {placeholder}: must be name|price")
    if entity_type == "menu_category" and field not in ("name",):
        raise HTTPException(400, f"Invalid menu_category field '{field}' for {placeholder}: must be name")
```

Also update the T6 map-mode validation (line 644-665) to skip `menu_pick` mode:
```python
if mode in ("text", "coupon_pick", "menu_pick"):
    continue
```

And update the warnings loop (line 711-712) to skip `menu_pick`:
```python
if modes.get(placeholder) in ("text", "coupon_pick", "menu_pick"):
    continue
```

---

### 2.3 `backend/core/whatsapp.py` — Add `menu_pick` resolution in `build_body_values()`

**File**: `/app/backend/core/whatsapp.py`
**Function**: `build_body_values()` (line 444)

Add a new parameter `menu_pick_data` and an `elif mode == "menu_pick"` branch:

```python
def build_body_values(
    template_variables, variable_mappings, customer_data,
    event_data=None, variable_modes=None, brand_data=None,
    coupon_pick_data=None,
    menu_pick_data=None,     # CR-020: dict of {binding_key: resolved_value}
):
    ...
    elif mode == "menu_pick":
        # CR-020: Static binding — "menu_item:<id>:<field>" or "menu_category:<id>:<field>"
        # Resolved from pre-fetched menu_pick_data (DB lookup done in caller)
        body_values[var_num] = (menu_pick_data or {}).get(mapped_field, "")
    ...
```

In the caller (the send function around line 748), add menu_pick data pre-fetch:

```python
# CR-020: Pre-resolve menu_pick data (static binding — fetch from menu API or cache)
menu_pick_data = {}
for placeholder, mapped_value in variable_mappings.items():
    if (variable_modes.get(placeholder) == "menu_pick"
        and isinstance(mapped_value, str) and ":" in mapped_value):
        parts = mapped_value.split(":")
        if len(parts) == 3:
            entity_type, entity_id, field = parts
            # Fetch from DB menu cache or POS API
            if entity_type == "menu_item":
                item = await _fetch_menu_item(db, user_id, entity_id)
                if item:
                    menu_pick_data[mapped_value] = str(item.get(field, ""))
            elif entity_type == "menu_category":
                cat = await _fetch_menu_category(db, user_id, entity_id)
                if cat:
                    menu_pick_data[mapped_value] = str(cat.get(field, ""))
```

Helper functions (new, added to `core/whatsapp.py`):

```python
async def _fetch_menu_item(db, user_id, food_id):
    """Fetch a single menu item. Uses order_items collection as fallback cache."""
    # For now, return from a lightweight local cache or pass-through.
    # In v1, the resolved value is stored directly in the mapping at save time
    # (owner picks "Veg Biryani" → we store name+price alongside the ID).
    return None  # Placeholder — see §2.4 for the storage decision

async def _fetch_menu_category(db, user_id, category_id):
    """Fetch a single menu category."""
    return None
```

**Design Decision — Static Binding Resolution**:

Since menu_pick is a **static** binding (owner chooses at mapping time, not per-order), the simplest approach is to **store the resolved values in the mapping itself**:

```json
{
  "mappings": {
    "{{4}}": "menu_item:12345:name"
  },
  "modes": {
    "{{4}}": "menu_pick"
  },
  "menu_pick_resolved": {
    "menu_item:12345:name": "Veg Biryani",
    "menu_item:12345:price": "Rs.299"
  }
}
```

This way, `build_body_values` reads from `menu_pick_resolved` without any async API call at send time. The frontend populates `menu_pick_resolved` when the owner picks an item. The save endpoint stores it alongside mappings.

---

### 2.4 `backend/routers/customers.py` — Add menu sample data

**File**: `/app/backend/routers/customers.py`
**Function**: `get_sample_customer_data()` (line 723)

Add 3 lines to the `sample` dict:

```python
# CR-020: Menu variable sample values for preview
"menu_item_name":      "Veg Biryani",
"menu_item_price":     "Rs.299",
"menu_category_name":  "Biryani",
```

---

## 3. Frontend Changes

### 3.1 New component: `frontend/src/components/templates/VariablePicker.jsx`

**Reusable component** (per Q8) that renders the grouped popover picker.

**Props**:
```jsx
{
  variables: [],          // from GET /api/whatsapp/variables (with block field)
  eventKey: "",           // e.g. "send_bill" — drives suggested chips + green/amber dots
  selectedKey: "",        // currently mapped variable key (for highlight)
  onSelect: (varKey) => {},  // callback when user picks a variable
  onMenuPick: () => {},   // callback to open Menu Pick sub-flow
  onCouponPick: () => {}, // callback to open Coupon Pick sub-flow
}
```

**Internal state**:
- `searchQuery` — filters variables by label/key
- `expandedBlocks` — which blocks are expanded (Set)
- `recentlyUsed` — from localStorage `cr020_recently_used` (array of var keys, max 5)

**Block ordering** (locked per Q6):
```js
const BLOCK_ORDER = [
  { key: "order_bill", label: "Order / Bill", icon: Receipt, colorClass: "order-bill" },
  { key: "loyalty",    label: "Loyalty",      icon: Star,    colorClass: "loyalty" },
  { key: "customer",   label: "Customer",     icon: User,    colorClass: "customer" },
  { key: "coupon",     label: "Coupon",       icon: Ticket,  colorClass: "coupon" },
  { key: "brand",      label: "Brand / Links",icon: Building2, colorClass: "brand" },
  { key: "feedback",   label: "Feedback",     icon: MessageSquare, colorClass: "feedback" },
  { key: "menu",       label: "Menu",         icon: UtensilsCrossed, colorClass: "menu", isNew: true },
];
```

**Suggested chips**: filter `variables` where `fills_on(var.key, eventKey)` returns true. Use `fills_on_events` field from the registry. Show top 5.

**Green/amber dots**: green if `fills_on_events === "*"` or `eventKey in fills_on_events`, amber otherwise.

---

### 3.2 New component: `frontend/src/components/templates/MenuPickModal.jsx`

**Sub-popover** for picking a menu item or category.

**Props**:
```jsx
{
  open: bool,
  onClose: () => {},
  onPick: ({ type, id, name, price, category, field }) => {},  // callback with full item data
  api: axiosInstance,  // authenticated API client
}
```

**Internal state**:
- `tab` — "items" | "categories"
- `searchQuery`
- `items` — from `GET /api/menu/items`
- `categories` — from `GET /api/menu/categories`
- `selectedItem` — the item/category the owner clicked
- `selectedField` — "name" | "price" (for items) or "name" (for categories)
- `loading`

**Flow**:
1. Opens with Items tab active
2. Fetches `GET /api/menu/items` on mount (paginated, searchable)
3. Owner clicks an item → bottom field-selector appears ("Name" | "Price")
4. Owner clicks field → `onPick()` fires with full data, modal closes
5. Categories tab: same flow but only "Name" field

---

### 3.3 Rewrite: `frontend/src/pages/TemplatesPage.jsx` — Variable Mapping Modal

**Scope**: Lines 588-701 (the `<Dialog>` for variable mapping)

**Changes**:
1. Replace the flat `<Select>` per slot (line 673-688) with `<VariablePicker />` popover trigger
2. Add `"menu_pick"` to the mode toggle group (alongside "Map to Field" / "Custom Text" / "Coupon Pick")
3. When mode is `menu_pick` and a binding exists, show the locked binding display (lock icon, item name, price/field)
4. When mode is `menu_pick` and no binding yet, show `<MenuPickModal />`
5. Update `resolvePreviewWithSampleData()` to handle `menu_pick` mode — read from `menu_pick_resolved` cache
6. Update `handleSaveVariableMapping()` to include `menu_pick_resolved` in the PUT payload
7. Add `recentlyUsed` localStorage read/write

**State additions**:
```jsx
const [menuPickResolved, setMenuPickResolved] = useState({});  // { "menu_item:123:name": "Veg Biryani" }
const [showMenuPick, setShowMenuPick] = useState(null);  // which {{n}} slot opened menu pick
```

---

## 4. File-by-file change summary

| # | File | Action | Lines affected | Description |
|---|---|---|---|---|
| B1 | `backend/core/whatsapp_variables.py` | Edit | All entries + 20 new | Add `block` field to 37 entries; add 3 menu entries |
| B2 | `backend/routers/whatsapp.py` | Edit | ~601-727 | Add `menu_pick` validation + skip in T6/warnings |
| B3 | `backend/core/whatsapp.py` | Edit | ~444-495, ~748 | Add `menu_pick` resolution branch + `menu_pick_data` param |
| B4 | `backend/routers/customers.py` | Edit | ~776 | Add 3 menu sample data lines |
| F1 | `frontend/src/components/templates/VariablePicker.jsx` | **New** | ~200 lines | Reusable grouped popover component |
| F2 | `frontend/src/components/templates/MenuPickModal.jsx` | **New** | ~150 lines | Menu item/category picker sub-modal |
| F3 | `frontend/src/pages/TemplatesPage.jsx` | Edit | ~588-701 | Rewire mapping modal to use new picker + menu pick |

---

## 5. Acceptance Criteria

| # | Criterion | Validation method |
|---|---|---|
| AC-1 | `GET /api/whatsapp/variables` returns 40 variables, each with `block` field | curl (V6) |
| AC-2 | Variables grouped into 7 blocks: `order_bill`, `loyalty`, `customer`, `coupon`, `brand`, `feedback`, `menu` | curl (V6) |
| AC-3 | `GET /api/customers/sample-data` returns `menu_item_name`, `menu_item_price`, `menu_category_name` | curl (V7) |
| AC-4 | `PUT /template-variable-map/{id}` accepts `menu_pick` mode with `menu_item:<id>:<field>` format | curl (V8) |
| AC-5 | `PUT /template-variable-map/{id}` rejects invalid `menu_pick` formats (400) | curl |
| AC-6 | `PUT /template-variable-map/{id}` skips `menu_pick` entries in T6 registry validation | curl (V8 no 422) |
| AC-7 | Existing mappings (Mygenie Dev, Kunafa) load and save without regression | curl (V10) |
| AC-8 | Mapping modal shows WhatsApp live preview at top | screenshot (S1) |
| AC-9 | Clicking a slot's picker trigger opens the grouped popover | screenshot (S2) |
| AC-10 | Popover shows search bar, suggested chips, recently-used, 7 blocks in order | screenshot (S3) |
| AC-11 | Each variable shows green dot (fills on event) or amber dot (may not fill) | screenshot (S4) |
| AC-12 | Menu block shows 3 new variables with NEW badge | screenshot (S5) |
| AC-13 | Selecting a variable updates the slot + live preview | screenshot (S6) |
| AC-14 | Menu Pick mode opens sub-popover with items + categories from POS API | screenshot (S7) |
| AC-15 | Picking a menu item shows locked binding (name, price, lock icon) | screenshot (S8) |
| AC-16 | Save Mappings succeeds without errors | screenshot (S9) + curl |
| AC-17 | Page reload preserves all mappings | screenshot (S10) |
| AC-18 | Color palette unchanged (orange #F26B33, dark #2B2B2B, green #25D366) | visual check |

---

## 6. Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Menu API unavailable (POS token expired) | MenuPickModal shows error state with retry; mapping modal still works for all other modes |
| Large menu (200+ items) slows picker | Client-side search + paginate API call (limit=500 already on existing endpoint) |
| Existing coupon_pick flow regression | No changes to coupon_pick logic; only additive menu_pick alongside it |
| `block` field breaks old frontend cache | Additive field; old clients ignore it. Frontend always fetches fresh. |

---

## 7. Implementation sequence

| Step | What | Validation |
|---|---|---|
| 1 | **Baseline validation** — run V1-V5 curl commands | All pass |
| 2 | **B1**: Add `block` field + 3 menu vars to registry | V6 passes |
| 3 | **B4**: Add menu sample data to sample-data endpoint | V7 passes |
| 4 | **B2**: Add `menu_pick` validation to save endpoint | V8, V9 passes |
| 5 | **B3**: Add `menu_pick` resolution to build_body_values | Unit test or manual trace |
| 6 | **V10**: Verify existing mappings still work | No regression |
| 7 | **F1**: Build `<VariablePicker />` component | S2-S6 screenshots |
| 8 | **F2**: Build `<MenuPickModal />` component | S7-S8 screenshots |
| 9 | **F3**: Rewire TemplatesPage mapping modal | S1, S9, S10 screenshots |
| 10 | **Full regression** — load existing templates, map, save, reload | All ACs pass |

---

## 8. Sign-off checklist

Before implementation begins, owner confirms:

- [ ] **S1**: Block assignment table (§2.1.1) — `wallet_balance` → `customer`, `amount` → `order_bill`, `wallet_used` → `order_bill` — correct?
- [ ] **S2**: Menu binding stored as `menu_pick_resolved` alongside mappings (no async POS API call at send time) — acceptable?
- [ ] **S3**: Implementation sequence (§7) — backend first, then frontend — acceptable?
- [ ] **S4**: 18 acceptance criteria (§5) — complete? Any missing?
- [ ] **S5**: Go ahead to implement?

---

**End of planning doc.**
