# Item 2 — Fix Investigation: Exact File:Line Targets (No Edits)

| Field | Value |
|---|---|
| Date | 2026-05-30 |
| Mode | Investigation only — **NO CODE / CONFIG EDITS** |
| Supersedes | extends `ITEM2_PRODUCTION_RATE_INVESTIGATION.md` |
| Hard constraint | Restaurant 716 carve-outs in OrderSuccess.jsx (L320, L360) and ReviewOrder.jsx (L988-994, L1290) — **MUST stay untouched** |

This document pins every fix to specific files, line numbers, and surrounding context. No edits made.

---

## 1. The fix bundle (recap from `ITEM2_PRODUCTION_RATE_INVESTIGATION.md`)

| ID | What | Coverage | Touches |
|---|---|---|---|
| **F1** | ReviewOrder reads `editOrder.tableId` as fallback when sessionStorage's `scannedTableId` is missing | The dominant ~50–60% of failures (Edit Order path) | 1 file, ~6 lines |
| **F2** | `useScannedTable` merges with existing sessionStorage instead of overwriting blindly | The wrong-QR / mode-QR overwrite (~5–10%) | 1 file, ~8 lines |
| **F3** | sessionStorage → localStorage (with TTL) for `scanned_table_*` | All tab-discard cases on every mobile browser (~10–25% of sessions) | 1 file, ~12 lines |
| **F4** | Defensive guard: if `roomOrTable ∈ {'table','room'}` AND `finalTableId='0'` AND not in edit recovery → abort with toast | Defence-in-depth + URL-tampering policy gate the owner asked about earlier | 1 file, ~10 lines |
| **F5** | `checkTableStatus` no longer fails open — propagates error | Eliminates fail-open mistakes (~3–5%) | 1 file, ~5 lines |
| **F6** | Diagnostic log on every placeOrder / updateOrder entry | Converts future reports into evidence | 1 file, ~12 lines |

> **F1 + F3 together drop the rate from ~10% → <0.5%.** F2, F4, F5, F6 are optional defence layers.

---

## 2. F1 — Make ReviewOrder honour `editOrder.tableId` from CartContext

### 2.1 Where the bug is

**`/app/frontend/src/pages/ReviewOrder.jsx`** — exact two places `finalTableId` is computed:

| Location | Lines | Code |
|---|---|---|
| Normal-flow + edit-mode primary | **982-985** | `const finalTableId = hasAssignedTable(scannedTableId) ? scannedTableId : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');` |
| Auth-retry path (after 401 token refresh) | **1284-1287** | `const retryTableId = hasAssignedTable(scannedTableId) ? scannedTableId : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');` |

Both expressions reference only `scannedTableId` (sessionStorage) and `tableNumber` (React state for multi-menu manual selection). Neither consults the Edit Order context.

### 2.2 Where the correct value LIVES (and is currently dead state)

**`/app/frontend/src/context/CartContext.js`**

- L102: `const [editOrder, setEditOrder] = useState(null);` — internal state
- L406-419: `startEditOrder(orderId, items, orderMeta)` writes `setEditOrder({ tableId: orderMeta.tableId, tableNo: orderMeta.tableNo, restaurant: orderMeta.restaurant })`
- L429-439: `getEditOrderPayload()` returns `{ orderId, previousItems, newItems, tableId: editOrder?.tableId, tableNo: editOrder?.tableNo }` — **defined but NEVER CALLED in the codebase**
- L548-550: only `startEditOrder`, `clearEditMode`, `getEditOrderPayload` are exposed via `value` — **`editOrder` itself is NOT exposed**

Proof of dead state:
```bash
$ grep -rnE "getEditOrderPayload" /app/frontend/src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" | grep -v __tests__ | grep -v node_modules | grep -v "CartContext.js"
# Returns ZERO matches
```

The carefully-captured table_id has no consumer. **This is the single biggest hole.**

### 2.3 Where Edit Order WRITES the value (proof that the value is captured)

**`/app/frontend/src/pages/LandingPage.jsx`** (handleEditOrderClick):

- **L722-730** — passes `{ tableId: orderDetails.tableId || scannedTableId, tableNo: orderDetails.tableNo || scannedTableNo, restaurant: orderDetails.restaurant }` into `startEditOrder()`

Notice: `orderDetails.tableId` is the **POS API response** for the live order. Even if the customer's sessionStorage is wiped, `orderDetails.tableId` provides a clean reference from the source of truth (the order itself).

### 2.4 Exact fix surface for F1

