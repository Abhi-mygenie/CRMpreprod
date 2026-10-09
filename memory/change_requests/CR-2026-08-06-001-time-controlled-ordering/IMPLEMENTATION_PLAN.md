# IMPLEMENTATION PLAN — CR-2026-08-06-001

**Status:** READY FOR OWNER APPROVAL  
**Risk:** HIGH → CRITICAL  
**Prepared:** 2026-08-06  
**Files changing:** 8  
**Total edits:** 15  
**Code marker:** `// CR-2026-08-06-001`

---

## Pre-Implementation Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Owner approval for this plan | REQUIRED |
| 2 | Impact Analysis gate closed | ✅ CLOSED 2026-08-06 |
| 3 | Design approved | ✅ APPROVED 2026-08-06 |
| 4 | No active CRs on any of the 8 files | ✅ CLEAR |
| 5 | CR-2026-08-03-001 edits not yet started (ReviewOrder.jsx shared) | ✅ CLEAR — that CR not yet in implementation |

---

## Scope Lock

### WILL change (8 files)

| File | Risk | Edits |
|------|------|-------|
| `itemAvailability.js` | MEDIUM | 1 — add 2 new exported helpers (additive) |
| `RestaurantConfigContext.jsx` | HIGH | 2 — add 5 channel fields to DEFAULT_CONFIG + normalize |
| `server.py` | HIGH | 2 — add 5 fields to AppConfigUpdate + get_app_config defaults |
| `AdminSettingsPage.jsx` | MEDIUM | 1 — add Channel Hours section after global shifts |
| `OrderModeSelector.jsx` | MEDIUM | 1 — add disabled state + opening time props |
| `LandingPage.jsx` | HIGH | 2 — destructure new fields + compute/pass channel availability |
| `MenuItems.jsx` | HIGH | 3 — import helpers + replace check + add banner |
| `ReviewOrder.jsx` | CRITICAL | 2 — destructure new fields + add channel gate at handlePlaceOrder |

### WILL NOT change (8 files)

`AuthContext.jsx`, `CartContext.js`, `orderService.ts`, `OrderSuccess.jsx`,
`TableRoomSelector.jsx`, `orderAccessPolicy.js`, `isRestaurantOpen()` (existing fn unchanged),
`restaurantShifts` / `restaurantOpen` (existing fields untouched)

---

## Channel → Config Field Mapping

| scannedOrderType value | Config field | Admin label |
|------------------------|-------------|------------|
| `'delivery'` | `deliveryShifts` | Delivery |
| `'takeaway'` | `takeawayShifts` | Takeaway |
| `'dinein'` | `dineInShifts` | Dine-in |
| `'room'` | `roomShifts` | Room Service |
| `'walkin'` | `walkinShifts` | Walk-in |

---

## Edit-by-Edit Plan

### FILE 1 — itemAvailability.js (1 edit)

#### EDIT IA-1 — Add `isChannelOpen` and `getChannelNextOpenTime` (append to end of file)

**Where:** After the last line of the file (after line 181, after closing `};`)

**Action:** Append the following two exported functions.

```js
// CR-2026-08-06-001: per-channel open check
const CHANNEL_SHIFT_KEY = {
  delivery: 'deliveryShifts',
  takeaway: 'takeawayShifts',
  dinein:   'dineInShifts',
  room:     'roomShifts',
  walkin:   'walkinShifts',
};

/**
 * Check if a specific order channel is currently open.
 * Priority: restaurantOpen master toggle → channel-specific shifts → global restaurantShifts → true (24/7).
 * @param {string} channel - 'delivery' | 'takeaway' | 'dinein' | 'room' | 'walkin'
 * @param {object} config  - from useRestaurantConfig()
 * @returns {boolean}
 */
export const isChannelOpen = (channel, config) => {
  if (!config) return true;
  // Master toggle — if restaurant is closed, all channels are closed
  if (config.restaurantOpen === false) return false;
  const key = CHANNEL_SHIFT_KEY[channel];
  const channelShifts = key ? config[key] : null;
  // Channel-specific shifts set → use them
  if (Array.isArray(channelShifts) && channelShifts.length > 0) {
    return isRestaurantOpen(channelShifts);
  }
  // Fallback to global restaurantShifts
  return isRestaurantOpen(config.restaurantShifts);
};

/**
 * Get the next opening time string for a channel ("11:00 AM") or null if not configured.
 * @param {string} channel
 * @param {object} config
 * @returns {string|null}
 */
export const getChannelNextOpenTime = (channel, config) => {
  if (!config) return null;
  const key = CHANNEL_SHIFT_KEY[channel];
  const channelShifts = key ? config[key] : null;
  const shifts = (Array.isArray(channelShifts) && channelShifts.length > 0)
    ? channelShifts
    : config.restaurantShifts;
  if (!Array.isArray(shifts) || shifts.length === 0) return null;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  // Find the next shift start after current time
  for (const shift of shifts) {
    if (!shift.start) continue;
    const [h, m] = shift.start.split(':').map(Number);
    const startMins = h * 60 + (m || 0);
    if (startMins > currentMins) {
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const mm = String(m || 0).padStart(2, '0');
      return `${h12}:${mm} ${suffix}`;
    }
  }
  // No shift starts later today → return the first shift start of the next day
  const first = shifts[0];
  if (!first?.start) return null;
  const [h, m] = first.start.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mm = String(m || 0).padStart(2, '0');
  return `${h12}:${mm} ${suffix}`;
};
```

