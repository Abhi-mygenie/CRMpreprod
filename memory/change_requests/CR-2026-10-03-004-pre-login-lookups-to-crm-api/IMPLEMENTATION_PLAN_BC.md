# IMPLEMENTATION PLAN — CR-2026-10-03-004 Parts B+C
## `loyalty-settings` → CRM `loyalty-rules` swap + G1–G4 gap fixes + `customer-lookup` retirement

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-09  
**Gate:** D1 = Option A (add `loyaltySettings?.loyalty_enabled !== false` to showLoyalty)  
**Risk:** CRITICAL  
**Files changing:** `crmService.js` · `ReviewOrder.jsx` · `LoyaltyRewardsSection.jsx` · `server.py` · `test_cr_2026_10_03_001.py` · `contracts/test_public_config.py`  
**Files NOT touched:** `AuthContext.jsx` · `CartContext.js` · `App.js` · `LandingPage.jsx` · `RestaurantConfigContext.jsx`

---

## Decisions locked

| D | Decision |
|---|---|
| D1 (G2) | **POS flag only** (owner, 2026-10-09). `showLoyalty` stays as-is — `restaurant.is_loyalty === 'Yes'` is the sole gate. CRM `loyalty_enabled` fetched but not used for gating. **E4 dropped.** |
| F2 (Part C) | Owner confirmed: no CRM token → no points/tier block. No toast, no retry. |

---

## Pre-flight checks (Role 3 must run before first edit)

```bash
# 1. Confirm server.py md5 baseline
md5sum /app/backend/server.py

# 2. Confirm touch point anchors
grep -n "loyalty-settings\|loyalty_settings\|customer-lookup\|customer_lookup" /app/backend/server.py
# Expected: lines 971, 975, 1006, 1018

# 3. Confirm ReviewOrder line anchors
grep -n "loyalty-settings\|redemption_value\|customer-lookup\|handleUsePoints" /app/frontend/src/pages/ReviewOrder.jsx
# Expected: 145, 418, 489-498 (showLoyalty), 861, 867, 1874, 859 (handleUsePoints def)

# 4. Confirm LoyaltyRewardsSection anchors
grep -n "redemption_value" /app/frontend/src/components/LoyaltyRewardsSection/LoyaltyRewardsSection.jsx
# Expected: lines 34 and 91

# 5. Boundary grep baseline
grep -c "db\.loyalty_settings\|db\.customers" /app/backend/server.py
# Expected: 2
```

---

## Edits — exact and ordered (apply bottom-up within each file)

---

### E1 · `crmService.js` — add `crmGetLoyaltyRules` after `crmLookupCustomer` (after line 338)

Insert after the closing `};` of `crmLookupCustomer`:

```javascript
/**
 * CR-2026-10-03-004 Part B: Per-restaurant loyalty rules via CRM (replaces GET /api/loyalty-settings).
 *
 * v2 path: GET /scan/loyalty-rules/{rid}  (public endpoint, no auth required)
 * crmFetch unwraps {success, message, data} envelope → caller receives data directly.
 * Returns null on 404 (unknown restaurant → loyalty section hidden, per G4).
 * Uses per-tier redemption_value (G1). Caller must NOT fall back to flat redemption_value.
 */
export const crmGetLoyaltyRules = async (restaurantId) => {
  try {
    return await crmFetch(`/scan/loyalty-rules/${restaurantId}`, { method: 'GET' });
  } catch (err) {
    // 404 = restaurant has no loyalty config → hide section (G4)
    if (err?.status === 404 || err?.message?.includes('404')) return null;
    throw err; // propagate unexpected errors
  }
};
```

---

### E2 · `ReviewOrder.jsx` — add `crmGetLoyaltyRules` to import (line 29)

**Before:**
```javascript
import { buildUserId, crmLookupCustomer } from '../api/services/crmService';
```

**After:**
```javascript
import { buildUserId, crmLookupCustomer, crmGetLoyaltyRules } from '../api/services/crmService';
```

---

### E3 · `ReviewOrder.jsx:141–155` — replace `fetchLoyaltySettings` effect (Part B)

**Before:**
```javascript
  // Fetch loyalty settings for points calculation
  useEffect(() => {
    const fetchLoyaltySettings = async () => {
      if (!numericRestaurantId) return;
      try {
        const response = await fetchWithTimeout(`${process.env.REACT_APP_BACKEND_URL}/api/loyalty-settings/${numericRestaurantId}`); // CR-2026-02-XX-001 — 8 s read
        if (response.ok) {
          const data = await response.json();
          setLoyaltySettings(data);
        }
      } catch (error) {
        logger.error('order', 'Failed to fetch loyalty settings:', error);
      }
    };
    fetchLoyaltySettings();
  }, [numericRestaurantId]);
```