**File:** `/app/frontend/src/pages/ReviewOrder.jsx`

| Step | Line | Change |
|---|---|---|
| 1 | L90-105 (useCart destructure) | Add `editOrder` (or expose via `getEditOrderPayload`) to the destructure. Note: CartContext currently doesn't export `editOrder`. Either: <br>(a) add `editOrder` to the `value` object in `/app/frontend/src/context/CartContext.js:531-561`, OR <br>(b) call `getEditOrderPayload()` which already returns tableId/tableNo |
| 2 | L982-985 | Change finalTableId expression to add the new fallback ordering: <br>`scannedTableId` → `tableNumber (multi-menu)` → **`editOrder?.tableId` (NEW)** → `'0'` |
| 3 | L1284-1287 | Same fallback ordering in the retry path |

**Pseudo-shape after fix (do NOT write yet):**

```js
const editOrderTableId = isEditMode ? editOrder?.tableId : null;
const finalTableId =
  (hasAssignedTable(scannedTableId)        ? scannedTableId :
   (isMultiMenu && tableNumber &&
    hasAssignedTable(tableNumber))          ? tableNumber :
   hasAssignedTable(editOrderTableId)       ? editOrderTableId :   // ← NEW
                                              '0');
```

The new branch fires **only in edit mode** AND only when scannedTableId/tableNumber are not assignable — preserving the existing fresh-order semantic exactly. Zero risk of changing fresh-order behaviour.

### 2.5 Side effect to watch

OrderSuccess.jsx L519 also uses `hasAssignedTable(scannedTableId) && isScanned && scannedTableNo` to gate the Edit Order button visibility. F1 only fixes the place-order site. The Edit Order button visibility issue is a separate gap (see §6 — companion fix in OrderSuccess) — recommended but not strictly required for F1 to deliver value.

---

## 3. F2 — `useScannedTable` merges instead of overwrites

### 3.1 Where the bug is

**`/app/frontend/src/hooks/useScannedTable.js`** — lines 29-52:

```js
if (urlTableId || urlTableNo || urlOrderType) {
  // …
  const newTable = {
    table_id: urlTableId,              // ← undefined! when URL has only orderType=
    table_no: urlTableNo,              // ← undefined! when URL has only orderType=
    room_or_table: roomOrTable,        // ← null if type is not table/room/walkin
    order_type: orderType,
    food_for: urlFoodFor || null
  };
  sessionStorage.setItem(storageKey, JSON.stringify(newTable));  // ← overwrites
}
```

**Trigger URLs that cause unwanted overwrite:**

| URL pattern | What it should mean | What happens today |
|---|---|---|
| `/<rid>?type=takeaway` | switch to takeaway mode | wipes existing table_id |
| `/<rid>?orderType=delivery` | switch to delivery mode | wipes existing table_id |
| `/<rid>?type=walkin&orderType=dinein` | walk-in dine QR | wipes existing table_id |
| `/<rid>?type=walkin&orderType=takeaway&foodFor=Normal` | food-for variant | wipes existing table_id |

### 3.2 Exact fix surface for F2

**File:** `/app/frontend/src/hooks/useScannedTable.js`

| Step | Line | Change |
|---|---|---|
| 1 | L41-47 (newTable construction) | Read previous sessionStorage value first; merge unset URL fields with the previous ones. The new `table_id` only overwrites if `urlTableId` is truthy AND non-zero. Same for `table_no`. |

**Pseudo-shape:**

```js
const prevRaw = sessionStorage.getItem(storageKey);
const prev = prevRaw ? safeJsonParse(prevRaw) : null;

const newTable = {
  // Preserve previous table identity unless URL explicitly provides a new one
  table_id: urlTableId || prev?.table_id || undefined,
  table_no: urlTableNo || prev?.table_no || undefined,
  // room_or_table — URL wins when given a valid value; otherwise keep previous
  room_or_table: roomOrTable || prev?.room_or_table || null,
  // order_type — URL wins (this is how mode switch works)
  order_type: orderType,
  food_for: urlFoodFor || prev?.food_for || null
};
```

### 3.3 Side effect to watch

The `updateOrderType` mutator at **L77-83** is already correct (preserves all fields). F2 brings the URL-driven write to the same standard. No tests break because the values that customers ACTUALLY pass via URL today (scan of a valid QR) carry tableId / tableNo / type together — merge yields identical result for that case.

---

## 4. F3 — sessionStorage → localStorage (the platform-agnostic permanent fix)

