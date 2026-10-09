# IMPLEMENTATION PLAN — CR-2026-09-15-001
## Profile page → CRM v2 adapter: orders / points / wallet

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Gate:** Gate 2 accepted  
**Risk:** HIGH  
**Files changing:** `frontend/src/api/services/crmService.js` · `frontend/src/pages/Profile.jsx`  
**Files NOT touched:** `AuthContext.jsx` · `RestaurantConfigContext.jsx` · `backend/server.py` · `ReviewOrder.jsx` · `LandingPage.jsx` · `CartContext.js`

---

## Decisions locked

| D | Decision |
|---|---|
| D4 | Show "Showing N of M orders" using `total` from v2 response — **YES** |
| D_bonus | `bonus` transaction label — **distinct**: `earn` → "Earned", `bonus` → "Bonus reward", `redeem` → "Redeemed", `expired` → "Expired" |
| D_wallet | Wallet `transaction_type` unconfirmed (empty probe) — keep `credit` for positive, all else debit; log unknown types |

---

## Edits — exact and ordered

### E1 · `crmService.js` lines 395–401 — `crmGetOrders` v2 branch

**Before:**
```javascript
/**
 * Get customer order history
 * Returns: { total_orders, orders: [...] }
 */
export const crmGetOrders = async (token, limit = 50, skip = 0) => {
  return crmAuthFetch(`/customer/me/orders?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
};
```

**After:**
```javascript
/**
 * Get customer order history
 * v1: GET /customer/me/orders  v2: GET /scan/orders (skip not supported in v2)
 * Returns: { orders: [...], total: N }
 */
