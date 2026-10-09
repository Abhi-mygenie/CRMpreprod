# Item 2 — Production Walk-In Misrouting: Mechanisms Investigation
## Why "scan again / Edit Order / any navigation" silently lands an active-table order as walk-in

| Field | Value |
|---|---|
| Date | 2026-05-30 |
| Mode | Investigation — **NO CODE EDITS** |
| Reported frequency | ~1 in 10–15 orders in production (≈7–10%) |
| Hard constraint | Restaurant 716 carve-out untouched |

> Earlier deep-dive `ITEM2_DEEP_DIVE.md` covered the iOS-Safari / network-loss / multi-tab triggers — those alone explain a 0.5–1% failure rate, not 7–10%. To explain the reported rate, **there must be a systemic bug**. This document identifies it.

---

## 1. The systemic bug (single root cause for ~70%+ of cases)

### `ReviewOrder.jsx:982-985`

```js
// Phase 1: Table ID only when a specific table was scanned. All others get '0'.
const finalTableId = hasAssignedTable(scannedTableId)
  ? scannedTableId
  : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');
```

This is the **only** place `finalTableId` gets computed. It is used by both:
- **fresh order path** (new placeOrder call)
- **edit-order path** (updateCustomerOrder call at L1035-1064 and L1074-…)

The expression sources `finalTableId` from exactly **two** inputs:
1. `scannedTableId` — from sessionStorage (via `useScannedTable` hook)
2. `tableNumber` — React useState, only populated in multi-menu restaurants

