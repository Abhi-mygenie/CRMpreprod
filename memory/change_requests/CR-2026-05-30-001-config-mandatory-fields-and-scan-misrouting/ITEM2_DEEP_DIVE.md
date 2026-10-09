# CR-2026-05-30-001 — Item 2 Deep Dive (Production-Only "New Table" / WC Fallback)

| Field | Value |
|---|---|
| Date | 2026-05-30 |
| Mode | Investigation only — **NO CODE / CONFIG EDITS** |
| Symptom confirmed | **B** — order lands as a separate "WC" / walk-in row on the POS dashboard, not attached to the scanned table |
| User-stated repro | Not reproducible locally; happens in production |
| Hard constraint | Restaurant **716** stays untouched |

---

## 0. What we mean by "new table" in concrete terms

A POS table is **not** created by the customer app — the customer app cannot create rows in POS's `table_config`. So "new table" really means *one of these*:

| Visible to staff as | What actually happened | Where it originates |
|---|---|---|
| A new **WC / walk-in row** on the dashboard for the same physical table | The customer app sent `table_id='0'` (or empty) and POS had no row to attach to — fell back to walk-in | Client side — `ReviewOrder.jsx:983-985` |
| A new **duplicate order** on the same table id | The customer app sent the correct `table_id` but POS already had an open order — POS opened a second one (this client's dedup guard failed open) | Client side — `orderService.ts:130-142` |
| Order on a **different** table id than the one scanned | `scannedTableId` was overwritten between scan and place-order (manual selector / sessionStorage write-back) | Client side — `ReviewOrder.jsx:182-207` |

The user confirmed **symptom B → option (b) above: WC fallback**. So the question collapses to:

> **"How can `table_id='0'` (or any value POS treats as 'no table') reach the POS even when the customer clearly scanned a valid table QR?"**

The answer below isolates **eight independent production-only triggers**, ranked by likelihood, with the exact frames of code that produce them and the production-vs-dev factors that hide them locally.

---

## 1. The single output line that produces the bug

`/app/frontend/src/pages/ReviewOrder.jsx:982-985` (normal path) and `:1284-1287` (auth-retry path):

```js
const finalTableId = hasAssignedTable(scannedTableId)
  ? scannedTableId
  : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');
```

`hasAssignedTable` (`utils/orderTypeHelpers.js:42-44`):
```js
return !!scannedTableId && String(scannedTableId) !== '0';
```

`finalTableId` flows into `placeOrder(..., tableNumber: finalTableId, ...)` → `orderService.ts:371`:
```js
table_id: String(orderData.tableId || orderData.tableNumber || '')
```

Or for multi-menu via `helpers.js:472`:
```js
table_id: String(tableId || tableNumber || '0')
```

**Decision matrix** for `finalTableId`:

| `scannedTableId` (sessionStorage) | `tableNumber` (React state) | isMultiMenu | Outgoing `table_id` |
|---|---|---|---|
| `"3245"` valid | * | * | ✅ `"3245"` |
| `null/""/"0"` (lost) | `"3245"` valid | yes | ✅ `"3245"` |
| `null/""/"0"` (lost) | `null/""` | yes | 🔴 `"0"` |
| `null/""/"0"` (lost) | `null/""` | no | 🔴 `"0"` |
| `null/""/"0"` (lost) | `"3245"` valid | **no** | 🔴 `"0"` *(this surprised me — manual `tableNumber` only saves multi-menu)* |

> Note the last row: for a **single-menu** restaurant, the manually-selected `tableNumber` is **not** used as a fallback. The branch literally requires `isMultiMenu` to be true. Single-menu restaurants that lose `scannedTableId` have no second chance.

---

## 2. Where `scannedTableId` lives, when it goes empty

`scannedTableId` is **always** read from React state hydrated from sessionStorage by `useScannedTable.js`. The hook re-reads on every navigation:

```js
// useScannedTable.js:55-67
try {
  const stored = sessionStorage.getItem(`scanned_table_${restaurantId}`);
  if (stored) setScannedTable(JSON.parse(stored));
  else setScannedTable(null);   // ← returns null → hasAssignedTable() → false
} catch {
  setScannedTable(null);          // ← same: JSON parse error
}
```

So "table context lost" = `sessionStorage["scanned_table_<rid>"]` is **missing, empty, or unparseable** at the moment React reads it on the `/review-order` route.

There is no defensive fall-through to localStorage, no recovery from URL, no recovery from the in-flight `tableStatusCheck` that the LandingPage already did.

---

## 3. Eight independent production-only triggers (ranked by likelihood)

### T1. iOS Safari memory eviction of sessionStorage **while the tab is backgrounded**  ⭐⭐⭐⭐⭐
- iOS Safari aggressively evicts JS heap and `sessionStorage` for tabs that are backgrounded or covered by another app for ~30 seconds or more (well-documented since iOS 13). The page itself stays "alive" enough that React re-mounts with `sessionStorage` already empty.
- **Production-only**: dev machines almost never background a tab.
- **Reproducer in production**: scan QR → put phone in pocket / accept a call / open WhatsApp → return to the menu → scroll → Place Order. The tab is the same, the URL is the same, but `sessionStorage` is gone.
- **Customer perception**: "I never left the page."
- **What we observe in code**: `useScannedTable.js:55-67` returns `null`, `ReviewOrder.jsx:982-985` falls back to `'0'`, POS classifies as walk-in.

### T2. The page reload that's invisible to the customer (PWA / "Open in app" / shared link refresh)  ⭐⭐⭐⭐
- Many hotels print the QR as an "open in browser" URL with their domain. iOS Safari sometimes opens these via the **Smart App Banner** flow, and Android sometimes routes through **Intent / Chrome Custom Tab**. Both can re-instantiate the page in a new tab. **New tab = empty sessionStorage.** The URL the user re-opens often does NOT contain the original `?tableId=…` query string — it's been stripped after the first navigation.
- Same destination: `scannedTableId=null` → `'0'` → WC.
- **Why dev misses this**: in dev we keep the QR URL with params in the address bar.

### T3. Customer switches Wi-Fi networks mid-session and `checkTableStatus` 401s → silent token refresh → 401 retry path that **re-reads `scannedTableId`** at a different moment  ⭐⭐⭐⭐
- `responseErrorInterceptor.js:47-67` retries a 401 once by force-refreshing the auth token (which calls `loginForToken()`). The retry then re-issues the original request transparently.
- But for `placeOrder` specifically there is also an **app-level** 401 retry path at `ReviewOrder.jsx:1276-1340`. **It re-reads `scannedTableId` again** to compute a fresh `retryTableId` (`:1285-1287`).
- **Production-only race**: token expires while the user is in the menu (TOKEN_EXPIRY_TIME = 10 minutes — see `authToken.js:11`, despite a misleading comment saying 30 minutes). Inside the retry block, React state has not yet been re-hydrated from sessionStorage (because the in-flight `placeOrder` was thrown into the catch block before any setState). If `scannedTableId` happened to be temporarily `null` (e.g. mid-mount of a child component, a stale closure on the `scannedTable` state, or a quick re-render triggered by an unrelated state change), the retry uses `'0'` even though sessionStorage still has the value.
- This is one of the cases where **on the customer's screen everything looked fine** but the network actually retried once.

### T4. Hardcoded shared `REACT_APP_LOGIN_PHONE` / `REACT_APP_LOGIN_PASSWORD` token contention  ⭐⭐⭐⭐
- `authToken.js:15-21` — the **entire customer app** authenticates to POS with a **single shared credential pair** from env. Every customer browser uses the same login.
- The token is stored in **localStorage**, expires in 10 minutes (per `TOKEN_EXPIRY_TIME`).
- Every `getAuthToken()` call that finds the token expired calls `loginForToken()` and overwrites localStorage with the new token.
- **Production scenario**: many concurrent customers all hit the same login endpoint. POS-side rate limits / IP throttles can return 401 / 429 intermittently. A 401 reaches the response interceptor, which calls `getAuthToken(true)` (`response.js:60`). If THAT login fails, `clearStoredToken()` runs and **the original `checkTableStatus`/`placeOrder` request is rejected** — but the customer's UI flow continues into the catch block (`ReviewOrder.jsx:1240-1450`).
- The catch block's `isTrueNetworkLoss` heuristic at `:1258-1265` requires `error?.isAxiosError === true || ...`. A 401-after-401-refresh is NOT axios network-error; it's a 401 with no retry → falls to the generic `toast.error(...)` and **leaves the placing-order ref in a re-attemptable state** unless one of the inner `isPlacingOrderRef.current = false` lines fires. **Re-tapping Place Order then re-enters `handlePlaceOrder` with the same state** — but **after the first failed attempt, the user may have already scrolled, switched mode, or interacted with the table selector, any of which can mutate `tableNumber` to empty**.
- *This is the most subtle one and probably the actual production trigger for some unknown fraction of cases.*

### T5. The `useEffect` "save manual selection to sessionStorage" can **overwrite a scanned context** under one condition  ⭐⭐⭐
- `ReviewOrder.jsx:182-207`:
  ```js
  useEffect(() => {
    if (!numericRestaurantId || !roomOrTable) return;
    if (!tableNumber) return;
    if (String(numericRestaurantId) === '716' && !scannedTableId) return;
    const pool = roomOrTable === 'room' ? rooms : tables;
    const entry = (pool || []).find(x => String(x.id) === String(tableNumber));
    if (!entry) return;
    sessionStorage.setItem(`scanned_table_${numericRestaurantId}`, JSON.stringify({
      table_id: String(entry.id), table_no: entry.table_no,
      room_or_table: roomOrTable, order_type: 'dinein', food_for: null,
    }));
  }, [numericRestaurantId, tableNumber, roomOrTable, rooms, tables, scannedTableId]);
  ```
- This effect **writes** sessionStorage whenever `tableNumber` and `roomOrTable` are set AND we can find that id in the `rooms`/`tables` pool.
- **Production-only failure mode**: if `useTableConfig` (which produces `rooms`/`tables` from a POS call) **fails or returns an empty list** but `tableNumber` has been hydrated from session (the auto-fill effect `:540-548`), the `(pool || []).find(...)` returns `undefined`, and the effect bails (`if (!entry) return;`) — sessionStorage is **not overwritten**, but the auto-fill effect at `:553-562` will then run `setTableNumber('')` if `restaurantId === '716'` (irrelevant here, 716 is excluded) — for non-716 the auto-fill effect at `:540-548` runs `setTableNumber(scannedTableId)`. If `scannedTableId` is in turn empty (T1/T2 happened), `tableNumber` is cleared.
- **Net effect**: a slow / failing `/api/table-config` call after a backgrounded tab returning silently clears the table selection without the user ever touching it. Subsequent Place Order → `'0'`.
- The only `try/catch` around this effect is the outer `try` for sessionStorage quota; the empty-pool branch is silent.

### T6. Edit Order from OrderSuccess hands a stale `scannedTableId` to ReviewOrder  ⭐⭐⭐
- When a customer taps "Edit Order" on OrderSuccess, the code calls `startEditOrder(existingOrderId, previousItems, { tableId: orderDetails.tableId || scannedTableId, tableNo: ..., restaurant: ... })` (`LandingPage.jsx:606-614`).
- The `scannedTableId` used here is the **React-state** value at that instant — which can be `null` if sessionStorage was already evicted (T1/T2). The order's own `orderDetails.tableId` is preferred BUT only if non-empty.
- If both are empty, the cart context's `tableId` is `null`. Then in ReviewOrder the auto-fill effect (`:540-548`) doesn't re-write `tableNumber`, and `finalTableId='0'` again.
- Note: this path is most often hit when a customer was finishing an order, got logged out for 10+ min, re-opened the success page from a notification, and tapped Edit Order. The dashboard then sees the *update* as a new order or a `table_id=0` write.

### T7. Restaurant 716 carve-out is the **mirror image** for non-716  ⭐⭐
- Path 1/2/3 of the May-8 investigation (paid / cancelled / 404) were already fixed by Option G1 — but **only behind `if (String(restaurantId) === '716') ...`**. For non-716 the wipe is now skipped — i.e., **for non-716 this is no longer the trigger**.
- I'm listing this only to be explicit that paths 1/2/3 are **not** in the production trigger set for non-716 anymore. If a non-716 restaurant is reporting the symptom, T1/T2/T3/T4/T5/T6 are where to look.

### T8. POS-side classification cannot distinguish a *valid* dine-in `table_id` from "0" / unknown  ⭐
- See `ROOM_SCANNER_ORDER_AS_WALKIN_INVESTIGATION_2026-05-08.md` §4. Even when our payload is well-formed (`table_id='3245'`, `order_type='dinein'`), the POS must do a `table_id → rtype` join to label it correctly. If that join is brittle (string-vs-int, stale id, deleted table, restaurant_id mismatch), the dashboard falls back to walk-in.
- **This one is POS-side, not in this repo**. But it can produce identical symptoms to T1–T6, and you cannot tell the two apart without (a) the order_id of a failing case and (b) the order-details API response. So a single bug report could be either family.

---

## 4. Why this is invisible in dev / staging

| Factor | Dev / staging | Production |
|---|---|---|
| iOS Safari memory eviction | Almost never happens (DevTools open / fresh tab) | Constant on a real phone in a hotel restaurant |
| Concurrent shared-login token contention | One developer = one customer = no contention | Hundreds of customers / hour on the same login |
| Network 401 + retry combinations | Mocked / stable LAN | Hotel Wi-Fi, captive portals, 4G→Wi-Fi handovers |
| Tab backgrounding for >30 s | Devs keep DevTools open | Customer talks to friend / scrolls in another app |
| Cart-vs-table storage mismatch | Single short session | localStorage cart can outlive sessionStorage table by hours |
| `useTableConfig` (the rooms/tables pool) — failure rate | Local mock returns fast | Real POS call, occasional 5xx / 401 |
| Customer crosses 10-min token expiry mid-flow | Almost never (we move fast in dev) | Routine — people read the menu for 20 min |

The combination of localStorage-cart-survives + sessionStorage-table-evicted + single-shared-token + 10-minute token expiry creates a production failure surface that is **statistically inevitable**, even if each individual factor has a tiny probability.

---

## 5. The exact frame-by-frame chain that produces a "WC" order in production

Putting T1–T6 together, here is the most likely lived experience:

```
T0:  Customer scans  GET https://app/<rid>?type=table&tableId=3245
     → useScannedTable.js writes sessionStorage["scanned_table_<rid>"]
T0:  React state:  scannedTableId='3245', isScanned=true
T0:  cart=[] in React, localStorage['cart_<rid>'] = {items:[], expiresAt:T0+3h}

T1:  Customer adds 4 items → localStorage['cart_<rid>'] updated. Total = ₹830.

T2:  Customer's phone screen sleeps. iOS Safari backgrounds the tab.
     ~45 s later iOS evicts sessionStorage['scanned_table_<rid>']
     (localStorage['cart_<rid>'] survives.)

T3:  Customer comes back. Tab is the same. React state still says
     scannedTableId='3245' — but ONLY because the React state in memory hasn't
     been re-derived from sessionStorage. Any of the following triggers a
     re-read that will now return null:
       (a) Navigation between /menu and /review (useScannedTable's
           useEffect re-fires because `restaurantId` reference changed)
       (b) Component unmount on memory pressure
       (c) The user pulls-to-refresh on iOS (subtle, common)

T4:  Customer taps "Review Order" → /review-order
     useScannedTable's effect runs → sessionStorage empty → returns null
     React state now: scannedTableId=null, isScanned=false

T5:  ReviewOrder.jsx:540-548 auto-fill effect fires:
     needsTableAutoFill = isDineInOrRoom('dinein') && scannedTableId
                        = true && null  → false
     → tableNumber stays '' (its initial useState value).

T6:  Customer hits Place Order. handlePlaceOrder (line 814) runs:
     - L827-834 room-guard: scannedRoomOrTable !== 'room' → guard skipped
     - L837-857 multi-menu branch: not multi-menu OR has neither
       scannedTableId nor tableNumber → falls through (no toast)
     - L1118-1131 checkTableStatus(finalTableId='0', ...) — but finalTableId
       hasn't been computed yet, that's on L983. Sequence in code is:
         (i) Validation block 827-857 passes (no toast on the silent-walk-in case)
         (ii) Token block 884-900
         (iii) Set isPlacingOrder=true, try { ... L982-985 finalTableId='0'
         (iv) L1005 / L1118 — skipped because String(finalTableId)==='0'
              → No table-status check is performed at all. The bug is now
              guaranteed to land.
         (v) L1161 placeOrder(..., tableNumber: '0', ...)

T7:  POS receives table_id='0'. No table row 0. Falls back to walk-in.
     Order shows up as "WC" / "Gaurav" / etc. on dashboard.

T8:  Customer sees a normal Order Success page (they don't know).
     Staff sees a mystery WC order with their table's items.
```

The chilling part is step (iv): **once `finalTableId='0'`, the duplicate-order guard at `:1118-1131` is intentionally skipped** (because the guard is `if (... finalTableId && String(finalTableId) !== '0') ...`). So the very feature meant to prevent duplicates **opens the floodgate** for the "0" case.

---

## 6. Why it looks "intermittent" to operators

| Factor | Drives randomness |
|---|---|
| iOS Safari eviction heuristics | Internal Apple algorithm; varies by device pressure |
| POS 401/429 from shared login | Time-of-day, restaurant traffic, IP load |
| Token expiry crossing | Customer's read time vs. 10-min boundary |
| Pool-loading delay (T5) | POS latency for that one call |
| Customer behaviour | Phone-in-pocket duration, multitasking |

A 0.5 % per-order failure rate is enough to produce 5 "mystery WC" orders per 1,000 — which is exactly the kind of complaint volume that gets escalated but is hard to reproduce on demand.

---

## 7. Failure-of-defences map

The code has *multiple* defences. **All of them fail open** in the `table_id='0'` case:

| Defence | Where | Triggers when ID is `'0'`? |
|---|---|---|
| `tableStatusCheck` on landing | `LandingPage.jsx:250-398` | Skipped: `!hasAssignedTable(scannedTableId)` early-returns (`:255`) |
| Pre-submit table-occupied guard | `ReviewOrder.jsx:1118-1131` | Skipped: `String(finalTableId) !== '0'` is a precondition |
| Edit-mode table-occupied guard | `ReviewOrder.jsx:1005-1023` | Same — gated on `'0'` exclusion |
| Room-context guard | `ReviewOrder.jsx:827-834` | Only fires for `scannedRoomOrTable==='room'` — does NOT cover tables |
| Duplicate guard on dispatch ref | `ReviewOrder.jsx:872-874` | Works only within a single tap session; not for "0" leakage |
| Network-loss heuristic | `ReviewOrder.jsx:1258-1265` | Doesn't see `'0'` at all — it only classifies transport errors |
| OrderSuccess scan-context preservation (G1) | `OrderSuccess.jsx:314-322` | Only relevant for repeat-orders-after-paid (room flow). Doesn't fire for first-order WC. |

There is **literally no client-side line** that says *"if scanned context says a real table but `finalTableId` is `'0'`, abort and show a toast"*. The room version of that guard exists (`:827-834`); the table version does not.

---

## 8. What disambiguates which trigger fired (we cannot tell from code alone)

To convert "we know how it can happen" into "we know why this specific order failed", we need (for one failing order, non-716):

| Datum | Source | What it tells us |
|---|---|---|
| `order_id` + `restaurant_id` | POS dashboard | Lets us read back the order-details API |
| `order_details.table_id` value | `getOrderDetails(orderId)` response | If `"0"` → confirms client-side leak (T1-T6). If non-zero → POS-side join bug (T8). |
| `order_details.table_type` | same | Confirms whether POS *did* recover room/table from `table_id` |
| Approximate device / OS / browser | customer | iOS Safari = T1 in play |
| Time between QR scan and "Place Order" tap | customer | >10 min = token-expiry path active |
| Was payment "online" or "COD"? | customer | Online uses Razorpay handler — different success path |
| Was this their first order in the session, or a repeat after another paid order? | customer | First → not T7; repeat → T6 in play |

Without at least the first three rows, every trigger above is "plausible" — none can be elevated to "definite". This is the same blocker that prevented closing the May-8 investigation.

---

## 9. What I am NOT recommending (yet)

This document deliberately does not propose code changes. The May-8 doc already enumerated G1–G5 for the room case; most of those mitigations apply identically to tables:

- G2 — `sessionStorage` → `localStorage` for scanned-table → addresses T1, T2, T4-aftermath
- G3 — Table version of the existing room-context guard at `ReviewOrder.jsx:827-834` → addresses T1–T6 by aborting with a toast instead of silently sending `'0'`
- G5 — Diagnostic log at `handlePlaceOrder` entry capturing `{ scannedTableId, tableNumber, sessionStorageRaw, restaurantId, isMultiMenu, finalTableId, tokenAgeMs, navigationCount, isiOS }` → lets the next bug report be triaged in seconds

And two table-specific items that didn't apply to rooms:

- T7 — Audit the `useEffect` at `ReviewOrder.jsx:182-207` for the empty-pool branch (T5). Probably should NOT clear sessionStorage on pool-fetch failure.
- T-AUTH — The 10-minute single-shared-credential token model (`authToken.js:11-22, 93-124`) is a structural risk. Even if we fix everything above, a 401-storm during a busy lunch hour will still produce WC orders. This is bigger than this CR and probably needs its own RFC.

---

## 10. Asks for the owner before any fix is planned

1. **One failing order** — order_id + restaurant_id + the order-details API response. Without this we cannot tell T1–T6 (client-side) from T8 (POS-side). One real datapoint will collapse 80 % of the search space.
2. **Affected restaurants list** — are these complaints concentrated on iOS-heavy venues (would point at T1), high-traffic venues (T4), venues with unreliable Wi-Fi (T3), or evenly spread (T5/T8)?
3. **Approximate frequency** — 1 in 100, 1 in 1,000, 1 in 10,000? Drives whether we can ship a single fix vs. a defensive stack.
4. **Confirmation** that 716 is *not* in the affected list — if 716 IS in the list, the room-only carve-out has a regression we need to revisit (different CR).
5. **Authorisation** to instrument production with G5 (the diagnostic log) **before** writing the fix. Today the customer-app has no place-order audit trail beyond client-side `logger.order(...)` which is dropped. We need at minimum a server-side echo of `{scannedTableId, finalTableId, sessionStorageRaw}` on every order POST so we can stop guessing.

---

## 11. Files cross-referenced in this deep dive (read-only)

```
frontend/src/hooks/useScannedTable.js           (full)
frontend/src/utils/orderTypeHelpers.js          (42-44)
frontend/src/utils/authToken.js                 (1-163)
frontend/src/api/interceptors/response.js       (full)
frontend/src/api/services/orderService.ts       (40-145, 271-410, 411-533)
frontend/src/api/transformers/helpers.js        (380-491)
frontend/src/api/config/endpoints.js            (9-50)
frontend/src/context/CartContext.js             (1-100)
frontend/src/pages/LandingPage.jsx              (140-410, 414-543, 600-620)
frontend/src/pages/ReviewOrder.jsx              (140-210, 530-562, 813-1131, 1240-1340)
frontend/src/pages/OrderSuccess.jsx             (130-380)
```

**No file modified. No config modified. No service restarted.**