export const crmGetOrders = async (token, limit = 50, skip = 0) => {
  // CR-2026-09-15-001: v1 path → 404 on CRM v2
  if (isV2()) {
    return crmAuthFetch(`/scan/orders?limit=${limit}`, token, { method: 'GET' });
  }
  return crmAuthFetch(`/customer/me/orders?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
};
```

---

### E2 · `crmService.js` lines 415–421 — `crmGetPoints` v2 branch

**Before:**
```javascript
/**
 * Get customer points balance + transaction history
 * Returns: { total_points, points_value, tier, expiring_soon, transactions: [...] }
 */
export const crmGetPoints = async (token, limit = 50) => {
  return crmAuthFetch(`/customer/me/points?limit=${limit}`, token, { method: 'GET' });
};
```

**After:**
```javascript
/**
 * Get customer points balance + transaction history
 * v1: GET /customer/me/points
 * v2: GET /scan/loyalty (balance/tier) + GET /scan/points/history (ledger) — parallel
 * Returns: { total_points, tier, transactions: [...] }
 */
export const crmGetPoints = async (token, limit = 50) => {
  // CR-2026-09-15-001: v1 path → 404; v2 splits balance and history across two endpoints
  if (isV2()) {
    const [loyalty, history] = await Promise.all([
      crmAuthFetch('/scan/loyalty', token, { method: 'GET' }),
      crmAuthFetch(`/scan/points/history?limit=${limit}`, token, { method: 'GET' }),
    ]);
    return {
      total_points: loyalty?.total_points ?? 0,
      tier: loyalty?.tier ?? 'Bronze',
      transactions: history?.transactions ?? [],
    };
  }
  return crmAuthFetch(`/customer/me/points?limit=${limit}`, token, { method: 'GET' });
};
```

---

### E3 · `crmService.js` lines 423–429 — `crmGetWallet` v2 branch

**Before:**
```javascript
/**
 * Get customer wallet balance + transaction history
 * Returns: { wallet_balance, total_received, total_used, transactions: [...] }
 */
export const crmGetWallet = async (token, limit = 50) => {
  return crmAuthFetch(`/customer/me/wallet?limit=${limit}`, token, { method: 'GET' });
};
```

**After:**
```javascript
/**
 * Get customer wallet balance + transaction history
 * v1: GET /customer/me/wallet
 * v2: GET /scan/loyalty (wallet_balance) + GET /scan/wallet/history (ledger) — parallel
 * Returns: { wallet_balance, transactions: [...] }
 */
export const crmGetWallet = async (token, limit = 50) => {
  // CR-2026-09-15-001: v1 path → 404; v2 splits balance and history across two endpoints
  if (isV2()) {
    const [loyalty, history] = await Promise.all([
      crmAuthFetch('/scan/loyalty', token, { method: 'GET' }),
      crmAuthFetch(`/scan/wallet/history?limit=${limit}`, token, { method: 'GET' }),
    ]);
    return {
      wallet_balance: loyalty?.wallet_balance ?? 0,
      transactions: history?.transactions ?? [],
    };
  }
  return crmAuthFetch(`/customer/me/wallet?limit=${limit}`, token, { method: 'GET' });
};
```

---

### E4 · `Profile.jsx` line 3 — add `useRestaurantConfig` import

**Before:**
```javascript
import { useAuth } from '../context/AuthContext';
```

**After:**
```javascript
import { useAuth } from '../context/AuthContext';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
```

---

### E5 · `Profile.jsx` line 13 — add `showWallet` destructure

**Before:**
```javascript
  const { user, token, isCustomer, isRestaurant, logout } = useAuth();
```

**After:**
```javascript
  const { user, token, isCustomer, isRestaurant, logout } = useAuth();
  // CR-2026-09-15-001: wallet tab visibility gate (G5)
  const { showWallet } = useRestaurantConfig();
```

---

### E6 · `Profile.jsx` — add `ordersTotal` state (D4)

Add after the existing state declarations (after line 22 `const [loading, setLoading] = useState(false);`):

```javascript
  // CR-2026-09-15-001 D4: total order count from v2 response
  const [ordersTotal, setOrdersTotal] = useState(0);
```

---

### E7 · `Profile.jsx` lines 53–63 — update `fetchOrders` (D4 + comment)

**Before:**
```javascript
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await crmGetOrders(token);
      // CRM returns { total_orders, orders: [...] }
      setOrders(data.orders || []);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };
```

**After:**
```javascript
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await crmGetOrders(token);
      // CR-2026-09-15-001: CRM v2 returns { orders: [...], total: N }
      setOrders(data.orders || []);
      setOrdersTotal(data.total || 0);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };
```

---

### E8 · `Profile.jsx` — add `isPointsCredit`, `POINTS_TYPE_LABELS`, `ORDER_TYPE_LABELS` helpers

Add after `getTierColor` (after line 118 closing brace) and before `if (!user || !isCustomer)` (line 120):

```javascript
  // CR-2026-09-15-001 G2: points credit/debit classification
  const isPointsCredit = (type) => ['earn', 'bonus'].includes(type);
  const POINTS_TYPE_LABELS = {
    earn: 'Earned', bonus: 'Bonus reward', redeem: 'Redeemed', expired: 'Expired',
  };

  // CR-2026-09-15-001 G4: raw CRM order_type → display label
  const ORDER_TYPE_LABELS = {
    dinein: 'Dine-in', dine_in: 'Dine-in',
    takeaway: 'Takeaway', take_away: 'Takeaway',
    delivery: 'Delivery',
    walkin: 'In-store', WalkIn: 'In-store', in_store: 'In-store', pos: 'In-store',
  };
```

---

### E9 · `Profile.jsx` line 247 — `order_type` display label (G4)

**Before:**
```javascript
                    <span className="order-type">{order.order_type || 'Order'}</span>
```

**After:**
```javascript
                    <span className="order-type">
                      {ORDER_TYPE_LABELS[order.order_type] || order.order_type || 'Order'}
                    </span>
```

---

### E10 · `Profile.jsx` — add "Showing N of M" on Orders tab (D4)

Add after the `orders.length === 0` empty-state block, inside the `orders.map(...)` branch. Specifically, wrap the `orders.map(...)` in a fragment with a count line above it:

Find this line:
```javascript
              orders.map((order) => (
```

Add a count header immediately before the map, inside the same `else` branch. After the `orders.length === 0` ternary `else`:

```javascript
            ) : (
              <>
                {ordersTotal > orders.length && (
                  <div className="orders-count">
                    {/* CR-2026-09-15-001 D4 */}
                    Showing {orders.length} of {ordersTotal} orders
                  </div>
                )}
                {orders.map((order) => (
                  ... existing order card JSX ...
                ))}
              </>
```

> **Implementation note:** wrap the existing `orders.map(...)` call inside a `<>...</>` fragment with the count div above it. The count only shows when `ordersTotal > orders.length` (i.e. server has more than we fetched).

---

### E11 · `Profile.jsx` lines 280 + 288–289 — points sign fix (G2)

**Before (line 280):**
```javascript
                    {tx.transaction_type === 'earn' ? '+' : '-'}
```

**After:**
```javascript
                    {isPointsCredit(tx.transaction_type) ? '+' : '-'}
```

**Before (lines 288–289):**
```javascript
                  <div className={`tx-amount ${tx.transaction_type === 'earn' ? 'positive' : 'negative'}`}>
                    {tx.transaction_type === 'earn' ? '+' : '-'}{tx.points} pts
```

**After:**
```javascript
                  <div className={`tx-amount ${isPointsCredit(tx.transaction_type) ? 'positive' : 'negative'}`}>
                    {isPointsCredit(tx.transaction_type) ? '+' : '-'}{tx.points} pts
```

---

### E12 · `Profile.jsx` — wallet tab button gate (G5)

**Before:**
```javascript
        <button 
          className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
          onClick={() => setActiveTab('wallet')}
        >
          <IoWalletOutline /> Wallet
        </button>
```

**After:**
```javascript
        {/* CR-2026-09-15-001 G5: wallet tab shown only when config enables it */}
        {showWallet && (
          <button 
            className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet')}
          >
            <IoWalletOutline /> Wallet
          </button>
        )}
```

---

### E13 · `Profile.jsx` — wallet tab content gate (G5)

**Before:**
```javascript
        {activeTab === 'wallet' && (
```

**After:**
```javascript
        {activeTab === 'wallet' && showWallet && (
```

---

## Edit summary

| ID | File | What |
|---|---|---|
| E1 | `crmService.js` | `crmGetOrders` — add `isV2()` branch → `/scan/orders` |
| E2 | `crmService.js` | `crmGetPoints` — add `isV2()` branch → parallel `/scan/loyalty` + `/scan/points/history` |
| E3 | `crmService.js` | `crmGetWallet` — add `isV2()` branch → parallel `/scan/loyalty` + `/scan/wallet/history` |
| E4 | `Profile.jsx` | Add `useRestaurantConfig` import |
| E5 | `Profile.jsx` | Add `showWallet` destructure from context |
| E6 | `Profile.jsx` | Add `ordersTotal` state (D4) |
| E7 | `Profile.jsx` | Update `fetchOrders` — set `ordersTotal`, fix comment |
| E8 | `Profile.jsx` | Add `isPointsCredit`, `POINTS_TYPE_LABELS`, `ORDER_TYPE_LABELS` helpers |
| E9 | `Profile.jsx` | `order_type` display label (G4) |
| E10 | `Profile.jsx` | "Showing N of M orders" count (D4) |
| E11 | `Profile.jsx` | Points sign fix — 3 occurrences (G2) |
| E12 | `Profile.jsx` | Wallet tab button gate (G5) |
| E13 | `Profile.jsx` | Wallet tab content gate (G5) |

**Net: ~55 lines added / ~10 lines changed across 2 files.**

---

## Self-test checklist (Role 3 must run before QA handover)

| ST | Test | How | Expected |
|---|---|---|---|
| ST1 | `yarn build` | `cd /app/frontend && yarn build` | Clean — 0 new errors |
| ST2 | Orders tab loads | Browser, restaurant 689, signed-in | List renders, order_type shows "Dine-in", points shown, no toast |
| ST3 | Points tab loads | Browser | Transactions render, bonus shows `+`, expired shows `−`, no toast |
| ST4 | Wallet tab gate | Restaurant 689 (showWallet=false) | Wallet button hidden |
| ST5 | `grep "customer/me/orders\|customer/me/points\|customer/me/wallet" crmService.js` | bash | v1 paths present inside `else` branches (preserved) |
| ST6 | Empty orders (OD-5) | Customer with 0 orders | "No orders yet" — no toast |

---

## Code markers

Every changed block must carry:
```javascript
// CR-2026-09-15-001: <brief reason>
```

---

## QA test cases

| T | Scenario | Expected |
|---|---|---|
| T1 | Orders tab — signed-in, restaurant 689 | Orders list, "Dine-in" label, points, items shown |
| T2 | Points tab — signed-in, restaurant 689 | Transactions list; `bonus` → `+`; `expired` → `−`; descriptions visible |
| T3 | Wallet tab — restaurant 689 (`showWallet=false`) | Tab button hidden; content not rendered |
| T4 | No orders (OD-5) | "No orders yet" empty state, no error toast |
| T5 | Header card (name, tier, points, wallet balance in stats row) | Unchanged — still from `/scan/auth/me` |
| T6 | `yarn build` | Clean |
| T7 | v1 paths preserved in crmService.js | `grep "customer/me"` shows them inside `else` branches |

---

```
Planning complete: CR-2026-09-15-001
Stage: Implementation Plan
Code reality: FULL — exact before/after for all 13 edits
Risk: HIGH
Files WILL change: crmService.js (E1–E3) · Profile.jsx (E4–E13)
Files WILL NOT touch: AuthContext.jsx · RestaurantConfigContext.jsx · backend/server.py · ReviewOrder.jsx · LandingPage.jsx
Decisions: D4=yes (order count) · D_bonus=distinct label · D_wallet=credit/debit fallback
Docs: memory/change_requests/CR-2026-09-15-001-profile-crm-v2-adapter/IMPLEMENTATION_PLAN.md
Next: "Gate 3 accepted for CR-2026-09-15-001" → Role 3 Implementation
```
