# IMPLEMENTATION PLAN — CR-2026-09-07-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-07-001 |
| **Title** | Inventory stock-out control — FE three-layer defence |
| **Planning Stage** | Implementation Plan — **IMPLEMENTED ✅ 2026-09-08** |
| **Date** | 2026-09-07 |
| **Risk** | HIGH — ReviewOrder.jsx CRITICAL, CartContext.js HIGH per Part C |
| **Prior gate** | Impact Analysis CLOSED ✅ |
| **Design approved** | ✅ 2026-09-07 — /app/frontend/public/stockout-mockup.html |

---

## Execution Order

Files MUST be implemented in this order. Later files depend on earlier ones.

```
Step 1  order.types.ts          LOW     — types first; zero runtime impact
Step 2  useMenuData.js          MEDIUM  — feeds stock_out to all downstream consumers
Step 3  MenuItems.jsx           MEDIUM  — L1 filter (reads stock_out from transform)
Step 4  MenuItem.jsx            MEDIUM  — L1 Sold Out state (reads stock_out from transform)
Step 5  CustomizeItemModal.jsx  MEDIUM  — L2 addon disable (reads addon.stock_out passthrough)
Step 6  CartContext.js          HIGH    — L2 addToCart guard (reads stock_out from item)
Step 7  orderService.ts         HIGH    — L3 error typing (POS 422 detection)
Step 8  ReviewOrder.jsx         CRITICAL— L3 pre-check + catch (reads cache + typed error)
```

---

## Step 1 — `order.types.ts`
**Risk:** LOW | **Lines affected:** 175–237

### What and Why
Add `StockOutFoodItem`, `StockOutAddonItem` interfaces.
Extend `ApiPlaceOrderResponse`, `ApiProductAddon`, `ApiProductResponse`, `ApiRestaurantInfoResponse`.
No runtime change — types only.

### Exact Change

**After line 174** (blank line before `// Place/Update Order API Response` comment), insert:

```ts
// ============================================
// Stock-Out Types (CR-2026-09-07-001)
// ============================================
export interface StockOutFoodItem {
  type: 'food';
  food_id: string | number;
  food_name: string;
  message: string;
}

export interface StockOutAddonItem {
  type: 'addon';
  food_id: string | number;
  food_name: string;
  addon_id: string | number;
  addon_name: string;
  message: string;
}
```

**Replace lines 177–180** (`ApiPlaceOrderResponse`):

```ts
export interface ApiPlaceOrderResponse {
  message: string;
  order_id: number;
  // CR-2026-09-07-001: stock-out error fields (HTTP 422 path)
  error?: string;
  out_of_stock_items?: (StockOutFoodItem | StockOutAddonItem)[];
}
```

**Replace line 236** (`ApiProductAddon`):

```ts
export interface ApiProductAddon {
  id: number;
  name: string;
  price: number;
  stock_out?: 'Y' | 'N';  // CR-2026-09-07-001
}
```

**After line 221** (inside `ApiProductResponse`, after `add_ons: ApiProductAddon[];`), add two fields:

```ts
  stock_out?: 'Y' | 'N';       // CR-2026-09-07-001
  is_inventory?: 'Yes' | 'No'; // FYI only — FE reads stock_out, not this
```

**After line 199** (inside `ApiRestaurantInfoResponse`, after `success_config`), add:

```ts
  show_out_of_stock_items?: 'Yes' | 'No'; // CR-2026-09-07-001
```

### Boundary
No imports needed. No other file changes. TypeScript-only.

---

## Step 2 — `useMenuData.js`
**Risk:** MEDIUM | **File:** `src/hooks/useMenuData.js` | **Line:** 108

### What and Why
Map `stock_out: 'Y'|'N'` from POS item to the transformed item object.
This is the ROOT cause fix — all downstream consumers (Steps 3–8) depend on this field being present.

**Addon `stock_out` does NOT need explicit mapping** — `add_ons: item.add_ons || []` at line ~74
is a raw passthrough; `addon.stock_out` from POS flows through automatically. Confirmed by probe.

### Exact Change

**After line 108** (the `food_stock` line), insert one line:

```js
            // CR-2026-09-07-001: Stock-out flag. 'Y' = out of stock. Single source of truth.
            stock_out: item.stock_out || 'N',
```

