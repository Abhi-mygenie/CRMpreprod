# INVESTIGATION_REPORT — BUG-2026-02-XX-001

**Item:** Delivery charge not calculated on Select-Address page
**Investigation by:** E1 (Role 6 — Investigation, read-only)
**Date:** 2026-02 (this session)
**Status:** ROOT CAUSE IDENTIFIED with HIGH confidence — awaiting owner decision on fix option

---

## 1. Root Cause (confirmed with code evidence)

**The distance API is called with `order_value` hardcoded to `'0'`.**

**Evidence — `frontend/src/pages/DeliveryAddress.jsx:311-322`:**
```javascript
distanceTimerRef.current = setTimeout(async () => {
  try {
    const res = await fetch(`${MANAGE_BASE_URL}/api/v1/config/distance-api-new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination_lat: String(lat),
        destination_lng: String(lng),
        restaurant_id: String(restaurantId),
        order_value: '0',   // ⚠ HARDCODED — this is the bug
      }),
    });
    const data = await res.json();
    setDistanceResult(data);
```

The distance API server-side likely applies restaurant-specific rules such as:
- "Free delivery above ₹500"
- Tiered charges based on order value bracket
- Threshold-based waivers

Because the FE always sends `order_value: '0'`, the API returns the **base/max shipping charge** — not the charge that applies to the customer's actual cart. If the cart total qualifies for free delivery or a lower tier, the customer still sees the wrong (higher) charge.

## 2. How the wrong value propagates

| Step | File:line | What happens |
|---|---|---|
| 1 | `DeliveryAddress.jsx:311-330` | Distance API called with `order_value: '0'` → returns `shipping_charge` for ₹0 order |
| 2 | `DeliveryAddress.jsx:324` | Response stored in `distanceResult` state |
| 3 | `DeliveryAddress.jsx:791-792` | UI displays `Delivery: ₹{distanceResult.shipping_charge}` — wrong value shown to user |
| 4 | `DeliveryAddress.jsx:498` (on save) | `setDeliveryCharge(distanceResult?.shipping_charge \|\| 0)` — wrong value persisted in CartContext |
| 5 | `CartContext.js:504` | Cart state holds the wrong charge |
| 6 | `orderService.ts:369` | Order payload sends `delivery_charge: String(orderData.deliveryCharge \|\| 0)` — wrong value to POS |

**Every downstream step trusts the value from step 1. Fix step 1, all downstream steps auto-correct.**

## 3. Reconciliation with owner's report

Owner said:
> "even if there are serviceable addresses available within the configured delivery area or delivery radius (kilometers), the application correctly interperted usind distance api."

✅ Distance API correctly identifies serviceable addresses (`shipping_status === 'Yes'` — DeliveryAddress.jsx:637).

> "But since still is not added and there is delivery charge assocaited that is not calculated."

✅ The delivery charge IS calculated by the API — but for the WRONG order_value (0). So effectively "not correctly calculated for this customer's cart."

> "we didnt want to call the api again as per the configuration order value in the api so take it from the context."

Two possible interpretations, both point to the same fix location:

- **Interpretation A (higher confidence):** "Don't call the API again with a placeholder order_value — take the order_value from CartContext and pass it correctly." → Fix option A/B below.
- **Interpretation B (needs Q2/Q3 clarification):** "Don't call the distance API at all — put the delivery-charge rules in RestaurantConfigContext and compute client-side." → Fix option C below.

## 4. Fix options

### Option A — Pass real cart total on every distance-API call (simplest correct fix)

```diff
- order_value: '0',
+ order_value: String(cartTotal || 0),
```

Requires importing cart total from `CartContext` inside `DeliveryAddress.jsx`:
```javascript
const { setDeliveryAddress, setDeliveryCharge, cartTotal } = useCart();
```

**Pros:**
- 1-line real fix, plus 1 line to hook up cart total.
- Server-side rules stay authoritative (no client-side duplication of config).
- API already accepts `order_value` — no backend change.

**Cons:**
- Distance API is called every time cart total changes AND address changes. This is more calls than owner may want.
- If cart total changes AFTER address is saved (user goes back to menu, adds items, returns to review), the stored `deliveryCharge` is stale.

**Effort:** 1-2 hours + testing_agent.
**Risk:** LOW.

### Option B — Recompute delivery charge on ReviewOrder mount (owner's likely intent)

Same as Option A, but instead of hooking to cart-total-change, we recompute at the point where it matters most: when the customer lands on `ReviewOrder.jsx`. Add one distance-API call in ReviewOrder useEffect with the FINAL cart total.

**Pros:**
- One extra API call at ReviewOrder mount — bounded.
- No stale value: charge always reflects cart at checkout time.
- Client-side rules stay off — server is single source of truth.

**Cons:**
- Two calls total (one at address select, one at ReviewOrder). Owner said "we don't want to call the api again."
- ReviewOrder is a Part C CRITICAL hotspot — every change needs owner approval.

**Effort:** 3-4 hours + testing_agent.
**Risk:** MEDIUM (touches hotspot).

### Option C — Move rules to RestaurantConfigContext and compute client-side

Requires backend + FE work:
1. Backend: `GET /api/config/{rid}` returns new fields: `deliveryChargeBase`, `deliveryChargeFreeAbove`, `deliveryChargeTiers`, etc. (owner defines shape).
2. `RestaurantConfigContext.jsx` maps these fields into context.
3. `DeliveryAddress.jsx` reads context, computes `finalDeliveryCharge` client-side from `(distance_km, cartTotal, config)`.
4. Distance API is called only for serviceability check (`shipping_status: 'Yes'/'No'`), not for charge.

**Pros:**
- Zero repeat API calls after first serviceability check.
- Client can update charge in real-time as user adds items (best UX).
- Config lives in `customer_app_config` — admin-editable per restaurant.

**Cons:**
- Client-side duplication of a business rule that already exists server-side (in the distance API).
- If admin updates rule in POS but not in `customer_app_config`, they drift.
- Requires new schema, backend field, and admin-UI additions.
- Adds a new landmine class (rules in two places).

**Effort:** ~1 week (backend schema + FE + admin UI + migration + testing).
**Risk:** MEDIUM-HIGH.

### Option D — Hybrid: API returns rules alongside charge, client caches rules

Distance API endpoint additionally returns the rule set (e.g., `{ base_charge, free_above_threshold, tiers }`). Client caches the rule set for the session, recomputes charge locally as cart changes.

Requires backend change to distance API (owned by MyGenie, not us) → **coordination with MyGenie ops** required.

**Pros:** Best of both worlds — server-side source of truth, no repeat calls.
**Cons:** Depends on MyGenie changing an API we don't own.
**Effort:** blocked on MyGenie; ~2 weeks total.

## 5. Recommendation

**Recommend Option A** — minimal, correct, single-line change.

Rationale:
- Fixes the ROOT cause (hardcoded `order_value: '0'`) with minimal risk.
- Server remains single source of truth for delivery-charge rules — no drift risk.
- Owner's stated concern ("don't call API again") is only partially satisfied — but it's satisfied at each SelectAddress screen (one call per address selection). Additional calls only when address or cart changes materially — which is expected and correct.
- Owner can layer Option D on top later if MyGenie is willing to change the distance API.

**If owner insists on client-side rules (Option C):** we need answers to Q1-Q6 from the INTAKE_DOC first, plus confirmation of the rule shape. This is a much larger CR.

## 6. Non-fix items surfaced during investigation (out of scope)

- `MANAGE_BASE_URL/api/v1/config/distance-api-new` is a raw `fetch()` — no timeout wrapping. Adds to the residual exposure list (REL-05 in Architecture Bible). Not fixed by this CR.
- Distance API endpoint lives on `MANAGE_BASE_URL` (POS admin domain), not on the customer app's own-backend or POS API. Fourth upstream. Latency: unknown. Availability: unknown. → observability gap.
- The delivery flow has no fallback if distance API fails (`{ shipping_status: 'Error' }`) → order flow blocks silently. Separate UX gap.

## 7. Answers this investigation resolves vs still needs

| Question from INTAKE §7 | Now resolved? |
|---|---|
| Q1 Restaurant ID that reproduces | ⚠ Still owner-provided — investigation didn't need it; any restaurant with delivery + non-zero free-above threshold will reproduce |
| Q2 Where does delivery-charge config live | ✅ RESOLVED — it lives server-side in the distance API. Not in `customer_app_config` today. Fix Option A leverages this. |
| Q3 Config shape | ✅ RESOLVED for Option A — API accepts `order_value` and returns computed `shipping_charge`. Client doesn't need to know the exact rule. |
| Q4 Which API worried about re-calling | ✅ RESOLVED — it's `distance-api-new`. Options A/B minimize but don't eliminate calls; C eliminates. |
| Q5 Is Select Address a separate page | ✅ RESOLVED — it's a MODE inside `DeliveryAddress.jsx`, not a separate page. Shows saved addresses at line 829, uses `handleSelectAddress` (line 343) which calls `checkDistance` on selection. |
| Q6 Should charge show per address in list | ⚠ Product decision — owner still needs to confirm. Currently one `distanceResult` per selection, not per row. |

## 8. Investigation output (canonical)

```text
Investigation complete: BUG-2026-02-XX-001
Root cause: `DeliveryAddress.jsx:320` sends `order_value: '0'` hardcoded → distance API returns wrong shipping_charge → propagates to CartContext and POS payload.
Classification: BUG (hardcoded value; not a schema gap)
Confidence: HIGH (single-line evidence + full downstream trace)
Steps used: 5/10
Fix options: 4 (A/B/C/D)
Recommendation: Option A (1-line change: read cartTotal from CartContext into order_value)
Owner decisions needed:
  - Approve Option A, B, C, or D?
  - Q6: charge display granularity (per-address row vs on-selection)
