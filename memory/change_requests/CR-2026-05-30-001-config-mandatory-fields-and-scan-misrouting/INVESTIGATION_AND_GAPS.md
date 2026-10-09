# CR-2026-05-30-001 — Investigation & Gap Analysis (No Edits)

| Field | Value |
|---|---|
| Investigated at (UTC) | 2026-05-30 07:40 UTC |
| Investigator | E1 (read-only) |
| Scope | Investigation + code analysis only — **NO CODE / CONFIG EDITS** |
| Hard constraint | **Restaurant `716` (Hyatt Centric) is excluded from any planning or fix proposed below.** All gap analysis explicitly carves 716 out. |
| Related prior work | `/app/memory_repo/change_requests/ROOM_SCANNER_ORDER_AS_WALKIN_INVESTIGATION_2026-05-08.md` · `ROOM_SCANNER_INTERMITTENT_WC_INVESTIGATION_2026-05-08.md` · `ROOM_SCANNER_INTERMITTENT_WC_STATUS_2026-05-09.md` |

> Items 2 & 3 in this CR are **the same bug family** that the May-8/May-9 investigations already mapped. **Only Option G1 has been implemented, and only behind a `restaurantId === '716'` carve-out.** Five of the six wipe-paths are still wide open for every non-716 restaurant. Item 1 surfaces an entirely separate gap — the OTP-required toggles exist in admin UI but are never honoured at runtime.

---

# Item 1 — Mandatory name/phone is config-driven, OTP "route" is NOT

## 1.1 What configuration exists today

`customer_app_config` collection (per-restaurant) carries **eleven** relevant boolean flags. They are all admin-editable (`/app/frontend/src/components/AdminSettings/VisibilityTab.jsx`).

| Flag | Defined in `RestaurantConfigContext.jsx` | Defined in backend model `server.py` | Rendered in admin UI | **Actually consumed in runtime flow?** |
|---|:---:|:---:|:---:|:---:|
| `mandatoryCustomerName` | ✅ L93 | ✅ L207 | ✅ L56 | ✅ `LandingPage.jsx:444,738,875` |
| `mandatoryCustomerPhone` | ✅ L94 | ✅ L208 | ✅ L57 | ✅ `LandingPage.jsx:444,739,876` |
| `otpRequiredDineIn` | ✅ L96 / L446 | (only via dict pass-through) | ✅ L131 | ❌ **never read** |
| `otpRequiredTakeaway` | ✅ L97 / L447 | (dict) | ✅ L132 | ❌ **never read** |
| `otpRequiredDineInWithTable` | ✅ L98 / L448 | (dict) | ✅ L133 | ❌ **never read** |
| `otpRequiredWalkIn` | ✅ L99 / L449 | ✅ L213 / L1069 | ✅ L134 | ❌ **never read** |
| `otpRequiredRoomOrders` | ✅ L100 / L450 | (dict) | ✅ L135 | ❌ **never read** |

> Verification command used: `grep -rniE "otpRequired(DineIn|Takeaway|DineInWithTable|WalkIn|RoomOrders)" /app/frontend/src` → only 3 categories of hits: `RestaurantConfigContext.jsx` (default/serialize), `VisibilityTab.jsx` (admin UI), and `__tests__/`. **Zero usages in any page, hook, route, or service.**

## 1.2 What the landing → OTP flow actually does today

`LandingPage.jsx → handleBrowseMenu (lines 400–542)`:

```
if (isTakeawayDeliveryMode && !isAuthenticated):
    require name + valid phone

if (!isAuthenticated && (configShowLandingCustomerCapture || isTakeawayDeliveryMode)):
    if (effectiveMandatoryPhone && !valid(phone))  → block
    if (effectiveMandatoryName  && !name.trim())    → block

    if (phone provided):
        POST /api/auth/check-customer
        navigate(`/<rid>/password-setup`, {phone, name, hasPassword, …})    # 🔴 unconditional
        return

# (else) no phone OR capture disabled → straight to /menu (no OTP screen)
```

