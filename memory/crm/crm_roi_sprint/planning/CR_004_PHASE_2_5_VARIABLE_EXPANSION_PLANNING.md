# CR-004 — Phase 2.5 · Variable Expansion (10 → 23) — Planning Doc

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5 — Variable Expansion
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27 (written retroactively — code shipped before doc)
**Status:** `cr004_phase_2_5_complete` (implemented, doc retroactive)
**Depends on:** P2 (Variable DB Mapping — complete)
**Blocks:** P2.5-B (Coupon-Aware Dynamic Picker)

---

## 1. Phase Purpose

P2 made the existing 10 variables work correctly via the registry resolver. P2.5 **expands** the registry from 10 to 23 variables to cover all data the system can produce at trigger time, organized into 7 categories.

This phase adds new variables. It does NOT change the resolver, the modal UX, or the event system.

---

## 2. Owner Context

Owner communicated the need for rich coupon fields:
> "We will need rich, dynamic fields for coupon — coupon title — so the user can easily select which coupon, because this is the most important part in the model. We might need to redesign the model."

P2.5 addressed the **data layer** (adding `coupon_title`, `coupon_discount`, `coupon_expiry` to the registry + wiring them in the trigger). The **UX redesign** (coupon picker modal) is deferred to P2.5-B.

---

## 3. New Variables Added (13)

### Tier 1 — Loyalty (5 new, 0 code-change)

| Key | Label | Category | Source Chain | Fills On | Formatter |
|---|---|---|---|---|---|
| `old_tier` | Previous Tier | loyalty | `event.old_tier` | `tier_upgrade` only | None |
| `expiring_points` | Expiring Points | loyalty | `event.expiring_points` | `points_expiring` | integer |
| `total_visits` | Total Visits | loyalty | `customer.total_visits` | `*` (always) | integer |
| `total_spent` | Total Spent | loyalty | `customer.total_spent` | `*` (always) | currency |
| `expiry_date` | Expiry Date | loyalty | (existing, moved to expanded list) | `points_expiring` | date |

### Tier 2 — Order (1 new)

| Key | Label | Category | Source Chain | Fills On | Formatter |
|---|---|---|---|---|---|
| `order_id` | Order ID | order | `event.order_id → event.pos_order_id` | `send_bill`, `send_bill_auto`, `send_bill_manual`, `new_order_customer`, `first_visit` | None |

### Tier 3 — Coupon (3 new, trigger site enriched)

| Key | Label | Category | Source Chain | Fills On | Formatter |
|---|---|---|---|---|---|
| `coupon_title` | Coupon Title | coupon | `event.coupon_title` | `coupon_earned` | None |
| `coupon_discount` | Coupon Discount | coupon | `event.coupon_discount → event.discount` | `coupon_earned` | currency |
| `coupon_expiry` | Coupon Expiry | coupon | `event.coupon_expiry` | `coupon_earned` | date |

**Trigger site enriched** in `routers/coupons.py:186-197`:
```python
asyncio.create_task(trigger_whatsapp_event(
    db, user["id"], "coupon_earned", customer,
    {
        "coupon_code": code.upper(),
        "coupon_discount": validation["discount"],
        "coupon_title": coupon.get("title", ""),
        "coupon_expiry": coupon.get("end_date", ""),
    }
))
```

### Tier 4 — Feedback (1 new)

| Key | Label | Category | Source Chain | Fills On | Formatter |
|---|---|---|---|---|---|
| `rating` | Feedback Rating | feedback | `event.rating` | `feedback_received` | None |

### Tier 5 — Profile Links (4 new, brand-level)

| Key | Label | Category | Source Chain | Fills On | Formatter |
|---|---|---|---|---|---|
| `einvoice_link` | E-Invoice Link | links | `event.einvoice_link → brand.einvoice_link` | ORDER_EVENTS | None |
| `instagram_link` | Instagram Link | links | `brand.instagram_link` | `*` (always) | None |
| `google_review_link` | Google Review Link | links | `brand.google_review_link` | `*` (always) | None |
| `feedback_link` | Feedback Form Link | links | `brand.feedback_link` | `*` (always) | None |

---

## 4. Category Breakdown (Final — 23 Variables)

| Category | Count | Variables |
|---|---|---|
| **general** | 2 | `customer_name`, `restaurant_name` |
| **loyalty** | 9 | `points_balance`, `points_earned`, `points_redeemed`, `tier`, `old_tier`, `expiring_points`, `expiry_date`, `total_visits`, `total_spent` |
| **wallet** | 2 | `wallet_balance`, `amount` |
| **order** | 1 | `order_id` |
| **coupon** | 4 | `coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry` |
| **feedback** | 1 | `rating` |
| **links** | 4 | `einvoice_link`, `instagram_link`, `google_review_link`, `feedback_link` |

---

## 5. Backend Changes Required

### 5.1 `core/whatsapp_variables.py` — Expand registry

Add 13 new entries to `WHATSAPP_VARIABLES` list with full `sources`, `fills_on_events`, `formatter`, `category` fields.

### 5.2 `routers/customers.py:get_sample_customer_data` — Expand sample response

Align the sample-data response to include all 23 keys for preview rendering. Link variables sourced from `users` doc (requires expanded projection in the query).

### 5.3 `routers/coupons.py` — Enrich `coupon_earned` trigger

Pass `coupon_title`, `coupon_discount`, `coupon_expiry` in `event_data` alongside existing `coupon_code`.

### 5.4 `core/whatsapp.py:trigger_whatsapp_event` — Expand brand_data projection

Add `einvoice_link`, `instagram_link`, `google_review_link`, `feedback_link` to the `users` doc projection so link variables resolve via brand scope.

---

## 6. Frontend Changes

**No frontend changes required.** Both `WhatsAppAutomationContent.jsx` and `TemplatesPage.jsx` fetch variables from `GET /api/whatsapp/variables` — the expanded list renders automatically in the dropdown.

The `resolvePreviewWithSampleData()` function already handles any key present in `sampleCustomerData` — as long as `sample-data` endpoint returns the new keys, previews work.

---

## 7. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /api/whatsapp/variables` returns 23 variables |
| AC-2 | Every variable has `key`, `label`, `example`, `description`, `sources`, `fills_on_events`, `formatter`, `category` |
| AC-3 | `resolve_variable("coupon_title", {}, {"coupon_title": "Lunch Special"}, {})` → `"Lunch Special"` |
| AC-4 | `resolve_variable("total_spent", {"total_spent": 50000}, {}, {})` → `"Rs.50,000"` |
| AC-5 | `resolve_variable("coupon_expiry", {}, {"coupon_expiry": "2026-12-31"}, {})` → `"31 Dec 2026"` |
| AC-6 | `fills_on("coupon_title", "coupon_earned")` → True; `fills_on("coupon_title", "birthday")` → False |
| AC-7 | `fills_on("instagram_link", "birthday")` → True (universal) |
| AC-8 | Sample-data endpoint returns all 23 keys in `sample` dict |
| AC-9 | Variable mapping dropdown shows all 23 variables |
| AC-10 | P2 regression: all 10 original variables still resolve correctly |

---

## 8. Out of Scope

| Item | Goes to |
|---|---|
| Coupon picker UX (rich dynamic field selection) | P2.5-B |
| Event reconciliation | P3 |
| Segment broadcasts | P5 |

---

## 9. Status

`cr004_phase_2_5_complete` — Implemented in code before this doc was written. See companion implementation report.
