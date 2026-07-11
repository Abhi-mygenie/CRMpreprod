# CR-020 — Template Variable Picker: Grouped UX + Menu Variable Family

**Sprint**: ROI Measurement / CRM
**Type**: UX restructure (Templates page → variable mapping picker) + new variable family
**Requested**: 2026-06-05 — owner: *"there's a lot of confusion happening … we need to block them … add menu also as a variable … this is the requirement"*
**Lifecycle stage**: `discovery_drafted_awaiting_signoff`
**Access used**: read-only static analysis + remote DB read + 1 screenshot from owner
**Effort estimate**: ~1.5 days (HTML mock → planning → frontend rewrite + small backend extension + menu variable plumbing)
**Test tenants**: Mygenie Dev (`pos_0001_restaurant_510`), Kunafa Mahal (`pos_0001_restaurant_689`)

---

## 1. One-line problem statement

The variable-mapping picker on the Templates page is a **single flat dropdown of 37 variables**. Owners can't reason about which variable means what (e.g., `points_earned` vs `points_balance`, `amount` vs `wallet_balance`), they mis-map slots, and there is **no way to use a menu item / menu category as a variable** even though the menu API already exists.

---

## 2. Evidence — the confusion is real and live in production

### 2.1 From the screenshot the owner shared (2026-06-05)

The mapping modal for `payment_bill` (template `36320`) shows one scrolling list of variables with no grouping. Owner explicitly highlighted that loyalty / order / customer variables are visually indistinguishable.

### 2.2 From the live DB (`whatsapp_template_variable_map.mappings` for Mygenie Dev template 36320)

```
{{1}}: customer_name        ← reasonable (customer)
{{2}}: restaurant_name      ← reasonable (brand)
{{3}}: order_time           ← reasonable (order)
{{4}}: transaction_id       ← but resolves to "95" on real order 000457
                              (looks like pos_order_id suffix, not a txn id)
{{5}}: points_earned        ← reasonable (loyalty)
{{6}}: points_redeemed      ← reasonable (loyalty)
{{7}}: points_earned        ← duplicate of {{5}}: both bound to same field
```

Two of seven slots are mis-bound. Both are exactly the categories of confusion the grouping is meant to prevent.

### 2.3 From the variable registry (`core/whatsapp_variables.py`)

37 variables exist today, all in one flat list. Sub-families are present but not visually separated:

| Sub-family | Count | Examples |
|---|---|---|
| Order / Bill | 14 | amount, tax_amount, payment_method, order_date, order_time, table_id, waiter_name, item_count, order_notes, restaurant_order_id (Bill Number), order_id, transaction_id, order_type, wallet_used |
| Loyalty | 7 | points_earned, points_redeemed, points_balance, loyalty_points_used, loyalty_discount, expiring_points, expiry_date |
| Customer | 6 | customer_name, tier, old_tier, total_visits, total_spent, wallet_balance |
| Coupon | 4 | coupon_code, coupon_title, coupon_discount, coupon_expiry |
| Brand / Links | 5 | restaurant_name, einvoice_link, instagram_link, google_review_link, feedback_link |
| Feedback | 1 | rating |
| **Menu** | **0** | **none today — owner-requested NEW family** |

### 2.4 No tenant-side or template-side block metadata exists

Neither `whatsapp_variables.py` nor `whatsapp_event_template_map` nor `whatsapp_template_variable_map` carries any `block` / `category` / `group` field. Grouping today is implicit / by convention only — frontend has no signal to render groups.

---

## 3. Where this lives in the codebase today

### 3.1 Frontend (the surface that gets rewritten)

| File | Lines | Role |
|---|---|---|
| `frontend/src/pages/TemplatesPage.jsx` | (entry route) | Hosts the modal that opens when an owner clicks **Map** on a template card. |
| `frontend/src/components/templates/VariableMappingModal.jsx` *(or current equivalent — to verify in planning)* | full file | Renders the **flat dropdown picker** shown in the screenshot. Currently calls `GET /api/whatsapp/variables` and renders `<Select>` per slot. |
| `frontend/src/components/templates/CouponPickerSubModal.jsx` *(or current equivalent)* | full file | The existing **Coupon Pick** sub-flow — the pattern Menu Pick will mirror. |
| `frontend/src/lib/whatsapp/variables.js` *(if present — to verify)* | — | Client-side label/example cache. |

