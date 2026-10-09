# INTAKE_DOC — CR-2026-02-XX-002

**Title:** Restaurant 699 — hardcode ₹10 takeaway charge, sent via `delivery_charge` payload field (temporary; no `takeaway_charge` field in current schema)
**Registered:** 2026-02 (this session)
**Reporter:** Owner (verbal report)
**Intake by:** E1 (Role 1 — Intake, read-only)

---

## 1. Report as received (verbatim)

> "only for the resturant id 699 -- hardcode takeaway charge to be included of 10 rupee which in api will pass in delihvery charges since we dont have takeaway charges filed -- this is temporary arrangement -- it should be register in gap registery"

## 2. Owner intent (Intake interpretation)

- **Scope:** Restaurant ID **699 only**.
- **Behaviour required:** When order type = Takeaway at restaurant 699, include ₹**10** charge in the order.
- **Field mapping (temporary):** Send ₹10 via the existing `delivery_charge` field in the order payload (POS API doesn't currently have a `takeaway_charge` field).
- **Nature:** **Temporary arrangement** — must be registered in the project gap registry with a clear sunset condition.
- **Explicit ask:** Register in `/app/memory/v2/PROJECT_GAP_REGISTER.md` (analogous to GAP-016 — the existing Restaurant 716 hardcode).

## 3. Classification

| Field | Value |
|---|---|
| Type | **CR (Change Request)** — deliberate new business rule; NOT a bug in existing code |
| Sub-type | Business-logic addition + temporary tenant-specific hardcode |
| Feature area | Order Placement — payload construction (`orderService.ts`) |
| Severity | **P2** — new business rule with a workaround (currently the ₹10 is presumably absorbed by the restaurant or not collected). Not blocking existing orders. |
| Risk of change | **LOW-MEDIUM** — 1-3 line change in a well-defined location, BUT it modifies the order payload which is inside CRITICAL Part C hotspot territory (`orderService.ts` / `ReviewOrder.jsx`) |
| Landmine class | **NEW LANDMINE CREATED (deliberate)** — must be tracked as GAP-021 with sunset condition |
| Blast radius | **SINGLE RESTAURANT** — only restaurant 699 affected; every other restaurant unchanged |
| Priority (business) | Owner-driven — takeaway revenue currently going uncollected at restaurant 699 |

## 4. Duplicate / prior-art check

| Source | Result |
|---|---|
| `/app/memory_repo/BUG_TRACKER_v2.md` | No entry for takeaway charge or restaurant 699. **DISTINCT.** |
| `/app/memory/change_requests/` — grep for "takeaway" or "699" | 0 hits. |
| `/app/memory/v2/PROJECT_GAP_REGISTER.md` | Highest existing gap = GAP-020. **New gap ID = GAP-021.** |
| **Precedent — GAP-016 (Restaurant 716 hardcode)** | RELATED — same pattern: single-tenant carve-out with owner-confirmed temporary status. Same treatment approach. |
| Alpha v0.1 Part B §12.4 | Existing rule: *"DO NOT remove Restaurant 716 hardcoded logic … tracked (BUG-006) and parked intentionally."* — establishes precedent for owner-approved tenant hardcodes to coexist with the "no restaurant-specific hardcode" principle. |

**Verdict:** DISTINCT. Not a duplicate. Follows GAP-016 pattern precisely.

## 5. Evidence captured

| Item | Source | State |
|---|---|---|
| Owner verbal directive | this session | ✅ captured verbatim (§1) |
| Confirmation of restaurant 699 as sole scope | owner | ✅ explicit |
| Confirmation of ₹10 flat amount | owner | ✅ explicit |
| Confirmation of `delivery_charge` field misuse (temporary) | owner | ✅ explicit |
| Reason no `takeaway_charge` field: | owner | ✅ POS schema doesn't have it |
| Sunset trigger (when to remove the hardcode) | — | ⚠ NOT SPECIFIED — request from owner (§7 Q1) |
| Any existing takeaway pricing behaviour today at rest 699 | — | ⚠ NOT SPECIFIED — request from owner (§7 Q2) |

## 6. Code reality (Intake read-only recon)

### 6.1 Where the order payload is currently constructed

**File:** `frontend/src/api/services/orderService.ts`
**Precedent:** Same file already contains `payment_method: 'cash_on_delivery'` hardcode at lines 386, 523 (BUG-007, parked). Also contains Restaurant 716 special-case branches (GAP-016).

**Implication:** The `delivery_charge` field is set here (or upstream in `CartContext.setDeliveryCharge`). The Restaurant 699 hardcode will most likely land at one of:
- (a) `orderService.ts` — at payload-build time, override `delivery_charge` when `restaurant_id === '699'` AND `orderType === 'takeaway'`
- (b) `CartContext.js` — populate `deliveryCharge` state to `10` on takeaway + rest 699
- (c) A new pure helper (`utils/tenantOverrides.js` or similar) so the tenant carve-outs live in one file

**Preference recommendation (planning stage):** Option (c) with a small helper `getTakeawayCharge(restaurantId): number` that returns `10` for '699' and `0` otherwise. This keeps the tenant carve-out **isolated and greppable** — critical for eventual removal.

### 6.2 Current takeaway detection

`grep -rl takeaway frontend/src` shows takeaway is a first-class order type (10 files reference it: `channelEligibility.js`, `orderTypeHelpers.js`, `OrderModeSelector.jsx`, etc.). So the trigger condition (`orderType === 'takeaway'`) is well-known and testable.

### 6.3 Restaurant 699 — anything already special-cased?

`grep -rn "699" frontend/src backend/` → owner to confirm. If nothing exists yet, this is a **first-time** carve-out for 699. If something does, this CR must not conflict.

## 7. Clarifications needed (blocks Planning)

| # | Question |
|---|---|
| Q1 | **Sunset trigger** — when should this hardcode be removed? (a) When POS adds a `takeaway_charge` field → we migrate. (b) When `customer_app_config` gains a per-restaurant `takeaway_charge` field. (c) Never (permanent business rule). (d) Owner will remove manually. |
| Q2 | Is the ₹10 currently being collected at all at restaurant 699 today, or is this net-new revenue? (Determines whether existing customers will see a price change on their next order.) |
| Q3 | Should the ₹10 charge be **shown in the cart UI as a line item** (labeled "Takeaway Charge" or just added to the total silently)? |
| Q4 | If a customer at restaurant 699 has an order type that could be BOTH takeaway AND delivery (unlikely but possible), does the ₹10 apply once or per-type? |
| Q5 | Does this need to apply to edit-order flows too? (Existing takeaway orders being re-submitted?) |
| Q6 | Any tax implications? (Is ₹10 tax-inclusive or does GST apply on top?) |

## 8. Blast-radius / impact estimate

| Dimension | Estimate |
|---|---|
| Users affected | All customers at restaurant 699 placing takeaway orders. |
| Money at risk | ₹10 × takeaway-order volume at rest 699 (net-new revenue if not currently collected). |
| Other restaurants | **ZERO impact** — behaviour changes ONLY when `restaurant_id === '699'` AND `orderType === 'takeaway'`. |
| Reversibility | Fully reversible — revert 1 code change; no data written. |
| Payload contamination risk | ⚠ MEDIUM — the ₹10 goes into `delivery_charge`, not `takeaway_charge`. Any downstream analytics / reports that filter on "delivery orders by charge collected" will now include rest-699 takeaway orders in delivery bucket unless they also filter by `order_type`. Owner should flag downstream teams. |

## 9. Landmines this CR must NOT touch

- ❌ `payment_method: 'cash_on_delivery'` hardcode (BUG-007) at `orderService.ts:386, 523`.
- ❌ Restaurant 716 hardcode (GAP-016 / BUG-006) at `ReviewOrder.jsx` and same `orderService.ts`.
- ❌ Provider stack order.
- ❌ `payment_type` semantics.

## 10. Landmine this CR **CREATES** (deliberate, tracked)

- ⚠ **New tenant-specific hardcode for restaurant 699 in `orderService.ts` (or helper).**
- Tracked as **GAP-021** in `/app/memory/v2/PROJECT_GAP_REGISTER.md` (updated in the same intake action).
- Must carry a code comment: `// GAP-021 — temporary: Restaurant 699 takeaway ₹10 charge via delivery_charge field. Remove when takeaway_charge field is added to POS payload.`

## 11. Files likely to change (Planning estimate — NOT a commitment)

| File | Nature | LOC estimate |
|---|---|---|
| `frontend/src/api/services/orderService.ts` OR a new `frontend/src/utils/tenantOverrides.js` | Inject ₹10 into `delivery_charge` when `restaurant_id === '699'` AND `orderType === 'takeaway'` | +3-8 |
| `frontend/src/context/CartContext.js` (maybe) | Ensure `deliveryCharge` state reflects the ₹10 for UI display (if Q3 = show as line item) | +2 |
| `frontend/src/pages/ReviewOrder.jsx` (maybe) | Only if UI must show a "Takeaway Charge ₹10" line separately from delivery charge | +5-10 |
| `/app/memory/v2/PROJECT_GAP_REGISTER.md` | Add GAP-021 row + summary update. **Done in this intake action.** | +2 rows |

Estimated total code diff: **+5-20 LOC** across 1-3 files. Effort: **~2-4 hours** implementation + **~30 min** testing.

## 12. Intake output (canonical)

```text
Intake complete: CR-2026-02-XX-002
Classification: CR (deliberate new business rule + tenant-specific hardcode)
Severity: P2
Risk: LOW-MEDIUM (touches order payload = CRITICAL Part C hotspot territory)
Duplicate check: DISTINCT (follows GAP-016 pattern)
Evidence: PARTIAL — owner directive captured; sunset trigger, tax handling, UI presentation MISSING (Q1-Q6)
Blast radius: SINGLE-RESTAURANT (699 only, takeaway only)
Landmine created: NEW GAP-021 registered in /app/memory/v2/PROJECT_GAP_REGISTER.md
Docs updated:
  - /app/memory/change_requests/CR-2026-02-XX-002-restaurant-699-takeaway-charge/INTAKE_DOC.md
  - /app/memory/v2/PROJECT_GAP_REGISTER.md (GAP-021 added)
Next: Owner clarification on Q1-Q6 → Role 2 (Planning) → Owner approval on hotspot touch (Part C) → Role 3 (Implementation) → testing_agent_v3
```

**Registered.** No code written.

---

*End of INTAKE_DOC CR-2026-02-XX-002. Never coded during Intake per Alpha v0.1 R2/R7.*
