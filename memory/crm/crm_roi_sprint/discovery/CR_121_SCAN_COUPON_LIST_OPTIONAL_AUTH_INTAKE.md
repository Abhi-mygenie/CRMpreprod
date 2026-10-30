# CR-121 — Intake: `GET /scan/coupons` optional-auth (anonymous coupon discovery list)
**Date**: 2026-10-11 · **Role**: Intake Agent · **Source**: INV-024 · S&O contract frozen 2026-10-11 · **No code changed. No data written.**

---

## 1. Owner / Contract Request

Sister CR to CR-120. Same contract freeze. S&O requires anonymous diners to browse available coupons at the restaurant before identifying themselves.

**Owner decisions (locked):**
- Q4: Anonymous list shows `requires_customer = false` coupons only — standard coupons hidden entirely (not greyed/locked)

---

## 2. Problem

`GET /scan/coupons` currently requires a Bearer customer token. An anonymous diner cannot see any coupons on the checkout screen. S&O wants to show a tap-to-apply coupon list so diners don't have to type codes blind.

---

## 3. Code reality (confirmed from live scan.py + core/coupon.py)

### What already exists

| Component | Location | Status |
|---|---|---|
| `optional_customer_token` helper | `scan.py:100–116` | ✅ EXISTS |
| `list_available_coupons(customer_id=None)` | `core/coupon.py:1981` | ✅ EXISTS — `customer_id: Optional[str] = None` (added by CR-082) |
| `requires_customer` guard in validate (called by list) | `core/coupon.py:1767–1776` | ✅ When `customer_id=None` and `requires_customer=True` → `ok:False` → excluded from list automatically |
| `_resolve_restaurant_id` | `scan.py:42–55` | ✅ EXISTS |

### What does NOT exist

| Gap | Detail |
|---|---|
| Optional token on the route | `Depends(verify_customer_token)` → `Depends(optional_customer_token)` |
| `restaurant_id` query param | Currently from JWT. Without token, must be a query param |
| Route does not use `list_available_coupons` | Current `GET /scan/coupons` does its own DB query + Python loop. For anonymous, must resolve restaurant without a token. Can keep same approach, just use `rid` from query param when no token. |

**The engine requires zero changes.** Anonymous filtering (hiding `requires_customer=true` coupons) happens automatically because the engine returns `ok:False` for them when `customer_id=None`, and they are excluded from the eligible list.

---

## 4. Contracted behaviour (frozen)

### Request — no token
```
GET /scan/coupons?restaurant_id=689&channel=dine_in
// No Authorization header
```

### Request — with token (existing, unchanged)
```
GET /scan/coupons?channel=dine_in
Authorization: Bearer <customer token>
```

### Response shape — per coupon (same shape for both auth states)
```json
{
  "code":                   "SAVE10",
  "title":                  "Weekend Offer",
  "discount_type":          "percentage",
  "discount_value":         10.0,
  "min_order_value":        200.0,
  "applicable_channels":    ["dine_in", "delivery", "takeaway"],
  "my_usage_count":         0        ← ONLY present when authenticated
}
```

### What anonymous list returns vs authenticated list

| Behaviour | Anonymous (no token) | Authenticated (with token) |
|---|---|---|
| `requires_customer=false` coupons | ✅ Returned | ✅ Returned |
| `requires_customer=true` coupons | ❌ Excluded automatically by engine | ✅ Returned if eligible |
| `specific_users` targeted coupons | ❌ Excluded | ✅ Returned if diner is in list |
| Coupons where per_user_limit reached | Not checked (no customer) | ❌ Excluded |
| `my_usage_count` field | ❌ Not present | ✅ Present |

### Rate limit
- **Authenticated:** none (token-gated, same as today)
- **Anonymous:** 10 requests/min per IP (new — same limit as validate)

---

## 5. Classification

| Field | Value |
|---|---|
| **Type** | CR — route contract extension (additive) |
| **Severity** | **P1** — blocks S&O coupon discovery list; contract frozen, S&O waiting on CRM deploy |
| **Risk** | **LOW** — additive; same pattern as CR-120; engine untouched |
| **Duplicate check** | **DISTINCT** — no existing CR touches the list route auth. BUG-034 fixed the 500. CR-106 added channel filter. Neither made token optional. |
| **Blast radius** | **SMALL** — 1 file (`routers/scan.py`), ~8 lines: route changes auth dep + adds `restaurant_id` param |
| **Owner decisions** | ALL LOCKED — Q4 = hide standard coupons entirely |
| **Related** | INV-024 · CR-120 (sister CR — same session, same file) · BUG-034 (fixed 500) · CR-106 (channel filter) |

---

## 6. Fix sketch (for Planning — do not implement now)

```python
# Route — optional token + restaurant_id query param
@router.get("/coupons")
async def get_available_coupons(
    channel: Optional[str] = None,
    restaurant_id: Optional[str] = None,    # CR-121: required when no token
    auth: Optional[dict] = Depends(optional_customer_token),  # CR-121
):
    # Resolve restaurant + customer
    if auth:
        rid = auth["restaurant_id"]
        customer_id = auth["customer_id"]
    else:
        if not restaurant_id:
            raise HTTPException(status_code=422, detail="restaurant_id required when not authenticated")
        rid = await _resolve_restaurant_id(restaurant_id)
        customer_id = None

    # Existing DB query + Python loop unchanged
    # When customer_id is None:
    #   - specific_users check: `if c.get("specific_users") and customer_id and customer_id not in...`
    #     → skipped (customer_id is None)
    #   - per_user_limit check: usage count not queried; coupon included regardless
    #   - requires_customer=true coupons: included in raw DB query BUT excluded
    #     by adding: `if c.get("requires_customer", True) and not customer_id: continue`
    #   - my_usage_count: only appended when customer_id is not None

# Add anonymous rate limit bucket when no token
```

**Note:** The current route does NOT call `list_available_coupons` from `core/coupon.py`. It does its own query. The `requires_customer=true` filter for anonymous must be added explicitly in the route loop (one `continue` line). This is the only logic addition.

---

## 7. Verification sketch

| V | Check | Expected |
|---|---|---|
| V1 | No token + `restaurant_id=689` | Returns only `requires_customer=false` coupons; no `my_usage_count` |
| V2 | No token, no `restaurant_id` | `422` |
| V3 | No token + `channel=dine_in` | Filtered to dine_in coupons |
| V4 | With token (existing) — all CR-105/106 cases | No regression; `my_usage_count` present |
| V5 | Anonymous — standard coupon in DB | Not returned |
| V6 | Anonymous rate limit: 11th call in 60s | `429` with `Retry-After` |

---

## 8. Owner questions

**None.** Contract fully frozen. Q4 (hide entirely) locked by owner.

---

```
Intake complete: CR-121
Classification: CR — route contract extension, additive (scan.py, ~8 lines)
Severity: P1 (S&O contract frozen, waiting on CRM deploy)
Risk: LOW
Duplicate check: DISTINCT (BUG-034 fixed 500; CR-106 added channel filter; neither touched auth)
Evidence: scan.py:467–494 (current route requires token), core/coupon.py:1985 (list_available_coupons supports customer_id=None), scan.py:100–116 (optional_customer_token exists)
Blast radius: SMALL (1 file, ~8 lines; no engine/schema/DB change)
Owner decisions: ALL LOCKED — Q4 = hide standard coupons entirely from anonymous list
Docs: discovery/CR_121_SCAN_COUPON_LIST_OPTIONAL_AUTH_INTAKE.md
Next: Planning gate opens on "choose planning role for CR-120 and CR-121"
```