**Resulting block (lines 107–111):**
```js
            // Inventory (downstream CR A-4). Sentinel null = "not enforced".
            food_stock: (item.food_stock === undefined || item.food_stock === null) ? null : Number(item.food_stock),
            // CR-2026-09-07-001: Stock-out flag. 'Y' = out of stock. Single source of truth.
            stock_out: item.stock_out || 'N',
            // Sort order (downstream CR A-5). 0 = unset/tie.
            food_order: Number(item.food_order || 0),
```

### Boundary
Only the item transform is touched. No hook signatures change.
`add_ons` passthrough (line ~74) is NOT changed.

---

## Step 3 — `MenuItems.jsx`
**Risk:** MEDIUM | **File:** `src/pages/MenuItems.jsx` | **Lines:** 394–401

### What and Why
Add a Layer 1 stock-out filter inside `filterItems()` after the existing time-availability filter.
Read `restaurant?.show_out_of_stock_items === 'Yes'` for the config gate.

**Pre-condition:** `restaurant` object is already in scope (line 57). No new imports.

### Exact Change

**After line 394** (closing `});` of the `isItemAvailable` filter), insert:

```js
    // CR-2026-09-07-001: Stock-out filter (Layer 1).
    // Default: hide OOS items. If show_out_of_stock_items='Yes', keep them
    // visible (sold-out state is rendered in MenuItem.jsx).
    const showStockOut = restaurant?.show_out_of_stock_items === 'Yes';
    if (!showStockOut) {
      filtered = filtered.filter(item => item.stock_out !== 'Y');
    }
```

**Resulting filterItems block (conceptual):**
```js
// Filter 1: channel
filtered = filtered.filter(item => isItemAllowedForChannel(...));
// Filter 2: time
filtered = filtered.filter(item => isItemAvailable(...));
// Filter 3: stock-out  ← NEW
const showStockOut = restaurant?.show_out_of_stock_items === 'Yes';
if (!showStockOut) {
  filtered = filtered.filter(item => item.stock_out !== 'Y');
}
// Filter 4: search query (unchanged)
if (searchQuery) { ... }
```

### Boundary
- `showStockOut` is a local const — no state, no hook, no re-render side-effect.
- Does NOT touch the search filter, veg filter, or sort logic.
- `restaurant` object is read-only here. No mutations.
- CR-2026-08-06-001 check: if that CR modified `filterItems()`, confirm its changes are present
  on the same branch before this insert. Both changes are additive filters — no conflict.

---

## Step 4 — `MenuItem.jsx`
**Risk:** MEDIUM | **File:** `src/components/MenuItem/MenuItem.jsx` | **Lines:** 47–53, 149–168, 210–230

### What and Why
Derive `isStockOut` boolean. Update both ADD button render sites to show "Sold Out" badge.
Add "Only N left" low-stock badge. Apply image dimming when OOS.

**Design reference:** CP-1A (no-image) and CP-1B (image) from approved mockup.

### Exact Changes

**A. After line 53** (after `const isChannelAllowed = ...`), insert:

```js
  // CR-2026-09-07-001: Stock-out state (Layer 1 render).
  const isStockOut = item.stock_out === 'Y';
  const isLowStock = !isStockOut && item.food_stock !== null && item.food_stock > 0 && item.food_stock <= 3;
```

> `isLowStock` threshold of ≤3 is a sensible default. Owner can adjust later — no structural change needed.

---

**B. Replace `actionArea` block (lines 149–168)** — no-image layout ADD button:

```jsx
  // CR-2026-09-07-001: Sold Out state replaces ADD when isStockOut.
  const actionArea = (
    <div className="item-action-area">
      {isInCart ? (
        <QuantitySelector
          quantity={quantity}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      ) : isStockOut ? (
        <div className="sold-out-badge" data-testid="menu-item-sold-out-badge">
          Sold Out
        </div>
      ) : isAvailable && isOnlineOrderEnabled ? (
        <button className="add-btn add-btn--inline" onClick={onAddToCart}>
          ADD
        </button>
      ) : null}
      {isLowStock && !isInCart && (
        <div className="low-stock-badge" data-testid="menu-item-low-stock-badge">
          Only {item.food_stock} left
        </div>
      )}
      {isCustomizable && (
        <div className="customisable-indicator customisable-indicator--inline">
          Customisable
        </div>
      )}
    </div>
  );
```