**After:**
```javascript
  // CR-2026-10-03-004 Part B: loyalty rules from CRM (replaces backend loyalty-settings direct DB read)
  useEffect(() => {
    const fetchLoyaltyRules = async () => {
      if (!numericRestaurantId) return;
      try {
        const data = await crmGetLoyaltyRules(numericRestaurantId);
        setLoyaltySettings(data); // null on 404 → loyalty section hidden (G4)
      } catch (error) {
        logger.error('order', 'Failed to fetch loyalty rules:', error);
      }
    };
    fetchLoyaltyRules();
  }, [numericRestaurantId]);
```

---

### ~~E4 · `ReviewOrder.jsx:489–498` — DROPPED~~

**D1 resolved: POS flag only.** `showLoyalty` memo is not touched. `loyaltySettings?.loyalty_enabled` is not read for gating purposes. No change to this block.

---

### E5 · `ReviewOrder.jsx:859–874` — fix `handleUsePoints` (G1 per-tier + G3 caps)

**Before:**
```javascript
  // Handle loyalty points redemption
  const handleUsePoints = () => {
    const availablePoints = isAuthenticated ? (user?.total_points || 0) : (lookedUpCustomer?.total_points || 0);
    const redemptionValue = loyaltySettings?.redemption_value || 0;
    
    if (!availablePoints || !redemptionValue) return;
    
    // Calculate max points that can be used (can't exceed subtotal)
    const maxPointsValue = subtotal; // Max discount = subtotal (can't go negative)
    const maxPointsToUse = Math.floor(maxPointsValue / redemptionValue);
    const pointsToUse = Math.min(availablePoints, maxPointsToUse);
    const discount = pointsToUse * redemptionValue;
    
    setPointsToRedeem(pointsToUse);
    setPointsDiscount(discount);
    setIsUsingPoints(true);
  };
```

**After:**
```javascript
  // Handle loyalty points redemption
  // CR-2026-10-03-004 Part B: G1 per-tier redemption value; G3 CRM redemption caps enforced
  const handleUsePoints = () => {
    const availablePoints = isAuthenticated ? (user?.total_points || 0) : (lookedUpCustomer?.total_points || 0);
    const tier = (isAuthenticated ? user?.tier : lookedUpCustomer?.tier) || 'Bronze';
    const tierKey = `${tier.toLowerCase()}_redemption_value`;
    const redemptionValue = loyaltySettings?.[tierKey] || loyaltySettings?.bronze_redemption_value || 0;

    if (!availablePoints || !redemptionValue) return;

    // G3: CRM caps — each is independently enforced; most restrictive wins
    const minPoints = loyaltySettings?.min_redemption_points || 0;
    if (availablePoints < minPoints) return; // below floor — cannot redeem

    // Cap 1: can't exceed subtotal
    let maxDiscount = subtotal;
    // Cap 2: max_redemption_percent (% of subtotal)
    const maxPct = loyaltySettings?.max_redemption_percent;
    if (maxPct) maxDiscount = Math.min(maxDiscount, subtotal * (maxPct / 100));
    // Cap 3: max_redemption_amount (absolute ₹ ceiling, e.g. ₹110 on restaurant 689)
    const maxAmt = loyaltySettings?.max_redemption_amount;
    if (maxAmt) maxDiscount = Math.min(maxDiscount, maxAmt);

    const maxPointsToUse = Math.floor(maxDiscount / redemptionValue);
    const pointsToUse = Math.min(availablePoints, maxPointsToUse);
    const discount = pointsToUse * redemptionValue;

    setPointsToRedeem(pointsToUse);
    setPointsDiscount(discount);
    setIsUsingPoints(true);
  };
```

---

### E6 · `ReviewOrder.jsx:1874` — fix inline "worth ₹X" display (G1)

**Before:**
```javascript
                  const rdv = loyaltySettings?.redemption_value || 0;
```

**After:**
```javascript
                  // CR-2026-10-03-004 Part B: G1 per-tier redemption value
                  const _tier = (isAuthenticated ? user?.tier : lookedUpCustomer?.tier) || 'Bronze';
                  const rdv = loyaltySettings?.[`${_tier.toLowerCase()}_redemption_value`] || loyaltySettings?.bronze_redemption_value || 0;
```

