# INTAKE_DOC — BUG-2026-02-XX-001

**Title:** Delivery charge not calculated on Select-Address page even when address is serviceable
**Registered:** 2026-02 (this session)
**Reporter:** Owner (verbal report)
**Intake by:** E1 (Role 1 — Intake, read-only)

---

## 1. Report as received (verbatim)

> "The issue occurs in the Delivery flow when a customer enter the phone number. After entering the number, the application navigates to the Add Address page and then to the Select Address page.
> In this scenario, even if there are serviceable addresses available within the configured delivery area or delivery radius (kilometers), the application correctly interperted usind distance api.
> But since still is not added and there is delivery charge assocaited that is not calculated. we didnt want to call the api again as per the configuration order value in the api so take it from the context."

## 2. Owner intent (Intake interpretation — pending confirmation)

Best-effort reconstruction of the report:

- **Symptom observed:** On the Select-Address page (after phone entry → Add Address → Select Address), even when the distance API returns a serviceable address (within `delivery radius (km)` config), the **delivery charge is not calculated / not displayed**.
- **Root cause hypothesis (owner's):** The delivery-charge calculation depends on a configuration keyed to *order value* (e.g., "free delivery above ₹500" or tiered charges by order subtotal). That configuration is currently fetched via a separate API call, which we do NOT want to re-fire.
- **Owner's desired fix:** Read the delivery-charge configuration from the **already-loaded React context** (`RestaurantConfigContext` — which holds the ~80-key restaurant config, cached in localStorage and refreshed on QR entry). Compute the delivery charge client-side using the picked address's `distance_km` + the order subtotal from CartContext, without hitting any additional API.

⚠ **This interpretation MUST be confirmed by owner** — the report has 2 ambiguities flagged in §7 below.

## 3. Classification

| Field | Value |
|---|---|
| Type | **BUG** — a partially-implemented feature that manifests as a defect for delivery customers |
| Sub-type | Business-logic gap + client-side integration gap |
| Feature area | Delivery Address Flow (Alpha v0.1 Part B §5.6 — flagged "partially implemented") |
| Severity | **P1** — core delivery flow broken; no good workaround (customer cannot see charge → cannot decide to place order) |
| Risk of fix | **MEDIUM** — touches `DeliveryAddress.jsx` (1,047 LOC) + `CartContext.js` + `RestaurantConfigContext` — three high-cohesion state layers |
| Priority (business) | Depends on % of orders that go through Delivery vs Dine-in. Owner to confirm. |
| Blast radius | **MEDIUM** — affects all delivery customers across all restaurants that use delivery |

## 4. Duplicate / prior-art check

| Source | Result |
|---|---|
| `/app/memory_repo/BUG_TRACKER_v2.md` | No existing entry mentioning delivery-charge or delivery-address bugs. **DISTINCT.** |
| `/app/memory/change_requests/` — grep for "deliver" | 0 hits. No prior CR touches this. |
| `/app/memory_repo/change_requests/` — grep for "deliver" | 0 hits. |
| Alpha v0.1 Part B §5.6 | **RELATED — pre-existing acknowledgement:** "Delivery Address Flow — Partially implemented. External service contract dependencies for delivery charges and zone validation." |
| Alpha v0.1 Part B §13-9 | **RELATED — pre-existing open unknown:** delivery zone validation and delivery-charge calculation listed as unknowns. |
| Architecture Bible 2026-02 | Not covered explicitly (this bug is a business-logic gap, not an architectural one). |

**Verdict:** DISTINCT bug, but RELATED to two prior known-gap acknowledgements. This intake formally converts a known unknown into a P1 bug ticket.

## 5. Evidence captured

| Item | Source | State |
|---|---|---|
| Owner verbal description | this session | ✅ captured verbatim (§1) |
| Screen recording / video | — | ❌ **NOT PROVIDED** — request from owner |
| Screenshot of "Select Address" page missing charge | — | ❌ **NOT PROVIDED** — request from owner |
| Restaurant ID + address(es) that reproduce | — | ❌ **NOT PROVIDED** — request from owner |
| Console log during reproduction | — | ❌ **NOT PROVIDED** — request from owner |
| Order ID (if any test order placed) | — | ❌ N/A per report — order not completed because charge doesn't show |
| Code inspection (existing state) | `DeliveryAddress.jsx`, `CartContext.js`, `RestaurantConfigContext.jsx` | ✅ done — see §6 |

## 6. Code reality (Intake read-only inspection)

### 6.1 Distance API — already integrated

**File:** `frontend/src/pages/DeliveryAddress.jsx`
**Lines:** 297-328
**What it does today:**
```javascript
// Debounced distance check — fires on lat/lng change
const checkDistance = useCallback((lat, lng) => {
  // ... 400 ms debounce ...
  const res = await fetch(`${MANAGE_BASE_URL}/api/v1/config/distance-api-new`, { ... });
  const data = await res.json();
  setDistanceResult(data);
  // data shape: { shipping_status, shipping_charge, shipping_time, distance_km }
}, [...]);
```

**Observation:** The distance API **does return `shipping_charge`** in its payload. So one raw charge value is available per-address. The gap is either:
- (a) `shipping_charge` from distance API is not being persisted / applied to `setDeliveryCharge()` in CartContext
- (b) The FINAL delivery charge depends on additional business rules (e.g., "waive if order subtotal >= X") that live in `RestaurantConfigContext` and are not applied at Select Address time

The owner's report explicitly points at scenario (b) — "delivery charge associated ... take it from the context [not re-fetched API]." So the bug is likely: **the `shipping_charge` from distance API is not being reconciled with the free-delivery-threshold / tiered-charge rule from `RestaurantConfigContext`** on the Select Address page.

### 6.2 CartContext exposes `setDeliveryCharge`

**File:** `frontend/src/pages/DeliveryAddress.jsx:50`
**Line:** `const { setDeliveryAddress, setDeliveryCharge } = useCart();`

`CartContext` already exposes a `setDeliveryCharge` setter — plumbing exists. Whether it's actually **called** with the right value on Select Address flow needs verification.

### 6.3 RestaurantConfigContext — no explicit delivery-charge fields visible

**File:** `frontend/src/context/RestaurantConfigContext.jsx`
**Grep result:** Only `skipOtpDelivery` (line 128, 517) and `onlinePaymentDelivery` (line 143, 537). **No `deliveryCharge`, `deliveryChargeFreeAbove`, `deliveryChargeTiers`, `deliveryRadius`, or similar key visible in the defaults or the field mapper.**

**Implication:** If owner expects delivery-charge configuration (free-above threshold, tiers, etc.) to be present in `RestaurantConfigContext`, that config either:
- (a) Doesn't currently exist in the context and needs to be added (requires backend `GET /api/config/{rid}` to return those fields — which requires MyGenie POS/CRM/config admin UI to store them somewhere, or a new field in `customer_app_config` collection)
- (b) Is present but under a different key name — needs field-name confirmation

### 6.4 Existing "Add Address" vs "Select Address" flow

The report mentions two pages: **Add Address** → **Select Address**. `DeliveryAddress.jsx` at 1,047 lines appears to be a single component with multiple modes. Need to verify:
- Is "Select Address" a separate component or a mode of `DeliveryAddress.jsx`?
- Does `checkDistance()` get called for each address in the saved list, or only for a newly-picked map location?

Deferred to Planning-role code trace.

## 7. Clarifications needed (⚠ blocks Planning)

Before this CR can be planned, owner needs to answer:

| # | Question | Why it matters |
|---|---|---|
| Q1 | Which restaurant ID(s) reproduce this? Ideally 1-2 IDs I can test against. | Delivery config varies per restaurant. Can't reproduce without a live test target. |
| Q2 | Where exactly does "delivery charge configuration" live today? MyGenie POS config, `customer_app_config` in Mongo, or elsewhere? | Determines whether this CR needs backend work to expose the config, or just FE work to consume an existing field. |
| Q3 | What's the shape of the delivery-charge config? (a) flat fee, (b) free above X threshold, (c) tiered by distance, (d) tiered by order value, (e) combination? | The formula determines the FE calculation logic. |
| Q4 | Which specific API were you concerned we'd re-call unnecessarily? Was it `/api/v1/config/distance-api-new` (the distance API) or `/api/config/{rid}` (the own-BE config API) or something else? | Determines whether the fix is "cache the distance API response" or "read from RestaurantConfigContext at select time." |
| Q5 | Is there an existing SelectAddress component/page, or is it a mode of `DeliveryAddress.jsx`? Can you give a URL fragment (e.g., `?step=select`)? | Affects file scope of the eventual CR. |
| Q6 | Should the charge be **shown next to each saved address** in the list, or only after one is tapped/selected? | UX decision affecting where to hook the calculation. |

## 8. Blast-radius / impact estimate

| Dimension | Estimate |
|---|---|
| Users affected | All customers who choose Delivery ordering (vs Dine-In). Owner to quantify % of orders. |
| Money at risk | High per-order (a wrong or missing delivery charge = either loss to restaurant or refunded to customer). Cumulative depends on delivery order volume. |
| Business flow blocked | Customer sees "no charge" → orders → gets charged separately → complaint. OR customer sees confusion → abandons cart. |
| Restaurants blocked | Any that use delivery. Owner to confirm count. |
| Reversibility | Reversible — no data corruption; missing charge means orders may have gone through incorrectly, but historical data can be reconciled from delivery distance + charge config. |

## 9. Landmines this CR must NOT touch (per Alpha v0.1 Part B §6, §12, Part C)

- ❌ Payment payload semantics: `payment_method: 'cash_on_delivery'` hardcode (BUG-007 parked).
- ❌ Restaurant 716 branch in ReviewOrder (BUG-006 parked).
- ❌ Provider stack order in `App.js`.
- ❌ `crm_token_${rid}` legacy migration.
- ❌ `finalTableId='0'` special trigger.
- ❌ `isOn()` default polarity.

## 10. Files likely to change (planning estimate — NOT a commitment)

| File | Reason | Notes |
|---|---|---|
| `frontend/src/pages/DeliveryAddress.jsx` | The Select Address view. | 1,047 lines; changes should be additive and scoped. |
| `frontend/src/context/RestaurantConfigContext.jsx` | May need to expose new delivery-charge fields (e.g., `deliveryChargeConfig`) — depending on Q2/Q3 outcome. | May not need change if fields already flow through unmapped as raw config. |
| `frontend/src/context/CartContext.js` | Ensure `setDeliveryCharge(charge)` is being called at the right moment. | Small if any. |
| `backend/server.py` (`/api/config/{rid}`) | Only IF Q2 reveals config fields need to be added to `customer_app_config` schema and exposed. | May be zero change. |
| `frontend/src/utils/deliveryCharge.js` | **NEW** helper module for the calculation formula (once Q3 clarifies the shape). | Small pure-function helper. |

## 11. Intake output (canonical)

```text
Intake complete: BUG-2026-02-XX-001
Classification: BUG (partial-implementation gap manifesting as defect)
Severity: P1
Risk: MEDIUM
Duplicate check: DISTINCT (RELATED to Alpha v0.1 Part B §5.6 known-gap + §13-9 open unknown)
Evidence: PARTIAL — verbatim owner report + code inspection; MISSING screen recording, restaurant ID, config shape (Q1-Q6)
Blast radius: MEDIUM (all delivery customers, revenue impact per-order)
Docs updated: /app/memory/change_requests/BUG-2026-02-XX-001-delivery-charge-not-calculated/INTAKE_DOC.md
Next: BLOCKED — needs owner clarification on Q1-Q6 before Planning can start. Then → Role 2 (Planning) → Impact Analysis + Implementation Plan.
```

**Registered.** Awaiting bugs 2, 3, 4 (and clarifications Q1-Q6 for this one).

---

*End of INTAKE_DOC BUG-2026-02-XX-001. Never coded during Intake per Alpha v0.1 R2/R7.*