---

### FILE 2 — RestaurantConfigContext.jsx (2 edits)

#### EDIT RC-1 — Add 5 channel shift fields to DEFAULT_CONFIG

**Where:** After line 135 (`restaurantOpen: true,`)

**Current:**
```js
  // Restaurant Operating Shifts
  restaurantShifts: [{ start: '06:00', end: '03:00' }],
  // Restaurant Open master toggle (default open)
  restaurantOpen: true,
  // Category & Item Timings
  categoryTimings: {},
```

**Replace with:**
```js
  // Restaurant Operating Shifts
  restaurantShifts: [{ start: '06:00', end: '03:00' }],
  // Restaurant Open master toggle (default open)
  restaurantOpen: true,
  // CR-2026-08-06-001: Per-channel shifts. null = fall back to restaurantShifts = open 24/7.
  deliveryShifts: null,
  takeawayShifts: null,
  dineInShifts: null,
  roomShifts: null,
  walkinShifts: null,
  // Category & Item Timings
  categoryTimings: {},
```

---

#### EDIT RC-2 — Add 5 channel shift fields to the config normalize block

**Where:** After line 525 (`restaurantOpen: config.restaurantOpen !== false,`)

**Current:**
```js
  // Restaurant Operating Shifts
  restaurantShifts: config.restaurantShifts || [{ start: '06:00', end: '03:00' }],
  // Restaurant Open master toggle
  restaurantOpen: config.restaurantOpen !== false,
  // Category & Item Timings
  categoryTimings: config.categoryTimings || {},
```

**Replace with:**
```js
  // Restaurant Operating Shifts
  restaurantShifts: config.restaurantShifts || [{ start: '06:00', end: '03:00' }],
  // Restaurant Open master toggle
  restaurantOpen: config.restaurantOpen !== false,
  // CR-2026-08-06-001: Per-channel shifts — null = use global restaurantShifts fallback
  deliveryShifts: config.deliveryShifts ?? null,
  takeawayShifts: config.takeawayShifts ?? null,
  dineInShifts: config.dineInShifts ?? null,
  roomShifts: config.roomShifts ?? null,
  walkinShifts: config.walkinShifts ?? null,
  // Category & Item Timings
  categoryTimings: config.categoryTimings || {},
```

---

### FILE 3 — server.py (2 edits)

#### EDIT BE-1 — Add 5 fields to AppConfigUpdate model

**Where:** After line 254 (`restaurantShifts: Optional[List[dict]] = None`)

**Current:**
```python
    # Restaurant Operating Shifts (up to 4)
    restaurantShifts: Optional[List[dict]] = None  # [{ "start": "07:00", "end": "11:00" }, ...]
    # Restaurant Open master toggle
    restaurantOpen: Optional[bool] = None
    # Category & Item Timings (admin overrides)
    categoryTimings: Optional[dict] = None
```

**Replace with:**
```python
    # Restaurant Operating Shifts (up to 4)
    restaurantShifts: Optional[List[dict]] = None  # [{ "start": "07:00", "end": "11:00" }, ...]
    # Restaurant Open master toggle
    restaurantOpen: Optional[bool] = None
    # CR-2026-08-06-001: Per-channel shifts. None = fall back to restaurantShifts.
    deliveryShifts: Optional[List[dict]] = None
    takeawayShifts: Optional[List[dict]] = None
    dineInShifts: Optional[List[dict]] = None
    roomShifts: Optional[List[dict]] = None
    walkinShifts: Optional[List[dict]] = None
    # Category & Item Timings (admin overrides)
    categoryTimings: Optional[dict] = None
```