And inside `PasswordSetup.jsx` the user lands in **`authMethod = 'choose'`** which immediately presents the user with `Login with OTP` vs `Login with Password` vs `Skip for now`.

## 1.3 Confirmed gap (Item 1)

1. **There is no single config flag that the customer flow consults to "auto-skip OTP".** The five `otpRequired*` flags are dead — defined, persisted, edited from admin, **never read**.
2. **The "OTP route" the user is referring to (the `/password-setup` screen) is unconditionally navigated to whenever a phone is captured at landing.** It is NOT gated by `mandatoryCustomerPhone=false` and NOT gated by any `otpRequired*` flag.
3. **`mandatoryCustomerName` / `mandatoryCustomerPhone` today only relax validation** (`L444,L448`). They do **not** influence whether the OTP/password-setup screen appears.
4. The `Skip for now` button on `/password-setup` calls `crmSkipOtp(...)` and IS the technical mechanism for skipping OTP, but it requires (a) the user reach that screen first and (b) the user to tap it manually — neither is automatic and neither is config-driven.

### What's still ambiguous (need owner confirmation)

| # | Question | Why it matters |
|---|---|---|
| Q1 | Is "non-mandatory" defined as **`mandatoryCustomerName=false` AND `mandatoryCustomerPhone=false`** (both false → skip OTP) — or is one of them sufficient? | Drives the conditional shape |
| Q2 | If phone is non-mandatory but the customer **chooses** to enter it, should OTP still auto-skip? | Today: any captured phone routes to /password-setup |
| Q3 | Should the five existing `otpRequired*` toggles be the source of truth (per order-type granularity) — or should `mandatoryCustomerPhone` be the master switch? Both exist in the schema today. | Avoid layering two parallel controls |
| Q4 | If OTP is auto-skipped, what identity is attached to the order? Anonymous guest, or a `crmSkipOtp` no-OTP token (which still creates a CRM customer)? | Affects loyalty points, repeat-customer detection, marketing |
| Q5 | Should this apply to **takeaway/delivery** as well? Today `LandingPage.jsx:738-739` *forces* both fields mandatory whenever mode ∈ {takeaway, delivery}, overriding the config. | Significant — fixing this would intentionally relax current takeaway behaviour |

### Implementation surface (read-only — for later planning)

If/when implementation is authorised, the *minimum* edit set is:
1. `LandingPage.jsx` L442–520 — gate the `navigate('/password-setup', …)` on the chosen flag(s).
2. `LandingPage.jsx` L738–739 — re-evaluate the forced-mandatory override for takeaway/delivery (per Q5).
3. Decide whether the seven `otpRequired*` config fields stay (and start being consumed) or get retired in favour of the `mandatory*` pair.

> **No file edited. No config edited.**

---

# Item 2 — Table scan sometimes creates a "new table" (i.e. a fresh duplicate order on the same physical table)

## 2.1 Most likely manifestation in this codebase

The phrase "creates new table" maps to **one of two observable symptoms**, both rooted in the same client-side gap:

| Symptom A | Symptom B |
|---|---|
| The customer's order is created as a brand-new POS order **even though an active order already exists** on that table — looking like a "duplicate / new table" on the dashboard. | The POS receives `table_id='0'` (or empty) for a real table scan and the dashboard renders it as **WC / new walk-in row** (visually indistinguishable from a "new table" if the dashboard groups by physical table). |

Both symptoms share the **same single point of failure on the client**.

## 2.2 The single point of failure

`/app/frontend/src/api/services/orderService.ts:130-142` — `checkTableStatus` **fails open**:

```ts
} catch (error: any) {
  logger.error('table', 'Failed to check table status:', error);
  return {
    tableStatus: 'Available',   // 🔴 fail-open
    orderId: null,
    isOccupied: false,
    isAvailable: true,           // 🔴 fail-open
    isInvalid: false,
    ...
  };
}
```

