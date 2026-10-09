# CR-2026-06-17-004 — Impact Analysis & Implementation Plan

**Stage:** Impact Analysis + Implementation Plan
**Risk:** LOW
**Status:** IMPLEMENTED + QA PASSED (iteration 11, 2026-06-18)

---

## 1. PROBLEM

`ReviewOrder.jsx:684` reads delivery GST rate from `restaurant.gst_tax_percent` (the general item GST rate). The POS API has (or will have) a delivery-specific field `delivery_charge_gst`. The code should **prefer** the delivery-specific key and **fall back** to the general rate when absent.

### Current code (line 684)
```js
const deliveryGstRate = parseFloat(restaurant?.gst_tax_percent) || 0;
```

### Target code
```js
const deliveryGstRate = parseFloat(restaurant?.delivery_charge_gst) || parseFloat(restaurant?.gst_tax_percent) || 0;
```

---

## 2. DATA FLOW TRACE

### Where `restaurant` comes from
```
ReviewOrder.jsx:107  →  const { restaurant } = useRestaurantDetails(restaurantId);
useMenuData.js:323   →  useRestaurantDetails(identifier) → getRestaurantDetails(identifier)
restaurantService.js →  POST to /web/restaurant-info with { restaurant_web: restaurantId }
POS API              →  https://preprod.mygenie.online/api/v1/web/restaurant-info
```

The `restaurant` object is the **raw POS API response**. If POS returns `delivery_charge_gst`, it will be available as `restaurant.delivery_charge_gst`.

### Where `deliveryGstRate` flows downstream (ALL automatic, no changes needed)

```
deliveryGstRate (line 684)
  → applyDeliveryGst (line 685) — gate: includeDelivery && isGstEnabledForSc && rate > 0 && charge > 0
    → gstOnDeliveryCharge (line 686) — effectiveDeliveryCharge * deliveryGstRate / 100
      → deliveryCgst (line 687) — half of gstOnDeliveryCharge
      → deliverySgst (line 688) — half of gstOnDeliveryCharge
        → finalCgst (line 702) — adjustedCgst + scCgst + deliveryCgst
        → finalSgst (line 703) — adjustedSgst + scSgst + deliverySgst
          → finalTotalTax (line 705)
            → totalToPay (line 710)
              → roundedTotal (line 712)
                → UI Grand Total + all 5 placeOrder/updateCustomerOrder call sites

UI display (lines 1840-1851):
  → "CGST on Delivery X%" — uses deliveryGstRate for label
  → "SGST on Delivery X%" — uses deliveryGstRate for label
  → Values from deliveryCgst / deliverySgst
```

**All downstream consumers read `deliveryGstRate`, `deliveryCgst`, `deliverySgst`.** Changing the source of `deliveryGstRate` at line 684 automatically propagates everywhere. **Zero additional code changes required.**

---

## 3. IMPACT MATRIX

### 3.1 Restaurants WITH `delivery_charge_gst` in POS response

| Scenario | Before (current) | After (fix) |
|---|---|---|
| `delivery_charge_gst = 5`, `gst_tax_percent = 5` | deliveryGstRate = 5 | deliveryGstRate = 5 | **No change** |
| `delivery_charge_gst = 12`, `gst_tax_percent = 5` | deliveryGstRate = 5 ← **WRONG** | deliveryGstRate = 12 ← **CORRECT** |
| `delivery_charge_gst = 0`, `gst_tax_percent = 5` | deliveryGstRate = 5 | deliveryGstRate = 5 (fallback) | **No change** |

### 3.2 Restaurants WITHOUT `delivery_charge_gst` in POS response

| Scenario | Before | After |
|---|---|---|
| `delivery_charge_gst` absent, `gst_tax_percent = 5` | deliveryGstRate = 5 | deliveryGstRate = 5 (fallback) | **No change** |
| Both absent | deliveryGstRate = 0 | deliveryGstRate = 0 | **No change** |

### 3.3 Non-delivery orders (dine-in, takeaway, room)

| Scenario | Before | After |
|---|---|---|
| Any non-delivery order | `includeDelivery = false` → `applyDeliveryGst = false` → delivery GST = 0 | **Identical** — `deliveryGstRate` value is irrelevant when gate is false |

### 3.4 Restaurant 716 (multi-menu, protected)

| Scenario | Before | After |
|---|---|---|
| 716 any order type | No delivery flow for 716 | **Identical** — 716 is room/dine-in only; `includeDelivery = false` always |

**VERDICT: Zero regression for any restaurant that doesn't have `delivery_charge_gst` set. Behaviour changes ONLY for restaurants where POS provides a different delivery GST rate than the general item rate.**

---

## 4. EXACT CHANGE SET

### File: `frontend/src/pages/ReviewOrder.jsx`

