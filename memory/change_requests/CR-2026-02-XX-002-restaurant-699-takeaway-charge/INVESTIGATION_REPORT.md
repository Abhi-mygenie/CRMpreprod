# INVESTIGATION_REPORT — CR-2026-02-XX-002

**Item:** Restaurant 699 — hardcode ₹10 takeaway charge via `delivery_charge` payload field
**Investigation by:** E1 (Role 6 — Investigation, read-only)
**Date:** 2026-02 (this session)
**Status:** ROOT CAUSE / IMPLEMENTATION POINT IDENTIFIED — clean fix path exists; awaiting Q1-Q6 clarifications + owner approval

---

## 1. Nature of the item

This is a **deliberate business-rule CR**, not a bug in existing code. Owner wants to inject a ₹10 charge into the order payload for restaurant 699's takeaway orders because:
1. Rest 699 needs to collect ₹10 for takeaway packaging/handling
2. POS payload has no `takeaway_charge` field
3. The `delivery_charge` field is being repurposed as a temporary carrier

Registered as **GAP-021** in `/app/memory/v2/PROJECT_GAP_REGISTER.md` alongside GAP-016 (Rest 716) as a tracked tenant-specific hardcode.

## 2. Root of the "gap" — why does this hack exist at all?

**Evidence:** No `takeaway_charge` field anywhere in the codebase.

```bash
grep -rE "takeaway_charge|takeaway_fee" /app/frontend /app/backend --include='*'
# 0 hits
```

The POS API contract clearly separates order types (`dinein`, `takeaway`, `delivery`) but only exposes a `delivery_charge` monetary field. Any per-order-type surcharge that isn't "delivery" has nowhere to go.

**This is a MyGenie POS schema gap, not a customer-app bug.** The proper fix belongs upstream:
- MyGenie POS adds a `takeaway_charge` field to their order payload
- MyGenie POS (or `customer_app_config`) gains per-restaurant configurability for it
- Customer app populates it correctly for all restaurants

Until then, the workaround is legitimate — provided it's tracked (done: GAP-021) with a clear sunset condition.

## 3. Where the ₹10 must be injected (implementation point)

**File:** `frontend/src/api/services/orderService.ts`

Two payload-build sites use `delivery_charge`:

| Site | Line | Path | Note |
|---|---|---|---|
| Place-order (new) | 369 | `delivery_charge: String(orderData.deliveryCharge \|\| 0)` | Customer's initial order |
| Update-order (edit) | 506 | `delivery_charge: String(deliveryCharge \|\| 0)` | Editing an already-placed order |

Both must apply the override, otherwise editing a rest-699 takeaway removes the ₹10.

## 4. Existing precedent — Restaurant 716 pattern

**Evidence:** `orderService.ts:325` uses `const is716 = String(orderData.restaurantId) === '716';`
Also `utils/orderAccessPolicy.js:44` uses `if (String(ctx?.restaurantId) === '716')`.

**Pattern to follow:** Restaurant carve-outs already have a house style — string-compare with the ID, conditionally alter behavior. GAP-016 documents this as tolerated. GAP-021 adds a second one, following the same convention.

## 5. Fix options

### Option A — Inline conditional at the two payload sites (matches 716 pattern)

```diff
+ const is699Takeaway = String(orderData.restaurantId) === '699' && (orderData.orderType || 'dinein') === 'takeaway';
+ const finalDeliveryCharge = (orderData.deliveryCharge || 0) + (is699Takeaway ? 10 : 0);
- delivery_charge: String(orderData.deliveryCharge || 0),
+ delivery_charge: String(finalDeliveryCharge), // GAP-021 — ₹10 for rest-699 takeaway
```

Applied twice — once at line 369 (place-order), once at line 506 (edit-order).

**Pros:**
- Matches the existing 716 pattern → predictable, easily greppable.
- Zero new files, zero new abstractions.
- Fast to implement, fast to remove when GAP-021 sunsets.

**Cons:**
- Duplication (two spots).
- Restaurant IDs continue to accumulate in `orderService.ts` — if a third tenant carve-out comes, this file becomes an if/else forest.