---

**C. Replace image ADD button (lines 212–222)** — image layout:

```jsx
              {isInCart ? (
                <QuantitySelector
                  quantity={quantity}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ) : isStockOut ? (
                <div className="sold-out-badge sold-out-badge--overlay" data-testid="menu-item-sold-out-badge">
                  Sold Out
                </div>
              ) : isAvailable && isOnlineOrderEnabled && isChannelAllowed ? (
                <button className="add-btn" onClick={onAddToCart}>
                  ADD
                </button>
              ) : null}
```

---

**D. Apply image dimming — replace `<img ... className="item-image" ...>` (line ~184):**

```jsx
              <img
                src={item.image}
                alt={item.name}
                className={`item-image${isStockOut ? ' item-image--sold-out' : ''}`}
                loading="lazy"
                decoding="async"
                onError={handleImageError}
              />
```

---

**E. CSS additions to `MenuItem.css`:**

```css
/* CR-2026-09-07-001 — stock-out states */
.sold-out-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #475569;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid #334155;
  user-select: none;
}

.sold-out-badge--overlay {
  position: absolute;
  bottom: 8px;
  right: 8px;
  left: 8px;
  border-radius: 6px;
  padding: 5px 0;
  font-size: 0.65rem;
  background: rgba(71, 85, 105, 0.92);
  border: none;
}

.item-image--sold-out {
  opacity: 0.55;
  filter: grayscale(40%);
}

.low-stock-badge {
  font-size: 0.675rem;
  font-weight: 600;
  color: #D97706;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
```

### Boundary
- `isStockOut` only affects the ADD/QuantitySelector render branch. No impact on `isCustomizable`, `headerBlock`, `metaBlock`, or any other logic.
- `isLowStock` is display-only — does not block ADD.
- Image dimming is additive CSS class — no layout shift.
- `QuantitySelector` render is unchanged (isInCart check is first, unaffected by stock_out).

---

## Step 5 — `CustomizeItemModal.jsx`
**Risk:** MEDIUM | **File:** `src/components/CustomizeItemModal/CustomizeItemModal.jsx` | **Lines:** 261–292

### What and Why
Disable OOS addons in the addon `.map()`. Show "Sold Out" pill inline.
`addon.stock_out` is available via raw passthrough (confirmed by probe — no transform needed).

**Design reference:** CP-2 from approved mockup.

### Exact Change

**Inside the `.map((addon) => { ... })` starting at line 261**, replace the inner return block:

```jsx
                  {item.add_ons.map((addon) => {
                    const quantity = selectedAddons[addon.id] || 0;
                    // CR-2026-09-07-001: addon stock-out disable
                    const isAddonStockOut = addon.stock_out === 'Y';
                    return (
                      <div
                        key={addon.id}
                        className={`customize-addon-item ${quantity > 0 ? 'selected' : ''} ${isAddonStockOut ? 'customize-addon-item--sold-out' : ''}`}
                      >
                        <label className={`customize-addon-checkbox${isAddonStockOut ? ' customize-addon-checkbox--disabled' : ''}`}>
                          <input
                            type="checkbox"
                            checked={quantity > 0}
                            disabled={isAddonStockOut}
                            aria-disabled={isAddonStockOut}
                            onChange={(e) => {
                              if (isAddonStockOut) return;
                              if (e.target.checked) {
                                handleAddonQuantityChange(addon.id, 1);
                              } else {
                                setSelectedAddons((prev) => ({ ...prev, [addon.id]: 0 }));
                              }
                            }}
                          />
                          <span className="customize-addon-name">{addon.name}</span>
                          {isAddonStockOut && (
                            <span className="addon-sold-out-pill" data-testid="customize-addon-sold-out-pill">
                              Sold Out
                            </span>
                          )}
                        </label>
                        <div className="customize-addon-right">
                          <div className="customize-addon-price">
                            ₹{parseFloat(addon.price).toFixed(2)}
                          </div>
                          {quantity > 0 && !isAddonStockOut && (
                            <div className="customize-addon-quantity">
                              <QuantitySelector
                                quantity={quantity}
                                onIncrement={() => handleAddonQuantityChange(addon.id, 1)}
                                onDecrement={() => handleAddonQuantityChange(addon.id, -1)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
```

**CSS additions to `CustomizeItemModal.css`:**

