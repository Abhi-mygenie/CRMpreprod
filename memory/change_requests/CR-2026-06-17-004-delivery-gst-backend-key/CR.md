# CR-2026-06-17-004 — Delivery GST: Switch to Backend-Provided Rate Key with Fallback

| Field | Value |
|---|---|
| CR ID | CR-2026-06-17-004 |
| Registered at (UTC) | 2026-06-17 |
| Registered by | E1 (on behalf of owner) |
| Classification | BUG / Deviation from plan |
| Severity | P2 |
| Risk | LOW |
| Status | **IMPLEMENTED + QA PASSED (iteration 11, 2026-06-18)** |
| Parent | DELIVERY_CHARGE_GATING CR (D-3 bucket) |

---

## Problem

The DELIVERY_CHARGE_GATING CR (D-3) planned to read the delivery GST rate from a **delivery-specific backend key** (`delivery_charge_tax`). At implementation time, the POS API `/web/restaurant-info` did **not expose** that field. The implementer used `restaurant.gst_tax_percent` (the general item GST rate) as a workaround.

The POS API now has (or will have) a field **`delivery_charge_gst`** for the delivery-specific rate.

### Current code (`ReviewOrder.jsx:684`)
```js
const deliveryGstRate = parseFloat(restaurant?.gst_tax_percent) || 0;
```

### Required behaviour (owner-confirmed)
```js
const deliveryGstRate = parseFloat(restaurant?.delivery_charge_gst)
                        || parseFloat(restaurant?.gst_tax_percent)
                        || 0;
```

**Priority chain:**
1. `delivery_charge_gst` — delivery-specific rate from POS ← **preferred**
2. `gst_tax_percent` — general item GST rate ← **fallback** (preserves current behaviour when delivery-specific key absent)
3. `0` — safe default (no GST on delivery)

### Impact
- Restaurants WITH `delivery_charge_gst` set → delivery GST uses the correct delivery-specific rate (may differ from item GST)
- Restaurants WITHOUT `delivery_charge_gst` → **no change** — falls back to `gst_tax_percent` (exactly what code does today)
- Restaurants with neither field → delivery GST = 0

---

## Owner Decisions

| # | Decision | Date |
|---|---|---|
| 1 | Backend key name is `delivery_charge_gst` | 2026-06-17 |
| 2 | If `delivery_charge_gst` is absent, fall back to `gst_tax_percent` (general item GST) | 2026-06-17 |
| 3 | If both absent, delivery GST = 0 | 2026-06-17 (inherited from D-4 rule) |

---

## Files affected

| File | Change |
|---|---|
| `frontend/src/pages/ReviewOrder.jsx` line 684 | 1 line — add `delivery_charge_gst` as preferred source with `gst_tax_percent` fallback |

---

## Constraints
- Do NOT change any other delivery/SC/tax logic
- Do NOT touch `OrderSuccess.jsx` (D-8 still deferred)
- Do NOT touch `orderService.ts` or `helpers.js`
- Fallback chain is mandatory — never remove `gst_tax_percent` fallback
- All downstream math (`deliveryCgst`, `deliverySgst`, `finalCgst`, `finalSgst`, UI rows) automatically uses the corrected rate — no other changes needed

---

*Registered: 2026-06-17 | Updated: 2026-06-17 | Status: PLANNING COMPLETE*
