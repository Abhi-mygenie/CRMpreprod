# QA_HANDOVER — BUG-2026-02-XX-001

**Title:** Delivery charge not calculated on Select-Address page — FIX SHIPPED BUT SMOKE FAILED
**Status:** ❌ OWNER SMOKE TEST FAILED (2026-07-13) — root cause identified, awaiting owner decision on supplementary fix
**Testing report:** `/app/test_reports/iteration_2.json` (100% static PASS, 0 issues raised)
**CR ancestor:** `INVESTIGATION_REPORT.md` → Option A selected (recommended)
**Smoke failure report:** `SESSION_HANDOVER.md` (2026-07-13) + `INVESTIGATION_REPORT.md §8 (addendum)`

---

## 1. What shipped

Root cause was `frontend/src/pages/DeliveryAddress.jsx:320` sending `order_value: '0'` hardcoded to the distance API, causing wrong `shipping_charge` returned for every cart. Fix passes actual cart total.

| File | Lines touched | Change |
|---|---|---|
| `frontend/src/pages/DeliveryAddress.jsx` | 50, 320, 331 | 3 line edits, all marked `// BUG-2026-02-XX-001` |

**Diff:** +3 / −3 LOC, 1 file changed, no other files touched.

```diff
- const { setDeliveryAddress, setDeliveryCharge } = useCart();
+ const { setDeliveryAddress, setDeliveryCharge, getTotalPrice } = useCart();

  body: JSON.stringify({
    destination_lat: String(lat),
    destination_lng: String(lng),
    restaurant_id: String(restaurantId),
-   order_value: '0',
+   order_value: String(getTotalPrice() || 0),
  }),

- }, [restaurantId]);
+ }, [restaurantId, getTotalPrice]);
```

## 2. What testing_agent verified (static — 100% PASS)

| Assertion | Result |
|---|---|
| `order_value: '0'` hardcoded string removed | ✅ PASS |
| `String(getTotalPrice() \|\| 0)` present exactly once at line 320 | ✅ PASS |
| `getTotalPrice` destructured from `useCart()` at line 50 | ✅ PASS |
| `getTotalPrice` in `useCallback` dep array at line 331 | ✅ PASS |
| `BUG-2026-02-XX-001` code marker appears 3× | ✅ PASS |
| `getTotalPrice` is a stable `useCallback` in CartContext.js:359 | ✅ PASS (verified safe as hook dep) |
| `/478/menu` renders normally (regression) | ✅ PASS (145 ADD buttons, all APIs 200) |
| Customer capture flow at `/478` intact (regression) | ✅ PASS |
| No unrelated files modified | ✅ PASS (`git diff --stat` shows only DeliveryAddress.jsx) |

## 3. Test that couldn't run (environment limitation, not a defect)

**Network capture on live wire** — verifying the actual outgoing POST body's `order_value` field carries the real cart total. Reason: the `/478/delivery-address` route is gated by the phone/name capture step, and Google Maps doesn't initialize under headless with the domain-restricted API key.

Testing agent noted this in `context_for_next_testing_agent` — a real device or a proper E2E harness with a valid phone can complete this test. Static verification is the fallback explicitly permitted in the review request.

## 4. Owner smoke checklist (2 minutes on your device)

1. Open `https://mygenie-fullstack.preview.emergentagent.com/478` — enter phone + name → BROWSE MENU
2. Add 2-3 items to cart (any items)
3. Navigate to delivery address flow
4. Open browser DevTools → Network tab → filter "distance-api-new"
5. Pick an address on the map
6. In the intercepted request, check the POST body:
   - **BEFORE fix:** `"order_value":"0"` (wrong)
   - **AFTER fix:** `"order_value":"<real cart subtotal, e.g. 250>"` ✅
7. Verify the returned `shipping_charge` in the response is now the correct one for your cart size (e.g., if restaurant has "free delivery above ₹500" and cart is ₹600, `shipping_charge` should be 0).

## 5. Landmines confirmed untouched

- ⚠ Restaurant 716 hardcode (GAP-016) — not touched.
- ⚠ Restaurant 699 takeaway ₹10 (GAP-021 / CR-2026-02-XX-002) — **explicitly not touched per owner instruction**.
- ⚠ Provider stack, localStorage keys, payment_method hardcode, CartContext state — all untouched.
- ⚠ Distance API endpoint URL, POST payload shape (other fields) — untouched.

## 6. Rollback

`git revert <sha>` on `DeliveryAddress.jsx` → frontend hot-reloads → done in <60 s.

## 7. Testing agent's optional advisory (not blocking)

> "Consider debouncing distance-api-new calls if `getTotalPrice` changes on every cart mutation — could produce a burst of calls if the user rapidly increments/decrements cart quantities while on the delivery-address page. Not part of this bug fix."

The existing 500 ms debounce in `checkDistance` (line 305 setTimeout) already covers this. Only the `useCallback` re-forms on cart-item change; the actual API call still fires only after 500 ms of quiet.

## 8. Follow-up items (out of scope for this CR)

- BUG-2026-02-XX-001 clarification Q6 (product decision) — do we show charge per-address in the saved-addresses list, or only after selection? Still pending owner input; current behavior is unchanged by this fix.
- The `manage.mygenie.online/api/v1/config/distance-api-new` `fetch()` has no client-side timeout — still on the residual REL-05 list from Architecture Bible.
- CR-2026-02-XX-002 (Rest 699 takeaway ₹10) — **untouched per owner instruction**. Awaiting owner clarification on where the `takeaway_charge` field actually lives (per BACKEND_VALIDATION_ADDENDUM).

---

## 9. SMOKE TEST RESULT (2026-07-13) — FAILED

**Owner:** owner@brew.com  
**Restaurant:** 699  
**Test condition:** Order value > ₹250, distance < 2 km  
**Expected:** delivery charge = ₹0  
**Actual:** delivery charge = ₹10 still shown  
**Verdict:** ❌ FAIL

### Root cause of smoke failure (confirmed via live API probe)

The external API (`manage.mygenie.online/api/v1/config/distance-api-new`) is working correctly. Live probe confirmed:

| order_value | shipping_charge |
|---|---|
| "0" | 10 |
| "249" | 10 |
| "250" | 0 |
| "300" | 0 |

The fix (Option A) sends the correct cart total at the time `checkDistance` fires. The gap is that **`checkDistance` is never re-triggered when the cart total changes after the delivery address page has already loaded.** If the owner added items to the cart to cross ₹250 AFTER viewing the delivery address page, the stale `distanceResult` (with `shipping_charge=10`) remains until an address-level event (re-select, drag, GPS) forces a new check.

Full analysis: `SESSION_HANDOVER.md §2.3`

### Owner decision required before next fix

Choose one:

- **Option R1:** Add `useEffect` in `DeliveryAddress.jsx` watching `getTotalPrice()` — re-call `checkDistance` when cart total changes and an address is already selected. Risk: LOW.
- **Option R2:** Re-run distance check on `ReviewOrder.jsx` mount with final cart total. Risk: MEDIUM (hotspot file — needs explicit owner approval).

**Recommendation: R1.**

Secondary fix (independent): persist `deliveryCharge` to localStorage in CartContext.js.

---

*End of QA Handover (updated 2026-07-13 — smoke failed, root cause documented).*

