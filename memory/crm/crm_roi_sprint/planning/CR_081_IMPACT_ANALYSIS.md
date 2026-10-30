# CR-081 — Impact Analysis
## POS Coupon Management

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: MEDIUM
**Intake doc**: `discovery/CR_081_POS_COUPON_MANAGEMENT_INTAKE.md`

---

## 1. Registration Verified

CR-081 registered. Status: `cr081_intake_closed_q1a_q2a_no_wa_q3yes_ready_for_planning`.
Q1=a (new file), Q2=a no-WA (distribute = record only), Q3=yes (DELETE with in-use guard). No open decisions.

---

## 2. Code Reality

### What POS can do today (all `verify_pos_auth`) ✅

| Endpoint | What |
|---|---|
| `GET /pos/coupons/available` | Eligible coupons for a specific customer + order |
| `POST /pos/coupons/validate` | Validate a coupon code |
| `POST /pos/orders` (coupon_code field) | Record coupon usage at order time |

### What exists in CRM (all `get_current_user`) — needs POS wrappers

| CRM endpoint | Location | POS equivalent |
|---|---|---|
| `GET /coupons` | `coupons.py:34` | C-1 |
| `GET /coupons/{id}` | `coupons.py:115` | C-2 |
| `POST /coupons` | `coupons.py:14` | C-3 |
| `PUT /coupons/{id}` | `coupons.py:122` | C-4 |
| `POST /coupons/{id}/toggle` | `coupons.py:153` | C-5 |
| `DELETE /coupons/{id}` | `coupons.py:145` | C-6 (with added guard) |
| `GET /coupons/{id}/usage` | `coupons.py:293` | C-7 |
| — | ❌ Does not exist | C-8 distribute (net-new) |

### Critical finding: CRM delete has NO campaign in-use guard

`coupons.py:145-151` — `delete_coupon` does:
```python
result = await db.coupons.delete_one({"id": coupon_id, "user_id": user["id"]})
if result.deleted_count == 0:
    raise HTTPException(status_code=404, detail="Coupon not found")
await db.coupon_usage.delete_many({"coupon_id": coupon_id})
return {"message": "Coupon deleted"}
```

No check for active campaigns. The POS delete (C-6) **must add this guard** to prevent deleting a coupon that is referenced in an active campaign. This is a safety improvement over the existing CRM endpoint.

---

## 3. Data Flow Traces

### C-3 CREATE
```
POST /api/pos/coupons
  body: CouponCreate schema
  → verify_pos_auth → user doc
  → check code uniqueness: db.coupons.find_one({user_id, code.upper()})
  → insert coupon doc
  → return POSResponse(data=coupon_doc)
```

### C-6 DELETE (with in-use guard)
```
DELETE /api/pos/coupons/{coupon_id}
  → verify_pos_auth → user doc
  → find coupon (404 if not found)
  → campaign_guard: db.campaigns.find_one({user_id, template_id: coupon_id})
    → if found: return POSResponse(success=False, "Coupon is used in campaign X")
  → db.coupons.delete_one
  → db.coupon_usage.delete_many({coupon_id})
  → return POSResponse(success=True, "Coupon deleted")
```

### C-8 DISTRIBUTE (net-new, no WhatsApp Phase 1)
```
POST /api/pos/coupons/{coupon_id}/distribute
  body: { customer_id, note (optional) }
  → verify_pos_auth → user doc
  → find coupon (must belong to user)
  → find customer (must belong to user)
  → insert coupon_distributions doc: {id, user_id, coupon_id, customer_id, note, assigned_at, distributed_by="pos"}
  → return POSResponse(data={distribution_id, coupon_id, customer_id, code, assigned_at})
```

### C-7 USAGE — note on customer_id null
`coupons.py:293` joins `coupon_usage` → `customers` by `customer_id`. With CR-082 (anonymous coupons), some usage rows will have `customer_id=null`. The usage endpoint must handle null gracefully (skip customer lookup, return `customer_name: null`).

---

## 4. Conflict Check

- C-1 to C-7 do NOT conflict with existing `GET /pos/coupons/available` or `POST /pos/coupons/validate` — different paths
- C-8 `coupon_distributions` is a new collection — no conflicts
- `models/schemas.py` `CouponCreate` / `CouponUpdate` / `Coupon` are imported directly — no changes to schemas.py needed
- `campaigns.py` uses `coupon_id` on campaigns — this is why the C-6 guard checks campaigns before delete

