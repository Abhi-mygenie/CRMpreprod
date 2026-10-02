# CR-005 + CR-002B — Implementation Plan v2 (Clean Handover)

**Date:** 2026-05-26
**Sprint:** ROI Measurement for CRM
**Status:** `cr005_cr002b_implementation_plan_v2_locked`
**Discovery doc:** `../discovery/CR_005_CR_002B_PHASE_0_DISCOVERY_AND_ANALYSIS.md`
**Supersedes:** v1 of this plan (added Gap 2: used-coupons list endpoint + UI tab)

---

## 1. Scope

**5 fixes. 3 files. ~3 hours total.** Resolves CR-005 (B1, B2/B3/B6, B5, B7) + CR-002B fully.

---

## 2. File Change Matrix

| # | File | Action | Bugs/Gaps Fixed |
|---|---|---|---|
| 1 | `backend/core/coupon.py` | EDIT (+1 line) | B2 (+ B3 + B6): increment `total_coupon_used` on customer |
| 2 | `backend/routers/customers.py` | EDIT (+new endpoint ~30 lines) | CR-002B Gap 2: `GET /customers/{id}/coupon-history` |
| 3 | `frontend/src/pages/CouponsPage.jsx` | EDIT (3 changes) | B1, B5, B7 |
| 4 | `frontend/src/pages/CustomerDetailPage.jsx` | EDIT (+new tab ~50 lines, +1 state, +1 fetch) | CR-002B Gap 2: "Coupon History" tab |

**Files NOT modified:** `server.py`, `pos.py`, `suggestions.py`, `customer_intelligence.py`, `models/schemas.py`.

---

## 3. Fix Details

---

### FIX 1: B2 — Increment `total_coupon_used` on customer doc (BACKEND)

**File:** `backend/core/coupon.py`
**Location:** Line 2214-2216

**Current code (L2214-2216):**
```python
    if result.upserted_id is not None:
        # First insert — increment total_used.
        await db.coupons.update_one({"id": coupon["id"]}, {"$inc": {"total_used": 1}})
```

**New code:**
```python
    if result.upserted_id is not None:
        # First insert — increment total_used on coupon + total_coupon_used on customer.
        await db.coupons.update_one({"id": coupon["id"]}, {"$inc": {"total_used": 1}})
        await db.customers.update_one({"id": customer_id, "user_id": user_id}, {"$inc": {"total_coupon_used": 1}})
```

**Why this also fixes B3/B6:** Per-user and total usage enforcement at `coupon.py` L1656-1684 depends on `coupon_usage` records existing and `total_used` being accurate. Both are already handled (L2208-2216). The missing piece was only the customer counter.

**Idempotency:** Safe. `$inc` runs only when `result.upserted_id is not None` (first insert). Replay returns at L2244 without re-incrementing.

**Schema:** `total_coupon_used: int = 0` already exists at `models/schemas.py` L449. No schema change needed.

**POS team action item (NOT a blocker for this fix):** R689 has zero `coupon_usage` records. POS must verify they send `coupon_code + coupon_discount > 0` in order payloads. The CRM fix is correct regardless.

---

### FIX 2: CR-002B Gap 2 — Used coupons history endpoint (BACKEND)

**File:** `backend/routers/customers.py`
**Location:** After the `loyalty-details` endpoint (after L1521)

**New endpoint:**
```python
@router.get("/{customer_id}/coupon-history")
async def get_customer_coupon_history(customer_id: str, user: dict = Depends(get_current_user)):
    """CR-002B: Returns this customer's coupon usage history with discount, date, order_id."""
    customer = await db.customers.find_one({"id": customer_id, "user_id": user["id"]}, {"_id": 0, "id": 1})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    usages = await db.coupon_usage.find(
        {"customer_id": customer_id, "user_id": user["id"]},
        {"_id": 0, "id": 1, "coupon_code": 1, "coupon_title": 1, "discount_scope": 1,
         "coupon_discount": 1, "order_id": 1, "pos_order_id": 1, "used_at": 1,
         "created_at": 1, "offer_type": 1, "discount_type": 1, "discount_value": 1}
    ).sort("created_at", -1).limit(50).to_list(50)

    return {"customer_id": customer_id, "coupon_usages": usages, "total": len(usages)}
```

**What this returns:** List of coupon usage records for this customer, sorted newest-first, with:
- `coupon_code` — e.g. "SAVE20"
- `coupon_title` — human label
- `coupon_discount` — actual discount amount applied (from POS)
- `discount_scope` — "order" / "item" / "category"
- `offer_type` — "simple" / "bogo" / "bxg" / "nth_item"
- `order_id` — CRM order ID (links to order detail)
- `pos_order_id` — POS-side order ID
- `used_at` — ISO timestamp
- `created_at` — ISO timestamp