Consumed at `ReviewOrder.jsx:1118-1131`:

```js
if (!skipTableCheckFor716 && finalTableId && String(finalTableId) !== '0') {
  try {
    const tableStatus = await checkTableStatus(...);
    if (tableStatus.isOccupied && tableStatus.orderId) {
      toast.error('This table already has an active order. Please edit the existing order instead.');
      return;
    }
  } catch (tableCheckErr) {
    logger.error('table', 'Table status check failed:', tableCheckErr);
    // 🔴 continues on error — falls through to place a *new* order on a possibly-occupied table
  }
}
```

### What happens at runtime

1. Customer scans `?type=table&tableId=3245`. ✅ scan parsed correctly.
2. Customer adds items. ✅
3. Customer hits *Place Order*. Client calls `checkTableStatus(3245, …)`.
4. POS times out / network blip / 5xx / 401 / 502 → `apiClient.get` throws → catch returns the fail-open object.
5. Client sees `isOccupied=false` → falls through to `placeOrder(…)` → a **second order** is created against the **same table id** with no awareness of the live order from the previous customer.
6. POS dashboard now shows two open orders pointing at the same physical table — **looks to staff like the QR "created a new table"**.

> The very next code path at `OrderSuccess.jsx:236-264` then polls `getOrderDetails` for the **new** orderId. The old order keeps existing on the dashboard.

## 2.3 Sub-paths that also produce the same visible symptom

1. **`table_id='0'` fallback path** (same fix-family as Item 3). If `useScannedTable` hook has lost its sessionStorage between scan and place-order (any of the six wipe paths in the May-8 investigation), `ReviewOrder.jsx:983-985` and `:1287` send `table_id='0'`. POS can't find row 0 → falls back to a brand-new walk-in / WC line. From the dashboard it can be perceived as "a new (uncorrelated) table".
2. **Two tabs / two devices on the same table.** `sessionStorage` is per-tab. If two phones at the same table both scanned the QR independently, both write their own scan to their own sessionStorage; the table-status check above is the only client-side guard, and it fails open on errors. No server-side dedup is visible in our backend (the backend only proxies POS — `server.py` does not own order-creation).
3. **Race window inside the "occupied" branch.** Even when `checkTableStatus` succeeds and `isOccupied=true`, the toast says "edit the existing order" and `navigate('/<rid>')` — but the user can simply rescan or refresh and try again before staff close the live order. Each retry rolls the fail-open dice.

## 2.4 Where the relevant code lives

| File | Lines | Role |
|---|---|---|
| `frontend/src/api/services/orderService.ts` | 80–143 | `checkTableStatus`, fail-open default |
| `frontend/src/pages/ReviewOrder.jsx` | 1110–1131 | The only client-side gate against duplicate table orders (skipped for 716 by design) |
| `frontend/src/pages/ReviewOrder.jsx` | 983–985 / 1285–1287 | `finalTableId` fallback to `'0'` |
| `frontend/src/pages/LandingPage.jsx` | 250–410 | `tableStatusCheck` on landing — also relies on `checkTableStatus` |
| `frontend/src/utils/orderTypeHelpers.js` | 42–44 | `hasAssignedTable` definition (`!=='0'`) |
| `backend/server.py` | n/a | **Not involved** — order creation is direct to POS from the FE; our backend only proxies `/api/table-config`. No table-row creation logic in our backend. |

## 2.5 Confirmed gaps (Item 2)