**Effort:** ~30 min + testing_agent.
**Risk:** LOW-MEDIUM (touches CRITICAL hotspot `orderService.ts` — owner approval required per Part C R5).

### Option B — Extract to a helper `utils/tenantOverrides.js`

New file `frontend/src/utils/tenantOverrides.js`:
```javascript
// Per-restaurant hardcoded overrides.
// Each override MUST be linked to a GAP-XXX entry in PROJECT_GAP_REGISTER.md.
// Remove overrides only when the corresponding GAP-XXX is closed.

/**
 * GAP-021 — Restaurant 699 takeaway charge.
 * Adds ₹10 to delivery_charge on takeaway orders for restaurant 699.
 * Sunset: when POS payload gains a takeaway_charge field.
 */
export function computeTakeawaySurcharge(restaurantId, orderType) {
  if (String(restaurantId) === '699' && orderType === 'takeaway') return 10;
  return 0;
}
```

Then `orderService.ts` at both sites:
```diff
+ import { computeTakeawaySurcharge } from '../../utils/tenantOverrides';
...
+ const surcharge = computeTakeawaySurcharge(orderData.restaurantId, orderData.orderType);
- delivery_charge: String(orderData.deliveryCharge || 0),
+ delivery_charge: String((orderData.deliveryCharge || 0) + surcharge), // GAP-021
```

**Pros:**
- Every future tenant carve-out has ONE home file — greppable, testable.
- New engineers see the "why" in one place.
- Pure function → easy to unit-test.
- Consistent with Alpha v0.1 recommendation to isolate landmines.

**Cons:**
- Adds one new small file (~15 lines).
- Slightly more effort (~1 hr vs 30 min).

**Effort:** ~1-2 hours + testing_agent.
**Risk:** LOW (helper is a new pure function; orderService.ts diff is small and clean).

### Option C — Move to config-driven (per-restaurant `takeaway_charge` in `customer_app_config`)

Add a `takeawayCharge` key to `customer_app_config` schema. Admin can set it per restaurant. FE reads from `RestaurantConfigContext`. `orderService.ts` reads context, adds charge accordingly.

**Pros:**
- Not a hardcode at all — admin-editable.
- Solves the ROOT problem, not just Rest 699.
- Closes GAP-021 permanently (no sunset needed).

**Cons:**
- Requires backend schema change.
- Requires admin-UI update (`AdminSettings.jsx` or similar).
- Doesn't solve the POS schema gap — the `takeawayCharge` value still gets sent via `delivery_charge` field.
- Larger scope, needs more owner input on shape.

**Effort:** ~3-5 days.
**Risk:** MEDIUM (backend + admin UI + FE).

## 6. Recommendation

**Recommend Option B** — helper module.

Rationale:
- Only 30 min more effort than Option A, but pays back the first time a THIRD tenant hardcode is added.
- Aligns with Alpha v0.1 §12.4 spirit (contain landmines).
- Testable in isolation — one unit test for the helper covers correctness forever.
- Comment header + GAP-021 link makes it self-documenting for future engineers.
- Sunset is dead simple: delete the file when POS adds `takeaway_charge`.

If owner wants long-term solution, **Option C is preferable but should be a follow-up CR after Option B is shipped** — the ₹10 needs to flow today; Option C can come next sprint.

## 7. Answers this investigation resolves vs still needs

| INTAKE Q | Now resolved? |
|---|---|
| Q1 Sunset trigger | ⚠ Owner-defined. My recommendation: sunset when POS API gains `takeaway_charge` field. Documented in GAP-021 already. |
| Q2 Currently collecting ₹10 today? | ⚠ Owner-provided. Investigation didn't need this to determine implementation. |
| Q3 Show as separate line item in cart? | ⚠ Owner-provided. Recommendation: silent add to total for MVP (matches current `delivery_charge` display); switch to labeled line item when Option C ships. |
| Q4 Order with both takeaway + delivery? | ✅ RESOLVED — `orderType` is a single value ('dinein', 'takeaway', 'delivery'). Not a compound. Applies once. |
| Q5 Apply to edit-order flows? | ✅ RESOLVED — YES. Both `orderService.ts:369` (place) AND `:506` (edit) must apply the override. Otherwise editing removes ₹10. |
| Q6 Tax treatment? | ⚠ Owner-provided. Recommendation: treat ₹10 as tax-inclusive (matches current `delivery_charge` semantics). Owner to confirm with finance. |