---

#### EDIT BE-2 — Add 5 fields to get_app_config defaults

**Where:** After line 1146 (`"restaurantOpen": True,`)

**Current:**
```python
            # Restaurant Operating Shifts
            "restaurantShifts": [{"start": "06:00", "end": "03:00"}],
            # Restaurant Open master toggle (default open)
            "restaurantOpen": True,
            # Category & Item Timings
            "categoryTimings": {},
```

**Replace with:**
```python
            # Restaurant Operating Shifts
            "restaurantShifts": [{"start": "06:00", "end": "03:00"}],
            # Restaurant Open master toggle (default open)
            "restaurantOpen": True,
            # CR-2026-08-06-001: Per-channel shifts — None = use global fallback
            "deliveryShifts": None,
            "takeawayShifts": None,
            "dineInShifts": None,
            "roomShifts": None,
            "walkinShifts": None,
            # Category & Item Timings
            "categoryTimings": {},
```

---

### FILE 4 — AdminSettingsPage.jsx (1 edit)

#### EDIT AS-1 — Add Channel Hours section after global shifts

**Where:** After line 256 (the closing `</div>` of the "Restaurant Operating Shifts" section), before line 258 `{/* Payment Options Section */}`

**Action:** Insert the following JSX block between the two sections.

```jsx
      {/* CR-2026-08-06-001: Per-Channel Hours */}
      <div className="admin-section" data-testid="channel-hours-section">
        <h2 className="admin-section-title">
          <IoTimeOutline /> Channel Hours
        </h2>
        <p className="admin-form-hint" style={{ marginBottom: '16px' }}>
          Set specific hours per ordering channel. Leave blank to use global shifts above.
          Blank + no global shifts = open 24/7.
        </p>
        {[
          { key: 'deliveryShifts', label: 'Delivery',      testId: 'delivery' },
          { key: 'takeawayShifts', label: 'Takeaway',      testId: 'takeaway' },
          { key: 'dineInShifts',   label: 'Dine-in',       testId: 'dinein' },
          { key: 'roomShifts',     label: 'Room Service',  testId: 'room' },
          { key: 'walkinShifts',   label: 'Walk-in',       testId: 'walkin' },
        ].map(({ key, label, testId }) => {
          const shift = (config[key] && config[key][0]) || { start: '', end: '' };
          return (
            <div key={key} className="admin-shift-row" data-testid={`channel-${testId}-row`}>
              <span className="admin-shift-label" style={{ minWidth: '100px' }}>{label}</span>
              <div className="admin-form-group">
                <label className="admin-form-label">Open</label>
                <input
                  type="time"
                  className="admin-form-input"
                  value={shift.start || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateField(key, null);
                    } else {
                      updateField(key, [{ start: val, end: shift.end || '' }]);
                    }
                  }}
                  data-testid={`channel-${testId}-start`}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Close</label>
                <input
                  type="time"
                  className="admin-form-input"
                  value={shift.end || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateField(key, null);
                    } else {
                      updateField(key, [{ start: shift.start || '', end: val }]);
                    }
                  }}
                  data-testid={`channel-${testId}-end`}
                />
              </div>
              {config[key] && (
                <button
                  type="button"
                  className="admin-shift-remove-btn"
                  onClick={() => updateField(key, null)}
                  data-testid={`channel-${testId}-clear`}
                  title="Clear (use global shifts)"
                >
                  <IoTrashOutline />
                </button>
              )}
            </div>
          );
        })}
      </div>
```

---

### FILE 5 — OrderModeSelector.jsx (1 edit)

#### EDIT OMS-1 — Add disabled/closed state with opening time

**Current** (full file, replace component):