1. **Single client-side guard, fail-open.** Network/POS errors silently allow a second order on the same scanned table.
2. **No retry / no backoff / no second-opinion call.** A single failed `checkTableStatus` is sufficient to produce the duplicate.
3. **No idempotency key in place-order payload.** Looking at `orderService.ts:322-379` and `transformers/helpers.js:391-491`, the payload carries no client-generated `idempotency_key`, no `client_order_uuid`, no `scan_session_id`. Same scan + same cart + double-click within the fail-open window can create N orders.
4. **`table_id='0'` silent fallback.** Same as the room case (Item 3) — table scans are vulnerable to the exact same sessionStorage-wipe paths if the customer goes through Order Success between scans (because **Option G1 was 716-only**).
5. **No backend-side dedup.** `/app/backend/server.py` is a thin proxy; it does not own POS order creation. Any backend-side dedup is therefore out of scope for *this repo* — has to be planned with POS team or implemented as a FE-only guard.

### What's still ambiguous

| # | Question | Why it matters |
|---|---|---|
| Q6 | When you say "creates a new table" — do you mean (a) a duplicate POS *order* against the same physical table, or (b) a separate "WC" row on the dashboard with no link to the table, or (c) literally a new table row appearing in POS table-config? | (a) and (b) match this analysis. (c) would mean POS is treating an unknown `table_id` as auto-create — that's a POS-side problem, **not** our code. We need one example order-id + restaurant-id to disambiguate. |
| Q7 | Reproducer — does it happen mostly after the customer's first paid order, or also on the very first scan? | If "after first paid order", it's Path 1 of the May-8 analysis (same as room). If "first scan too", it's the fail-open `checkTableStatus` path. |
| Q8 | Affected restaurants & rough frequency (1 in 10 / 1 in 100)? | Needed for severity sizing |

---

# Item 3 — Room scan sometimes lands the order as **walk-in**

## 3.1 Already deeply investigated

See `/app/memory_repo/change_requests/ROOM_SCANNER_INTERMITTENT_WC_INVESTIGATION_2026-05-08.md` (root cause + 6 wipe paths) and `ROOM_SCANNER_ORDER_AS_WALKIN_INVESTIGATION_2026-05-08.md` (payload-contract gap with POS).

## 3.2 Root cause (summary)

Two independent root causes can each produce the symptom:

### RC-A. `table_id='0'` reaches POS (client-side state loss)

`ReviewOrder.jsx:983-985`:

```js
const finalTableId = hasAssignedTable(scannedTableId)
  ? scannedTableId
  : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0'); // 🔴
```

When `scannedTableId` is empty/null/'0' AND no manual tableNumber was picked → `'0'` is sent. POS has no row `0` → falls back to walk-in / WC.

**Six paths produce empty `scannedTableId` between scan and place-order:**

| # | Path | Currently mitigated? | For 716 | For non-716 |
|---|---|---|:---:|:---:|
| 1 | Order paid (`fOrderStatus=6`) → `OrderSuccess.jsx:311-322` wipes sessionStorage | Option G1 implemented | ✅ wipe still happens (intentional) | ❌ **wipe blocked** (i.e. fixed) — **wait, see below** |
| 2 | Order cancelled (`fOrderStatus=3`) → same wipe | Option G1 implemented | ✅ wipe | ❌ **fixed** |
| 3 | 404 / `order not found` during poll → `OrderSuccess.jsx:357-362` wipe | Option G1 implemented | ✅ wipe | ❌ **fixed** |
| 4 | Browser tab close / reopen — `sessionStorage` is per-tab | ❌ G2 deferred | n/a | ❌ still broken |
| 5 | Second tab on bookmark / shared link — `sessionStorage` not shared | ❌ G2 deferred | n/a | ❌ still broken |
| 6 | Restaurant 716 forced reset (`ReviewOrder.jsx:937-941, 1289-1295`) | by design | ✅ intentional | n/a |

> **Reading the May-9 status doc carefully**: G1 *is* applied — gating `clearScannedTable()` behind `if (String(restaurantId) === '716') …`. So today, **paths 1/2/3 are FIXED for non-716**, **still operating for 716 (intentional)**. **Paths 4 and 5 are not addressed for anyone.** Path 6 only matters to 716.