> Exact filenames will be re-verified at planning time; the architectural picture is correct.

### 3.2 Backend (small extension only)

| File | Role | Change scope |
|---|---|---|
| `backend/core/whatsapp_variables.py` | 37-entry registry | Add `block` field per entry; add 2-3 menu variable entries (see §5). |
| `backend/routers/whatsapp.py` :: `GET /variables` | exposes the registry to FE | Return `block` field; backwards-compatible (additive). |
| `backend/routers/whatsapp.py` :: `GET /variables?event_key=…` *(if present, else add)* | optional event-aware filter | Return per-variable `fills_on_event: bool` so the FE can render 🟢/🟡 badges without recomputing. |
| `backend/core/whatsapp.py` :: `resolve_variable()` | resolves variable at send time | Add resolvers for `menu_item_*` and `menu_category_*` reading from owner's static binding (mirrors coupon_pick path). |
| `backend/routers/menu.py` *(or equivalent — to confirm in planning)* | existing menu listing API | **No write**; FE consumes for picker. May need a lightweight `GET /menu/picker` returning `[{id, name, category, price}]` if existing endpoint returns too much. |
| `backend/routers/customers.py` :: `GET /customers/sample-data` | sample-data for preview | Add sample menu item / category for preview rendering (CR-015a precedent). |

### 3.3 DB schema impact

| Collection | Change |
|---|---|
| `whatsapp_template_variable_map` | None to existing fields. Optionally extend `modes` enum to include `menu_pick` (today supports `field` / `custom` / `coupon_pick`). Owner-supplied menu binding stored in `mappings` as e.g. `menu_item:<menu_item_id>:name`, same pattern as `coupon_pick:<coupon_id>`. |
| New collections | None. |

### 3.4 Backend trigger / send / webhook flow

**No change.** This is purely the mapping-UI surface + a new resolver family. The trigger pipeline (`pos.py` → `trigger_whatsapp_event` → AuthKey → callback) is untouched.

---

## 4. Locked UX direction (from owner brainstorm 2026-06-05)

| # | Decision | Source |
|---|---|---|
| L1 | **7 grouping blocks** — Order/Bill, Loyalty, Customer, Coupon, **Menu (NEW)**, Brand, Feedback | Owner brainstorm |
| L2 | `einvoice_link` belongs in **Order/Bill**, not Brand | Owner explicit correction |
| L3 | **One template can use variables from any block** — cross-block selection must be native | Owner explicit |
| L4 | **Single intelligent popover** picker (not tabs, not full modal) — search + suggested + grouped sections + per-var 🟢/🟡 + recently-used | Mock direction approved |
| L5 | **Same color palette** — orange `#F26B33`, dark text `#2B2B2B`, gray subs `#52525B`, white cards. **No new visual system.** | Owner explicit |
| L6 | **Web-first** layout — desktop is the primary surface | Owner explicit |
| L7 | **Live preview at top** of mapping screen — rendered message with sample values updating as owner picks | Mock direction approved |
| L8 | **Menu variable** must come from existing menu API (no new menu store) | Owner explicit |
| L9 | AuthKey delivery-callback issue for Mygenie Dev is **out of scope** | Owner explicit |

---

## 5. Menu variable family — design surface

### 5.1 Variable keys to add to registry

| Key | Label | Resolver source | Sample |
|---|---|---|---|
| `menu_item_name` | Menu Item Name | Owner-bound at mapping time → owner picks a specific menu item; resolver returns its `name`. (Static, like `coupon_pick`.) | `"Veg Biryani"` |
| `menu_item_price` | Menu Item Price | Same source, returns `price` formatted as currency | `"Rs.299"` |
| `menu_category_name` | Menu Category Name | Owner-bound — picks a category | `"Biryani"` |