---

### E7 · `ReviewOrder.jsx:400–438` — delete customer-lookup effect (Part C)

**Delete entirely** (lines 400–438, comment + useEffect block):

```javascript
  // Phone-based customer lookup (debounced)
  useEffect(() => {
    if (isAuthenticated && isCustomer) return; // Skip if already logged in
    if (!customerPhone || !numericRestaurantId) return;

    // Extract bare digits from phone value
    const digits = customerPhone.replace(/\D/g, '');
    // Check for 10 digits (or 12 with country code)
    const bareDigits = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
    if (bareDigits.length !== 10) {
      setLookedUpCustomer(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLookingUp(true);
      try {
        const response = await fetchWithTimeout(
          `${process.env.REACT_APP_BACKEND_URL}/api/customer-lookup/${numericRestaurantId}?phone=${bareDigits}`
        ); // CR-2026-02-XX-001 — 8 s read
        if (response.ok) {
          const data = await response.json();
          setLookedUpCustomer(data);
          if (data.found && data.name) {
            setCustomerName(data.name);
          } else {
            // Clear name when customer not found in this restaurant
            setCustomerName('');
          }
        }
      } catch (error) {
        logger.error('order', 'Customer lookup failed:', error);
      } finally {
        setIsLookingUp(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [customerPhone, numericRestaurantId, isAuthenticated, isCustomer]);
```

**Replace with single tombstone comment:**
```javascript
  // CR-2026-10-03-004 Part C: customer-lookup retired — F2=(a): no token → no points/tier block shown.
  // Name pre-fill comes from sessionStorage/guestCustomer (set at LandingPage). No retry, no toast.
```

---

### E8 · `LoyaltyRewardsSection.jsx:34` — per-tier redemption in Variant 1 (G1)

**Before:**
```javascript
    const redemptionValue = loyaltySettings.redemption_value || 0.25;
```

**After:**
```javascript
    // CR-2026-10-03-004 Part B: G1 — per-tier redemption value; never fall back to flat redemption_value
    const tierKey = `${tier}_redemption_value`;
    const redemptionValue = loyaltySettings[tierKey] || loyaltySettings.bronze_redemption_value || 1.0;
```

> `tier` is already computed at line 28 as `custTier.toLowerCase()`.

---

### E9 · `LoyaltyRewardsSection.jsx:91` — per-tier redemption in Variant 3 guest (G1)

**Before:**
```javascript
    const redemptionValue = loyaltySettings.redemption_value || 0.25;
```

**After:**
```javascript
    // CR-2026-10-03-004 Part B: G1 — guest uses bronze tier (tier unknown pre-login)
    const redemptionValue = loyaltySettings.bronze_redemption_value || 1.0;
```

---

### E10 · `server.py:971–1004` — delete `GET /loyalty-settings/{restaurant_id}` route (Part B)

**Delete entirely** — from `@api_router.get("/loyalty-settings/{restaurant_id}")` through the closing `}` of the route function (lines 971–1004, inclusive).

> **Check first:** `grep -n "loyalty.settings" backend/server.py` must return only line 975 (`db.loyalty_settings.find_one`). If any other line references it, stop.

---

### E11 · `server.py:1006–1041` — delete `GET /customer-lookup/{restaurant_id}` route (Part C)

**Delete entirely** — from `@api_router.get("/customer-lookup/{restaurant_id}")` through the closing `}` of the route function (lines 1006–1041, inclusive).

> **Check first:** `grep -n "customer.lookup\|db\.customers" backend/server.py` must return only lines 1006 (`@api_router.get`) and 1018 (`db.customers.find_one`). If any other line references either, stop.

---

### E12 · `backend/tests/smoke/test_cr_2026_10_03_001.py:64–71` — update guards

**Replace `test_live_crm_boundary_routes_untouched`:**

Before:
```python
def test_live_crm_boundary_routes_untouched(http_client):
    assert http_client.get("/api/customer-lookup/478", params={"phone": "9579504871"}).status_code == 200
    assert http_client.get("/api/loyalty-settings/478").status_code == 200
```

After:
```python
def test_crm_boundary_routes_retired(http_client):
    # CR-2026-10-03-004 B+C: both routes deleted — must 404
    assert http_client.get("/api/customer-lookup/478", params={"phone": "9579504871"}).status_code in (404, 405)
    assert http_client.get("/api/loyalty-settings/478").status_code in (404, 405)
```