### RC-B. Payload contract gap — even when `table_id` is correct, "room-ness" is invisible

`orderService.ts:322-379` (and twin builders) send only:
- `order_type = 'dinein'` (same as table dine-in and walk-in dine-in — no `'room'` value ever)
- `table_id = <room's table-config id>` (correct, but POS dashboard must do a `table_id → rtype='RM'` join to recover the room label)
- `air_bnb_id = ''` (hardcoded in all three builders — `orderService.ts:333`, `:465`, `transformers/helpers.js:460`)
- No `room_id`, no `room_or_table`, no `is_room` flag

If the POS dashboard's `table_id → rtype` join fails (wrong restaurant_id, type mismatch, stale id), the order gets classified as walk-in even with a perfectly valid `table_id`.

Additionally, **`useScannedTable.js:37-39` does NOT accept `orderType=room`** — even if POS were to bake `orderType=room` into a room QR, the parser silently coerces it to `'dinein'`.

## 3.3 Confirmed gaps (Item 3)

1. **G2 not implemented** — sessionStorage → localStorage. Paths 4 & 5 still leak room context for every restaurant (incl. non-716).
2. **G3 not implemented** — defensive "block place-order if `roomOrTable='room'` but `finalTableId='0'`" guard. The current code silently sends `'0'` instead of erroring out.
3. **G4 not implemented** — payload still carries no `room_or_table` / `room_id` / `is_room` flag. POS classifier has no robust room signal beyond the fragile `table_id → rtype` join.
4. **G5 not implemented** — no diagnostic snapshot logged at place-order, so the next "WC" report has no audit trail.
5. **Parser allow-list excludes `'room'` for orderType** — `useScannedTable.js:37-39`. Even if POS team added `orderType=room`, we'd drop it.
6. **`air_bnb_id` hardcoded `''`** in all three payload builders — `orderService.ts:333,465`, `transformers/helpers.js:460`.

### What's still ambiguous (carried forward from May-8 investigation)

| # | Question | Why it matters |
|---|---|---|
| Q9 | Real QR URL that POS bakes for a room (with all query params) — need one sample | We literally cannot see the contract POS is producing |
| Q10 | One failing order-id + restaurant-id + the order-details API response showing `table_id` and `table_type` | Disambiguates RC-A from RC-B |
| Q11 | POS dashboard classification rules — does the POS team confirm `table_id → rtype` is the only signal? | Drives whether G4 (payload flag) is required at all |

---

# Cross-cutting gaps that touch all three items

1. **No `restaurant 716` carve-out mechanism is centralised.** Today carve-outs are inline string compares (`String(restaurantId) === '716'`) in `OrderSuccess.jsx:320,360`, `ReviewOrder.jsx:828,837,938,988,1114,1290`. Any future fix that must "not disturb 716" has to remember to thread this check through *every* new branch. Risk: an inadvertent regression for 716 when fixing items 2/3.
2. **No feature-flag layer.** `customer_app_config` is a JSON document the FE reads at boot, but there is no per-restaurant kill-switch / rollout flag for the kind of behaviour change items 1–3 imply. Any fix is global on deploy.
3. **No audit logging on order placement.** `logger.order(...)` exists but is gated by environment, and is not piped anywhere durable. We cannot retro-investigate a specific "WC" or "duplicate table" report without log capture.

---

# Files touched in this investigation (read-only)