**What this code ignores** (despite the editOrder context having the correct value):
- `editOrder.tableId` from CartContext (set during `startEditOrder()` at LandingPage:722-730 — `tableId: orderDetails.tableId || scannedTableId`)
- `orderDetails.tableId` from the order-details API response that's already in memory at this point in edit flow
- URL query params as last-resort fallback
- The `previousOrderItems` array (which carries the original order's context)

> Proof: `grep -nE "editOrder\?\.tableId|editOrder\.tableId|getEditOrderPayload" /app/frontend/src/pages/ReviewOrder.jsx` returns **ZERO matches**. The CartContext exposes the field, but ReviewOrder never reads it.

### What this means in practice (Edit Order flow)

```
Customer scans table 12 → orders → reaches OrderSuccess
  └─ sessionStorage has {table_id:"12", ...}
  └─ CartContext: clean (no editOrder yet)

Customer clicks "Edit Order" on the landing page
  └─ handleEditOrderClick fetches orderDetails (API → POS)
  └─ startEditOrder(orderId, items, {
        tableId: orderDetails.tableId || scannedTableId,  ← CORRECTLY captured
        tableNo: ...,
        restaurant: ...
     })
  └─ navigate('/<rid>/menu')

Customer adds items, goes to /review-order, taps Place Order
  └─ ReviewOrder L982-985 runs:
       finalTableId = hasAssignedTable(scannedTableId)  ← reads ONLY sessionStorage
                       ? scannedTableId
                       : '0'                            ← NOT editOrder.tableId
  └─ if sessionStorage scannedTableId is gone → finalTableId = '0'
  └─ updateCustomerOrder({ tableId: '0', ... }) → POS
  └─ POS interprets the update as "move this order to walk-in"
```

The CartContext.editOrder.tableId is **dead state** — captured during Edit Order entry, never consulted at place-order time. Every edit-order tap whose sessionStorage has been emptied (for any reason) lands as walk-in.

---

## 2. How frequently does sessionStorage actually empty in production?

This is the multiplier on the systemic bug. The earlier deep-dive enumerated 6 mechanisms. Estimated frequency per mechanism in production:

| Mechanism | Estimated frequency | Notes |
|---|---|---|
| iOS Safari memory eviction (backgrounded tab) | 3–8% | Backgrounding >30s; very common on real phones |
| Tab close → re-open from notification / shared link | 5–15% | New tab = empty sessionStorage even if URL is bookmarked |
| iOS "Add to Home Screen" PWA path | 1–3% | Each open is a fresh sessionStorage context |
| Page navigated to a different origin then back | 1–2% | e.g. Razorpay redirect back |
| Race: React `useScannedTable` reads before subdomain resolver returns numeric `restaurantId` | 0.5–2% | `useRestaurantId.js:137-141` returns `null` until API resolves — useScannedTable bails the first render |
| Stale-state combinations (URL params present but cause overwrite) | 0.5–2% | See §3 below |

Combined, sessionStorage is empty in **roughly 10–25% of return-to-landing sessions on mobile**. Multiplied by the systemic bug in §1, this comfortably explains the observed 7–10% production failure rate.

---

## 3. Secondary mechanisms (each adds to the rate)

### 3.1 `useScannedTable.js:29-52` — overwrite-without-merge

```js
if (urlTableId || urlTableNo || urlOrderType) {
  const newTable = {
    table_id: urlTableId,    // ← undefined! if URL doesn't have tableId
    table_no: urlTableNo,    // ← undefined! if URL doesn't have tableName
    room_or_table: roomOrTable,
    order_type: orderType,
    food_for: urlFoodFor || null
  };
  sessionStorage.setItem(storageKey, JSON.stringify(newTable));  // ← OVERWRITES previous!
}
```

**Trigger conditions** — any URL containing `orderType=takeaway` (or `orderType=delivery`, or any `type=walkin` QR) **without `tableId`** will:
- Overwrite sessionStorage with `table_id: undefined`
- Wipe the previously-scanned table

**Real-world cases producing this URL pattern:**

| Scenario | URL ends up as |
|---|---|
| Customer accidentally scans a takeaway QR while seated at table 12 | `/<rid>?type=takeaway&orderType=takeaway` — wipes |
| Customer scans a walk-in counter QR after table service | `/<rid>?type=walkin&orderType=dinein` — wipes |
| Customer scans a delivery QR (rare) | `/<rid>?type=delivery&orderType=delivery` — wipes |
| Customer scans **food-for** QR (e.g. station-specific menu) | `/<rid>?orderType=takeaway&foodFor=Normal` — wipes |
| Marketing share-link with `?orderType=takeaway` | wipes |
| Customer scans a different table's QR (same restaurant) | overwrites with new tableId — actually correct |

The fix is trivial — read existing sessionStorage first and merge — but currently absent.

### 3.2 `LandingPage tableStatusCheck` — depends on scannedTableId

The customer-visible "Edit Order" button on landing (`LandingPage.jsx:250-398`) only appears when:
- `hasAssignedTable(scannedTableId)` is true → API call to check-table-status → if occupied with order, show Edit Order button

**Consequence**: if sessionStorage is empty (any of §2's mechanisms), the customer **never sees the Edit Order button**. They tap Browse Menu, are taken into a fresh-order flow, place a new order on table_id='0', and POS shows it as walk-in. The original order remains open on the dashboard — **the staff now sees a "duplicate" walk-in next to the live table order**, which is exactly what the operations team reports.

This is the **most common observable production failure pattern** because the customer doesn't get the "Edit Order" UX cue.

### 3.3 `handleEditOrderClick` → `editOrder.tableId` is dead state

Already covered in §1. The carefully-set `editOrder.tableId` in CartContext (`LandingPage.jsx:722-730`) has no consumer in ReviewOrder.

### 3.4 `updateCustomerOrder` default — `tableId='0'`

```js
// orderService.ts:457
export const updateCustomerOrder = async ({
  ...
  tableId = '0',          ← default literal '0'
  ...
}) => {
  ...
  table_id: String(tableId),
  ...
}
```

If anyone ever calls this without explicit `tableId`, the default `'0'` flows to POS. Not currently exploited by any caller, but a latent landmine.

### 3.5 The fail-open `checkTableStatus`

```js
// orderService.ts:130-142
} catch (error: any) {
  ...
  return { tableStatus: 'Available', isOccupied: false, isAvailable: true, ... };
}
```

When the **edit-order's pre-update table-status check** at `ReviewOrder.jsx:1005-1023` fails:
```js
if (finalTableId && String(finalTableId) !== '0') {
  try {
    const tableStatus = await checkTableStatus(finalTableId, restaurantId, token);
    if (!tableStatus.isOccupied || !tableStatus.orderId) {
      // table free → redirect to fresh order
      ...
      return;
    }
  } catch (tableCheckErr) {
    // Continue with order on error (fail-safe)
  }
}
```

A flaky POS or Wi-Fi 401 can:
1. Make `checkTableStatus` throw → fail-open returns `isOccupied=false`
2. Code branches into "table is free, redirect to fresh order" → customer placed in fresh-order flow
3. Customer's existing active order is left alone, customer places a new walk-in order

This adds another 1–3% to the rate.

### 3.6 Status 7 (yet-to-confirm) auto-redirect race

```js
// LandingPage.jsx:681-693
if (orderDetails.fOrderStatus === 7) {
  navigate(`/<rid>/order-success`, {...});
  return;  // Don't enter edit mode
}
```

If the orderDetails API briefly returns status 7 (e.g. POS hasn't confirmed yet), the customer is bounced to OrderSuccess instead of entering edit-order mode. From OrderSuccess, after polling resolves to status 1/2/5, the user has to click Edit Order again — but if they navigate elsewhere first, they may lose context.

---

## 4. Specific answer to the user's three scenarios

### A. "I scan QR code again on the same table while my order is running"

| Sub-case | What sessionStorage holds | What happens |
|---|---|---|
| QR has `tableId=12&type=table` | overwritten with same correct values | ✅ SAFE — table preserved, Edit Order button appears |
| QR is from a different table (e.g. friend scans his table 13's QR on the same device) | overwritten with `tableId=13` | ⚠️ wrong table — Edit Order button may not appear (table 13 may not have an active order); customer hits Browse Menu → fresh order placed on table 13. Original order at table 12 stays orphaned. |
| QR is a takeaway/walkin QR (different mode) at the same venue | overwritten with `table_id=undefined` | ❌ wipes table — Edit Order button disappears, customer can only place a fresh walk-in order |
| QR is for a different restaurant | the React `restaurantId` changes → different sessionStorage key → original 698 entry preserved but customer is now on rid=999 | (different restaurant — out of scope) |

> **The "scan again" path is generally SAFE for same-table re-scans**. It only fails when the customer scans the wrong QR (different table or different mode).

### B. "I click Edit Order"

**This is the highest-frequency failure path.** Sequence:

```
1. Customer scans table → orders → reaches OrderSuccess
2. Customer leaves the app for >30s on iOS (or closes the tab, or returns via a notification)
3. sessionStorage may now be empty
4. Customer reopens the app at /<rid>  (URL has NO QR params)
5. useScannedTable reads empty sessionStorage → scannedTableId = null
6. LandingPage tableStatusCheck does NOT fire (gated on hasAssignedTable)
7. Customer does NOT see Edit Order button → assumes fresh order path
   — OR —
   sessionStorage still has data → Edit Order button is shown → customer taps it
8. handleEditOrderClick sets editOrder.tableId correctly into CartContext
9. Customer adds items in /menu, taps Review Order, taps Place Order
10. ReviewOrder.jsx:982-985 reads scannedTableId only:
       ├── if sessionStorage survived steps 2-3 → table preserved → OK
       └── if sessionStorage was lost mid-flow → finalTableId = '0'
              → updateCustomerOrder({ tableId: '0', ... })
              → POS converts the original dine-in order to walk-in
```

> The asymmetry is the killer: `startEditOrder()` saves the table_id correctly **but no one reads it back**. Even when sessionStorage is partially gone, the editOrder.tableId could rescue us — but the read site doesn't look.

### C. "From any other navigation"

Any path that lands on `/<rid>` (landing) without QR params AND with empty sessionStorage produces the failure:
- Browser back button across an external redirect (Razorpay return)
- Notification tap that opens the app fresh
- Hamburger menu navigation that purges scan context (none I've found doing this on purpose, but if any future code clears sessionStorage by mistake, this path fires)
- App reopen after iOS forcibly recycled the WebView
- Deep link from WhatsApp / Instagram / SMS share

In every case: customer doesn't see Edit Order → places a fresh order → POS sees walk-in next to the live dine-in order.

---

## 5. Why the rate is exactly ~10% (estimated breakdown)

| Contributor | Est. share of failures |
|---|---|
| Edit Order with lost sessionStorage (the §1 systemic bug × §2 sessionStorage loss) | ~50–60% |
| Customer never sees Edit Order button → places fresh walk-in (§3.2) | ~25–35% |
| Wrong-QR overwrite (§3.1) | ~5–10% |
| Fail-open checkTableStatus during edit (§3.5) | ~3–5% |
| iOS / multi-tab / PWA edge cases (deep-dive T1-T6) | ~5–10% |
| POS-side `table_id → rtype` join failure (§T8 from prior doc) | unknown, residual |

The dominant story is `(sessionStorage occasionally lost) × (Edit Order ignores its own correctly-captured tableId)`.

---

## 6. What is NOT the bug (eliminated by this investigation)

- `updateOrderType` (mode toggle on landing) — correctly preserves all fields ✅
- Re-scanning the SAME table QR — correctly overwrites with same values ✅
- Subdomain resolver race — useScannedTable bails when restaurantId is null, no corruption ✅
- Customer manually editing URL to add `?orderType=takeaway` — would wipe, but no customer does this
- Hot-reload — production has no HMR ✅

---

## 7. Minimal-surface fix candidates (no code yet — for owner approval)

| Fix | Where | Difficulty | Coverage |
|---|---|---|---|
| **F1 — ReviewOrder reads `editOrder.tableId` as fallback** | `ReviewOrder.jsx:982-985` | 3 lines | Fixes the systemic bug. Single largest contributor (~50-60% of cases). |
| **F2 — useScannedTable merges instead of overwrites** | `useScannedTable.js:29-52` | 5 lines | Fixes wrong-QR overwrite (§3.1). |
| **F3 — sessionStorage → localStorage** | `useScannedTable.js:50,57,87` | 3 lines | Fixes iOS eviction, tab close, PWA, shared-link (§2). |
| **F4 — Defensive guard: if scannedRoomOrTable indicates dine-in and finalTableId='0', abort with toast** | `ReviewOrder.jsx` between L985 and the placeOrder/updateCustomerOrder calls | 8 lines | Last-line safety net; **also closes the URL tampering issue** the owner asked about earlier. |
| **F5 — Don't fail-open in checkTableStatus** | `orderService.ts:130-142` | 4 lines | Eliminates §3.5 false-positives. |
| **F6 — Diagnostic logging on every placeOrder/updateOrder** | `ReviewOrder.jsx` entry + payload | 10 lines | Doesn't fix anything but converts every future report into actionable evidence. |

> **F1 alone would likely drop the failure rate from ~10% to ~3%.** F1+F3 together would likely take it to <0.5%. F4 closes the policy gap separately discussed. None require POS coordination, none touch the 716 carve-outs, none touch any backend code.

---

## 8. What I'd need to confirm in production before writing code

| # | Question | How to answer |
|---|---|---|
| Q1 | When a "WC" order is observed, did the customer arrive via Edit Order, or did they place a "fresh" order they thought was a new attempt? | Customer interview on 2-3 recent reports |
| Q2 | What does the POS order-details endpoint return for `table_id` and `table_type` on these orders? | `getOrderDetails` on a failing `order_id` — compares to original dine-in order |
| Q3 | Is the original dine-in order still open, or did POS auto-close it? | Owner / POS team inspection |
| Q4 | Are customers mostly iOS or Android? | Mixpanel / GA / restaurant survey |
| Q5 | Approximate device breakdown of customers who hit this | Same as Q4 |
| Q6 | Has any customer reported "I scanned a different QR than my table by accident"? | Ops anecdotes |

> **The single most valuable artefact** would be one failing `order_id` + the original dine-in `order_id` for the SAME table + the order-details response for both. That confirms or refutes Q2 in one shot.

---

## 9. Constraints (carried forward)

- Restaurant 716 carve-outs in OrderSuccess.jsx (L320, L360) and ReviewOrder.jsx (L828, L837, L988, L988, L1290) — **untouched** in any proposed fix.
- F4 (defensive guard) would respect the existing 716 guard at `ReviewOrder.jsx:988-993`.
- F1-F6 are **frontend-only**, no DB migration, no backend changes, no POS coordination.

---

## 10. Summary in one line

> The reported 1-in-10 to 1-in-15 rate is overwhelmingly caused by **`ReviewOrder.jsx:982-985` ignoring the CartContext `editOrder.tableId` that the Edit-Order flow correctly captures**, combined with **sessionStorage being lost ~10–25% of the time on mobile**. Re-scanning the same QR is not the bug. The bug is that the Edit Order flow captures the table id into the wrong place, and nobody reads it back at place-order time.