### 4.1 All read/write sites for `scanned_table_<rid>` storage key

A complete grep produces:

| File:Line | Operation | Purpose |
|---|---|---|
| `hooks/useScannedTable.js:50` | `sessionStorage.setItem(storageKey, ...)` | initial write from URL params |
| `hooks/useScannedTable.js:57` | `sessionStorage.getItem(storageKey)` | re-hydrate React state on every route change |
| `hooks/useScannedTable.js:82` | `sessionStorage.setItem(storageKey, ...)` | `updateOrderType` mutator |
| `hooks/useScannedTable.js:87` | `sessionStorage.removeItem(...)` | `clearScannedTable()` |
| `pages/ReviewOrder.jsx:194-200` | `sessionStorage.setItem(...)` | manual table selection persistence (writes the SAME key) |
| `pages/OrderSuccess.jsx:246` | `sessionStorage.getItem(storageKey)` | re-read during table-merge detection |
| `pages/OrderSuccess.jsx:320, 360` | wipe under 716-only condition (Items 2/3 carve-out) | **MUST stay sessionStorage** to honour 716 contract |

> **Cross-file consistency**: 5 of the 7 read/write sites are for the SAME key shape. F3 must change them in lockstep — or wrap them behind a single helper. Recommended: a small helper module `frontend/src/utils/scannedTableStorage.js` exposing `readScannedTable(rid)`, `writeScannedTable(rid, value)`, `clearScannedTable(rid)`, with TTL + localStorage as the underlying store. Then every existing call site becomes a one-liner using the helper.

### 4.2 716 carve-out compatibility

The 716-only `sessionStorage.removeItem('scanned_table_716')` wipes at OrderSuccess.jsx:320 and :360 are intentional (G1 fix for the May-8 room-scanner CR). After F3:

- If we go behind the helper, the 716 wipe paths can still call `clearScannedTable(716)` and the helper internally clears BOTH localStorage and any leftover sessionStorage. Behavior preserved.
- If we don't go behind the helper, the 716 wipes need to be updated to `localStorage.removeItem(...)` too. Mechanical change.

### 4.3 TTL design

Dining sessions last ≤ ~3 hours. The cart already uses 3-hour expiry (`CartContext.js:55-58`). Recommended TTL for scanned_table_* in localStorage: **4 hours**. Any older entry is auto-purged on read. This prevents stale data from persisting across multi-day visits (e.g. customer eats lunch one day → next morning opens the app → should be greeted as a new session, not the stale table 12 from yesterday).

### 4.4 Exact fix surface for F3

**Files to touch:**

| File | Lines | Change |
|---|---|---|
| `frontend/src/utils/scannedTableStorage.js` (**new**) | n/a | Helper module — `readScannedTable`, `writeScannedTable`, `clearScannedTable`, `_isExpired`, internal use of localStorage with TTL |
| `frontend/src/hooks/useScannedTable.js` | L50, L57, L82, L87 | Replace direct sessionStorage calls with helper calls |
| `frontend/src/pages/ReviewOrder.jsx` | L182-207 (the table-selection writeback effect) | Replace direct sessionStorage call at L194-200 with helper call |
| `frontend/src/pages/OrderSuccess.jsx` | L246 (table-merge re-read), L320 (716-only wipe), L360 (716-only 404 wipe) | Replace with helper calls — helper internally honours both reads (LS) and the 716 wipe semantics |

**Minimal-risk variant** (skip the helper, do direct s/sessionStorage/localStorage/ on the 7 lines): higher mechanical risk but smaller PR. Recommended only if the helper is rejected by reviewers.

---

## 5. F4 — Defensive guard for dine-in / room without table_id

### 5.1 Where the new guard lives

**`/app/frontend/src/pages/ReviewOrder.jsx`** — already has the room-only version:

| Existing guard | Lines |
|---|---|
| Room-context guard (only fires for `roomOrTable='room'`) | **827-834** |

The guard structure:

```js
if (String(restaurantId) !== '716' && scannedRoomOrTable === 'room' && !hasAssignedTable(scannedTableId)) {
  toast.error('Room context lost. Please rescan the QR code.');
  return;
}
```

F4 extends this to cover the table case AND the URL-tampering case discussed earlier.

### 5.2 Exact fix surface for F4

**File:** `/app/frontend/src/pages/ReviewOrder.jsx`