## 8. Additional landmines noted during investigation (out of scope)

- **`payment_method: 'cash_on_delivery'` hardcode** (BUG-007) at `orderService.ts:386` and `:523`. Untouched.
- **Restaurant 716 branch** (GAP-016) at `orderService.ts:325` and `orderAccessPolicy.js:44`. Untouched.
- **`orderType` defaults to `'dinein'`** at `orderService.ts:385, 461` — if a rest-699 order somehow gets no orderType, the ₹10 will not fire. Not a bug for this CR, but worth noting.

## 9. Verification the fix will not regress anything

The proposed change (Option B):

- Only fires when `restaurantId === '699'` AND `orderType === 'takeaway'`
- Every other restaurant: `computeTakeawaySurcharge` returns `0` → no change to `delivery_charge` → identical payload to today
- Every other order type at rest 699 (dinein, delivery): also returns `0` → no change
- Existing 716 carve-out: independent code path, unaffected
- BUG-007 payment_method hardcode: unaffected (different field)

**Blast radius: exactly one restaurant × one order type. All other paths byte-identical.**

## 10. Investigation output (canonical)

```text
Investigation complete: CR-2026-02-XX-002
Root cause: POS schema gap — no `takeaway_charge` field; workaround via `delivery_charge` field acceptable but must be tracked.
Classification: CR (deliberate + tracked landmine)
Confidence: HIGH (existing 716 precedent + clean implementation surface)
Steps used: 5/10
Fix options: 3 (A/B/C)
Recommendation: Option B — new pure-function helper `utils/tenantOverrides.js` with `computeTakeawaySurcharge(rid, orderType)`. ~1-2 hr implementation, LOW risk.
Owner decisions needed:
  - Approve Option A vs B vs C?
  - Q1/Q3/Q6 clarifications (nice-to-have; not blockers for B)
  - Approval to touch orderService.ts (CRITICAL Part C hotspot — R5 required)
Docs updated: /app/memory/change_requests/CR-2026-02-XX-002-restaurant-699-takeaway-charge/INVESTIGATION_REPORT.md
Next: Owner decision → Role 2 (Planning) → Role 3 (Implementation) → testing_agent_v3
```

---

## 11. ADDENDUM — Re-investigation after owner clarification (2026-07-13)

**Trigger:** Owner provided exact API curl + field name (`takeaway_charges`) + DevTools screenshot confirming `"takeaway_charges":10` in POS restaurant-info response.
**Agent:** E1 (Investigation role — read-only)

### 11.1 BLOCKER 1 — RESOLVED ✅

Live probe of `preprod.mygenie.online/api/v1/web/restaurant-info` with payload `{"restaurant_web":"699"}` confirmed:

```json
"takeaway_charges": 10
```

Field is present, integer-typed, value = 10. **The field name is `takeaway_charges` (plural).**

**Why the prior validation missed it:** BACKEND_VALIDATION_ADDENDUM called the same endpoint with `{"restaurant_web":"699","pos_id":"0001"}`. The correct payload omits `pos_id`. Same endpoint, wrong payload shape — field was there all along.

### 11.2 Full data chain traced — Option C immediately viable ✅

| Layer | Status | Detail |
|---|---|---|
| POS API (`/web/restaurant-info`) | ✅ Has `takeaway_charges: 10` | Confirmed live |
| `endpoints.js` `RESTAURANT_DETAILS` | ✅ Points to this exact endpoint | `${API_BASE_URL}/web/restaurant-info` |
| `useRestaurantDetails` (`useMenuData.js:326`) | ✅ Returns full POS response | Includes `takeaway_charges` |
| `AdminConfigContext.jsx:159` | ✅ Already calls `useRestaurantDetails` | `posRestaurant.takeaway_charges = 10` available |
| `orderService.ts` | ❌ Not wired | Caller does not pass `takeaway_charges` into `orderData` |
| Own-backend `/api/config/699` | ❌ Does not expose `takeaway_charges` | Not needed for Option C |

