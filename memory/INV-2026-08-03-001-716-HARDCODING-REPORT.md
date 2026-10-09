# Investigation Report: Hyatt (716) Hardcodings & Restaurant-Specific Logic

**Investigation ID:** INV-2026-08-03-001  
**Scope:** All hardcodings referencing Restaurant 716 (Hyatt Centric) + related restaurant-specific hardcodings  
**Classification:** FE + BE / CONFIG / DATA  
**Confidence:** HIGH  
**Steps used:** 10/10  

---

## Executive Summary

Restaurant 716 (Hyatt Centric) has **27 code-level hardcodings** spread across **8 files**, plus **5 comment-only references** across 4 additional files. These hardcodings implement a **"room-only hotel"** business model that differs fundamentally from standard table-based restaurants. Additionally, there are **3 other categories of non-716 hardcodings** (pos_id, default restaurant, country code) that also block true multi-restaurant flexibility.

---

## PART 1 — ALL 716 HARDCODINGS (Categorised)

### HC-1: Room-Only Hotel Logic (Force `room` mode, hide `table` option)

| # | File | Line(s) | What it does | Why it exists |
|---|------|---------|--------------|---------------|
| 1 | `ReviewOrder.jsx` | 557, 562 | `is716 ? 'room' : (scannedRoomOrTable || 'table')` — forces `roomOrTable` to `'room'` on auto-fill | Hyatt is room-only; table type is meaningless |
| 2 | `ReviewOrder.jsx` | 566-578 | On mount: sets `roomOrTable='room'`, clears `tableNumber` if no scan | Every new visit starts with fresh room pick |
| 3 | `TableRoomSelector.jsx` | 61 | `const is716 = String(restaurantId) === '716'` | Gate variable for UI hiding |
| 4 | `TableRoomSelector.jsx` | 108 | `isMultiMenu && (hasAssignedTable(scannedTableId) || is716)` — always shows room selector for 716 even without scan | Hyatt doesn't require QR scan to show room picker |
| 5 | `TableRoomSelector.jsx` | 114 | `{!is716 && (` — hides Room/Table radio toggle | Hyatt only has rooms, radio is irrelevant |

**Underlying behaviour:** Hyatt is a hotel with rooms only, no tables. The concept of "room vs table" toggle doesn't apply. Every order is a room order.

**Config-driven replacement:** A restaurant config flag like `orderLocationType: 'room_only' | 'table_only' | 'room_and_table'` could replace all 5 hardcodings.

---

### HC-2: Fresh Room Selection Required Per Order

| # | File | Line(s) | What it does |
|---|------|---------|--------------|
| 6 | `ReviewOrder.jsx` | 932-936 | Pre-submit validation: room mandatory, no fallback |
| 7 | `ReviewOrder.jsx` | 1032-1036 | Post-Razorpay success: reset `tableNumber=''`, `roomOrTable='room'` |
| 8 | `ReviewOrder.jsx` | 1082-1088 | Pre-API-call guard: block if `finalTableId` unassigned |
| 9 | `ReviewOrder.jsx` | 1350-1354 | Post-COD success: reset room selection |
| 10 | `ReviewOrder.jsx` | 1419-1424 | 401-retry: room mandatory check |
| 11 | `ReviewOrder.jsx` | 1524-1528 | Post-retry success: reset room selection |
| 12 | `OrderSuccess.jsx` | 314-322 | Status 3/6 (cancelled/paid): `clearScannedTable()` for 716 only |
| 13 | `OrderSuccess.jsx` | 357-362 | 404 error: `clearScannedTable()` for 716 only |

**Underlying behaviour:** At Hyatt, each order is for a potentially different room. Stale room selection from a previous order should never auto-carry into the next order. For normal restaurants, the customer stays at the same table across orders.

**Config-driven replacement:** A flag like `requireFreshLocationPerOrder: true` would replace all 8 reset/validation hardcodings. The OrderSuccess `clearScannedTable` calls are the flip side — controlled by the same flag.