**Why limit 50:** Customer detail page is a quick-glance view. 50 is more than enough history. No pagination needed for v1.

**Auth:** Uses existing `get_current_user` (CRM admin JWT), same as all `/customers/{id}/*` endpoints. NOT POS auth.

**Imports needed:** None new — `HTTPException`, `Depends`, `get_current_user`, `db` are all already imported in `customers.py`.

---

### FIX 3: CR-002B Gap 2 — "Coupon History" tab on customer detail (FRONTEND)

**File:** `frontend/src/pages/CustomerDetailPage.jsx`

**Change A — Add state for coupon history (near L23, alongside other state):**
```jsx
const [couponHistory, setCouponHistory] = useState([]);
```

**Change B — Add fetch call in `fetchData` (L43-48, add to Promise.all):**

Current:
```jsx
const [customerRes, txRes, walletTxRes, expiringRes] = await Promise.all([
    api.get(`/customers/${id}`),
    api.get(`/points/transactions/${id}`),
    api.get(`/wallet/transactions/${id}`),
    api.get(`/points/expiring/${id}`)
]);
```

New:
```jsx
const [customerRes, txRes, walletTxRes, expiringRes, couponHistRes] = await Promise.all([
    api.get(`/customers/${id}`),
    api.get(`/points/transactions/${id}`),
    api.get(`/wallet/transactions/${id}`),
    api.get(`/points/expiring/${id}`),
    api.get(`/customers/${id}/coupon-history`).catch(() => ({ data: { coupon_usages: [] } }))
]);
setCouponHistory(couponHistRes.data.coupon_usages || []);
```

Note: `.catch()` so coupon history failure doesn't break the whole page.

**Change C — Expand tabs from 2 to 3 (L522-526):**

Current:
```jsx
<TabsList className="grid w-full grid-cols-2 mb-4">
    <TabsTrigger value="points" data-testid="points-tab">Points History</TabsTrigger>
    <TabsTrigger value="wallet" data-testid="wallet-tab">Wallet History</TabsTrigger>
</TabsList>
```

New:
```jsx
<TabsList className="grid w-full grid-cols-3 mb-4">
    <TabsTrigger value="points" data-testid="points-tab">Points</TabsTrigger>
    <TabsTrigger value="wallet" data-testid="wallet-tab">Wallet</TabsTrigger>
    <TabsTrigger value="coupons" data-testid="coupons-tab">Coupons</TabsTrigger>
</TabsList>
```

Tab label shortened from "Points History" / "Wallet History" to "Points" / "Wallet" / "Coupons" to fit 3 columns.

**Change D — Add Coupon History tab content (after wallet TabsContent, before `</Tabs>` at ~L606):**

```jsx
<TabsContent value="coupons">
    {couponHistory.length === 0 ? (
        <div className="stats-card text-center py-8">
            <p className="text-[#52525B]">No coupon usage recorded yet</p>
        </div>
    ) : (
        <Card className="rounded-xl border-0 shadow-sm">
            <CardContent className="p-4">
                {couponHistory.map((usage, index) => (
                    <div key={usage.id || index} className="transaction-item" data-testid={`coupon-usage-${usage.id}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-100">
                                <Ticket className="w-4 h-4 text-purple-600" />
                            </div>
                            <div>
                                <p className="font-medium text-[#1A1A1A] text-sm">
                                    <span className="font-mono font-bold">{usage.coupon_code}</span>
                                    {usage.coupon_title && <span className="text-[#52525B] font-normal ml-1.5">— {usage.coupon_title}</span>}
                                </p>
                                <p className="text-xs text-[#A1A1AA]">
                                    {usage.discount_scope && <span className="uppercase">{usage.discount_scope} • </span>}
                                    {usage.offer_type && usage.offer_type !== "simple" && <span className="uppercase">{usage.offer_type} • </span>}
                                    {new Date(usage.used_at || usage.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        <p className="font-semibold text-green-600" data-testid={`coupon-discount-${usage.id}`}>
                            -₹{(usage.coupon_discount || 0).toLocaleString()}
                        </p>
                    </div>
                ))}
            </CardContent>
        </Card>
    )}
