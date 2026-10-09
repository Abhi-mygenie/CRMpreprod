# QA REPORT — CR-2026-09-07-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-07-001 |
| **Title** | Inventory stock-out control — FE three-layer defence |
| **QA Date** | 2026-09-08 |
| **QA Method** | Automated — testing subagent (iteration_2.json) + live API probes |
| **Test Report** | `/app/test_reports/iteration_2.json` |
| **QA Result** | **PASS** |
| **Gate Status** | **QA CLOSED ✅** |

---

## 1. Verification Matrix Results

All 21 verification items from the Implementation Plan executed and passed.

| ID | Description | Result |
|----|-------------|--------|
| V-1 | `useMenuData.js` maps `stock_out: item.stock_out \|\| 'N'` at line 110 | PASS |
| V-2 | `MenuItem.jsx` sold-out badge present in both no-image and image layouts (correct `data-testid`) | PASS |
| V-3 | Live test — restaurant 478: 136 items loaded, 0 sold-out badges (all `stock_out=N`) | PASS |
| V-4 | Live test — restaurant 478: 136 ADD buttons visible, 0 JS errors | PASS |
| V-5 | `CartContext.js` stock-out guard at lines 228–232: fires AFTER channel guard, BEFORE `setCart()` | PASS |
| V-6 | Live test — restaurant 478: `cheese` addon in `jainss` item — `disabled=true`, `aria-disabled=true`, sold-out pill with `data-testid="customize-addon-sold-out-pill"` | PASS |
| V-7 | Addon variations (30ML/60ML) radio buttons fully interactive, Add To Cart button functional | PASS |
| V-8 | `ReviewOrder.jsx` pre-submission cache-check exists at lines 986–1029 | PASS |
| V-9 | Pre-submission check returns BEFORE `isPlacingOrderRef.current = true` (line 1036) | PASS |
| V-10 | `orderService.ts` — `placeOrder` 422 detection correct: only `isStockOut` when `status===422 AND out_of_stock_items.length>0` | PASS |
| V-11 | `orderService.ts` — `updateCustomerOrder` 422 detection correct: same pattern | PASS |
| V-12 | `ReviewOrder.jsx` catch branch order: 1) `isTrueNetworkLoss` (line 1469), 2) `status===401` (line 1475), 3) `error.isStockOut` (line 1616), 4) `else` (line 1632) | PASS |
| V-13 | Live test — successful order flow: ReviewOrder page renders, Place Order button visible and tappable | PASS |
| V-14 | Live test — restaurant 716 regression: 85 items loaded, add-to-cart works, room-selection menu flow intact | PASS |
| V-15 | `isTrueNetworkLoss` branch is FIRST in catch — unchanged, unaffected | PASS |
| V-16 | `status===401` retry branch is SECOND in catch — unchanged, unaffected | PASS |
| V-17 | No JS errors on menu load or cart operations | PASS |
| V-18 | `MenuItems.jsx` filter: `stock_out` filter is AFTER `isItemAvailable`, only filters `stock_out==='Y'` (lines 397–402) | PASS |
| V-19 | `food_stock=0` items NOT filtered (filter only checks `stock_out!=='Y'`) | PASS |
| V-20 | `isStockOut` catch branch has NO `clearCart()`, NO `navigate()` — cart preserved | PASS |
| V-21 | Types complete: `StockOutFoodItem`, `StockOutAddonItem`, `ApiPlaceOrderResponse.out_of_stock_items?`, `ApiProductAddon.stock_out?`, `ApiRestaurantInfoResponse.show_out_of_stock_items?` | PASS |

**Total: 21/21 PASS. 0 FAIL. 0 BLOCKER. 0 MAJOR.**

---

## 2. Regression Results

| Area | Result | Evidence |
|------|--------|----------|
| `AuthContext` — no stock-out references | PASS | Code grep: no `stock_out` in AuthContext |
| `RestaurantConfigContext` — no stock-out references | PASS | Code grep: no `stock_out` in RestaurantConfigContext |
| `LandingPage` — no stock-out references | PASS | Code grep: confirmed |
| `App.js` — no stock-out references | PASS | Code grep: confirmed |
| `endpoints.js` — no stock-out references | PASS | Code grep: confirmed |
| `orderService.ts` — non-422 errors still throw normally | PASS | Code path confirmed |
| Restaurant 716 hardcoded logic — unchanged | PASS | V-14 live test + code inspection |
| Order success navigation — unchanged | PASS | V-13 live test |
| Network-loss guard — unchanged | PASS | V-15 code inspection |
| 401 retry path — unchanged | PASS | V-16 code inspection |

---

## 3. QA Notes

### NOTE-1 (Carry-Forward — not introduced by this CR)

**File:** `src/components/MenuItem/MenuItem.jsx`
**Location:** `actionArea` block — no-image layout ADD button condition (line ~165)
**Observation:** ADD button condition is `isAvailable && isOnlineOrderEnabled` but OMITS `isChannelAllowed`.
The image layout ADD button (line ~235) correctly includes `isChannelAllowed`.
This is a minor defence-in-depth gap that pre-exists this CR.
**Severity:** MINOR — does not affect stock-out functionality; not introduced by CR-2026-09-07-001.
**Status:** Carried forward. Filed as **CR-2026-09-08-001**.
**Action:** No code change by QA. Tracked separately.

---

## 4. QA Output

```
QA complete: CR-2026-09-07-001 — Inventory stock-out control FE three-layer defence
Result: PASS
Tests: 21 total, 21 pass, 0 fail
Failures: none
Coverage: 8/8 implementation files verified
Regression: clean (AuthContext, RestaurantConfigContext, LandingPage, App.js, endpoints.js, restaurant 716)
Registry: SYNCED
Report: /app/test_reports/iteration_2.json
Gate: QA CLOSED ✅
Next: Owner smoke / acceptance (optional) → Closure
```
