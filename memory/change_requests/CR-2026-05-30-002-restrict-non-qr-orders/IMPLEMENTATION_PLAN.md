# CR-2026-05-30-002 — Implementation Handover Plan

> **Audience**: The next implementation agent (or human dev).
> **Status**: PLAN ONLY — no code has been written. Hand this doc + `CR.md` to the implementing agent.
> **Estimated effort**: ~125 LOC across 3 new files + 6 small edits + 1 backend endpoint. Single PR.
> **Day-1 risk**: Zero. Default `allowNonQrOrders = true` preserves current behaviour for every restaurant including 716.

---

## 0. Prerequisites the implementer MUST do before writing code

1. Re-read `/app/memory/change_requests/CR-2026-05-30-002-restrict-non-qr-orders/CR.md` end-to-end.
2. Confirm Item 1 (`skipOtp*`) is still working — landing page on rid 698 should still go silently to /menu when `skipOtpDineIn=true` is configured.
3. Read `/app/HANDOVER.md` § "Restaurant 716 carve-out" — confirm the rule still applies.
4. Verify these files exist and match the line ranges referenced below (file numbers can drift):
   - `/app/frontend/src/context/AdminConfigContext.jsx`  (defaultConfig block ~L19-L135)
   - `/app/frontend/src/context/RestaurantConfigContext.jsx`  (DEFAULT_CONFIG ~L9-L129; value object ~L364-L487)
   - `/app/frontend/src/pages/admin/AdminVisibilityPage.jsx`  (currently 122 lines)
   - `/app/frontend/src/pages/LandingPage.jsx`  (`handleDiningMenuClick` at L477)
   - `/app/frontend/src/context/CartContext.js`  (`addToCart` at L219)
   - `/app/frontend/src/pages/MenuItems.jsx`  (`handleAddToCart` at L416, `handleAddToCartFromModal` at L442, `handleIncrement` at L485)
   - `/app/frontend/src/pages/ReviewOrder.jsx`  (`handlePlaceOrder` at L814)
   - `/app/backend/server.py`  (api_router defined at L49; routers included at L1510)
5. **DO NOT TOUCH** anything inside `if (String(restaurantId) === '716')` blocks. Restaurant 716 carve-out is HC1 from CR.md.
6. **DO NOT FIX** parked Items 2/3. Resist the urge — those have their own re-investigation docs.

---

## 1. High-level architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  Admin → Visibility page  (new section "Order Access Policy")          │
│  Toggle: "Allow Non-QR Orders"   default ON  →  flag = allowNonQrOrders │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ saves to customer_app_config
                             ▼
                  ┌──────────────────────┐
                  │ /api/config/<rid>    │  existing endpoint, no change
                  └──────────┬───────────┘
                             │ pulled by RestaurantConfigContext
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│ utils/orderAccessPolicy.js  ──  shouldBlockNonQrOrder(ctx, config)     │
│ Single source of truth. Returns { block: bool, reason: string }        │
└──────────────┬───────────────────────────┬────────────────────────────-┘
               │                           │
               ▼                           ▼
   ┌──────────────────────┐    ┌──────────────────────┐
   │ Guard C1: Landing    │    │ Guard C2: MenuItems  │    Guard C3: ReviewOrder
   │ (handleDiningMenu…)  │    │ (handleAddToCart…)   │    (handlePlaceOrder)
   └──────────┬───────────┘    └──────────┬───────────┘    │
              │                           │                ▼
              ▼                           ▼     ┌──────────────────────┐
   ┌──────────────────────────────────────────┐ │ NonQrBlockModal      │
   │  NonQrBlockModal (non-dismissable)       │ │ + clearCart()        │
   │  + clearCart()                           │ │ + telemetry POST     │
   │  + telemetry POST (fire-and-forget)      │ └──────────────────────┘
   └──────────────────────────────────────────┘
                             │
                             ▼ fire-and-forget
              POST /api/diagnostics/non-qr-block
              → MongoDB `non_qr_blocks` collection
              → per-restaurant 200-doc rolling cap