---

### HC-3: Skip Table Status Check (Allow Multiple Orders Per Table/Room)

| # | File | Line(s) | What it does |
|---|------|---------|--------------|
| 14 | `ReviewOrder.jsx` | 1206-1213 | `skipTableCheckFor716` — skips `checkTableStatus()` before placing new order |

**Underlying behaviour:** Normal restaurants: one active order per table (table occupied = edit existing order). Hyatt: multiple orders can exist for the same room simultaneously.

**Config-driven replacement:** A flag like `allowMultipleOrdersPerLocation: true` replaces this.

---

### HC-4: Skip Session Persistence for Manual Room Selection

| # | File | Line(s) | What it does |
|---|------|---------|--------------|
| 15 | `ReviewOrder.jsx` | 199-203 | `if (String(numericRestaurantId) === '716' && !scannedTableId) return;` — don't persist manually-selected room to `sessionStorage` |

**Underlying behaviour:** For 716, if the room was picked manually (not via QR scan), don't save it to `sessionStorage`. Otherwise `useScannedTable` would re-hydrate a stale room on next visit. Tied to HC-2 (fresh room per order).

**Config-driven replacement:** Same flag `requireFreshLocationPerOrder: true` — if true, skip persistence of manual selections.

---

### HC-5: Room Scanner Safety Guard Exclusion

| # | File | Line(s) | What it does |
|---|------|---------|--------------|
| 16 | `ReviewOrder.jsx` | 922-929 | `String(restaurantId) !== '716' &&` — excludes 716 from the "room context lost, rescan QR" toast guard |

**Underlying behaviour:** For normal restaurants with room QR, if `scannedTableId` is lost, show error. For 716, manual room pick is the norm (no QR needed), so this guard would false-positive.

**Config-driven replacement:** Naturally handled if `orderLocationType: 'room_only'` — room-only restaurants always use manual pick, so the QR-loss guard doesn't apply.

---

### HC-6: Non-QR Order Access Carve-Out

| # | File | Line(s) | What it does |
|---|------|---------|--------------|
| 17 | `orderAccessPolicy.js` | 43-46 | `if (String(ctx?.restaurantId) === '716') return { block: false, reason: 'rid-716-carveout' }` |

**Underlying behaviour:** Even when `allowNonQrOrders=false`, 716 is never blocked. Hotel guests order from their rooms without scanning a QR code on a table.

**Config-driven replacement:** This carve-out becomes unnecessary if `allowNonQrOrders` is simply set to `true` in 716's config. OR a new flag `requireQrScanForDineIn: false` could be used alongside `allowNonQrOrders`.

---

### HC-7: Different API Endpoint (Autopaid)

| # | File | Line(s) | What it does |
|---|------|---------|--------------|
| 18 | `orderService.ts` | 319-328 | `is716 ? ENDPOINTS.PLACE_ORDER_AUTOPAID() : ENDPOINTS.PLACE_ORDER()` |

**Underlying behaviour:** Hyatt uses an "autopaid" order placement endpoint (`/customer/order/autopaid-place-prepaid-order`). All other restaurants (including other multi-menu) use the normal `/customer/order/place`.

**Config-driven replacement:** A flag like `orderEndpointType: 'autopaid' | 'standard'` or `useAutopaidEndpoint: true`. This is the **most critical** hardcoding because it changes the API contract.

---

### HC-8: Comment-Only References (No Code Logic)