```jsx
const OrderModeSelector = ({ mode, onModeChange, primaryColor, textColor }) => {
  return (
    <div className="order-mode-selector" data-testid="order-mode-selector">
      <button
        className={`order-mode-btn ${mode === 'takeaway' ? 'order-mode-btn-active' : ''}`}
        onClick={() => onModeChange('takeaway')}
        style={mode === 'takeaway' ? { backgroundColor: primaryColor, color: textColor } : {}}
        data-testid="order-mode-takeaway-btn"
      >
        <MdOutlineShoppingBag className="order-mode-icon" />
        <span>Takeaway</span>
      </button>
      <button
        className={`order-mode-btn ${mode === 'delivery' ? 'order-mode-btn-active' : ''}`}
        onClick={() => onModeChange('delivery')}
        style={mode === 'delivery' ? { backgroundColor: primaryColor, color: textColor } : {}}
        data-testid="order-mode-delivery-btn"
      >
        <MdOutlineDeliveryDining className="order-mode-icon" />
        <span>Delivery</span>
      </button>
    </div>
  );
};
```

**Replace with:**

```jsx
// CR-2026-08-06-001: deliveryOpen, takeawayOpen, deliveryOpensAt, takeawayOpensAt added
const OrderModeSelector = ({
  mode, onModeChange, primaryColor, textColor,
  deliveryOpen = true, takeawayOpen = true,
  deliveryOpensAt = null, takeawayOpensAt = null,
}) => {
  const channels = [
    { key: 'takeaway', label: 'Takeaway', Icon: MdOutlineShoppingBag, isOpen: takeawayOpen, opensAt: takeawayOpensAt },
    { key: 'delivery', label: 'Delivery', Icon: MdOutlineDeliveryDining, isOpen: deliveryOpen, opensAt: deliveryOpensAt },
  ];

  return (
    <div className="order-mode-selector" data-testid="order-mode-selector">
      {channels.map(({ key, label, Icon, isOpen, opensAt }) => {
        const isActive = mode === key && isOpen;
        const isClosed = !isOpen;
        return (
          <button
            key={key}
            className={`order-mode-btn ${isActive ? 'order-mode-btn-active' : ''} ${isClosed ? 'order-mode-btn-closed' : ''}`}
            onClick={() => !isClosed && onModeChange(key)}
            disabled={isClosed}
            style={isActive ? { backgroundColor: primaryColor, color: textColor } : {}}
            data-testid={`order-mode-${key}-btn`}
            aria-disabled={isClosed}
          >
            <Icon className="order-mode-icon" />
            <span>{label}</span>
            {isClosed && opensAt && (
              <span className="order-mode-opens-at" data-testid={`order-mode-${key}-opens-at`}>
                Opens {opensAt}
              </span>
            )}
            {isClosed && !opensAt && (
              <span className="order-mode-opens-at">Unavailable</span>
            )}
          </button>
        );
      })}
    </div>
  );
};
```

Also add CSS for the new class in `OrderModeSelector.css` (or inline — implementer to choose based on existing CSS file):

```css
/* CR-2026-08-06-001 */
.order-mode-btn-closed {
  opacity: 0.45;
  cursor: not-allowed;
}
.order-mode-opens-at {
  font-size: 10px;
  font-weight: 500;
  display: block;
  margin-top: 2px;
}
```

---

### FILE 6 — LandingPage.jsx (2 edits)

#### EDIT LP-1 — Import helpers + destructure channel shift fields

**Where:** Line 22 imports section (import itemAvailability helpers) and line 42 (useRestaurantConfig destructure)

**Part A — Add import:**

After the existing imports, add:

```js
import { isChannelOpen, getChannelNextOpenTime } from '../utils/itemAvailability'; // CR-2026-08-06-001
```

**Part B — Extend useRestaurantConfig destructure (line 42):**

Add `, deliveryShifts, takeawayShifts, restaurantShifts, restaurantOpen` at the end of the existing destructure.

**Current end of destructure:**
```js
..., skipOtpDelivery, allowNonQrOrders } = useRestaurantConfig();
```

**Replace with:**
```js
..., skipOtpDelivery, allowNonQrOrders,
  deliveryShifts, takeawayShifts, restaurantShifts, restaurantOpen,
} = useRestaurantConfig(); // CR-2026-08-06-001: channel shift fields
```

---

#### EDIT LP-2 — Compute channel availability + pass to OrderModeSelector

**Part A — Add computed values after the `isTakeawayDeliveryMode` line (line 148):**

**Current:**
```js
  const isTakeawayDeliveryMode = isTakeawayOrDelivery(scannedOrderType);
  const [selectedMode, setSelectedMode] = useState(scannedOrderType === 'delivery' ? 'delivery' : 'takeaway');
```