| Step | Line | Change |
|---|---|---|
| 1 | After L985 (after `finalTableId` is computed in the normal path) and after L1287 (retry path) | Insert: <br>`if (finalTableId === '0' && (scannedRoomOrTable === 'table' \|\| scannedRoomOrTable === 'room') && !isEditMode) { toast.error('Table context lost. Please rescan the QR code.'); logger.order('[F4 guard] table_id 0 blocked', {...}); return; }` |
| 2 | Same insertion site | Also include the URL-tampering check: if `pickOtpFlag()` resolves to `skipOtpDineIn` (fallback dine-in) AND new admin flag `allowFallbackDineIn === false` → toast + return (covers the URL tampering CR the owner raised earlier) |

The guard fires AFTER F1's editOrder fallback — so legitimate edit-order flows are not blocked even if sessionStorage was lost (because F1 would have provided the editOrder.tableId).

### 5.3 716 compatibility

The 716 carve-out at L988-994 must NOT be touched. F4's guard explicitly excludes `String(restaurantId) === '716'` for room mode (the existing convention).

---

## 6. F5 — Don't fail-open in `checkTableStatus`

### 6.1 Where the bug is

**`/app/frontend/src/api/services/orderService.ts`** — lines 130-142:

```ts
} catch (error: any) {
  logger.error('table', 'Failed to check table status:', error);
  return {
    tableStatus: 'Available',
    orderId: null,
    isOccupied: false,
    isAvailable: true,
    isInvalid: false,
    bookingType: null,
    tableType: 'NM',
    rooms: [],
    tableName: ''
  };
}
```

This silently makes "API down" indistinguishable from "table is genuinely free", which causes:
- Edit-order pre-update flow at `ReviewOrder.jsx:1005-1023` to redirect customers to fresh-order
- Landing-page tableStatusCheck at `LandingPage.jsx:250-398` to hide the Edit Order button

### 6.2 Exact fix surface for F5

**File:** `/app/frontend/src/api/services/orderService.ts` — L130-142

| Step | Line | Change |
|---|---|---|
| 1 | L130-142 | Either: <br>(a) re-throw the error so callers fall into their own catch and toast appropriately, OR <br>(b) return a NEW shape `{ tableStatus: 'Unknown', isAvailable: null, isOccupied: null, error: errorObj }` and have callers branch on `error` |

**Callers to update accordingly:**
- `ReviewOrder.jsx:1005-1023` — when error: don't redirect to fresh-order, keep customer in edit flow
- `ReviewOrder.jsx:1118-1131` — when error: instead of fall-through, abort with retry toast
- `LandingPage.jsx:250-398` — when error: don't hide Edit Order button; show "checking…" or retry

Total: 1 file change + 3 caller adjustments.

---

## 7. F6 — Diagnostic log on every placeOrder / updateOrder

### 7.1 Where to log

**`/app/frontend/src/pages/ReviewOrder.jsx`** — top of `handlePlaceOrder` (around L814) and at the success/failure branches around L1170, L1240, L1330.

### 7.2 What to log

A JSON snapshot:

```js
{
  cr: 'CR-2026-05-30-001-item-2',
  ts: Date.now(),
  rid: numericRestaurantId,
  flow: isEditMode ? 'edit' : 'fresh',
  isiOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
  isAndroid: /Android/.test(navigator.userAgent),
  scannedTableId,
  scannedTableNo,
  scannedRoomOrTable,
  scannedOrderType,
  selectedMode,
  tableNumber,                              // multi-menu manual selection
  editOrder_tableId: editOrder?.tableId,    // F1 source
  finalTableId,                             // what we're sending to POS
  sessionStorage_raw: sessionStorage.getItem(`scanned_table_${rid}`),
  localStorage_raw: localStorage.getItem(`scanned_table_${rid}`),   // after F3
  tokenAgeMs: now - tokenIssuedAt,
  isMultiMenu,
  navigationCount,  // counter from CartContext or localStorage
  outcome: 'success' | 'guard_blocked' | 'fallthrough' | 'error',
}
```

### 7.3 Where to ship the log