**Key insight:** The frontend already fetches the POS restaurant-info (via `useRestaurantDetails`) which contains `takeaway_charges`. No backend change is required. The gap is purely a wiring gap in the FE call chain from `useRestaurantDetails` → `orderData` → `orderService.ts`.

### 11.3 Recommendation changed: Option B → Option C

**Previous recommendation:** Option B (hardcode helper `utils/tenantOverrides.js`) — still a tracked landmine, tied to restaurant 699.

**New recommendation: Option C (config-driven via existing POS restaurant-info hook)**

| Property | Option B | Option C |
|---|---|---|
| Hardcodes restaurant ID | Yes (`'699'`) | No |
| Backend changes needed | None | None |
| Works for other restaurants automatically | No | Yes |
| Creates GAP-021 landmine | Yes | No — GAP-021 can be CLOSED immediately |
| Effort | ~1-2 hr | ~1-2 hr (same) |
| Risk | LOW | LOW-MEDIUM (callers must pass new field; one extra param) |

**Rough Option C wiring (not code, investigation only):**
```
Caller (ReviewOrder.jsx or equivalent, already has posRestaurant via useRestaurantDetails)
  → orderData.takeawayCharges = posRestaurant.takeaway_charges || 0

orderService.ts → buildOrderPayload → for orderType === 'takeaway':
  delivery_charge = String((orderData.deliveryCharge || 0) + (orderData.takeawayCharges || 0))
  // For all other order types: delivery_charge unchanged
```

### 11.4 Updated blocker status

| Blocker | Prior status | Updated status |
|---|---|---|
| B1 — field not found | ⛔ ACTIVE | ✅ RESOLVED |
| B2 — owner@brew.com not in own-BE | ⛔ ACTIVE | ⚠ REDUCED — only blocks smoke test, not implementation |
| B3 — owner approval for orderService.ts | ⛔ ACTIVE | ⛔ STILL ACTIVE |
| B4 — fix option not selected | ⛔ ACTIVE | ⛔ STILL ACTIVE (recommendation now C) |

### 11.5 Updated owner decisions needed (before Bug Fix role)

| # | Decision | Notes |
|---|---|---|
| **D1** | Approve **Option C** | Config-driven via existing POS hook; no hardcode; no backend changes |
| **D2** | Explicitly approve editing `orderService.ts` | CRITICAL hotspot per Alpha v0.1 Part C; required before any agent touches it |
| **D3 (optional)** | Provision `owner@brew.com` in own-BE `users` OR share alternate local admin creds | Only needed for post-fix smoke testing |

Q1 / Q3 / Q6 remain nice-to-have, not blockers for Option C.

### 11.6 Updated investigation output (canonical)

```text
Re-investigation complete: CR-2026-02-XX-002 (addendum 2026-07-13)
BLOCKER 1: RESOLVED — takeaway_charges:10 confirmed in POS /web/restaurant-info
           Field name: takeaway_charges (plural, integer)
           Prior miss reason: wrong payload shape (pos_id included incorrectly)
Data chain: POS → useRestaurantDetails → posRestaurant.takeaway_charges = 10 (live in FE already)
Recommendation changed: Option B → Option C (config-driven, no hardcode, no backend changes)
GAP-021: Can be CLOSED immediately if Option C is implemented
Remaining blockers: B3 (owner approval for orderService.ts), B4 (fix option selection)
Steps used: 8/10
Docs updated: INVESTIGATION_REPORT.md (§11), BACKEND_VALIDATION_ADDENDUM.md (§9),
              SESSION_HANDOVER.md (new), PRD.md
Next: Owner approves D1 (Option C) + D2 (orderService.ts) → Role 2 (Planning) →
      Role 3 (Implementation) → testing_agent_v3
```

---

*End of INVESTIGATION_REPORT CR-2026-02-XX-002 (including 2026-07-13 addendum). Investigation agent must not code.*