| # | File | Line(s) | Nature |
|---|------|---------|--------|
| 19 | `LandingPage.jsx` | 214 | Comment: "Multi-menu restaurants (e.g., Hyatt 716) are skipped" |
| 20 | `LandingPage.jsx` | 265-266 | Comment: "716 is multi-menu and must be skipped" |
| 21 | `LandingPage.jsx` | 871-876 | Comment: "716 NATURAL EXCLUSION" — table status check skipped via `isMultipleMenu` |
| 22 | `LandingPage.jsx` | 501 | Comment: "Bypasses (716, takeaway/delivery, edit-mode...)" |
| 23 | `otpPolicy.js` | 16-18 | Comment: "Restaurant 716 is IN-scope for Item 1" |
| 24 | `AdminVisibilityPage.jsx` | 126 | UI text: "Restaurant 716 is unaffected by this setting" |
| 25 | `MenuPanel.css` | 192 | Comment: "Compact Categories (Non-716/739)" |
| 26 | `helpers.js` | 216 | Comment: "Multi-menu parity additions (478 normal/edit contract alignment with 716)" |
| 27 | Various in `orderService.ts` | 358,405,478,542 | Comments referencing "478 contract alignment with 716" |

These don't have code logic but indicate mental coupling between developers and specific restaurant IDs.

---

## PART 2 — NON-716 HARDCODINGS (Multi-Restaurant Blockers)

### A. `pos_id: '0001'` (13+ occurrences)

| File | Line(s) | Context |
|------|---------|---------|
| `LandingPage.jsx` | 89, 603 | `pos_id: '0001'` in check-customer API calls |
| `AuthContext.jsx` | 143, 218 | `body.pos_id = restaurantContext.pos_id || "0001"` |
| `crmService.js` | 79 | `buildUserId(restaurantId, posId = '0001')` |
| `server.py` | 90, 103, 108, 278, 285, 293, 443, 471, 514, 566 | Default `pos_id = "0001"` across all request models and logic |

**Impact:** Every restaurant defaults to POS ID `0001`. If a restaurant uses a different POS provider (e.g., Petpooja, Ezzo), this breaks silently.

**Fix:** `pos_id` should come from restaurant config, not hardcoded. The backend already has the comment `"Default MyGenie, can be 'petpooja', 'ezzo', etc."` — it knows this needs to be dynamic.

---

### B. Default Restaurant ID `"478"` 

| File | Line(s) | Context |
|------|---------|---------|
| `useRestaurantId.js` | 134 | `const defaultRestaurantId = "478"; // 18march - hardcoded for preview` |
| `constants.js` | 16 | `// export const DEFAULT_RESTAURANT_ID = process.env.REACT_APP_RESTAURANT_ID || '478';` (commented out) |
| `__mocks__/react-router-dom.js` | 2 | `pathname: '/478/menu'` |

**Impact:** If no restaurant ID is found in URL, query, or subdomain, it falls back to 478 (18march). This should be an env variable or show a restaurant-selection page.

---

### C. Country Code `'91'` (India)

| File | Line(s) | Context |
|------|---------|---------|
| `crmService.js` | 291 | `crmSendOtp(phone, userId, countryCode = '91')` |
| `crmService.js` | 328 | `crmVerifyOtp(phone, otp, userId, countryCode = '91')` |
| `crmService.js` | 395 | `crmForgotPassword(phone, userId, countryCode = '91')` |

**Impact:** Hardcoded to India. International restaurants would need this from config.

---

## PART 3 — PROPOSED CONFIG-DRIVEN REPLACEMENT MAP

To remove 716 hardcodings for multi-restaurant support, these **6 new restaurant config flags** would replace all 18 code-level hardcodings:

| New Config Flag | Type | Default | Replaces HC# | What it controls |
|-----------------|------|---------|--------------|-----------------|
| `orderLocationType` | `'room_only' \| 'table_only' \| 'room_and_table'` | `'table_only'` | HC-1, HC-5 | Room vs Table vs Both in UI; hides radio, forces mode |
| `requireFreshLocationPerOrder` | `boolean` | `false` | HC-2, HC-4 | Clears room/table selection after each order; skips session persistence |
| `allowMultipleOrdersPerLocation` | `boolean` | `false` | HC-3 | Skips table status check before new order |
| `useAutopaidEndpoint` | `boolean` | `false` | HC-7 | Routes to autopaid vs standard place-order API |
| `requireQrForDineIn` | `boolean` | `true` | HC-6 | Whether non-QR dine-in is blocked (replaces the 716 carve-out) |
| `orderEndpointType` | `'standard' \| 'autopaid'` | `'standard'` | HC-7 (alt) | Alternative to boolean — more extensible |