```

---

## 2. Files to be added / changed (exhaustive)

| # | File | Action | Why |
|---|---|---|---|
| 2.1 | `frontend/src/utils/orderAccessPolicy.js` | **NEW** | Single source of truth for the policy decision |
| 2.2 | `frontend/src/components/NonQrBlockModal.jsx` | **NEW** | Non-dismissable rescan modal |
| 2.3 | `frontend/src/components/NonQrBlockModal.css` | **NEW** | Styles for the modal |
| 2.4 | `frontend/src/api/services/diagnosticsService.js` | **NEW** | Fire-and-forget POST `/api/diagnostics/non-qr-block` |
| 2.5 | `frontend/src/context/AdminConfigContext.jsx` | EDIT | Add `allowNonQrOrders: true` to `defaultConfig` |
| 2.6 | `frontend/src/context/RestaurantConfigContext.jsx` | EDIT | Add `allowNonQrOrders: true` to `DEFAULT_CONFIG` + value serializer |
| 2.7 | `frontend/src/pages/admin/AdminVisibilityPage.jsx` | EDIT | Add "Order Access Policy" section + toggle |
| 2.8 | `frontend/src/pages/LandingPage.jsx` | EDIT | Guard C1 in `handleDiningMenuClick` |
| 2.9 | `frontend/src/pages/MenuItems.jsx` | EDIT | Guard C2 — wrap add-to-cart entry points |
| 2.10 | `frontend/src/pages/ReviewOrder.jsx` | EDIT | Guard C3 in `handlePlaceOrder` |
| 2.11 | `backend/server.py` | EDIT | New endpoint `POST /api/diagnostics/non-qr-block` + index/rolling-cap |

**Total ~125 LOC.**

---

## 3. File-by-file specification with full code

> Every code block below is **the literal contents** (for new files) or **the literal patch** (for edits) the implementer should apply.

---

### 3.1 NEW — `frontend/src/utils/orderAccessPolicy.js`

```javascript
/**
 * CR-2026-05-30-002 — Non-QR order access policy.
 *
 * Single source of truth for deciding whether a customer's order attempt
 * should be blocked due to missing QR-scan context.
 *
 * Day-1 behaviour: when `allowNonQrOrders` is missing / true / null /
 * undefined, this ALWAYS returns { block: false }. No restaurant is affected
 * until an admin explicitly flips the flag OFF.
 *
 * Hard constraints honoured here:
 *  - HC1: Restaurant 716 is never blocked (CR-level carve-out).
 *  - HC4: Default behaviour preserved (flag defaults to "allowed").
 *  - HC5: isEditMode bypasses all blocks.
 *  - HC6: Takeaway / delivery bypass all blocks.
 *  - HC7: `walkin` QR is a valid scan; not blocked.
 */

const TAKEAWAY_OR_DELIVERY = new Set(['takeaway', 'take_away', 'delivery']);
const VALID_QR_SCAN_TYPES = new Set(['table', 'room', 'walkin']);

/**
 * @param {Object} ctx - runtime context
 * @param {string|number|null} ctx.restaurantId
 * @param {boolean} ctx.isScanned        - from useScannedTable()
 * @param {string|null} ctx.scannedTableId
 * @param {string|null} ctx.scannedRoomOrTable - 'table' | 'room' | 'walkin' | null
 * @param {string|null} ctx.scannedOrderType   - 'dinein' | 'takeaway' | 'delivery' | null
 * @param {string|null} [ctx.selectedMode]     - landing-page toggle value
 * @param {boolean} [ctx.isEditMode]
 *
 * @param {Object} config - restaurant config (from RestaurantConfigContext)
 * @param {boolean} [config.allowNonQrOrders]
 *
 * @returns {{ block: boolean, reason: string }}
 */
export const shouldBlockNonQrOrder = (ctx, config) => {
  // HC4: default = allowed. Only `=== false` enables enforcement.
  if (!config || config.allowNonQrOrders !== false) {
    return { block: false, reason: 'policy-disabled' };
  }

  // HC1: 716 carve-out.
  if (String(ctx?.restaurantId) === '716') {
    return { block: false, reason: 'rid-716-carveout' };
  }

  // HC5: edit-mode bypass.
  if (ctx?.isEditMode === true) {
    return { block: false, reason: 'edit-mode' };
  }

  // HC6: takeaway / delivery never blocked.
  if (
    TAKEAWAY_OR_DELIVERY.has(ctx?.selectedMode) ||
    TAKEAWAY_OR_DELIVERY.has(ctx?.scannedOrderType)
  ) {
    return { block: false, reason: 'non-dinein-mode' };
  }

  // HC7 + main rule. "Non-QR" = neither a tableId nor a recognised scan type.
  const hasScannedTableId = !!ctx?.scannedTableId;
  const hasValidScanType = VALID_QR_SCAN_TYPES.has(ctx?.scannedRoomOrTable);
  const isNonQr = !hasScannedTableId && !hasValidScanType;

  return isNonQr
    ? { block: true, reason: 'non-qr-dinein' }
    : { block: false, reason: 'valid-qr' };
};

/**
 * Build the telemetry payload (used by the diagnostics POST).
 * Kept here so the policy module owns the shape of the diagnostic record.
 */