**Update `test_static_no_dead_touches` line 71:**

Before:
```python
    assert len(re.findall(r"db\.customers\b", src)) == 1
```

After:
```python
    # CR-2026-10-03-004 B+C: both direct DB reads deleted
    assert len(re.findall(r"db\.customers\b", src)) == 0
    assert len(re.findall(r"db\.loyalty_settings\b", src)) == 0
```

---

### E13 · `backend/tests/contracts/test_public_config.py:71–90` — flip contract tests

**Replace both contract tests:**

Before:
```python
@pytest.mark.contract
def test_loyalty_settings_478(http_client, strip_dynamic, snapshot):
    """GET /api/loyalty-settings/478."""
    resp = http_client.get("/api/loyalty-settings/478")
    assert resp.status_code == 200
    assert snapshot == strip_dynamic(resp.json())


@pytest.mark.contract
def test_customer_lookup_478(http_client, strip_dynamic, snapshot):
    """GET /api/customer-lookup/478 — check-customer response shape."""
    import os
    phone = os.environ.get("TEST_PHONE", "9579504871")
    resp = http_client.get(f"/api/customer-lookup/478", params={"phone": phone})
    assert resp.status_code == 200
    # Strip phone to avoid PII in snapshot; strip token fields
    data = strip_dynamic(resp.json())
    data.pop("phone", None)
    data.pop("name", None)
    assert snapshot == data
```

After:
```python
@pytest.mark.contract
def test_loyalty_settings_478_retired(http_client):
    """GET /api/loyalty-settings/478 — route deleted by CR-2026-10-03-004 Part B."""
    resp = http_client.get("/api/loyalty-settings/478")
    assert resp.status_code in (404, 405)


@pytest.mark.contract
def test_customer_lookup_478_retired(http_client):
    """GET /api/customer-lookup/478 — route deleted by CR-2026-10-03-004 Part C."""
    resp = http_client.get("/api/customer-lookup/478", params={"phone": "9579504871"})
    assert resp.status_code in (404, 405)
```

---

## Edit summary

| ID | File | What | Risk |
|---|---|---|---|
| E1 | `crmService.js` | Add `crmGetLoyaltyRules` (~18 lines) | MEDIUM |
| E2 | `ReviewOrder.jsx` | Add import | LOW |
| E3 | `ReviewOrder.jsx:141–155` | Replace fetchLoyaltySettings effect | HIGH |
| ~~E4~~ | ~~`ReviewOrder.jsx:489–498`~~ | ~~showLoyalty guard~~ | **DROPPED** — D1=POS only |
| E5 | `ReviewOrder.jsx:859–874` | Fix handleUsePoints (G1 tier + G3 caps) | HIGH |
| E6 | `ReviewOrder.jsx:1874` | Fix inline rdv (G1 tier) | HIGH |
| E7 | `ReviewOrder.jsx:400–438` | Delete customer-lookup effect | HIGH |
| E8 | `LoyaltyRewardsSection.jsx:34` | Per-tier rdv Variant 1 | HIGH |
| E9 | `LoyaltyRewardsSection.jsx:91` | Bronze rdv Variant 3 guest | HIGH |
| E10 | `server.py:971–1004` | Delete loyalty-settings route | HIGH |
| E11 | `server.py:1006–1041` | Delete customer-lookup route | HIGH |
| E12 | `smoke/test_cr_2026_10_03_001.py` | Flip 2 assertions | MEDIUM |
| E13 | `contracts/test_public_config.py` | Flip 2 contract tests, remove snapshots | MEDIUM |

**Net: ~120 lines removed, ~50 lines added, across 6 files. 12 active edits.**

---

## Apply order (bottom-up within each file, reduces line-shift risk)

1. `crmService.js` — E1 (add only, no line shift)
2. `ReviewOrder.jsx` — E7 first (C1, line ~400), then E3 (~141), then E2 (import, ~29), then E5 (~859), then E6 (~1874) — **bottom-up within file**. E4 skipped.
3. `LoyaltyRewardsSection.jsx` — E9 first (line 91), then E8 (line 34) — bottom-up
4. `server.py` — E11 first (line 1006), then E10 (line 971) — bottom-up
5. `test_cr_2026_10_03_001.py` — E12
6. `test_public_config.py` — E13

---

## Self-test checklist (Role 3 must complete before QA handover)

