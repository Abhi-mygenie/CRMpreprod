# CR-079 — Impact Analysis
## POS Customer Edit — Schema + Response Fix

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: LOW
**Intake doc**: `discovery/CR_079_POS_CUSTOMER_EDIT_INTAKE.md`

---

## 1. Registration Verified

CR-079 registered. Status: `cr079_intake_closed_q1a_q2a_ready_for_planning`. Q1=a (phone required), Q2=a (full customer response). No open decisions.

---

## 2. Code Reality

`PUT /api/pos/customers/{customer_id}` — **exists** at `pos.py:373`, uses `verify_pos_auth`. Works today. Two contract problems:

### Problem 1 — `pos_id` and `restaurant_id` mandatory (`pos.py:130–131`)

```python
class POSCustomerUpdate(BaseModel):
    pos_id: str       # ← REQUIRED — no default
    restaurant_id: str # ← REQUIRED — no default
    phone: str         # ← REQUIRED — stays required (Q1=a)
    name: Optional[str] = None
    ...
```

Both fields flow through `update_dict` (line 391: `{k: v for k, v in ... if v is not None}`) and then `restaurant_id` is remapped to `pos_restaurant_id` (line 398). If not sent → Pydantic 422 before the function even runs.

**Fix**: `pos_id: Optional[str] = None` and `restaurant_id: Optional[str] = None`. The `if v is not None` filter at line 391 already skips None values — no other change needed in the function body.

---

### Problem 2 — Response returns only 4 fields (`pos.py:438–447`)

```python
return POSResponse(
    success=True,
    message="Customer updated successfully",
    data={
        "customer_id": customer_id,
        "name": updated.get("name"),
        "phone": updated.get("phone"),
        "updated_at": update_dict.get("pos_synced_at")   # ← only 4 fields
    }
)
```

`updated` is already fetched at line 436 (`db.customers.find_one({"id": customer_id}, {"_id": 0})`). The full doc is sitting there — just not being returned.

**Fix**: Return `updated` directly as the data payload. The `_id` is already excluded by the `{"_id": 0}` projection. One-line change.

---

## 3. Data Flow — Before vs After

**Before:**
```
PUT /pos/customers/{id}  body: {pos_id, restaurant_id, phone, name, dob}
  → 422 if pos_id or restaurant_id missing
  → update → return {customer_id, name, phone, updated_at}
  → POS must call GET /pos/customers/{id} again to refresh UI
```

**After:**
```
PUT /pos/customers/{id}  body: {phone, name, dob}   (pos_id/restaurant_id now optional)
  → update → return full customer document (same shape as GET /pos/customers/{id})
  → POS UI refreshes in one call
```

---

## 4. Conflict Check

- No other endpoint calls `pos_update_customer` internally
- `GET /pos/customers/{id}` (`pos.py:2579`) returns `{**customer, loyalty: ..., recent_orders: ..., addresses: ...}` — slightly richer than raw customer doc. The PUT response returns raw customer only (no loyalty blob, no recent_orders). This is intentional and acceptable — POS can call GET separately for the enriched view.
- Backward compatible: POS clients currently sending `pos_id`/`restaurant_id` — still works. Clients not sending them — now also works.

---

## 5. Files WILL Change

| File | Lines | Change |
|---|---|---|
| `routers/pos.py` | 130–131 | `pos_id: Optional[str] = None`, `restaurant_id: Optional[str] = None` |
| `routers/pos.py` | 438–447 | Replace 4-field stub with `data=updated` |

**Total: 2 surgical edits, ~6 LOC changed.**

## 6. Files WILL NOT Change

`models/schemas.py` · `core/auth.py` · `core/loyalty.py` · `routers/coupons.py` · `routers/points.py` · all frontend files

---

## 7. Downstream Consumers

| Consumer | Impact |
|---|---|
| POS clients sending `pos_id`/`restaurant_id` | None — still accepted, still stored |
| POS clients NOT sending `pos_id`/`restaurant_id` | Unblocked — now works |
| POS clients parsing PUT response | Additive — they get more fields. Any client only reading 4 fields is unaffected. |
| CRM frontend (`CustomersPage`, `CustomerDetailPage`) | None — they use CRM JWT endpoints |

---

## 8. Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | PUT body with only `phone` + `name` (no `pos_id`/`restaurant_id`) | 200 success, customer updated |
| V2 | PUT body with `pos_id` + `restaurant_id` included | Still works (backward compat) |
| V3 | PUT response contains `total_points`, `tier`, `wallet_balance` | Full customer object returned |
| V4 | PUT response `_id` field | Not present (excluded by projection) |
| V5 | PUT with a `phone` that belongs to another customer | `{"success": false, "message": "Another customer with this phone already exists"}` |
| V6 | PUT with non-existent `customer_id` | `{"success": false, "message": "Customer not found"}` |

---

## 9. Impact Analysis Output

```
Planning complete: CR-079
Stage: Impact Analysis
Code reality: PARTIAL (endpoint exists; 2 contract gaps confirmed)
Risk: LOW
Files WILL change: routers/pos.py (2 edits — schema + response)
Files WILL NOT touch: everything else
Owner decisions: none open (Q1=a, Q2=a locked)
Next: Implementation Plan → Implementation
```