export const buildNonQrBlockPayload = (ctx, checkpoint) => ({
  restaurant_id: String(ctx?.restaurantId || ''),
  checkpoint, // 'landing' | 'add_to_cart' | 'place_order'
  scanned_room_or_table: ctx?.scannedRoomOrTable || null,
  final_table_id: ctx?.scannedTableId ? String(ctx.scannedTableId) : '0',
  is_edit_mode: ctx?.isEditMode === true,
  is_authenticated: ctx?.isAuthenticated === true,
});
```

---

### 3.2 NEW — `frontend/src/components/NonQrBlockModal.jsx`

```jsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './NonQrBlockModal.css';

/**
 * CR-2026-05-30-002 — Non-dismissable session-expired modal.
 * Renders via React portal to escape any local stacking context.
 * No backdrop dismissal. No Escape-to-close. Single CTA only.
 *
 * @param {boolean} open
 * @param {() => void} onRescan - CTA handler (caller should navigate to landing)
 */
const NonQrBlockModal = ({ open, onRescan }) => {
  useEffect(() => {
    if (!open) return undefined;
    // Lock background scroll while modal is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="nonqr-modal-backdrop"
      data-testid="nonqr-block-modal-backdrop"
      // No onClick — backdrop is intentionally non-dismissable.
      role="presentation"
    >
      <div
        className="nonqr-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nonqr-modal-title"
        aria-describedby="nonqr-modal-body"
        data-testid="nonqr-block-modal"
      >
        <h2 id="nonqr-modal-title" className="nonqr-modal-title">
          Session Expired
        </h2>
        <p id="nonqr-modal-body" className="nonqr-modal-body">
          Please rescan the QR code at your table to continue. Items in your
          cart will be cleared.
        </p>
        <button
          type="button"
          className="nonqr-modal-cta"
          onClick={onRescan}
          data-testid="nonqr-block-modal-cta"
        >
          OK, Rescan
        </button>
      </div>
    </div>,
    document.body
  );
};

export default NonQrBlockModal;
```

---

### 3.3 NEW — `frontend/src/components/NonQrBlockModal.css`

```css
/* CR-2026-05-30-002 — Non-QR block modal. Mirrors existing modal styling. */

.nonqr-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

.nonqr-modal-card {
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #111111);
  border-radius: var(--radius-container-lg, 12px);
  max-width: 420px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  text-align: left;
}

.nonqr-modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0 0 12px 0;
  font-family: var(--font-heading, inherit);
}

.nonqr-modal-body {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-secondary, #555555);
  margin: 0 0 20px 0;
}

.nonqr-modal-cta {
  display: block;
  width: 100%;
  padding: 12px 20px;
  background: var(--color-primary, #1f7ae0);
  color: var(--button-text-color, #ffffff);
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-button, 8px);
  cursor: pointer;
}

.nonqr-modal-cta:hover { filter: brightness(0.95); }
.nonqr-modal-cta:active { filter: brightness(0.9); }
```

---

### 3.4 NEW — `frontend/src/api/services/diagnosticsService.js`

```javascript
/**
 * CR-2026-05-30-002 — Client-side diagnostics for non-QR blocks.
 * Fire-and-forget. Never throws. Never blocks the UI flow.
 */

import logger from '../../utils/logger';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Sends a non-QR block event to the backend. Caller does not await this.
 * @param {Object} payload - shape from buildNonQrBlockPayload()
 */
export const postNonQrBlock = (payload) => {
  try {
    // Use sendBeacon when available so a navigation right after this call
    // still delivers the event. Fall back to fetch with keepalive.
    const body = JSON.stringify(payload);
    const url = `${API_URL}/api/diagnostics/non-qr-block`;

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch((err) => {
      logger.error('diagnostics', 'postNonQrBlock failed:', err);
    });
  } catch (err) {
    logger.error('diagnostics', 'postNonQrBlock threw:', err);
  }
};
```

---

### 3.5 EDIT — `frontend/src/context/AdminConfigContext.jsx`

**Locate** (currently at ~L126-L135 in `defaultConfig`):

```javascript
  // Skip OTP / Password Setup screen — CR-2026-05-30-001 Item 1
  // Default false → password-setup screen IS shown (current behaviour preserved).
  // Admin opts in per order type → silent crmSkipOtp + direct to /menu.
  skipOtpDineIn: false,
  skipOtpTakeaway: false,
  skipOtpDelivery: false,
  skipOtpDineInWithTable: false,
  skipOtpWalkIn: false,
  skipOtpRoomOrders: false,
};
```

**Replace** with:

```javascript
  // Skip OTP / Password Setup screen — CR-2026-05-30-001 Item 1
  // Default false → password-setup screen IS shown (current behaviour preserved).
  // Admin opts in per order type → silent crmSkipOtp + direct to /menu.
  skipOtpDineIn: false,
  skipOtpTakeaway: false,
  skipOtpDelivery: false,
  skipOtpDineInWithTable: false,
  skipOtpWalkIn: false,
  skipOtpRoomOrders: false,
  // Non-QR order access policy — CR-2026-05-30-002.
  // Default true = allowed (current behaviour preserved for every restaurant).
  // Admin flips to false to enforce QR-required mode (rescan prompts at 3 checkpoints).
  allowNonQrOrders: true,
};
```

---

### 3.6 EDIT — `frontend/src/context/RestaurantConfigContext.jsx`

#### 3.6.1 Add to `DEFAULT_CONFIG` (after the `skipOtp*` block at ~L101-L109)

**Locate**:

```javascript
  skipOtpDelivery: false,
  // Restaurant Operating Shifts