**Replace with:**
```js
  const isTakeawayDeliveryMode = isTakeawayOrDelivery(scannedOrderType);
  const [selectedMode, setSelectedMode] = useState(scannedOrderType === 'delivery' ? 'delivery' : 'takeaway');

  // CR-2026-08-06-001: per-channel availability for the mode selector
  const channelConfig = { deliveryShifts, takeawayShifts, restaurantShifts, restaurantOpen };
  const isDeliveryOpen  = isChannelOpen('delivery',  channelConfig);
  const isTakeawayOpen  = isChannelOpen('takeaway',  channelConfig);
  const deliveryOpensAt = getChannelNextOpenTime('delivery',  channelConfig);
  const takeawayOpensAt = getChannelNextOpenTime('takeaway',  channelConfig);
```

**Part B — Pass new props to OrderModeSelector (line 1037-1042):**

**Current:**
```jsx
          <OrderModeSelector
            mode={selectedMode}
            onModeChange={handleModeChange}
            primaryColor={btnColor}
            textColor={btnTextColor}
          />
```

**Replace with:**
```jsx
          <OrderModeSelector
            mode={selectedMode}
            onModeChange={handleModeChange}
            primaryColor={btnColor}
            textColor={btnTextColor}
            deliveryOpen={isDeliveryOpen}
            takeawayOpen={isTakeawayOpen}
            deliveryOpensAt={deliveryOpensAt}
            takeawayOpensAt={takeawayOpensAt}
          />
```

---

### FILE 7 — MenuItems.jsx (3 edits)

#### EDIT MI-1 — Add import for new helpers

**Current (line 22):**
```js
import { isRestaurantOpen, isItemAvailable } from '../utils/itemAvailability'; // CR-2026-06-17-003 APP-11
```

**Replace with:**
```js
import { isRestaurantOpen, isItemAvailable, isChannelOpen, getChannelNextOpenTime } from '../utils/itemAvailability'; // CR-2026-06-17-003 APP-11 | CR-2026-08-06-001
```

---

#### EDIT MI-2 — Destructure channel shift fields + replace isOnlineOrderEnabled

**Part A — Add channel fields to useRestaurantConfig destructure (line 35):**

Add `, deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts` at the end of the existing destructure.

**Current end of destructure (line 35):**
```js
..., channelOverrides, allowNonQrOrders } = useRestaurantConfig();
```

**Replace with:**
```js
..., channelOverrides, allowNonQrOrders,
  deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts,
} = useRestaurantConfig();
```

**Part B — Replace `isOnlineOrderEnabled` (lines 136–138):**

**Current:**
```js
  const isOnlineOrderEnabled = (restaurant?.online_order === 'Yes' || restaurant?.online_order === undefined) 
    && restaurantOpen === true
    && isRestaurantOpen(restaurantShifts);
```

**Replace with:**
```js
  // CR-2026-08-06-001: per-channel open check replaces global isRestaurantOpen
  const channelConfig = { deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts, restaurantShifts, restaurantOpen };
  const isCurrentChannelOpen = isChannelOpen(scannedOrderType || 'dinein', channelConfig);
  const channelOpensAt = isCurrentChannelOpen ? null : getChannelNextOpenTime(scannedOrderType || 'dinein', channelConfig);
  const isOnlineOrderEnabled = (restaurant?.online_order === 'Yes' || restaurant?.online_order === undefined)
    && restaurantOpen === true
    && isCurrentChannelOpen;
```

---

#### EDIT MI-3 — Add unavailability banner in JSX

**Where:** Find where the menu items main content area starts rendering (after the filter bar / category bar, before the item list). Specifically, insert right before the item sections grid.

Look for the existing `{sectionsToDisplay.length === 0 &&` empty state or the scrollable content area. The exact insertion point: inside the main scrollable content, before `sectionsToDisplay.map(...)`.

**Action:** Insert banner block:

```jsx
{/* CR-2026-08-06-001: Channel unavailability banner */}
{!isCurrentChannelOpen && restaurantOpen !== false && (
  <div className="channel-unavail-banner" data-testid="channel-unavail-banner">
    <span className="channel-unavail-icon">🕐</span>
    <div className="channel-unavail-text">
      <strong>
        {scannedOrderType === 'delivery' ? 'Delivery' :
         scannedOrderType === 'takeaway' ? 'Takeaway' :
         scannedOrderType === 'walkin'   ? 'Walk-in orders' :
         scannedOrderType === 'room'     ? 'Room service' :
         'Ordering'} unavailable right now
      </strong>
      {channelOpensAt
        ? <span>Opens at {channelOpensAt}. You can still browse the menu.</span>
        : <span>Currently unavailable. Please check back later.</span>
      }
    </div>
  </div>
)}
```