```
backend/server.py                                              (L23-1601 — auth, table-config, models)
frontend/src/hooks/useScannedTable.js                          (full file)
frontend/src/utils/orderTypeHelpers.js                         (full file)
frontend/src/context/RestaurantConfigContext.jsx               (L90-460 — defaults + serialize)
frontend/src/components/AdminSettings/VisibilityTab.jsx        (L56-135 — admin toggles)
frontend/src/pages/LandingPage.jsx                             (L35-543, L720-880)
frontend/src/pages/PasswordSetup.jsx                           (L1-540)
frontend/src/pages/OrderSuccess.jsx                            (L130-380)
frontend/src/pages/ReviewOrder.jsx                             (L800-1130, L1270-1330)
frontend/src/api/services/orderService.ts                      (L75-145, L271-533)
frontend/src/api/services/crmService.js                        (L274-410)
frontend/src/api/transformers/helpers.js                       (L391-491)
memory_repo/change_requests/ROOM_SCANNER_ORDER_AS_WALKIN_INVESTIGATION_2026-05-08.md
memory_repo/change_requests/ROOM_SCANNER_INTERMITTENT_WC_INVESTIGATION_2026-05-08.md
memory_repo/change_requests/ROOM_SCANNER_INTERMITTENT_WC_STATUS_2026-05-09.md
```

**No file was modified. No config was modified. No service was restarted.**

---

# Summary of gaps (at-a-glance)

| Item | Gap | Severity | Fix surface |
|---|---|---|---|
| 1 | Five `otpRequired*` flags are dead — defined & saved from admin, **never read by the customer flow** | High (UX claim broken: admin can toggle, nothing happens) | `LandingPage.jsx:442-520`, `PasswordSetup.jsx` (skip-by-default branch), `RestaurantConfigContext.jsx` |
| 1 | `mandatoryCustomerName/Phone` today only relax validation; the OTP/password-setup screen still appears unconditionally when phone is captured | High | `LandingPage.jsx:495-518` (the unconditional navigate) |
| 1 | Takeaway/delivery forces `effectiveMandatory*=true` regardless of config — likely intentional, but conflicts with the "non-mandatory → skip OTP" requirement | Medium | `LandingPage.jsx:738-739` |
| 2 | `checkTableStatus` is fail-open on error → duplicate orders on the same physical table look like "a new table" | High | `orderService.ts:130-142` |
| 2 | No idempotency key on `placeOrder` payloads → fast retries during fail-open window can multiply orders | High | `orderService.ts:322-379`, `:411-533`, `transformers/helpers.js:391-491` |
| 2 & 3 | `table_id='0'` silent fallback for any session-storage wipe (Paths 4 & 5 still open for everyone; Paths 1/2/3 now open only for 716 by design) | High | `ReviewOrder.jsx:983-985`, `:1285-1287`; `useScannedTable.js` (sessionStorage→localStorage) |
| 3 | Payload contract carries no room signal — POS must do a fragile `table_id → rtype` join | High | `orderService.ts:271-533`, `transformers/helpers.js:391-491` |
| 3 | Parser drops `orderType=room` (allow-list mismatch) | Medium | `useScannedTable.js:37-39` |
| 3 | `air_bnb_id` hardcoded `''` everywhere | Medium | three builders |
| All | No central "is restaurant excluded" helper (716 carve-out is duplicated inline) → inadvertent regressions easy | Medium | introduce `utils/restaurantPolicies.js` (not yet) |
| All | No diagnostic logging on place-order (G5) → can't triage individual reports | Medium | `ReviewOrder.jsx` place-order entry |

---

# Recommended next step (no code change yet)

Owner inputs needed (in priority order):

1. **One failing order-id + restaurant-id** for items 2 and 3 (separately if available) + the corresponding order-details API response. Disambiguates `table_id='0'` from contract-gap vs POS-side join failure.
2. **Decision on Q1–Q5 (Item 1)** — which flag is authoritative for OTP skip, and whether the rule applies to takeaway/delivery.
3. **Decision on Q6 (Item 2)** — does "creates a new table" map to symptom A (duplicate order) or symptom B (WC fallback)?
4. **Authorisation matrix** — which of G1/G2/G3/G4/G5 + Item-1 + Item-2 fixes to plan, with explicit confirmation that 716 stays excluded throughout.

> **Awaiting owner direction. No code or config change in this CR session.**