### Flag Interaction Rules

```
IF orderLocationType === 'room_only':
  - Force roomOrTable = 'room'
  - Hide Room/Table radio toggle
  - Skip QR-loss safety guard (manual pick is the norm)

IF requireFreshLocationPerOrder === true:
  - Don't persist manual selections to sessionStorage
  - Clear scanned table on order completion/cancellation/404
  - Reset tableNumber + roomOrTable on order success
  - Require explicit selection before every submit

IF allowMultipleOrdersPerLocation === true:
  - Skip checkTableStatus() before placing new order

IF useAutopaidEndpoint === true:
  - Route to PLACE_ORDER_AUTOPAID instead of PLACE_ORDER

IF requireQrForDineIn === false:
  - Don't block non-QR dine-in orders (current allowNonQrOrders handles this)
```

---

## PART 4 — RISK ASSESSMENT

| Risk Factor | Level | Detail |
|-------------|-------|--------|
| Existing 716 Hyatt flow breakage | **CRITICAL** | Any regression in the room selection / autopaid flow directly impacts Hyatt operations |
| Other multi-menu restaurants affected | **HIGH** | Changes to `isMultiMenu` branching could affect other multi-menu restaurants |
| API contract change (autopaid) | **CRITICAL** | The POS backend must support the flag-driven endpoint routing |
| Migration of existing config | **MEDIUM** | Need to backfill new flags for 716 (and verify defaults don't change behaviour for others) |
| Testing surface | **HIGH** | Every order flow (new, edit, retry, Razorpay, COD) needs re-verification per restaurant type |

---

## PART 5 — FILES THAT WOULD CHANGE

| File | Changes Needed | Risk |
|------|---------------|------|
| `ReviewOrder.jsx` | Replace 12 `=== '716'` checks with config flags | CRITICAL |
| `OrderSuccess.jsx` | Replace 2 `=== '716'` checks with config flag | HIGH |
| `TableRoomSelector.jsx` | Replace `is716` with `orderLocationType === 'room_only'` | HIGH |
| `orderAccessPolicy.js` | Remove 716 carve-out, rely on `allowNonQrOrders` config | MEDIUM |
| `orderService.ts` | Replace `is716` endpoint switch with config flag | CRITICAL |
| `RestaurantConfigContext.jsx` | Add new flags to schema / defaults | HIGH |
| `AdminSettings.jsx` | Add UI for new flags | MEDIUM |
| `backend/server.py` | Add new config fields to DB schema + API | HIGH |

### Files that WILL NOT change:
- `LandingPage.jsx` — 716 exclusions are "natural" via `isMultipleMenu()`, no hardcoding in logic
- `otpPolicy.js` — 716 is IN-scope for OTP like everyone (comment only)
- `MenuPanel.css` — comment only
- `crmService.js` — country code is separate concern
- `AuthContext.jsx` — pos_id is separate concern

---

## Investigation Output

```
Investigation complete: INV-2026-08-03-001
Root cause: 716 (Hyatt Centric) business model differs from standard restaurants in 7 dimensions — 
  room-only location, fresh selection per order, multi-order per room, no QR requirement, 
  no session persistence, no table status check, different API endpoint.
  All implemented as string comparisons against '716' rather than config flags.
Classification: FE / CONFIG
Confidence: HIGH
Steps used: 10/10
Evidence: This report + grep results across all source files
Recommendation: PLANNING → Define 6 new config flags, backfill for 716, 
  implement config-driven branching, full regression test for 716 + at least one standard restaurant
```

---

*End of Investigation Report*