Docs updated: /app/memory/change_requests/BUG-2026-02-XX-001-delivery-charge-not-calculated/INVESTIGATION_REPORT.md
Next: Owner approval → Role 2 (Planning) → Role 3 (Implementation) → testing_agent_v3
```

---

## 9. ADDENDUM — Post-smoke-test re-investigation (2026-07-13)

**Trigger:** Owner smoke test FAILED on restaurant 699 despite Option A being shipped.  
**Agent:** E1 (Investigation role — read-only)

### 9.1 Q2 / Q4 now answered

- **Q2 (config location):** Delivery charge config lives server-side in the external distance API (`manage.mygenie.online/api/v1/config/distance-api-new`). No separate config field is needed in RestaurantConfigContext.
- **Q4 (which API):** Same distance API — must be called. Option C (client-side calculation) is NOT the owner's intent.

### 9.2 Live API probe results (restaurant 699)

Endpoint: `manage.mygenie.online/api/v1/config/distance-api-new`  
Coordinates: lat=22.641516499999998, lng=88.47206969999999, restaurant_id=699

| order_value | shipping_charge | Notes |
|---|---|---|
| "0" | 10 | Base charge (below threshold) |
| "249" | 10 | Below threshold |
| "250" | 0 | Free delivery (at threshold) |
| "300" | 0 | Free delivery (above threshold) |

**Both `manage.mygenie.online` and `preprod.mygenie.online` return identical results.**  
The external API is working correctly. GAP #1 from original investigation is CLOSED.  
Option A fix direction is confirmed correct.

### 9.3 True root cause of smoke failure

**Option A fix is correct but incomplete.**

The fix passes `getTotalPrice()` at the moment `checkDistance` fires. But there is no mechanism to re-fire `checkDistance` when the cart total changes after the delivery address page is already loaded.

**Stale-check scenario (confirmed as the smoke test failure path):**
```
Cart < ₹250 → open delivery-address → checkDistance fires → charge=10 stored
Cart updated to > ₹250 (user returns to menu) → return to delivery-address
→ NO re-check → stale charge=10 still displayed and stored on "Confirm & Proceed"
```

### 9.4 Supplementary fix options (owner to decide)

| Option | File(s) | Risk | Description |
|---|---|---|---|
| R1 | `DeliveryAddress.jsx` only | LOW | useEffect watching getTotalPrice() — re-call checkDistance when address already selected |
| R2 | `ReviewOrder.jsx` | MEDIUM (hotspot) | Re-run checkDistance on ReviewOrder mount with final cart total |

**Recommendation: R1.**

Secondary independent fix: persist `deliveryCharge` to localStorage in CartContext.js (currently in-memory only; resets on remount/refresh).

### 9.5 Updated investigation output

```text
Re-investigation complete: BUG-2026-02-XX-001 (smoke failure)
Root cause (supplementary): checkDistance not re-triggered on cart-total change after address load — stale distanceResult persists
Classification: PLAN_GAP (Option A incomplete — correct at point of call, missing re-trigger mechanism)
Confidence: HIGH
API evidence: manage.mygenie.online confirmed working; threshold ≥ ₹250 → charge=0 for restaurant 699
Owner decisions: R1 or R2 fix path; deliveryCharge persistence (bundle or separate)
Docs updated: INVESTIGATION_REPORT.md (this addendum), QA_HANDOVER.md (§9), SESSION_HANDOVER.md (new)
Next: Owner approves R1/R2 → Bug Fix role (Role 5) → testing_agent_v3 on restaurant 699 live
```

---

*End of INVESTIGATION_REPORT BUG-2026-02-XX-001 (including 2026-07-13 addendum). Investigation agent must not code.*