```

**Replace** with:

```javascript
  skipOtpDelivery: false,
  // Non-QR order access policy — CR-2026-05-30-002.
  // Default true → no enforcement, no block, no telemetry (current behaviour).
  allowNonQrOrders: true,
  // Restaurant Operating Shifts
```

#### 3.6.2 Add to `value` object (after the `skipOtp*` block at ~L460-L467)

**Locate**:

```javascript
    skipOtpDelivery: config.skipOtpDelivery === true,
    // Restaurant Operating Shifts
```

**Replace** with:

```javascript
    skipOtpDelivery: config.skipOtpDelivery === true,
    // Non-QR order access policy (CR-2026-05-30-002). Default true (enforced
    // only when admin explicitly sets false). `!== false` so missing / null /
    // undefined resolves to "allowed", preserving Day-1 behaviour.
    allowNonQrOrders: config.allowNonQrOrders !== false,
    // Restaurant Operating Shifts
```

---

### 3.7 EDIT — `frontend/src/pages/admin/AdminVisibilityPage.jsx`

**Locate** the last admin-section block (Skip OTP section ending at L117) and **insert AFTER it but BEFORE the closing `</div>` of the page** (L118):

```jsx
      {/* Order Access Policy — CR-2026-05-30-002 */}
      <div className="admin-section" data-testid="admin-section-order-access">
        <h2 className="admin-section-title">Order Access Policy</h2>
        <p className="admin-section-description">
          When OFF, customers must arrive via a valid QR scan (table / room / walk-in).
          Customers without a scan will be prompted to rescan at landing, when adding
          their first item to cart, and at place-order. Default ON (no enforcement).
          Restaurant 716 is unaffected by this setting.
        </p>
        <div className="admin-toggle-grid">
          <ToggleSwitch field="allowNonQrOrders" label="Allow Non-QR Orders" />
        </div>
      </div>