**Lines 678-684 — REPLACE comment + rate line:**

FROM:
```jsx
  // ─── Delivery GST (DELIVERY_CHARGE_GATING CR D-3) ─────
  // Per stakeholder decision (2026-05-06): backend response does NOT expose
  // restaurant.delivery_charge_tax. Use existing restaurant.gst_tax_percent (verified
  // present in /restaurant-info response, e.g., "5.00"). Same rate as item-GST.
  // Gated by gst_status (R3), includeDelivery (D-2), rate > 0, delivery > 0.
  // Folds into total_gst_tax_amount via finalCgst/finalSgst — no new payload field.
  const deliveryGstRate     = parseFloat(restaurant?.gst_tax_percent) || 0;
```

TO:
```jsx
  // ─── Delivery GST (DELIVERY_CHARGE_GATING CR D-3, updated CR-2026-06-17-004) ─────
  // Priority chain: prefer delivery-specific rate from POS (delivery_charge_gst),
  // fall back to general item GST rate (gst_tax_percent), else 0.
  // Gated by gst_status (R3), includeDelivery (D-2), rate > 0, delivery > 0.
  // Folds into total_gst_tax_amount via finalCgst/finalSgst — no new payload field.
  const deliveryGstRate     = parseFloat(restaurant?.delivery_charge_gst) || parseFloat(restaurant?.gst_tax_percent) || 0;
```

**Net: 1 file, 7 lines replaced (6 comment + 1 code), 6 new lines (5 comment + 1 code). Zero net logic change beyond the rate source.**

No other files touched.

---

## 5. ACCEPTANCE TESTS

| # | Test | Setup | Expected |
|---|---|---|---|
| T1 | Restaurant WITH `delivery_charge_gst` set to a value DIFFERENT from `gst_tax_percent` | POS has `delivery_charge_gst: "12"`, `gst_tax_percent: "5"` | Delivery GST rate = 12%, not 5%. UI rows show "CGST on Delivery 6%" / "SGST on Delivery 6%" |
| T2 | Restaurant WITH `delivery_charge_gst` set to SAME as `gst_tax_percent` | Both = "5" | Delivery GST rate = 5%. No visible change from today |
| T3 | Restaurant WITH `delivery_charge_gst = 0` | `delivery_charge_gst: "0"`, `gst_tax_percent: "5"` | Falls back to 5% (parseFloat("0") = 0, falsy → next in chain) |
| T4 | Restaurant WITHOUT `delivery_charge_gst` field | Field absent, `gst_tax_percent: "5"` | Falls back to 5%. **Identical to current behaviour** |
| T5 | Restaurant with NEITHER field | Both absent | Delivery GST = 0. **Identical to current behaviour** |
| T6 | Non-delivery order (dine-in) | Any restaurant | Delivery GST = 0 regardless of rate source. **Unchanged** |
| T7 | Non-delivery order (takeaway) | Any restaurant | Delivery GST = 0 regardless of rate source. **Unchanged** |
| T8 | Regression — dinein bill summary | Restaurant 478 | Byte-for-byte identical to today |
| T9 | Regression — 716 multi-menu | Restaurant 716 | Byte-for-byte identical to today |

**Note:** T1 can only be tested if a restaurant in preprod actually has `delivery_charge_gst` set to a value different from `gst_tax_percent`. If no such restaurant exists yet, T1 is validated by code review + T4 confirms fallback works.

---

## 6. RISK ANALYSIS

| Risk | Likelihood | Mitigation |
|---|---|---|
| `delivery_charge_gst` field not yet in POS response | POSSIBLE | `|| parseFloat(restaurant?.gst_tax_percent)` fallback → current behaviour preserved. Zero regression. |
| `delivery_charge_gst` returns a string like "5.00" | LIKELY | `parseFloat("5.00")` = 5. Already handled. |
| `delivery_charge_gst` returns null/undefined | POSSIBLE | `parseFloat(null)` = NaN, which is falsy → falls to next in chain. Safe. |
| Existing tests break | NONE | No test files reference `gst_tax_percent` for delivery GST. The change is in one runtime line. |
| Other files affected | NONE | All downstream consumers read `deliveryGstRate` variable, not the restaurant field directly. |

---

## 7. ROLLBACK

Revert the single line back to:
```js
const deliveryGstRate = parseFloat(restaurant?.gst_tax_percent) || 0;
```
One-line revert, zero side effects.

---

## 8. NOT IN SCOPE

- ❌ OrderSuccess.jsx (D-8 deferred)
- ❌ Backend/POS changes
- ❌ Any other tax/SC/delivery logic
- ❌ Adding `delivery_charge_gst` to backend config schema
- ❌ orderService.ts / helpers.js

---

*Planning complete | 2026-06-17 | Ready for owner approval → implementation*