Optional Phase-2 (dynamic — defer if discovery answers say so):
- `current_order_first_item` — at send time, reads first item from POS order payload.
- `current_order_top_priced_item` — most expensive item in current order.
- `current_order_item_count` — already exists as `item_count`; no new key.
- `recommended_item` — needs ML / rule engine; **out of scope** for this CR.

### 5.2 Storage pattern (mirrors coupon_pick)

In `whatsapp_template_variable_map.mappings`, an owner-bound menu slot is stored as:

```
"{{4}}": "menu_item:<menu_item_id>:name"
"{{5}}": "menu_item:<menu_item_id>:price"
"{{6}}": "menu_category:<menu_category_id>:name"
```

`modes` entry for these slots = `"menu_pick"` (new enum value alongside existing `field` / `custom` / `coupon_pick`).

### 5.3 Picker sub-flow

Same UX pattern as today's Coupon Pick:

1. Owner selects "Pick a Menu Item" or "Pick a Menu Category" from the main popover.
2. A second popover opens with the tenant's menu list (paginated, searchable).
3. Owner picks one item / category + a field selector (`name | price` for items; `name` for categories).
4. Closes back to the slot showing the chosen binding (e.g., "Menu: Veg Biryani — Price").

### 5.4 Sample-data for live preview

`GET /api/customers/sample-data` must return a `sample_menu_item` and `sample_menu_category` so the **Live Preview** can render menu-bound slots before any real order. Pattern follows CR-015a.

---

## 6. Open questions (need owner answers before planning lock)

