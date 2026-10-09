# Investigation Report: Room QR Scan Flow — Status Check, UI States, and New Order Capability

**ID:** INV-2026-06-17-003  
**Subject:** What does the customer see when scanning a room QR in different room states? Can a customer place a first order to a room?

---

## IMPORTANT: TWO DIFFERENT FLOWS EXIST

| Restaurant Type | Example | Room Flow |
|---|---|---|
| **Multi-menu** (e.g., 716 Hyatt) | `isMultipleMenu(restaurant) = true` | Table status check is **SKIPPED entirely** at landing. Customer picks room manually at ReviewOrder. |
| **Single-menu** (all other room restaurants) | Any non-multi-menu restaurant with room QR | Full status check runs. Room state determines UI. |

716 (Hyatt) is **excluded** from all room scanner logic below because it's multi-menu. Everything below applies to **single-menu restaurants with room QR codes**.

---

## THE 5 ROOM STATES — What Customer Sees

### State 1: Room NOT checked in (vacant)

**POS API returns:** `table_status: "Available"` → `isAvailable: true, isOccupied: false`

**What customer sees:**
```
┌─────────────────────────────────────┐
│         🚪 Room Checked Out         │
│                                     │
│  This room is currently checked     │
│  out, so ordering is disabled.      │
│  Please contact staff.              │
└─────────────────────────────────────┘
```
- **Browse Menu button: HIDDEN** (replaced by blocked card)
- **Edit Order button: HIDDEN**
- **Customer CANNOT order**
- Code: `roomBlocked = true` because `tableStatusCheck.isAvailable === true` (line 871)

### State 2: Room checked in, HAS existing order

**POS API returns:** `table_status: "Not Available"`, `order_id: 12345` → `isOccupied: true`

**What customer sees:**
- **Auto-redirect to OrderSuccess page** with existing order details (line 306-323)
- Customer sees order status, bill summary, etc.
- If they go back to landing: **"EDIT ORDER" button** shown (line 1117)
- Customer can add more items via Edit Order flow

### State 3: Room checked in, NO existing order, guest details COMPLETE

**POS API returns:** `table_status: "Not Available"`, `order_id: null/empty`, `tableType: "RM"`, `userinfo: {f_name, l_name, phone}` (all present)

**What customer sees:**
```
┌─────────────────────────────────────┐
│  Name: [John Smith      ] 🔒 locked │
│  Phone: [+91 9876543210 ] 🔒 locked │
│                                     │
│  🍽️  BROWSE MENU                    │
└─────────────────────────────────────┘
```
- **Browse Menu button: SHOWN** (line 1140 — `!isOccupied || !existingOrderId` is true)
- Name and phone **auto-populated AND locked** from checked-in guest details (line 356-368)
- **Customer CAN place a NEW order** — Browse Menu → add items → place order
- This is the path for first order from customer app to a checked-in room with no prior order

### State 4: Room checked in, NO existing order, guest details INCOMPLETE

**POS API returns:** `table_status: "Not Available"`, `order_id: null/empty`, `tableType: "RM"`, `userinfo` missing or incomplete (name or phone missing)

**What customer sees:**
```
┌─────────────────────────────────────┐
│         🚪 Room Checked Out         │
│                                     │
│  This room is currently checked     │
│  out, so ordering is disabled.      │
│  Please contact staff.              │
└─────────────────────────────────────┘
```
- **Browse Menu button: HIDDEN** (replaced by blocked card)
- Code: `guestIncomplete: true` triggers `roomNotCheckedIn = true` (line 874-875)
- **Customer CANNOT order**
- This is a deliberate owner decision (S1): incomplete guest = treated as blocked

### State 5: Invalid room QR / API error

**POS API returns:** `table_status: "Invalid Table ID or QR code"` OR network error

**What customer sees (invalid):**
```
Toast: "Invalid table. Please scan a valid QR code."
```

**What customer sees (API error):**
```
┌─────────────────────────────────────┐
│       Unable to verify room         │
│                                     │
│  Please try again or contact staff. │
└─────────────────────────────────────┘
```
- **Customer CANNOT order**

---

## ANSWER TO YOUR KEY QUESTION

**"Can customer place a FIRST order to a room, or must first order come from POS?"**

### For single-menu restaurants (non-716):
**YES — customer CAN place the first order** IF:
1. Room is checked in (`table_status: "Not Available"`)
2. No existing order yet (`order_id` is empty)
3. Guest details are complete (name + phone from POS)

The customer sees "BROWSE MENU", their name/phone are auto-filled and locked from the check-in data, and they proceed to order normally. The order goes to POS with `table_id` = the room's scanned ID.

**Customer CANNOT order if:**
- Room not checked in (vacant) → "Room Checked Out" block
- Guest details incomplete → same "Room Checked Out" block
- API error → "Unable to verify room" block

### For 716 (Hyatt) — COMPLETELY DIFFERENT:
The entire room status check is **skipped** because 716 is multi-menu. 716 uses manual room selection at ReviewOrder page — customer picks room from a dropdown. There's no automatic check-in validation on landing.

---

## COMPLETE DECISION TREE

```
Customer scans room QR → /{restaurantId}?tableId=X&type=room

├─ Is restaurant multi-menu? (e.g., 716)
│   └─ YES → SKIP all room checks. Customer sees normal landing.
│            Room picked manually at ReviewOrder.
│
├─ NO (single-menu) → Run checkTableStatus(tableId, restaurantId)
│
│   ├─ API returns "Invalid Table ID or QR code"
│   │   └─ Toast: "Invalid table" + blocked UI
│   │
│   ├─ API returns "Available" (room not checked in)
│   │   └─ "Room Checked Out" blocked card → CANNOT order
│   │
│   ├─ API returns "Not Available" + order_id exists
│   │   └─ Auto-redirect to OrderSuccess (edit existing order)
│   │   └─ Back on landing: "EDIT ORDER" button
│   │
│   ├─ API returns "Not Available" + NO order_id + guest COMPLETE
│   │   └─ Name/Phone auto-filled & locked → "BROWSE MENU" → CAN place new order
│   │
│   ├─ API returns "Not Available" + NO order_id + guest INCOMPLETE
│   │   └─ "Room Checked Out" blocked card → CANNOT order
│   │
│   └─ API error / network failure
│       └─ "Unable to verify room" blocked card → CANNOT order
```

---

## ADDITIONAL GUARD AT ReviewOrder (place order time)

Even if a customer gets through to ReviewOrder via room QR, there's an additional guard at order placement (line 860-867):

```js
if (scannedRoomOrTable === 'room' && !hasAssignedTable(scannedTableId)) {
    toast.error('Room context lost. Please rescan the QR code.');
    return;
}
```

This catches edge cases where room context was lost between landing and order placement (e.g., sessionStorage cleared).

---

## WHAT THE POS API RETURNS (field reference)

```json
{
  "status": {
    "table_status": "Available" | "Not Available" | "Invalid Table ID or QR code",
    "order_id": "12345" | "",
    "table_type": "RM" | "TB",
    "table type": "RM" | "TB",
    "userinfo": {
      "f_name": "John",
      "l_name": "Smith",
      "phone": "919876543210"
    }
  }
}
```

---

```
Investigation complete: INV-2026-06-17-003
Root cause: N/A (architecture knowledge request)
Classification: DATA_FLOW / UI_STATES
Confidence: HIGH
Steps used: 5/10
Evidence: LandingPage.jsx (lines 255-400, 855-886, 1068-1162), ReviewOrder.jsx (lines 860-891), orderService.ts (lines 80-143)
```
