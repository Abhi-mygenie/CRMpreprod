# IMPACT ANALYSIS — CR-2026-09-15-001
## Profile page → CRM v2 adapter: orders / points / wallet

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Based on:** INTAKE_DOC.md · live CRM endpoint probes (this session) · Profile.jsx full read · crmService.js lines 395–429

---

## 1. What is broken today and why

The three Profile tab data-fetch functions in `crmService.js` call v1 paths that **do not exist on CRM v2**:

| Function | Current path | HTTP result |
|---|---|---|
| `crmGetOrders` | `GET /customer/me/orders?limit=N&skip=N` | **404** |
| `crmGetPoints` | `GET /customer/me/points?limit=N` | **404** |
| `crmGetWallet` | `GET /customer/me/wallet?limit=N` | **404** |

Profile.jsx catches the 404 errors and shows `toast.error("Failed to load ...")` + empty tabs. Header card (`/scan/auth/me`) is already on v2 and working — the fix is scoped to these three functions only.

---

## 2. Live endpoint probes — response shapes confirmed (2026-10-08)

### 2a. `GET /scan/orders?limit=N` → HTTP 200

```json
{
  "data": {
    "orders": [
      {
        "id": "c7224279-...",
        "order_amount": 367.0,
        "order_type": "dinein",
        "order_status": "delivered",
        "points_earned": 18,
        "order_created_at": "2026-08-04T10:14:20+05:30",
        "created_at": "2026-08-04T04:44:35+00:00",
        "items": [
          { "item_name": "50-50 Ras Royal", "item_price": 50.0, ... }
        ]
      }
    ],
    "total": 1
  }
}
```

Profile.jsx field reads vs live shape:

| Profile.jsx reads | Field in v2 response | Match? |
|---|---|---|
| `data.orders` | `data.orders` (array) | ✅ |
| `order.id` | `order.id` | ✅ |
| `order.order_amount` | `order.order_amount` | ✅ |
| `order.order_type` | `order.order_type` — raw value e.g. `"dinein"` | ⚠️ **needs label mapping (G4)** |
| `order.points_earned` | `order.points_earned` | ✅ |
| `order.created_at` | `order.created_at` (UTC ISO) | ✅ |
| `item.item_name` | `item.item_name` | ✅ |

Note: `crmFetch` already unwraps the `{ success, message, data }` envelope (lines 149–153 of crmService.js), so the function returns `{ orders, total }` directly.

### 2b. `GET /scan/loyalty` → HTTP 200

```json
{
  "data": {
    "total_points": 0,
    "points_monetary_value": 0.0,
    "tier": "Bronze",
    "wallet_balance": 0.0,
    "earn_rate_percent": 5.0,
    "redemption_value_per_point": 1.0,
    "next_tier": "Silver",
    "points_to_next_tier": 500
  }
}
```

Used by both `crmGetPoints` (for balance context) and `crmGetWallet` (for `wallet_balance`).

### 2c. `GET /scan/points/history?limit=N` → HTTP 200

```json
{
  "data": {
    "transactions": [
      { "id": "...", "points": 68, "transaction_type": "expired", "description": "Points expired...", "balance_after": 0, "created_at": "..." },
      { "id": "...", "points": 50, "transaction_type": "bonus",   "description": "First visit bonus...", "balance_after": 50, "created_at": "..." },
      { "id": "...", "points": 18, "transaction_type": "earn",    "description": "Earned on order...", "balance_after": 68, "created_at": "..." }
    ],
    "total": 3
  }
}
```

**Live `transaction_type` values seen:** `earn`, `bonus`, `expired`
**From intake (INTAKE §2 G2):** also `redeem`
**Sign rule:** `earn`, `bonus` → **positive (+)**; `redeem`, `expired` → **negative (−)**

**Profile.jsx sign logic today (line 280):**
```javascript
{tx.transaction_type === 'earn' ? '+' : '-'}
```
This shows `bonus` as `−` — **WRONG**. Must fix.

### 2d. `GET /scan/wallet/history?limit=N` → HTTP 200

```json
{ "data": { "transactions": [], "total": 0 } }
```

Empty for this test customer. Profile.jsx already uses `transaction_type === 'credit'` for wallet sign (line 318) — consistent with CRM convention. **No code change needed for wallet sign logic** (confirmed pattern from loyalty history).

---

## 3. Changes needed — full picture

### 3a. `crmService.js` — 3 function updates (add `isV2()` branches)

#### `crmGetOrders` (line 399)