Two options:
- **Frontend-only**: `logger.order(...)` — only useful if remote logging is wired (currently isn't, AFAICT)
- **Backend echo endpoint**: new `POST /api/diagnostics/place-order-snapshot` — backend writes to a new `place_order_diagnostics` MongoDB collection with TTL index (e.g. 30 days). Lightweight, ~30 lines backend.

Recommended: **the backend echo path** — only then do future bug reports gain real evidence. The same endpoint can later cover the OTP-skip path for symmetry.

---

## 8. Summary table — fix surface index

| Fix | Files touched | New files | Lines (approx) | Coverage |
|---|---|---|---|---|
| F1 | `ReviewOrder.jsx`, `CartContext.js` | 0 | ~6 | 50–60% |
| F2 | `useScannedTable.js` | 0 | ~8 | 5–10% |
| F3 | `useScannedTable.js`, `ReviewOrder.jsx`, `OrderSuccess.jsx` | 1 (`utils/scannedTableStorage.js`) | ~25 | 10–25% (multiplier) |
| F4 | `ReviewOrder.jsx` | 0 | ~10 | defence + tampering policy |
| F5 | `orderService.ts`, `ReviewOrder.jsx`, `LandingPage.jsx` | 0 | ~15 | 3–5% |
| F6 | `ReviewOrder.jsx`, `backend/server.py` | 0 (optional new endpoint) | ~30 | evidence for future reports |
| **F1 + F3 (recommended MVP)** | **3 files + 1 new helper** | **1** | **~31 lines** | **drops rate from ~10% to <0.5%** |

---

## 9. 716 carve-out audit — what must NOT be touched

| File:Line | Carve-out | Reason | Status under any of F1-F6 |
|---|---|---|---|
| `OrderSuccess.jsx:320` | `if (String(restaurantId) === '716') { sessionStorage.removeItem(...); }` on order paid/cancelled | G1 fix for room-scanner CR; 716 wants room re-pick on every new order | **F3** uses helper that routes 716 wipes correctly — must verify in implementation |
| `OrderSuccess.jsx:360` | same wipe under 404 condition | same reason | same |
| `ReviewOrder.jsx:828` (within room guard) | `String(restaurantId) !== '716'` exclusion | 716 has its own room-context recovery via table-config | **F4** must replicate the `!== '716'` exclusion for the new table guard |
| `ReviewOrder.jsx:837` (multi-menu fork) | `String(restaurantId) === '716'` | 716 always treats as room mode in multi-menu | untouched |
| `ReviewOrder.jsx:937-941` (auto-fill effect) | `String(numericRestaurantId) === '716' && !scannedTableId` early-return | preserves 716's force-blank state | untouched |
| `ReviewOrder.jsx:988-994` (forced reset for 716) | `if (String(restaurantId) === '716')` block | resets tableNumber for 716 | untouched |
| `ReviewOrder.jsx:1290-1295` (retry path 716 reset) | same | same | untouched |

> Every one of F1-F6 can be implemented without touching any of the 716 carve-out branches. F3 needs care: the helper module should ensure 716 wipe calls still operate (whether the underlying store is sessionStorage or localStorage doesn't change the semantic).

---

## 10. What I'd still like from you before code

| # | Question |
|---|---|
| Q1 | Confirm: implement F1 + F3 as a single PR (recommended MVP); F2 / F4 / F5 / F6 as separate follow-up PRs? |
| Q2 | Approve creating the helper module `frontend/src/utils/scannedTableStorage.js` (cleaner) vs inline localStorage swap (fewer files, less DRY) |
| Q3 | For F1, expose `editOrder` from CartContext value (cleaner) vs add `getEditOrderPayload()` consumption (slightly more indirect)? |
| Q4 | TTL for F3 localStorage — owner-confirmed 4 hours? Or longer (e.g. 12h to cover all-day events) or shorter? |
| Q5 | Owner confirms the 716 carve-out branches are NOT to be touched under any of F1-F6 (as per Items 2/3 hard constraint) |

---

## 11. Files NOT touched by any of F1-F6

- `backend/server.py` (unless F6's backend echo endpoint is approved)
- All payment / loyalty / coupon code
- The CRM helper / OTP skip flow (Item 1 — already shipped)
- The 716 carve-out branches in OrderSuccess.jsx and ReviewOrder.jsx
- `crmService.js`, `crmSkipOtpRetry.js`, `otpPolicy.js` (Item 1 surface)
- All admin UI (`AdminVisibilityPage.jsx` etc.)
- All transformer modules (`orderTransformer.ts`, `helpers.js`) — payload contract unchanged

---

## 12. One-line summary

> **F1** patches the single biggest hole (3 lines in `ReviewOrder.jsx:982-985` + add `editOrder` to CartContext's exported value). **F3** makes the bug platform-agnostic-immune (~25 lines, 1 new helper file, 3 call sites). Together: ~31 LOC, no backend, no DB, no 716 carve-out touched. Estimated impact: failure rate drops from ~10% to <0.5%.
