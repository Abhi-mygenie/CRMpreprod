# POS-CRM Customer Cross-Sell / Upsell / Suggested Notes API

**Date:** 2026-02-26
**Status:** `pos_crm_cross_sell_registered_awaiting_phase_0_discovery`
**Status (2026-05-26):** `pos_crm_cross_sell_discovery_complete_requirements_freeze_locked`
**Priority:** P2 (within ROI Measurement Sprint — runs after CR-002B discovery clarity)
**Sprint:** ROI Measurement for CRM
**Register:** `./ROI_MEASUREMENT_CR_REGISTER.md`

---

## 1. Purpose

When a customer is selected inside the POS order flow, POS should be able to fetch **CRM-driven order suggestions** for that customer — cross-sell items, upsell items, customer-level order notes, and item-specific notes when a known item is selected.

These suggestions are **optional / advisory**. They are surfaced to the POS operator, never auto-applied to the cart.

This is a **POS-facing CR with a CRM API dependency**. It is independent from CR-003 (owner global analytics) and independent from CR-002B (customer detail screen data fix), though it benefits from CR-002B clarity.

---

## 2. Expected Future Capability

For a selected CRM customer in POS:

- **Cross-sell item suggestions** — different items the customer is likely to add (e.g. "Customer usually buys cake → suggest coffee").
- **Upsell item suggestions** — a better/larger/premium variant of an item already in cart (e.g. regular → large/combo/premium).
- **Customer-level suggested order notes** — notes that this customer commonly applies to the whole order (e.g. "less spicy").
- **Item-level suggested notes** — notes commonly associated with a specific item for this customer (e.g. tea → "no sugar", pasta → "extra cheese").

All of these are *suggestions*, not auto-applied modifications.

---

## 3. Phase 0 Discovery Questions

1. Does POS already have a CRM customer insight / suggestion API after customer selection? If yes, what does it return today?
2. If no such API exists, define the required API contract (see proposed shape below).
3. Which underlying CRM data feeds these suggestions (orders, items frequency, recurring item-level notes, recurring order-level notes, AI insights)?
4. Are item IDs and notes durable enough across POS menu updates to be safely suggested back into POS?
5. How will POS render and confirm / dismiss each suggestion?

---

## 4. Proposed API Direction (placeholder — to be finalised in Planning)

```
POST /api/pos/customers/order-suggestions
```

### Possible request context

```json
{
  "restaurant_id": "string",
  "crm_customer_id": "string",
  "pos_customer_id": "string | null",
  "current_cart": [
    { "item_id": "string", "qty": 0, "price": 0 }
  ],
  "selected_item": { "item_id": "string" } ,
  "order_type": "dine_in | takeaway | delivery | ...",
  "table_id": "string | null",
  "room_id": "string | null"
}
```

### Possible response

```json
{
  "customer_summary": {
    "name": "...",
    "tier": "...",
    "visits": 0,
    "last_visit_at": "..."
  },
  "customer_notes": [
    { "text": "less spicy", "source": "history", "confidence": 0.0 }
  ],
  "cross_sell_items": [
    { "item_id": "...", "title": "...", "reason": "...", "confidence": 0.0, "source": "history|ai|rules" }
  ],
  "upsell_items": [
    { "from_item_id": "...", "to_item_id": "...", "reason": "...", "confidence": 0.0 }
  ],
  "item_notes": [
    { "item_id": "...", "text": "no sugar", "confidence": 0.0, "source": "history|ai|rules" }
  ]
}
```

Field names, auth model, paging, caching strategy, and exact rules vs ML-based generation are all **TBD in Phase 0/1**.

---

## 5. Out Of Scope

- Owner-level coupon analytics → owned by **CR-003**.
- Customer detail screen data correctness → owned by **CR-002B**.
- Auto-applying suggestions to the cart (this CR keeps suggestions advisory only).
- Any change to closed CRM 1.0 baseline close document.

---

## 6. Future Flow

```
Phase 0 Discovery
  → API Contract Planning
    → Implementation
      → POS / CRM Integration QA
        → Final Reconciliation
```

This placeholder doc covers only **registration**. Phase 0 discovery has NOT started yet.

---

## 7. Dependencies / Relationships

| Relationship | Detail |
|---|---|
| Soft-depends on | **CR-002B** — customer insights / top items / preferences must be trustworthy for suggestions to be meaningful. |
| Independent of | **CR-003** — global owner analytics; do not bundle. |
| POS dependency | Requires a POS surface to render suggestions when a customer is selected during order build. |

---

## 8. Strict Non-Goals For This Registration

- No code changes (backend or POS)
- No DB / env / deploy / migration
- No QA execution
- No merging into CR-003 or CR-002B

---

## 9. Recommended Next Agent (when picked up)

`POS-CRM Cross-Sell API Discovery Agent` — runs Phase 0 Discovery on whether any such API already exists, and drafts the API contract for Planning.

---

## 10. Status

```
pos_crm_cross_sell_registered_awaiting_phase_0_discovery
```

### Status Update (2026-05-26)

```
pos_crm_cross_sell_discovery_complete_requirements_freeze_locked
```

Phase 0 Discovery complete. All owner decisions captured in `../discovery/POS_CRM_CUSTOMER_CROSS_SELL_PHASE_0_REQUIREMENTS_FREEZE.md` (status: locked). Promoted to Phase 1 Planning: `../planning/POS_CRM_CROSS_SELL_API_PHASE_1_PLAN.md`.