**Before:**
```javascript
export const crmGetOrders = async (token, limit = 50, skip = 0) => {
  return crmAuthFetch(`/customer/me/orders?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
};
```

**After:**
```javascript
export const crmGetOrders = async (token, limit = 50, skip = 0) => {
  // CR-2026-09-15-001: v1 path → 404; v2 uses /scan/orders (skip not supported in v2)
  if (isV2()) {
    return crmAuthFetch(`/scan/orders?limit=${limit}`, token, { method: 'GET' });
  }
  return crmAuthFetch(`/customer/me/orders?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
};
```

#### `crmGetPoints` (line 419)

New v2 path is **two calls**: loyalty summary (balance/tier) + points history (transactions).
Profile.jsx reads only `data.transactions` from this function's return value (line 72).
Compose the return to match what Profile.jsx expects:

**After:**
```javascript
export const crmGetPoints = async (token, limit = 50) => {
  // CR-2026-09-15-001: v1 path → 404; v2 = /scan/loyalty (summary) + /scan/points/history
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

#### `crmGetWallet` (line 427)

Same pattern: loyalty summary (for `wallet_balance`) + wallet history (transactions).

**After:**
```javascript
export const crmGetWallet = async (token, limit = 50) => {
  // CR-2026-09-15-001: v1 path → 404; v2 = /scan/loyalty (balance) + /scan/wallet/history
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

Note: `GET /scan/loyalty` is called twice (once for points, once for wallet) if both tabs are loaded. They are independent fetches triggered by tab switch — no simultaneous double-call concern. If owner wants to optimise, a shared cache could be added later; it is OUT of scope here.

---

### 3b. `Profile.jsx` — 3 targeted fixes

#### Fix 1 — Points sign mapping (G2, lines 280 + 288–289)

**Before:**
```javascript
{tx.transaction_type === 'earn' ? '+' : '-'}
// and
className={`tx-amount ${tx.transaction_type === 'earn' ? 'positive' : 'negative'}`}
{tx.transaction_type === 'earn' ? '+' : '-'}{tx.points} pts
```

**After:**
```javascript
// CR-2026-09-15-001: earn + bonus = credit; redeem + expired = debit
const isPointsCredit = (type) => ['earn', 'bonus'].includes(type);
// then use:
{isPointsCredit(tx.transaction_type) ? '+' : '-'}
className={`tx-amount ${isPointsCredit(tx.transaction_type) ? 'positive' : 'negative'}`}
{isPointsCredit(tx.transaction_type) ? '+' : '-'}{tx.points} pts
```

`isPointsCredit` is a local helper inside the component — not a shared utility.

#### Fix 2 — `order_type` label mapping (G4, line 247)

**Before:**
```javascript
<span className="order-type">{order.order_type || 'Order'}</span>
```

**After:**
```javascript
// CR-2026-09-15-001: normalise raw CRM order_type to display label
const ORDER_TYPE_LABELS = {
  dinein: 'Dine-in', dine_in: 'Dine-in',
  takeaway: 'Takeaway', take_away: 'Takeaway',
  delivery: 'Delivery',
  walkin: 'In-store', WalkIn: 'In-store', in_store: 'In-store', pos: 'In-store',
};
// then:
<span className="order-type">
  {ORDER_TYPE_LABELS[order.order_type] || order.order_type || 'Order'}
</span>
```

`ORDER_TYPE_LABELS` is a local constant inside the component.

#### Fix 3 — Wallet tab visibility gate (G5)

The wallet tab is currently always shown (all 4 tabs hardcoded in JSX). `RestaurantConfigContext` exposes `showWallet` (via `isOn('showWallet')`).

**Before:**
```jsx
<button className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
  onClick={() => setActiveTab('wallet')}>
  <IoWalletOutline /> Wallet
</button>
```
and the corresponding tab content block.

**After:**
```jsx
// Import showWallet from context — add to useRestaurantConfig() destructure
{showWallet && (
  <button ...>Wallet</button>
)}
// and gate the wallet content panel:
{activeTab === 'wallet' && showWallet && ( ... )}
```

Also: if `activeTab === 'wallet'` but `showWallet` becomes false (config change), the tab should fall back to 'profile'. Add a guard in the URL-tab effect.

**Requires:** add `useRestaurantConfig` import + `showWallet` destructure to `Profile.jsx`.

---

## 4. Files WILL change

| File | What changes |
|---|---|
| `frontend/src/api/services/crmService.js` | `crmGetOrders`, `crmGetPoints`, `crmGetWallet` — add `isV2()` branches (3 functions, ~20 lines each) |
| `frontend/src/pages/Profile.jsx` | Sign mapping (G2), `order_type` labels (G4), wallet tab gate (G5), `useRestaurantConfig` import |

---

## 5. Files WILL NOT touch

| File | Why |
|---|---|
| `AuthContext.jsx` | Header card data (`user.tier`, `user.total_points`) comes from `/scan/auth/me` — already v2, unchanged |
| `RestaurantConfigContext.jsx` | Read `showWallet` from it; do not modify |
| `backend/server.py` | Backend profile routes (e.g. `/api/customer/profile`) are out of scope — separate CR |
| `ReviewOrder.jsx` | Not touched |
| `LandingPage.jsx` | Not touched |
| `CartContext.js` | Not touched |

---

## 6. Owner decisions — confirm before Gate 3

| D | Question | Recommendation |
|---|---|---|
| D4 | Show "Showing N of total" count on Orders tab using `total` from v2 response? | Yes — simple 1-line addition; useful for diners with many orders |
| D_bonus | `bonus` points transaction label: show "Earned" (same as `earn`) or a distinct "Bonus reward" label? | Distinct label — `earn` → "Earned", `bonus` → "Bonus reward"; the description field already has good text |
| D_wallet | Wallet transaction `transaction_type` values unconfirmed (empty history in probe). Proceed assuming `credit`/`debit` (current code) and add a fallback? | Yes — keep `credit` for positive, treat anything else as debit; log unknown types in dev |

---

## 7. Risk assessment

| Area | Rating | Reason |
|---|---|---|
| Overall | **HIGH** | CRM API contract change on customer-data path |
| `crmService.js` | MEDIUM | Isolated function changes; `isV2()` pattern already established; v1 branches preserved |
| `Profile.jsx` sign mapping | MEDIUM | Two `===` comparisons changed; small blast radius (points tab only) |
| `Profile.jsx` order_type labels | LOW | Display-only; fallback preserves raw value |
| `Profile.jsx` wallet gate | MEDIUM | Requires new context import; tab fallback logic needed |
| `AuthContext.jsx` | ✅ NOT TOUCHED | No risk |

No Fast Lane. No CRITICAL-level changes (no auth tokens, no payments, no shared DB write).

---

## 8. Verification matrix

| T | Scenario | Expected |
|---|---|---|
| T1 | Signed-in diner, restaurant 689, open Orders tab | Orders list renders; `order_type` shows "Dine-in" not "dinein"; `points_earned` shows; no error toast |
| T2 | Same diner, open Points tab | Transaction list renders; `bonus` entries show `+` not `−`; `expired` entries show `−`; no error toast |
| T3 | Same diner, open Wallet tab | Balance from `/scan/loyalty.wallet_balance`; empty-state "No wallet transactions yet" (0 transactions for test customer); no error toast |
| T4 | Restaurant with `showWallet=false` (689 today) | Wallet tab button hidden; wallet content not rendered |
| T5 | Diner with no linked orders (OD-5) | "No orders yet" empty state; no error toast |
| T6 | Header card (name, tier, points, wallet balance) | Unchanged — still sourced from `/scan/auth/me` |
| T7 | `yarn build` | Clean — no new ESLint errors |
| T8 | `grep "customer/me/orders\|customer/me/points\|customer/me/wallet" frontend/src/api/services/crmService.js` | v1 paths still present inside `else` branches (v1 preserved) |

---

## 9. Planning output

```
Planning complete: CR-2026-09-15-001
Stage: Impact Analysis
Code reality: FULL — live endpoint probes captured all 4 response shapes
Risk: HIGH
Files WILL change: crmService.js (3 functions) · Profile.jsx (3 fixes + context import)
Files WILL NOT touch: AuthContext.jsx · RestaurantConfigContext.jsx · backend/server.py ·
                       ReviewOrder.jsx · LandingPage.jsx · CartContext.js
Owner decisions:
  D4 = confirm "Showing N of total" on Orders tab
  D_bonus = label for bonus transactions
  D_wallet = fallback for unconfirmed wallet transaction_type values
Docs: memory/change_requests/CR-2026-09-15-001-profile-crm-v2-adapter/IMPACT_ANALYSIS.md
Next: confirm D4 / D_bonus / D_wallet → "Gate 2 accepted for CR-2026-09-15-001" → Implementation Plan
```