---

## 5. Files WILL Change

| File | Type | Change |
|---|---|---|
| `routers/pos_coupons.py` | **NEW** | ~220 LOC — 8 endpoints |
| `backend/server.py` | EDIT | +2 lines (import `pos_coupons` + `include_router`) |

## 6. Files WILL NOT Change

`routers/coupons.py` · `core/coupon.py` · `models/schemas.py` · `routers/campaigns.py` · `routers/pos.py` · all frontend files

---

## 7. New Collection: `coupon_distributions`

```json
{
    "id":              "dist_abc123",
    "user_id":         "restaurant_user_id",
    "coupon_id":       "coupon_uuid",
    "customer_id":     "customer_uuid",
    "note":            "VIP reward — 10th visit",
    "assigned_at":     "2026-08-06T14:00:00Z",
    "distributed_by":  "pos"
}
```

No schema model needed in `models/schemas.py` — plain dict is sufficient for Phase 1.

---

## 8. Response Shapes

### C-1 `GET /pos/coupons`
```json
{
    "success": true,
    "message": "5 coupons",
    "data": {
        "coupons": [ { ...Coupon fields... } ],
        "total": 5
    }
}
```

### C-5 `POST /pos/coupons/{id}/toggle`
```json
{ "success": true, "message": "Coupon activated", "data": { "is_active": true } }
```

### C-6 `DELETE /pos/coupons/{id}`
```json
{ "success": true, "message": "Coupon deleted", "data": null }
// or if in-use:
{ "success": false, "message": "Coupon is used in campaign 'Summer Blast'", "data": null }
```

### C-8 `POST /pos/coupons/{id}/distribute`
```json
{
    "success": true,
    "message": "Coupon distributed",
    "data": {
        "distribution_id": "dist_abc123",
        "coupon_code": "VIPONLY20",
        "customer_id": "...",
        "assigned_at": "..."
    }
}
```

---

## 9. Downstream Consumers

| Consumer | Impact |
|---|---|
| Existing `GET /pos/coupons/available` | None — different path, unchanged |
| Existing `POST /pos/coupons/validate` | None — different path, unchanged |
| `GET /api/analytics/coupons` | None — reads same `coupon_usage` collection |
| Campaign wizard (references `coupon_id`) | Protected by C-6 in-use guard — safer than before |
| CR-082 (requires_customer flag) | C-1, C-2, C-3, C-4 must include `requires_customer` in response/payload once CR-082 is implemented. For now: field is absent from schema — no conflict |

---

## 10. Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | `GET /pos/coupons` | All coupons returned |
| V2 | `GET /pos/coupons?active_only=true` | Only `is_active=true` coupons |
| V3 | `POST /pos/coupons` (new code) | Coupon created, appears in V1 |
| V4 | `POST /pos/coupons` (duplicate code) | `success=false`, "Coupon code already exists" |
| V5 | `PUT /pos/coupons/{id}` (change title) | Title updated |
| V6 | `POST /pos/coupons/{id}/toggle` | `is_active` flips |
| V7 | `DELETE /pos/coupons/{id}` (not in campaign) | Deleted, gone from V1 |
| V8 | `DELETE /pos/coupons/{id}` (in active campaign) | `success=false`, "Coupon is used in campaign ..." |
| V9 | `GET /pos/coupons/{id}/usage` | Usage list returned |
| V10 | `POST /pos/coupons/{id}/distribute` | `coupon_distributions` doc created |
| V11 | Existing `GET /pos/coupons/available` | Unchanged (regression) |

---

## 11. Impact Analysis Output

```
Planning complete: CR-081
Stage: Impact Analysis
Code reality: NONE (pos_coupons.py does not exist; coupon_distributions collection does not exist)
Risk: MEDIUM
Files WILL change: routers/pos_coupons.py (new ~220 LOC), server.py (+2 lines)
Files WILL NOT touch: routers/coupons.py, core/coupon.py, models/schemas.py, all others
Owner decisions: none open
Key finding: CRM delete_coupon has NO campaign guard — POS C-6 adds it (safety improvement)
Next: Implementation Plan → Implementation
```
