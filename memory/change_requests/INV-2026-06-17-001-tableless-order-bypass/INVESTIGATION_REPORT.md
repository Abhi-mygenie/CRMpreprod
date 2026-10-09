# Investigation Report: Table-less Order Received Despite Non-QR Block

**ID:** INV-2026-06-17-001  
**Restaurant:** 698 (Cafe Flora)  
**Reporter:** owner@cafeflora.com  
**Symptom:** Dine-in order received without table assignment, despite `allowNonQrOrders: false`  
**Environment:** Production (POS API at mygenie.online — not inspectable from this environment)  

---

## Config Verification

| Flag | Value | Correct? |
|------|-------|----------|
| `allowNonQrOrders` | `false` | YES — blocking is enabled |
| `skipOtpWalkIn` | `true` | Walk-in OTP is skipped |
| `otpRequiredWalkIn` | `false` | Walk-in OTP not required |

Config is correctly set. The block policy IS active.

---

## Root Cause: 3 Bypass Paths Identified

### BP-1: Walk-in QR Code Bypass (MOST LIKELY)

**The `allowNonQrOrders` policy explicitly EXEMPTS walk-in QR scans by design.**

In `orderAccessPolicy.js` (line 20, 63-64):
```
VALID_QR_SCAN_TYPES = ['table', 'room', 'walkin']
```
When someone scans a walk-in QR code (URL with `type=walkin`), the policy returns `{block: false, reason: 'valid-qr'}`.

The order then proceeds with `table_id: '0'` (no table) because walk-ins have no assigned table. This is coded as intentional behavior (HC7: "walkin QR is a valid scan; not blocked").

**Evidence:** `orderAccessPolicy.js` lines 20, 62-68; `orderTypeHelpers.js` line 8: "Walk-in QR: type=walkin, no tableId → no table"

### BP-2: Direct URL Manipulation (POSSIBLE)

Anyone can type `/{restaurantId}?type=walkin` in a browser — no physical QR scan required. This creates the same sessionStorage state as a real walk-in QR scan, bypassing all non-QR checks.

**Evidence:** `useScannedTable.js` lines 29-53 — URL params are trusted without origin verification.

### BP-3: No Server-Side Enforcement (ARCHITECTURAL)

The `allowNonQrOrders` policy is **purely client-side JavaScript**. The POS API (`/customer/order/place`) accepts any order with `table_id: '0'` regardless of restaurant config. Anyone with browser dev tools or direct API access can bypass all frontend guards.

**Evidence:** `orderService.ts` line 371: `table_id: String(orderData.tableId || orderData.tableNumber || '')` — POS API receives whatever the frontend sends. No server-side config check.

---

## Data Flow Trace

```
Walk-in QR scan (or direct URL with ?type=walkin)
  → useScannedTable: scannedRoomOrTable = 'walkin', scannedTableId = null
  → LandingPage C1: shouldBlockNonQrOrder → block: false (walkin is VALID_QR_SCAN_TYPE)
  → MenuItems C2: shouldBlockNonQrOrder → block: false (same reason)
  → ReviewOrder C3: shouldBlockNonQrOrder → block: false (same reason)
  → finalTableId = '0' (no assigned table)
  → Table status check SKIPPED (finalTableId === '0')
  → POS API called with table_id='0'
  → Order created without table ✅ (from POS perspective, valid)
```

---

## Diagnostic Evidence

- Non-QR block events ARE firing for direct URL access (5 events logged for restaurant 698 on 2026-05-30)
- All logged blocks have `scanned_room_or_table: None` — these are true non-QR attempts that WERE blocked
- Walk-in QR bypass would NOT generate a block event (policy returns `block: false`)

---

## Classification

| Field | Value |
|-------|-------|
| Root cause type | POLICY_GAP + ARCHITECTURE |
| Confidence | HIGH |
| Steps used | 9/10 |

---

## Recommendations (Owner Decision Required)

### Option A: Remove `walkin` from valid QR scan types
- Change `VALID_QR_SCAN_TYPES` from `['table', 'room', 'walkin']` to `['table', 'room']`
- Walk-in QR users would be blocked when `allowNonQrOrders=false`
- Risk: Breaks walk-in ordering for ALL restaurants using walk-in QR codes
- **Requires per-restaurant config flag** (e.g., `allowWalkinOrders`) to be safe

### Option B: Add server-side enforcement
- Backend validates `allowNonQrOrders` + `table_id` before forwarding to POS API
- Eliminates all client-side bypass paths (dev tools, direct API, URL manipulation)
- Requires backend proxy for order placement (currently goes direct to POS API)

### Option C: Add `allowWalkinOrders` as a separate config flag
- Keep walk-in QR as valid scan type globally
- Add new flag `allowWalkinOrders` (default: true)
- When false + `allowNonQrOrders` false: also block walk-in scans
- Most flexible — restaurants choose granularity

### Option D: Revoke walk-in QR codes for this restaurant
- If Cafe Flora (698) has walk-in QR codes in circulation, remove/disable them
- Operational fix — no code change needed
- Doesn't address BP-2 (direct URL) or BP-3 (API bypass)

---

## Next Role

Owner decision needed on which option(s) to pursue. No code changes without approval — all options touch HIGH/CRITICAL risk areas (order flow, policy logic).