Also add the following to `MenuItems.css` (or whichever stylesheet is in scope):

```css
/* CR-2026-08-06-001 */
.channel-unavail-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff8f0;
  border: 1px solid #f5cba7;
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0 0 12px 0;
}
.channel-unavail-banner .channel-unavail-icon { font-size: 18px; flex-shrink: 0; }
.channel-unavail-banner .channel-unavail-text { font-size: 13px; }
.channel-unavail-banner .channel-unavail-text strong { color: #c0392b; display: block; margin-bottom: 2px; }
.channel-unavail-banner .channel-unavail-text span { color: #666; font-size: 12px; }
```

---

### FILE 8 — ReviewOrder.jsx (2 edits)

#### EDIT RO-1 — Destructure channel shift fields from useRestaurantConfig

**Where:** Line 89 (the `useRestaurantConfig()` destructure)

**Current end of destructure:**
```js
..., allowNonQrOrders, categoryTimings, itemTimings } = useRestaurantConfig(); // CR-2026-06-17-003 APP-12
```

**Replace with:**
```js
..., allowNonQrOrders, categoryTimings, itemTimings,
  deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts,
  restaurantShifts, restaurantOpen,
} = useRestaurantConfig(); // CR-2026-06-17-003 APP-12 | CR-2026-08-06-001
```

---

#### EDIT RO-2 — Add channel open check in handlePlaceOrder + block UI

**Part A — Channel check in handlePlaceOrder (after the non-QR guard at line ~908):**

**Current (after line 908):**
```js
    // ─────────────────────────────────────────────────────────────────────────
    // CR Phase-1 — Room Scanner Safety Guard (pre-submit)
```

**Insert BEFORE that block:**
```js
    // CR-2026-08-06-001: Channel time gate — hard block if channel is closed
    {
      const channelConfig = { deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts, restaurantShifts, restaurantOpen };
      if (!isChannelOpen(scannedOrderType || 'dinein', channelConfig)) {
        const opensAt = getChannelNextOpenTime(scannedOrderType || 'dinein', channelConfig);
        const chLabel =
          scannedOrderType === 'delivery' ? 'Delivery' :
          scannedOrderType === 'takeaway' ? 'Takeaway' :
          scannedOrderType === 'room'     ? 'Room service' :
          scannedOrderType === 'walkin'   ? 'Walk-in orders' : 'Ordering';
        toast.error(
          opensAt
            ? `${chLabel} is unavailable right now. Opens at ${opensAt}.`
            : `${chLabel} is currently unavailable.`
        );
        return;
      }
    }
```

**Part B — Import the helpers at the top of the file:**

**Where:** Find the existing itemAvailability import (if any) or add near other utility imports.

```js
import { isChannelOpen, getChannelNextOpenTime } from '../utils/itemAvailability'; // CR-2026-08-06-001
```

---

## Edit Execution Order

Execute in this exact order — lowest risk first, critical file last:

```
1.  EDIT IA-1   — itemAvailability.js     — add isChannelOpen + getChannelNextOpenTime
2.  EDIT RC-1   — RestaurantConfigContext — add 5 fields to DEFAULT_CONFIG
3.  EDIT RC-2   — RestaurantConfigContext — add 5 fields to normalize block
4.  EDIT BE-1   — server.py               — add 5 fields to AppConfigUpdate
5.  EDIT BE-2   — server.py               — add 5 fields to get_app_config defaults
6.  EDIT AS-1   — AdminSettingsPage.jsx   — add Channel Hours section
7.  EDIT OMS-1  — OrderModeSelector.jsx   — add disabled state + opening time
8.  EDIT LP-1   — LandingPage.jsx         — import helpers + extend destructure
9.  EDIT LP-2   — LandingPage.jsx         — compute availability + pass to OrderModeSelector
10. EDIT MI-1   — MenuItems.jsx           — extend import
11. EDIT MI-2   — MenuItems.jsx           — extend destructure + replace isOnlineOrderEnabled
12. EDIT MI-3   — MenuItems.jsx           — add banner JSX + CSS
13. EDIT RO-2b  — ReviewOrder.jsx         — add import for helpers
14. EDIT RO-1   — ReviewOrder.jsx         — extend useRestaurantConfig destructure
15. EDIT RO-2a  — ReviewOrder.jsx         — add channel gate in handlePlaceOrder
```