```

> Place the insert exactly before the final `</div>` that closes the page wrapper (the `<div className="admin-page">`).

---

### 3.8 EDIT — `frontend/src/pages/LandingPage.jsx`  (Guard C1)

#### 3.8.1 Add imports near the top (next to other context/util imports)

```javascript
import { shouldBlockNonQrOrder, buildNonQrBlockPayload } from '../utils/orderAccessPolicy';
import { postNonQrBlock } from '../api/services/diagnosticsService';
import NonQrBlockModal from '../components/NonQrBlockModal';
```

#### 3.8.2 Read the new config flag from `useRestaurantConfig`

Find the existing destructure of `useRestaurantConfig` in this file (it's near the top of the component). **Append** `allowNonQrOrders` to the destructured list, e.g.:

```javascript
const { /* … existing fields …, */ allowNonQrOrders } = useRestaurantConfig();
```

#### 3.8.3 Add modal state inside the component

Near the other `useState` calls:

```javascript
const [showNonQrBlockModal, setShowNonQrBlockModal] = useState(false);
```

#### 3.8.4 Read `isEditMode` from `useCart()`

The component already imports `useCart` (`clearCart` is already destructured at ~L401). Extend the destructure:

```javascript
const { clearCart, isEditMode } = useCart();
```

#### 3.8.5 Insert the guard at the TOP of `handleDiningMenuClick` (L477)

**Locate**:

```javascript
  const handleDiningMenuClick = async () => {
    const actualRestaurantId = restaurant?.id || restaurantId;
    console.log('[Landing] Browse Menu clicked', { isAuthenticated, isTakeawayDeliveryMode, capturedPhone, capturedName, selectedMode });

    // CR Phase-1 — Room Scanner Availability Gate (defensive guard)
```

**Replace** with:

```javascript
  const handleDiningMenuClick = async () => {
    const actualRestaurantId = restaurant?.id || restaurantId;
    console.log('[Landing] Browse Menu clicked', { isAuthenticated, isTakeawayDeliveryMode, capturedPhone, capturedName, selectedMode });

    // CR-2026-05-30-002 — Guard C1 (Landing → Browse Menu).
    // Fires when admin set allowNonQrOrders=false and the customer has no
    // valid QR-scan context. Bypasses honoured: 716, takeaway/delivery,
    // edit-mode, walk-in QR (see shouldBlockNonQrOrder).
    {
      const policy = shouldBlockNonQrOrder(
        {
          restaurantId,
          isScanned,
          scannedTableId,
          scannedRoomOrTable,
          scannedOrderType,
          selectedMode,
          isEditMode,
        },
        { allowNonQrOrders }
      );
      if (policy.block) {
        clearCart();
        postNonQrBlock({
          ...buildNonQrBlockPayload(
            { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
            'landing'
          ),
        });
        setShowNonQrBlockModal(true);
        return;
      }
    }

    // CR Phase-1 — Room Scanner Availability Gate (defensive guard)
```

#### 3.8.6 Render the modal inside the JSX (anywhere inside the top-level returned fragment, e.g. just before the closing tag)

```jsx
<NonQrBlockModal
  open={showNonQrBlockModal}
  onRescan={() => {
    setShowNonQrBlockModal(false);
    navigate(`/${restaurant?.id || restaurantId}`);
  }}
/>
```

---

### 3.9 EDIT — `frontend/src/pages/MenuItems.jsx`  (Guard C2)

#### 3.9.1 Add imports near existing ones

```javascript
import { useState as useStateExisting } from 'react'; // already imported as useState
import { shouldBlockNonQrOrder, buildNonQrBlockPayload } from '../utils/orderAccessPolicy';
import { postNonQrBlock } from '../api/services/diagnosticsService';
import NonQrBlockModal from '../components/NonQrBlockModal';
```

> `useState` is already imported at L1 — do NOT re-import it. The line above is illustrative.

#### 3.9.2 Pull `allowNonQrOrders` from `useRestaurantConfig`

The existing destructure is at L31. Extend it:

```javascript
const { /* … existing fields …, */ allowNonQrOrders } = useRestaurantConfig();
```

#### 3.9.3 Pull `isScanned`, `scannedTableId`, `scannedRoomOrTable` from `useScannedTable`

Currently at L55:

```javascript
const { foodFor, orderType: scannedOrderType } = useScannedTable();
```

Replace with:

```javascript
const {
  foodFor,
  orderType: scannedOrderType,
  isScanned,
  tableId: scannedTableId,
  roomOrTable: scannedRoomOrTable,
} = useScannedTable();
```

#### 3.9.4 Extend the existing `useCart()` destructure to include `isEditMode` (already present — verify) and `cartItems` (already present)

L143 already has `isEditMode`. No change needed if it's there.

#### 3.9.5 Add modal state and a guard helper inside the component

After the other `useState` calls:

```javascript
const [showNonQrBlockModal, setShowNonQrBlockModal] = useState(false);

/**
 * CR-2026-05-30-002 — Guard C2.
 * Returns true when the add-to-cart attempt should be blocked.
 * Only fires on the FIRST add (cart currently empty) — subsequent adds within
 * the same session are not re-checked (locked semantics §4 C2).
 */
const isBlockedNonQrAdd = useCallback(() => {
  if (cartItems && cartItems.length > 0) return false;
  const policy = shouldBlockNonQrOrder(
    {
      restaurantId,
      isScanned,
      scannedTableId,
      scannedRoomOrTable,
      scannedOrderType,
      isEditMode,
    },
    { allowNonQrOrders }
  );
  if (!policy.block) return false;
  clearCart();
  postNonQrBlock(
    buildNonQrBlockPayload(
      { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode },
      'add_to_cart'
    )
  );
  setShowNonQrBlockModal(true);
  return true;
}, [
  cartItems, restaurantId, isScanned, scannedTableId, scannedRoomOrTable,
  scannedOrderType, isEditMode, allowNonQrOrders, clearCart,
]);
```

#### 3.9.6 Wrap every add-to-cart entry point

**L416 — `handleAddToCart`**: insert as the very first line of the function body:

```javascript
const handleAddToCart = useCallback((item) => {
  if (isBlockedNonQrAdd()) return;
  // … existing body
}, [addToCart, scannedOrderType, isBlockedNonQrAdd]);
```

**L442 — `handleAddToCartFromModal`**: insert as the first line:

```javascript
const handleAddToCartFromModal = useCallback((item, variations, add_ons) => {
  if (isBlockedNonQrAdd()) return;
  addToCart(item, variations, add_ons, scannedOrderType);
}, [addToCart, scannedOrderType, isBlockedNonQrAdd]);
```

**L485 — `handleIncrement`**: insert as the first line:

```javascript
const handleIncrement = useCallback((item) => {
  if (isBlockedNonQrAdd()) return;
  // … existing body
}, [cartItems, updateQuantity, addToCart, scannedOrderType, isBlockedNonQrAdd]);
```

> The `isBlockedNonQrAdd()` self-gate (`if (cartItems.length > 0) return false`) ensures only the FIRST add fires the guard, so the increment path on existing items doesn't get blocked mid-session.

#### 3.9.7 Render the modal in JSX (near the end of the component's returned tree)

```jsx
<NonQrBlockModal
  open={showNonQrBlockModal}
  onRescan={() => {
    setShowNonQrBlockModal(false);
    navigate(`/${restaurantId}`);
  }}
/>
```

---

### 3.10 EDIT — `frontend/src/pages/ReviewOrder.jsx`  (Guard C3)

#### 3.10.1 Add imports

```javascript
import { shouldBlockNonQrOrder, buildNonQrBlockPayload } from '../utils/orderAccessPolicy';
import { postNonQrBlock } from '../api/services/diagnosticsService';
import NonQrBlockModal from '../components/NonQrBlockModal';
```

#### 3.10.2 Pull `allowNonQrOrders`

In the existing `useRestaurantConfig` destructure (L82), append:

```javascript
const { /* … existing fields …, */ allowNonQrOrders } = useRestaurantConfig();
```

#### 3.10.3 Add modal state inside the component

```javascript
const [showNonQrBlockModal, setShowNonQrBlockModal] = useState(false);
```

#### 3.10.4 Insert the guard at the TOP of `handlePlaceOrder` (L814)

**Locate**:

```javascript
const handlePlaceOrder = async () => {
  // ─────────────────────────────────────────────────────────────────────────
  // CR Phase-1 — Room Scanner Safety Guard (pre-submit)
```

**Replace** with:

```javascript
const handlePlaceOrder = async () => {
  // CR-2026-05-30-002 — Guard C3 (Place/Update Order).
  // Final defence: even if C1/C2 were bypassed (e.g. customer arrived from a
  // deep link to /review-order, or admin flipped the flag mid-session),
  // refuse to submit a non-QR order.
  {
    const policy = shouldBlockNonQrOrder(
      {
        restaurantId,
        isScanned,
        scannedTableId,
        scannedRoomOrTable,
        scannedOrderType,
        isEditMode,
      },
      { allowNonQrOrders }
    );
    if (policy.block) {
      clearCart();
      postNonQrBlock(
        buildNonQrBlockPayload(
          { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
          'place_order'
        )
      );
      setShowNonQrBlockModal(true);
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CR Phase-1 — Room Scanner Safety Guard (pre-submit)
```

#### 3.10.5 Render the modal in JSX

```jsx
<NonQrBlockModal
  open={showNonQrBlockModal}
  onRescan={() => {
    setShowNonQrBlockModal(false);
    navigate(`/${restaurantId}`);
  }}
/>
```

> `navigate` is already in scope (the file already calls `navigate(...)` elsewhere).

---

### 3.11 EDIT — `backend/server.py`  (telemetry endpoint + rolling cap)

#### 3.11.1 Add the diagnostics router (near other routers, after L54)

**Locate**:

```python
dietary_router = APIRouter(prefix="/dietary-tags", tags=["Dietary Tags"])
```

**Replace** with:

```python
dietary_router = APIRouter(prefix="/dietary-tags", tags=["Dietary Tags"])
diagnostics_router = APIRouter(prefix="/diagnostics", tags=["Diagnostics"])
```

#### 3.11.2 Add the Pydantic model (in the Models section, after the other request models)

```python
# CR-2026-05-30-002 — Non-QR block telemetry
class NonQrBlockEvent(BaseModel):
    restaurant_id: str
    checkpoint: str  # 'landing' | 'add_to_cart' | 'place_order'
    scanned_room_or_table: Optional[str] = None  # 'table' | 'room' | 'walkin' | null
    final_table_id: Optional[str] = "0"
    is_edit_mode: bool = False
    is_authenticated: bool = False
```

#### 3.11.3 Add the endpoint (place near the other top-level diagnostic / docs endpoints, e.g. after L1357 `loyalty-settings`)

```python
# CR-2026-05-30-002 — Non-QR block diagnostic.
# Fire-and-forget from the frontend. Capped at 200 documents PER restaurant.
NON_QR_BLOCKS_COLLECTION = "non_qr_blocks"
NON_QR_BLOCKS_PER_RID_LIMIT = 200
_NON_QR_INDEX_READY = False


async def _ensure_non_qr_indexes():
    """Idempotent. Creates the indexes we rely on for the rolling cap."""
    global _NON_QR_INDEX_READY
    if _NON_QR_INDEX_READY:
        return
    try:
        await db[NON_QR_BLOCKS_COLLECTION].create_index(
            [("restaurant_id", 1), ("ts", -1)],
            name="rid_ts_desc",
        )
        _NON_QR_INDEX_READY = True
    except Exception as exc:
        # Don't crash the request path if index creation races.
        logger.warning("non_qr_blocks index creation skipped: %s", exc)


@diagnostics_router.post("/non-qr-block", status_code=204)
async def non_qr_block(event: NonQrBlockEvent, request: Request):
    """Record a non-QR block event. Returns 204 always (fire-and-forget)."""
    await _ensure_non_qr_indexes()

    # Capture request metadata server-side (cleaner than trusting the FE).
    xff = request.headers.get("x-forwarded-for") or ""
    client_ip = xff.split(",")[0].strip() if xff else (
        request.client.host if request.client else None
    )

    doc = {
        "_id": str(uuid.uuid4()),
        "restaurant_id": str(event.restaurant_id),
        "checkpoint": event.checkpoint,
        "scanned_room_or_table": event.scanned_room_or_table,
        "final_table_id": event.final_table_id or "0",
        "is_edit_mode": bool(event.is_edit_mode),
        "is_authenticated": bool(event.is_authenticated),
        "client_ip": client_ip,
        "user_agent": request.headers.get("user-agent"),
        "referer": request.headers.get("referer"),
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    try:
        await db[NON_QR_BLOCKS_COLLECTION].insert_one(doc)

        # Rolling cap: keep newest 200 per restaurant_id.
        # Cheap because of the (restaurant_id, ts DESC) index.
        count = await db[NON_QR_BLOCKS_COLLECTION].count_documents(
            {"restaurant_id": doc["restaurant_id"]}
        )
        if count > NON_QR_BLOCKS_PER_RID_LIMIT:
            excess = count - NON_QR_BLOCKS_PER_RID_LIMIT
            cursor = (
                db[NON_QR_BLOCKS_COLLECTION]
                .find({"restaurant_id": doc["restaurant_id"]}, {"_id": 1})
                .sort("ts", 1)
                .limit(excess)
            )
            stale_ids = [d["_id"] async for d in cursor]
            if stale_ids:
                await db[NON_QR_BLOCKS_COLLECTION].delete_many({"_id": {"$in": stale_ids}})
    except Exception as exc:
        logger.warning("non_qr_block insert failed: %s", exc)
        # Still return 204 — diagnostics must never break the FE.

    return None
```

> Make sure `Request` is in the FastAPI import line at the top of the file:
> `from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Request`

#### 3.11.4 Wire the router into `api_router` (near L1510)

**Locate**:

```python
api_router.include_router(dietary_router)
```

**Insert AFTER** that line:

```python
api_router.include_router(diagnostics_router)
```

> If the existing code uses `api_router.include_router(dietary_router)` followed immediately by docs endpoints, place the new include there so it stays grouped with other routers.

---

## 4. Restart & smoke-test order

```bash
# Backend picks up the new endpoint via hot-reload, but a restart is safer:
sudo supervisorctl restart backend

# Frontend is hot-reloaded by craco — no restart needed unless deps changed.

# Smoke: backend endpoint must respond 204 on a synthetic call
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API_URL/api/diagnostics/non-qr-block" \
  -H "Content-Type: application/json" \
  -d '{"restaurant_id":"698","checkpoint":"landing","scanned_room_or_table":null,"final_table_id":"0","is_edit_mode":false,"is_authenticated":false}'
# Expected: 204
```

---

## 5. Testing (testing_agent_v3_fork)

The implementer must call `testing_agent_v3_fork` after coding is done, scoped to **frontend only** (the backend endpoint is exercised indirectly through the FE blocks). Provide the 18 scenarios in `CR.md §9` as the test plan. Reference rid for QA = **698 (Cafe Flora)**.

The agent should specifically validate:
- Day-1 backward compatibility (flag absent or true → zero behaviour change).
- All 3 checkpoints fire when the flag is false AND the customer is non-QR.
- 716 carve-out works (flag false on 716 → no block).
- Takeaway / delivery / walk-in QR / edit-mode bypasses.
- Cart is cleared at each block point.
- Modal cannot be dismissed by clicking the backdrop or pressing Escape.
- Telemetry POST is fired exactly once per block (sendBeacon or fetch keepalive).
- Per-RID 200-doc cap: simulate 250 events for rid=698, assert `db.non_qr_blocks.count_documents({restaurant_id:"698"}) == 200`.

---

## 6. Acceptance criteria (definition of done)

- [ ] All 11 file changes from §3 applied.
- [ ] Linting clean (`mcp_lint_javascript` for the FE files, `mcp_lint_python` for `server.py`).
- [ ] `supervisorctl status` shows backend + frontend RUNNING.
- [ ] Curl smoke test in §4 returns 204.
- [ ] `testing_agent_v3_fork` report shows scenarios 1, 5–10, 12, 13, 15, 16 PASS at minimum.
- [ ] No edit inside `if (String(restaurantId) === '716')` blocks in any of the 3 frontend guard files.
- [ ] `/app/memory/PRD.md` updated with a new "2026-XX-XX — CR-002 IMPLEMENTED" section.
- [ ] `/app/memory/test_credentials.md` reviewed (no new credentials are introduced by this CR; just verify it still has the admin login).
- [ ] No changes to existing `skipOtp*` toggles, parked Item 2 / Item 3 code, or `ReviewOrder.jsx:982-985`.

---

## 7. Things the implementer is NOT allowed to do

- **No** edits inside `if (String(restaurantId) === '716')` branches (HC1).
- **No** attempt to fix `ReviewOrder.jsx:982-985` (parked Item 2 root cause).
- **No** changes to `sessionStorage` → `localStorage` migration (parked F3).
- **No** new `allowWalkInQrOrders` flag — that's explicitly out of scope (§10 of CR.md).
- **No** deletion of the legacy `otpRequired*` flags — separate backlog item.
- **No** reuse of an existing modal component — the rescan modal must be a brand-new, non-dismissable variant (existing modals are dismissable and would create regressions).
- **No** silent CRM identity call from the rescan modal — there is no CRM interaction in this CR.

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Frontend hot-reload chokes on the new file imports | The new files are leaf modules; craco picks them up automatically. If not, `sudo supervisorctl restart frontend`. |
| Telemetry endpoint receives CORS preflight failure | `non-qr-block` is `POST` JSON — same origin via ingress; covered by existing CORS middleware. No extra config. |
| sendBeacon not supported on older mobile Safari (< iOS 11) | The fallback `fetch({ keepalive: true })` covers iOS 11+. iOS 10 and below are <0.5% in this app's analytics; acceptable. |
| Index creation race on first request | `_ensure_non_qr_indexes` is idempotent and try/except'd. Cold start cost ~10ms once per backend process. |
| Per-RID cap query gets slow as collection grows | Bounded by (restaurant_count × 200). At 1000 restaurants → 200k docs; with the `(restaurant_id, ts)` index, count + cursor is O(log n). Acceptable. |
| Customer clicks "OK, Rescan" but tablet has no QR camera | They're routed back to `/<rid>` landing where they can re-enter the URL params from the new scan. Same as today's "rescan" experience. |
| Item 1 (`skipOtp*`) interacts with new guards | HC3 — the new guards fire BEFORE OTP-skip logic in `handleDiningMenuClick`. A blocked customer never reaches the OTP path. Verified by the order of the early `return` in §3.8.5. |

---

## 9. Rollback plan

If the new behaviour misbehaves in production:

1. **Soft rollback** (preferred): admin sets `allowNonQrOrders = true` for the affected restaurant → behaviour reverts instantly. No code rollback needed.
2. **Hard rollback**: `git revert` the single PR. All new files are leaf modules and all edits are additive; revert is clean.
3. Telemetry collection (`non_qr_blocks`) can be dropped manually if not desired: `db.non_qr_blocks.drop()` — no production code depends on it.

---

## 10. Post-merge follow-ups (NOT part of this CR)

- Admin UI to surface non-QR block telemetry (read-only dashboard reading from `non_qr_blocks`). Backlog.
- A separate `allowWalkInQrOrders` flag if owners want to disable walk-in QRs independently. Backlog.
- The parked Item 2 systemic fix (`ReviewOrder.jsx:982-985`). Parked.

---

**End of plan.** Hand this doc + `CR.md` to the implementing agent. Estimated total agent runtime: ~25 minutes of code + ~15 minutes of testing.