```css
/* CR-2026-09-07-001 — addon sold-out state */
.customize-addon-item--sold-out {
  opacity: 0.55;
  background: #F8FAFC;
  pointer-events: none;
  cursor: not-allowed;
}

.customize-addon-item--sold-out .customize-addon-name {
  text-decoration: line-through;
  color: #94A3B8;
}

.customize-addon-item--sold-out .customize-addon-price {
  color: #94A3B8;
}

.addon-sold-out-pill {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  color: #64748B;
  background: #E2E8F0;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
```

### Boundary
- Footer "Add To Cart" button (line 308–314) is NOT touched. Food item remains orderable.
- `handleAddonQuantityChange` is NOT touched.
- `isRequiredVariationsSelected` logic is NOT touched.
- The QuantitySelector for OOS addons is hidden (guarded by `!isAddonStockOut`) — prevents incrementing a disabled addon.

---

## Step 6 — `CartContext.js`
**Risk:** HIGH | **File:** `src/context/CartContext.js` | **Line:** 226

### What and Why
Layer 2 addToCart guard. Blocks adding an OOS item to cart even if visible (config=Yes).
Defence-in-depth — this fires even if the menu filter or Sold Out badge was bypassed.

### Exact Change

**After line 225** (the `return;` inside the channel guard's `if` block), after the closing `}` at line 226, insert:

```js
    // CR-2026-09-07-001: Stock-out guard (Layer 2).
    // Blocks add even when item is visible (show_out_of_stock_items=Yes config).
    if (item.stock_out === 'Y') {
      toast.error(`"${item?.name || 'This item'}" is currently out of stock.`);
      logger.cart('addToCart blocked by stock-out', { itemId: item?.id, name: item?.name });
      return;
    }
```

**Resulting guard sequence (lines 219–235):**
```js
const addToCart = useCallback((item, variations = [], add_ons = [], activeOrderType = null) => {
  // CR A-1: channel guard (existing)
  if (activeOrderType && !isItemAllowedForChannel(item, activeOrderType)) {
    toast.error(`"${item?.name || 'This item'}" is not available for ${channelLabel} orders.`);
    logger.cart(...);
    return;
  }
  // CR-2026-09-07-001: stock-out guard (new)
  if (item.stock_out === 'Y') {
    toast.error(`"${item?.name || 'This item'}" is currently out of stock.`);
    logger.cart('addToCart blocked by stock-out', { itemId: item?.id, name: item?.name });
    return;
  }
  setCart((prevCart) => { ... });
```

### Boundary
- `setCart()` call (line 227) is NOT touched.
- Cart expiry, cross-tab sync, `cartId` generation, edit-order logic: all unchanged.
- Guard position is BEFORE `setCart()` — no partial cart mutation possible.
- No new imports needed (`toast` and `logger` already imported).

---

## Step 7 — `orderService.ts`
**Risk:** HIGH | **File:** `src/api/services/orderService.ts` | **Lines:** 447–450, 579–582

### What and Why
Detect POS HTTP 422 stock-out response in both `placeOrder` and `updateCustomerOrder` catch blocks.
Throw a typed `StockOutError` so `ReviewOrder.jsx` catch can distinguish it cleanly without
parsing raw Axios error structure.

### Exact Changes

**A. Replace `placeOrder` catch block (lines 447–450):**

```ts
  } catch (error: any) {
    logger.error('order', 'Failed to place order:', error);
    // CR-2026-09-07-001: detect stock-out 422 and throw typed error
    if (
      error?.response?.status === 422 &&
      Array.isArray(error?.response?.data?.out_of_stock_items) &&
      error.response.data.out_of_stock_items.length > 0
    ) {
      const stockOutError: any = new Error('STOCK_OUT');
      stockOutError.isStockOut = true;
      stockOutError.out_of_stock_items = error.response.data.out_of_stock_items;
      throw stockOutError;
    }
    throw error;
  }
```

**B. Replace `updateCustomerOrder` catch block (lines 579–582) — identical pattern:**

```ts
  } catch (error: any) {
    logger.error('order', 'Failed to update customer order:', error);
    // CR-2026-09-07-001: detect stock-out 422 and throw typed error
    if (
      error?.response?.status === 422 &&
      Array.isArray(error?.response?.data?.out_of_stock_items) &&
      error.response.data.out_of_stock_items.length > 0
    ) {
      const stockOutError: any = new Error('STOCK_OUT');
      stockOutError.isStockOut = true;
      stockOutError.out_of_stock_items = error.response.data.out_of_stock_items;
      throw stockOutError;
    }
    throw error;
  }
```

### Boundary
- The `throw error;` on the last line ensures ALL other errors (401, 500, network) still propagate
  unchanged to `ReviewOrder.jsx`'s existing catch branches.
- Return type `Promise<ApiPlaceOrderResponse>` is unchanged (stock-out is a thrown error, not a return).
- Global 401 interceptor on `apiClient` fires BEFORE `catch` in the service — unaffected.
- No new imports needed.

---

## Step 8 — `ReviewOrder.jsx`
**Risk:** CRITICAL | **File:** `src/pages/ReviewOrder.jsx`

**TWO insertion points. Read each scope boundary carefully.**

---

### 8A — Pre-submission stock check (Layer 3 early return)
**Location:** After phone validation return (line 984), before double-click guard (line 986)

#### What and Why
Read React Query cache for `menuSections`. For each cart item, check `stock_out` and `food_stock`.
If problems found, show combined toast and `return` BEFORE `isPlacingOrderRef.current = true`.
This keeps the double-click ref clean — no manual reset needed.

**Pre-conditions confirmed:**
- `queryClient` is in scope (line 130: `const queryClient = useQueryClient()`)
- Query key is `['menuSections', restaurantId, stationId]` (confirmed line 1261)
- `cartItems` is in scope (line 154)
- `stationId` is in scope

#### Exact Change

**After line 984** (closing `}` of phone validation block), insert:

```js
    // CR-2026-09-07-001: Layer 3 pre-submission cache-check.
    // Reads React Query cache — no API call. Layer 3 API (422) is the backstop for cache misses.
    {
      const cachedMenu = queryClient.getQueryData(['menuSections', restaurantId, stationId]) || [];
      const stockProblems = [];
      for (const cartItem of cartItems) {
        const foodId = String(cartItem.itemId);
        let cachedItem = null;
        outer: for (const section of cachedMenu) {
          for (const it of (section.items || [])) {
            if (String(it.id) === foodId) { cachedItem = it; break outer; }
          }
        }
        if (!cachedItem) continue; // cache miss — Layer 3 (422) backstop handles it
        if (cachedItem.stock_out === 'Y') {
          stockProblems.push({ type: 'oos', name: cartItem.item?.name || 'Item' });
        } else if (
          cachedItem.food_stock !== null &&
          cachedItem.food_stock > 0 &&
          cartItem.quantity > cachedItem.food_stock
        ) {
          stockProblems.push({
            type: 'low',
            name: cartItem.item?.name || 'Item',
            available: cachedItem.food_stock,
            inCart: cartItem.quantity,
          });
        }
      }
      if (stockProblems.length > 0) {
        const parts = stockProblems.map(p =>
          p.type === 'oos'
            ? `${p.name} is sold out`
            : `Only ${p.available} ${p.name} available (you have ${p.inCart})`
        );
        const msg = stockProblems.length === 1
          ? (stockProblems[0].type === 'oos'
              ? `"${stockProblems[0].name}" is sold out. Please remove it from your cart to continue.`
              : `Only ${stockProblems[0].available} "${stockProblems[0].name}" available. You have ${stockProblems[0].inCart} in your cart.`)
          : `Some items need attention: ${parts.join(' · ')}`;
        toast.error(msg, { duration: 6000 });
        return;
      }
    }
```

#### Scope boundary — 8A
- Returns BEFORE `isPlacingOrderRef.current = true` (line 992) — ref never set, no reset needed.
- Does NOT call `clearCart()`.
- Does NOT call `setIsPlacingOrder(true)`.
- Does NOT call `navigate()`.
- Does NOT touch the try/catch block below.
- `queryClient.getQueryData` is read-only — no cache mutation.
- Wrapped in `{ }` block scope — `cachedMenu`, `stockProblems` are block-local, no variable leakage.

---

### 8B — Stock-out catch branch (Layer 3 backstop)
**Location:** After line 1570 (`}` closing the `catch (retryError)` block), before line 1571 (`} else {` generic branch)

#### What and Why
When `placeOrder`/`updateCustomerOrder` throws a typed `StockOutError` (from Step 7),
intercept it here. Show combined item-name toast. Do NOT navigate to success. Do NOT clearCart.
This is the backstop for cache-miss cases not caught by 8A.

#### Exact Change

**After line 1570** (closing `}` of `catch (retryError)` block), replace `} else {` with:

```js
      } else if (error.isStockOut) {
        // CR-2026-09-07-001: Stock-out hard stop (Layer 3 backstop).
        // Fires when pre-submission cache-check missed a stale/absent item.
        // Do NOT navigate. Do NOT clearCart. Cart preserved so user can edit.
        const items = error.out_of_stock_items || [];
        const parts = items.map((i) =>
          i.type === 'addon'
            ? `${i.addon_name} (addon for ${i.food_name})`
            : i.food_name
        );
        const msg = items.length === 1
          ? (items[0].type === 'addon'
              ? `"${items[0].addon_name}" (addon for "${items[0].food_name}") is out of stock. Please update your cart.`
              : `"${items[0].food_name}" is out of stock. Please remove it from your cart.`)
          : `Some items are out of stock: ${parts.join(', ')}. Please update your cart.`;
        toast.error(msg, { duration: 6000 });
      } else {
```

**Resulting catch branch order:**
```
if (isTrueNetworkLoss)          → network-loss warning (line 1424 — UNCHANGED)
else if (status === 401)        → auth retry (line 1430 — UNCHANGED)
  try { ... }
  catch (retryError) { ... }    → session expired toast (line 1567 — UNCHANGED)
else if (error.isStockOut)      → stock-out hard stop (NEW — line ~1571)
else                            → generic branch (line ~1575 — UNCHANGED)
```

#### Scope boundary — 8B
- `isTrueNetworkLoss` evaluated first — unchanged, unaffected.
- `status === 401` branch evaluated second — unchanged, unaffected.
- Stock-out branch can only fire if `error.isStockOut === true` (set only in Step 7).
- Generic `else` branch (line 1571+) remains intact and reachable for all other errors.
- `response?.order_id` recovery in generic branch (line 1580) — unreachable from stock-out path.
- 716 hardcoded logic lives in the try block (lines 1375, 1444, 1549) — before catch, unaffected.
- Razorpay path lives in try block (lines 1051–1070) — before catch, unaffected.
- `finally` block (line 1599) runs regardless — `isPlacingOrderRef`, `orderDispatchedRef`,
  `setIsPlacingOrder` all reset correctly.
- `clearCart()` NOT called in stock-out branch — deliberate per owner decision D-IA-3.

---

## Pre-Implementation Checklist

Before writing a single line of code, verify:

- [ ] Step 2 confirmed: `stock_out` not yet present in useMenuData.js item transform
- [ ] Step 6 confirmed: no stock_out guard in CartContext.js addToCart
- [ ] Step 7 confirmed: no 422 check in orderService.ts catch blocks
- [ ] Step 8A confirmed: `queryClient` is in scope at line 130 of ReviewOrder.jsx
- [ ] Step 8A confirmed: query key `['menuSections', restaurantId, stationId]` still matches line 1261
- [ ] Step 8B confirmed: `} else if (error.isStockOut)` does NOT already exist (no duplicate)
- [ ] CR-2026-08-06-001 status: verify filterItems() is on a stable branch before adding Step 3

---

## Post-Implementation Verification

Run against Verification Matrix from Impact Analysis (V-1 to V-21).

Critical regression tests (must pass before declaring done):
- V-11: network loss warning still fires
- V-12: 401 retry still fires
- V-13: successful order still navigates to OrderSuccess
- V-14: restaurant 716 flow unaffected
- V-20: cart retained after stock-out hard stop

---

## Planning Output

```
Planning complete: CR-2026-09-07-001
Stage: Implementation Plan
Status: READY FOR OWNER APPROVAL

8 files, 8 ordered steps, exact line numbers, exact code blocks.
Design: approved (/app/frontend/public/stockout-mockup.html)
Risk: HIGH — ReviewOrder.jsx CRITICAL, CartContext.js HIGH

Docs:
  /app/memory/change_requests/CR-2026-09-07-001-inventory-stock-out-control/IMPLEMENTATION_PLAN.md

Next: Owner approves this plan → Implementation gate opens
      No code until owner says "approved, implement"
```