---

## Self-Test Checks (before QA handover)

| # | Check | Method |
|---|-------|--------|
| ST-1 | `isChannelOpen` + `getChannelNextOpenTime` exported from itemAvailability | grep |
| ST-2 | `deliveryShifts` (and other 4) present in DEFAULT_CONFIG | grep |
| ST-3 | `deliveryShifts` (and other 4) present in normalize block | grep |
| ST-4 | `deliveryShifts` (and other 4) in AppConfigUpdate and get_app_config | grep |
| ST-5 | Channel Hours section visible in admin → Settings page | Browser |
| ST-6 | With no channel hours set → all channels open, banner absent, ordering allowed | Browser |
| ST-7 | Set delivery hours to future time → delivery button grayed on landing page | Browser |
| ST-8 | Set delivery hours to future time → banner shows on menu page | Browser |
| ST-9 | Set delivery hours to future time → clicking Place Order shows toast + blocked | Browser |
| ST-10 | yarn start / frontend compiles without errors | Terminal |
| ST-11 | Backend starts without errors after server.py changes | Logs |
| ST-12 | No `'716'` references added (guard against scope creep) | grep |

---

## Verification Matrix (18 cases — from Impact Analysis)

| # | Scenario | Config | Expected |
|---|----------|--------|----------|
| V1 | No channel hours, no global shifts | all null | All channels open 24/7, no banner |
| V2 | No channel hours, global shifts set | restaurantShifts only | All channels follow global shifts |
| V3 | Delivery hours set, others null | deliveryShifts: 11:00–22:00 | Only delivery gated; others use global |
| V4 | Delivery closed — menu page | deliveryShifts set, time outside | Banner shows, Add to Cart grayed |
| V5 | Delivery open — menu page | deliveryShifts set, time inside | No banner, Add to Cart active |
| V6 | Delivery closed — OrderModeSelector | deliveryShifts set | Delivery button grayed + opens time |
| V7 | Delivery closed — user tries to select | deliveryShifts set | Button non-interactive (disabled) |
| V8 | Delivery closed — ReviewOrder submit | deliveryShifts set | Toast + early return, no API call |
| V9 | Delivery closed — edit mode submit | deliveryShifts set | Same block applies in edit mode |
| V10 | restaurantOpen = false | any | All channels blocked (master toggle wins) |
| V11 | Takeaway closed, delivery open | both set | Takeaway grayed, delivery active |
| V12 | All 5 channels have specific hours | all set | Each channel fully independent |
| V13 | Overnight shift (room: 22:00–03:00) | roomShifts overnight | isWithinShift handles correctly |
| V14 | Opening time display — next open time | deliveryShifts future shift | Shows "Opens 11:00 AM" |
| V15 | Opening time display — no shifts | null | No time shown (null handled) |
| V16 | Admin saves channel hours | new config | Config saved, refreshed in customer app |
| V17 | Admin clears channel hours | set to null | Falls back to global shifts |
| V18 | Global fallback works end-to-end | only restaurantShifts set | All channels respect global shift |

---

## Exit Gate

```
1. [ ] Registry updated (CR-2026-08-06-001 status → IMPLEMENTATION COMPLETE)
2. [ ] All 15 edits applied (ST-1 to ST-5 grep checks)
3. [ ] Code marker // CR-2026-08-06-001 on every changed block
4. [ ] yarn start compiles without errors
5. [ ] Backend starts without errors
6. [ ] Self-tests ST-6 through ST-9 pass (browser)
7. [ ] QA handover written
8. [ ] Session handover written
```

---

```
Planning complete: CR-2026-08-06-001
Stage: Implementation Plan — COMPLETE
Risk: HIGH → CRITICAL
Files WILL change: 8 (15 edits)
Files WILL NOT touch: 8 (confirmed)
Execution order: 15 steps defined
Verification: 18 test cases + 12 self-test checks
Docs: IMPLEMENTATION_PLAN.md
Next: OWNER APPROVAL → Implementation
```