| # | Question | Default if no answer |
|---|---|---|
| Q1 | **Menu binding: static-only (owner picks per slot) for v1, or also dynamic (auto-pulled from current order's items) in same release?** | **Static only for v1** — defer dynamic to a separate CR (much simpler scope; matches coupon_pick semantics owners already know) |
| Q2 | **If dynamic later (Phase 2): when order has multiple items, what shows in the variable slot?** First item / top-priced / comma-joined list / "N items inc. X" | Default deferred; flag at start of Phase-2 CR |
| Q3 | **What's the source of truth for menu items?** Existing CRM `menu` collection (if any) / POS menu sync / a fresh upload UI in CRM? | **Whichever endpoint is already serving the Items Analytics page** — confirm in planning |
| Q4 | **Suggested-for-this-event chips** at top of picker — drive from `fills_on()` registry + a hand-curated "primary vars per event" list, or pure usage-frequency-based ranking? | **`fills_on()` + curated list** in v1 (deterministic, no ML); usage-frequency later |
| Q5 | **Recently-used scope** — per-owner localStorage, per-template, or per-(owner × event)? | **Per-owner localStorage** (simplest, no schema change) |
| Q6 | **Block ordering inside the popover** | **Order/Bill → Loyalty → Customer → Coupon → Menu → Brand → Feedback** (matches frequency of use in `send_bill`-class templates) |
| Q7 | **Block icons** — use the existing lucide-react set (`Receipt`, `Star`, `User`, `Ticket`, `UtensilsCrossed`, `Building2`, `MessageSquare`)? | **Yes**, matches Dashboard visual language |
| Q8 | **Should the picker be reused on Segments composer and (future) Custom Template Builder?** Same component, or one-off for Templates page only? | **Reusable component** — extract once, reuse everywhere; modest refactor cost, big consistency win |
| Q9 | **Live preview engine** — use the existing `GET /api/whatsapp/templates/{id}/preview` endpoint (if present), or recompute client-side? | Confirm endpoint exists at planning time; if yes use it (server-rendered is canonical); else compute client-side from `body_values` |

---

## 7. Non-goals (explicit)

| # | Item | Why deferred |
|---|---|---|
| N1 | New backend trigger / event flow | Untouched; this is UI |
| N2 | Renaming variable keys | Risk to existing `whatsapp_template_variable_map` rows in DB; not a UX problem |
| N3 | Removing variables from registry | All 37 stay; just reorganized visually |
| N4 | AuthKey delivery-callback misconfig for Mygenie Dev | Owner explicit out-of-scope |
| N5 | Dynamic menu variables (auto-pulled from current order) | Defer to follow-up CR per Q1 default |
| N6 | Recommended-item / ML-driven variables | Separate effort |
| N7 | Custom Template Builder (CR-012) — full template authoring | Different CR; this picker should be *usable inside* it later |
| N8 | Migrating existing mappings | None needed — block grouping is additive UI metadata, not a data migration |

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Picker refactor regresses existing flat-dropdown flow (owners can't find a variable they were used to) | Medium | Search bar at top covers every old label; block names match family labels owners already see implicitly. |
| Menu picker pulls a huge menu (200+ items) — slow render | Low | Server-paginate + client-search; same as coupon picker today. |
| Sample-data API gaps for menu vars → preview shows blanks | Medium | CR-015a-style fallback to registry `example` value when sample-data missing. |
| Backend `block` field addition breaks an older client cached label list | Negligible | Additive field; old clients ignore it. |
| Component reuse on Segments / Custom Builder requires more refactor than planning estimates | Medium | Discovery flags this; planning will scope to "Templates only" if extraction proves messy. |

---

## 9. Reuse opportunity (worth flagging early)

The same picker is needed in **3 places**:

1. **Templates page** — variable mapping per template slot (this CR's primary surface).
2. **Segments composer** — building dynamic segment conditions ("customers whose tier is Gold AND total_visits > 10"). Today has its own ad-hoc picker.
3. **Future Custom Template Builder** (CR-012) — when an owner authors a brand-new template from scratch, they need to drop variable placeholders into the body text.

Recommend extracting `<VariablePicker />` as a single reusable component. Planning will decide whether to do that extraction in this CR or as follow-up.

---

## 10. What "done" looks like (acceptance vision — not binding yet)

1. Templates page mapping modal shows the **Live Preview** at the top, updating as owner edits.
2. Each `{{n}}` slot has a single picker; clicking opens **one popover** with:
   - search box at top,
   - 4-6 suggested chips for the current template's event,
   - "Recently used" row,
   - 7 collapsible sections (Order/Bill, Loyalty, Customer, Coupon, Menu, Brand, Feedback) in that order,
   - per-variable 🟢/🟡 fills-on-event badge,
   - existing modes (Map to Field / Custom Text / Coupon Pick / **Menu Pick NEW**) reachable inline.
3. Choosing Menu Pick opens a sub-popover listing the tenant's menu items + categories from the existing menu API.
4. Saving updates `whatsapp_template_variable_map.mappings` and `modes` in the same shape used today (additive — `menu_pick` mode is new).
5. Existing Mygenie Dev & Kunafa template mappings render correctly without manual migration.
6. Color palette unchanged.

---

## 11. Sequencing with other open CRs

- **CR-019** (`send_bill` event-key mismatch) — plan done, awaiting D3/D4/D5 confirmation. Independent file/line edits. Land CR-019 first or in parallel; CR-020 doesn't touch the trigger flow.
- **CR-012** (WhatsApp Template Builder Production Readiness) — parked. CR-020's `<VariablePicker />` extraction (if Q8=Yes) is a useful pre-requisite for CR-012.
- **CR-015 / CR-015a/b/c** — closed. The variable registry and sample-data foundations CR-020 builds on were delivered in those.
- **CR-016** (Dynamic Event Registry + Trigger Config UI) — parked. Orthogonal; CR-020 does not depend on it.

---

## 12. Resume signal

Status: `discovery_drafted_awaiting_signoff`. Next agent (or this one in next turn) reads this doc, gets owner answers to Q1–Q9 in §6, then **planning starts with an HTML mock** per owner instruction (a standalone `.html` file owner can open in a browser) — **only after** HTML mock approval does the planning doc (with exact files/lines) get written. No code touched.