| ST | Test | How | Expected |
|---|---|---|---|
| ST1 | Boundary grep zero | `grep -c "db\.loyalty_settings\|db\.customers" backend/server.py` | **0** |
| ST2 | loyalty-settings gone | `curl GET $BACKEND_URL/api/loyalty-settings/478` | 404 |
| ST3 | customer-lookup gone | `curl GET $BACKEND_URL/api/customer-lookup/478?phone=9579504871` | 404 |
| ST4 | No flat redemption_value reads remain | `grep -rn "\.redemption_value" frontend/src/` | Only crmGetLoyaltyRules comment (if any); zero in LoyaltyRewardsSection + ReviewOrder |
| ST5 | Backend starts | `sudo supervisorctl status backend` | RUNNING — check no ValueError on startup |
| ST6 | pytest smoke | `pytest -m smoke -n 0 backend/tests/smoke/ -q` | All pass (≥48 including 2 updated) |
| ST7 | pytest contract | `pytest -m contract -n 0 backend/tests/contracts/ -q` | All pass (14 including 2 updated) |
| ST8 | yarn build | `cd /app/frontend && yarn build` | Clean — 0 errors |
| ST9 | ReviewOrder on 689 loads | Screenshot / browser | LoyaltySection shows per-tier earn calc |
| ST10 | handleUsePoints on 689 | DevTools → set pts=500, click Use | Discount ≤ ₹110 (max_redemption_amount cap) |
| ST11 | loyalty_enabled=false (478) | Navigate to restaurant 478 ReviewOrder | Loyalty section entirely hidden |

---

## Code markers

Every changed block must carry:
```javascript
// CR-2026-10-03-004 Part B: <brief reason>
// CR-2026-10-03-004 Part C: <brief reason>
```
```python
# CR-2026-10-03-004 Part B: <brief reason>
# CR-2026-10-03-004 Part C: <brief reason>
```

---

## QA test cases (for QA handover)

| T | Scenario | Expected |
|---|---|---|
| T1 | Restaurant 689 — ReviewOrder loads, diner unauthenticated | LoyaltySection shows generic earn prompt (Variant 3, bronze earn rate). Network shows call to CRM `/scan/loyalty-rules/689`, **not** `/api/loyalty-settings/689` |
| T2 | Restaurant 689 — diner authenticated as Gold tier | Earn preview shows `gold_earn_percent` rate; "Worth ₹X" uses `gold_redemption_value` (₹3/pt), not ₹1/pt |
| T3 | Restaurant 689 — click "Use" on points | Discount capped at ₹110 (`max_redemption_amount`). `min_redemption_points` floor respected |
| T4 | Restaurant 478 — ReviewOrder loads | Loyalty section **entirely hidden** (`loyalty_enabled: false`) |
| T5 | Any restaurant — CRM returns 404 for unknown rid | Loyalty section hidden; no console error, no crash |
| T6 | ReviewOrder: type phone in customer phone field | Name field does NOT auto-fill from lookup (customer-lookup retired). Name already pre-filled from LandingPage sessionStorage |
| T7 | `curl GET $BACKEND_URL/api/loyalty-settings/689` | 404 |
| T8 | `curl GET $BACKEND_URL/api/customer-lookup/689?phone=9579504871` | 404 |
| T9 | `grep "db\.loyalty_settings\|db\.customers" backend/server.py` | 0 results |
| T10 | pytest smoke 48+ | All pass |
| T11 | pytest contract 14 | All pass |
| T12 | `yarn build` | Clean |
| T13 | Full order placement (dine-in, 689) regression | Order places successfully; payload unchanged |

---

```
Planning complete: CR-2026-10-03-004 Parts B+C
Stage: Impact Analysis + Implementation Plan (both)
Code reality: FULL — 12 active edits with before/after, anchored to current file state (E4 dropped)
Risk: CRITICAL
Files WILL change: crmService.js (E1) · ReviewOrder.jsx (E2–E3, E5–E7) · LoyaltyRewardsSection.jsx (E8–E9) · server.py (E10–E11) · test_cr_2026_10_03_001.py (E12) · test_public_config.py (E13)
Files WILL NOT touch: AuthContext.jsx · CartContext.js · App.js · LandingPage.jsx · RestaurantConfigContext.jsx
Owner decisions: D1=POS flag only (resolved 2026-10-09, E4 dropped); F2=(a) locked
Status: AT GATE — awaiting "Gate 3 accepted for CR-2026-10-03-004 Parts B+C"
```