</TabsContent>
```

**Icon import:** `Ticket` is already imported in `CustomerDetailPage.jsx` (used at L343 for coupon code display).

**Pattern:** Matches exactly the wallet history tab pattern (same `transaction-item` class, same layout, same date formatting).

---

### FIX 4: B1 — Show coupon description in list (FRONTEND)

**File:** `frontend/src/pages/CouponsPage.jsx`
**Location:** After L522

**Insert after L522:**
```jsx
{coupon.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1" data-testid="coupon-description">{coupon.description}</p>}
```

---

### FIX 5: B7 — Show discount_type toggle for Happy Hour (FRONTEND)

**File:** `frontend/src/pages/CouponsPage.jsx`
**Location:** L617

**Change:**
```jsx
// BEFORE:
{isV2 && (

// AFTER:
{(isV2 || selectedType === "time_window") && (
```

**Backend already supports both flat and percentage for V3-A.** This is purely a UI gate fix.

---

### FIX 6: B5 — Surface menu fetch error + retry (FRONTEND)

**File:** `frontend/src/pages/CouponsPage.jsx`

**Change A — Add state (after L247):**
```jsx
const [menuError, setMenuError] = useState(null);
```

**Change B — Update fetchMenu (L256-263):**
```jsx
const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    setMenuError(null);
    try {
      const [ir, cr] = await Promise.all([api.get("/menu/items"), api.get("/menu/categories")]);
      setMenuItems(ir.data.items || []);
      setMenuCategories(cr.data.categories || []);
    } catch (err) {
      setMenuError("Failed to load menu items. Please try again.");
      toast.error("Menu items could not be loaded. Check your MyGenie connection.");
    }
    finally { setMenuLoading(false); }
}, [api]);
```

**Change C — Add error banner after each picker section.** Insert after `<ItemSelector>` (V2 items ~L648), after `<CategorySelector>` (V2 categories ~L649), in BOGO section (~L735 area), and in V3-C section (~L800 area):

```jsx
{menuError && (
  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200" data-testid="menu-error-banner">
    <p className="text-sm text-red-600">{menuError}</p>
    <Button variant="outline" size="sm" onClick={fetchMenu} className="text-xs h-7" data-testid="menu-retry-btn">Retry</Button>
  </div>
)}
```

---

## 4. Pre-Implementation Questions (All Answered)

| # | Question | Answer |
|---|---|---|
| Q1 | Does `record_coupon_usage_for_order` have access to `customer_id` + `user_id`? | **YES** — function params L2028-2031 |
| Q2 | Is `total_coupon_used` on the customer schema? | **YES** — `models/schemas.py` L449 |
| Q3 | Is the B2 increment idempotent? | **YES** — only runs inside `if result.upserted_id is not None` |
| Q4 | Will B7 break existing Happy Hour coupons? | **NO** — existing coupons have `discount_type` stored, toggle makes it visible |
| Q5 | Does `Ticket` icon need importing in `CustomerDetailPage.jsx`? | **NO** — already imported (used at L343) |
| Q6 | What auth does the new coupon-history endpoint use? | `get_current_user` (CRM admin JWT) — same as all `/customers/{id}/*` endpoints |
| Q7 | Does the coupon-history endpoint need to query `coupon_usage` with `user_id`? | **YES** — scoped by `user_id` from auth to prevent cross-restaurant data leaks |
| Q8 | What if `coupon_usage` has zero records? | Endpoint returns `{"coupon_usages": [], "total": 0}`. Frontend shows "No coupon usage recorded yet" |
| Q9 | Should the coupon history tab be default-selected? | **NO** — keep "Points" as default (`activeTab` state initializes to "points") |
| Q10 | Does the `coupon-history` fetch failure block the page? | **NO** — wrapped in `.catch()` so page loads normally even if endpoint fails |
| Q11 | Should we backfill historical `total_coupon_used`? | **NOT in this phase.** Going-forward accuracy. Backfill is a separate migration script if needed. |
| Q12 | Does adding a 5th API call to `fetchData` cause issues? | **NO** — it's a `Promise.all` parallel fetch. One more call adds ~200ms on external DB, negligible. |
| Q13 | Do we need a new `coupon-history` route in `server.py`? | **NO** — the endpoint is on the existing `customers` router (already wired via `api_router.include_router(customers.router)`) |
| Q14 | What fields from `coupon_usage` should we project? | Only display-relevant fields: `id, coupon_code, coupon_title, discount_scope, coupon_discount, order_id, pos_order_id, used_at, created_at, offer_type, discount_type, discount_value`. No internal fields like `buy_match_summary`. |
| Q15 | Does the coupon history tab need pagination? | **NO** — limit 50 is sufficient for v1 customer detail view. |

---

## 5. Testing Plan

| # | Test | Type | Expected |
|---|---|---|---|
| **B2 (+ B3 + B6)** | | | |
| T1 | `POST /api/pos/orders` with `coupon_code + coupon_discount > 0` | Backend curl | `coupon_usage` record created, customer `total_coupon_used` incremented |
| T2 | Same order again (replay) | Backend curl | `idempotent_replay: true`, counter NOT double-incremented |
| T3 | Customer detail page shows updated used count | Frontend screenshot | Counter shows `1` |
| T4 | Coupon with `per_user_limit: 1`, apply twice | Backend curl | First succeeds, second returns `CUSTOMER_USAGE_LIMIT_REACHED` |
| T5 | Coupon with `usage_limit: 2`, apply 3 times | Backend curl | First 2 succeed, 3rd returns `USAGE_LIMIT_REACHED` |
| **CR-002B Gap 2** | | | |
| T6 | `GET /customers/{id}/coupon-history` with valid customer | Backend curl | Returns `coupon_usages` array |
| T7 | Same endpoint with customer who has zero usage | Backend curl | Returns `{"coupon_usages": [], "total": 0}` |
| T8 | Customer detail page — "Coupons" tab visible | Frontend screenshot | 3 tabs: Points / Wallet / Coupons |
| T9 | Coupons tab with history | Frontend screenshot | Shows coupon code, title, discount amount, date |
| T10 | Coupons tab empty state | Frontend screenshot | Shows "No coupon usage recorded yet" |
| **B1** | | | |
| T11 | Coupon list with descriptions | Frontend screenshot | Description line below title |
| T12 | Coupon without description | Frontend screenshot | No extra line |
| **B7** | | | |
| T13 | Happy Hour coupon form | Frontend screenshot | Discount Type dropdown visible |
| T14 | Create Happy Hour with percentage | Frontend + backend | Saves correctly |
| **B5** | | | |
| T15 | Open BOGO form when menu fails | Frontend screenshot | Error banner + Retry button |
| T16 | Click Retry after error | Frontend screenshot | Menu loads or error persists |

---

## 6. Dependency Check

| Dependency | Status | Verified |
|---|---|---|
| `total_coupon_used` field on customer schema | Exists (`models/schemas.py` L449) | YES |
| `customer_id` + `user_id` available in `record_coupon_usage_for_order` | Function params (L2028-2031) | YES |
| `coupon_usage` collection exists with indexed fields | YES — used throughout coupon engine | YES |
| `Ticket` icon in CustomerDetailPage | Already imported (L343) | YES |
| `toast` from sonner in CouponsPage | Already imported | YES |
| `Card, CardContent` in CustomerDetailPage | Already imported | YES |
| `transaction-item` CSS class | Already defined in App.css | YES |
| `get_current_user` in customers.py | Already imported | YES |
| `HTTPException` in customers.py | Already imported | YES |
| Tailwind `line-clamp-1` | Available in Tailwind 3.x | YES |

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R689 POS not sending coupon_code | Medium | B2 fix correct but no new records | Flag POS team (not a CRM blocker) |
| `coupon_usage` collection empty for all restaurants | Low | Coupon history tab shows empty | "No coupon usage recorded yet" empty state handles this gracefully |
| 3-column tabs too narrow on mobile | Low | Tab labels truncated | Shortened to "Points" / "Wallet" / "Coupons" (fits in 3-col grid) |
| Menu fetch retry spams MyGenie | Low | Rate limiting | Manual retry (user clicks), not automatic |

---

## 8. Out of Scope

- B4 (Happy Hour item/category scope) → V3-A2 CR
- Historical backfill of `total_coupon_used` → separate migration script
- Used-coupons detail modal (click to see full discount breakdown) → Phase 2
- Fixing POS to send coupon data → POS team action item

---

## 9. Exact Diff Summary

| File | Changes | Net lines |
|---|---|---|
| `backend/core/coupon.py` | +1 line (customer $inc) | +1 |
| `backend/routers/customers.py` | +1 new endpoint (~18 lines) | +18 |
| `frontend/src/pages/CouponsPage.jsx` | +1 state, +5 lines fetchMenu error, +1 description line, +1 condition change, +4 error banners | +15 |
| `frontend/src/pages/CustomerDetailPage.jsx` | +1 state, +1 fetch line, +1 setCouponHistory, tab grid 2→3, tab labels shortened, +35 lines new tab content | +40 |

**Total: ~74 new lines across 4 files.**

---

## 10. Status

```
cr005_cr002b_implementation_plan_v2_locked
```

All gaps closed. All questions answered. Ready for implementation agent handover.
